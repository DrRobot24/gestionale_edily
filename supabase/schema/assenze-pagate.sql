-- =====================================================================
-- QUALI ASSENZE SI PAGANO: IL PANNELLO DEL TITOLARE
--
-- Dall'utente il 2026-10-02, il regolamento del personale di Edily:
--
--   «per quanto riguarda le ferie, l'azienda Edily intende pagarle
--   mentre i permessi no. (Io metterei un toggle in una pagina tipo
--   impostazioni per accenderlo o meno come un piccolo pannello di
--   controllo ovviamente solo per il titolare). Malattia e infortuni
--   infatti sono a discrezione della direzione».
--
-- Fino a oggi la regola era scritta nel codice (`ASSENZE_PAGATE` in
-- `retribuzione.ts`, 2026-09-28): a paga globale ferie E permessi, a
-- giornaliera niente, malattia mai. Diventa una riga per impresa, con
-- un interruttore per motivo e per regime di paga.
--
-- PER REGIME, perche' le due paghe sono decisioni diverse: la giornaliera
-- e' «tariffa per le ore lavorate», e il 2026-09-25 l'utente aveva detto
-- che a tariffa ferie e permessi non si pagano. I valori di partenza
-- sono quelli di oggi corretti dal regolamento: a globale solo le ferie,
-- a giornaliera niente. Il titolare li cambia dalla pagina Impostazioni.
--
-- CONGEDO E «ALTRO» non hanno interruttore: non si pagano, come prima.
--
-- COSA NON CAMBIA: le ore. Qui si decide solo cosa entra nel MATURATO del
-- Riepilogo economico; le ore validate del campo restano quelle. E un
-- mese gia' inviato resta com'e' stato fotografato.
--
-- CHI: la scrive solo il titolare (`org.manage`, che ha solo `owner`);
-- la legge chi fa le paghe (`paghe.read`), perche' il riepilogo lo
-- calcola il browser di Stefania.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
-- =====================================================================

create table if not exists public.assenze_pagate (
  org_id uuid primary key references public.organizations(id) on delete cascade,

  globale_ferie          boolean not null default true,
  globale_permessi       boolean not null default false,
  globale_malattia       boolean not null default false,
  globale_infortunio     boolean not null default false,

  giornaliera_ferie      boolean not null default false,
  giornaliera_permessi   boolean not null default false,
  giornaliera_malattia   boolean not null default false,
  giornaliera_infortunio boolean not null default false,

  aggiornato_da uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.assenze_pagate enable row level security;

comment on table public.assenze_pagate is
  'Quali assenze entrano nel maturato del Riepilogo economico, per regime di paga. La decide il titolare dalla pagina Impostazioni.';

create or replace function public.assenze_pagate_tocca()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.aggiornato_da := auth.uid();
  return new;
end $$;

drop trigger if exists assenze_pagate_tocca on public.assenze_pagate;
create trigger assenze_pagate_tocca
  before insert or update on public.assenze_pagate
  for each row execute function public.assenze_pagate_tocca();

drop policy if exists assenze_pagate_select on public.assenze_pagate;
create policy assenze_pagate_select on public.assenze_pagate
  for select using (
    app.has_perm(org_id, 'paghe.read') or app.has_perm(org_id, 'org.manage')
  );

drop policy if exists assenze_pagate_write on public.assenze_pagate;
create policy assenze_pagate_write on public.assenze_pagate
  for all
  using (app.has_perm(org_id, 'org.manage'))
  with check (app.has_perm(org_id, 'org.manage'));

grant select, insert, update, delete on public.assenze_pagate to authenticated;


-- ── LA RIGA DI EDILY, coi valori di partenza ────────────────────────
-- Se c'e' gia' (il titolare ha gia' scelto), non si tocca.

insert into public.assenze_pagate (org_id)
select o.id
from public.organizations o
where o.id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
on conflict (org_id) do nothing;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: 2 policy, 1 trigger, e la riga di Edily con le sole
-- ferie a paga globale accese (finche' il titolare non cambia).

select 'policy' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'assenze_pagate'
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname = 'assenze_pagate_tocca';

select o.ragione_sociale, p.*
from public.assenze_pagate p
join public.organizations o on o.id = p.org_id;
