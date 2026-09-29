-- =====================================================================
-- I DOCUMENTI DI MEZZI E ATTREZZATURE
--
-- Chiesto dall'utente il 2026-09-29: «il campo di upload per caricare i
-- documenti sia sui mezzi che sulle attrezzature, che e' una cosa
-- importantissima» — libretto, assicurazione, revisione, certificati,
-- manuali, verifiche periodiche.
--
-- Lo stesso modulo dei documenti di cantieri, clienti, fornitori e
-- materiali (`documenti.sql`): cambia solo A CHE COSA e' attaccato. Qui
-- si aggiungono i due valori all'enum, e basta: tabella, bucket e
-- policy sono quelli.
--
-- CHI LI VEDE: chi tiene le anagrafiche (`anagrafiche.write`), cioe'
-- Stefania e il titolare — il ramo generale della policy di lettura,
-- che vale per ogni ambito senza un ramo suo. Il tecnico no, come per
-- clienti e fornitori.
--
-- `add value if not exists`: si puo' rilanciare. Nessun'altra
-- istruzione usa i valori nuovi, ed e' voluto — Postgres non permette di
-- usare un valore di enum nella stessa transazione in cui nasce.
-- =====================================================================

alter type public.ambito_documento add value if not exists 'mezzo';
alter type public.ambito_documento add value if not exists 'attrezzatura';

-- Verifica: devono uscire sei valori, gli ultimi due sono i nuovi. Dal
-- catalogo e non con `enum_range`: quello «usa» i valori, e nella stessa
-- esecuzione Postgres lo rifiuta (provato, 2026-09-29).
select e.enumlabel as ambito
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'ambito_documento'
order by e.enumsortorder;
