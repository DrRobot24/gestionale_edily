-- =====================================================================
-- I SUBAPPALTI DELLA GIORNATA
--
-- Chiesto dall'utente il 2026-09-29: la pagina Subappalti per il
-- tecnico, «con la logica che ha Lavori extra, cosi' da intercettare in
-- maniera immersiva su tutti i rapportini quelli in cui c'e' stata
-- attivita' di subappalto e le relative note».
--
-- Nel rapportino la sezione Subappalto era un segnaposto senza campi.
-- Qui nasce la tabella. Deciso con l'utente lo stesso giorno:
--
--   * l'impresa si sceglie DAI FORNITORI di tipo «Subappalto», non si
--     scrive a mano: dati puliti, collegati alla scheda del fornitore.
--     Se manca, la inserisce l'amministrazione;
--   * per ogni impresa: la lavorazione svolta (obbligatoria), quante
--     persone, le ore, le note;
--   * la pagina la vedono il tecnico (i cantieri suoi) e il titolare.
--
-- ── COSA NON SONO ───────────────────────────────────────────────────
-- Non sono ore della nostra squadra: le persone e le ore qui sono
-- DELL'IMPRESA ESTERNA, e non entrano ne' in `rapportino_ore` ne' nelle
-- paghe. Servono a sapere chi c'era in cantiere e cosa ha fatto, e a
-- controllare le fatture del subappaltatore.
--
-- ── IL LEGAME ───────────────────────────────────────────────────────
-- Al RAPPORTINO, perche' e' un fatto di quella giornata. Cantiere e data
-- si ricopiano dal rapportino con un trigger: servono a filtrare la
-- pagina per periodo e cantiere senza passare ogni volta dal
-- rapportino, e non possono divergere da lui.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend. Si puo'
-- rilanciare.
-- =====================================================================


-- ── 1. LA TABELLA ───────────────────────────────────────────────────

create table if not exists public.rapportino_subappalti (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  rapportino_id  uuid not null references public.rapportini(id) on delete cascade,
  -- Copiati dal rapportino dal trigger: vedi in cima.
  cantiere_id    uuid not null references public.cantieri(id) on delete cascade,
  data           date not null,
  -- L'impresa: un fornitore di tipo «Subappalto». `restrict`: un
  -- fornitore che ha lavorato nei nostri cantieri non si cancella, si
  -- archivia.
  fornitore_id   uuid not null references public.fornitori(id) on delete restrict,
  lavorazione    text not null check (btrim(lavorazione) <> ''),
  -- Quante persone dell'impresa c'erano, e le ore che hanno fatto in
  -- tutto. Facoltative: non sempre il tecnico le sa.
  persone        integer check (persone is null or (persone >= 0 and persone <= 200)),
  ore            numeric(6,2) check (ore is null or (ore >= 0 and ore <= 2000)),
  note           text,
  scritto_da     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists rapportino_subappalti_rapportino_idx
  on public.rapportino_subappalti (rapportino_id);
create index if not exists rapportino_subappalti_org_data_idx
  on public.rapportino_subappalti (org_id, data desc);

comment on table public.rapportino_subappalti is
  'Le imprese in subappalto che hanno lavorato nella giornata di un rapportino. Persone e ore sono dell''impresa esterna: non entrano nelle paghe.';


-- ── 2. LA COERENZA ──────────────────────────────────────────────────

create or replace function public.rapportino_subappalti_controlla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  r record;
  org_fornitore uuid;
begin
  select x.org_id, x.cantiere_id, x.data into r
  from public.rapportini x where x.id = new.rapportino_id;

  if r.org_id is null or r.org_id <> new.org_id then
    raise exception 'Il rapportino non appartiene a questa azienda' using errcode = '42501';
  end if;

  select f.org_id into org_fornitore from public.fornitori f where f.id = new.fornitore_id;
  if org_fornitore is null or org_fornitore <> new.org_id then
    raise exception 'L''impresa non appartiene a questa azienda' using errcode = '42501';
  end if;

  new.cantiere_id := r.cantiere_id;
  new.data := r.data;
  new.lavorazione := btrim(new.lavorazione);
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists rapportino_subappalti_controlla on public.rapportino_subappalti;
create trigger rapportino_subappalti_controlla
  before insert or update on public.rapportino_subappalti
  for each row execute function public.rapportino_subappalti_controlla();


-- ── 3. CHI PUO' FARE COSA ───────────────────────────────────────────
-- Come i lavori extra (`note-contabili.sql`): il tecnico sui cantieri
-- suoi, il titolare ovunque. Cancella il titolare, o il tecnico cio' che
-- ha scritto lui.

alter table public.rapportino_subappalti enable row level security;

drop policy if exists rapportino_subappalti_select on public.rapportino_subappalti;
create policy rapportino_subappalti_select on public.rapportino_subappalti
  for select using (
    app.has_perm(org_id, 'rapportini.validate')
    or app.puo_vedere_cantiere(cantiere_id)
  );

drop policy if exists rapportino_subappalti_insert on public.rapportino_subappalti;
create policy rapportino_subappalti_insert on public.rapportino_subappalti
  for insert with check (
    app.has_perm(org_id, 'rapportini.validate')
    or (app.has_perm(org_id, 'rapportini.create') and app.puo_vedere_cantiere(cantiere_id))
  );

drop policy if exists rapportino_subappalti_update on public.rapportino_subappalti;
create policy rapportino_subappalti_update on public.rapportino_subappalti
  for update using (
    app.has_perm(org_id, 'rapportini.validate')
    or (app.has_perm(org_id, 'rapportini.create') and app.puo_vedere_cantiere(cantiere_id))
  );

drop policy if exists rapportino_subappalti_delete on public.rapportino_subappalti;
create policy rapportino_subappalti_delete on public.rapportino_subappalti
  for delete using (
    app.has_perm(org_id, 'rapportini.validate')
    or (
      app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(cantiere_id)
      and scritto_da = auth.uid()
    )
  );

grant select, insert, update, delete on public.rapportino_subappalti to authenticated;


-- ── 4. LE IMPRESE DA SCEGLIERE ──────────────────────────────────────
-- Il tecnico non tiene l'anagrafica dei fornitori, e non deve leggerla
-- tutta: gli servono solo NOME e ID delle imprese di subappalto, per la
-- tendina del rapportino e per i nomi nella pagina. Una funzione che
-- restituisce esattamente quello, a chi scrive o valida i rapportini.
--
-- «Subappalto» e' la categoria del fornitore, testo libero: si
-- riconosce dalla radice, maiuscole e spazi a parte («Subappalti»,
-- «subappalto edile»).
--
-- `p_tutte`: anche quelle archiviate, per dare un nome alle righe
-- vecchie nella pagina. La tendina chiede solo le attive.

create or replace function public.imprese_subappalto(p_org uuid, p_tutte boolean default false)
returns table (id uuid, ragione_sociale text, attivo boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select f.id, f.ragione_sociale, f.attivo
  from public.fornitori f
  where f.org_id = p_org
    and (app.has_perm(p_org, 'rapportini.create') or app.has_perm(p_org, 'rapportini.validate'))
    and (
      lower(btrim(coalesce(f.categoria, ''))) like 'subappalt%'
      or (p_tutte and exists (
        select 1 from public.rapportino_subappalti s where s.fornitore_id = f.id
      ))
    )
    and (p_tutte or f.attivo)
  order by f.ragione_sociale;
$fn$;

grant execute on function public.imprese_subappalto(uuid, boolean) to authenticated;


-- ── 5. VERIFICA ─────────────────────────────────────────────────────
-- 4 policy, 1 trigger, la funzione. Poi le imprese di subappalto gia'
-- in anagrafica: se la lista e' vuota, la tendina del tecnico lo sara'
-- anche lei, e vanno inserite (Fornitori, tipo «Subappalto»).

select 'policy' as cosa, count(*)::text as quanti
from pg_policies where schemaname = 'public' and tablename = 'rapportino_subappalti'
union all
select 'trigger', count(*)::text from pg_trigger where tgname = 'rapportino_subappalti_controlla'
union all
select 'funzione imprese_subappalto', count(*)::text
from pg_proc where proname = 'imprese_subappalto';

select ragione_sociale, categoria, attivo
from public.fornitori
where lower(btrim(coalesce(categoria, ''))) like 'subappalt%'
order by ragione_sociale;
