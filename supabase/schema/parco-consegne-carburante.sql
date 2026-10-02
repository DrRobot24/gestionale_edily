-- =====================================================================
-- MEZZI E ATTREZZATURE: A CHI SONO CONSEGNATI, E LA SCHEDA CARBURANTE
--
-- Chiesto dall'utente il 2026-10-02: «voglio poter segnare a chi e'
-- stata consegnata l'attrezzatura o il mezzo (dall'anagrafica ovviamente
-- devo prendere il dato) [...] ed infine la scheda carburanti».
--
-- Le spese di manutenzione, chieste nello stesso messaggio, c'erano gia':
-- `parco_spese` (`parco-schede-spese.sql`, 2026-09-29), categorie
-- manutenzione / riparazione / pneumatici / revisione / verifica.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── 1. LE CONSEGNE ──────────────────────────────────────────────────
-- Una riga per consegna: COSA (mezzo o attrezzatura), A CHI (una persona
-- dell'anagrafica, `dipendenti`), DAL e — quando torna — AL. La consegna
-- aperta (senza restituzione) dice chi ce l'ha adesso; le chiuse sono lo
-- storico: chi aveva il furgone il giorno della multa, chi il
-- demolitore quando si e' rotto.
--
-- UNA PERSONA ALLA VOLTA: due consegne aperte sulla stessa cosa il
-- database le rifiuta. Prima si segna la restituzione, poi la consegna
-- nuova.
--
-- CANCELLARE una persona o una cosa con consegne non si puo' (`restrict`):
-- lo storico resta, si archivia — come per le spese.
--
-- ── 2. LA SCHEDA CARBURANTE ─────────────────────────────────────────
-- I rifornimenti sono SPESE di categoria `carburante`, nella stessa
-- tabella: cosi' il costo di un mezzo sta in un posto solo e non si
-- conta due volte. Tre colonne nuove, tutte facoltative:
--   litri          solo sul carburante (lo dice un vincolo)
--   contatore      i km del contachilometri per un mezzo, le ore di
--                  lavoro per un'attrezzatura; serve al consumo
--   dipendente_id  chi ha fatto rifornimento, dall'anagrafica
-- La pagina mostra il carburante nella sua scheda e lo toglie dal
-- riquadro Spese.
--
-- CHI: come per le spese, `anagrafiche.write` — Stefania e il titolare.
--
-- ⚠️ Ridefinisce `parco_spese_controlla` (in `parco-schede-spese.sql`)
-- aggiungendo il controllo sulla persona: se si rilancia quel file, dopo
-- va rilanciato questo.
-- =====================================================================


-- ── 1. LE CONSEGNE ──────────────────────────────────────────────────

create table if not exists public.parco_consegne (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  mezzo_id uuid references public.mezzi(id) on delete restrict,
  attrezzatura_id uuid references public.attrezzature(id) on delete restrict,
  dipendente_id uuid not null references public.dipendenti(id) on delete restrict,

  consegnato_il date not null default current_date,
  restituito_il date,
  note text,

  creato_da uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint parco_consegne_una_cosa
    check ((mezzo_id is null) <> (attrezzatura_id is null)),
  constraint parco_consegne_date
    check (restituito_il is null or restituito_il >= consegnato_il)
);

alter table public.parco_consegne enable row level security;

-- Una sola consegna aperta per cosa.
create unique index if not exists parco_consegne_mezzo_aperta
  on public.parco_consegne (mezzo_id)
  where mezzo_id is not null and restituito_il is null;
create unique index if not exists parco_consegne_attrezzatura_aperta
  on public.parco_consegne (attrezzatura_id)
  where attrezzatura_id is not null and restituito_il is null;

create index if not exists parco_consegne_dipendente_idx
  on public.parco_consegne (dipendente_id);

comment on table public.parco_consegne is
  'A chi e'' consegnato un mezzo o un''attrezzatura: dal, al. La consegna senza restituzione dice chi ce l''ha adesso.';

-- Cosa e persona della stessa azienda della consegna.
create or replace function public.parco_consegne_controlla()
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

  select d.org_id into altra from public.dipendenti d where d.id = new.dipendente_id;
  if altra is null or altra <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists parco_consegne_controlla on public.parco_consegne;
create trigger parco_consegne_controlla
  before insert or update on public.parco_consegne
  for each row execute function public.parco_consegne_controlla();

drop policy if exists parco_consegne_select on public.parco_consegne;
create policy parco_consegne_select on public.parco_consegne
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists parco_consegne_write on public.parco_consegne;
create policy parco_consegne_write on public.parco_consegne
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.parco_consegne to authenticated;


-- ── 2. LA SCHEDA CARBURANTE ─────────────────────────────────────────

alter table public.parco_spese
  add column if not exists litri numeric(10,2)
    check (litri is null or litri > 0),
  add column if not exists contatore numeric(12,1)
    check (contatore is null or contatore >= 0),
  add column if not exists dipendente_id uuid
    references public.dipendenti(id) on delete set null;

alter table public.parco_spese drop constraint if exists parco_spese_litri_carburante;
alter table public.parco_spese add constraint parco_spese_litri_carburante
  check (litri is null or categoria = 'carburante');

-- La stessa funzione di `parco-schede-spese.sql`, piu' la persona.
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

  -- ← CARBURANTE: chi ha fatto rifornimento.
  if new.dipendente_id is not null then
    select d.org_id into altra from public.dipendenti d where d.id = new.dipendente_id;
    if altra is null or altra <> new.org_id then
      raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: 2 policy e 1 trigger sulle consegne, 2 indici delle
-- consegne aperte, 3 colonne nuove sulle spese.
select 'policy consegne' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'parco_consegne'
union all
select 'trigger consegne', count(*)::text
from pg_trigger
where tgname = 'parco_consegne_controlla'
union all
select 'indici consegna aperta', count(*)::text
from pg_indexes
where schemaname = 'public'
  and indexname in ('parco_consegne_mezzo_aperta', 'parco_consegne_attrezzatura_aperta')
union all
select 'colonne carburante', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'parco_spese'
  and column_name in ('litri', 'contatore', 'dipendente_id');
