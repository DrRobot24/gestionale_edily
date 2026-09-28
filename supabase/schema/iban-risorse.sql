-- =====================================================================
-- L'IBAN DELLE RISORSE — dove va il bonifico dello stipendio
--
-- Chiesto dall'utente il 2026-09-28: «dobbiamo sapere a chi fare il
-- bonifico quando arriva lo stipendio».
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── IN UNA TABELLA SUA, come lo stipendio ───────────────────────────
-- Non una colonna di `dipendenti`, e il motivo e' lo stesso di
-- `dipendente_stipendi`: `dipendenti` la legge anche il tecnico
-- (`anagrafiche.read`, gli serve per la squadra). Una colonna li'
-- sarebbe nascosta dall'interfaccia ma leggibile da chiunque interroghi
-- le API. Qui la RLS chiude su `paghe.read`: Stefania e il titolare.
--
-- UNA RIGA PER PERSONA, senza storico: un IBAN cambiato si sovrascrive.
-- Il conto vecchio non serve a nessun calcolo, e tenerlo vorrebbe dire
-- rischiare un bonifico sul conto chiuso.
--
-- L'INTESTATARIO e' facoltativo: si scrive solo quando il conto non e'
-- a nome della persona (capita — il conto del coniuge).
-- =====================================================================

create table if not exists public.dipendente_iban (
  dipendente_id uuid primary key references public.dipendenti(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Maiuscolo e senza spazi: la forma la sistema il frontend, il check
  -- garantisce che nessun'altra strada scriva un IBAN malformato. Due
  -- lettere di paese, due cifre di controllo, poi 11–30 caratteri.
  iban text not null check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  intestatario text,

  updated_at timestamptz not null default now()
);

alter table public.dipendente_iban enable row level security;

create index if not exists dipendente_iban_org_idx on public.dipendente_iban (org_id);

comment on table public.dipendente_iban is
  'IBAN per il bonifico dello stipendio, una riga per persona. Letto solo da chi ha paghe.read: la tabella dipendenti la legge anche il tecnico.';


-- ── LA COERENZA ─────────────────────────────────────────────────────
-- La persona dev'essere dell'azienda scritta nella riga; e la data di
-- modifica si aggiorna da sola.

create or replace function public.dipendente_iban_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org_persona uuid;
begin
  select d.org_id into org_persona
  from public.dipendenti d where d.id = new.dipendente_id;

  if org_persona is null or org_persona <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists dipendente_iban_controlla on public.dipendente_iban;
create trigger dipendente_iban_controlla
  before insert or update on public.dipendente_iban
  for each row execute function public.dipendente_iban_controlla();


-- ── CHI PUO' FARE COSA ──────────────────────────────────────────────
-- Legge chi fa le paghe. Scrive chi fa le paghe E tiene le anagrafiche,
-- come lo stipendio. Qui l'UPDATE c'e': l'IBAN si sovrascrive.

drop policy if exists dipendente_iban_select on public.dipendente_iban;
create policy dipendente_iban_select on public.dipendente_iban
  for select using (app.has_perm(org_id, 'paghe.read'));

drop policy if exists dipendente_iban_insert on public.dipendente_iban;
create policy dipendente_iban_insert on public.dipendente_iban
  for insert with check (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  );

drop policy if exists dipendente_iban_update on public.dipendente_iban;
create policy dipendente_iban_update on public.dipendente_iban
  for update using (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  ) with check (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  );

drop policy if exists dipendente_iban_delete on public.dipendente_iban;
create policy dipendente_iban_delete on public.dipendente_iban
  for delete using (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  );

grant select, insert, update, delete on public.dipendente_iban to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire 4 policy e 1 trigger.
select 'policy' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'dipendente_iban'
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname = 'dipendente_iban_controlla';
