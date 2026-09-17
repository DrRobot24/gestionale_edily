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
-- per `org_id`: senza quel filtro si cancellerebbero i dati dell'altro
-- frontend e di ogni altra azienda sulla stessa istanza. NON togliere
-- quei `where`, mai.
--
-- COME SI USA: un blocco per volta, nel SQL Editor, IN QUEST'ORDINE.
-- L'ordine non e' estetico: le foreign key sono `restrict` (e' il
-- 23503 che l'interfaccia traduce in "ha gia' dei cantieri collegati"),
-- quindi i figli vanno prima dei genitori o Postgres si rifiuta. Se un
-- blocco fallisce, LEGGERE il messaggio: dice quale tabella figlia
-- manca da questo elenco.
--
-- Nomi verificati il 2026-09-17 contro `src/lib/database.types.ts`.
-- =====================================================================


-- ── PASSO 0. QUAL E' LA MIA ORGANIZZAZIONE ──────────────────────────
-- Serve l'id, da copiare in TUTTI i blocchi al posto di <ORG_ID>. Se
-- compare piu' di una riga, FERMARSI: bisogna sapere quale azienda si
-- sta svuotando.

select id, slug, ragione_sociale from public.organizations;


-- ── PASSO 1. COSA STO PER CANCELLARE ────────────────────────────────
-- Di sola lettura. E' l'ultimo momento in cui i numeri si guardano
-- senza conseguenze.

select 'cantieri'             as tabella, count(*) from public.cantieri              where org_id = '<ORG_ID>'
union all select 'rapportini',            count(*) from public.rapportini            where org_id = '<ORG_ID>'
union all select 'rapportino_ore',        count(*) from public.rapportino_ore        where org_id = '<ORG_ID>'
union all select 'note_contabili',        count(*) from public.note_contabili        where org_id = '<ORG_ID>'
union all select 'costi_cantiere',        count(*) from public.costi_cantiere        where org_id = '<ORG_ID>'
union all select 'ricavi_cantiere',       count(*) from public.ricavi_cantiere       where org_id = '<ORG_ID>'
union all select 'movimenti_magazzino',   count(*) from public.movimenti_magazzino   where org_id = '<ORG_ID>'
union all select 'clienti',               count(*) from public.clienti               where org_id = '<ORG_ID>'
union all select 'dipendenti',            count(*) from public.dipendenti            where org_id = '<ORG_ID>'
union all select 'fornitori',             count(*) from public.fornitori             where org_id = '<ORG_ID>'
union all select 'materiali',             count(*) from public.materiali             where org_id = '<ORG_ID>'
union all select 'mezzi',                 count(*) from public.mezzi                 where org_id = '<ORG_ID>';


-- ── PASSO 2. LE FOTO: I FILE PRIMA DELLE RIGHE ──────────────────────
-- ⚠️  Cancellare la riga NON cancella il file: resterebbe orfano nel
-- bucket `rapportini`, invisibile e a occupare spazio.
--
-- Questa query ELENCA i path da togliere a mano dallo Storage
-- (pannello Supabase → Storage → rapportini). Copiarli, cancellare i
-- file di la', POI proseguire.
--
-- Se si vuole fare in fretta e il bucket contiene SOLO roba di prova,
-- si puo' anche svuotare l'intera cartella dal pannello: e' piu' rapido
-- e qui dentro non c'e' niente di vero.

select f.storage_path
from public.rapportino_foto f
join public.rapportini r on r.id = f.rapportino_id
where r.org_id = '<ORG_ID>';


-- ── PASSO 3. I FIGLI DEI RAPPORTINI ─────────────────────────────────

delete from public.rapportino_foto
where rapportino_id in (select id from public.rapportini where org_id = '<ORG_ID>');

delete from public.rapportino_ore       where org_id = '<ORG_ID>';
delete from public.rapportino_materiali where org_id = '<ORG_ID>';
delete from public.rapportino_mezzi     where org_id = '<ORG_ID>';


-- ── PASSO 4. I RAPPORTINI ───────────────────────────────────────────

delete from public.rapportini where org_id = '<ORG_ID>';


-- ── PASSO 5. CIO' CHE PENDE DAL CANTIERE ────────────────────────────

delete from public.note_contabili  where org_id = '<ORG_ID>';
delete from public.costi_cantiere  where org_id = '<ORG_ID>';
delete from public.ricavi_cantiere where org_id = '<ORG_ID>';

delete from public.cantiere_assegnazioni
where cantiere_id in (select id from public.cantieri where org_id = '<ORG_ID>');

delete from public.movimenti_magazzino where org_id = '<ORG_ID>';


-- ── PASSO 6. I CANTIERI ─────────────────────────────────────────────

delete from public.cantieri where org_id = '<ORG_ID>';


-- ── PASSO 7. LO STORICO DEI COSTI, PRIMA DELLE ANAGRAFICHE ──────────
-- Le tariffe degli operai e i costi dei mezzi pendono dalle rispettive
-- schede: vanno prima loro.

delete from public.dipendente_costi
where dipendente_id in (select id from public.dipendenti where org_id = '<ORG_ID>');

delete from public.mezzo_costi
where mezzo_id in (select id from public.mezzi where org_id = '<ORG_ID>');


-- ── PASSO 8. LE ANAGRAFICHE ─────────────────────────────────────────
-- Si riparte da zero su tutte, deciso dall'utente il 2026-09-17.
--
-- NOTA sui DIPENDENTI: cancellare la scheda del tecnico scioglie anche
-- il collegamento al suo utente (`dipendenti.user_id`). Non e' un
-- guaio — l'utenza resta e il login funziona — ma la scheda nuova va
-- RICOLLEGATA a mano dall'amministrazione, o restano spenti il riquadro
-- "Le tue ore" in home e il blocco dell'invio della giornata. E' il
-- primo controllo da fare dopo aver ricaricato le anagrafiche.

delete from public.dipendenti where org_id = '<ORG_ID>';
delete from public.mezzi      where org_id = '<ORG_ID>';
delete from public.materiali  where org_id = '<ORG_ID>';
delete from public.clienti    where org_id = '<ORG_ID>';
delete from public.fornitori  where org_id = '<ORG_ID>';


-- ── PASSO 9. IL CONTATORE DEI NUMERI ────────────────────────────────
-- ⚠️  IL PASSO CHE SI DIMENTICA, e si vede subito.
--
-- `document_counters` tiene l'ultimo numero usato per tipo e per anno.
-- Svuotare le tabelle NON lo tocca: senza questo blocco il primo
-- rapportino VERO nascerebbe "n. 20/2026" invece che "n. 1/2026" — ed
-- e' il dettaglio che alla riunione fa dire "ma allora ci sono ancora
-- dati dentro".

select tipo, anno, ultimo from public.document_counters where org_id = '<ORG_ID>';

delete from public.document_counters where org_id = '<ORG_ID>';


-- ── PASSO 10. IL REGISTRO DELLE ATTIVITA' ───────────────────────────
-- `activity_log` e' la storia di cosa e' successo, comprese queste
-- cancellazioni. Si svuota perche' si vuole l'app come nuova, ma
-- sapendo cos'e': non e' un dato di prova, e' il registro.

delete from public.activity_log where org_id = '<ORG_ID>';


-- ── PASSO 11. VERIFICA ──────────────────────────────────────────────
-- Rieseguire il PASSO 1: tutti zero. Poi aprire l'app e guardare la
-- home: i registri devono mostrare zero e non deve esserci nessuna card
-- di cantiere.
--
-- Se un conteggio NON e' zero, non insistere col delete: vuol dire che
-- una foreign key ha fermato il blocco e il messaggio era scorso via.
-- Rileggerlo, aggiungere qui la tabella figlia che nomina, rieseguire.


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
