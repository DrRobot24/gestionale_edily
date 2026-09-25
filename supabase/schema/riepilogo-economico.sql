-- =====================================================================
-- IL RIEPILOGO ECONOMICO DEL MESE: chi prende quanto, e la seconda firma
--
-- Chiesto dall'utente il 2026-09-25. Il «Riepilogo Economico» era in
-- STATO_LAVORI da giorni come il punto d'arrivo della catena: mensile,
-- lo compila Stefania, lo firma il titolare. Parole dell'utente:
--
--   «Una tabella di tutti gli operai, inclusi gli impiegati d'ufficio,
--   che mostri oltre alle ore lavorate ed eventuali permessi, ferie etc.
--   il totale percepito da ogni persona per mese di riferimento. Un campo
--   per inserire acconti percepiti durante il mese, somme arretrate da
--   detrarre, rimborsi (sempre con il motivo) e detrazioni extra per
--   spese. Stampabile in PDF solo quando si e' sicuri che tutto
--   coincide. E' il lavoro di Stefania, lo valida il titolare, l'unico
--   che fa i bonifici: avra' il PDF in mano per farli. Dopo questa
--   seconda validazione i dati vanno in archivio, e solo il titolare
--   puo' richiederne la modifica.»
--
-- ── TRE TABELLE ─────────────────────────────────────────────────────
--   paghe_mesi        il mese dell'impresa e il suo stato:
--                       bozza ──invia──▶ inviato ──valida──▶ validato
--                         ▲                │ respingi          │ riapri
--                         └────────────────┴───────────────────┘
--   paghe_movimenti   acconti, rimborsi, trattenute: una riga per
--                     movimento, SEMPRE col motivo. Le quattro voci
--                     dell'utente diventano tre: «arretrati da detrarre»
--                     e «detrazioni per spese» sono tutte e due soldi
--                     che si tolgono per un motivo scritto, e due colonne
--                     per la stessa operazione si sommerebbero a mano.
--   paghe_righe       la FOTOGRAFIA del mese, una riga per persona,
--                     scattata quando Stefania invia. E' cio' che il
--                     titolare firma e cio' che va in archivio: se dopo
--                     cambia una tariffa o si riapre un rapportino, il
--                     mese firmato non si muove.
--
-- ── CHI FA COSA ─────────────────────────────────────────────────────
--   Leggere            `paghe.read` (Stefania, il titolare).
--   Movimenti          `paghe.read`, e solo finche' il mese e' in bozza:
--                      mandato al titolare non si tocca piu'.
--   Inviare            `paghe.read` — la funzione `invia_paghe`.
--   Validare/respingere/riaprire   `rapportini.validate`: il titolare.
--   Lo stato non si scrive a mano: niente policy di scrittura su
--   `paghe_mesi` e `paghe_righe`, solo le tre funzioni.
--
-- ── L'ARCHIVIO ──────────────────────────────────────────────────────
-- Validando, i rapportini VALIDATI del mese passano a `contabilizzato`:
-- e' lo stato che esiste gia' per questo, e che i calendari colorano di
-- azzurro («archiviata»). Riaprendo tornano `validato`. Le ore personali
-- non hanno quello stato: restano validate, e il mese le fotografa.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend che le
-- legge. Si puo' rilanciare.
-- =====================================================================


-- ── 1. IL MESE ──────────────────────────────────────────────────────

create table if not exists public.paghe_mesi (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  anno            integer not null check (anno between 2000 and 2100),
  mese            integer not null check (mese between 1 and 12),
  stato           text not null default 'bozza'
                  check (stato in ('bozza', 'inviato', 'validato')),
  inviato_at      timestamptz,
  inviato_da      uuid references auth.users(id) on delete set null,
  validato_at     timestamptz,
  validato_da     uuid references auth.users(id) on delete set null,
  -- Perche' il titolare l'ha rimandato indietro o riaperto: e' la riga
  -- che Stefania legge per sapere cosa correggere.
  motivo          text,
  created_at      timestamptz not null default now(),
  constraint paghe_mesi_uno_per_mese unique (org_id, anno, mese)
);

alter table public.paghe_mesi enable row level security;

drop policy if exists paghe_mesi_select on public.paghe_mesi;
create policy paghe_mesi_select on public.paghe_mesi
  for select using (app.has_perm(org_id, 'paghe.read'));


-- ── 2. I MOVIMENTI: acconti, rimborsi, trattenute ───────────────────

create table if not exists public.paghe_movimenti (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  dipendente_id   uuid not null references public.dipendenti(id) on delete cascade,
  anno            integer not null check (anno between 2000 and 2100),
  mese            integer not null check (mese between 1 and 12),
  --  acconto     soldi gia' dati durante il mese: si tolgono
  --  rimborso    spese anticipate dalla persona: si aggiungono
  --  trattenuta  arretrati da detrarre, spese a suo carico: si tolgono
  tipo            text not null check (tipo in ('acconto', 'rimborso', 'trattenuta')),
  -- Sempre positivo: il segno lo decide il tipo. Un -50 in una colonna
  -- di trattenute si leggerebbe come un rimborso.
  importo         numeric(10,2) not null check (importo > 0),
  motivo          text not null check (length(btrim(motivo)) > 0),
  scritto_da      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists paghe_movimenti_mese_idx
  on public.paghe_movimenti (org_id, anno, mese);

alter table public.paghe_movimenti enable row level security;

-- Il mese e' ancora aperto: non esiste, o e' in bozza.
create or replace function app.paghe_mese_aperto(p_org uuid, p_anno integer, p_mese integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select not exists (
    select 1 from public.paghe_mesi m
    where m.org_id = p_org and m.anno = p_anno and m.mese = p_mese
      and m.stato <> 'bozza'
  );
$fn$;

drop policy if exists paghe_movimenti_select on public.paghe_movimenti;
create policy paghe_movimenti_select on public.paghe_movimenti
  for select using (app.has_perm(org_id, 'paghe.read'));

drop policy if exists paghe_movimenti_insert on public.paghe_movimenti;
create policy paghe_movimenti_insert on public.paghe_movimenti
  for insert with check (
    app.has_perm(org_id, 'paghe.read')
    and app.paghe_mese_aperto(org_id, anno, mese)
  );

drop policy if exists paghe_movimenti_update on public.paghe_movimenti;
create policy paghe_movimenti_update on public.paghe_movimenti
  for update
  using (app.has_perm(org_id, 'paghe.read') and app.paghe_mese_aperto(org_id, anno, mese))
  with check (app.has_perm(org_id, 'paghe.read') and app.paghe_mese_aperto(org_id, anno, mese));

drop policy if exists paghe_movimenti_delete on public.paghe_movimenti;
create policy paghe_movimenti_delete on public.paghe_movimenti
  for delete using (
    app.has_perm(org_id, 'paghe.read')
    and app.paghe_mese_aperto(org_id, anno, mese)
  );

-- La persona dev'essere dell'azienda della riga.
create or replace function public.paghe_movimenti_controlla()
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
  return new;
end;
$fn$;

drop trigger if exists paghe_movimenti_controlla on public.paghe_movimenti;
create trigger paghe_movimenti_controlla
  before insert or update on public.paghe_movimenti
  for each row execute function public.paghe_movimenti_controlla();


-- ── 3. LA FOTOGRAFIA DEL MESE ───────────────────────────────────────

create table if not exists public.paghe_righe (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  mese_id           uuid not null references public.paghe_mesi(id) on delete cascade,
  dipendente_id     uuid not null references public.dipendenti(id) on delete restrict,
  -- Il nome com'era quel mese: l'archivio non deve cambiare se domani
  -- si corregge un refuso in anagrafica.
  nominativo        text not null,
  tipo              text,
  giorni            numeric(5,1) not null default 0,
  ore_lavorate      numeric(7,2) not null default 0,
  ore_straordinarie numeric(7,2) not null default 0,
  ore_ferie         numeric(7,2) not null default 0,
  ore_permessi      numeric(7,2) not null default 0,
  ore_altre         numeric(7,2) not null default 0,
  -- 'globale' = paga globale (importo mensile), 'giornaliera' = tariffa.
  regime            text check (regime in ('globale', 'giornaliera')),
  paga_globale      numeric(10,2),
  tariffa           numeric(10,4),
  maturato          numeric(10,2) not null default 0,
  acconti           numeric(10,2) not null default 0,
  rimborsi          numeric(10,2) not null default 0,
  trattenute        numeric(10,2) not null default 0,
  da_bonificare     numeric(10,2) not null default 0,
  -- I movimenti com'erano all'invio, col motivo: il PDF dei bonifici li
  -- deve poter elencare anche fra un anno.
  movimenti         jsonb not null default '[]'::jsonb,
  constraint paghe_righe_una_per_persona unique (mese_id, dipendente_id)
);

alter table public.paghe_righe enable row level security;

drop policy if exists paghe_righe_select on public.paghe_righe;
create policy paghe_righe_select on public.paghe_righe
  for select using (app.has_perm(org_id, 'paghe.read'));


-- ── 4. INVIARE: Stefania fotografa il mese e lo manda al titolare ────
--
-- Le righe le calcola la pagina — ore validate, paga globale o
-- giornaliera, movimenti — e arrivano qui gia' fatte: la regola del
-- calcolo sta in un posto solo (`retribuzione.ts`), e il titolare firma
-- esattamente i numeri che ha visto chi li ha preparati. Qui si
-- controllano chi, e lo stato.

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
    giorni, ore_lavorate, ore_straordinarie, ore_ferie, ore_permessi, ore_altre,
    regime, paga_globale, tariffa,
    maturato, acconti, rimborsi, trattenute, da_bonificare, movimenti
  )
  select
    p_org, v_id, (r->>'dipendente_id')::uuid, r->>'nominativo', r->>'tipo',
    coalesce((r->>'giorni')::numeric, 0),
    coalesce((r->>'ore_lavorate')::numeric, 0),
    coalesce((r->>'ore_straordinarie')::numeric, 0),
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


-- ── 5. LA SECONDA FIRMA: validare o rimandare indietro ──────────────

create or replace function public.decidi_paghe(
  p_org uuid, p_anno integer, p_mese integer, p_valida boolean, p_motivo text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id      uuid;
  v_stato   text;
  archiviati integer := 0;
begin
  if not app.has_perm(p_org, 'rapportini.validate') then
    raise exception 'Permesso rapportini.validate mancante' using errcode = '42501';
  end if;

  select id, stato into v_id, v_stato
  from public.paghe_mesi
  where org_id = p_org and anno = p_anno and mese = p_mese
  for update;

  if v_stato is distinct from 'inviato' then
    raise exception 'Il riepilogo non e'' in attesa di firma' using errcode = 'P0001';
  end if;

  if not p_valida then
    if p_motivo is null or length(btrim(p_motivo)) = 0 then
      raise exception 'Serve il motivo: e'' quello che legge chi deve correggere'
        using errcode = 'P0001';
    end if;
    update public.paghe_mesi set stato = 'bozza', motivo = btrim(p_motivo) where id = v_id;
    return 0;
  end if;

  update public.paghe_mesi
  set stato = 'validato', validato_at = now(), validato_da = auth.uid(), motivo = null
  where id = v_id;

  -- In archivio: i rapportini validati del mese diventano contabilizzati.
  update public.rapportini
  set stato = 'contabilizzato'
  where org_id = p_org
    and stato = 'validato'
    and data >= make_date(p_anno, p_mese, 1)
    and data < (make_date(p_anno, p_mese, 1) + interval '1 month');
  get diagnostics archiviati = row_count;

  return archiviati;
end;
$fn$;


-- ── 6. RIAPRIRE UN MESE ARCHIVIATO: solo il titolare, col motivo ────

create or replace function public.riapri_paghe(
  p_org uuid, p_anno integer, p_mese integer, p_motivo text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id     uuid;
  v_stato  text;
  riaperti integer := 0;
begin
  if not app.has_perm(p_org, 'rapportini.validate') then
    raise exception 'Permesso rapportini.validate mancante' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Serve il motivo della riapertura' using errcode = 'P0001';
  end if;

  select id, stato into v_id, v_stato
  from public.paghe_mesi
  where org_id = p_org and anno = p_anno and mese = p_mese
  for update;

  if v_stato is distinct from 'validato' then
    raise exception 'Si riapre solo un riepilogo validato' using errcode = 'P0001';
  end if;

  update public.paghe_mesi
  set stato = 'bozza', motivo = btrim(p_motivo), validato_at = null, validato_da = null
  where id = v_id;

  update public.rapportini
  set stato = 'validato'
  where org_id = p_org
    and stato = 'contabilizzato'
    and data >= make_date(p_anno, p_mese, 1)
    and data < (make_date(p_anno, p_mese, 1) + interval '1 month');
  get diagnostics riaperti = row_count;

  return riaperti;
end;
$fn$;

revoke all on function public.invia_paghe(uuid, integer, integer, jsonb) from public, anon;
revoke all on function public.decidi_paghe(uuid, integer, integer, boolean, text) from public, anon;
revoke all on function public.riapri_paghe(uuid, integer, integer, text) from public, anon;
grant execute on function public.invia_paghe(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.decidi_paghe(uuid, integer, integer, boolean, text) to authenticated;
grant execute on function public.riapri_paghe(uuid, integer, integer, text) to authenticated;


-- ── 7. VERIFICA ─────────────────────────────────────────────────────
-- Tre tabelle con la RLS accesa, e le tre funzioni.

select c.relname as tabella, c.relrowsecurity as rls_attiva
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('paghe_mesi', 'paghe_movimenti', 'paghe_righe')
order by c.relname;

select p.proname as funzione, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('invia_paghe', 'decidi_paghe', 'riapri_paghe')
order by p.proname;
