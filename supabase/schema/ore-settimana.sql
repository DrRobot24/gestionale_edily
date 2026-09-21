-- =====================================================================
-- Le ore della settimana, per persona e per cantiere
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md, "Prossimi passi" punto 1).
-- Va eseguito a mano nel SQL Editor, un blocco alla volta.
--
-- A cosa serve. Dal 2026-09-15 i rapportini sono usciti dal menu
-- dell'amministrazione, e da allora Stefania non ha nessuna strada per
-- leggere le ore che deve elaborare: e' un buco aperto da noi. Questa
-- funzione lo chiude.
--
-- Il rapportino e' il documento della giornata di UN cantiere. Questa e'
-- l'altro capo del flusso: la riga di UNA PERSONA su una settimana. Non
-- e' l'elenco dei rapportini con un filtro sopra.
--
-- Le tre decisioni dell'utente (2026-09-21), che qui diventano codice:
--
--   1. SI GUARDA PER SETTIMANA. Il mese resta il ritmo della firma
--      (vedi `periodi_paga`), la settimana e' il ritmo del controllo.
--   2. SOLO LE ORE VALIDATE dal titolare. E' il senso del flusso: il
--      titolare e' un filtro, non un passacarte. Se l'amministrazione
--      lavorasse anche sulle bozze, il suo giudizio sarebbe decorativo.
--   3. IL DETTAGLIO PER CANTIERE SOTTO OGNI PERSONA, che non e' una
--      colonna in piu': e' la stessa riga letta in tre direzioni
--      (busta paga / storico cantiere / storico della risorsa).
--
-- Perche' due funzioni e non una vista.
--
-- `v_ore_giornaliere` avrebbe quasi tutto, ma e' `security_invoker=on`
-- come tutte le sette viste (verificato il 2026-09-10): mostrerebbe solo
-- i cantieri nel perimetro di chi legge. Per Stefania, che i cantieri
-- non li ha assegnati, il totale sarebbe ZERO o monco — un numero
-- sbagliato che si presenta come giusto, che e' peggio di un numero che
-- manca. E' la stessa ragione per cui il controllo delle 8 ore passa da
-- `ore_giornata()`. Quindi `security definer`, con il cancello riscritto
-- a mano perche' `definer` spegne la RLS.
--
-- Perche' le ore si prendono da DUE tabelle.
--
-- Chi va in cantiere ha le ore in `rapportino_ore`, legate a un
-- cantiere. Il tecnico e l'impiegata no: loro hanno `ore_personali`, che
-- di cantiere non ne ha nessuno — il tecnico "e' come un uccello che
-- vola sui cantieri" (utente, 2026-09-17) e non deve inserirsi in
-- nessuna squadra. Stefania riceve le ore di TUTTI, tecnico compreso,
-- quindi la lettura deve guardare in tutti e due i posti. Lo stesso fa
-- gia' `invia_foglio_giornata` (invio-due-posti.sql).
--
-- Le stesse ore non stanno mai in tutti e due i posti: sommarle e'
-- corretto, non e' un doppio conteggio. E' l'unione di due popolazioni
-- disgiunte, non la somma della stessa riga letta due volte.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. IL TOTALE PER PERSONA
--
-- Una riga per persona, con i totali della settimana. E' quello che
-- Stefania legge per prima: chi, e quante ore.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ore_settimana(p_org uuid, p_lunedi date)
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
declare
  fine date := p_lunedi + 6;
begin
  -- Il cancello, prima di tutto il resto.
  --
  -- `paghe.read` esiste in `role_permissions` dai tempi di wbs-office e
  -- non e' mai stato usato da nessuna parte nel frontend: e' esattamente
  -- il permesso fatto per questa pagina, e qui trova il suo primo
  -- impiego. `economics.read` passa perche' chi legge i costi legge
  -- anche da dove nascono.
  --
  -- `app.has_perm` risponde solo per le organizzazioni di cui chi chiama
  -- e' membro, quindi verifica insieme l'appartenenza e il requisito.
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere le ore di questa settimana.'
      using errcode = '42501';
  end if;

  -- Il lunedi' deve essere un lunedi' vero. Una settimana che comincia
  -- di mercoledi' darebbe totali che non combaciano con nessun'altra
  -- schermata, e nessuno se ne accorgerebbe guardando i numeri.
  if extract(isodow from p_lunedi) <> 1 then
    raise exception 'La settimana comincia di lunedi'': % e'' un %.',
      p_lunedi, to_char(p_lunedi, 'Day')
      using errcode = 'P0001';
  end if;

  return query
  with ore_unite as (
    -- PRIMO POSTO: le ore di cantiere, di chi in cantiere ci va.
    -- Solo `validato` e `contabilizzato`: contabilizzato e' uno stato
    -- PIU' avanti di validato, non un ramo diverso, e escluderlo
    -- farebbe sparire dalla busta paga le ore gia' messe nei conti.
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
      and r.data between p_lunedi and fine
      and r.stato in ('validato', 'contabilizzato')

    union all

    -- SECONDO POSTO: il foglio ore personale, per chi non presta le
    -- proprie ore a un cantiere solo.
    --
    -- `ore_personali.stato` e' testo libero, non l'enum
    -- `rapportino_stato` (e' un difetto noto del progetto, "campi che
    -- dovrebbero essere enum e sono testo libero"): il confronto resta
    -- sulle stesse due parole, cosi' se un domani diventa un enum
    -- questa riga non cambia.
    --
    -- `ore_personali` non ha la trasferta: chi sta in ufficio non ne fa,
    -- e il tecnico che gira i cantieri ha l'auto aziendale. Zero
    -- dichiarato, non null, cosi' la somma non va mai a null.
    select
      p.dipendente_id,
      p.data,
      p.ore_ordinarie,
      p.ore_straordinarie,
      0::numeric as ore_trasferta,
      p.ore_assenza,
      p.tipo_assenza
    from public.ore_personali p
    where p.org_id = p_org
      and p.data between p_lunedi and fine
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
    -- I GIORNI in cui ha davvero lavorato, non le righe: chi in un
    -- giorno e' passato su tre cantieri ha tre righe e un giorno solo.
    -- Un giorno di sola assenza non e' un giorno lavorato.
    count(distinct u.data) filter (
      where u.ore_ordinarie + u.ore_straordinarie > 0
    )::integer,
    string_agg(distinct u.tipo_assenza, ', ')
  from ore_unite u
  join public.dipendenti d on d.id = u.dipendente_id
  group by d.id, d.cognome, d.nome, d.matricola, d.tipo
  -- Chi non ha niente in settimana non compare: una riga a zero in una
  -- lista di paghe e' un invito a chiedersi cosa e' successo, quando la
  -- risposta e' "niente".
  having coalesce(sum(
    u.ore_ordinarie + u.ore_straordinarie + u.ore_assenza
  ), 0) > 0
  order by d.cognome, d.nome;
end;
$fn$;

comment on function public.ore_settimana(uuid, date) is
  'Ore per persona su una settimana (lunedi''-domenica), solo dalle giornate VALIDATE dal titolare, unendo le ore di cantiere e il foglio ore personale. Security definer di proposito: il perimetro per assegnazione renderebbe il totale incompleto per chi i cantieri non li ha assegnati. Cancello su paghe.read / economics.read.';

revoke all on function public.ore_settimana(uuid, date) from public;
grant execute on function public.ore_settimana(uuid, date) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. IL DETTAGLIO PER CANTIERE
--
-- Quello che si apre sotto ogni persona. L'utente lo ha definito
-- fondamentale, e non e' un vezzo: e' il mattone che regge anche lo
-- storico del cantiere e lo storico delle lavorazioni di ogni risorsa.
-- Una sola fonte, tre letture; se fossero tre query diverse i numeri
-- prima o poi divergerebbero.
--
-- Si chiama con `p_dipendente` per una persona sola (aprendo la sua
-- riga) o con null per avere tutta la settimana in un colpo.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ore_settimana_cantieri(
  p_org        uuid,
  p_lunedi     date,
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
  giorni             integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  fine date := p_lunedi + 6;
begin
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere il dettaglio di questa settimana.'
      using errcode = '42501';
  end if;

  if extract(isodow from p_lunedi) <> 1 then
    raise exception 'La settimana comincia di lunedi'': % e'' un %.',
      p_lunedi, to_char(p_lunedi, 'Day')
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
    count(distinct r.data)::integer
  from public.rapportino_ore o
  join public.rapportini r on r.id = o.rapportino_id
  join public.cantieri c on c.id = r.cantiere_id
  join public.dipendenti d on d.id = o.dipendente_id
  where o.org_id = p_org
    and r.data between p_lunedi and fine
    and r.stato in ('validato', 'contabilizzato')
    and (p_dipendente is null or o.dipendente_id = p_dipendente)
  group by d.id, d.cognome, d.nome, c.id, c.codice, c.denominazione
  -- Le assenze non hanno un cantiere: una riga di sole assenze qui non
  -- dice niente e nel dettaglio "dove ha lavorato" sarebbe fuorviante.
  -- Il totale delle assenze resta nella riga della persona, sopra.
  having coalesce(sum(o.ore_ordinarie + o.ore_straordinarie), 0) > 0
  order by d.cognome, d.nome, c.codice;

  -- Il foglio ore personale NON compare qui, di proposito: quelle ore un
  -- cantiere non ce l'hanno per costruzione. Il totale della persona
  -- (funzione 1) le comprende, il dettaglio per cantiere no, e la
  -- differenza fra i due e' esattamente il lavoro non attribuibile a un
  -- cantiere solo. La pagina lo dice invece di lasciarlo dedurre da una
  -- sottrazione.
end;
$fn$;

comment on function public.ore_settimana_cantieri(uuid, date, uuid) is
  'Dettaglio per cantiere delle ore di una settimana, per una persona o per tutte. Solo giornate VALIDATE. Il foglio ore personale e'' escluso di proposito: quelle ore non hanno un cantiere. Cancello su paghe.read / economics.read.';

revoke all on function public.ore_settimana_cantieri(uuid, date, uuid) from public;
grant execute on function public.ore_settimana_cantieri(uuid, date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 3. COSA NON E' ANCORA ARRIVATO
--
-- Il numero piu' pericoloso di questa pagina non e' quello che si vede:
-- e' quello che manca. Se in settimana ci sono tre giornate ferme da
-- Giuseppe, il totale di Stefania e' incompleto e sembra completo. Un
-- totale che sembra completo e non lo e' finisce in busta paga.
--
-- Qui non c'e' nessun cancello in piu' perche' non escono ore: solo
-- quante giornate sono ancora per strada e in che stato.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.settimana_da_validare(p_org uuid, p_lunedi date)
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
declare
  fine date := p_lunedi + 6;
begin
  if not (
    app.has_perm(p_org, 'paghe.read')
    or app.has_perm(p_org, 'economics.read')
  ) then
    raise exception 'Non hai i requisiti per leggere lo stato di questa settimana.'
      using errcode = '42501';
  end if;

  return query
  select
    s.stato::text,
    count(distinct s.data)::integer,
    min(s.data),
    max(s.data)
  from (
    select r.data, r.stato
    from public.rapportini r
    where r.org_id = p_org
      and r.data between p_lunedi and fine
      and r.stato not in ('validato', 'contabilizzato')

    union all

    select p.data, p.stato
    from public.ore_personali p
    where p.org_id = p_org
      and p.data between p_lunedi and fine
      and p.stato not in ('validato', 'contabilizzato')
  ) s
  group by s.stato
  order by s.stato;
end;
$fn$;

comment on function public.settimana_da_validare(uuid, date) is
  'Quante giornate della settimana NON sono ancora validate, per stato. Serve a dire in pagina che il totale e'' parziale: un totale che sembra completo e non lo e'' finisce in busta paga.';

revoke all on function public.settimana_da_validare(uuid, date) from public;
grant execute on function public.settimana_da_validare(uuid, date) to authenticated;


-- =====================================================================
-- VERIFICHE
-- Da lanciare dopo, nel SQL Editor. Sono di sola lettura.
-- =====================================================================

-- A. Le tre funzioni esistono e sono `definer`.
--    Devono dire tutte e tre 'security definer'.
select p.proname as funzione,
       case when p.prosecdef then 'security definer' else 'security invoker' end as modo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ore_settimana', 'ore_settimana_cantieri', 'settimana_da_validare')
order by p.proname;

-- B. Chi ha `paghe.read` oggi. Deve comparirci l'amministrazione.
--    Se non c'e', la pagina di Stefania non si apre e il motivo e'
--    questo, non il codice.
--
--    Attenzione ai nomi: la tabella mischia le due lingue, `ruolo` in
--    italiano e `permission` in inglese. Non e' un refuso di chi
--    scrive la query: e' proprio cosi' nel database.
select r.ruolo, r.permission as permesso
from public.role_permissions r
where r.permission in ('paghe.read', 'paghe.export', 'economics.read')
order by r.permission, r.ruolo;

-- C. `ore_personali.stato`: quali parole ci sono davvero dentro.
--    Il filtro qui sopra si fida di 'validato' e 'contabilizzato'. Se
--    questa query tira fuori altro (per esempio 'approvato'), il filtro
--    va allineato PRIMA di fidarsi dei totali.
select stato, count(*) as righe
from public.ore_personali
group by stato
order by count(*) desc;

-- D. Una prova vera, sulla settimana del 14 settembre 2026 (lunedi').
--    Sostituire l'uuid dell'organizzazione.
-- select * from public.ore_settimana('<org-uuid>', '2026-09-14');
-- select * from public.ore_settimana_cantieri('<org-uuid>', '2026-09-14');
-- select * from public.settimana_da_validare('<org-uuid>', '2026-09-14');
