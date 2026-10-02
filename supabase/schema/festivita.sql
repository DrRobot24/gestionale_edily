-- =====================================================================
-- IL CALENDARIO DELLE FESTIVITA': PATRONO, E L'INVIO DEI GIORNI DI FESTA
--
-- Scritto il 2026-10-02. Chiesto dall'utente la sera del 25 settembre e
-- rimandato di proposito; la parte della tariffa e' fatta dal 28/09
-- (`eLavorabile` in `src/lib/giorni.ts`). Qui la regola arriva anche al
-- database, dove l'invio della giornata conta cosa e' dovuto.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
--
-- ── 1. IL PATRONO, UNA DATA PER IMPRESA ─────────────────────────────
-- Deciso con l'utente il 2026-10-02: un giorno e un mese nei dati
-- dell'azienda, scritti da chi tiene le anagrafiche, validi per tutti i
-- cantieri. Il CCNL edile parla del patrono del luogo di lavoro, ma per
-- un'impresa che lavora in zona e' quasi sempre lo stesso.
--
-- UNA TABELLA SUA e non una colonna su `organizations`: quella tabella
-- e' di wbs-office e la scrive solo chi gestisce l'organizzazione, mentre
-- il patrono lo scrive Stefania (`anagrafiche.write`). La LEGGE chiunque
-- sia dell'impresa: servono al tecnico i calendari giusti.
--
-- ── 2. LE FESTIVITA', CALCOLATE COME NEL FRONTEND ───────────────────
-- Dieci date fisse, Pasquetta (dal calcolo della Pasqua, stesso
-- algoritmo di `pasqua()` in `giorni.ts`) e il patrono. Nessuna tabella
-- da riempire ogni anno. ⚠️ Se cambia l'elenco qui, cambia anche
-- `FISSE` in `src/lib/giorni.ts`: frontend e database devono dire la
-- stessa cosa sullo stesso giorno.
--
-- ── 3. L'INVIO NEI GIORNI NON LAVORATIVI ────────────────────────────
-- Deciso con l'utente il 2026-10-02: di sabato, di domenica e nei
-- festivi si manda SOLO CIO' CHE E' SCRITTO. Prima la funzione trattava
-- ogni giorno come un lunedi', e un sabato lavorato non poteva partire:
-- pretendeva le schede di tutti i cantieri assegnati, tutti gli operai
-- collocati (gli altri da segnare assenti, in un giorno in cui nessuno
-- doveva esserci) e le otto ore a testa.
--
-- Nei giorni non lavorativi quindi saltano i passi 1-4 — cantieri
-- mancanti, ore di chi compila, operai dimenticati, ore da contratto.
-- Restano le respinte (passo 5). Le ore di quei giorni le giudica il
-- titolare nelle celle gialle del foglio presenze (`ore_pagate`), come
-- gia' fa per il sabato.
--
-- La funzione si ricrea INTERA: e' copiata da `orario-contrattuale.sql`,
-- che era la versione in vigore, e cambia solo nei punti segnati con
-- «← FESTIVI». ⚠️ Da qui in poi rieseguire `orario-contrattuale.sql` o
-- `assenze.sql` la riporterebbe indietro: dopo, va rilanciato questo.
-- =====================================================================


-- ── 1. IL PATRONO ───────────────────────────────────────────────────

create table if not exists public.azienda_calendario (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  -- «MM-GG», come le chiavi di `FISSE` in `giorni.ts`. Senza anno: il
  -- patrono torna uguale tutti gli anni.
  patrono text
    check (patrono is null
           or patrono ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  -- Il nome del santo, facoltativo: «San Gennaro» dice di piu' di
  -- «Santo patrono» nei calendari.
  patrono_nome text,
  aggiornato_da uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.azienda_calendario enable row level security;

comment on table public.azienda_calendario is
  'Il calendario dell''impresa: per ora il santo patrono, che si somma alle festivita'' nazionali calcolate in app.festivita().';

create or replace function public.azienda_calendario_tocca()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.aggiornato_da := auth.uid();
  return new;
end $$;

drop trigger if exists azienda_calendario_tocca on public.azienda_calendario;
create trigger azienda_calendario_tocca
  before insert or update on public.azienda_calendario
  for each row execute function public.azienda_calendario_tocca();

drop policy if exists azienda_calendario_select on public.azienda_calendario;
create policy azienda_calendario_select on public.azienda_calendario
  for select using (app.is_member(org_id));

drop policy if exists azienda_calendario_write on public.azienda_calendario;
create policy azienda_calendario_write on public.azienda_calendario
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.azienda_calendario to authenticated;


-- ── 2. LE FESTIVITA' ────────────────────────────────────────────────

-- La domenica di Pasqua (calendario gregoriano, Meeus/Jones/Butcher).
-- Stesso calcolo di `pasqua()` in `giorni.ts`, riga per riga: le
-- divisioni fra interi in Postgres troncano come `Math.floor` sui
-- positivi, e qui sono tutti positivi.
create or replace function app.pasqua(p_anno integer)
returns date
language plpgsql
immutable
as $$
declare
  a integer := p_anno % 19;
  b integer := p_anno / 100;
  c integer := p_anno % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(
    p_anno,
    (h + l - 7 * m + 114) / 31,
    ((h + l - 7 * m + 114) % 31) + 1
  );
end $$;

-- Il nome della festivita' di quel giorno per quell'impresa, o null.
-- Security invoker: il patrono lo legge chiunque sia dell'impresa.
create or replace function app.festivita(p_org uuid, p_giorno date)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    case to_char(p_giorno, 'MM-DD')
      when '01-01' then 'Capodanno'
      when '01-06' then 'Epifania'
      when '04-25' then 'Festa della Liberazione'
      when '05-01' then 'Festa dei lavoratori'
      when '06-02' then 'Festa della Repubblica'
      when '08-15' then 'Ferragosto'
      when '11-01' then 'Ognissanti'
      when '12-08' then 'Immacolata'
      when '12-25' then 'Natale'
      when '12-26' then 'Santo Stefano'
    end,
    case
      when p_giorno = app.pasqua(extract(year from p_giorno)::integer) + 1
        then 'Lunedì dell’Angelo'
    end,
    (
      select coalesce(nullif(trim(c.patrono_nome), ''), 'Santo patrono')
      from public.azienda_calendario c
      where c.org_id = p_org
        and c.patrono = to_char(p_giorno, 'MM-DD')
    )
  );
$$;

-- Dal lunedi' al venerdi', e non festivo: il giorno in cui si aspetta
-- il lavoro. E' `eLavorabile` di `giorni.ts`.
create or replace function app.giorno_lavorabile(p_org uuid, p_giorno date)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select extract(isodow from p_giorno) < 6
     and app.festivita(p_org, p_giorno) is null;
$$;


-- ── 3. L'INVIO DELLA GIORNATA ───────────────────────────────────────

create or replace function public.invia_foglio_giornata(p_org uuid, p_giorno date)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  mancanti       integer;
  da_correggere  integer;
  inviate        integer;
  mio_dipendente uuid;
  mie_ore        numeric;
  guai           text;
  quanti         integer;
  dimenticati    text;
  quanti_fuori   integer;
  -- ← FESTIVI
  lavorabile     boolean := app.giorno_lavorabile(p_org, p_giorno);
begin
  -- ← FESTIVI: i passi 1-4 dicono cosa e' DOVUTO quel giorno. Di sabato,
  -- di domenica e nei festivi non e' dovuto niente, e si manda solo cio'
  -- che e' scritto: vedi la testata del file.
  if lavorabile then

    -- 1. OGNI CANTIERE ASSEGNATO QUEL GIORNO HA LA SUA SCHEDA
    --
    -- Il principio (utente, 2026-09-23): «il tecnico deve rapportare SOLO
    -- quando il titolare gli assegna quel cantiere, e nelle date in cui e'
    -- stato assegnato». Quindi si contano i cantieri assegnati a CHI
    -- INVIA in quella data — `dal`/`al` di `cantiere_assegnazioni`, anche
    -- retroattivi — e gia' aperti. E' la stessa regola delle card e del
    -- calendario in home (`cantiereAtteso`): prima qui c'erano tutti gli
    -- attivi visibili oggi, e l'invio poteva chiedere schede che nessuna
    -- card mostrava.
    select count(*) into mancanti
    from public.cantieri c
    where c.org_id = p_org
      and c.stato = 'attivo'
      and (c.data_inizio is null or c.data_inizio <= p_giorno)
      and (c.data_fine_effettiva is null or c.data_fine_effettiva >= p_giorno)
      and exists (
        select 1
        from public.cantiere_assegnazioni a
        where a.cantiere_id = c.id
          and a.user_id = auth.uid()
          and a.dal <= p_giorno
          and (a.al is null or a.al >= p_giorno)
      )
      and not exists (
        select 1
        from public.rapportini r
        where r.cantiere_id = c.id
          and r.data = p_giorno
      );

    if mancanti > 0 then
      raise exception '%',
        case when mancanti = 1
          then 'Manca una scheda. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.'
          else format('Mancano %s schede. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.', mancanti)
        end
        using errcode = 'P0001';
    end if;

    -- 2. CHI COMPILA HA SCRITTO LE PROPRIE ORE (o e' assente)
    select d.id into mio_dipendente
    from public.dipendenti d
    where d.org_id = p_org
      and d.user_id = auth.uid()
    limit 1;

    if mio_dipendente is not null then
      select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
        into mie_ore
      from public.rapportino_ore o
      join public.rapportini r on r.id = o.rapportino_id
      where o.org_id = p_org
        and r.data = p_giorno
        and o.dipendente_id = mio_dipendente;

      if mie_ore = 0 then
        select coalesce(sum(p.ore_ordinarie + p.ore_straordinarie + p.ore_assenza), 0)
          into mie_ore
        from public.ore_personali p
        where p.org_id = p_org
          and p.data = p_giorno
          and p.dipendente_id = mio_dipendente;
      end if;

      -- ← ASSENZE: chi compila e' segnato assente. Succede quando e' lui
      -- a mancare e qualcuno manda la giornata con la sua utenza.
      if mie_ore = 0 and exists (
        select 1 from public.assenze a
        where a.org_id = p_org
          and a.data = p_giorno
          and a.dipendente_id = mio_dipendente
      ) then
        mie_ore := 8;
      end if;

      if mie_ore = 0 then
        raise exception 'Mancano le tue ore di oggi. Compilale in «Le mie ore», oppure aggiungiti alla squadra del cantiere dove hai lavorato: una giornata senza chi l''ha scritta non e'' la giornata.'
          using errcode = 'P0001';
      end if;
    end if;

    -- 3. NESSUN OPERAIO E' RIMASTO FUORI
    select
      string_agg(format('· %s', (d.cognome || ' ' || d.nome)), E'\n' order by d.cognome, d.nome),
      count(*)
    into dimenticati, quanti_fuori
    from public.dipendenti d
    where d.org_id = p_org
      and d.attivo
      and d.tipo = 'operaio'
      -- IN SERVIZIO quel giorno (2026-09-25): conta la messa in servizio,
      -- non l'assunzione — si lavora anche in prova, senza contratto. Chi
      -- non ha la data di servizio non e' in forza e non si pretende.
      and d.data_impiego is not null
      and d.data_impiego <= p_giorno
      and (d.data_cessazione is null or d.data_cessazione >= p_giorno)
      and not exists (
        select 1
        from public.rapportino_ore o
        join public.rapportini r on r.id = o.rapportino_id
        where o.org_id = p_org
          and r.data = p_giorno
          and o.dipendente_id = d.id
          and (o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza) > 0
      )
      and not exists (
        select 1
        from public.giustificazioni_ore g
        where g.org_id = p_org
          and g.data = p_giorno
          and g.dipendente_id = d.id
      )
      -- ← ASSENZE: segnato assente con il motivo, quindi collocato.
      and not exists (
        select 1
        from public.assenze a
        where a.org_id = p_org
          and a.data = p_giorno
          and a.dipendente_id = d.id
      );

    if quanti_fuori > 0 then
      raise exception '%',
        format(
          E'%s\n\n%s\n\nOgni operaio in forza deve avere una collocazione: le ore del cantiere dove ha lavorato, oppure l''assenza col suo motivo (ferie, permesso, malattia) nel riquadro «Assenti» della giornata.',
          case when quanti_fuori = 1
            then 'Una persona non e'' su nessuna scheda.'
            else format('%s persone non sono su nessuna scheda.', quanti_fuori)
          end,
          dimenticati
        )
        using errcode = 'P0001';
    end if;

    -- 4. IL CONTROLLO DELLE ORE DA CONTRATTO
    --
    -- Otto per chi e' a tempo pieno, meno per un part-time (2026-09-25):
    -- il metro di ognuno e' `app.ore_contratto`, alla data della giornata.
    -- Prima era un 8 fisso, e un part-time da quattro ore avrebbe fermato
    -- l'invio tutti i giorni.
    select
      string_agg(
        format('· %s: %s%s',
          g.nominativo,
          case
            when g.ore_ordinarie > app.ore_contratto(g.dipendente_id, p_giorno) then
              format('%s oltre le %s da dichiarare come straordinario',
                     public.ore_in_lettere(g.ore_ordinarie - app.ore_contratto(g.dipendente_id, p_giorno)),
                     trim_scale(app.ore_contratto(g.dipendente_id, p_giorno)))
            else
              format('%s in meno delle %s, segna il motivo (permesso, malattia, ferie)',
                     public.ore_in_lettere(app.ore_contratto(g.dipendente_id, p_giorno) - (g.ore_ordinarie + g.ore_assenza)),
                     trim_scale(app.ore_contratto(g.dipendente_id, p_giorno)))
          end,
          case
            when (g.ore_ordinarie + g.ore_straordinarie) - g.ore_visibili > 0 then
              format(' (%s su cantieri non tuoi: sentile con chi li segue)',
                     public.ore_in_lettere((g.ore_ordinarie + g.ore_straordinarie) - g.ore_visibili))
            else ''
          end
        ),
        E'\n' order by g.nominativo
      ),
      count(*)
    into guai, quanti
    from public.ore_giornata(p_org, p_giorno) g
    where
      not exists (
        select 1
        from public.giustificazioni_ore gi
        where gi.org_id = p_org
          and gi.data = p_giorno
          and gi.dipendente_id = g.dipendente_id
      )
      and (
        g.ore_ordinarie > app.ore_contratto(g.dipendente_id, p_giorno)
        or (
          g.ore_ordinarie + g.ore_assenza < app.ore_contratto(g.dipendente_id, p_giorno)
          and not (g.assenze is not null and g.ore_assenza = 0)
        )
      );

    if quanti > 0 then
      raise exception '%',
        format(
          E'%s\n\n%s\n\nIl conto e'' sulla persona e sulla giornata, su tutti i cantieri: non sul singolo rapportino. Sistema le ore, oppure scrivi il motivo dal riquadro «Controllo delle ore» in home.',
          case when quanti = 1
            then 'Le ore di una persona non tornano.'
            else format('Le ore di %s persone non tornano.', quanti)
          end,
          guai
        )
        using errcode = 'P0001';
    end if;

  end if;  -- ← FESTIVI

  -- 5. NIENTE SCHEDE RESPINTE, POI SI MANDA
  select count(*) into da_correggere
  from public.rapportini r
  where r.org_id = p_org
    and r.data = p_giorno
    and r.stato = 'respinto';

  if da_correggere > 0 then
    raise exception '%',
      case when da_correggere = 1
        then 'Una scheda e'' tornata indietro da correggere. Sistemala prima di rimandare la giornata.'
        else format('%s schede sono tornate indietro da correggere. Sistemale prima di rimandare la giornata.', da_correggere)
      end
      using errcode = 'P0001';
  end if;

  update public.rapportini r
  set stato = 'inviato',
      inviato_at = now()
  where r.org_id = p_org
    and r.data = p_giorno
    and r.stato = 'bozza';

  get diagnostics inviate = row_count;
  return inviate;
end;
$fn$;


-- ── 4. IL PATRONO DI EDILY: SANTA LUCIA, 13 DICEMBRE ────────────────
-- Dall'utente il 2026-10-02: «il giorno considerato come Festa Patronale
-- qua a Siracusa e' il 13 Dicembre, Santa Lucia. Quindi questo e' un
-- giorno festivo e va trattato contabilmente come tale». Si cambia poi
-- dalla pagina Festivita'. L'id e' quello di Edily, lo stesso degli
-- altri file (`pulizia-dati-prova.sql`).

insert into public.azienda_calendario (org_id, patrono, patrono_nome)
select o.id, '12-13', 'Santa Lucia'
from public.organizations o
where o.id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
on conflict (org_id) do update
  set patrono = excluded.patrono,
      patrono_nome = excluded.patrono_nome;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: 2 policy e 1 trigger sul calendario, e le tre funzioni.
select 'policy calendario' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename = 'azienda_calendario'
union all
select 'trigger calendario', count(*)::text
from pg_trigger
where tgname = 'azienda_calendario_tocca'
union all
select 'funzioni festivita', count(*)::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app' and p.proname in ('pasqua', 'festivita', 'giorno_lavorabile');

-- Le date di prova, senza patrono. Attese: Pasqua 2026 = 5 aprile,
-- 2027 = 28 marzo; lunedi' 6 aprile 2026 Pasquetta (non lavorabile);
-- martedi' 8 dicembre 2026 Immacolata (non lavorabile); giovedi'
-- 1 ottobre 2026 lavorabile; sabato 3 ottobre 2026 non lavorabile.
select app.pasqua(2026) as pasqua_2026, app.pasqua(2027) as pasqua_2027;

select g::date as giorno,
       app.festivita(null, g::date) as festa,
       app.giorno_lavorabile(null, g::date) as lavorabile
from unnest(array['2026-04-06', '2026-12-08', '2026-10-01', '2026-10-03']) as g;

-- Il patrono di Edily. Attesa una riga: «Santa Lucia», 12-13, e il
-- lunedi' 13 dicembre 2027 non lavorabile (nel 2026 cade di domenica).
select o.ragione_sociale, c.patrono, c.patrono_nome,
       app.festivita(c.org_id, '2027-12-13') as festa_2027,
       app.giorno_lavorabile(c.org_id, '2027-12-13') as lavorabile_2027
from public.azienda_calendario c
join public.organizations o on o.id = c.org_id;
