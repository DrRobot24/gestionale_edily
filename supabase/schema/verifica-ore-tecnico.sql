-- =====================================================================
-- PERCHE' LE ORE DEL TECNICO NON COMPAIONO IN «ORE PER PERSONA»
--
-- ⚠️ DI SOLA LETTURA: non crea, non modifica e non cancella niente.
-- Si puo' rilanciare quante volte si vuole.
--
-- Nato il 2026-09-22 da una domanda dell'utente guardando il foglio
-- presenze: «perche' non vedo le ore del Tecnico? Per caso non le ha
-- inviate?».
--
-- Incollare nel SQL Editor di Supabase ed eseguire.
--
-- La griglia mostra SOLO le ore in stato `validato` o `contabilizzato`
-- (vedi ore-griglia.sql, riga 207). Se Zito e' a zero, la sua riga si
-- e' fermata prima: o non l'ha mai scritta, o non l'ha inviata, o
-- Giuseppe non l'ha ancora firmata.
--
-- Queste tre query dicono QUALE dei tre.
-- =====================================================================


-- ① LE SUE RIGHE, CON LO STATO. E' la risposta alla domanda.
--    - nessuna riga      → non ha mai compilato «Le mie ore»
--    - stato `bozza`     → l'ha scritta ma NON inviata
--    - stato `inviato`   → l'ha mandata, aspetta la firma di Giuseppe
--    - stato `validato`  → firmata: allora il problema e' altrove
--    - stato `respinto`  → gliel'hanno rimandata indietro
select
  d.cognome || ' ' || d.nome  as chi,
  p.data,
  p.stato,
  p.ore_ordinarie,
  p.ore_straordinarie,
  p.ore_assenza,
  p.tipo_assenza,
  p.inviato_at,
  p.validato_at
from public.ore_personali p
join public.dipendenti d on d.id = p.dipendente_id
where d.tipo = 'tecnico'
  and p.data >= current_date - interval '30 days'
order by p.data desc;


-- ② IL COLLEGAMENTO ALL'UTENZA.
--    Senza `user_id` non puo' nemmeno scrivere le proprie ore: la
--    policy di INSERT chiede `dipendenti.user_id = auth.uid()`.
--    Se qui `user_id` e' null, e' questa la causa e la riga ① sara'
--    vuota.
select
  d.cognome || ' ' || d.nome  as chi,
  d.tipo,
  d.attivo,
  d.user_id,
  case when d.user_id is null
       then '❌ NON COLLEGATO: non puo scrivere le sue ore'
       else '✅ collegato'
  end as diagnosi
from public.dipendenti d
where d.tipo in ('tecnico', 'impiegato')
order by d.cognome;


-- ③ CONTROPROVA: cosa vede davvero la griglia in questa settimana.
--    Se Zito non compare qui ma la ① dice `validato`, allora il
--    problema e' nel periodo guardato, non nei dati.
--
--    La funzione sta in `public`, non in `app`: le funzioni chiamate
--    dal frontend vivono li' perche' PostgREST espone solo `public`.
--    In `app` ci sono gli helper interni (`has_perm`,
--    `puo_vedere_cantiere`), che nessuno chiama da fuori.
--
--    ⚠️ Gira come TE, non come il servizio: `ore_griglia` e'
--    `security definer` ma controlla `paghe.read`. Se l'utenza con cui
--    sei entrato nel SQL Editor non ce l'ha, risponde 42501 — e non e'
--    un difetto, e' il cancello che funziona.
select
  g.nominativo,
  g.tipo,
  g.data,
  g.ore_ordinarie,
  g.ore_straordinarie
from public.ore_griglia(
  -- L'organizzazione presa dal tecnico stesso, non `limit 1`: con piu'
  -- di un'impresa a registro quella riga pescava a caso, e una
  -- controprova che guarda l'azienda sbagliata risponde «non c'e'»
  -- dicendo il falso.
  (select d.org_id from public.dipendenti d where d.tipo = 'tecnico' limit 1),
  date_trunc('week', current_date)::date,
  (date_trunc('week', current_date) + interval '6 days')::date
) g
where g.tipo <> 'operaio'
order by g.nominativo, g.data;


-- ④ SE LA ③ NON GIRA per mancanza di permessi, questa e' la stessa
--    domanda fatta direttamente alla tabella: le ore del tecnico che
--    la griglia MOSTREREBBE, cioe' quelle gia' firmate.
--    Vuota + la ① piena di `bozza` = non le ha mai inviate.
select
  d.cognome || ' ' || d.nome  as chi,
  p.data,
  p.stato,
  p.ore_ordinarie + p.ore_straordinarie  as ore_lavorate
from public.ore_personali p
join public.dipendenti d on d.id = p.dipendente_id
where d.tipo in ('tecnico', 'impiegato')
  and p.stato in ('validato', 'contabilizzato')
  and p.data >= current_date - interval '30 days'
order by p.data desc;
