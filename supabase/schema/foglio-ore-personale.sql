-- =====================================================================
-- IL FOGLIO ORE PERSONALE, e la distinzione fra chi va in cantiere e chi no
--
-- Deciso con l'utente il 2026-09-17.
--
-- IL PROBLEMA. Finora le ore esistevano in un posto solo:
-- `rapportino_ore`, cioe' sempre legate a UN cantiere e a UNA giornata.
-- Per un operaio e' giusto — lui sta in un cantiere e quelle sono le sue
-- ore. Per il tecnico no: «puo' lavorare anche 8 ore dall'ufficio e
-- seguire telefonicamente tutti i cantieri». Le sue otto ore non
-- appartengono a nessun cantiere in particolare, e obbligarlo a
-- spalmarle su uno di essi sarebbe scrivere una cosa falsa per far
-- quadrare un modello.
--
-- LA REGOLA, con le parole dell'utente: «le sue ore sono sempre nel
-- foglio personale. Non gliene fotte un cazzo a nessuno dove lui dice
-- che e' stato. Importa cio' che lui dice sul cantiere a cui e' stato
-- assegnato».
--
-- Da cui la separazione netta, che e' il cuore di tutto questo file:
--
--   sul RAPPORTINO   il tecnico racconta il LAVORO del cantiere —
--                    cosa si e' fatto, chi c'era, foto, materiali
--   sul FOGLIO SUO   il tecnico dichiara le PROPRIE ore, una volta al
--                    giorno, senza dire su quale cantiere
--
-- Il tecnico quindi NON compare piu' nella squadra di nessun cantiere.
-- Non e' una limitazione: e' che non era mai stato il posto giusto.
--
-- TRE COSE IN UN FILE SOLO perche' sono la stessa decisione:
--   1. `dipendenti.tipo`      chi va in cantiere e chi no
--   2. `ore_personali`        il foglio ore slegato dal cantiere
--   3. l'invio della giornata impara a guardare tutti e due i posti
--
-- Da eseguire nel SQL Editor, un blocco per volta, IN QUEST'ORDINE.
-- Il database e' condiviso con wbs-office: qui si AGGIUNGE soltanto —
-- una colonna con un default e una tabella nuova — e non si rinomina
-- ne' si restringe niente. L'altro frontend non se ne accorge.
-- =====================================================================


-- =====================================================================
-- 1. CHE TIPO DI RISORSA E'
-- =====================================================================
--
-- Tre tipi, e la differenza NON e' descrittiva: decide chi compare
-- nella tendina della squadra.
--
--   operaio    va in cantiere. E' l'unico assegnabile a una squadra.
--   tecnico    segue i cantieri, non presta ore a uno solo
--   impiegato  amministrazione, ufficio. Stefania e' questa.
--
-- `mansione` esiste gia' ma e' testo libero e non serve: «capo
-- squadra», «muratore», «geometra» raccontano il mestiere, non
-- rispondono alla domanda «lo posso mettere in squadra?». Due cose
-- diverse, e quella che decide dev'essere un enum.

create type public.tipo_risorsa as enum ('operaio', 'tecnico', 'impiegato');

-- Default `operaio`: le righe che esistono gia' sono operai di cantiere,
-- ed e' anche il caso piu' frequente in un'impresa edile. Chi non lo e'
-- si corregge a mano dopo (vedi il blocco di verifica in fondo).
alter table public.dipendenti
  add column if not exists tipo public.tipo_risorsa not null default 'operaio';

comment on column public.dipendenti.tipo is
  'Operaio = assegnabile alla squadra di un cantiere. Tecnico e impiegato no: le loro ore stanno in ore_personali.';

-- ⚠️  ATTENZIONE A DOVE VA MESSA LA REGOLA — corretto il 2026-09-17
-- dopo che l'esecuzione ha risposto 42703.
--
-- La prima stesura metteva un trigger su `cantiere_assegnazioni`
-- cercando una colonna `dipendente_id` che NON ESISTE: quella tabella
-- ha `user_id`. E non e' un dettaglio di nomi, e' che sono due cose
-- diverse e le avevo confuse:
--
--   cantiere_assegnazioni   CHI PUO' ENTRARE nel cantiere. Utenti del
--                           gestionale, non schede operaio. E' l'atto
--                           che apre la porta: «chi e' in questo elenco
--                           vede il cantiere e puo' compilarci i
--                           rapportini».
--
--   rapportino_ore          CHI HA LAVORATO li' quel giorno. Schede
--                           dipendente, una riga per persona. E'
--                           QUESTA la squadra.
--
-- Il tecnico DEVE restare in `cantiere_assegnazioni` — e' come vede i
-- suoi cantieri, e il trigger sbagliato glielo avrebbe impedito. Quello
-- da cui deve sparire e' `rapportino_ore`: le sue ore non stanno sul
-- cantiere.
--
-- UN TRIGGER E NON UNA CHECK CONSTRAINT: una `check` deve essere
-- immutabile e non puo' leggere un'altra tabella in modo affidabile.
create or replace function app.solo_operai_nelle_ore()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  t   public.tipo_risorsa;
  chi text;
begin
  select d.tipo, d.nome || ' ' || d.cognome into t, chi
  from public.dipendenti d
  where d.id = new.dipendente_id;

  -- Dipendente inesistente: se ne occupa la foreign key, con un
  -- messaggio migliore del nostro.
  if t is null then
    return new;
  end if;

  if t <> 'operaio' then
    raise exception '% non va nelle ore di un cantiere: e'' %. Le sue ore si dichiarano nel foglio ore personale.',
      chi, t
      using errcode = 'P0001';
  end if;

  return new;
end $fn$;

drop trigger if exists trg_solo_operai_nelle_ore on public.rapportino_ore;
create trigger trg_solo_operai_nelle_ore
  before insert or update of dipendente_id on public.rapportino_ore
  for each row execute function app.solo_operai_nelle_ore();

-- Le righe GIA' scritte non vengono toccate: il trigger vale da ora in
-- avanti. Il blocco 4 in fondo dice come trovare quelle vecchie.


-- =====================================================================
-- 2. IL FOGLIO ORE PERSONALE
-- =====================================================================
--
-- Una riga per persona e per giorno. Non ha `cantiere_id`, ed e' il
-- punto di tutta la tabella: queste ore non appartengono a un cantiere.
--
-- PERCHE' NON RIUSARE `rapportino_ore` CON IL CANTIERE NULLO. Perche'
-- una colonna che a volte c'e' e a volte no costringe ogni query
-- esistente a chiedersi quale dei due casi sta guardando, e quelle
-- query oggi sommano ore di cantiere. Una riga senza cantiere in mezzo
-- a loro entrerebbe nei conti dei costi di commessa senza appartenere
-- a nessuna commessa. Due significati diversi, due tabelle.

create table if not exists public.ore_personali (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  dipendente_id uuid not null references public.dipendenti(id),
  data          date not null,

  ore_ordinarie     numeric(5,2) not null default 0 check (ore_ordinarie between 0 and 24),
  ore_straordinarie numeric(5,2) not null default 0 check (ore_straordinarie between 0 and 24),
  ore_assenza       numeric(5,2) not null default 0 check (ore_assenza between 0 and 24),
  tipo_assenza      text,

  -- Il racconto della giornata, libero: «giro dei tre cantieri»,
  -- «ufficio, preventivo Giarrizzo», «sopralluogo Via Etnea». Serve al
  -- titolare per sapere cosa ha fatto, visto che non c'e' un cantiere a
  -- dirlo.
  descrizione text,

  -- Stessa macchina a stati del rapportino, e apposta: il titolare
  -- valida la giornata del tecnico come valida quelle dei cantieri.
  -- Non si riusa l'enum `rapportino_stato` per non legare due cicli di
  -- vita che potrebbero divergere — qui per esempio non esiste il
  -- `contabilizzato`.
  stato          text not null default 'bozza'
                 check (stato in ('bozza', 'inviato', 'validato', 'respinto')),
  motivo_rifiuto text,

  inviato_at  timestamptz,
  validato_at timestamptz,
  validato_da uuid references auth.users(id),

  compilato_da uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Una giornata sola per persona. Due righe sullo stesso giorno
  -- conterebbero le ore due volte nelle paghe, ed e' l'errore piu' caro
  -- che questa tabella possa fare.
  unique (dipendente_id, data),

  -- Il totale non supera le 24 ore: una giornata ne ha ventiquattro
  -- anche per chi lavora tanto.
  check (ore_ordinarie + ore_straordinarie + ore_assenza <= 24)
);

create index if not exists ore_personali_org_data_idx
  on public.ore_personali (org_id, data desc);

comment on table public.ore_personali is
  'Ore di chi non le presta a un cantiere solo: tecnico, impiegati. Slegate dal rapportino di proposito.';

alter table public.ore_personali enable row level security;


-- ── Le policy ───────────────────────────────────────────────────────
-- Tre livelli, come ovunque nel progetto: tenant, capability, e qui lo
-- scope e' «la mia riga» invece che «il mio cantiere».

drop policy if exists ore_personali_select on public.ore_personali;
create policy ore_personali_select on public.ore_personali
for select using (
  app.is_member(org_id)
  and (
    -- la propria: chi la scrive la rilegge
    dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
    -- chi valida e chi tiene le paghe le vedono tutte: sono i due
    -- mestieri per cui questa tabella esiste
    or app.has_perm(org_id, 'rapportini.validate')
    or app.has_perm(org_id, 'rapportini.read_all')
    or app.has_perm(org_id, 'paghe.read')
  )
);

-- Si scrive solo la PROPRIA giornata, e solo finche' e' aperta.
--
-- Nessuno compila le ore di un altro, ed e' la regola gia' decisa per il
-- tecnico: «il rapporto e' di fiducia, se le autoriporta». L'ammini-
-- strazione le riceve e le elabora, non le scrive.
drop policy if exists ore_personali_insert on public.ore_personali;
create policy ore_personali_insert on public.ore_personali
for insert with check (
  app.is_member(org_id)
  and dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
  and stato = 'bozza'
);

drop policy if exists ore_personali_update on public.ore_personali;
create policy ore_personali_update on public.ore_personali
for update using (
  app.is_member(org_id)
  and (
    -- l'autore, finche' non e' partita o se gli e' tornata indietro
    (
      dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
      and stato in ('bozza', 'respinto')
    )
    -- chi valida: e' il suo mestiere, e agisce sull'inviato
    or app.has_perm(org_id, 'rapportini.validate')
  )
);

-- Si cancella la propria, e solo se non e' partita: la stessa regola
-- del rapportino, per la stessa ragione. Un foglio consegnato non si fa
-- sparire.
drop policy if exists ore_personali_delete on public.ore_personali;
create policy ore_personali_delete on public.ore_personali
for delete using (
  app.is_member(org_id)
  and dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
  and stato in ('bozza', 'respinto')
);


-- =====================================================================
-- 3. L'INVIO DELLA GIORNATA IMPARA A GUARDARE DUE POSTI
-- =====================================================================
--
-- ⚠️  QUESTO E' IL BLOCCO CHE NON SI PUO' SALTARE, e il motivo e' che
-- oggi `invia_foglio_giornata` cerca le ore di chi manda dentro
-- `rapportino_ore`:
--
--     select sum(...) from public.rapportino_ore o
--     join public.rapportini r on ...
--     where o.dipendente_id = mio_dipendente
--
-- Da quando il tecnico non sta piu' in squadra, quella somma e' SEMPRE
-- zero, e l'invio risponderebbe «Mancano le tue ore» ogni sera senza
-- nessun modo di rispondere. La funzione va rifatta per cercare anche
-- in `ore_personali`.
--
-- Il file [`invio-controllo-ore.sql`](invio-controllo-ore.sql) resta la
-- fonte della funzione: questo blocco ne cambia UN pezzo. Va riletto
-- insieme, e se un domani si tocca quello va ritoccato anche questo.
--
-- La sostituzione da fare, dentro `app.invia_foglio_giornata`, al posto
-- del blocco `if mio_dipendente is not null then ... end if;`:
--
--   if mio_dipendente is not null then
--     select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
--       into mie_ore
--     from public.rapportino_ore o
--     join public.rapportini r on r.id = o.rapportino_id
--     where o.org_id = p_org
--       and r.data = p_giorno
--       and o.dipendente_id = mio_dipendente;
--
--     -- NUOVO: chi non sta in squadra le ore le mette nel foglio suo
--     if mie_ore = 0 then
--       select coalesce(sum(p.ore_ordinarie + p.ore_straordinarie + p.ore_assenza), 0)
--         into mie_ore
--       from public.ore_personali p
--       where p.org_id = p_org
--         and p.data = p_giorno
--         and p.dipendente_id = mio_dipendente;
--     end if;
--
--     if mie_ore = 0 then
--       raise exception 'Mancano le tue ore di oggi. Compila il tuo foglio ore: la giornata non parte senza chi l''ha scritta.'
--         using errcode = 'P0001';
--     end if;
--   end if;
--
-- Il messaggio cambia perche' il vecchio diceva «aggiungiti alla squadra
-- del cantiere», che adesso e' il consiglio sbagliato: il tecnico in
-- squadra non ci va piu'.
--
-- ⚠️  IL CONTROLLO DELLE 8 ORE resta com'e', e va bene cosi': conta le
-- persone che stanno nei rapportini della giornata, e il tecnico non ci
-- sta piu'. Le SUE otto ore le garantisce il blocco qui sopra. Se un
-- domani si volesse il controllo anche sul suo foglio, il posto e'
-- `app.ore_giornata()` — ma e' una decisione a parte, da prendere
-- guardando come va.


-- =====================================================================
-- 4. DOPO AVER ESEGUITO: sistemare i tipi
-- =====================================================================
--
-- Tutti sono partiti `operaio`. Vanno corretti quelli che non lo sono —
-- e la cosa la fa l'amministrazione dalla scheda, ma la prima volta
-- conviene da qui.
--
-- Chi ha un'utenza collegata quasi certamente NON e' un operaio: un
-- operaio nel gestionale non entra.

select d.id, d.nome, d.cognome, d.tipo, d.mansione, d.user_id is not null as ha_utenza
from public.dipendenti d
where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
order by d.cognome, d.nome;

-- Esempio, da adattare ai nomi veri:
--
--   update public.dipendenti set tipo = 'tecnico'
--   where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
--     and cognome = '<cognome del tecnico>';
--
--   update public.dipendenti set tipo = 'impiegato'
--   where org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
--     and cognome = 'Corritore';


-- ── Chi e' rimasto nelle ore di un cantiere senza doverci stare ─────
-- Il trigger vale da ora in avanti e non tocca le righe gia' scritte.
-- Dopo aver sistemato i tipi, questa dice se un non-operaio ha ore su
-- qualche rapportino.
--
-- ⚠️  NON cancellarle a cuor leggero: sono ore gia' dichiarate, e se
-- quel rapportino e' gia' stato validato sono anche ore gia' passate
-- alle paghe. Vanno guardate una per una e, semmai, riportate a mano
-- nel foglio personale della persona prima di toglierle.

select r.data, c.codice, d.nome, d.cognome, d.tipo,
       o.ore_ordinarie, o.ore_straordinarie, o.ore_assenza, r.stato
from public.rapportino_ore o
join public.dipendenti d on d.id = o.dipendente_id
join public.rapportini  r on r.id = o.rapportino_id
join public.cantieri    c on c.id = r.cantiere_id
where d.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid
  and d.tipo <> 'operaio'
order by r.data desc, d.cognome;

-- L'accesso ai cantieri invece NON si tocca: il tecnico deve continuare
-- a vedere i suoi. Quello passa da `cantiere_assegnazioni`, che assegna
-- UTENTI e non schede operaio, e resta com'e'.
