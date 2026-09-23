-- =====================================================================
-- L'ECONOMIA DI UNA RISORSA: netto in busta, ferie e permessi
--
-- NON e' una migration della CLI Supabase: va eseguito a mano nel SQL
-- Editor, un blocco alla volta. Non tocca tabelle esistenti: aggiunge
-- due tabelle nuove, quindi si puo' eseguire senza rischi e rieseguire.
--
-- Chiesto dall'utente il 2026-09-23: «nella scheda della risorsa, una
-- sezione economica per calcolare mese per mese quanto ha percepito al
-- netto una persona, quanti giorni ha lavorato, quanti in ferie, in
-- malattia o in permesso, le ferie maturate, i permessi residui».
--
-- COSA SI CALCOLA E COSA SI SCRIVE, e il confine non e' casuale:
--
--   calcolato   giorni lavorati, ore, ferie / malattia / permessi
--               goduti. Escono dalle giornate VALIDATE dal titolare
--               (`ore_griglia`), le stesse del Foglio presenze: nessun
--               numero nuovo, solo lo stesso letto per mese.
--   scritto     il NETTO IN BUSTA, che il gestionale non calcola — la
--               busta paga la fa il consulente del lavoro. Lo riporta
--               Stefania dal cedolino. Una stima dal costo orario
--               sarebbe stata il costo per l'azienda, non il netto: un
--               numero sbagliato presentato come giusto.
--   scritto     il MONTE ANNUO di ferie e permessi e il saldo di
--               partenza: dipendono da contratto e anzianita', e vanno
--               presi dal cedolino, non indovinati.
--
-- CHI: `paghe.read`, cioe' chi fa le paghe (e il titolare, che ha tutti
-- i permessi). Il tecnico non vede niente di tutto questo.
-- =====================================================================


-- =====================================================================
-- 1. IL NETTO IN BUSTA, mese per mese
-- =====================================================================
create table if not exists public.buste_paga (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  anno          integer not null check (anno between 2000 and 2100),
  mese          integer not null check (mese between 1 and 12),
  netto         numeric(10,2) not null check (netto >= 0),
  note          text,
  scritta_da    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un netto solo per persona e mese: riscriverlo lo corregge.
  constraint buste_paga_una_per_mese unique (dipendente_id, anno, mese)
);

create index if not exists buste_paga_persona_idx on public.buste_paga (dipendente_id, anno);

comment on table public.buste_paga is
  'Il netto in busta di una persona per un mese, riportato da chi fa le paghe dal cedolino del consulente. Il gestionale non lo calcola.';

alter table public.buste_paga enable row level security;

drop policy if exists buste_paga_tutto on public.buste_paga;
create policy buste_paga_tutto on public.buste_paga
  for all
  using (app.has_perm(org_id, 'paghe.read'))
  with check (app.has_perm(org_id, 'paghe.read'));


-- =====================================================================
-- 2. FERIE E PERMESSI: il monte annuo e il saldo di partenza
--
-- Una riga per persona. La maturazione e' 1/12 del monte annuo per ogni
-- mese completato DOPO la data del saldo; il goduto sono le ferie e i
-- permessi delle giornate validate dopo quella data. Residuo = saldo +
-- maturato - goduto. Le ore e non i giorni, perche' i permessi si
-- prendono a ore; la pagina mostra anche i giorni (8 ore).
-- =====================================================================
create table if not exists public.monte_ferie (
  dipendente_id      uuid primary key references public.dipendenti(id) on delete cascade,
  org_id             uuid not null references public.organizations(id) on delete cascade,
  ferie_annue_ore    numeric(6,2) not null default 0 check (ferie_annue_ore >= 0),
  permessi_annui_ore numeric(6,2) not null default 0 check (permessi_annui_ore >= 0),
  -- Il residuo a una certa data, come risulta dal cedolino: puo' essere
  -- negativo (ferie anticipate).
  saldo_ferie_ore    numeric(7,2) not null default 0,
  saldo_permessi_ore numeric(7,2) not null default 0,
  saldi_al           date not null,
  updated_at         timestamptz not null default now()
);

comment on table public.monte_ferie is
  'Ferie e permessi spettanti di una persona: monte annuo in ore e residuo a una data (dal cedolino). Il goduto si calcola dalle giornate validate.';

alter table public.monte_ferie enable row level security;

drop policy if exists monte_ferie_tutto on public.monte_ferie;
create policy monte_ferie_tutto on public.monte_ferie
  for all
  using (app.has_perm(org_id, 'paghe.read'))
  with check (app.has_perm(org_id, 'paghe.read'));
