-- =====================================================================
-- fornitori: stesso buco che aveva `clienti`
--
-- `fornitori` non compariva fra le tabelle con indici su collazioni
-- linguistiche, il che vuol dire che non ha nessun indice su colonne
-- testuali: niente unicita' su `partita_iva`. Due fornitori identici
-- entrano in silenzio, e con le bolle in arrivo diventerebbero due
-- storici di acquisto separati per la stessa azienda.
--
-- Da eseguire PRIMA di aprire la schermata fornitori all'amministrazione.
-- Stessa logica di clienti-unicita.sql, gia' applicato.
-- =====================================================================


-- 1. CI SONO GIA' DUPLICATI?
select org_id, partita_iva, count(*) as quanti,
       string_agg(ragione_sociale, ' | ') as coinvolti
from public.fornitori
where partita_iva is not null
group by org_id, partita_iva
having count(*) > 1;


-- 2. IL VINCOLO
-- Chiave per organizzazione: due imprese possono avere lo stesso
-- fornitore. Parziale su `attivo` come su `clienti`, cosi' un fornitore
-- dismesso non brucia per sempre la sua partita IVA.
--
-- `fornitori` non ha `codice_fiscale` (a differenza di `clienti`): un
-- fornitore e' sempre un'azienda, quindi basta la partita IVA.
create unique index if not exists fornitori_org_piva_uniq
  on public.fornitori (org_id, partita_iva)
  where partita_iva is not null and attivo;


-- 3. VERIFICA
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'fornitori'
order by indexname;
