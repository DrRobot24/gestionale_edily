-- =====================================================================
-- LE ATTREZZATURE — tutto quello che lavora in cantiere e non ha targa
--
-- Deciso con l'utente il 2026-09-28: mezzi e attrezzature sono DUE
-- anagrafiche distinte e separate. «Attrezzature sono tutte quelle cose
-- senza targa»: demolitori, betoniere, trabattelli, generatori, flessibili.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── PERCHE' NON DENTRO `mezzi` ──────────────────────────────────────
-- `mezzi` (da wbs-office) e' fatta attorno alla targa: revisione,
-- assicurazione, costo al km. Un demolitore non ha niente di tutto
-- questo, e ha invece cio' che al camion non serve: marca, modello,
-- MATRICOLA — e' quella che distingue due demolitori uguali — e la
-- VERIFICA PERIODICA (ponteggi, apparecchi di sollevamento, impianti
-- elettrici di cantiere). Metterli insieme vorrebbe dire una tabella in
-- cui meta' delle colonne e' sempre vuota per meta' delle righe.
--
-- ── COSA NON C'E' ANCORA, di proposito ──────────────────────────────
-- A chi e' stata consegnata, in quale cantiere si trova, quanto costa
-- l'ora: sono movimenti e storici, non anagrafica. Si aggiungono come
-- tabelle loro quando si decide come si usano — come `mezzo_costi` e
-- `rapportino_mezzi` accanto a `mezzi`.
-- =====================================================================

create table if not exists public.attrezzature (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Il codice interno che l'ufficio scrive sull'etichetta. Facoltativo,
  -- ma unico nell'azienda quando c'e'.
  codice text,
  descrizione text not null check (btrim(descrizione) <> ''),
  -- Testo libero e non un elenco chiuso: le famiglie le decide l'ufficio
  -- (demolizione, sollevamento, elettrico, opere provvisionali…).
  categoria text,
  marca text,
  modello text,
  matricola text,

  -- Come i mezzi: propria o a noleggio, e se a noleggio da chi.
  proprieta text not null default 'propria'
    check (proprieta in ('propria', 'noleggio')),
  fornitore_id uuid references public.fornitori(id) on delete set null,
  data_acquisto date,

  -- La prossima verifica periodica obbligatoria, quando c'e'. Una sola
  -- data e non lo storico: serve a sapere cosa scade, non cosa e' gia'
  -- stato fatto.
  scadenza_verifica date,

  note text,
  attivo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attrezzature enable row level security;

create index if not exists attrezzature_org_idx on public.attrezzature (org_id);

create unique index if not exists attrezzature_codice_uniq
  on public.attrezzature (org_id, lower(codice))
  where codice is not null;

comment on table public.attrezzature is
  'Anagrafica delle attrezzature di cantiere: tutto cio'' che non ha targa. I veicoli stanno in mezzi.';


-- ── LA COERENZA ─────────────────────────────────────────────────────
-- Il fornitore del noleggio dev'essere della stessa azienda: senza, si
-- potrebbe collegare il fornitore di un'altra impresa conoscendone l'id.

create or replace function public.attrezzature_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org_fornitore uuid;
begin
  if new.fornitore_id is not null then
    select f.org_id into org_fornitore
    from public.fornitori f where f.id = new.fornitore_id;

    if org_fornitore is null or org_fornitore <> new.org_id then
      raise exception 'Il fornitore non appartiene a questa azienda'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists attrezzature_controlla on public.attrezzature;
create trigger attrezzature_controlla
  before insert or update on public.attrezzature
  for each row execute function public.attrezzature_controlla();


-- ── CHI PUO' FARE COSA ──────────────────────────────────────────────
-- Come le altre anagrafiche: legge chi ha `anagrafiche.read` (anche il
-- tecnico, che in cantiere deve sapere cosa c'e'), scrive chi tiene i
-- registri (`anagrafiche.write`: Stefania e il titolare).

drop policy if exists attrezzature_select on public.attrezzature;
create policy attrezzature_select on public.attrezzature
  for select using (app.has_perm(org_id, 'anagrafiche.read'));

drop policy if exists attrezzature_write on public.attrezzature;
create policy attrezzature_write on public.attrezzature
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.attrezzature to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire 2 policy e 1 trigger.
select 'policy' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'attrezzature'
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname = 'attrezzature_controlla';
