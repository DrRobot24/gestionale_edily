-- ═══════════════════════════════════════════════════════════════════
-- VIA LE DUE GIORNATE DI PROVA DEL FINE SETTIMANA.
--
-- 2026-09-22. Il calendario del titolare segnava rossi sabato 19 e
-- domenica 20. Il colore era corretto — due giornate scritte e mai
-- inviate SONO ferme — ma il dato sotto era falso.
--
-- La verifica ha mostrato cosa fossero:
--
--   sabato 19    8 h ordinarie, bozza, creata 2026-09-22 18:52:47
--   domenica 20  8 h ordinarie, bozza, creata 2026-09-22 18:52:49
--
-- Due secondi l'una dall'altra, descrizione vuota, mai inviate:
-- nessuno compila due giornate in due secondi. Sono nate premendo
-- Salva mentre si provava il modulo, che si apre precompilato a 8 ore
-- e non diceva niente di diverso su un sabato.
--
-- Il modulo e' stato corretto (parte da zero e avvisa nei festivi).
-- Qui si tolgono le righe che aveva prodotto: il rosso sparisce
-- perche' sparisce il dato sbagliato, non perche' una regola impara a
-- nasconderlo.
--
-- ⚠️ MIRATO, non «tutti i weekend»: si cancellano SOLO giornate in
--    bozza, mai inviate, di quei due giorni preciseli. Una giornata di
--    sabato lavorato davvero e inviata non viene toccata da nessuna di
--    queste righe — e non deve esserlo, e' lavoro vero.
-- ═══════════════════════════════════════════════════════════════════

-- ① GUARDA PRIMA COSA STAI PER CANCELLARE ─────────────────────────
select
  o.data,
  d.cognome || ' ' || d.nome as persona,
  o.stato,
  o.ore_ordinarie,
  o.inviato_at
from ore_personali o
join dipendenti d on d.id = o.dipendente_id
where o.data in ('2026-09-19', '2026-09-20')
  and o.stato = 'bozza'
  and o.inviato_at is null;


-- ② POI CANCELLA ──────────────────────────────────────────────────
-- Scommenta ed esegui dopo aver controllato che ① mostri le due righe
-- di Zito e nient'altro.
 delete from ore_personali
 where data in ('2026-09-19', '2026-09-20')
   and stato = 'bozza'
   and inviato_at is null;
