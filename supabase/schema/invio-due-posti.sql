-- =====================================================================
-- L'INVIO DELLA GIORNATA IMPARA A GUARDARE DUE POSTI
--
-- Scritto il 2026-09-17, e va eseguito SUBITO DOPO
-- [`foglio-ore-personale.sql`](foglio-ore-personale.sql): senza, il
-- tecnico non riesce piu' a mandare la giornata.
--
-- IL PERCHE'. `invia_foglio_giornata` pretende che chi manda la giornata
-- abbia dichiarato le proprie ore — «una giornata senza chi l'ha
-- scritta non e' la giornata». Finora le cercava in un posto solo,
-- `rapportino_ore`, cioe' fra le ore di cantiere.
--
-- Da quando il tecnico ha `tipo = 'tecnico'` le sue ore stanno in
-- `ore_personali` e in `rapportino_ore` non ce ne sono piu': quella
-- somma farebbe SEMPRE zero, e ogni sera l'invio risponderebbe «Mancano
-- le tue ore» suggerendo di aggiungersi a una squadra dove un trigger
-- gli impedisce di entrare. Un vicolo cieco perfetto.
--
-- COSA CAMBIA, esattamente: un blocco dentro la funzione. Il resto —
-- le schede mancanti, il controllo delle 8 ore, le respinte, l'update
-- finale — e' identico a
-- [`invio-controllo-ore.sql`](invio-controllo-ore.sql), che resta la
-- fonte da leggere per capire come funziona l'insieme. La funzione si
-- ricrea INTERA perche' Postgres non sa sostituire un pezzo: se un
-- domani si tocca quel file, questo va rigenerato.
--
-- IL MESSAGGIO cita tutti e due i posti, perche' chi lo legge puo'
-- essere l'uno o l'altro: «Compilale in "Le mie ore", oppure aggiungiti
-- alla squadra del cantiere dove hai lavorato».
--
-- Da eseguire tutto insieme nel SQL Editor.
-- =====================================================================


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
    -- PRIMO POSTO: le ore sui cantieri. Vale per chi in cantiere ci va
    -- davvero, cioe' gli operai.
    --
    -- Le ore di assenza contano: chi era in ferie ha risposto alla
    -- domanda, e pretendergli delle ore lavorate sarebbe assurdo.
    select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
      into mie_ore
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    where o.org_id = p_org
      and r.data = p_giorno
      and o.dipendente_id = mio_dipendente;

    -- SECONDO POSTO: il foglio ore personale, per chi non presta le
    -- proprie ore a un cantiere solo — il tecnico che segue tutti i
    -- cantieri, l'impiegata che sta in ufficio.
    --
    -- Si guarda solo se il primo non ha trovato niente, e l'ordine non
    -- e' casuale: la stragrande maggioranza di chi manda la giornata e'
    -- gente che in cantiere c'e' stata, e per loro la prima query
    -- risponde subito. Sommare i due posti sarebbe sbagliato oltre che
    -- inutile: le stesse ore non stanno in tutti e due, e un totale che
    -- le addiziona direbbe sedici ore a chi ne ha fatte otto.
    if mie_ore = 0 then
      select coalesce(sum(p.ore_ordinarie + p.ore_straordinarie + p.ore_assenza), 0)
        into mie_ore
      from public.ore_personali p
      where p.org_id = p_org
        and p.data = p_giorno
        and p.dipendente_id = mio_dipendente;
    end if;

    if mie_ore = 0 then
      raise exception 'Mancano le tue ore di oggi. Compilale in «Le mie ore», oppure aggiungiti alla squadra del cantiere dove hai lavorato: una giornata senza chi l''ha scritta non e'' la giornata.'
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


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Deve dire `security invoker`: la funzione conta sul perimetro di chi
-- chiama, e da `definer` vedrebbe cantieri che non sono suoi.

select p.proname,
       case when p.prosecdef then 'security definer' else 'security invoker' end as modo,
       pg_get_function_identity_arguments(p.oid) as argomenti
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'invia_foglio_giornata';

-- Che la funzione guardi davvero in `ore_personali`: deve dire `true`.
select pg_get_functiondef(p.oid) like '%ore_personali%' as guarda_il_foglio_personale
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'invia_foglio_giornata';


-- ── PROVA DAL VIVO, come tecnico@cassia.com ─────────────────────────
--   1. compilare tutti i cantieri attivi della giornata;
--   2. NON compilare «Le mie ore»;
--   3. premere «Invia il foglio della giornata» -> deve rifiutare
--      dicendo «Mancano le tue ore di oggi»;
--   4. compilare «Le mie ore» con 8 ore e salvare;
--   5. rimandare -> deve partire.
