-- =====================================================================
-- Bolle di trasporto (DDT) - schema, vincoli, RLS e storage
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md, "Prossimi passi" punto 1).
-- Va eseguito a mano nel SQL Editor, un blocco alla volta.
--
-- Il flusso che implementa:
--   l'amministrazione carica il PDF -> il parser estrae le righe ->
--   una persona verifica e decide quanta parte di ogni riga va su quale
--   cantiere -> il costo arriva al consuntivo.
--
-- Perche' tre tabelle e non una: una riga di bolla puo' essere spezzata
-- su piu' cantieri (trenta sacchi qui, venti la'), quindi il cantiere
-- non e' un attributo del documento ne' della riga. E' una relazione a
-- se', con la sua quantita'.
-- =====================================================================


-- 1. STATI
-- Un enum vero, non testo libero: "campi che dovrebbero essere enum e
-- sono testo libero" e' gia' un difetto noto del progetto, non ne
-- aggiungiamo un altro.
--
--   caricato    il PDF e' nello storage, nessuno l'ha ancora letto
--   estratto    il parser ha proposto le righe, da controllare
--   verificato  una persona ha confermato righe e ripartizione
--   fatturato   la fattura del fornitore e' arrivata e le comprende
create type public.stato_ddt as enum
  ('caricato', 'estratto', 'verificato', 'fatturato');


-- 2. TESTATA
create table public.ddt (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  fornitore_id    uuid references public.fornitori(id),

  -- numero e data sono del fornitore, non nostri: niente
  -- document_counters, e restano nulli finche' il parser non li legge
  numero          text,
  data            date,

  storage_path    text not null,
  stato           public.stato_ddt not null default 'caricato',

  -- i totali dichiarati sulla bolla, da confrontare con la somma delle
  -- righe per accorgersi se l'estrazione ha perso qualcosa
  imponibile      numeric(12, 2),
  iva             numeric(12, 2),

  -- cosa ha detto il parser: modello, confidenza, cosa non ha capito.
  -- Serve a spiegare mesi dopo perche' una bolla e' venuta male.
  nota_estrazione text,

  caricato_da     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- stesso fornitore, stesso numero, stessa impresa = stessa bolla.
  -- Senza questo, ricaricare due volte lo stesso PDF raddoppia i costi
  -- del cantiere. "nulls not distinct" perche' finche' non e' stata
  -- estratta il numero e' nullo, e due bolle non ancora lette dallo
  -- stesso fornitore sono comunque da trattare come sospette.
  constraint ddt_org_fornitore_numero_uniq
    unique nulls not distinct (org_id, fornitore_id, numero)
);

create index ddt_org_stato_idx on public.ddt (org_id, stato);
create index ddt_fornitore_idx on public.ddt (fornitore_id);


-- 3. RIGHE
-- Cosa c'e' scritto sulla bolla, una riga per voce.
create table public.ddt_righe (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  ddt_id          uuid not null references public.ddt(id) on delete cascade,

  riga            integer not null,
  descrizione     text not null,

  -- il collegamento all'anagrafica e' facoltativo: il parser legge una
  -- descrizione, associarla a un materiale censito e' un passo dopo e
  -- puo' non riuscire
  materiale_id    uuid references public.materiali(id),

  quantita        numeric(12, 3) not null check (quantita > 0),
  unita_misura    text,
  prezzo_unitario numeric(12, 4),
  importo         numeric(12, 2),

  -- true = l'ha proposta il parser e nessuno l'ha ancora toccata.
  -- Distinguere cio' che ha letto la macchina da cio' che ha corretto
  -- una persona e' l'unico modo per sapere di cosa fidarsi.
  da_estrazione   boolean not null default false,

  unique (ddt_id, riga)
);

create index ddt_righe_ddt_idx       on public.ddt_righe (ddt_id);
create index ddt_righe_materiale_idx on public.ddt_righe (materiale_id);


-- 4. RIPARTIZIONE SUI CANTIERI
-- Il pezzo che rende il modello quello che serve: quanta parte di una
-- riga va su quale cantiere.
create table public.ddt_riga_cantieri (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  ddt_riga_id uuid not null references public.ddt_righe(id) on delete cascade,
  cantiere_id uuid not null references public.cantieri(id),

  quantita    numeric(12, 3) not null check (quantita > 0),

  -- facoltativo: se valorizzato il costo cade su una voce precisa della
  -- WBS invece che sul cantiere in blocco
  wbs_task_id uuid references public.wbs_tasks(id) on delete set null,

  created_at  timestamptz not null default now(),

  -- una riga si ripartisce su piu' cantieri, ma una volta per cantiere:
  -- due allocazioni sullo stesso vogliono dire che qualcuno ha cliccato
  -- due volte, non che sono arrivati due carichi
  unique (ddt_riga_id, cantiere_id)
);

create index ddt_riga_cantieri_cantiere_idx on public.ddt_riga_cantieri (cantiere_id);


-- 5. NON SI RIPARTISCE PIU' MERCE DI QUANTA NE SIA ARRIVATA
-- Un CHECK non basta: il vincolo mette in relazione piu' righe, e un
-- CHECK vede solo quella che sta scrivendo. Serve un trigger.
--
-- E' un CONSTRAINT TRIGGER DEFERRABLE: la verifica avviene a fine
-- transazione, non a ogni riga. Cosi' riscrivere una ripartizione
-- (cancella tutto, reinserisci) non esplode a meta' strada per uno
-- stato intermedio che sarebbe stato valido un istante dopo.
create or replace function app.ddt_allocazione_valida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $funzione$
declare
  id_riga     uuid := coalesce(new.ddt_riga_id, old.ddt_riga_id);
  disponibile numeric(12, 3);
  allocato    numeric(12, 3);
begin
  select quantita into disponibile
  from public.ddt_righe
  where id = id_riga;

  -- la riga puo' essere sparita: se e' una cancellazione a cascata non
  -- c'e' piu' niente da verificare
  if disponibile is null then
    return null;
  end if;

  select coalesce(sum(quantita), 0) into allocato
  from public.ddt_riga_cantieri
  where ddt_riga_id = id_riga;

  if allocato > disponibile then
    raise exception
      'Ripartiti % su una riga che ne contiene %', allocato, disponibile
      using errcode = '23514',
            hint = 'Riduci le quantita assegnate ai cantieri.';
  end if;

  return null;
end;
$funzione$;

create constraint trigger ddt_allocazione_non_eccede
after insert or update or delete on public.ddt_riga_cantieri
deferrable initially deferred
for each row execute function app.ddt_allocazione_valida();


-- 6. RLS
-- Stesso schema delle altre tabelle: <tabella>_select in lettura,
-- <tabella>_write in scrittura, sempre attraverso app.has_perm.
-- Le bolle sono documenti di acquisto, quindi `economics`, come
-- costi_cantiere. `amministrazione` ha entrambi i permessi: verificato
-- il 2026-09-01 su role_permissions.
alter table public.ddt               enable row level security;
alter table public.ddt_righe         enable row level security;
alter table public.ddt_riga_cantieri enable row level security;

create policy ddt_select on public.ddt
  for select using (app.has_perm(org_id, 'economics.read'));
create policy ddt_write on public.ddt
  for all using (app.has_perm(org_id, 'economics.write'))
      with check (app.has_perm(org_id, 'economics.write'));

create policy ddt_righe_select on public.ddt_righe
  for select using (app.has_perm(org_id, 'economics.read'));
create policy ddt_righe_write on public.ddt_righe
  for all using (app.has_perm(org_id, 'economics.write'))
      with check (app.has_perm(org_id, 'economics.write'));

-- Qui, a differenza delle altre due, il cantiere c'e'. Per ora la
-- lettura resta su economics.read; il giorno che si vorra' far vedere
-- al capocantiere cosa e' arrivato da lui, la condizione da aggiungere
-- in OR e' app.puo_vedere_cantiere(cantiere_id) - la stessa che usa
-- costi_cantiere_select.
create policy ddt_riga_cantieri_select on public.ddt_riga_cantieri
  for select using (app.has_perm(org_id, 'economics.read'));
create policy ddt_riga_cantieri_write on public.ddt_riga_cantieri
  for all using (app.has_perm(org_id, 'economics.write'))
      with check (app.has_perm(org_id, 'economics.write'));


-- 7. STORAGE
-- Bucket PRIVATO chiamato `contabilita`, separato da `rapportini` che
-- gia' esiste. Non e' pignoleria organizzativa: i due hanno permessi
-- diversi - le foto dei rapportini stanno sotto `rapportini.*`, questi
-- documenti sotto `economics.*`. Un bucket unico costringerebbe le
-- policy a distinguere guardando il path, e sbagliare quel confronto
-- significa mostrare le fatture a chi puo' solo compilare un rapportino.
--
-- Il nome e' `contabilita` e non `bolle` perche' ci finiranno anche le
-- fatture di acquisto e, quando ci sara' il conto dei ricavi, quelle
-- emesse ai clienti.
--
-- Convenzione di path, non negoziabile:
--
--     {org_id}/ddt/{ddt_id}.pdf
--     {org_id}/fatture-acquisto/{id}.pdf
--     {org_id}/fatture-vendita/{id}.pdf
--
-- Il primo segmento DEVE essere l'org_id: e' l'unica cosa su cui le
-- policy possono filtrare, ed e' cio' che impedisce a un'impresa di
-- leggere i documenti di un'altra. Cambiarlo dopo significa spostare i
-- file gia' caricati.
--
-- 20 MB e solo PDF: una bolla scansionata sta in pochi MB, e un limite
-- esplicito evita che il bucket diventi il posto dove finisce di tutto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contabilita', 'contabilita', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Il controllo sul formato prima del cast non e' pignoleria: un file
-- con primo segmento non-uuid farebbe fallire il cast, e una policy che
-- va in errore blocca ogni lettura del bucket, non solo quel file.
create policy contabilita_read on storage.objects
  for select using (
    bucket_id = 'contabilita'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'economics.read')
  );

create policy contabilita_write on storage.objects
  for insert with check (
    bucket_id = 'contabilita'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'economics.write')
  );

create policy contabilita_delete on storage.objects
  for delete using (
    bucket_id = 'contabilita'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'economics.write')
  );


-- 8. VERIFICA
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('ddt', 'ddt_righe', 'ddt_riga_cantieri')
order by tablename, policyname;
