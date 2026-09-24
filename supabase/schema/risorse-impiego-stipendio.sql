-- =====================================================================
-- RISORSE: data di impiego e stipendio pattuito
--
-- Chiesto dall'utente il 2026-09-24, per l'elenco delle risorse:
-- «Cognome, Nome, Mansione, Data di impiego, Data di assunzione,
-- Importo stipendio (se disp.), Costo orario (se disp.)».
--
-- ── 1. LA DATA DI IMPIEGO NON E' LA DATA DI ASSUNZIONE ──────────────
-- Parole dell'utente: «non ci puo' essere assunzione senza impiego ma
-- impiego senza assunzione si'. E' possibile avere un operaio impiegato,
-- quindi in prova, senza avere contratto regolare di assunzione».
--
-- L'impiego e' il primo giorno di lavoro vero; l'assunzione e' il
-- contratto, che puo' arrivare dopo. La regola va nel database:
--
--   * assunzione senza impiego → l'impiego si riempie da solo con la
--     data di assunzione (un trigger, non un rifiuto: wbs-office o un
--     vecchio modulo che scrive solo l'assunzione non si rompe);
--   * impiego DOPO l'assunzione → rifiutato da un check.
--
-- ── 2. LO STIPENDIO STA IN UNA TABELLA SUA ──────────────────────────
-- Non una colonna di `dipendenti`, e il motivo e' chi legge: la
-- tabella `dipendenti` la legge anche il tecnico (`anagrafiche.read`,
-- gli serve per la squadra del rapportino). Una colonna li' sarebbe
-- nascosta dall'interfaccia ma leggibile da chiunque interroghi le API.
-- In una tabella sua la RLS la chiude su `paghe.read`: Stefania e il
-- titolare.
--
-- CON LO STORICO, come le tariffe: lo stipendio pattuito cambia (scatti,
-- rinnovi, passaggi di livello) e non si sovrascrive, si aggiunge una
-- riga con la data da cui vale. Vale quello piu' recente gia' iniziato.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend che le
-- legge. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1a. LA COLONNA ──────────────────────────────────────────────────

alter table public.dipendenti
  add column if not exists data_impiego date;

comment on column public.dipendenti.data_impiego is
  'Primo giorno di lavoro. Puo'' precedere data_assunzione (prova, da inquadrare), mai seguirla.';


-- ── 1b. LE RIGHE CHE CI SONO GIA' ───────────────────────────────────
-- Chi ha una data di assunzione e nessuna di impiego: la si copia. E'
-- l'unica cosa che si sa per certo, e la si puo' anticipare dalla
-- scheda quando si conosce il giorno vero.

update public.dipendenti
set data_impiego = data_assunzione
where data_impiego is null
  and data_assunzione is not null;


-- ── 1c. IL TRIGGER E IL CHECK ───────────────────────────────────────

create or replace function public.dipendenti_impiego_da_assunzione()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_impiego is null and new.data_assunzione is not null then
    new.data_impiego := new.data_assunzione;
  end if;
  return new;
end $$;

drop trigger if exists dipendenti_impiego_da_assunzione on public.dipendenti;
create trigger dipendenti_impiego_da_assunzione
  before insert or update on public.dipendenti
  for each row execute function public.dipendenti_impiego_da_assunzione();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendenti_impiego_prima_di_assunzione'
      and conrelid = 'public.dipendenti'::regclass
  ) then
    alter table public.dipendenti
      add constraint dipendenti_impiego_prima_di_assunzione
      check (data_impiego is null or data_assunzione is null
             or data_impiego <= data_assunzione);
  end if;
end $$;


-- ── 2a. LA TABELLA DEGLI STIPENDI ───────────────────────────────────

create table if not exists public.dipendente_stipendi (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,

  valido_dal date not null,
  -- Mensile, in euro. Quello pattuito: non il netto del cedolino, che
  -- cambia ogni mese e sta in `buste_paga`.
  importo_mensile numeric(10,2) not null check (importo_mensile > 0),
  note text,

  created_at timestamptz not null default now(),

  -- Due stipendi che partono lo stesso giorno: quale vale? Nessuno dei
  -- due, e quindi non si lascia scrivere.
  constraint dipendente_stipendi_uniq unique (dipendente_id, valido_dal)
);

alter table public.dipendente_stipendi enable row level security;

create index if not exists dipendente_stipendi_org_idx
  on public.dipendente_stipendi (org_id);

comment on table public.dipendente_stipendi is
  'Stipendio mensile pattuito, con storico per data. Letto solo da chi ha paghe.read: la tabella dipendenti la legge anche il tecnico.';


-- ── 2b. LA COERENZA ─────────────────────────────────────────────────
-- La persona dev'essere dell'azienda scritta nella riga: senza, chi fa
-- le paghe in un'impresa potrebbe scrivere lo stipendio di una persona
-- di un'altra, se ne conosce l'id.

create or replace function public.dipendente_stipendi_controlla()
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
  return new;
end $$;

drop trigger if exists dipendente_stipendi_controlla on public.dipendente_stipendi;
create trigger dipendente_stipendi_controlla
  before insert or update on public.dipendente_stipendi
  for each row execute function public.dipendente_stipendi_controlla();


-- ── 2c. CHI PUO' FARE COSA ──────────────────────────────────────────
-- Legge chi fa le paghe (`paghe.read`). Scrive chi fa le paghe E tiene
-- le anagrafiche: alla Edily Stefania e il titolare. Niente UPDATE,
-- come le tariffe: uno stipendio cambiato si scrive come riga nuova
-- con la sua data. Si puo' CANCELLARE una riga inserita per sbaglio.

drop policy if exists dipendente_stipendi_select on public.dipendente_stipendi;
create policy dipendente_stipendi_select on public.dipendente_stipendi
  for select using (app.has_perm(org_id, 'paghe.read'));

drop policy if exists dipendente_stipendi_insert on public.dipendente_stipendi;
create policy dipendente_stipendi_insert on public.dipendente_stipendi
  for insert with check (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  );

drop policy if exists dipendente_stipendi_delete on public.dipendente_stipendi;
create policy dipendente_stipendi_delete on public.dipendente_stipendi
  for delete using (
    app.has_perm(org_id, 'paghe.read') and app.has_perm(org_id, 'anagrafiche.write')
  );

grant select, insert, delete on public.dipendente_stipendi to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- L'SQL Editor mostra solo l'ultimo risultato: questa query li mette
-- tutti in una tabella. Devono esserci 3 policy, 2 trigger e 1 check,
-- e «senza impiego» deve valere ZERO.

select 'policy' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'dipendente_stipendi'
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname in ('dipendenti_impiego_da_assunzione', 'dipendente_stipendi_controlla')
union all
select 'check', count(*)::text
from pg_constraint
where conname = 'dipendenti_impiego_prima_di_assunzione'
union all
select 'assunti senza impiego', count(*)::text
from public.dipendenti
where data_assunzione is not null and data_impiego is null;
