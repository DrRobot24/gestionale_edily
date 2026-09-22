-- ═══════════════════════════════════════════════════════════════════
-- QUANTE SCHEDE ASPETTARSI IN UN GIORNO — verifica dei dati.
--
-- Nasce il 2026-09-22 da una domanda dell'utente sul calendario del
-- titolare: «perche' ci sono tutti questi rossi quando il tecnico
-- l'invio l'ha fatto? Forse e' stato creato un cantiere e tu in maniera
-- retroattiva pretendi che il tecnico faccia rapportini dopo che
-- l'invio e' stato fatto?»
--
-- Esattamente cosi'. Il denominatore del semaforo oggi e' «i cantieri
-- che in QUESTO MOMENTO hanno stato attivo» — un numero di stasera
-- applicato all'indietro a tutto il mese. Un cantiere aperto oggi
-- rende rosse le giornate della settimana scorsa, che erano complete.
--
-- Il rimedio e' un denominatore STORICO: quel giorno, quali cantieri
-- erano davvero in carico a quel tecnico. I dati per farlo ci sono
-- (`cantiere_assegnazioni.dal/al` e `cantieri.data_inizio`), ma prima
-- di appoggiarci un semaforo bisogna vedere se sono compilati: se le
-- assegnazioni fossero vuote il nuovo conto darebbe ZERO attesi e
-- diventerebbe tutto verde — una bugia peggiore di quella di adesso.
--
-- ⚠️ SOLA LETTURA. Non modifica niente.
-- ⚠️ UNA QUERY PER VOLTA: l'editor Supabase mostra solo l'ultimo
--    risultato, quindi lanciale separatamente.
-- ═══════════════════════════════════════════════════════════════════


-- ① LE ASSEGNAZIONI CI SONO? ────────────────────────────────────────
-- Se questa torna vuota, il denominatore storico non e' praticabile e
-- bisogna ripiegare sulle sole date del cantiere.
-- GIA' LANCIATA il 2026-09-22. Risultato: 7 assegnazioni per
-- tecnico@cassia.com (dal 14, dal 17 x3, dal 21 x3) e UNA per
-- giuseppe@cassia.com su Family Resort come direttore lavori — cioe'
-- l'ottavo cantiere che il semaforo contava a Zito non era mai stato
-- suo. Le date ci sono tutte: il denominatore storico si puo' fare.
-- select
--   p.email, c.codice, c.denominazione, a.ruolo_cantiere, a.dal, a.al,
--   case when a.al is null then 'ancora aperta' else 'chiusa' end as periodo
-- from cantiere_assegnazioni a
-- join cantieri c on c.id = a.cantiere_id
-- left join profiles p on p.id = a.user_id
-- order by p.email, a.dal desc;


-- ② LE DATE DEI CANTIERI SONO COMPILATE? ───────────────────────────
-- `data_inizio` e' il secondo pilastro: un cantiere senza data di
-- inizio non sa dire se il 17 esisteva gia'.
select
  codice,
  denominazione,
  stato,
  data_inizio,
  data_fine_prevista,
  data_fine_effettiva,
  case
    when data_inizio is null then '⚠️ SENZA DATA DI INIZIO'
    else 'ok'
  end as controllo
from cantieri
order by data_inizio nulls first, codice;


-- ③ IL CONFRONTO CHE SPIEGA I ROSSI ────────────────────────────────
-- Per ogni giorno di settembre: quante schede sono arrivate, e quanti
-- cantieri erano DAVVERO aperti quel giorno. Dove i due numeri
-- coincidono, la giornata e' completa e oggi e' rossa a torto.
-- select
--   r.data,
--   count(*) as schede_arrivate,
--   (
--     select count(*)
--     from cantieri c
--     where c.data_inizio <= r.data
--       and (c.data_fine_effettiva is null or c.data_fine_effettiva >= r.data)
--       and c.stato <> 'in_preparazione'
--   ) as cantieri_aperti_quel_giorno,
--   (select count(*) from cantieri where stato = 'attivo') as denominatore_di_oggi
-- from rapportini r
-- where r.data >= '2026-09-01'
-- group by r.data
-- order by r.data;
