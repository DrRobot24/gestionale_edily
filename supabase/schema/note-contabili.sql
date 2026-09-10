-- =====================================================================
-- `note_contabili`: a che punto sono le lavorazioni di un cantiere
--
-- Chiesto il 2026-09-10. Serve a rendicontare le lavorazioni specifiche
-- dentro il progetto generale: «la posa in opera del pavimento del piano
-- primo e' finita, adesso si passa ai battiscopa». Una granularita' che
-- oggi non esiste da nessuna parte.
--
-- Il rapportino dice CHI c'era e QUANTE ore ha fatto. Non dice a che
-- punto e' il lavoro. Sono due domande diverse e servono tutte e due:
-- dalle ore non si ricava l'avanzamento, e dall'avanzamento non si
-- ricavano le paghe.
--
-- PERCHE' NON `wbs_tasks`
--
-- La domanda e' legittima: la WBS e' fatta apposta per le
-- sottolavorazioni. Ma `wbs_tasks` e' uno SPECCHIO di wbs-office, non
-- una tabella che si scrive da qui: ha `synced_at`, `project_id` non
-- nullo e `task_key`, e le sue righe le riscrive la sincronizzazione.
-- Oggi poi il ponte e' staccato da entrambi i lati — 151 righe importate
-- il 4 agosto, tutte con `cantiere_id` null, e `projects` a zero righe.
-- Scriverci dentro a mano vorrebbe dire perdere tutto al primo sync.
--
-- Resta comunque `wbs_task_id` qui sotto, nullo e inutilizzato: il
-- giorno che il ponte funziona, una nota si potra' agganciare al suo
-- task. `costi_cantiere` e `rapportino_ore` hanno gia' la stessa
-- colonna, quindi e' la convenzione di questo database.
--
-- NIENTE IMPORTI, ed e' una scelta del 2026-09-10.
--
-- La nota racconta l'avanzamento e basta. I soldi stanno in
-- `costi_cantiere` e `ricavi_cantiere`, che esistono gia': mettere un
-- importo anche qui creerebbe una seconda fonte di verita' sugli stessi
-- numeri, e due fonti che devono restare allineate a mano prima o poi
-- non lo sono piu'.
--
-- DATABASE CONDIVISO con wbs-office: si CREA una tabella nuova, non si
-- tocca niente di esistente.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare: tutto e' `if not
-- exists` oppure si toglie prima di rimettere.
-- =====================================================================


-- 1. LA TABELLA

create table if not exists public.note_contabili (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  cantiere_id   uuid not null references public.cantieri(id) on delete cascade,

  -- Che cosa si sta facendo. Testo libero di proposito: in edilizia le
  -- lavorazioni non stanno in una lista chiusa, e costringerle in un
  -- elenco farebbe scrivere "Altro" nella meta' dei casi.
  lavorazione   text not null,

  stato         text not null default 'in_corso',

  iniziata_il   date,
  completata_il date,

  -- Il racconto: cosa e' rimasto indietro, cosa ha rallentato, cosa
  -- serve. E' la parte che il titolare legge.
  note          text,

  -- Nullo e inutilizzato finche' il ponte WBS non funziona. Vedi sopra.
  wbs_task_id   uuid references public.wbs_tasks(id) on delete set null,

  scritta_da    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.note_contabili is
  'Avanzamento delle singole lavorazioni di un cantiere. Nessun importo: i soldi stanno in costi_cantiere e ricavi_cantiere.';


-- 2. I VINCOLI
--
-- Uno stato fuori lista non e' un caso di scuola: "Completata",
-- "completato" e "completata " diventerebbero tre categorie e i conteggi
-- sbaglierebbero IN SILENZIO. Un `check` e non un enum perche' il
-- database e' condiviso: aggiungere un tipo lo vede anche l'altro
-- frontend, allargare un check no.

alter table public.note_contabili
  drop constraint if exists note_contabili_stato_valido;
alter table public.note_contabili
  add constraint note_contabili_stato_valido
  check (stato in ('in_corso', 'completata', 'sospesa'));

-- Una lavorazione completata ha una data di fine, e una finita prima di
-- cominciare e' un refuso che finirebbe in un rendiconto.
alter table public.note_contabili
  drop constraint if exists note_contabili_date_coerenti;
alter table public.note_contabili
  add constraint note_contabili_date_coerenti
  check (
    (stato <> 'completata' or completata_il is not null)
    and (iniziata_il is null or completata_il is null or completata_il >= iniziata_il)
  );

alter table public.note_contabili
  drop constraint if exists note_contabili_lavorazione_non_vuota;
alter table public.note_contabili
  add constraint note_contabili_lavorazione_non_vuota
  check (length(btrim(lavorazione)) > 0);

-- Si legge sempre per cantiere, e quasi sempre ordinato per data.
create index if not exists note_contabili_cantiere_idx
  on public.note_contabili (cantiere_id, stato, completata_il desc nulls first);


-- 3. `updated_at` CHE SI AGGIORNA DA SOLO
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


-- 4. LE POLICY
--
-- Chi scrive, deciso il 2026-09-10: il TECNICO sui cantieri suoi, perche'
-- chi sta in cantiere e' chi sa quando il pavimento e' finito; e il
-- TITOLARE ovunque, perche' se al tecnico sfugge qualcosa deve poterlo
-- aiutare.
--
-- `rapportini.validate` e' il permesso che distingue il titolare: owner e
-- admin ce l'hanno, `amministrazione` no — legge tutto ma non valida. E'
-- quindi il modo di dire "il titolare" nel linguaggio dei permessi
-- invece che con il nome di un ruolo.

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
-- una nota sbagliata che resta e si corregge.
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


-- 5. VERIFICA
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


-- 6. PROVA DAL VIVO
-- Come tecnico@cassia.com: su un cantiere assegnato la nota si crea e si
-- corregge; su un cantiere non assegnato l'insert deve tornare 42501.
-- Come amministrazione: le note si leggono tutte e non si scrive niente.
