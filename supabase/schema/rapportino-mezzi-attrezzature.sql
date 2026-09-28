-- =====================================================================
-- MEZZI E ATTREZZATURE NEL RAPPORTINO
--
-- Chiesto dall'utente il 2026-09-28: «visto che esiste la tabella di
-- mezzi e attrezzature, mettimela disponibile per l'inserimento nel
-- rapportino. Un piccolo box dove si possono inserire».
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno. SEGUE `attrezzature.sql`.
--
-- ── DUE TABELLE, come le anagrafiche ────────────────────────────────
-- `rapportino_mezzi` c'e' gia', da wbs-office: mezzo, ore di utilizzo,
-- km, note. Qui nasce la gemella per le attrezzature, senza km — un
-- demolitore non ne fa. Due anagrafiche separate, due righe separate:
-- una sola tabella con due chiavi, una sempre vuota, direbbe il
-- contrario di cio' che si e' deciso.
--
-- ── LE REGOLE SONO QUELLE DELLE FOTO (`rapportino-foto.sql`) ────────
-- Si vede cio' che sta nei cantieri propri. Si aggiunge solo su una
-- scheda ancora in compilazione (bozza o respinta): dopo l'invio il
-- rapportino e' un documento consegnato. Si toglie finche' la scheda e'
-- di chi la scrive, o se si valida.
-- =====================================================================


-- ── 1. LA TABELLA DELLE ATTREZZATURE USATE ──────────────────────────

create table if not exists public.rapportino_attrezzature (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- `restrict` come le sorelle: il rapportino e' un documento, e una
  -- cascata silenziosa e' peggio di un errore. Il gestionale cancella
  -- prima i figli (`useEliminaRapportino`).
  rapportino_id uuid not null references public.rapportini(id) on delete restrict,
  attrezzatura_id uuid not null references public.attrezzature(id) on delete restrict,
  ore_utilizzo numeric(5,2) not null default 0
    check (ore_utilizzo >= 0 and ore_utilizzo <= 24),
  note text,
  created_at timestamptz not null default now(),

  -- La stessa attrezzatura due volte nella stessa scheda non vuol dire
  -- niente: si corregge la riga che c'e'.
  constraint rapportino_attrezzature_uniq unique (rapportino_id, attrezzatura_id)
);

alter table public.rapportino_attrezzature enable row level security;

create index if not exists rapportino_attrezzature_rapportino_idx
  on public.rapportino_attrezzature (rapportino_id);
create index if not exists rapportino_attrezzature_org_idx
  on public.rapportino_attrezzature (org_id);

comment on table public.rapportino_attrezzature is
  'Le attrezzature usate in una giornata di cantiere, riga del rapportino. Gemella di rapportino_mezzi.';


-- ── 2. LA COERENZA ──────────────────────────────────────────────────
-- Rapportino e attrezzatura devono essere dell'azienda scritta nella
-- riga: senza, conoscendo un id si collegherebbe l'attrezzatura di
-- un'altra impresa.

create or replace function public.rapportino_attrezzature_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org_rapportino uuid;
  org_attrezzatura uuid;
begin
  select r.org_id into org_rapportino from public.rapportini r where r.id = new.rapportino_id;
  select a.org_id into org_attrezzatura from public.attrezzature a where a.id = new.attrezzatura_id;

  if org_rapportino is distinct from new.org_id or org_attrezzatura is distinct from new.org_id then
    raise exception 'Rapportino e attrezzatura devono essere di questa azienda'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists rapportino_attrezzature_controlla on public.rapportino_attrezzature;
create trigger rapportino_attrezzature_controlla
  before insert or update on public.rapportino_attrezzature
  for each row execute function public.rapportino_attrezzature_controlla();


-- ── 3. CHI PUO' FARE COSA — rapportino_attrezzature ─────────────────

drop policy if exists rapportino_attrezzature_select on public.rapportino_attrezzature;
create policy rapportino_attrezzature_select on public.rapportino_attrezzature
  for select using (
    app.has_perm(org_id, 'rapportini.read_all')
    or exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and app.puo_vedere_cantiere(r.cantiere_id)
    )
  );

drop policy if exists rapportino_attrezzature_insert on public.rapportino_attrezzature;
create policy rapportino_attrezzature_insert on public.rapportino_attrezzature
  for insert with check (
    app.has_perm(org_id, 'rapportini.create')
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and app.puo_vedere_cantiere(r.cantiere_id)
        and r.stato in ('bozza', 'respinto')
    )
  );

drop policy if exists rapportino_attrezzature_delete on public.rapportino_attrezzature;
create policy rapportino_attrezzature_delete on public.rapportino_attrezzature
  for delete using (
    app.has_perm(org_id, 'rapportini.validate')
    or exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and r.compilato_da = auth.uid()
        and r.stato in ('bozza', 'respinto')
    )
  );

grant select, insert, delete on public.rapportino_attrezzature to authenticated;


-- ── 4. rapportino_mezzi: LE POLICY, SE NON CE NE SONO ───────────────
-- La tabella viene da wbs-office e non si sa con certezza cosa abbia.
-- Se ha gia' delle policy NON si toccano (come per le foto): si leggono
-- nella verifica qui sotto e si decide a mano. Se non ne ha, con la RLS
-- accesa nessuno potrebbe scriverci: si mettono le stesse di sopra.

alter table public.rapportino_mezzi enable row level security;

do $blocco$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rapportino_mezzi'
  ) then
    raise notice 'rapportino_mezzi ha gia'' delle policy: non le tocco.';
    return;
  end if;

  execute $p$
    create policy rapportino_mezzi_select on public.rapportino_mezzi
      for select using (
        app.has_perm(org_id, 'rapportini.read_all')
        or exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and app.puo_vedere_cantiere(r.cantiere_id)
        )
      )
  $p$;

  execute $p$
    create policy rapportino_mezzi_insert on public.rapportino_mezzi
      for insert with check (
        app.has_perm(org_id, 'rapportini.create')
        and exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and app.puo_vedere_cantiere(r.cantiere_id)
            and r.stato in ('bozza', 'respinto')
        )
      )
  $p$;

  execute $p$
    create policy rapportino_mezzi_delete on public.rapportino_mezzi
      for delete using (
        app.has_perm(org_id, 'rapportini.validate')
        or exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and r.compilato_da = auth.uid()
            and r.stato in ('bozza', 'respinto')
        )
      )
  $p$;

  raise notice 'Create le tre policy su rapportino_mezzi.';
end
$blocco$;

grant select, insert, delete on public.rapportino_mezzi to authenticated;


-- ── 5. VERIFICA ─────────────────────────────────────────────────────
-- Tutte le policy delle due tabelle, con cosa controllano. Per
-- rapportino_attrezzature devono essere _select, _insert, _delete. Per
-- rapportino_mezzi: le stesse tre se il blocco 4 le ha create, oppure
-- quelle che c'erano — in quel caso incollale in chat.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('rapportino_attrezzature', 'rapportino_mezzi')
order by tablename, policyname;
