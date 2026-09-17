-- =====================================================================
-- TOGLIE DAI RAPPORTINI LE ORE DI CHI NON E' OPERAIO
--
-- Scritto il 2026-09-17, dopo aver dato a Zito `tipo = 'tecnico'`.
--
-- IL PERCHE'. Il tecnico aveva gia' delle ore scritte sui rapportini,
-- da quando stava in squadra come tutti. Adesso le sue ore vanno nel
-- foglio personale, e quelle righe vecchie sono rimaste li': il filtro
-- nel form non le vede piu' — quindi non si possono piu' togliere da
-- dentro l'applicazione — ma nel database ci sono, e continuano a
-- contare nei totali del cantiere e in `ore_giornata()`.
--
-- Una riga che nessuna schermata mostra piu' ma che i conti contano e'
-- il tipo di dato peggiore: sbagliato e invisibile.
--
-- ⚠️  SONO DATI VERI O DI PROVA? Il PASSO 1 lo dice. Se fra le righe
-- c'e' un rapportino `validato` o `contabilizzato` con ore che qualcuno
-- ha davvero lavorato, quelle ore sono gia' passate alle paghe:
-- cancellarle e basta le fa sparire dai conti. In quel caso vanno prima
-- riportate nel foglio personale della persona (il PASSO 3 ha la query
-- che lo fa), e solo dopo si cancellano.
--
-- Nel caso di Edily al 2026-09-17 sono ore di prova della giornata, e
-- si buttano.
-- =====================================================================


-- ── PASSO 1. COSA C'E' ──────────────────────────────────────────────
-- Di sola lettura. Guardare la colonna `stato`: se e' tutto `bozza` o
-- `respinto`, sono righe che non hanno ancora toccato niente e si
-- cancellano tranquille.

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
  and d.tipo <> 'operaio'
order by r.data desc, d.cognome;


-- ── PASSO 2. LA CANCELLAZIONE ───────────────────────────────────────
-- Da eseguire tutto insieme, dal `do` al `$$;`.
--
-- Perche' un blocco e non un `delete` secco: prima conta e STAMPA cosa
-- sta per togliere, poi toglie, il tutto in una transazione sola. Se
-- qualcosa va storto a meta' il rollback rimette tutto, e il numero
-- stampato resta a dire quante righe erano.
--
-- I trigger vanno spenti anche qui: `riga_rapportino_modificabile()`
-- rifiuta di toccare le righe di un rapportino non piu' in bozza, ed e'
-- lo stesso muro incontrato con la pulizia. `set local` vale solo
-- dentro questa transazione e si annulla da solo alla fine.

do $$
declare
  -- Il prefisso `v_` non e' vezzo: senza, `org` dentro un `where`
  -- accanto a `d.org_id` e' ambiguo fra la variabile e una colonna, e
  -- plpgsql risponde 42702 invece di eseguire.
  v_org    uuid := '0d989cd9-d077-48f6-8ab9-6b5434229394';
  v_quante integer;
  v_chi    text;
begin
  select count(*),
         string_agg(distinct d.cognome || ' ' || d.nome || ' (' || d.tipo || ')', ', ')
    into v_quante, v_chi
  from public.rapportino_ore o
  join public.dipendenti d on d.id = o.dipendente_id
  where d.org_id = v_org
    and d.tipo <> 'operaio';

  if v_quante = 0 then
    raise notice 'Niente da togliere: nessun non-operaio ha ore sui rapportini.';
    return;
  end if;

  raise notice 'Tolgo % righe di ore. Riguardano: %', v_quante, v_chi;

  set local session_replication_role = 'replica';

  delete from public.rapportino_ore o
  using public.dipendenti d
  where d.id = o.dipendente_id
    and d.org_id = v_org
    and d.tipo <> 'operaio';

  raise notice 'Fatto.';
end $$;


-- ── PASSO 3. SE INVECE ERANO ORE VERE ───────────────────────────────
-- NON eseguire insieme al passo 2: o si travasa, o si cancella.
--
-- Questa sposta le ore dai rapportini al foglio personale, prima di
-- toglierle. Le giornate arrivano in `bozza`, cosi' la persona le
-- rilegge e le manda lei — nessuno dichiara le ore di un altro, che e'
-- la regola di `ore_personali`.
--
-- `on conflict` perche' la stessa persona puo' avere ore su piu'
-- cantieri nello stesso giorno: nel foglio personale diventano UNA
-- riga, e le ore si sommano.
--
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
--
-- ...e SOLO DOPO aver controllato che il travaso sia giusto, eseguire
-- il passo 2.


-- ── PASSO 4. VERIFICA ───────────────────────────────────────────────
-- Rieseguire il PASSO 1: nessuna riga. Poi aprire un rapportino nel
-- form: nella squadra devono comparire solo gli operai, e il totale
-- delle ore in cima dev'essere cambiato di conseguenza.
