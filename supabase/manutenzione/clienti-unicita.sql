-- =====================================================================
-- clienti: nessun vincolo di unicita' sugli identificativi fiscali
--
-- Scoperto il 2026-09-01 mentre si indagavano le collazioni: la tabella
-- `clienti` ha solo `clienti_pkey` su `id` e `clienti_org_idx` su
-- `org_id`. Niente unicita' su `partita_iva` ne' su `codice_fiscale`.
-- Il form valida il formato (11 cifre) e pretende almeno un
-- identificativo, ma l'unicita' non la controlla nessuno: due clienti
-- identici entrano in silenzio.
--
-- Da eseguire nel SQL Editor, nell'ordine. Vedi STATO_LAVORI.md.
-- =====================================================================


-- 1. CI SONO GIA' DUPLICATI?
-- Da fare per primo: se ce ne sono, la creazione dell'indice fallisce e
-- vanno sistemati a mano prima (decidendo quale record tenere).
select org_id, partita_iva, count(*) as quanti,
       string_agg(ragione_sociale, ' | ') as coinvolti
from public.clienti
where partita_iva is not null
group by org_id, partita_iva
having count(*) > 1;

select org_id, codice_fiscale, count(*) as quanti,
       string_agg(ragione_sociale, ' | ') as coinvolti
from public.clienti
where codice_fiscale is not null
group by org_id, codice_fiscale
having count(*) > 1;


-- 2. I VINCOLI
-- La chiave e' (org_id, identificativo), MAI l'identificativo da solo:
-- due imprese diverse possono avere lo stesso cliente, ed e' normale.
--
-- Sono indici parziali per due motivi:
--   `is not null`  - partita IVA e codice fiscale sono facoltativi
--                    (un privato non ha la prima, un'azienda spesso non
--                    il secondo) e `vuoto()` nel form normalizza le
--                    stringhe vuote a null, quindi qui di '' non ne
--                    arrivano.
--   `and attivo`   - `clienti` fa cancellazione logica, e lo stesso
--                    `clienti_org_idx` e' gia' parziale su `attivo`.
--                    Senza questo, un cliente cessato bloccherebbe per
--                    sempre il reinserimento della stessa partita IVA.
--                    Toglilo se invece vuoi che un identificativo resti
--                    bruciato anche dopo la disattivazione.

create unique index if not exists clienti_org_piva_uniq
  on public.clienti (org_id, partita_iva)
  where partita_iva is not null and attivo;

create unique index if not exists clienti_org_cf_uniq
  on public.clienti (org_id, codice_fiscale)
  where codice_fiscale is not null and attivo;


-- 3. VERIFICA
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'clienti'
order by indexname;


-- 4. POI, NEL FRONTEND
-- Il database ora rifiuta il duplicato, ma l'utente si prende un errore
-- Postgres crudo. In `ClienteForm.tsx` il codice 23505 (unique_violation)
-- va intercettato e tradotto in un messaggio sul campo giusto:
-- "Esiste gia' un cliente con questa partita IVA".
-- Il controllo preventivo con una select non basta e non sostituisce il
-- vincolo: fra la select e l'insert ci sta un'altra insert.
