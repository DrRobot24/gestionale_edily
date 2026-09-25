-- =====================================================================
-- L'ORARIO DA CONTRATTO: tempo pieno a otto ore, o part-time
--
-- Domanda dell'utente del 2026-09-25: «abbiamo considerato il caso in
-- cui una risorsa e' impiegata part-time, cioe' a 4 ore al giorno,
-- oppure full-time a 8?». No: l'8 era scritto fisso in tutto il
-- programma. Un part-time da quattro ore avrebbe fermato l'invio della
-- giornata ogni giorno («4 ore in meno delle 8»), sarebbe stato giallo
-- in tutto il foglio presenze, e una sua giornata di ferie sarebbe
-- valsa otto ore invece di quattro.
--
-- DECISO CON L'UTENTE:
--   * part-time A ORE: meno ore tutti i giorni feriali (il part-time «a
--     giorni» non e' stato chiesto);
--   * vale DA UNA DATA IN POI, «tutto lineare finche' non viene
--     interrotto»: uno storico, come le paghe. I mesi passati restano
--     misurati col loro orario;
--   * lo cambiano solo Stefania e il titolare, cioe' chi tiene le
--     anagrafiche (`anagrafiche.write`).
--
-- SENZA NESSUNA RIGA VALE 8: chi e' a tempo pieno non deve avere niente
-- di scritto, e tutto il pregresso continua a funzionare com'era.
--
-- COSA CAMBIA NEL DATABASE, oltre alla tabella:
--   3. `ore_griglia`: un'assenza a giornata intera vale le ore del
--      contratto, non 8. E' la funzione del foglio presenze, della
--      pagina Economia e del Riepilogo economico.
--   4. `invia_foglio_giornata`: il controllo delle ore misura ognuno col
--      suo contratto. E in piu' si corregge un difetto nato lo stesso
--      giorno: «nessun operaio rimasto fuori» decideva chi e' in forza
--      dalla data di ASSUNZIONE; conta la MESSA IN SERVIZIO.
-- Le due funzioni sono copiate dai loro file (`ore-griglia.sql`,
-- `assenze.sql`), aggiornati allo stesso modo: questo file le ridefinisce
-- senza dover rieseguire quelli.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend. Si puo'
-- rilanciare.
-- =====================================================================


-- ── 1. LO STORICO DEGLI ORARI ───────────────────────────────────────

create table if not exists public.dipendente_orari (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  dipendente_id  uuid not null references public.dipendenti(id) on delete cascade,
  valido_dal     date not null,
  -- Le ore di una giornata piena per questa persona. Sopra le 12 non e'
  -- un contratto, e' un refuso.
  ore_giorno     numeric(4,2) not null check (ore_giorno > 0 and ore_giorno <= 12),
  note           text,
  scritto_da     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Due orari che partono lo stesso giorno: quale vale? Nessuno.
  constraint dipendente_orari_uno_per_giorno unique (dipendente_id, valido_dal)
);

create index if not exists dipendente_orari_persona_idx
  on public.dipendente_orari (dipendente_id, valido_dal desc);

alter table public.dipendente_orari enable row level security;

-- Lo legge chi legge le anagrafiche: il tecnico compreso, perche' il
-- controllo delle ore in home deve sapere chi e' part-time.
drop policy if exists dipendente_orari_select on public.dipendente_orari;
create policy dipendente_orari_select on public.dipendente_orari
  for select using (app.has_perm(org_id, 'anagrafiche.read'));

drop policy if exists dipendente_orari_scrive on public.dipendente_orari;
create policy dipendente_orari_scrive on public.dipendente_orari
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

-- La persona dev'essere dell'azienda della riga.
create or replace function public.dipendente_orari_controlla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  org_persona uuid;
begin
  select d.org_id into org_persona from public.dipendenti d where d.id = new.dipendente_id;
  if org_persona is null or org_persona <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists dipendente_orari_controlla on public.dipendente_orari;
create trigger dipendente_orari_controlla
  before insert or update on public.dipendente_orari
  for each row execute function public.dipendente_orari_controlla();


-- ── 2. QUANTE ORE DA CONTRATTO AVEVA QUELLA PERSONA QUEL GIORNO ──────
-- L'orario piu' recente gia' cominciato; 8 se non c'e' niente.
-- `security definer` perche' la chiamano funzioni lanciate da chi non
-- legge questa tabella direttamente.

create or replace function app.ore_contratto(p_dipendente uuid, p_giorno date)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select o.ore_giorno
     from public.dipendente_orari o
     where o.dipendente_id = p_dipendente
       and o.valido_dal <= p_giorno
     order by o.valido_dal desc
     limit 1),
    8::numeric
  );
$fn$;

grant execute on function app.ore_contratto(uuid, date) to authenticated;


-- ── 3. LE ASSENZE A GIORNATA INTERA VALGONO LE ORE DEL CONTRATTO ────
-- Stessa funzione di `ore-griglia.sql`, cambia una riga: al posto di
-- `8::numeric`, `app.ore_contratto(...)`. Stessa firma e stesse colonne,
-- quindi basta `create or replace` e i permessi restano.

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


-- ── 4. L'INVIO DELLA GIORNATA MISURA OGNUNO COL SUO CONTRATTO ───────
-- Stessa funzione di `assenze.sql`, due cambi: il controllo delle ore
-- usa `app.ore_contratto` invece dell'8, e «nessuno dimenticato» guarda
-- la messa in servizio invece dell'assunzione.

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

-- ── 5. VERIFICA ─────────────────────────────────────────────────────
-- La tabella con la RLS, e la funzione che risponde: senza orari scritti
-- deve dire 8 per chiunque.

select c.relname as tabella, c.relrowsecurity as rls_attiva
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'dipendente_orari';

select d.cognome, d.nome, app.ore_contratto(d.id, current_date) as ore_oggi
from public.dipendenti d
order by d.cognome, d.nome;
