-- =====================================================================
-- Magazzino: cosa c'e' dentro, e come ci e' arrivato
--
-- Chiesto il 2026-09-10.
--
-- COSA C'ERA GIA' E COSA MANCAVA
--
-- `materiali` esiste, ma e' solo un'ANAGRAFICA: codice, descrizione,
-- unita' di misura, fornitore, ultimo prezzo. Dice cosa esiste al mondo,
-- non cosa c'e' in magazzino. La giacenza non c'era da nessuna parte.
--
-- PERCHE' I MOVIMENTI E NON UN NUMERO
--
-- La strada corta sarebbe una colonna `giacenza` su `materiali`, da
-- correggere a mano. Non la prendiamo, e non e' pignoleria:
--
--   * un numero solo non sa rispondere a «chi ha preso i venti sacchi e
--     quando», che in un magazzino di cantiere e' la domanda che si fa
--     davvero;
--   * non sa dire su quale cantiere e' finita la roba, quindi il
--     materiale non si potra' mai attribuire a una commessa;
--   * e il giorno che si passasse ai movimenti bisognerebbe inventare
--     una storia che non c'e'.
--
-- Quindi la verita' sono i MOVIMENTI, e la giacenza si calcola. La vista
-- `v_giacenze_magazzino` la restituisce gia' fatta, materiali fermi
-- compresi.
--
-- Due tipi soli, `carico` e `scarico`, con quantita' sempre positiva: il
-- segno lo mette il tipo. Una rettifica d'inventario si scrive come un
-- carico o uno scarico con la nota che spiega — cosi' resta agli atti
-- invece di sparire dentro un numero corretto in silenzio.
--
-- COSA NON C'E' ANCORA, di proposito: prezzi, valorizzazione, ordini ai
-- fornitori. L'utente ha detto che la parte amministrativa si vede dopo.
-- `rapportino_materiali` esiste gia' e un giorno potra' generare gli
-- scarichi da sola; oggi le due cose non si parlano.
--
-- DATABASE CONDIVISO con wbs-office: si aggiungono colonne facoltative e
-- si crea una tabella nuova. Niente di esistente cambia.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare.
-- =====================================================================


-- 1. DUE COLONNE SULL'ANAGRAFICA
--
-- `scorta_minima` non e' un vezzo: e' cio' che trasforma un elenco in un
-- avviso. Senza, il magazzino dice quanto c'e' e sta a qualcuno
-- accorgersi che sta finendo; con, se ne accorge la pagina.

alter table public.materiali
  add column if not exists ubicazione text;

alter table public.materiali
  add column if not exists scorta_minima numeric(12,3);

comment on column public.materiali.ubicazione is
  'Dove sta fisicamente: scaffale, corsia, deposito. Testo libero.';
comment on column public.materiali.scorta_minima is
  'Sotto questa quantita'' il magazzino lo segnala. Nullo = nessun avviso.';


-- 2. I MOVIMENTI

create table if not exists public.movimenti_magazzino (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  materiale_id  uuid not null references public.materiali(id) on delete cascade,

  data          date not null default current_date,
  tipo          text not null,
  -- Sempre positiva: il segno lo decide il tipo. Un numero che a volte
  -- e' negativo e a volte no e' il modo piu' rapido di sbagliare una
  -- somma.
  quantita      numeric(12,3) not null,

  -- Su quale cantiere e' finita la roba. Nullo per i carichi, che
  -- arrivano dal fornitore e non da un cantiere. E' la colonna che un
  -- giorno permettera' di attribuire il materiale alla commessa.
  cantiere_id   uuid references public.cantieri(id) on delete set null,

  -- Il numero del DDT, della bolla, dell'ordine.
  riferimento   text,
  note          text,

  registrato_da uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.movimenti_magazzino is
  'Carichi e scarichi di magazzino. Sono la verita'': la giacenza si calcola da qui, vedi v_giacenze_magazzino.';

alter table public.movimenti_magazzino
  drop constraint if exists movimenti_magazzino_tipo_valido;
alter table public.movimenti_magazzino
  add constraint movimenti_magazzino_tipo_valido
  check (tipo in ('carico', 'scarico'));

-- Zero non e' un movimento, e i negativi qui non esistono.
alter table public.movimenti_magazzino
  drop constraint if exists movimenti_magazzino_quantita_positiva;
alter table public.movimenti_magazzino
  add constraint movimenti_magazzino_quantita_positiva
  check (quantita > 0);

-- Un carico viene dal fornitore, non da un cantiere.
alter table public.movimenti_magazzino
  drop constraint if exists movimenti_magazzino_cantiere_solo_in_uscita;
alter table public.movimenti_magazzino
  add constraint movimenti_magazzino_cantiere_solo_in_uscita
  check (tipo = 'scarico' or cantiere_id is null);

create index if not exists movimenti_magazzino_materiale_idx
  on public.movimenti_magazzino (materiale_id, data desc);
create index if not exists movimenti_magazzino_cantiere_idx
  on public.movimenti_magazzino (cantiere_id, data desc);


-- 3. LA GIACENZA, CALCOLATA
--
-- `security_invoker = on` perche' e' la regola di questo progetto e
-- perche' senza sarebbe una porta aperta: una vista definer mostrerebbe
-- il magazzino di ogni impresa del database a chiunque sappia il nome
-- della vista.
--
-- LEFT JOIN e non INNER: un materiale senza movimenti deve comparire con
-- giacenza zero. Sparire dall'elenco appena si esaurisce e' esattamente
-- il contrario di cio' che serve.

drop view if exists public.v_giacenze_magazzino;
create view public.v_giacenze_magazzino
with (security_invoker = on) as
select
  m.id            as materiale_id,
  m.org_id,
  m.codice,
  m.descrizione,
  m.unita_misura,
  m.ubicazione,
  m.scorta_minima,
  m.attivo,
  coalesce(
    sum(case when mv.tipo = 'carico' then mv.quantita else -mv.quantita end),
    0
  )::numeric(14,3) as giacenza,
  max(mv.data)     as ultimo_movimento
from public.materiali m
left join public.movimenti_magazzino mv on mv.materiale_id = m.id
group by m.id, m.org_id, m.codice, m.descrizione, m.unita_misura,
         m.ubicazione, m.scorta_minima, m.attivo;

comment on view public.v_giacenze_magazzino is
  'Giacenza per materiale, calcolata dai movimenti. Materiali senza movimenti compresi, con giacenza zero.';


-- 4. LE POLICY SUI MOVIMENTI
--
-- Il magazzino e' dell'IMPRESA, non di un cantiere: non c'e' scope per
-- cantiere da applicare, e chi appartiene all'azienda lo legge.
--
-- Scrivono due figure, e sono le due che toccano la roba davvero:
-- l'AMMINISTRAZIONE che carica quello che arriva dal fornitore
-- (`anagrafiche.write`, che e' gia' chi tiene il registro dei
-- materiali), e il TECNICO che scarica quello che porta in cantiere
-- (`rapportini.create`).
--
-- Da rivedere quando si vedra' la parte amministrativa: e' la scelta
-- ragionevole di oggi, non una regola stabilita con l'utente.

alter table public.movimenti_magazzino enable row level security;

drop policy if exists movimenti_magazzino_select on public.movimenti_magazzino;
create policy movimenti_magazzino_select on public.movimenti_magazzino
  for select using (app.has_perm(org_id, 'anagrafiche.read'));

drop policy if exists movimenti_magazzino_insert on public.movimenti_magazzino;
create policy movimenti_magazzino_insert on public.movimenti_magazzino
  for insert with check (
    app.has_perm(org_id, 'anagrafiche.write')
    or app.has_perm(org_id, 'rapportini.create')
  );

-- Un movimento non si corregge: si compensa con quello opposto. Cosi'
-- resta agli atti che qualcosa e' stato sbagliato, invece di far
-- scomparire la storia. Per questo non c'e' una policy di UPDATE.

-- Cancellare lo puo' solo chi tiene il registro, e solo cio' che ha
-- scritto lui. Serve per il movimento appena sbagliato, non per
-- riscrivere l'inventario del mese scorso.
drop policy if exists movimenti_magazzino_delete on public.movimenti_magazzino;
create policy movimenti_magazzino_delete on public.movimenti_magazzino
  for delete using (
    app.has_perm(org_id, 'anagrafiche.write')
    and registrato_da = auth.uid()
  );


-- 5. LE POLICY SU `materiali`, SOLO SE NON NE HA
--
-- Stessa prudenza usata per `rapportino_foto`: se wbs-office ne ha gia'
-- messe di sue non si tocca niente, perche' le policy permissive si
-- sommano in OR e aggiungerne alla cieca allarga l'accesso invece di
-- stringerlo.

alter table public.materiali enable row level security;

do $blocco$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'materiali'
  ) then
    raise notice 'materiali ha gia'' delle policy: non tocco niente. Guardale nel blocco 6.';
    return;
  end if;

  execute $p$
    create policy materiali_select on public.materiali
      for select using (app.has_perm(org_id, 'anagrafiche.read'))
  $p$;

  execute $p$
    create policy materiali_write on public.materiali
      for all
      using (app.has_perm(org_id, 'anagrafiche.write'))
      with check (app.has_perm(org_id, 'anagrafiche.write'))
  $p$;

  raise notice 'Create le policy su materiali.';
end
$blocco$;


-- 6. VERIFICA
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('materiali', 'movimenti_magazzino')
order by tablename, policyname;

-- Deve dire security_invoker=on.
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'v_giacenze_magazzino';

-- Deve tornare una riga per materiale, anche senza movimenti.
select codice, descrizione, unita_misura, giacenza, ultimo_movimento
from public.v_giacenze_magazzino
order by descrizione
limit 20;
