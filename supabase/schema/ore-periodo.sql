-- =====================================================================
-- Il periodo libero (la settimana E il mese) e le attivita' svolte
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md, "Prossimi passi" punto 1).
-- Va eseguito a mano nel SQL Editor, un blocco alla volta.
--
-- SEGUE `ore-settimana.sql`, che va eseguito prima. Quel file resta
-- com'e': le sue tre funzioni continuano a esistere e a funzionare, e
-- questo ne aggiunge altre invece di riscriverle. Su un database
-- condiviso con wbs-office e senza backup, aggiungere e' sicuro e
-- sostituire no.
--
-- DUE COSE, decise con l'utente il 2026-09-21.
--
-- 1. IL PERIODO LIBERO. La settimana era la scelta giusta per guardare,
--    ma il mese e' il ritmo della firma: `periodi_paga` e'
--    mensile, e le buste paga pure. Invece di una seconda coppia di
--    funzioni "mensili" — che vorrebbe dire due posti dove la stessa
--    regola puo' divergere — le funzioni prendono `p_dal` e `p_al` e il
--    chiamante decide che periodo sia. Una settimana e' un periodo di
--    sette giorni; un mese e' un periodo che comincia il primo.
--
-- 2. LE ATTIVITA' SVOLTE. Chiesto guardando la pagina: «dove sono le
--    descrizioni delle attivita' svolte da ogni singolo operaio oppure
--    direttamente la collocazione, cioe' dove sono stati?».
--
--    Il "dove" c'era gia' (il dettaglio per cantiere). Il "cosa" no, e
--    sta un livello sopra: `rapportini.note` — che nel form si chiama
--    «Descrizione attivita'» — e' UNA per cantiere e per giorno, non
--    una per persona. Il tecnico scrive «gettato il solaio del primo
--    piano», non «Mario ha gettato, Fadera ha portato i secchi».
--
--    Scelta dall'utente (opzione (a)): si porta su la descrizione del
--    CANTIERE, senza chiedere niente di nuovo a chi compila. La colonna
--    `rapportino_ore.mansione` esiste e sarebbe il posto della
--    descrizione per persona, ma il form non la scrive mai: accenderla
--    vorrebbe dire otto campi in piu' al giorno per il tecnico, ed e' lo
--    stesso costo per cui le ore sono uscite dai lavori extra. Se un
--    domani Stefania dira' «mi serve cosa ha fatto LUI, non il
--    cantiere», si accende quella colonna e il modello e' gia' pronto.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. IL TOTALE PER PERSONA, su un periodo qualunque
--
-- Stessa cosa di `ore_settimana`, ma con gli estremi liberi. La
-- validazione del lunedi' sparisce: qui il periodo lo compone il
-- chiamante, e un mese non comincia di lunedi'.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ore_periodo(
  p_org uuid,
  p_dal date,
  p_al  date
)
returns table (
  dipendente_id      uuid,
  nominativo         text,
  matricola          text,
  tipo               text,
  ore_ordinarie      numeric,
  ore_straordinarie  numeric,
  ore_trasferta      numeric,
  ore_assenza        numeric,
  giorni_lavorati    integer,
  assenze            text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere le ore di questo periodo.'
      using errcode = '42501';
  end if;

  if p_al < p_dal then
    raise exception 'Il periodo finisce prima di cominciare: da % a %.', p_dal, p_al
      using errcode = 'P0001';
  end if;

  -- Un tetto al periodo. Senza, una data sbagliata nell'indirizzo puo'
  -- chiedere dieci anni di ore in una volta: la funzione e' `definer` e
  -- non c'e' la RLS a fermare niente.
  if p_al - p_dal > 400 then
    raise exception 'Periodo troppo lungo: % giorni. Al massimo un anno.', p_al - p_dal
      using errcode = 'P0001';
  end if;

  return query
  with ore_unite as (
    select
      o.dipendente_id,
      r.data,
      o.ore_ordinarie,
      o.ore_straordinarie,
      o.ore_trasferta,
      o.ore_assenza,
      o.tipo_assenza
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    where o.org_id = p_org
      and r.data between p_dal and p_al
      and r.stato in ('validato', 'contabilizzato')

    union all

    select
      p.dipendente_id,
      p.data,
      p.ore_ordinarie,
      p.ore_straordinarie,
      0::numeric,
      p.ore_assenza,
      p.tipo_assenza
    from public.ore_personali p
    where p.org_id = p_org
      and p.data between p_dal and p_al
      and p.stato in ('validato', 'contabilizzato')
  )
  select
    d.id,
    (d.cognome || ' ' || d.nome)::text,
    d.matricola,
    d.tipo::text,
    coalesce(sum(u.ore_ordinarie), 0)::numeric,
    coalesce(sum(u.ore_straordinarie), 0)::numeric,
    coalesce(sum(u.ore_trasferta), 0)::numeric,
    coalesce(sum(u.ore_assenza), 0)::numeric,
    count(distinct u.data) filter (
      where u.ore_ordinarie + u.ore_straordinarie > 0
    )::integer,
    string_agg(distinct u.tipo_assenza, ', ')
  from ore_unite u
  join public.dipendenti d on d.id = u.dipendente_id
  group by d.id, d.cognome, d.nome, d.matricola, d.tipo
  having coalesce(sum(
    u.ore_ordinarie + u.ore_straordinarie + u.ore_assenza
  ), 0) > 0
  order by d.cognome, d.nome;
end;
$fn$;

comment on function public.ore_periodo(uuid, date, date) is
  'Ore per persona su un periodo qualunque (la settimana e il mese passano di qui), solo dalle giornate VALIDATE, unendo ore di cantiere e foglio ore personale. Security definer: il perimetro per assegnazione renderebbe il totale incompleto.';

revoke all on function public.ore_periodo(uuid, date, date) from public;
grant execute on function public.ore_periodo(uuid, date, date) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. IL DETTAGLIO, CON LE ATTIVITA' SVOLTE
--
-- Qui sta la novita' vera. Oltre a dove e quanto, si dice COSA e'
-- stato fatto: le descrizioni del cantiere, una per giornata.
--
-- Perche' un array e non una stringa sola.
--
-- In una settimana lo stesso operaio puo' stare tre giorni sullo stesso
-- cantiere, e ogni giorno ha la sua descrizione. Unirle con `string_agg`
-- in un testo solo darebbe un muro di parole senza sapere quale riga sia
-- di quale giorno; unirle senza data e' peggio, perche' in busta paga si
-- discute sempre di UN giorno. Quindi una riga per giorno, con la sua
-- data, e la pagina le impagina come vuole.
--
-- `giorni_attivita` e' un array di oggetti `{data, descrizione}` gia'
-- ordinato per data. PostgREST lo restituisce come JSON.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ore_periodo_cantieri(
  p_org        uuid,
  p_dal        date,
  p_al         date,
  p_dipendente uuid default null
)
returns table (
  dipendente_id      uuid,
  nominativo         text,
  cantiere_id        uuid,
  cantiere_codice    text,
  cantiere           text,
  ore_ordinarie      numeric,
  ore_straordinarie  numeric,
  ore_trasferta      numeric,
  giorni             integer,
  giorni_attivita    jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere il dettaglio di questo periodo.'
      using errcode = '42501';
  end if;

  if p_al < p_dal then
    raise exception 'Il periodo finisce prima di cominciare: da % a %.', p_dal, p_al
      using errcode = 'P0001';
  end if;

  if p_al - p_dal > 400 then
    raise exception 'Periodo troppo lungo: % giorni. Al massimo un anno.', p_al - p_dal
      using errcode = 'P0001';
  end if;

  return query
  select
    d.id,
    (d.cognome || ' ' || d.nome)::text,
    c.id,
    c.codice,
    c.denominazione,
    coalesce(sum(o.ore_ordinarie), 0)::numeric,
    coalesce(sum(o.ore_straordinarie), 0)::numeric,
    coalesce(sum(o.ore_trasferta), 0)::numeric,
    count(distinct r.data)::integer,
    -- Le giornate con cosa si e' fatto, in ordine di data.
    --
    -- `filter` scarta le giornate senza descrizione invece di
    -- lasciarci dentro un oggetto con `descrizione: null`: una riga
    -- vuota in pagina e' rumore, e chi la legge si chiede se sia un
    -- errore. Se nessuna giornata ha una descrizione l'array esce
    -- vuoto, non null, cosi' il frontend non deve distinguere due casi
    -- per dire la stessa cosa.
    --
    -- `nessuna_attivita` NON entra qui: una scheda che dichiara il
    -- cantiere fermo non ha ore, quindi non arriva nemmeno a questa
    -- query. Se ci arrivasse sarebbe un dato incoerente da guardare,
    -- non da nascondere.
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object('data', r.data, 'descrizione', r.note)
      ) filter (where r.note is not null and btrim(r.note) <> ''),
      '[]'::jsonb
    )
  from public.rapportino_ore o
  join public.rapportini r on r.id = o.rapportino_id
  join public.cantieri c on c.id = r.cantiere_id
  join public.dipendenti d on d.id = o.dipendente_id
  where o.org_id = p_org
    and r.data between p_dal and p_al
    and r.stato in ('validato', 'contabilizzato')
    and (p_dipendente is null or o.dipendente_id = p_dipendente)
  group by d.id, d.cognome, d.nome, c.id, c.codice, c.denominazione
  having coalesce(sum(o.ore_ordinarie + o.ore_straordinarie), 0) > 0
  order by d.cognome, d.nome, c.codice;
end;
$fn$;

comment on function public.ore_periodo_cantieri(uuid, date, date, uuid) is
  'Dettaglio per cantiere su un periodo, CON le descrizioni delle attivita'' svolte (rapportini.note, una per giornata). Solo giornate VALIDATE. Il foglio ore personale e'' escluso: quelle ore non hanno un cantiere.';

revoke all on function public.ore_periodo_cantieri(uuid, date, date, uuid) from public;
grant execute on function public.ore_periodo_cantieri(uuid, date, date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 3. COSA NON E' ANCORA ARRIVATO, su un periodo
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.periodo_da_validare(
  p_org uuid,
  p_dal date,
  p_al  date
)
returns table (
  stato      text,
  giornate   integer,
  dal        date,
  al         date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere lo stato di questo periodo.'
      using errcode = '42501';
  end if;

  return query
  select
    s.stato,
    count(distinct s.data)::integer,
    min(s.data),
    max(s.data)
  from (
    -- `::text` su TUTTI E DUE i rami, ed e' obbligatorio: `rapportini.stato`
    -- e' l'enum `rapportino_stato`, `ore_personali.stato` e' testo libero
    -- (difetto noto del progetto, «campi che dovrebbero essere enum e sono
    -- testo libero»). Postgres non unisce un enum e un text e risponde
    -- 42804 «UNION types rapportino_stato and text cannot be matched».
    -- Il cast fuori dalla sottoquery non basta: la UNION si valuta prima.
    select r.data, r.stato::text as stato
    from public.rapportini r
    where r.org_id = p_org
      and r.data between p_dal and p_al
      and r.stato not in ('validato', 'contabilizzato')

    union all

    select p.data, p.stato::text as stato
    from public.ore_personali p
    where p.org_id = p_org
      and p.data between p_dal and p_al
      and p.stato not in ('validato', 'contabilizzato')
  ) s
  group by s.stato
  order by s.stato;
end;
$fn$;

comment on function public.periodo_da_validare(uuid, date, date) is
  'Quante giornate del periodo NON sono ancora validate, per stato. Un totale che sembra completo e non lo e'' finisce in busta paga.';

revoke all on function public.periodo_da_validare(uuid, date, date) from public;
grant execute on function public.periodo_da_validare(uuid, date, date) to authenticated;


-- =====================================================================
-- VERIFICHE — di sola lettura, una alla volta nel SQL Editor.
-- (Il SQL Editor mostra solo il risultato dell'ULTIMA query quando se
--  ne lanciano piu' d'una insieme.)
-- =====================================================================

-- A. Le tre funzioni nuove esistono e sono `definer`.
select p.proname as funzione,
       case when p.prosecdef then 'security definer' else 'SECURITY INVOKER — SBAGLIATO' end as modo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ore_periodo', 'ore_periodo_cantieri', 'periodo_da_validare')
order by p.proname;

-- B. Le descrizioni ci sono davvero? Quante giornate validate hanno una
--    descrizione scritta e quante no.
--
--    Se qui esce "0 con descrizione", la pagina non mostrera' niente
--    sotto i cantieri: non e' un difetto del codice, e' che il tecnico
--    quel campo non lo compila. E quello e' un discorso da fare con lui,
--    non una cosa da risolvere in SQL.
-- select
--   count(*) filter (where note is not null and btrim(note) <> '') as con_descrizione,
--   count(*) filter (where note is null or btrim(note) = '')       as senza,
--   count(*)                                                       as totale
-- from public.rapportini
-- where stato in ('validato', 'contabilizzato');

-- C. Una prova vera su settembre 2026. Sostituire l'uuid.
-- select * from public.ore_periodo('<org-uuid>', '2026-09-01', '2026-09-30');
-- select * from public.ore_periodo_cantieri('<org-uuid>', '2026-09-01', '2026-09-30');
