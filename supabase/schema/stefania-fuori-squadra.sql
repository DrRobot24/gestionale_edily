-- =====================================================================
-- STEFANIA FUORI DALLA SQUADRA
--
-- «Togli Stefania dalla squadra, lei come il tecnico è fuori da ogni
-- squadra» — utente, 2026-09-21.
--
-- E' la stessa operazione fatta per il tecnico il 2026-09-17
-- (`togli-ore-non-operai.sql`), applicata all'impiegata. Il modello e'
-- gia' deciso e funziona: chi non va in cantiere non sta in
-- `rapportino_ore`, dichiara le sue ore nel foglio personale
-- (`ore_personali`).
--
-- COSA MANCA DAVVERO, ed e' importante capirlo prima di lanciare:
--
-- Il codice e' GIA' a posto. `useDipendenti({ soloOperai: true })`
-- filtra `tipo = 'operaio'`, e un trigger nel database rifiuta le righe
-- di chi non lo e'. Quindi non c'e' niente da correggere nel programma:
-- se Stefania compare ancora fra gli assegnabili e' perche' la sua
-- scheda ha `tipo = 'operaio'` in anagrafica.
--
-- Questo file sistema i DATI, non il codice.
--
-- LA SEGNALAZIONE ERA NOTA dal 2026-09-15, fra le tre cose decise in
-- ufficio: «Stefania fuori dalla squadra. La sua scheda operaio era
-- stata collegata a amministrazione@cassia.com, e quel collegamento la
-- faceva comparire fra gli assegnabili. Va sciolto o la scheda
-- cancellata: lei riceve le ore, non le presta.»
--
-- PERCHE' NON SI CANCELLA LA SCHEDA, che era l'altra strada proposta:
-- Stefania e' una dipendente vera, con una data di assunzione e una
-- busta paga. Cancellarla vorrebbe dire che l'azienda non sa piu' che
-- esiste, e le sue ore d'ufficio non avrebbero piu' dove stare. Il
-- collegamento a `user_id` NON si scioglie: e' quello che le permette
-- di compilare le proprie ore, ed e' la stessa ragione per cui il
-- tecnico ce l'ha.
--
-- Cambia solo il TIPO. E' il campo che decide chi puo' stare in
-- squadra, ed e' quello che dice il vero: lei e' un'impiegata.
--
-- Da eseguire nel SQL Editor, un passo per volta, IN QUEST'ORDINE.
-- =====================================================================


-- ── PASSO 1. COM'E' MESSA ADESSO ────────────────────────────────────
-- Di sola lettura. Guardare la colonna `tipo`.
--
-- Se dice gia' 'impiegato', non c'e' niente da fare e i passi 2 e 3
-- vanno saltati: il problema era gia' stato risolto.

select d.id,
       d.cognome || ' ' || d.nome as persona,
       d.tipo,
       d.attivo,
       d.user_id is not null      as collegata_a_un_utente,
       u.email
from public.dipendenti d
left join auth.users u on u.id = d.user_id
where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
order by d.tipo, d.cognome;


-- ── PASSO 2. HA ORE SUI RAPPORTINI? ─────────────────────────────────
-- Di sola lettura, e va guardata PRIMA di cambiare il tipo.
--
-- Se Stefania e' stata messa in qualche squadra, quelle righe restano
-- in `rapportino_ore` anche dopo il cambio di tipo: il filtro nel form
-- smette di mostrarla — quindi non si possono piu' togliere da dentro
-- l'applicazione — ma nel database ci sono, e continuano a contare nei
-- totali del cantiere, in `ore_giornata()` e nella nuova pagina delle
-- ore per persona.
--
-- Una riga che nessuna schermata mostra piu' ma che i conti contano e'
-- il tipo di dato peggiore: sbagliato e invisibile. E' esattamente il
-- problema che si era presentato col tecnico a settembre.
--
-- ⚠️ GUARDARE LA COLONNA `stato`. Se e' tutto `bozza` o `respinto`,
-- sono righe che non hanno toccato niente e il passo 4 le butta. Se
-- c'e' un `validato` o `contabilizzato`, quelle ore sono gia' passate
-- dalle parti delle paghe: vanno prima travasate nel foglio personale
-- (passo 5) e solo dopo cancellate.

select r.data,
       c.codice,
       c.denominazione,
       d.cognome || ' ' || d.nome as persona,
       d.tipo,
       o.ore_ordinarie,
       o.ore_straordinarie,
       o.ore_assenza,
       r.stato
from public.rapportino_ore o
join public.dipendenti d on d.id = o.dipendente_id
join public.rapportini  r on r.id = o.rapportino_id
join public.cantieri    c on c.id = r.cantiere_id
where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
  and d.tipo = 'operaio'
  and d.user_id is not null
order by r.data desc, d.cognome;


-- ── PASSO 3. IL CAMBIO DI TIPO ──────────────────────────────────────
-- Da eseguire tutto insieme, dal `do` al `$$;`.
--
-- Trova la scheda dall'EMAIL dell'utenza collegata, non dal nome:
-- «Corritore» scritto con una erre in meno non troverebbe niente e il
-- blocco direbbe che va tutto bene. L'email e' l'unica chiave certa.
--
-- Stampa cosa sta per fare e si ferma da solo se non trova la scheda o
-- se il tipo e' gia' giusto: rilanciarlo due volte non fa danno.

do $$
declare
  -- Il prefisso `v_` non e' vezzo: senza, `org` dentro un `where`
  -- accanto a `d.org_id` e' ambiguo fra la variabile e una colonna, e
  -- plpgsql risponde 42702 invece di eseguire.
  v_org    uuid := '0d989cd9-d077-48f6-8ab9-6b5434229394';
  v_email  text := 'amministrazione@cassia.com';
  v_id     uuid;
  v_chi    text;
  v_tipo   text;
begin
  select d.id, d.cognome || ' ' || d.nome, d.tipo::text
    into v_id, v_chi, v_tipo
  from public.dipendenti d
  join auth.users u on u.id = d.user_id
  where d.org_id = v_org
    and lower(u.email) = lower(v_email)
  limit 1;

  if v_id is null then
    raise notice 'Nessuna scheda collegata a %. Niente da fare: controlla il passo 1.', v_email;
    return;
  end if;

  if v_tipo = 'impiegato' then
    raise notice '% è già impiegata. Niente da fare.', v_chi;
    return;
  end if;

  raise notice 'Cambio % da % a impiegato.', v_chi, v_tipo;

  update public.dipendenti
     set tipo = 'impiegato'
   where id = v_id;

  -- Patente e DPI valgono solo per gli operai — chi non va in cantiere
  -- non guida il furgone — e il form li azzera da se' quando si cambia
  -- tipo dall'interfaccia. Qui si cambia da SQL, quindi vanno azzerati
  -- a mano: lasciare dati invisibili che nessuno puo' piu' correggere e'
  -- peggio che non averli. E' la stessa regola di `scheda-personale.sql`.
  update public.dipendenti
     set patente = null,
         dpi     = '{}'
   where id = v_id
     and (patente is not null or dpi <> '{}');

  raise notice 'Fatto. Il collegamento all''utenza NON è stato toccato: le serve per compilare le proprie ore.';
end $$;


-- ── PASSO 4. LE SUE ORE VECCHIE SUI RAPPORTINI ──────────────────────
-- Da eseguire SOLO se il passo 2 ha tirato fuori delle righe, e SOLO
-- dopo aver guardato la colonna `stato`.
--
-- Se erano ore vere gia' validate, NON lanciare questo: prima il passo
-- 5, che le travasa nel foglio personale.
--
-- I trigger vanno spenti: `riga_rapportino_modificabile()` rifiuta di
-- toccare le righe di un rapportino non piu' in bozza. `set local` vale
-- solo dentro questa transazione e si annulla da solo alla fine.

-- do $$
-- declare
--   v_org    uuid := '0d989cd9-d077-48f6-8ab9-6b5434229394';
--   v_quante integer;
--   v_chi    text;
-- begin
--   select count(*),
--          string_agg(distinct d.cognome || ' ' || d.nome || ' (' || d.tipo || ')', ', ')
--     into v_quante, v_chi
--   from public.rapportino_ore o
--   join public.dipendenti d on d.id = o.dipendente_id
--   where d.org_id = v_org
--     and d.tipo <> 'operaio';
--
--   if v_quante = 0 then
--     raise notice 'Niente da togliere: nessun non-operaio ha ore sui rapportini.';
--     return;
--   end if;
--
--   raise notice 'Tolgo % righe di ore. Riguardano: %', v_quante, v_chi;
--
--   set local session_replication_role = 'replica';
--
--   delete from public.rapportino_ore o
--   using public.dipendenti d
--   where d.id = o.dipendente_id
--     and d.org_id = v_org
--     and d.tipo <> 'operaio';
--
--   raise notice 'Fatto.';
-- end $$;


-- ── PASSO 5. SE INVECE ERANO ORE VERE ───────────────────────────────
-- NON eseguire insieme al passo 4: o si travasa, o si cancella.
--
-- Sposta le ore dai rapportini al foglio personale PRIMA di toglierle.
-- Le giornate arrivano in `bozza`, cosi' la persona le rilegge e le
-- manda lei — nessuno dichiara le ore di un altro, che e' la regola di
-- `ore_personali`.

--   insert into public.ore_personali
--     (org_id, dipendente_id, data, ore_ordinarie, ore_straordinarie, ore_assenza,
--      tipo_assenza, descrizione, stato)
--   select d.org_id,
--          o.dipendente_id,
--          r.data,
--          sum(o.ore_ordinarie),
--          sum(o.ore_straordinarie),
--          sum(o.ore_assenza),
--          max(o.tipo_assenza),
--          'Ore riportate dai rapportini di cantiere',
--          'bozza'
--   from public.rapportino_ore o
--   join public.dipendenti d on d.id = o.dipendente_id
--   join public.rapportini  r on r.id = o.rapportino_id
--   where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
--     and d.tipo <> 'operaio'
--   group by d.org_id, o.dipendente_id, r.data
--   on conflict (dipendente_id, data) do nothing;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Chi puo' stare in squadra adesso. Devono comparire SOLO gli operai:
-- ne' Stefania ne' il tecnico.

-- select d.cognome || ' ' || d.nome as persona, d.tipo
-- from public.dipendenti d
-- where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
--   and d.attivo
--   and d.tipo = 'operaio'
-- order by d.cognome;
