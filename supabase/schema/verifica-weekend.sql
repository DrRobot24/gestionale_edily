-- ═══════════════════════════════════════════════════════════════════
-- LE ORE DEL FINE SETTIMANA — cosa c'e' davvero dentro.
--
-- 2026-09-22. Il calendario del titolare segna rossi sabato 19 e
-- domenica 20. Non e' piu' il conto degli attesi — quello ora nel fine
-- settimana e' zero — ma una riga di `ore_personali` in BOZZA da 8 h su
-- ciascuno dei due giorni: lo stato «bozza» accende il rosso da solo,
-- e a ragione, perche' una cosa scritta e mai inviata e' ferma.
--
-- La domanda vera e' un'altra: quelle due righe hanno senso? L'utente:
-- «il sabato e la domenica non necessitano rapportini, sono giornate
-- festive e nessuno ha lavorato».
--
-- Se dentro ci sono 8 ore ordinarie su un sabato in cui non si e'
-- lavorato, sono dati di prova da togliere — e il rosso sparisce da
-- solo, senza toccare nessuna regola. Se invece fossero ore vere, il
-- rosso e' corretto e va solo inviato.
--
-- ⚠️ SOLA LETTURA.
-- ═══════════════════════════════════════════════════════════════════

select
  o.data,
  to_char(o.data, 'Day') as giorno_settimana,
  d.cognome || ' ' || d.nome as persona,
  o.stato,
  o.ore_ordinarie,
  o.ore_straordinarie,
  o.ore_assenza,
  o.tipo_assenza,
  o.descrizione,
  o.created_at,
  o.inviato_at
from ore_personali o
join dipendenti d on d.id = o.dipendente_id
where extract(isodow from o.data) in (6, 7)
order by o.data desc;
