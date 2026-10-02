-- =====================================================================
-- MEZZI E ATTREZZATURE: SCHEDE PIU' COMPLETE, ASSICURAZIONE, SPESE
--
-- Chiesto dall'utente il 2026-09-29, guardando «Nuovo mezzo»: «aumenta
-- i campi che qua sono molto pochi, ed infine il costo per
-- l'assicurazione che manca insieme con il nome della Compagnia
-- assicuratrice. [...] sia per mezzi che attrezzature creare un campo
-- di inserimento spese relativo a quel mezzo o attrezzatura che poi in
-- futuro fara' match con i fornitori».
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── 1. LE COLONNE NUOVE ─────────────────────────────────────────────
-- Tutte facoltative: le schede gia' inserite restano valide.
--
-- Il COSTO DELL'ASSICURAZIONE e' il premio ANNUO, un numero solo sulla
-- scheda: serve a sapere quanto costa tenere quel mezzo. Il pagamento
-- vero, con la sua data e il suo fornitore, e' una SPESA (sotto).
--
-- ── 2. LE SPESE ─────────────────────────────────────────────────────
-- Una tabella sola per mezzi e attrezzature, con due colonne di
-- riferimento di cui ne e' piena esattamente una: cosi' le chiavi
-- esterne restano vere (un id che non esiste il database lo rifiuta),
-- cosa che un `riferimento_id` generico come quello dei documenti non
-- puo' garantire.
--
-- IL FORNITORE e' facoltativo oggi (lo scontrino del gasolio non ha un
-- fornitore in anagrafica), ma c'e' gia' la colonna, insieme al NUMERO
-- DEL DOCUMENTO (fattura, scontrino): sono le due chiavi con cui, quando
-- arrivera' il ciclo fornitori, la spesa si abbinera' alla fattura.
--
-- CANCELLARE UN MEZZO CON SPESE NON SI PUO' (`on delete restrict`): i
-- soldi spesi restano nella contabilita' anche se il mezzo si vende. Si
-- archivia, come per i rapportini.
--
-- CHI LE VEDE: chi tiene le anagrafiche (`anagrafiche.write`), cioe'
-- Stefania e il titolare — gli stessi che vedono i documenti del parco.
-- Il tecnico no: sono soldi.
-- =====================================================================

-- ── 1. LE COLONNE ───────────────────────────────────────────────────

alter table public.mezzi
  add column if not exists marca text,
  add column if not exists modello text,
  add column if not exists telaio text,
  add column if not exists data_immatricolazione date,
  add column if not exists data_acquisto date,
  add column if not exists compagnia_assicurativa text,
  add column if not exists numero_polizza text,
  add column if not exists costo_assicurazione numeric(12,2)
    check (costo_assicurazione is null or costo_assicurazione >= 0),
  add column if not exists scadenza_bollo date,
  add column if not exists note text;

alter table public.attrezzature
  add column if not exists compagnia_assicurativa text,
  add column if not exists numero_polizza text,
  add column if not exists costo_assicurazione numeric(12,2)
    check (costo_assicurazione is null or costo_assicurazione >= 0),
  add column if not exists scadenza_assicurazione date;


-- ── 2. LE SPESE ─────────────────────────────────────────────────────

create table if not exists public.parco_spese (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  mezzo_id uuid references public.mezzi(id) on delete restrict,
  attrezzatura_id uuid references public.attrezzature(id) on delete restrict,

  data date not null default current_date,
  -- Un elenco chiuso: e' quello che permettera' di sommare «quanto
  -- abbiamo speso di carburante quest'anno» senza leggere le descrizioni.
  categoria text not null default 'altro'
    check (categoria in (
      'carburante', 'manutenzione', 'riparazione', 'pneumatici',
      'assicurazione', 'bollo', 'revisione', 'verifica', 'noleggio', 'altro'
    )),
  descrizione text,
  importo numeric(12,2) not null check (importo >= 0),

  fornitore_id uuid references public.fornitori(id) on delete set null,
  numero_documento text,

  creato_da uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint parco_spese_una_cosa
    check ((mezzo_id is null) <> (attrezzatura_id is null))
);

alter table public.parco_spese enable row level security;

create index if not exists parco_spese_mezzo_idx
  on public.parco_spese (mezzo_id) where mezzo_id is not null;
create index if not exists parco_spese_attrezzatura_idx
  on public.parco_spese (attrezzatura_id) where attrezzatura_id is not null;
create index if not exists parco_spese_org_data_idx
  on public.parco_spese (org_id, data);
create index if not exists parco_spese_fornitore_idx
  on public.parco_spese (fornitore_id) where fornitore_id is not null;

comment on table public.parco_spese is
  'Le spese di un mezzo o di un''attrezzatura: carburante, manutenzioni, assicurazione... Col fornitore e il numero del documento per l''abbinamento futuro alle fatture.';


-- ── LA COERENZA ─────────────────────────────────────────────────────
-- Mezzo, attrezzatura e fornitore devono essere della stessa azienda
-- della spesa: senza, conoscendo un id, si attaccherebbe una spesa alla
-- cosa di un'altra impresa.
--
-- ⚠️ SUPERATA da `parco-consegne-carburante.sql` (2026-10-02), che
-- aggiunge il controllo su chi ha fatto rifornimento: se si rilancia
-- questo file, dopo va rilanciato quello.

create or replace function public.parco_spese_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  altra uuid;
begin
  if new.mezzo_id is not null then
    select m.org_id into altra from public.mezzi m where m.id = new.mezzo_id;
    if altra is null or altra <> new.org_id then
      raise exception 'Il mezzo non appartiene a questa azienda' using errcode = '42501';
    end if;
  end if;

  if new.attrezzatura_id is not null then
    select a.org_id into altra from public.attrezzature a where a.id = new.attrezzatura_id;
    if altra is null or altra <> new.org_id then
      raise exception 'L''attrezzatura non appartiene a questa azienda' using errcode = '42501';
    end if;
  end if;

  if new.fornitore_id is not null then
    select f.org_id into altra from public.fornitori f where f.id = new.fornitore_id;
    if altra is null or altra <> new.org_id then
      raise exception 'Il fornitore non appartiene a questa azienda' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists parco_spese_controlla on public.parco_spese;
create trigger parco_spese_controlla
  before insert or update on public.parco_spese
  for each row execute function public.parco_spese_controlla();


-- ── CHI PUO' FARE COSA ──────────────────────────────────────────────

drop policy if exists parco_spese_select on public.parco_spese;
create policy parco_spese_select on public.parco_spese
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists parco_spese_write on public.parco_spese;
create policy parco_spese_write on public.parco_spese
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.parco_spese to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: 10 colonne nuove su mezzi, 4 su attrezzature,
-- 2 policy e 1 trigger sulle spese.
select 'colonne mezzi' as cosa, count(*)::text as quanti
from information_schema.columns
where table_schema = 'public' and table_name = 'mezzi'
  and column_name in ('marca', 'modello', 'telaio', 'data_immatricolazione', 'data_acquisto',
                      'compagnia_assicurativa', 'numero_polizza', 'costo_assicurazione',
                      'scadenza_bollo', 'note')
union all
select 'colonne attrezzature', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'attrezzature'
  and column_name in ('compagnia_assicurativa', 'numero_polizza', 'costo_assicurazione',
                      'scadenza_assicurazione')
union all
select 'policy spese', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'parco_spese'
union all
select 'trigger spese', count(*)::text
from pg_trigger
where tgname = 'parco_spese_controlla';
