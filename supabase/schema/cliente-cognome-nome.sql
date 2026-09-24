-- =====================================================================
-- CLIENTI PRIVATI: cognome e nome in due colonne
--
-- Chiesto dall'utente il 2026-09-24: «dividimi il campo nome in due
-- campi separati: uno nome ed uno cognome, sennò non ne usciamo vivi».
--
-- L'elenco clienti e' una rubrica in ordine alfabetico per COGNOME
-- NOME. Con un campo solo l'ordine dipendeva da come lo si scriveva, e
-- il form chiedeva «Nome e cognome»: meta' dei privati era al rovescio.
-- Rigirarli a mano non basta, perche' «Ciancio Paratore» e «Romano
-- Rosa» non dicono da soli dove finisce il cognome. Due colonne si'.
--
-- `ragione_sociale` RESTA e continua a contenere il nominativo, scritto
-- dal form come «Cognome Nome». E' la colonna che leggono tutti — le
-- tendine dei cantieri, le intestazioni, e soprattutto wbs-office — e
-- cosi' nessuno di loro deve sapere che le colonne nuove esistono.
--
-- ⚠️ IL DATABASE E' CONDIVISO CON wbs-office. Le colonne nascono
-- NULLABLE: le aziende non le usano, e un cliente creato dall'altro
-- frontend continua a salvarsi senza passarle.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend che le
-- legge. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1. LE COLONNE ───────────────────────────────────────────────────

alter table public.clienti
  add column if not exists cognome text,
  add column if not exists nome text;

comment on column public.clienti.cognome is
  'Solo per i privati. ragione_sociale ne e'' la composizione «Cognome Nome», scritta dal form.';
comment on column public.clienti.nome is
  'Solo per i privati. Vedi cognome.';


-- ── 2. I PRIVATI CHE CI SONO GIA' ───────────────────────────────────
-- Una per una e non con una regola: nessuna regola sa dove finisce un
-- cognome doppio. Quali siano i cognomi l'ha detto l'utente: Ciancio
-- Paratore, Sferrazzo e Giarrizzo erano scritti col nome davanti.
-- Mirella Ciancio Paratore e Rosa Romano erano gia' nell'ordine giusto.
--
-- Solo dove `cognome` e' ancora nullo: rilanciare il file non tocca le
-- correzioni fatte dopo dal form.

update public.clienti as c
set cognome = v.cognome,
    nome = v.nome,
    ragione_sociale = v.cognome || ' ' || v.nome
from (values
  ('Adriana Ciancio Paratore', 'Ciancio Paratore', 'Adriana'),
  ('Ciancio Paratore Mirella', 'Ciancio Paratore', 'Mirella'),
  ('Alfio Sferrazzo',          'Sferrazzo',        'Alfio'),
  ('Guglielmo Giarrizzo',      'Giarrizzo',        'Guglielmo'),
  ('Romano Rosa',              'Romano',           'Rosa')
) as v(scritto, cognome, nome)
where trim(c.ragione_sociale) = v.scritto
  and c.cognome is null;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Deve tornare ZERO righe: privati rimasti senza cognome. Se ne esce
-- qualcuno, si apre la sua scheda nell'app e si compilano i due campi.

select id, tipo, ragione_sociale
from public.clienti
where tipo = 'privato'
  and (cognome is null or nome is null);

-- E questa mostra come sono venuti i nominativi:

select tipo, ragione_sociale, cognome, nome
from public.clienti
order by ragione_sociale;
