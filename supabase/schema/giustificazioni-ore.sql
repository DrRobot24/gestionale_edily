-- =====================================================================
-- LE GIUSTIFICAZIONI DELLE ORE
--
-- Chiesto dall'utente il 2026-09-21: quando a un operaio mancano ore
-- per arrivare a otto — o ne ha in eccedenza non dichiarate — l'invio
-- della giornata si blocca. Oggi il tecnico legge «mancano 2 ore» e deve
-- CERCARE A MANO in quale rapportino sta quella persona. Serve che possa
-- andarci dritto, e quando li' non basta, scrivere il motivo a mano.
--
-- LE PAROLE DELL'UTENTE, che spiegano anche perche' il campo libero:
-- «cosa ha fatto per giustificare quella mancanza di porzione di ora per
-- arrivare a 8».
--
--
-- PERCHE' UNA TABELLA NUOVA e non le note del rapportino
--
-- Perche' la domanda e' sulla PERSONA e sul GIORNO, non sul rapportino.
-- E' la stessa ragione per cui esiste `ore_giornata()`: Fadera con sei
-- ore sul cantiere X e tre sul Y ha fatto nove ore, e quel conto nessun
-- rapportino da solo lo sa fare.
--
-- Se il motivo finisse in `rapportini.annotazioni`, con le ore sparse su
-- tre cantieri andrebbe scritto su uno a caso dei tre — e chi fa le
-- paghe dovrebbe aprirli tutti per trovarlo. Una riga per persona e
-- giorno ha la stessa forma della domanda.
--
--
-- CHI SCRIVE: SOLO IL TECNICO, e l'utente e' stato esplicito.
--
-- «La motivazione delle ore mancanti le scrive solo chi fa i rapportini,
-- cioe' il tecnico. Infatti la validazione del titolare serve anche a
-- questo: se il tecnico non motiva bene qualcosa si respinge il
-- rapportino.»
--
-- Quindi il permesso e' `rapportini.create` — non `anagrafiche.write`,
-- non il titolare. E' la stessa regola delle ore: chi sta in cantiere e
-- vede le cose e' l'unico che sa perche' qualcuno e' andato via alle
-- quattro. Il titolare non corregge la motivazione: se non lo convince,
-- RESPINGE, e il tecnico la riscrive.
--
-- Questo fa del respingimento un controllo sulla QUALITA' della
-- motivazione, non solo sui numeri — ed e' un pezzo del flusso che
-- finora non c'era.
--
--
-- QUANDO SI PUO' CORREGGERE: finche' la giornata non e' validata.
--
-- Dopo, resta com'e'. Una motivazione modificabile dopo la firma
-- cambierebbe un dato su cui il titolare ha gia' deciso — e chi fa le
-- paghe leggerebbe una frase diversa da quella approvata.
--
--
-- DATABASE CONDIVISO CON WBS-OFFICE: qui si aggiunge soltanto.
-- Si puo' rilanciare senza danno.
--
-- Da eseguire nel SQL Editor, un blocco per volta, IN QUEST'ORDINE.
-- =====================================================================


-- =====================================================================
-- 1. I MOTIVI
-- =====================================================================
--
-- Un enum e non testo libero, per la ragione detta scegliendo con
-- l'utente: Stefania queste righe le leggera' facendo le paghe, e
-- «permesso» scritto in dieci modi diversi non si conta. Il testo
-- libero c'e' comunque, ACCANTO: l'elenco rende il dato utilizzabile, la
-- descrizione racconta il caso.
--
-- `straordinario` sta qui dentro e non e' un motivo di assenza: e'
-- l'altra faccia dello stesso controllo. Una persona sopra le otto ore
-- ha bisogno di dire perche', esattamente come una sotto.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'motivo_ore') then
    create type public.motivo_ore as enum (
      'permesso',
      'malattia',
      'ferie',
      'infortunio',
      'recupero',
      'straordinario',
      'altro'
    );
  end if;
end $$;


-- =====================================================================
-- 2. LA TABELLA
-- =====================================================================

create table if not exists public.giustificazioni_ore (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  data date not null,

  -- Che cosa si sta spiegando. Serve a far scegliere alla pagina le
  -- parole giuste, e a chi legge le paghe a capire di che riga si
  -- tratta senza rifare il conto.
  tipo text not null check (tipo in ('mancanza', 'eccedenza')),

  motivo public.motivo_ore not null,
  -- Il campo libero: «cosa ha fatto per giustificare quella mancanza».
  -- Facoltativo quando il motivo basta da solo (una giornata di ferie si
  -- spiega da se'), obbligatorio su 'altro' — un «altro» senza
  -- spiegazione e' una riga che non dice niente a chi la legge dopo.
  descrizione text,

  -- Quante ore copre. Si registra perche' la giustificazione vale per
  -- quel conto: se domani le ore cambiano, chi rilegge vede che la
  -- motivazione parlava di un'altra cifra.
  ore numeric(5,2) not null default 0 check (ore >= 0 and ore <= 24),

  scritta_da uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- UNA RISPOSTA PER PERSONA E GIORNO. La domanda e' una sola — «perche'
  -- quel giorno non fanno otto?» — e due righe diverse sarebbero due
  -- verita' su cui chi paga non saprebbe scegliere.
  constraint giustificazioni_ore_una_per_giorno
    unique (dipendente_id, data),

  constraint giustificazioni_ore_altro_spiegato
    check (motivo <> 'altro' or (descrizione is not null and btrim(descrizione) <> ''))
);

alter table public.giustificazioni_ore enable row level security;

create index if not exists giustificazioni_ore_giorno_idx
  on public.giustificazioni_ore (org_id, data);


-- =====================================================================
-- 3. CHI PUO' FARE COSA
-- =====================================================================
--
-- SCRIVE SOLO CHI COMPILA I RAPPORTINI. Decisione dell'utente, non
-- nostra: il titolare non corregge la motivazione, la respinge.
--
-- In LETTURA la vedono anche il titolare (che deve valutarla per
-- validare) e l'amministrazione (che la legge facendo le paghe).
-- `paghe.read` ed `economics.read` sono i permessi di chi tiene i conti,
-- gia' verificati sul database il 2026-09-21.

drop policy if exists giustificazioni_ore_select on public.giustificazioni_ore;
create policy giustificazioni_ore_select on public.giustificazioni_ore
  for select using (
    app.has_perm(org_id, 'rapportini.create')
    or app.has_perm(org_id, 'rapportini.validate')
    or app.has_perm(org_id, 'rapportini.read_all')
    or app.has_perm(org_id, 'paghe.read')
    or app.has_perm(org_id, 'economics.read')
  );

drop policy if exists giustificazioni_ore_insert on public.giustificazioni_ore;
create policy giustificazioni_ore_insert on public.giustificazioni_ore
  for insert with check (
    app.has_perm(org_id, 'rapportini.create')
    -- Chi scrive firma con il proprio nome. Non e' burocrazia: se una
    -- motivazione non convince, il titolare deve sapere a chi
    -- chiederne conto.
    and scritta_da = auth.uid()
  );

-- SI CORREGGE FINCHE' LA GIORNATA NON E' VALIDATA.
--
-- Il controllo guarda i rapportini di quella persona in quel giorno: se
-- ce n'e' anche uno solo gia' validato o contabilizzato, la
-- giustificazione e' congelata. Una motivazione modificabile dopo la
-- firma cambierebbe un dato su cui il titolare ha gia' deciso.
drop policy if exists giustificazioni_ore_update on public.giustificazioni_ore;
create policy giustificazioni_ore_update on public.giustificazioni_ore
  for update using (
    app.has_perm(org_id, 'rapportini.create')
    and not exists (
      select 1
      from public.rapportino_ore o
      join public.rapportini r on r.id = o.rapportino_id
      where o.dipendente_id = giustificazioni_ore.dipendente_id
        and r.data = giustificazioni_ore.data
        and r.stato in ('validato', 'contabilizzato')
    )
  )
  with check (app.has_perm(org_id, 'rapportini.create'));

drop policy if exists giustificazioni_ore_delete on public.giustificazioni_ore;
create policy giustificazioni_ore_delete on public.giustificazioni_ore
  for delete using (
    app.has_perm(org_id, 'rapportini.create')
    and not exists (
      select 1
      from public.rapportino_ore o
      join public.rapportini r on r.id = o.rapportino_id
      where o.dipendente_id = giustificazioni_ore.dipendente_id
        and r.data = giustificazioni_ore.data
        and r.stato in ('validato', 'contabilizzato')
    )
  );


-- =====================================================================
-- 4. DOVE STANNO LE ORE DI QUELLA PERSONA, QUEL GIORNO
-- =====================================================================
--
-- Serve al pulsante «apri il rapportino»: il tecnico legge «mancano 2
-- ore a Fadera» e deve poterci andare dritto invece di cercare a mano.
--
-- PERCHE' NON SI TOCCA `ore_giornata()`. Quella funzione e' `security
-- definer` e restituisce l'aggregato «mai su quali cantieri»: e' una
-- decisione del 2026-09-10 e regge il perimetro per assegnazione. Farle
-- dire i cantieri vorrebbe dire far vedere al tecnico quelli dei
-- colleghi.
--
-- Questa invece e' `security invoker`: mostra SOLO i rapportini che chi
-- guarda gia' vede. E' esattamente il comportamento giusto — se le ore
-- stanno sul cantiere di un collega, qui non compaiono e la pagina
-- offre il campo libero invece di un pulsante che porterebbe a un 403.
--
-- Il perimetro non cambia di una virgola: la RLS fa il suo lavoro da
-- se', e questa vista non aggiunge nessun accesso nuovo.

create or replace view public.v_ore_persona_giorno
with (security_invoker = on) as
select
  o.org_id,
  o.dipendente_id,
  r.data,
  r.id              as rapportino_id,
  r.stato,
  c.id              as cantiere_id,
  c.codice          as cantiere_codice,
  c.denominazione   as cantiere,
  o.ore_ordinarie,
  o.ore_straordinarie,
  o.ore_assenza,
  o.tipo_assenza
from public.rapportino_ore o
join public.rapportini r on r.id = o.rapportino_id
join public.cantieri   c on c.id = r.cantiere_id;

comment on view public.v_ore_persona_giorno is
  'Dove stanno le ore di una persona in un giorno, fra i rapportini che chi guarda puo'' gia'' vedere. Serve al pulsante «apri il rapportino» del controllo ore. security_invoker di proposito: il tecnico non deve vedere i cantieri dei colleghi.';


-- =====================================================================
-- =====================================================================
-- 5. LA GIUSTIFICAZIONE SBLOCCA L'INVIO
-- =====================================================================
--
-- Deciso con l'utente: scritto il motivo, la giornata parte.
--
-- IL RAGIONAMENTO, che vale la pena fissare: il blocco non serve a
-- impedire le giornate irregolari — quelle esistono, la gente va via
-- prima e fa gli straordinari — serve a non far passare ORE MUTE. Una
-- volta che c'e' una risposta, quel pezzo di flusso ha fatto il suo
-- lavoro e la palla passa al titolare, che valuta se la risposta
-- convince. Se non convince RESPINGE, e il tecnico riscrive.
--
--
-- ⚠️ COME SI APPLICA, e perche' non si riscrive la funzione.
--
-- `invia_foglio_giornata` e' lunga e fa cinque controlli in fila. Qui
-- ne cambia UNO: la condizione del controllo 8 ore. Riscriverla per
-- intero vorrebbe dire ricopiare a mano quattro blocchi che non
-- c'entrano — ed e' cosi' che si perde per strada un `motivo_rifiuto =
-- null` o un `c.stato = 'attivo'`, cambiando comportamenti che nessuno
-- voleva toccare.
--
-- Quindi si legge la definizione che c'e' nel database, si sostituisce
-- quel pezzo di testo, e si riesegue. Se il pezzo non si trova, il
-- blocco SI FERMA senza toccare niente e lo dice: meglio non applicare
-- la modifica che applicarla a meta'.
--
-- PREREQUISITO: `invio-due-posti.sql` deve essere gia' stato eseguito.

do $$
declare
  v_def   text;
  v_cerca text;
  v_metti text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'invia_foglio_giornata'
  limit 1;

  if v_def is null then
    raise exception 'La funzione invia_foglio_giornata non esiste: esegui prima invio-due-posti.sql.';
  end if;

  if v_def like '%giustificazioni_ore%' then
    raise notice 'La funzione guarda gia'' le giustificazioni. Niente da fare.';
    return;
  end if;

  -- Il pezzo da cambiare: la chiusura della `where` del controllo ore.
  -- E' la riga che esclude le assenze a giornata intera, ed e' l'ultima
  -- condizione prima del `;`.
  v_cerca := '      and not (g.assenze is not null and g.ore_assenza = 0)
    );';

  v_metti := '      and not (g.assenze is not null and g.ore_assenza = 0)
    )
    -- Dal 2026-09-21: se il tecnico ha gia'' scritto perche'', passa.
    -- Il blocco non serve a impedire le giornate irregolari, serve a
    -- non far passare ore MUTE. Con una risposta scritta la palla
    -- passa al titolare, che se non lo convince respinge.
    and not exists (
      select 1
      from public.giustificazioni_ore gi
      where gi.org_id = p_org
        and gi.dipendente_id = g.dipendente_id
        and gi.data = p_giorno
    );';

  if position(v_cerca in v_def) = 0 then
    raise exception 'Non trovo il punto da modificare in invia_foglio_giornata. La funzione e'' cambiata: applica la modifica a mano invece di indovinare.';
  end if;

  v_def := replace(v_def, v_cerca, v_metti);

  -- Il messaggio d'errore dice anche la strada nuova: dire cosa non va
  -- senza dire dove si rimedia obbliga a cercare la voce in sidebar
  -- mentre si e' fermi li'.
  v_def := replace(
    v_def,
    'Sistema e rimanda la giornata.',
    'Sistema le ore, oppure scrivi il motivo dal riquadro «Controllo delle ore» in home.'
  );

  execute v_def;
  raise notice 'Fatto: ora una giustificazione scritta sblocca l''invio.';
end $$;

-- =====================================================================
-- VERIFICHE — di sola lettura, UNA ALLA VOLTA nel SQL Editor.
-- =====================================================================

-- A. La tabella c'e', la RLS e' attiva, le policy sono quattro.
select
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'giustificazioni_ore'
      and c.relrowsecurity)                             as rls_attiva_deve_essere_1,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'giustificazioni_ore')
                                                        as policy_devono_essere_4,
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_ore_persona_giorno')
                                                        as vista_deve_essere_1;

-- B. La funzione dell'invio guarda le giustificazioni.
--    Deve dire `true`.
-- select pg_get_functiondef(p.oid) like '%giustificazioni_ore%' as guarda_le_giustificazioni
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'invia_foglio_giornata';

-- C. La vista e' `security_invoker`. Se non lo fosse, il tecnico
--    vedrebbe i cantieri dei colleghi: deve dire 'security invoker'.
-- select c.relname,
--        case when 'security_invoker=on' = any(c.reloptions)
--             then 'security invoker' else 'INVOKER MANCANTE — PERICOLO' end as modo
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'v_ore_persona_giorno';
