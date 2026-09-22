-- =====================================================================
-- AZIENDA O PRIVATO: il tipo diventa un dato, non piu' un indovinello
--
-- Chiesto dall'utente il 2026-09-22, partendo da un'altra domanda:
-- «dopo che io creo un cliente e lo creo come privato, perche' e'
-- ancora possibile cambiare il tab da privato ad Azienda?».
--
-- LA RISPOSTA ERA CHE IL TIPO NON ESISTEVA. Il form aveva un tab
-- «azienda | privato», ma nel database c'erano solo `partita_iva` e
-- `codice_fiscale`, entrambi facoltativi: il tab serviva a decidere
-- quali campi chiedere e come validarli, e riaprendo la scheda il tipo
-- veniva DEDOTTO —
--
--     niente partita IVA + codice fiscale di 16 caratteri → privato
--     tutto il resto                                       → azienda
--
-- La deduzione regge quasi sempre, ma ha due buchi veri:
--
--   1. un privato di cui non si conosce ancora il codice fiscale
--      risulta «azienda», perche' non ha i 16 caratteri. Si riapre la
--      scheda e il tab e' saltato da solo sull'altra sponda.
--   2. una ditta individuale ha un codice fiscale di 16 caratteri come
--      una persona: se non ha la partita IVA compilata viene letta come
--      «privato», che e' falso.
--
-- In tutti e due i casi il programma cambia idea da solo su un dato che
-- l'utente aveva scelto. Con una colonna vera la scelta resta scritta.
--
-- ⚠️ IL DATABASE E' CONDIVISO CON wbs-office. Aggiungere una colonna e'
-- sicuro — le query esistenti non la nominano e continuano a funzionare
-- — mentre rinominare o restringere non lo sarebbe. La colonna nasce
-- NULLABLE senza `not null`, proprio per non rompere nessun inserimento
-- che oggi non la passa: l'altro frontend puo' continuare a creare
-- clienti senza saperne niente, e la riga risultera' «da dedurre».
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1. LA COLONNA ───────────────────────────────────────────────────
-- Testo con un vincolo e non un enum, ed e' deliberato: un enum nuovo
-- su un database condiviso e' un tipo in piu' che l'altro frontend si
-- ritrova nello schema senza averlo chiesto, e allargarlo un domani
-- («ente pubblico»? «condominio»?) richiede un ALTER TYPE che non si
-- puo' fare dentro una transazione. Il check si modifica e basta.

alter table public.clienti
  add column if not exists tipo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clienti_tipo_check'
      and conrelid = 'public.clienti'::regclass
  ) then
    alter table public.clienti
      add constraint clienti_tipo_check
      check (tipo is null or tipo in ('azienda', 'privato'));
  end if;
end $$;

comment on column public.clienti.tipo is
  'azienda | privato. Scelto da chi inserisce, non dedotto: prima si ricavava dai campi fiscali e il programma cambiava idea da solo.';


-- ── 2. LE RIGHE CHE CI SONO GIA' ────────────────────────────────────
-- Si popolano con la STESSA regola che il form applicava finora, cosi'
-- nessuna scheda cambia aspetto il giorno dell'esecuzione: chi si
-- vedeva «privato» continua a vedersi «privato».
--
-- Solo dove `tipo` e' ancora nullo: rilanciare il file non sovrascrive
-- le scelte fatte dopo.

update public.clienti
set tipo = case
  when partita_iva is null
   and length(trim(coalesce(codice_fiscale, ''))) = 16
  then 'privato'
  else 'azienda'
end
where tipo is null;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- La prima riga dice quanti clienti per tipo. La seconda deve tornare
-- ZERO righe: sono quelli rimasti senza tipo, che non dovrebbero
-- esistere dopo l'update.

select tipo, count(*) as quanti
from public.clienti
group by tipo
order by tipo;

select id, ragione_sociale
from public.clienti
where tipo is null;

-- Poi, NELL'APP: aprire un cliente privato. Il tab dev'essere spento,
-- con scritto perche', e la scheda deve continuare a salvarsi.
