-- =====================================================================
-- LE ORE PAGATE: la decisione del titolare sulle giornate gialle
--
-- Chiesto dall'utente il 2026-09-29, guardando il foglio presenze:
--
--   «appena vede una cella gialla — meno di 8 ore oppure di piu' — si
--   deve aprire [...] un campo di scelta dove il titolare deve dire se
--   ad esempio le 2 ore mancanti le vuole pagare, e quindi si normalizza
--   da 6 a 8, oppure nel caso opposto, se ci sono 10 ore di cui 2 di
--   straordinario, lui puo' benissimo dire: io ne pago solo 1 e l'altra
--   no.»
--
-- E subito dopo, la regola che decide dove sta:
--
--   «questo influisce sull'aspetto economico, ma le ore effettuate in
--   cantiere — quelle inviate da Sebastiano e poi validate dal titolare
--   — appartengono a un altro flusso, quello primario, che porta le
--   informazioni dal campo alla scrivania.»
--
-- QUINDI UNA TABELLA SUA, e i rapportini non si toccano. Le ore validate
-- restano quelle del campo; qui sta quante di quelle ore, quel giorno,
-- il titolare decide di PAGARE. Il Riepilogo economico paga queste al
-- posto delle lavorate, dove ci sono.
--
-- ── LE REGOLE ───────────────────────────────────────────────────────
-- * Una decisione per persona e giorno.
-- * Si ricorda anche QUANTE ORE ERANO LAVORATE quando ha deciso: se la
--   giornata poi viene riaperta e cambia, la decisione non vale piu' (la
--   pagina la mostra «da rivedere» e paga le lavorate). Pagare 8 su una
--   giornata che nel frattempo e' diventata da 4 sarebbe una decisione
--   mai presa.
-- * La decide chi valida (`rapportini.validate`); la legge anche chi fa
--   le paghe (`paghe.read`).
-- * Non si cambia piu' quando il foglio definitivo del mese e' stato
--   inviato: da li' i numeri sono quelli fotografati.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend. Si puo'
-- rilanciare.
-- =====================================================================


-- ── 1. LA TABELLA ───────────────────────────────────────────────────

create table if not exists public.ore_pagate (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  dipendente_id  uuid not null references public.dipendenti(id) on delete cascade,
  data           date not null,
  -- Le ore lavorate e validate di quel giorno, quando ha deciso.
  ore_lavorate   numeric(5,2) not null check (ore_lavorate >= 0),
  -- Quante ne paga.
  ore_pagate     numeric(5,2) not null check (ore_pagate >= 0 and ore_pagate <= 24),
  nota           text,
  deciso_da      uuid default auth.uid() references auth.users(id) on delete set null,
  deciso_at      timestamptz not null default now(),
  constraint ore_pagate_una_per_giorno unique (dipendente_id, data)
);

create index if not exists ore_pagate_org_data_idx on public.ore_pagate (org_id, data);

comment on table public.ore_pagate is
  'Quante ore paga il titolare in una giornata diversa dalla giornata piena. Non tocca le ore validate dei rapportini: le usa solo il Riepilogo economico.';

alter table public.ore_pagate enable row level security;

-- Il mese e' ancora aperto? Cioe': il foglio definitivo non e' stato
-- inviato ne' validato.
create or replace function app.mese_paghe_aperto(p_org uuid, p_giorno date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select not exists (
    select 1 from public.paghe_mesi m
    where m.org_id = p_org
      and m.anno = extract(year from p_giorno)::int
      and m.mese = extract(month from p_giorno)::int
      and m.stato <> 'bozza'
  );
$fn$;

grant execute on function app.mese_paghe_aperto(uuid, date) to authenticated;

drop policy if exists ore_pagate_select on public.ore_pagate;
create policy ore_pagate_select on public.ore_pagate
  for select using (
    app.has_perm(org_id, 'rapportini.validate') or app.has_perm(org_id, 'paghe.read')
  );

drop policy if exists ore_pagate_scrive on public.ore_pagate;
create policy ore_pagate_scrive on public.ore_pagate
  for all
  using (app.has_perm(org_id, 'rapportini.validate') and app.mese_paghe_aperto(org_id, data))
  with check (app.has_perm(org_id, 'rapportini.validate') and app.mese_paghe_aperto(org_id, data));

grant select, insert, update, delete on public.ore_pagate to authenticated;

create or replace function public.ore_pagate_controlla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  org_persona uuid;
begin
  select d.org_id into org_persona from public.dipendenti d where d.id = new.dipendente_id;
  if org_persona is null or org_persona <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
  end if;
  new.deciso_da := auth.uid();
  new.deciso_at := now();
  return new;
end;
$fn$;

drop trigger if exists ore_pagate_controlla on public.ore_pagate;
create trigger ore_pagate_controlla
  before insert or update on public.ore_pagate
  for each row execute function public.ore_pagate_controlla();


-- ── 2. LA FOTOGRAFIA DEL MESE LE RICORDA ────────────────────────────
-- Il foglio definitivo deve dire, fra un anno, che Rossi ha lavorato
-- 63,5 ore e ne sono state pagate 64. NULL = pagate come lavorate.

alter table public.paghe_righe
  add column if not exists ore_pagate numeric(7,2);

-- `invia_paghe` come in `riepilogo-economico.sql`, con la colonna in
-- piu'. Stessa firma: `create or replace` tiene i permessi.
create or replace function public.invia_paghe(
  p_org uuid, p_anno integer, p_mese integer, p_righe jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id    uuid;
  v_stato text;
begin
  if not app.has_perm(p_org, 'paghe.read') then
    raise exception 'Permesso paghe.read mancante' using errcode = '42501';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Il riepilogo e'' vuoto: non c''e'' niente da inviare' using errcode = 'P0001';
  end if;

  select id, stato into v_id, v_stato
  from public.paghe_mesi
  where org_id = p_org and anno = p_anno and mese = p_mese
  for update;

  if v_stato is not null and v_stato <> 'bozza' then
    raise exception 'Il riepilogo di questo mese e'' gia'' % : non si reinvia', v_stato
      using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.paghe_mesi (org_id, anno, mese)
    values (p_org, p_anno, p_mese)
    returning id into v_id;
  end if;

  delete from public.paghe_righe where mese_id = v_id;

  insert into public.paghe_righe (
    org_id, mese_id, dipendente_id, nominativo, tipo,
    giorni, ore_lavorate, ore_straordinarie, ore_pagate, ore_ferie, ore_permessi, ore_altre,
    regime, paga_globale, tariffa,
    maturato, acconti, rimborsi, trattenute, da_bonificare, movimenti
  )
  select
    p_org, v_id, (r->>'dipendente_id')::uuid, r->>'nominativo', r->>'tipo',
    coalesce((r->>'giorni')::numeric, 0),
    coalesce((r->>'ore_lavorate')::numeric, 0),
    coalesce((r->>'ore_straordinarie')::numeric, 0),
    (r->>'ore_pagate')::numeric,
    coalesce((r->>'ore_ferie')::numeric, 0),
    coalesce((r->>'ore_permessi')::numeric, 0),
    coalesce((r->>'ore_altre')::numeric, 0),
    r->>'regime',
    (r->>'paga_globale')::numeric,
    (r->>'tariffa')::numeric,
    coalesce((r->>'maturato')::numeric, 0),
    coalesce((r->>'acconti')::numeric, 0),
    coalesce((r->>'rimborsi')::numeric, 0),
    coalesce((r->>'trattenute')::numeric, 0),
    coalesce((r->>'da_bonificare')::numeric, 0),
    coalesce(r->'movimenti', '[]'::jsonb)
  from jsonb_array_elements(p_righe) as r
  -- Solo persone di questa azienda: l'id arriva dal browser.
  where exists (
    select 1 from public.dipendenti d
    where d.id = (r->>'dipendente_id')::uuid and d.org_id = p_org
  );

  update public.paghe_mesi
  set stato = 'inviato', inviato_at = now(), inviato_da = auth.uid(), motivo = null
  where id = v_id;

  return v_id;
end;
$fn$;


-- ── 3. VERIFICA ─────────────────────────────────────────────────────
-- Devono uscire: 2 policy, 1 trigger, la colonna nuova della fotografia.

select 'policy' as cosa, count(*)::text as quanti
from pg_policies where schemaname = 'public' and tablename = 'ore_pagate'
union all
select 'trigger', count(*)::text from pg_trigger where tgname = 'ore_pagate_controlla'
union all
select 'colonna paghe_righe.ore_pagate', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'paghe_righe' and column_name = 'ore_pagate';
