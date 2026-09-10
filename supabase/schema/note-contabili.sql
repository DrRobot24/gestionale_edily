-- =====================================================================
-- `note_contabili`: le ore in economia di un cantiere
--
-- Chiesto e precisato il 2026-09-10.
--
-- COS'E' UNA NOTA CONTABILE
--
-- In edilizia il lavoro si paga in due modi. **A misura**, sulle
-- quantita' previste dal progetto: tanti metri quadri di muro, tanto al
-- metro. E **in economia**, sulle ore e i materiali effettivamente
-- impiegati, per cio' che nel progetto non c'era.
--
-- La nota contabile registra il secondo. L'esempio dell'utente:
--
--   «Dobbiamo alzare un muro con dei blocchetti. Prima di farlo abbiamo
--   trovato un nido d'api che impediva il lavoro. Le 2 ore impiegate per
--   rimuoverlo sono una lavorazione extra che ci faremo pagare a parte,
--   in economia e non a misura come il resto del progetto.»
--
-- Serve al tecnico per segnarle il giorno che succedono, e al titolare
-- per vedere a volo d'uccello quante ne ha un cantiere e perche'.
--
-- ATTENZIONE A COSA NON E'
--
-- Non e' una WBS, e non e' l'avanzamento delle lavorazioni previste.
-- Quella e' la struttura del progetto e vive in `wbs_tasks`, che e' uno
-- specchio di wbs-office. Qui c'e' l'opposto: cio' che nel progetto NON
-- c'era e che e' successo lo stesso.
--
-- E non e' un secondo posto dove segnare le ore. Le 2 ore del nido d'api
-- stanno gia' nel rapportino di quel giorno, dentro la giornata di chi
-- le ha fatte: qui non si aggiungono, si CLASSIFICANO, per poterle
-- ribaltare al cliente. Chi somma le ore per le paghe continua a
-- guardare `rapportino_ore` e non deve toccare questa tabella.
--
-- NIENTE IMPORTI, come deciso il 2026-09-10. Qui ci sono le ORE e il
-- motivo; quanto valgono lo dice la tariffa concordata, e i soldi
-- stanno in `costi_cantiere` e `ricavi_cantiere`. Due fonti di verita'
-- sugli stessi numeri prima o poi divergono da sole.
--
-- DATABASE CONDIVISO con wbs-office: si CREA una tabella nuova, non si
-- tocca niente di esistente.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare.
-- =====================================================================


-- 1. LA TABELLA

create table if not exists public.note_contabili (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  cantiere_id  uuid not null references public.cantieri(id) on delete cascade,

  -- Il giorno in cui e' successo. Le note sono giornaliere: una stessa
  -- lavorazione extra ripetuta due giorni fa due note, perche' e' cosi'
  -- che si rendiconta.
  data         date not null default current_date,

  -- Cosa e' stato fatto e perche' non era previsto. E' il campo su cui
  -- si cerca, quindi va scritto per esteso e non a sigle: fra sei mesi
  -- «rimozione nido d'api dietro il muro sud» si ritrova, «NDA muro S»
  -- no.
  descrizione  text not null,

  -- Le ore in economia. Non si sommano a quelle del rapportino: le
  -- classificano.
  ore          numeric(5,2) not null default 0,

  -- Il seguito: cosa serve, chi era presente, cosa ha detto il cliente.
  note         text,

  scritta_da   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.note_contabili is
  'Ore in economia: lavorazioni extra non previste dal progetto, da ribaltare al cliente. Le ore qui CLASSIFICANO ore gia'' scritte nei rapportini, non se ne aggiungono di nuove.';

comment on column public.note_contabili.ore is
  'Ore in economia. NON sommarle a rapportino_ore: sono le stesse ore, viste dal lato di cosa si fattura invece che di cosa si paga.';


-- 2. CONVERGENZA DALLA PRIMA STESURA
--
-- La prima versione di questo file modellava l'avanzamento delle
-- lavorazioni: `stato`, `lavorazione`, `iniziata_il`, `completata_il`.
-- Era il concetto sbagliato. Se quella tabella e' gia' stata creata, qui
-- si converte.
--
-- Le colonne vecchie si tolgono SOLO se la tabella e' vuota. Con delle
-- righe dentro ci si ferma e lo si dice: buttare via del lavoro vero per
-- far quadrare uno schema non e' una migrazione, e' una perdita.

do $blocco$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'note_contabili'
      and column_name = 'lavorazione'
  ) then
    if exists (select 1 from public.note_contabili limit 1) then
      raise exception 'note_contabili ha gia'' delle righe con lo schema vecchio: convertile a mano prima di rilanciare questo file.'
        using errcode = 'P0001';
    end if;

    alter table public.note_contabili drop constraint if exists note_contabili_stato_valido;
    alter table public.note_contabili drop constraint if exists note_contabili_date_coerenti;
    alter table public.note_contabili drop constraint if exists note_contabili_lavorazione_non_vuota;

    alter table public.note_contabili drop column if exists lavorazione;
    alter table public.note_contabili drop column if exists stato;
    alter table public.note_contabili drop column if exists iniziata_il;
    alter table public.note_contabili drop column if exists completata_il;
    alter table public.note_contabili drop column if exists wbs_task_id;

    alter table public.note_contabili add column if not exists data date not null default current_date;
    alter table public.note_contabili add column if not exists descrizione text not null default '';
    alter table public.note_contabili add column if not exists ore numeric(5,2) not null default 0;
    alter table public.note_contabili alter column descrizione drop default;

    raise notice 'note_contabili convertita dallo schema vecchio (avanzamento) a quello nuovo (ore in economia).';
  end if;
end
$blocco$;


-- 3. I VINCOLI

alter table public.note_contabili
  drop constraint if exists note_contabili_descrizione_non_vuota;
alter table public.note_contabili
  add constraint note_contabili_descrizione_non_vuota
  check (length(btrim(descrizione)) > 0);

-- Ore negative non esistono, e sopra le 24 in un giorno solo non e'
-- economia: e' un refuso che finirebbe in una fattura al cliente.
alter table public.note_contabili
  drop constraint if exists note_contabili_ore_valide;
alter table public.note_contabili
  add constraint note_contabili_ore_valide
  check (ore >= 0 and ore <= 24);

-- Si legge sempre per cantiere, dal giorno piu' recente.
drop index if exists public.note_contabili_cantiere_idx;
create index if not exists note_contabili_cantiere_data_idx
  on public.note_contabili (cantiere_id, data desc);


-- 4. `updated_at` CHE SI AGGIORNA DA SOLO
-- Una colonna che si aggiorna solo se il codice si ricorda di farlo e'
-- una colonna di cui non ci si puo' fidare.

create or replace function public.note_contabili_tocca()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists note_contabili_tocca on public.note_contabili;
create trigger note_contabili_tocca
  before update on public.note_contabili
  for each row execute function public.note_contabili_tocca();


-- 5. LE POLICY
--
-- Chi scrive, deciso il 2026-09-10: il TECNICO sui cantieri suoi, perche'
-- chi sta in cantiere e' chi vede il nido d'api; e il TITOLARE ovunque,
-- perche' veglia su tutti a volo d'uccello e se al tecnico sfugge
-- qualcosa deve poterlo aiutare.
--
-- `rapportini.validate` e' il permesso che distingue il titolare: owner e
-- admin ce l'hanno, `amministrazione` no — legge tutto ma non valida. E'
-- il modo di dire "il titolare" nel linguaggio dei permessi invece che
-- con il nome di un ruolo.

alter table public.note_contabili enable row level security;

drop policy if exists note_contabili_select on public.note_contabili;
create policy note_contabili_select on public.note_contabili
  for select using (
    app.has_perm(org_id, 'rapportini.read_all')
    or app.puo_vedere_cantiere(cantiere_id)
  );

drop policy if exists note_contabili_insert on public.note_contabili;
create policy note_contabili_insert on public.note_contabili
  for insert with check (
    app.has_perm(org_id, 'rapportini.validate')
    or (
      app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(cantiere_id)
    )
  );

drop policy if exists note_contabili_update on public.note_contabili;
create policy note_contabili_update on public.note_contabili
  for update using (
    app.has_perm(org_id, 'rapportini.validate')
    or (
      app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(cantiere_id)
    )
  );

-- Cancellare: il titolare sempre, il tecnico solo cio' che ha scritto
-- lui. Una nota altrui che sparisce senza lasciare traccia e' peggio di
-- una nota sbagliata che resta e si corregge — e qui dentro c'e' roba
-- che si fattura.
drop policy if exists note_contabili_delete on public.note_contabili;
create policy note_contabili_delete on public.note_contabili
  for delete using (
    app.has_perm(org_id, 'rapportini.validate')
    or (
      app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(cantiere_id)
      and scritta_da = auth.uid()
    )
  );


-- 6. VERIFICA
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'note_contabili'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'note_contabili'
order by policyname;

-- Deve dire true: senza RLS le policy qui sopra non le guarda nessuno.
select c.relrowsecurity as rls_attiva
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'note_contabili';


-- 7. PROVA DAL VIVO
-- Come tecnico@cassia.com: su un cantiere assegnato la nota si crea e si
-- corregge; su un cantiere non assegnato l'insert deve tornare 42501.
-- Come amministrazione: le note si leggono tutte e non si scrive niente.
