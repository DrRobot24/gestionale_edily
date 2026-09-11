-- =====================================================================
-- `invia_foglio_giornata`: il controllo delle 8 ore diventa una regola
--
-- SOSTITUISCE la funzione di `foglio-ore-tecnico.sql`, che a sua volta
-- sostituiva quella di `foglio-giornata.sql`. I file precedenti restano
-- agli atti perche' raccontano come sono nate le regole di prima: qui si
-- aggiunge il controllo sulle ore e NON si tocca nient'altro.
--
-- LA REGOLA NUOVA, chiesta dall'utente l'11 settembre 2026.
--
-- Finora il controllo delle 8 ore viveva solo in home, come avviso. Un
-- controllo che vive solo nell'interfaccia lo aggira chiunque chiami
-- l'API, e soprattutto lo aggira chi preme «invia» senza aver letto il
-- riquadro. Da qui in poi la giornata non parte se i conti non tornano,
-- in TUTTI E DUE i rami:
--
--   sopra le 8 ore   il tecnico deve dichiarare lo straordinario
--   sotto le 8 ore   il tecnico deve dire il motivo, e per quante ore
--
-- PERCHE' BLOCCA ANCHE IL RAMO DELLE ORE MANCANTI
--
-- Era la domanda aperta in STATO_LAVORI, e l'ipotesi scritta li' — «il
-- tecnico forse non sa il motivo, lo sa l'amministrazione» — era
-- SBAGLIATA. L'utente l'ha corretta l'11 settembre 2026: e' il tecnico
-- che fa il giro dei cantieri ogni giorno, ed e' lui che porta le
-- informazioni in ufficio. Se qualcuno non c'era, lo sa prima di
-- chiunque altro. Chiedere il motivo a fine giornata a lui vuol dire
-- chiederlo all'unica persona che ce l'ha; lasciarlo passare vuol dire
-- farlo ricostruire a giorni di distanza da chi in cantiere non c'era.
--
-- PERCHE' IL CONTO PASSA DA `ore_giornata()` E NON DA UNA QUERY QUI
--
-- Questa funzione e' `security invoker`: vede i cantieri del perimetro
-- di chi chiama. Il conto delle 8 ore invece e' sulla PERSONA su TUTTI i
-- cantieri dell'impresa — e' tutto il suo senso. Sommare qui dentro
-- darebbe 4 dove il totale e' 9, senza errore e senza avviso.
--
-- `ore_giornata()` e' `security definer`, fa il conto pieno e ha gia' il
-- suo cancello sui permessi. Si chiama quella. Il tecnico che invia ha
-- `rapportini.create`, quindi il cancello lo lascia passare.
--
-- LA REGOLA E' LA STESSA di `anomaliaDi()` in
-- `src/modules/rapportini/useOreGiornata.ts`, e le due devono restare
-- allineate: se un giorno cambia una, cambiare anche l'altra. In
-- particolare valgono anche qui le due eccezioni gia' motivate li':
--   - si guardano le ORDINARIE, perche' lo straordinario gia' dichiarato
--     sta in una colonna sua ed e' giusto che ci sia;
--   - una riga con un motivo e zero `ore_assenza` e' un'assenza a
--     giornata intera scritta prima che la colonna esistesse, e si
--     lascia stare invece di bloccare l'invio su dati vecchi.
--
-- L'ORDINE DEI CONTROLLI conta e non e' casuale: prima le schede che
-- mancano, poi le proprie ore, poi le ore di tutti, poi le respinte.
-- Si va dal problema piu' grosso al piu' fine. Dire a un tecnico che a
-- Mario manca un'ora quando non ha ancora compilato tre cantieri e'
-- mandarlo a caccia di un dettaglio dentro un lavoro non finito.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare: e' `create or replace`
-- e non cambia il tipo di ritorno.
-- =====================================================================


-- 1. COME SI SCRIVONO LE ORE IN UN MESSAGGIO
--
-- "1 ore" e "2.00 ore" sono il genere di sciatteria che fa sembrare
-- improvvisato tutto il resto del programma. Il frontend ha gia' la
-- stessa accortezza in `frase()` dentro `ControlloOre.tsx`: qui serve
-- l'equivalente, perche' questi messaggi li scrive il database.
--
-- `trim_scale` toglie gli zeri inutili in coda (2.00 -> 2, 1.50 -> 1.5)
-- e poi il punto diventa virgola, perche' si scrive in italiano.
--
-- Il `to_char` con `FM9990.99` sembrava la strada giusta ma lasciava il
-- separatore anche senza decimali — "2, ore", "10, ore" — e la prova sul
-- Postgres di prova l'ha mostrato subito. `trim_scale` lavora sul numero
-- invece che sul testo e il caso non si presenta.

create or replace function public.ore_in_lettere(p_ore numeric)
returns text
language sql
immutable
set search_path = pg_temp
as $fn$
  select case
    when p_ore = 1 then '1 ora'
    else replace(trim_scale(p_ore)::text, '.', ',') || ' ore'
  end;
$fn$;

comment on function public.ore_in_lettere(numeric) is
  'Le ore come si scrivono in un messaggio all''utente: "1 ora", "2 ore", "1,5 ore". Serve ai messaggi di `invia_foglio_giornata`.';


-- 2. LA FUNZIONE DI INVIO

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
begin
  -- Cantieri attivi che quel giorno non hanno nessuna scheda. La RLS fa
  -- gia' vedere solo quelli di competenza, quindi il conto e' sul
  -- perimetro di chi chiama.
  select count(*) into mancanti
  from public.cantieri c
  where c.org_id = p_org
    and c.stato = 'attivo'
    and not exists (
      select 1
      from public.rapportini r
      where r.cantiere_id = c.id
        and r.data = p_giorno
    );

  -- Il messaggio lo legge il tecnico, non un log: "Mancano 1 schede"
  -- e' esattamente il genere di sciatteria che fa sembrare rotto un
  -- programma che funziona.
  if mancanti > 0 then
    raise exception '%',
      case when mancanti = 1
        then 'Manca una scheda. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.'
        else format('Mancano %s schede. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.', mancanti)
      end
      using errcode = 'P0001';
  end if;

  -- Chi compila la giornata la lavora anche: senza le sue ore, il foglio
  -- racconta una giornata in cui l'unica persona certa di esserci stata
  -- non c'e'.
  --
  -- Il controllo si accende DA SOLO, e solo quando ha senso: vale
  -- unicamente se chi chiama ha un'anagrafica in `dipendenti` collegata
  -- al suo utente. Senza quel collegamento non esisterebbe nessuna riga
  -- dove scrivere quelle ore, e pretenderle bloccherebbe l'invio per
  -- sempre senza dare una via d'uscita. Il giorno che l'amministrazione
  -- collega il tecnico, la regola comincia a valere.
  select d.id into mio_dipendente
  from public.dipendenti d
  where d.org_id = p_org
    and d.user_id = auth.uid()
  limit 1;

  if mio_dipendente is not null then
    -- Le ore di assenza contano: chi era in ferie ha risposto alla
    -- domanda, e pretendergli delle ore lavorate sarebbe assurdo.
    select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
      into mie_ore
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    where o.org_id = p_org
      and r.data = p_giorno
      and o.dipendente_id = mio_dipendente;

    if mie_ore = 0 then
      raise exception 'Mancano le tue ore. Aggiungiti alla squadra del cantiere dove hai lavorato, oppure segna il motivo se non c''eri: una giornata senza chi l''ha scritta non e'' la giornata.'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─────────────────────────────────────────────────────────────────
  -- IL CONTROLLO DELLE 8 ORE
  --
  -- Si costruisce un elenco di persone con cosa non torna, e si blocca
  -- una volta sola dicendole tutte. Bloccare sul primo nome vorrebbe
  -- dire far correggere una persona, riprovare, scoprire la seconda:
  -- con una squadra di otto sono otto viaggi per un lavoro solo.
  --
  -- `ore_visibili` non si guarda apposta, ed e' una scelta con un
  -- prezzo: puo' esserci una persona le cui ore stanno tutte su
  -- cantieri di un collega, che il tecnico vede sballate ma non puo'
  -- correggere. Bloccarlo comunque e' voluto — il totale sbagliato
  -- arriverebbe in ufficio identico — ma il messaggio glielo dice, cosi'
  -- sa che deve sentire un collega invece di cercare a vuoto nei suoi.
  -- ─────────────────────────────────────────────────────────────────
  select
    string_agg(
      format('· %s: %s%s',
        g.nominativo,
        case
          when g.ore_ordinarie > 8 then
            format('%s oltre le 8 da dichiarare come straordinario',
                   public.ore_in_lettere(g.ore_ordinarie - 8))
          else
            format('%s in meno delle 8, segna il motivo (permesso, malattia, ferie)',
                   public.ore_in_lettere(8 - (g.ore_ordinarie + g.ore_assenza)))
        end,
        -- Quante di quelle ore stanno fuori dal perimetro di chi manda.
        -- Si dice il quanto e mai il dove, come nel riquadro in home.
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
    -- Sopra le 8 ordinarie: c'e' straordinario non dichiarato.
    g.ore_ordinarie > 8
    or (
      -- Sotto le 8 contando anche le ore coperte da un motivo...
      g.ore_ordinarie + g.ore_assenza < 8
      -- ...ma non e' una riga vecchia con motivo e zero ore, che vale
      -- come assenza a giornata intera (vedi `anomaliaDi`).
      and not (g.assenze is not null and g.ore_assenza = 0)
    );

  if quanti > 0 then
    raise exception '%',
      format(
        E'%s\n\n%s\n\nIl conto e'' sulla persona e sulla giornata, su tutti i cantieri: non sul singolo rapportino. Sistema e rimanda la giornata.',
        case when quanti = 1
          then 'Le ore di una persona non tornano.'
          else format('Le ore di %s persone non tornano.', quanti)
        end,
        guai
      )
      using errcode = 'P0001';
  end if;

  -- Una scheda respinta e' tornata indietro dal titolare: rimandargli la
  -- giornata senza averla corretta gli ripresenta lo stesso problema.
  select count(*) into da_correggere
  from public.rapportini r
  join public.cantieri c on c.id = r.cantiere_id
  where r.org_id = p_org
    and r.data = p_giorno
    and c.stato = 'attivo'
    and r.stato = 'respinto';

  if da_correggere > 0 then
    raise exception '%',
      case when da_correggere = 1
        then 'Una scheda e'' stata respinta: va corretta prima di rimandare la giornata.'
        else format('%s schede sono state respinte: vanno corrette prima di rimandare la giornata.', da_correggere)
      end
      using errcode = 'P0001';
  end if;

  -- Solo le bozze: quelle gia' inviate o validate restano dove sono, e
  -- rilanciare l'invio non le fa tornare indietro.
  update public.rapportini r
  set stato = 'inviato',
      inviato_at = now(),
      motivo_rifiuto = null
  from public.cantieri c
  where c.id = r.cantiere_id
    and r.org_id = p_org
    and r.data = p_giorno
    and c.stato = 'attivo'
    and r.stato = 'bozza';

  get diagnostics inviate = row_count;

  if inviate = 0 then
    raise exception 'Non c''e'' niente da inviare: la giornata risulta gia'' partita.'
      using errcode = 'P0001';
  end if;

  return inviate;
end;
$fn$;


revoke all on function public.invia_foglio_giornata(uuid, date) from public;
grant execute on function public.invia_foglio_giornata(uuid, date) to authenticated;


-- VERIFICA
-- La funzione deve esserci, `security invoker`, eseguibile da
-- `authenticated`.
select p.proname,
       case when p.prosecdef then 'security definer' else 'security invoker' end as modo,
       pg_get_function_identity_arguments(p.oid) as argomenti
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('invia_foglio_giornata', 'ore_in_lettere')
order by p.proname;

-- Chi ha qualcosa che non torna oggi, e quindi bloccherebbe l'invio.
-- Sostituire l'id dell'impresa. Da eseguire come utente vero (non come
-- `postgres`, che non ha `auth.uid()`).
--   select g.nominativo, g.ore_ordinarie, g.ore_assenza
--   from public.ore_giornata('...'::uuid, current_date) g
--   where g.ore_ordinarie > 8
--      or (g.ore_ordinarie + g.ore_assenza < 8
--          and not (g.assenze is not null and g.ore_assenza = 0));


-- PROVA DAL VIVO
-- Come tecnico@cassia.com:
--   1. compilare tutti i cantieri della giornata;
--   2. mettere a una persona 9 ore ordinarie su un cantiere;
--   3. premere «Invia il foglio della giornata» -> deve rifiutare
--      dicendo il nome e «1 ora oltre le 8»;
--   4. spostare quell'ora in straordinario -> deve partire;
--   5. mettere a una persona 6 ore senza motivo -> deve rifiutare
--      dicendo «2 ore in meno delle 8»;
--   6. segnare 2 ore di permesso -> deve partire.
