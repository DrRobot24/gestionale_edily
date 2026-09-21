-- =====================================================================
-- LE FIGURE: chi sono i personaggi di un cliente e di un cantiere
--
-- Chiesto dall'utente il 2026-09-21: «nella scheda cliente voglio poter
-- inserire le figure apicali del cliente: D.L. (Direttore Lavori), poi
-- Amministratore ed infine altre figure come RSPP/ASPP oppure CSE. E le
-- voglio vedere anche come colonne nella tabella riepilogativa, cosi' so
-- ogni cantiere che personaggi ha all'interno».
--
-- COSA C'ERA. Il testo libero nelle note del cliente. Nello screenshot
-- del Condominio Mazzotta si legge:
--
--     Amministratore : Ing. Renato La Runa
--     DL : Ing. Adriano De Franciscis
--          Arch. Salvatore Bottaro
--
-- E' scritto bene, ma scritto li' dentro non si puo' fare niente: non e'
-- una colonna, non si cerca, non si telefona, e se due clienti hanno lo
-- stesso amministratore il programma non lo sa.
--
--
-- DOVE VIVE OGNI FIGURA — la decisione dell'utente (2026-09-21)
--
-- La domanda posta era: le figure appartengono al cliente o al singolo
-- cantiere? La risposta scelta: **l'amministratore e il referente sul
-- CLIENTE, il resto sul CANTIERE**.
--
-- E' la divisione giusta e vale la pena scrivere perche':
--
--   l'amministratore di un condominio e' sempre lo stesso, qualunque
--   lavoro si faccia. Sta sul cliente.
--
--   il Direttore Lavori e i coordinatori della sicurezza sono NOMINATI
--   PER QUELL'OPERA. Lo stesso condominio che fa due interventi in anni
--   diversi puo' avere due DL diversi, e il CSE e' per definizione il
--   Coordinatore per la Sicurezza in fase di Esecuzione *di quel
--   cantiere*. Stanno sul cantiere.
--
-- Metterle tutte sul cliente sarebbe stato piu' veloce, ma il secondo
-- lavoro avrebbe sovrascritto il DL del primo e si sarebbe perso chi
-- seguiva cosa. In edilizia quella e' proprio l'informazione che si va a
-- cercare due anni dopo, quando salta fuori un problema.
--
-- IL VINCOLO NON E' NELLO SCHEMA, ed e' deliberato: la tabella accetta
-- qualunque ruolo su qualunque ambito. Un DL messo sul cliente non e'
-- un errore del database, e' una scelta di chi compila — magari quel
-- cliente ha davvero un tecnico di fiducia fisso. A guidare e' il form,
-- che propone i ruoli giusti per ogni scheda; il database non impone
-- una regola di prassi che potrebbe avere eccezioni vere.
--
--
-- UNA TABELLA SOLA, come per i documenti
--
-- Stessa forma di `documenti`: una coppia (`ambito`, `riferimento_id`).
-- Una figura e' sempre la stessa cosa — un ruolo, un nome, un recapito —
-- e cambia solo a che cosa e' attaccata. Due tabelle identiche
-- vorrebbero dire due volte le policy e due posti dove correggere lo
-- stesso difetto.
--
-- ⚠️ LO STESSO PREZZO DEI DOCUMENTI, detto perche' si sappia: senza
-- chiave esterna il database non cancella da solo le figure di un
-- cliente cancellato. Restano righe orfane, e la query di manutenzione
-- in fondo le trova.
--
-- COSA SI REGISTRA: nome, titolo e recapiti. Scelto dall'utente fra le
-- opzioni proposte. NON ci sono numero d'albo ne' date di incarico: le
-- prime servono se quei dati finiscono in documenti ufficiali (notifica
-- preliminare, POS) e oggi non ci finiscono; le seconde servono se una
-- figura cambia a meta' cantiere, e finche' non capita sono due campi
-- che si compilano per niente. La tabella regge l'aggiunta senza
-- migrazioni di dati.
--
-- DATABASE CONDIVISO CON WBS-OFFICE: qui si aggiunge soltanto.
-- Si puo' rilanciare senza danno.
--
-- Da eseguire nel SQL Editor, un blocco per volta, IN QUEST'ORDINE.
-- =====================================================================


-- =====================================================================
-- 1. A CHE COSA E' ATTACCATA
-- =====================================================================
--
-- Un enum suo e non `ambito_documento`: quello ha quattro valori di cui
-- due (fornitore, materiale) qui non hanno senso, e un enum condiviso
-- fra due tabelle diventa il posto dove si aggiunge un valore per una e
-- si rompe il significato dell'altra.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ambito_figura') then
    create type public.ambito_figura as enum ('cliente', 'cantiere');
  end if;
end $$;


-- =====================================================================
-- 2. I RUOLI
-- =====================================================================
--
-- Un enum e non testo libero. «Campi che dovrebbero essere enum e sono
-- testo libero» e' gia' un difetto noto del progetto: qui non se ne
-- aggiunge un altro, perche' su testo libero «D.L.», «DL» e «Direttore
-- Lavori» diventerebbero tre ruoli diversi e la colonna in elenco non
-- si potrebbe fare.
--
-- Cosa sono, per chi legge il codice fra un anno:
--
--   amministratore  l'amministratore del condominio. Sta sul CLIENTE:
--                   e' lui qualunque lavoro si faccia.
--   referente       la persona da chiamare per prima. Sul cliente.
--   dl              Direttore dei Lavori. Nominato dal committente per
--                   quell'opera, sta sul CANTIERE.
--   progettista     chi ha firmato il progetto.
--   csp             Coordinatore Sicurezza in fase di Progettazione.
--   cse             Coordinatore Sicurezza in fase di Esecuzione. E' la
--                   figura che in cantiere si incontra davvero.
--   rspp            Responsabile del Servizio Prevenzione e Protezione.
--   aspp            Addetto al Servizio Prevenzione e Protezione.
--   rup             Responsabile Unico del Procedimento. Serve quando il
--                   committente e' pubblico.
--   collaudatore    chi collauda l'opera.
--   altro           tutto il resto: il campo `ruolo_libero` dice quale.
--
-- L'ordine dei valori NON e' alfabetico ed e' quello in cui le figure
-- si leggono in una scheda: prima chi comanda, poi chi progetta, poi la
-- sicurezza. `order by ruolo` su un enum ordina per posizione di
-- dichiarazione, quindi questa riga decide come appariranno in pagina
-- senza che nessuno debba scrivere un ordinamento a mano.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ruolo_figura') then
    create type public.ruolo_figura as enum (
      'amministratore',
      'referente',
      'rup',
      'dl',
      'progettista',
      'csp',
      'cse',
      'rspp',
      'aspp',
      'collaudatore',
      'altro'
    );
  end if;
end $$;


-- =====================================================================
-- 3. LA TABELLA
-- =====================================================================

create table if not exists public.figure (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  ambito public.ambito_figura not null,
  -- L'id della cosa a cui appartiene. Niente foreign key perche'
  -- punterebbe a due tabelle diverse: vedi l'avvertenza in cima.
  riferimento_id uuid not null,

  ruolo public.ruolo_figura not null,
  -- Quando `ruolo` e' 'altro', qui c'e' come si chiama davvero. Un
  -- vincolo lo impone: 'altro' senza spiegazione e' una riga che non
  -- dice niente a chi la legge dopo.
  ruolo_libero text,

  -- Il titolo separato dal nome perche' e' cosi' che si scrive in
  -- edilizia — «Ing. Renato La Runa» — e tenerlo in una colonna sua
  -- permette di ordinare per cognome senza che «Ing.» finisca in testa
  -- a tutto. Resta facoltativo: un amministratore puo' non averne.
  titolo text,
  nominativo text not null,

  telefono text,
  email text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint figure_nominativo_non_vuoto
    check (btrim(nominativo) <> ''),

  -- 'altro' vuole la spiegazione; gli altri ruoli non la vogliono,
  -- perche' un «DL» con scritto accanto «Direttore Lavori» e' rumore.
  constraint figure_altro_ha_un_nome
    check (
      (ruolo = 'altro' and ruolo_libero is not null and btrim(ruolo_libero) <> '')
      or (ruolo <> 'altro' and ruolo_libero is null)
    )
);

alter table public.figure enable row level security;

-- L'indice sulla coppia, che e' come si legge sempre: «le figure di
-- QUESTO cantiere». Senza, ogni apertura di scheda e' una scansione.
create index if not exists figure_riferimento_idx
  on public.figure (ambito, riferimento_id);

create index if not exists figure_org_idx on public.figure (org_id);


-- Aggiornare `updated_at` da solo. Il progetto ha gia' questa funzione
-- da wbs-office; se non esistesse, il trigger non si crea e la colonna
-- resta ferma alla creazione — non e' un dato su cui si decide niente.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname in ('public', 'app')
  ) then
    drop trigger if exists figure_updated_at on public.figure;
    execute 'create trigger figure_updated_at
             before update on public.figure
             for each row execute function ' ||
             (select n.nspname || '.set_updated_at'
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where p.proname = 'set_updated_at'
                and n.nspname in ('public', 'app')
              limit 1) || '()';
  end if;
end $$;


-- =====================================================================
-- 4. CHI PUO' FARE COSA
-- =====================================================================
--
-- Scrive chi tiene i registri (`anagrafiche.write`): alla Edily
-- Stefania e Giuseppe. E' la stessa regola dei documenti e delle
-- anagrafiche in generale — il tecnico non compila i registri.
--
-- IN LETTURA IL TECNICO VEDE LE FIGURE DEI CANTIERI SUOI, e qui la
-- scelta e' piu' larga che sui documenti. Sui documenti di cliente il
-- tecnico e' escluso perche' contratti e listini sono commerciali. Le
-- figure di cantiere no: il DL e il CSE sono le persone che in cantiere
-- INCONTRA, e sapere chi chiamare quando il coordinatore della
-- sicurezza deve vedere una cosa e' esattamente lavoro suo. Un numero di
-- telefono che sta nel gestionale ma non si puo' leggere dal posto dove
-- serve e' un numero che finisce su un foglietto.
--
-- Le figure del CLIENTE restano fuori dal suo perimetro, come
-- l'anagrafica clienti che gia' oggi non vede.

drop policy if exists figure_select on public.figure;
create policy figure_select on public.figure
  for select using (
    app.has_perm(org_id, 'anagrafiche.write')
    or (
      ambito = 'cantiere'
      and app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(riferimento_id)
    )
  );

drop policy if exists figure_insert on public.figure;
create policy figure_insert on public.figure
  for insert with check (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists figure_update on public.figure;
create policy figure_update on public.figure
  for update using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists figure_delete on public.figure;
create policy figure_delete on public.figure
  for delete using (app.has_perm(org_id, 'anagrafiche.write'));


-- =====================================================================
-- 5. LE COLONNE NELL'ELENCO
-- =====================================================================
--
-- «Le voglio vedere anche come colonne nella tabella riepilogativa
-- panoramica»: questa vista risponde a quella richiesta.
--
-- Perche' una vista e non una query nel frontend. Nell'elenco cantieri
-- servono DL e CSE accanto a ogni riga: senza, il frontend farebbe una
-- chiamata per cantiere — venti cantieri, ventuno richieste — oppure
-- scaricherebbe tutte le figure e le raggrupperebbe a mano, che e' la
-- stessa cosa con piu' codice.
--
-- `security_invoker = on` COME TUTTE LE ALTRE, e qui va bene: chi legge
-- l'elenco cantieri ha gia' il suo perimetro, e la vista deve
-- rispettarlo. E' il contrario del caso delle ore, dove il perimetro
-- avrebbe falsato un TOTALE: qui non si somma niente, si accostano
-- nomi a righe che chi guarda gia' vede.
--
-- `string_agg` e non una riga per figura: in una colonna di tabella ci
-- va il testo che si legge, e due DL sullo stesso cantiere — capita,
-- vedi il Condominio Mazzotta che ne ha due — devono stare nella stessa
-- cella separati da virgola, non raddoppiare la riga del cantiere.

create or replace view public.v_figure_riepilogo
with (security_invoker = on) as
select
  f.ambito,
  f.riferimento_id,
  f.org_id,
  string_agg(
    btrim(coalesce(f.titolo, '') || ' ' || f.nominativo), ', '
    order by f.nominativo
  ) filter (where f.ruolo = 'amministratore') as amministratore,
  string_agg(
    btrim(coalesce(f.titolo, '') || ' ' || f.nominativo), ', '
    order by f.nominativo
  ) filter (where f.ruolo = 'referente')      as referente,
  string_agg(
    btrim(coalesce(f.titolo, '') || ' ' || f.nominativo), ', '
    order by f.nominativo
  ) filter (where f.ruolo = 'dl')             as dl,
  string_agg(
    btrim(coalesce(f.titolo, '') || ' ' || f.nominativo), ', '
    order by f.nominativo
  ) filter (where f.ruolo = 'cse')            as cse,
  string_agg(
    btrim(coalesce(f.titolo, '') || ' ' || f.nominativo), ', '
    order by f.nominativo
  ) filter (where f.ruolo in ('rspp', 'aspp')) as sicurezza,
  count(*)::integer                            as quante
from public.figure f
group by f.ambito, f.riferimento_id, f.org_id;

comment on view public.v_figure_riepilogo is
  'Le figure di ogni cliente e cantiere, gia'' impaginate per le colonne degli elenchi. security_invoker: chi legge vede le figure delle cose che gia'' vede.';


-- =====================================================================
-- VERIFICHE — di sola lettura, UNA ALLA VOLTA nel SQL Editor.
-- (Il SQL Editor mostra solo il risultato dell'ULTIMA query quando se
--  ne lanciano piu' d'una insieme.)
-- =====================================================================

-- A. La tabella c'e', ha la RLS attiva e le sue quattro policy.
select
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'figure' and c.relrowsecurity)
    as rls_attiva_deve_essere_1,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'figure')
    as policy_devono_essere_4;

-- B. La vista esiste ed e' `security_invoker`.
-- select c.relname,
--        case when 'security_invoker=on' = any(c.reloptions)
--             then 'security invoker' else 'INVOKER MANCANTE' end as modo
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'v_figure_riepilogo';

-- C. MANUTENZIONE: le figure rimaste orfane.
--    E' il prezzo della tabella unica, dichiarato in cima. Da lanciare
--    ogni tanto; se tira fuori righe, si cancellano a mano.
-- select f.id, f.ambito, f.riferimento_id, f.ruolo, f.nominativo
-- from public.figure f
-- where (f.ambito = 'cliente'
--        and not exists (select 1 from public.clienti c where c.id = f.riferimento_id))
--    or (f.ambito = 'cantiere'
--        and not exists (select 1 from public.cantieri k where k.id = f.riferimento_id));
