-- =====================================================================
-- `note_contabili`: il lavoro extra e' stato contabilizzato?
--
-- Chiesto il 2026-09-25: il tecnico che scrive i lavori extra deve poter
-- segnare, per ognuno, se e' gia' passato in contabilita' — cioe' se e'
-- gia' stato messo nel conto da presentare al cliente.
--
-- UNA DATA E NON UN SI'/NO. `contabilizzata_il` vuota vuol dire «non
-- ancora»; piena dice «si'» e anche QUANDO, che fra sei mesi e' la
-- domanda successiva («in quale conto e' finito?»). Un booleano accanto
-- a una data sarebbero due verita' sulla stessa cosa, e prima o poi
-- divergono. `contabilizzata_da` dice chi l'ha segnata.
--
-- NIENTE POLICY NUOVE: scrive chi puo' gia' correggere la nota — il
-- tecnico sui cantieri suoi, il titolare ovunque — per la policy
-- `note_contabili_update` di `note-contabili.sql`. L'amministrazione
-- legge e non segna, come per il resto della nota.
--
-- DATABASE CONDIVISO con wbs-office: si AGGIUNGONO due colonne nullable,
-- nessuno che legge la tabella se ne accorge.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare.
-- =====================================================================

alter table public.note_contabili
  add column if not exists contabilizzata_il timestamptz;

alter table public.note_contabili
  add column if not exists contabilizzata_da uuid references auth.users(id) on delete set null;

comment on column public.note_contabili.contabilizzata_il is
  'Quando il lavoro extra e'' stato segnato come contabilizzato. NULL = non ancora.';

comment on column public.note_contabili.contabilizzata_da is
  'Chi l''ha segnato come contabilizzato.';

-- La pagina filtra «da contabilizzare»: le righe col campo vuoto.
create index if not exists note_contabili_da_contabilizzare_idx
  on public.note_contabili (org_id, data desc)
  where contabilizzata_il is null;


-- VERIFICA: devono uscire due righe.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'note_contabili'
  and column_name in ('contabilizzata_il', 'contabilizzata_da')
order by column_name;
