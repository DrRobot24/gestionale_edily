-- =====================================================================
-- GLI APPUNTI SU UNA RISORSA — i post-it della scheda
--
-- Chiesto dall'utente il 2026-09-28: «un campo note generico per ogni
-- singola risorsa dove si possono inserire come dei post-it, delle note
-- o degli appunti su quella persona, senza vincoli di argomento».
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── PERCHE' UNA TABELLA E NON PIU' `dipendenti.note` ────────────────
-- Un post-it e' un foglietto: se ne attacca uno nuovo, non si riscrive
-- quello di prima. Tanti appunti, ognuno con la sua data e chi l'ha
-- scritto, si leggono come una storia — «a marzo ha chiesto le ferie di
-- agosto», «a luglio si e' lamentato della schiena». Un campo solo
-- diventa un muro di testo in cui nessuno sa cosa e' vecchio.
--
-- E C'E' LA RISERVATEZZA. `dipendenti` la legge anche il tecnico
-- (`anagrafiche.read`, per la squadra del rapportino), quindi anche
-- `dipendenti.note` — patologie comprese — era leggibile da lui via API.
-- Qui la lettura e' chiusa su `anagrafiche.write`: Stefania e il
-- titolare, cioe' chi apre davvero la scheda.
--
-- ── LE NOTE CHE C'ERANO ─────────────────────────────────────────────
-- Il blocco 3 le copia qui come primo appunto di ciascuno, con la data
-- dell'ultima modifica della scheda. La colonna `dipendenti.note` NON si
-- cancella (database condiviso con wbs-office, senza backup) e il
-- gestionale smette solo di usarla.
-- =====================================================================


-- ── 1. LA TABELLA ───────────────────────────────────────────────────

create table if not exists public.dipendente_appunti (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  testo text not null check (btrim(testo) <> ''),
  scritto_da uuid default auth.uid(),
  -- Vero per le note portate da `dipendenti.note` dal blocco 3: servono
  -- a non ricopiarle rilanciando il file.
  da_note_vecchie boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.dipendente_appunti enable row level security;

create index if not exists dipendente_appunti_dipendente_idx
  on public.dipendente_appunti (dipendente_id, created_at desc);

comment on table public.dipendente_appunti is
  'Appunti liberi su una risorsa, uno per riga come post-it. Letti solo da chi ha anagrafiche.write: dipendenti la legge anche il tecnico.';


-- ── 2. COERENZA E PERMESSI ──────────────────────────────────────────

create or replace function public.dipendente_appunti_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org_persona uuid;
begin
  select d.org_id into org_persona from public.dipendenti d where d.id = new.dipendente_id;
  if org_persona is distinct from new.org_id then
    raise exception 'La persona non appartiene a questa azienda'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists dipendente_appunti_controlla on public.dipendente_appunti;
create trigger dipendente_appunti_controlla
  before insert or update on public.dipendente_appunti
  for each row execute function public.dipendente_appunti_controlla();

-- Legge e scrive chi tiene le anagrafiche. Un post-it non si corregge:
-- si stacca (delete) e se ne attacca un altro. Niente UPDATE.
drop policy if exists dipendente_appunti_select on public.dipendente_appunti;
create policy dipendente_appunti_select on public.dipendente_appunti
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_appunti_insert on public.dipendente_appunti;
create policy dipendente_appunti_insert on public.dipendente_appunti
  for insert with check (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_appunti_delete on public.dipendente_appunti;
create policy dipendente_appunti_delete on public.dipendente_appunti
  for delete using (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, delete on public.dipendente_appunti to authenticated;


-- ── 3. LE NOTE CHE C'ERANO, COPIATE COME PRIMO APPUNTO ──────────────

insert into public.dipendente_appunti (org_id, dipendente_id, testo, scritto_da, da_note_vecchie, created_at)
select d.org_id, d.id, btrim(d.note), null, true, coalesce(d.updated_at, d.created_at, now())
from public.dipendenti d
where d.note is not null
  and btrim(d.note) <> ''
  and not exists (
    select 1 from public.dipendente_appunti a
    where a.dipendente_id = d.id and a.da_note_vecchie
  );


-- ── 4. VERIFICA ─────────────────────────────────────────────────────
-- 3 policy, 1 trigger, e quante note sono state portate: deve coincidere
-- con quante schede avevano una nota.
select 'policy' as cosa, count(*)::text as quanti
from pg_policies where schemaname = 'public' and tablename = 'dipendente_appunti'
union all
select 'trigger', count(*)::text from pg_trigger where tgname = 'dipendente_appunti_controlla'
union all
select 'note portate', count(*)::text from public.dipendente_appunti where da_note_vecchie
union all
select 'schede con nota', count(*)::text
from public.dipendenti where note is not null and btrim(note) <> '';
