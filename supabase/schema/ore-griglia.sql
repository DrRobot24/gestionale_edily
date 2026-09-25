-- =====================================================================
-- LA GRIGLIA: le ore di ogni persona, giorno per giorno
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md, "Prossimi passi" punto 1).
-- Va eseguito a mano nel SQL Editor, un blocco alla volta.
--
-- SEGUE `ore-periodo.sql` e, dal 2026-09-23, `assenze.sql`: la tabella
-- `assenze` deve esistere prima di rieseguire questo file.
--
-- SEGUE `ore-periodo.sql`, che va eseguito prima. Quel file resta com'e':
-- questa e' una funzione in piu', non una riscrittura. Su un database
-- condiviso con wbs-office e senza backup, aggiungere e' sicuro e
-- sostituire no.
--
-- PERCHE' NON BASTAVA `ore_periodo`.
--
-- Quella risponde «quante ore ha fatto Mario questa settimana»: un
-- numero per persona, che e' cio' su cui si mette la tariffa. Questa
-- risponde a una domanda diversa — «quante ne ha fatte MARTEDI'» — e la
-- differenza non e' di dettaglio, e' di gesto.
--
-- Chiesto dall'utente il 2026-09-22: «gli operai come righe (tutti
-- quelli in anagrafica ovviamente) ed i giorni della settimana sopra
-- come colonne». E' il foglio che in ufficio si tiene sul tavolo, e si
-- legge in due direzioni. Per riga, quanto ha fatto una persona. Per
-- colonna, chi c'era quel giorno.
--
-- ALIMENTA LA STESSA PAGINA, `/ore`: non una seconda schermata. La
-- prima versione era una pagina a parte e l'utente ha corretto — «io
-- intendevo questa come posizione» — perche' due pagine sugli stessi
-- dati vogliono dire due posti dove guardare e due totali da far
-- tornare. `ore_periodo` resta per il riquadro in home di chi fa le
-- paghe, e i due totali devono coincidere: se un giorno non tornassero,
-- e' questa la vista che lo fa vedere.
--
-- STESSE REGOLE DI `ore_periodo`, e non e' una comodita': se qui
-- entrassero anche le giornate non validate, la somma delle celle non
-- farebbe il totale dell'altra pagina e nessuno saprebbe quale delle due
-- credere. Quindi solo `validato` e `contabilizzato`, e le stesse due
-- sorgenti unite — le ore di cantiere e il foglio ore personale.
--
-- UNA RIGA PER PERSONA E GIORNO, non una cella per ogni giorno del
-- periodo: i buchi li disegna la pagina, che sa gia' quali giorni
-- contiene. Restituire zeri per le giornate vuote vorrebbe dire mandare
-- settanta righe dove ne bastano venti, e su una settimana di ferie
-- sarebbero tutte zeri.
--
-- SI PARTE DALL'ANAGRAFICA, non dalle ore. Chi non ha lavorato esce
-- comunque, con una riga sola a `data` null. E' la differenza fra un
-- foglio presenze e un estratto conto: una riga vuota e' una domanda
-- che si puo' andare a chiudere, una riga che NON C'E' non la nota
-- nessuno — e l'operaio dimenticato dal rapportino resterebbe fuori
-- dalla busta in silenzio. E' esattamente il controllo per cui questa
-- vista esiste. Richiesta dell'utente il 2026-09-22: «tutti quelli in
-- anagrafica ovviamente».
--
-- LA CELLA SI APRE. Richiesta dell'utente il 2026-09-22: «la possibilita'
-- di cliccare e di vedere dove hanno lavorato cioe' in quale cantiere e
-- se hanno qualche ora in meno o in piu' e per quale motivo».
--
-- Quindi ogni riga si porta dietro due cose che nella cella non stanno:
--
--   cantieri   dove ha lavorato quel giorno, con le ore per ciascuno.
--              Un oggetto e non una sigla, perche' chi gira due cantieri
--              in un giorno ha due numeri diversi da mostrare.
--   motivo     la giustificazione di quel giorno, se c'e'. Viene da
--              `giustificazioni_ore`, che ha gia' esattamente la forma
--              della domanda — una riga per persona e giorno — ed e' il
--              posto dove il tecnico scrive perche' quel giorno non fa
--              otto ore.
--
-- Si portano su SUBITO e non a richiesta, con una chiamata per cella:
-- su una settimana sono un centinaio di celle, e aprirne una non deve
-- far partire una domanda al server per dire due righe che erano gia'
-- in casa.
-- =====================================================================

-- ⚠️ IL DROP PRIMA DEL CREATE, e non e' una precauzione di stile.
--
-- `create or replace` NON sa cambiare il tipo di ritorno di una
-- funzione che esiste gia': su una `returns table` basta una colonna in
-- piu' e Postgres si ferma con «cannot change return type of existing
-- function». E' successo esattamente qui — la prima stesura aveva 12
-- colonne, l'aggiunta di `nota_assenza` le ha portate a 13 — e la
-- stessa trappola e' gia' annotata in `ore-giornata.sql`.
--
-- Con il drop davanti, questo file si puo' RIESEGUIRE ogni volta che
-- cambia, senza doversi ricordare se il tipo e' cambiato o no. La
-- funzione sparisce per un istante dentro la transazione del SQL
-- Editor: nessuna vista e nessun trigger dipende da lei, quindi
-- `cascade` non serve e non si usa — se un domani qualcosa dipendesse,
-- e' giusto che il drop fallisca invece di portarselo via in silenzio.
--
-- I permessi si riassegnano in fondo al file, perche' il drop porta via
-- anche quelli.
drop function if exists public.ore_griglia(uuid, date, date);

create or replace function public.ore_griglia(
  p_org uuid,
  p_dal date,
  p_al  date
)
returns table (
  dipendente_id      uuid,
  nominativo         text,
  matricola          text,
  tipo               text,
  -- Null quando la persona non ha NESSUNA ora nel periodo: esce
  -- comunque, con una riga sola, perche' una riga vuota e' una domanda
  -- e una riga assente non la nota nessuno.
  data               date,
  ore_ordinarie      numeric,
  ore_straordinarie  numeric,
  ore_trasferta      numeric,
  ore_assenza        numeric,
  tipo_assenza       text,
  -- La spiegazione scritta a mano quando il motivo e' «Altro»: senza,
  -- in griglia si leggerebbe «ALT» e nessuno saprebbe di cosa si
  -- trattava. Viene da `rapportino_ore.note`, una riga per persona e
  -- giornata.
  nota_assenza       text,
  -- Dove ha lavorato quel giorno, con le ore su ciascun cantiere. Non
  -- entra nella cella — che resta un numero solo, leggibile di sfuggita
  -- — ma e' la prima cosa che si vede aprendola. Array di
  -- `{cantiere_id, codice, denominazione, ore}`, in ordine di codice.
  cantieri           jsonb,
  -- La giustificazione di quel giorno, se il tecnico l'ha scritta:
  -- `{tipo, motivo, descrizione, ore}` oppure null. E' il «per quale
  -- motivo» della richiesta, e vive in una tabella sua perche' la
  -- domanda e' sulla persona e sul giorno, non sul rapportino.
  giustificazione    jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Gli stessi requisiti di `ore_periodo`. Chi compila NON entra: qui
  -- dentro ci sono le ore di tutti i colleghi, che sono il presupposto
  -- delle buste paga.
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

  -- Un tetto piu' stretto che in `ore_periodo`: li' una riga per persona
  -- su un anno sono venti righe, qui sarebbero venti per ogni giorno
  -- lavorato. La griglia si guarda a settimane, al massimo a mesi.
  if p_al - p_dal > 92 then
    raise exception 'Periodo troppo lungo per la griglia: % giorni. Al massimo un trimestre.',
      p_al - p_dal
      using errcode = 'P0001';
  end if;

  return query
  with ore_unite as (
    -- Le ore di cantiere, riga per riga: qui il cantiere serve davvero,
    -- perche' aprendo la cella si deve poter dire QUANTE ore su
    -- ciascuno, non solo dove.
    select
      o.dipendente_id,
      r.data          as giorno,
      o.ore_ordinarie,
      o.ore_straordinarie,
      o.ore_trasferta,
      o.ore_assenza,
      o.tipo_assenza,
      o.note          as nota_assenza,
      r.cantiere_id,
      c.codice        as cantiere_codice,
      c.denominazione as cantiere_nome
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    left join public.cantieri c on c.id = r.cantiere_id
    where o.org_id = p_org
      and r.data between p_dal and p_al
      and r.stato in ('validato', 'contabilizzato')

    union all

    -- Il foglio ore personale: tecnico e impiegati, che le ore se le
    -- autoriportano. Non hanno cantiere e non fanno trasferta, quindi
    -- zero e null — le colonne devono comunque allinearsi.
    select
      p.dipendente_id,
      p.data,
      p.ore_ordinarie,
      p.ore_straordinarie,
      0::numeric,
      p.ore_assenza,
      p.tipo_assenza,
      -- Il foglio ore personale non ha una nota per riga: chi lo
      -- compila sceglie fra i motivi e basta.
      null::text,
      null::uuid,
      null::text,
      null::text
    from public.ore_personali p
    where p.org_id = p_org
      and p.data between p_dal and p_al
      and p.stato in ('validato', 'contabilizzato')

    union all

    -- LE ASSENZE A GIORNATA INTERA, da `assenze.sql` (2026-09-23). Chi
    -- era assente non sta piu' su nessun rapportino: sta qui, con zero
    -- ore lavorate e la giornata intera coperta dal motivo. Nella
    -- griglia la cella dice 0.
    --
    -- LA GIORNATA INTERA E' QUELLA DEL SUO CONTRATTO, dal 2026-09-25:
    -- otto per chi e' a tempo pieno, quattro per un part-time da
    -- quattro. Vedi `orario-contrattuale.sql`.
    --
    -- L'assenza non ha uno stato suo: viaggia con la giornata. Esce
    -- quando la giornata e' VALIDATA — almeno una scheda firmata e
    -- nessuna ancora in bozza, in attesa o respinta — che e' la stessa
    -- regola delle ore: la griglia mostra solo cio' che il titolare ha
    -- firmato.
    select
      a.dipendente_id,
      a.data,
      0::numeric,
      0::numeric,
      0::numeric,
      app.ore_contratto(a.dipendente_id, a.data),
      a.motivo,
      a.nota,
      null::uuid,
      null::text,
      null::text
    from public.assenze a
    where a.org_id = p_org
      and a.data between p_dal and p_al
      and exists (
        select 1 from public.rapportini r
        where r.org_id = p_org and r.data = a.data
          and r.stato in ('validato', 'contabilizzato')
      )
      and not exists (
        select 1 from public.rapportini r
        where r.org_id = p_org and r.data = a.data
          and r.stato in ('bozza', 'inviato', 'respinto')
      )
  ),

  -- Le ore raggruppate per persona, giorno E cantiere: e' il livello a
  -- cui si legge «quel martedi' ha fatto 4 ore sul C-04 e 4 sul C-07».
  -- Sta in un passaggio suo perche' il totale del giorno e' un livello
  -- sopra, e due raggruppamenti diversi non stanno nella stessa query
  -- senza contare le ore due volte.
  per_cantiere as (
    select
      u.dipendente_id,
      u.giorno,
      u.cantiere_id,
      u.cantiere_codice,
      u.cantiere_nome,
      sum(u.ore_ordinarie + u.ore_straordinarie) as ore
    from ore_unite u
    where u.cantiere_id is not null
    group by u.dipendente_id, u.giorno, u.cantiere_id, u.cantiere_codice, u.cantiere_nome
    having sum(u.ore_ordinarie + u.ore_straordinarie) > 0
  ),

  cantieri_json as (
    select
      pc.dipendente_id,
      pc.giorno,
      jsonb_agg(
        jsonb_build_object(
          'cantiere_id',   pc.cantiere_id,
          'codice',        pc.cantiere_codice,
          'denominazione', pc.cantiere_nome,
          'ore',           pc.ore
        )
        order by pc.cantiere_codice
      ) as cantieri
    from per_cantiere pc
    group by pc.dipendente_id, pc.giorno
  ),

  -- Le ore raggruppate per persona e giorno: il numero della cella.
  totali as (
    select
      u.dipendente_id,
      u.giorno,
      coalesce(sum(u.ore_ordinarie), 0)        as ore_ordinarie,
      coalesce(sum(u.ore_straordinarie), 0)    as ore_straordinarie,
      coalesce(sum(u.ore_trasferta), 0)        as ore_trasferta,
      coalesce(sum(u.ore_assenza), 0)          as ore_assenza,
      -- Una persona puo' avere due assenze diverse nello stesso giorno
      -- solo per un errore di compilazione, ma se c'e' si deve vedere:
      -- tacerne una la farebbe sparire dalla busta.
      string_agg(distinct u.tipo_assenza, ', ') as tipo_assenza,
      string_agg(distinct u.nota_assenza, ' · ')  as nota_assenza
    from ore_unite u
    group by u.dipendente_id, u.giorno
    -- Le giornate a zero non escono: e' una riga che dice «niente», e la
    -- pagina disegna gia' il niente come cella vuota.
    having coalesce(sum(
      u.ore_ordinarie + u.ore_straordinarie + u.ore_assenza
    ), 0) > 0
  ),

  -- CHI DEVE COMPARIRE, e questa CTE e' il motivo per cui la funzione
  -- non parte dalle ore.
  --
  -- Si parte dall'ANAGRAFICA: tutti quelli in forza nel periodo, anche
  -- chi non ha una sola ora. Una riga vuota e' una domanda — «perche'
  -- Rossi non ha niente questa settimana?» — e una domanda si puo'
  -- andare a chiudere. Una riga che NON C'E' non la si nota, e chi e'
  -- stato dimenticato dal rapportino resta fuori dalla busta senza che
  -- nessuno se ne accorga. E' esattamente il controllo per cui il
  -- foglio presenze esiste.
  --
  -- `attivo` e non la sola data di cessazione: un dipendente si
  -- disattiva anche senza cessarlo formalmente, ed e' la bandiera che
  -- l'anagrafica usa dappertutto.
  --
  -- Chi e' stato assunto DOPO la fine del periodo, o cessato PRIMA che
  -- cominciasse, resta fuori: non era in forza, e una sua riga vuota
  -- sarebbe una domanda con gia' la risposta.
  in_forza as (
    select d.id, d.cognome, d.nome, d.matricola, d.tipo
    from public.dipendenti d
    where d.org_id = p_org
      and (d.attivo or exists (
        select 1 from totali t where t.dipendente_id = d.id
      ))
      and (d.data_assunzione is null or d.data_assunzione <= p_al)
      and (d.data_cessazione is null or d.data_cessazione >= p_dal)
  )

  select
    f.id,
    (f.cognome || ' ' || f.nome)::text,
    f.matricola,
    f.tipo::text,
    t.giorno,
    coalesce(t.ore_ordinarie, 0)::numeric,
    coalesce(t.ore_straordinarie, 0)::numeric,
    coalesce(t.ore_trasferta, 0)::numeric,
    coalesce(t.ore_assenza, 0)::numeric,
    t.tipo_assenza,
    t.nota_assenza,
    -- Array vuoto e non null: chi tiene il foglio personale non sta su
    -- nessun cantiere, e la pagina non deve distinguere due casi per
    -- dire la stessa cosa.
    coalesce(cj.cantieri, '[]'::jsonb),
    -- La giustificazione, se il tecnico l'ha scritta. Non si filtra per
    -- stato: la riga esiste solo per le giornate compilate, e una volta
    -- validata non si tocca piu'.
    case
      when g.id is null then null
      else jsonb_build_object(
        'tipo',        g.tipo,
        -- `::text` esplicito: `motivo` e' l'enum `motivo_ore`, e un enum
        -- dentro jsonb lo si vuole come stringa, non come qualunque cosa
        -- decida la conversione implicita.
        'motivo',      g.motivo::text,
        'descrizione', g.descrizione,
        'ore',         g.ore
      )
    end
  -- LEFT JOIN dall'anagrafica alle ore, non il contrario: chi non ha
  -- lavorato esce comunque, con una riga sola a `giorno` null. La
  -- pagina la riconosce da quel null e disegna la riga vuota.
  from in_forza f
  left join totali t on t.dipendente_id = f.id
  left join cantieri_json cj
    on cj.dipendente_id = f.id and cj.giorno = t.giorno
  left join public.giustificazioni_ore g
    on g.dipendente_id = f.id
   and g.data = t.giorno
   and g.org_id = p_org
  order by f.cognome, f.nome, t.giorno;
end;
$fn$;

comment on function public.ore_griglia(uuid, date, date) is
  'Le ore per persona E per giorno, per la griglia settimanale: persone in riga, giorni in colonna. Ogni riga porta anche i cantieri di quel giorno con le rispettive ore e la giustificazione del tecnico, per il dettaglio che si apre cliccando la cella. Stesse regole di ore_periodo — solo giornate validate, ore di cantiere e foglio personale unite — cosi che i totali delle due viste coincidano. Security definer: il perimetro per assegnazione renderebbe la griglia incompleta.';

revoke all on function public.ore_griglia(uuid, date, date) from public;
grant execute on function public.ore_griglia(uuid, date, date) to authenticated;
