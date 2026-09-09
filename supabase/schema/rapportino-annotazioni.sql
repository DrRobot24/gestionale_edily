-- =====================================================================
-- `rapportini.annotazioni`: il taccuino del tecnico
--
-- Sul rapportino c'e' gia' una colonna di testo libero, `note`, che nel
-- gestionale si chiama "Descrizione attivita'" ed e' la sostanza del
-- rapporto: cosa si e' fatto in quel cantiere quel giorno.
--
-- Manca l'altra meta': quello che il tecnico vuole DIRE al titolare e
-- che non e' lavoro svolto. "Manca il cemento", "il cliente si e'
-- lamentato del rumore", "lunedi' serve la gru". Oggi finisce dentro la
-- descrizione e la sporca, oppure - piu' spesso - non viene scritto e
-- basta.
--
-- Colonna nuova e non riuso di `note`: la descrizione attivita' e' un
-- documento, l'annotazione e' un messaggio. Mescolarli vuol dire non
-- poter piu' stampare la prima senza la seconda.
--
-- ATTENZIONE, DATABASE CONDIVISO con wbs-office: qui si AGGIUNGE una
-- colonna facoltativa, operazione sicura. Nessuna colonna esistente
-- viene rinominata o cambiata di tipo, quindi le query dell'altro
-- frontend continuano a funzionare identiche.
--
-- Da eseguire nel SQL Editor.
-- DOPO: rigenerare i tipi (`supabase gen types typescript`).
-- =====================================================================


-- 1. LA COLONNA
-- Nullable e senza default: una scheda senza annotazioni e' la norma, e
-- una stringa vuota e un null direbbero la stessa cosa in due modi.
alter table public.rapportini
  add column if not exists annotazioni text;

comment on column public.rapportini.annotazioni is
  'Appunti del tecnico per il titolare: problemi, materiali che mancano, richieste. Diverso da `note`, che nel gestionale e'' la "Descrizione attivita''" e racconta il lavoro svolto.';


-- 2. VERIFICA
-- Devono comparire tutte e due, `note` e `annotazioni`.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rapportini'
  and column_name in ('note', 'annotazioni')
order by column_name;
