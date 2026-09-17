-- =====================================================================
-- PULIZIA TOTALE DEI DATI — "app appena uscita dalla fabbrica"
--
-- Scritto il 2026-09-17, su richiesta esplicita dell'utente: si riparte
-- da ZERO con anagrafiche nuove — operai, mezzi, clienti, fornitori,
-- materiali — e il primo cantiere VERO, in vista della riunione del
-- 21 settembre 2026.
--
-- ⚠️  LEGGERE PRIMA DI ESEGUIRE, TUTTO.
--
-- Questo file CANCELLA DAVVERO, e cancella TUTTO il contenuto
-- dell'azienda. Non archivia: `delete`, non `update attivo = false`.
-- E' quello che serve — un archiviato resta nel database e si ritrova
-- nelle tendine — ma vuol dire che NON SI TORNA INDIETRO: lo schema non
-- e' versionato e il piano Supabase e' Free, quindi NON C'E' NESSUN
-- BACKUP da cui ripescare.
--
-- COSA RESTA IN PIEDI, ed e' apposta:
--   - la STRUTTURA: tabelle, viste, policy, trigger, funzioni
--   - `organizations`  l'azienda stessa
--   - `memberships`    CHI PUO' ENTRARE. Cancellarle vorrebbe dire
--                      chiudersi fuori dal gestionale: gli utenti non
--                      sono dati di prova, sono le chiavi di casa.
--   - `role_permissions` / `permissions`  il modello dei ruoli
--   - `profiles`       le persone dietro le utenze
--
-- IL DATABASE E' CONDIVISO CON wbs-office. Ogni istruzione e' filtrata
-- sull'azienda: senza quel filtro si cancellerebbero i dati dell'altro
-- frontend e di ogni altra azienda sulla stessa istanza.
--
-- ✅ NIENTE DA SOSTITUIRE. L'id dell'azienda e' gia' scritto dentro,
-- fornito dall'utente il 2026-09-17:
--
--     0d989cd9-d077-48f6-8ab9-6b5434229394
--
-- Il PASSO 1 lo mostra in chiaro con la ragione sociale accanto: quella
-- riga e' la verifica che si stia svuotando l'azienda giusta e non
-- wbs-office. Leggerla prima di proseguire.
--
-- Nomi verificati il 2026-09-17 contro `src/lib/database.types.ts`.
-- =====================================================================


-- ── PASSO 0. QUALE AZIENDA STO PER SVUOTARE ─────────────────────────
-- Di sola lettura, e ormai facoltativo: l'id e' gia' nel file. Serve
-- solo a rivedere l'elenco — su questa istanza c'e' anche wbs-office.

select id, slug, ragione_sociale from public.organizations order by ragione_sociale;


-- ── PASSO 1. COSA STO PER CANCELLARE ────────────────────────────────
-- Di sola lettura, e l'ultimo momento in cui i numeri si guardano senza
-- conseguenze.
--
-- ⚠️  LA PRIMA RIGA E' LA VERIFICA PIU' IMPORTANTE del file: dice
-- «AZIENDA: <ragione sociale>». Deve essere EDILY. Se dice wbs-office o
-- un altro nome, FERMARSI — l'id e' quello sbagliato. Se la riga manca
-- del tutto, l'id non esiste e tutti gli zeri sotto non sarebbero una
-- pulizia riuscita, ma un filtro che non trova niente.

select 'AZIENDA: ' || ragione_sociale as tabella, 1::bigint as quante
  from public.organizations where id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'cantieri',            count(*) from public.cantieri              where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'rapportini',          count(*) from public.rapportini            where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'rapportino_ore',      count(*) from public.rapportino_ore        where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'note_contabili',      count(*) from public.note_contabili        where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'costi_cantiere',      count(*) from public.costi_cantiere        where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'ricavi_cantiere',     count(*) from public.ricavi_cantiere       where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'movimenti_magazzino', count(*) from public.movimenti_magazzino   where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'clienti',             count(*) from public.clienti               where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'dipendenti',          count(*) from public.dipendenti            where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'fornitori',           count(*) from public.fornitori             where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'materiali',           count(*) from public.materiali             where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
union all select 'mezzi',               count(*) from public.mezzi                 where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid;


-- ── PASSO 2. LE FOTO: I FILE PRIMA DELLE RIGHE ──────────────────────
-- ⚠️  Cancellare la riga NON cancella il file: resterebbe orfano nel
-- bucket `rapportini`, invisibile e a occupare spazio.
--
-- Questa query ELENCA i path da togliere a mano dallo Storage
-- (pannello Supabase → Storage → rapportini). Se il bucket contiene
-- SOLO roba di prova — ed e' il caso — si puo' anche svuotare l'intera
-- cartella dal pannello, che e' piu' rapido.

select f.storage_path
from public.rapportino_foto f
join public.rapportini r on r.id = f.rapportino_id
where r.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid;


-- ── PASSO 3. LA CANCELLAZIONE, IN UN BLOCCO SOLO ────────────────────
-- Da eseguire TUTTO INSIEME, dal `do` al `$$;` finale: e' una
-- transazione unica, quindi o passa tutto o non passa niente. Meta'
-- pulizia sarebbe il peggiore dei risultati — un database con i
-- cantieri spariti e i rapportini orfani non lo raddrizzi senza backup.
--
-- L'ordine segue le foreign key, che sono `restrict`: i figli prima dei
-- genitori. Se qualcosa manca da questo elenco, Postgres si ferma con
-- un 23503 che NOMINA la tabella: aggiungerla qui e rieseguire. Il
-- rollback avra' gia' rimesso tutto a posto da solo.

do $$
declare
  org  uuid;
  nome text;
begin
  -- L'id NON si da' per buono: si va a leggere l'azienda che nomina.
  -- Se non esiste, `org` resta nullo e ogni `where org_id = null` non
  -- toccherebbe una riga — un successo silenzioso, scoperto solo
  -- aprendo l'app e ritrovando tutti i dati al loro posto.
  select id, ragione_sociale into org, nome
  from public.organizations
  where id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid;

  if org is null then
    raise exception 'Nessuna azienda con questo id. Non ho cancellato niente: controlla il passo 0.';
  end if;

  raise notice 'Sto per svuotare: %', nome;

  -- i figli del rapportino
  delete from public.rapportino_foto
  where rapportino_id in (select id from public.rapportini where org_id = org);
  delete from public.rapportino_ore       where org_id = org;
  delete from public.rapportino_materiali where org_id = org;
  delete from public.rapportino_mezzi     where org_id = org;

  -- i rapportini
  delete from public.rapportini where org_id = org;

  -- cio' che pende dal cantiere
  delete from public.note_contabili  where org_id = org;
  delete from public.costi_cantiere  where org_id = org;
  delete from public.ricavi_cantiere where org_id = org;
  delete from public.cantiere_assegnazioni
  where cantiere_id in (select id from public.cantieri where org_id = org);
  delete from public.movimenti_magazzino where org_id = org;

  -- i cantieri
  delete from public.cantieri where org_id = org;

  -- lo storico costi, che pende dalle anagrafiche
  delete from public.dipendente_costi
  where dipendente_id in (select id from public.dipendenti where org_id = org);
  delete from public.mezzo_costi
  where mezzo_id in (select id from public.mezzi where org_id = org);

  -- le anagrafiche.
  --
  -- NOTA sui DIPENDENTI: cancellare la scheda del tecnico scioglie il
  -- collegamento al suo utente (`dipendenti.user_id`). Non e' un guaio
  -- — l'utenza resta e il login funziona — ma la scheda nuova va
  -- RICOLLEGATA a mano dall'amministrazione, o restano spenti il
  -- riquadro "Le tue ore" in home e il blocco dell'invio della
  -- giornata. E' il primo controllo da fare dopo il ricarico.
  delete from public.dipendenti where org_id = org;
  delete from public.mezzi      where org_id = org;
  delete from public.materiali  where org_id = org;
  delete from public.clienti    where org_id = org;
  delete from public.fornitori  where org_id = org;

  -- IL CONTATORE DEI NUMERI: il passo che si dimentica, e si vede
  -- subito. `document_counters` tiene l'ultimo numero usato per tipo e
  -- anno, e svuotare le tabelle non lo tocca. Senza questa riga il
  -- primo rapportino VERO nascerebbe "n. 20/2026" invece che
  -- "n. 1/2026" — il dettaglio che alla riunione fa dire "ma allora ci
  -- sono ancora dati dentro".
  delete from public.document_counters where org_id = org;

  -- il registro delle attivita'. Non e' un dato di prova, e' la storia
  -- di cosa e' successo: si svuota perche' si vuole l'app come nuova,
  -- sapendo cos'e'.
  delete from public.activity_log where org_id = org;

  raise notice 'Fatto. Azienda svuotata: % (%)', nome, org;
end $$;


-- ── PASSO 4. VERIFICA ───────────────────────────────────────────────
-- Rieseguire il PASSO 1: la riga AZIENDA deve esserci ancora, tutto il
-- resto a zero. Poi aprire l'app e guardare la home: i sei registri
-- devono mostrare zero — Subappalti un trattino, che non ha ancora una
-- tabella — e nessuna card di cantiere.


-- ── DOPO: L'ORDINE DI RICARICO ──────────────────────────────────────
-- Non e' casuale, ed e' lo stesso della sidebar: un cantiere vuole il
-- suo cliente, una squadra vuole gli operai.
--
--   1. Clienti
--   2. Operai        → e SUBITO il collegamento utente del tecnico
--   3. Fornitori
--   4. Materiali / Mezzi
--   5. Cantiere      → poi l'assegnazione della squadra, che la fa
--                      Giuseppe (`cantieri.assign` e' di owner e admin)
--
-- ⚠️  UN SOLO cantiere attivo. Il blocco all'invio della giornata conta
-- TUTTI i cantieri con stato `attivo`: se ne resta aperto uno in piu',
-- il tecnico la sera si vede "Mancano 2 schede" e non manda niente.
