-- =====================================================================
-- NESSUNO RESTA FUORI DALLA GIORNATA
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md, "Prossimi passi" punto 1).
-- Va eseguito a mano nel SQL Editor, un blocco alla volta.
--
-- SEGUE, e li vuole gia' eseguiti, `invio-due-posti.sql`,
-- `invio-controllo-ore.sql` e `giustificazioni-ore.sql`. Questo file
-- RISCRIVE `invia_foglio_giornata` aggiungendo un controllo: gli altri
-- restano com'erano, e cio' che avevano applicato e' stato riportato
-- qui dentro pezzo per pezzo — il foglio ore personale come secondo
-- posto dove cercare le proprie ore, e la giustificazione che sblocca
-- il controllo delle 8 ore.
--
--
-- IL BUCO CHE CHIUDE, chiesto dall'utente il 2026-09-22:
--
--   «Esiste un controllo sulle ore od in generale sul personale che,
--    quando il tecnico compila i rapportini della giornata e si
--    dimentica per sbaglio di inserire una persona, allora spunta alert
--    che glielo ricorda? E' fondamentale questa cosa perche' sennò che
--    aiuto da questo gestionale?»
--
-- La risposta era no, e il motivo e' istruttivo. Il controllo delle 8
-- ore esisteva gia' ed e' severo, ma gira su `ore_giornata()`, che
-- parte da `rapportino_ore` — cioe' dalle RIGHE SCRITTE. Controllava
-- benissimo chi era gia' stato inserito, e per definizione non poteva
-- dire niente su chi non c'era. Fadera dimenticato non ha righe, non
-- compare nell'aggregato, e la giornata partiva pulita.
--
-- E' lo stesso errore che la griglia delle ore aveva e che il
-- 2026-09-22 le e' stato tolto facendola partire dall'anagrafica. Qui
-- pero' pesa di piu': la griglia e' un controllo A VALLE, dove al
-- massimo si nota un buco; questo e' il CANCELLO, dove il buco si
-- impedisce. Una persona dimenticata all'invio arriva in fondo senza
-- ore e senza che nessuno l'abbia mai cercata.
--
--
-- COSA VUOL DIRE «COLLOCATA»
--
-- Una persona e' a posto se di lei si sa QUALCOSA, in qualunque delle
-- tre forme che il gestionale conosce:
--
--   ore su un rapportino   ha lavorato, e dove
--   ore di assenza         non c'era, e il motivo e' scritto
--   una giustificazione    il tecnico ha spiegato quel giorno in
--                          `giustificazioni_ore`
--
-- Basta una delle tre. Il controllo non chiede che la giornata sia
-- giusta — di quello si occupa il controllo delle 8 ore, subito dopo —
-- chiede che la persona sia stata GUARDATA. E' una domanda diversa e
-- viene prima: «hai pensato a Fadera?» prima di «le ore di Fadera
-- tornano?».
--
--
-- CHI ENTRA NEL CONTO
--
-- Solo gli OPERAI attivi, e le tre esclusioni hanno tutte un perche':
--
--   solo `attivo`         chi e' stato disattivato non lavora piu', e
--                         pretenderne la collocazione bloccherebbe ogni
--                         giornata per sempre
--   solo `tipo = operaio` tecnico e impiegati le ore le scrivono nel
--                         foglio personale, che e' un altro flusso: il
--                         database rifiuta le loro righe sui rapportini
--                         (vedi `togli-ore-non-operai.sql`), quindi
--                         chiederle qui sarebbe chiedere l'impossibile
--   dentro il rapporto    chi e' stato assunto dopo quel giorno, o
--                         cessato prima, non c'era per definizione
--
--
-- PERCHE' UN BLOCCO E NON UN AVVISO
--
-- Scelta dell'utente, fra tre opzioni: «blocca l'invio, come le 8 ore».
-- E' coerente col resto della funzione — qui dentro non ci sono avvisi,
-- ci sono cancelli — e con il motivo per cui il controllo esiste: un
-- avviso che si puo' ignorare non protegge dalla DIMENTICANZA, che e'
-- per definizione una cosa che non si nota.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- LA FUNZIONE, riscritta per intero.
--
-- `create or replace` la sostituisce senza toccare i permessi ne' le
-- policy. Si puo' rilanciare senza danno.
--
-- ⚠️ E' una RISCRITTURA, non una patch: il corpo che segue contiene
-- TUTTI i controlli, anche quelli che non cambiano. Se in futuro
-- qualcuno modifica `invio-controllo-ore.sql` senza riportare la
-- modifica qui, rilanciare quel file cancellerebbe questo controllo.
-- L'ordine giusto e': prima quello, poi questo.
-- ─────────────────────────────────────────────────────────────────────
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
begin
  -- ─────────────────────────────────────────────────────────────────
  -- 1. OGNI CANTIERE ATTIVO HA LA SUA SCHEDA
  -- ─────────────────────────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────────────────────────
  -- 2. CHI COMPILA HA SCRITTO LE PROPRIE ORE
  --
  -- Il controllo si accende DA SOLO, e solo quando ha senso: vale
  -- unicamente se chi chiama ha un'anagrafica in `dipendenti` collegata
  -- al suo utente. Senza quel collegamento non esisterebbe nessuna riga
  -- dove scrivere quelle ore, e pretenderle bloccherebbe l'invio per
  -- sempre senza dare una via d'uscita.
  -- ─────────────────────────────────────────────────────────────────
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

    -- SECONDO POSTO: il foglio ore personale, per chi non presta le
    -- proprie ore a un cantiere solo — il tecnico che segue tutti i
    -- cantieri, l'impiegata che sta in ufficio. Arriva da
    -- `invio-due-posti.sql`.
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
  -- 3. NESSUN OPERAIO E' RIMASTO FUORI  ← IL CONTROLLO NUOVO
  --
  -- Si parte dall'ANAGRAFICA e si cerca chi NON ha lasciato traccia,
  -- che e' l'unico modo di accorgersi di una dimenticanza: partendo
  -- dalle righe scritte, chi manca non c'e' e non si vede.
  --
  -- Sta DOPO i due controlli di sopra e PRIMA delle 8 ore, ed e'
  -- l'ordine giusto per chi lo legge: prima «esistono tutte le
  -- schede», poi «ci sei tu», poi «c'e' ognuno», poi «i conti tornano».
  -- Ogni gradino da' per scontato quello prima.
  -- ─────────────────────────────────────────────────────────────────
  select
    string_agg(format('· %s', (d.cognome || ' ' || d.nome)), E'\n' order by d.cognome, d.nome),
    count(*)
  into dimenticati, quanti_fuori
  from public.dipendenti d
  where d.org_id = p_org
    and d.attivo
    -- Solo gli operai: tecnico e impiegati hanno il foglio personale, e
    -- il database rifiuta le loro righe sui rapportini.
    and d.tipo = 'operaio'
    -- Dentro il rapporto di lavoro: chi non era ancora assunto, o era
    -- gia' cessato, non c'era per definizione.
    and (d.data_assunzione is null or d.data_assunzione <= p_giorno)
    and (d.data_cessazione is null or d.data_cessazione >= p_giorno)
    -- Nessuna traccia su un rapportino di quel giorno: ne' ore
    -- lavorate, ne' ore di assenza. La riga a zero-zero non salva —
    -- e' una riga che non dice niente.
    and not exists (
      select 1
      from public.rapportino_ore o
      join public.rapportini r on r.id = o.rapportino_id
      where o.org_id = p_org
        and r.data = p_giorno
        and o.dipendente_id = d.id
        and (o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza) > 0
    )
    -- ...e nemmeno una giustificazione scritta per quel giorno. E' la
    -- terza forma valida: il tecnico ha guardato quella persona e ha
    -- spiegato perche' la sua giornata e' cosi'.
    and not exists (
      select 1
      from public.giustificazioni_ore g
      where g.org_id = p_org
        and g.data = p_giorno
        and g.dipendente_id = d.id
    );

  if quanti_fuori > 0 then
    raise exception '%',
      format(
        E'%s\n\n%s\n\nOgni operaio in forza deve avere una collocazione: le ore del cantiere dove ha lavorato, oppure il motivo se non c''era (ferie, permesso, malattia). Aggiungili alla squadra di una scheda e mandala di nuovo.',
        case when quanti_fuori = 1
          then 'Una persona non e'' su nessuna scheda.'
          else format('%s persone non sono su nessuna scheda.', quanti_fuori)
        end,
        dimenticati
      )
      using errcode = 'P0001';
  end if;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. IL CONTROLLO DELLE 8 ORE
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
    -- La giornata gia' giustificata non si ridiscute: il tecnico ha
    -- scritto perche' non torna, e il titolare valutera' se convince.
    not exists (
      select 1
      from public.giustificazioni_ore gi
      where gi.org_id = p_org
        and gi.data = p_giorno
        and gi.dipendente_id = g.dipendente_id
    )
    and (
      -- Sopra le 8 ordinarie: c'e' straordinario non dichiarato.
      g.ore_ordinarie > 8
      or (
        -- Sotto le 8 contando anche le ore coperte da un motivo...
        g.ore_ordinarie + g.ore_assenza < 8
        -- ...ma non e' una riga vecchia con motivo e zero ore, che vale
        -- come assenza a giornata intera (vedi `anomaliaDi`).
        and not (g.assenze is not null and g.ore_assenza = 0)
      )
    );

  -- Il messaggio dice anche la strada nuova: dire cosa non va senza
  -- dire dove si rimedia obbliga a cercare la voce in sidebar mentre si
  -- e' fermi li'. Arriva dalla patch in coda a `giustificazioni-ore.sql`,
  -- ed e' IL PEZZO che una riscrittura come questa perde piu' facilmente.
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

  -- ─────────────────────────────────────────────────────────────────
  -- 5. NIENTE SCHEDE RESPINTE, POI SI MANDA
  --
  -- Una scheda respinta e' tornata indietro dal titolare: rimandargli
  -- la giornata senza averla corretta e' un giro a vuoto per tutti e
  -- due.
  -- ─────────────────────────────────────────────────────────────────
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

-- NIENTE `drop function` QUI, al contrario di `ore-griglia.sql`: questa
-- restituisce `integer`, un tipo che non cambia mai, quindi
-- `create or replace` basta — e il drop sarebbe dannoso, perche'
-- porterebbe via i permessi lasciando la funzione inaccessibile al
-- frontend finche' qualcuno non se ne accorge.
--
-- I grant si riscrivono lo stesso, per due motivi: sono idempotenti, e
-- il giorno che qualcuno aggiungesse un drop qui sopra la funzione
-- continuerebbe a funzionare invece di rompersi in silenzio.
revoke all on function public.invia_foglio_giornata(uuid, date) from public;
grant execute on function public.invia_foglio_giornata(uuid, date) to authenticated;

comment on function public.invia_foglio_giornata(uuid, date) is
  'Invia al titolare tutte le bozze di una giornata, dopo cinque controlli in fila: ogni cantiere attivo ha la sua scheda, chi compila ha scritto le proprie ore, NESSUN OPERAIO IN FORZA e rimasto fuori, le ore di ognuno tornano a otto (o sono gia giustificate), nessuna scheda e ancora da correggere.';
