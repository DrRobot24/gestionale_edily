-- =====================================================================
-- PULIZIA DEI DATI DI PROVA — "app appena uscita dalla fabbrica"
--
-- Scritto il 2026-09-17 per svuotare il gestionale prima di inserire il
-- primo cantiere VERO, in vista della riunione del 21 settembre 2026.
--
-- ⚠️  LEGGERE PRIMA DI ESEGUIRE, TUTTO.
--
-- Questo file CANCELLA DAVVERO. Non archivia: `delete`, non `update
-- attivo = false`. E' quello che serve — un archiviato resta nel
-- database e si ritrova nelle tendine — ma vuol dire che NON SI TORNA
-- INDIETRO: lo schema di questo progetto non e' versionato e il piano
-- Supabase e' Free, quindi NON C'E' NESSUN BACKUP AUTOMATICO da cui
-- ripescare. Vedi STATO_LAVORI.md, "Lo schema non e' versionato e non
-- c'e' nessun backup".
--
-- IL DATABASE E' CONDIVISO CON wbs-office. Ogni istruzione e' filtrata
-- per `org_id`: senza quel filtro si cancellerebbero i dati dell'altro
-- frontend e di ogni altra azienda sulla stessa istanza. NON togliere
-- quei `where`, mai.
--
-- COME SI USA: un blocco per volta, nel SQL Editor, IN QUEST'ORDINE.
-- L'ordine non e' estetico: le foreign key sono `restrict` (e' il
-- 23503 che l'interfaccia traduce in "ha gia' dei cantieri
-- collegati"), quindi i figli vanno prima dei genitori o Postgres si
-- rifiuta. Quel rifiuto e' una protezione, non un ostacolo da
-- aggirare: se un blocco fallisce, LEGGERE il messaggio — dice quale
-- tabella figlia manca da questo elenco.
--
-- Nomi verificati il 2026-09-17 contro `src/lib/database.types.ts`.
-- =====================================================================


-- ── PASSO 0. QUAL E' LA MIA ORGANIZZAZIONE ──────────────────────────
-- Serve l'id, da copiare in TUTTI i blocchi successivi al posto di
-- <ORG_ID>. Se compare piu' di una riga, FERMARSI: bisogna sapere
-- quale azienda si sta svuotando.

select id, slug, ragione_sociale from public.organizations;


-- ── PASSO 1. COSA STO PER CANCELLARE ────────────────────────────────
-- Di sola lettura. Da eseguire PRIMA dei delete e da rileggere davvero:
-- e' l'ultimo momento in cui i numeri si guardano senza conseguenze.

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
-- file di la', POI proseguire col passo 3.

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
-- `note_contabili` ha `on delete cascade` e se ne andrebbe da sola al
-- passo 6: la si cancella lo stesso ed esplicitamente, perche' una
-- cancellazione che si vede e' meglio di una che accade per conto suo
-- mentre guardi un'altra tabella.

delete from public.note_contabili  where org_id = '<ORG_ID>';
delete from public.costi_cantiere  where org_id = '<ORG_ID>';
delete from public.ricavi_cantiere where org_id = '<ORG_ID>';

delete from public.cantiere_assegnazioni
where cantiere_id in (select id from public.cantieri where org_id = '<ORG_ID>');

-- I movimenti puntano al cantiere con `on delete set null`: non
-- bloccherebbero, ma un movimento senza cantiere e' un record di prova
-- senza significato. Si azzera il registro.
delete from public.movimenti_magazzino where org_id = '<ORG_ID>';


-- ── PASSO 6. I CANTIERI ─────────────────────────────────────────────

delete from public.cantieri where org_id = '<ORG_ID>';


-- ── PASSO 7. IL CONTATORE DEI NUMERI ────────────────────────────────
-- ⚠️  QUESTO E' IL PASSO CHE SI DIMENTICA, e si vede subito.
--
-- `document_counters` tiene l'ultimo numero usato per tipo e per anno.
-- Svuotare le tabelle NON lo tocca: senza questo blocco il primo
-- rapportino VERO nascerebbe "n. 20/2026" invece che "n. 1/2026", ed e'
-- esattamente il genere di dettaglio che alla riunione fa dire "ma
-- allora ci sono altri dati dentro".

select tipo, anno, ultimo from public.document_counters where org_id = '<ORG_ID>';

delete from public.document_counters where org_id = '<ORG_ID>';


-- ── PASSO 8. LE ANAGRAFICHE ─────────────────────────────────────────
-- ⚠️  DECIDERE UNA PER UNA: qui dentro ci puo' essere roba VERA.
-- Le righe sono commentate APPOSTA: vanno scommentate a ragion veduta,
-- non eseguite in blocco.
--
-- Gli OPERAI in particolare. Se la scheda del tecnico e' gia' collegata
-- al suo utente (`dipendenti.user_id`), cancellarla scioglie il
-- collegamento e va rifatto a mano dall'amministrazione — ed e' quello
-- da cui dipendono il riquadro "Le tue ore" e il blocco dell'invio.
-- Le tariffe storiche di un operaio vero non si ricostruiscono.

-- delete from public.dipendente_costi
-- where dipendente_id in (select id from public.dipendenti where org_id = '<ORG_ID>');
-- delete from public.dipendenti where org_id = '<ORG_ID>';

-- delete from public.clienti   where org_id = '<ORG_ID>';
-- delete from public.fornitori where org_id = '<ORG_ID>';
-- delete from public.materiali where org_id = '<ORG_ID>';

-- I mezzi hanno i loro costi storici, stessa logica dei dipendenti.
-- delete from public.mezzo_costi
-- where mezzo_id in (select id from public.mezzi where org_id = '<ORG_ID>');
-- delete from public.mezzi where org_id = '<ORG_ID>';


-- ── PASSO 9. VERIFICA ───────────────────────────────────────────────
-- Rieseguire il PASSO 1: tutti zero, tranne cio' che si e' deciso di
-- tenere. Poi aprire l'app e guardare la home: i registri devono
-- mostrare zero e non deve esserci nessuna card di cantiere.
--
-- `activity_log` NON viene toccato da questo file: e' il registro di
-- cosa e' successo, e svuotarlo vorrebbe dire cancellare la storia
-- delle cancellazioni stesse. Se lo si vuole pulito per la riunione e'
-- una scelta a parte, da fare sapendo cos'e'.
