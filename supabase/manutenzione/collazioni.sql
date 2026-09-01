-- ═══════════════════════════════════════════════════════════════════════
-- collation version mismatch — diagnosi e riparazione
-- Da eseguire nel SQL Editor di Supabase, un blocco alla volta.
-- Vedi STATO_LAVORI.md, sezione "Manutenzione: collation version mismatch".
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. CHI E' DISALLINEATO, E CON QUALE LIBRERIA ───────────────────────
-- datlocprovider: 'c' = libc/glibc, 'i' = ICU. Cambia la cura: le versioni
-- glibc sono tipo "2.39", quelle ICU tipo "153.120".
select datname                                        as database,
       case datlocprovider when 'c' then 'libc'
                           when 'i' then 'ICU'
                           when 'b' then 'builtin' end as libreria,
       datcollate,
       datcollversion                                 as registrata,
       pg_database_collation_actual_version(oid)      as reale,
       datcollversion is distinct from
         pg_database_collation_actual_version(oid)    as disallineato
from pg_database
where datallowconn
order by datname;


-- ── 2. COLLAZIONI NON-DEFAULT FUORI POSTO ──────────────────────────────
-- Quelle create a parte (es. per ordinamenti case-insensitive).
select collname,
       collversion as registrata,
       pg_collation_actual_version(oid) as reale
from pg_collation
where collversion is not null
  and collversion is distinct from pg_collation_actual_version(oid);


-- ── 3. QUALI INDICI SONO DAVVERO ESPOSTI ───────────────────────────────
-- Solo gli indici su colonne testuali con una collazione linguistica
-- rischiano: "C" e "POSIX" ordinano byte a byte e sono immuni per
-- definizione. Gli unici (indisunique) sono i piu' delicati, perche' li'
-- un ordinamento sbagliato non degrada la ricerca, lascia entrare un
-- duplicato.
select n.nspname                    as schema,
       c.relname                    as tabella,
       i.relname                    as indice,
       a.attname                    as colonna,
       co.collname                  as collazione,
       x.indisunique                as unico,
       pg_size_pretty(pg_relation_size(i.oid)) as peso
from pg_index x
join pg_class i     on i.oid = x.indexrelid
join pg_class c     on c.oid = x.indrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral unnest(
       string_to_array(x.indkey::text, ' ')::int[],
       string_to_array(x.indcollation::text, ' ')::oid[]
     ) with ordinality as k(attnum, colloid, pos)
join pg_attribute  a on a.attrelid = c.oid and a.attnum = k.attnum
join pg_collation co on co.oid = k.colloid
where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and k.colloid <> 0
  and co.collname not in ('C', 'POSIX')
order by x.indisunique desc, n.nspname, c.relname, i.relname;


-- ── 4. IL DANNO C'E' GIA'? ─────────────────────────────────────────────
-- amcheck legge l'indice e verifica che l'ordinamento sia ancora coerente
-- con le regole attuali. Nessun output = nessun problema; un errore dice
-- esattamente quale indice e' da ricostruire. heapallindexed controlla
-- anche che ogni riga della tabella sia presente nell'indice.
create extension if not exists amcheck;

select i.relname as indice,
       bt_index_check(index => i.oid, heapallindexed => true) as esito
from pg_index x
join pg_class i     on i.oid = x.indexrelid
join pg_class c     on c.oid = x.indrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_am am       on am.oid = i.relam
where n.nspname = 'public'
  and am.amname = 'btree'
  and i.relpersistence = 'p';


-- ── 5. RIPARAZIONE ─────────────────────────────────────────────────────
-- L'ORDINE NON E' NEGOZIABILE: prima si ricostruisce con le regole nuove,
-- poi si registra la versione. Fare solo il refresh spegne la spia senza
-- togliere il guasto.

reindex schema public;
-- Se l'editor rifiuta con "cannot run inside a transaction block", vai
-- tabella per tabella:  reindex table public.<nome>;

alter database postgres refresh collation version;
-- Serve essere owner del database. Su Supabase il ruolo `postgres` non e'
-- superuser: se torna "must be owner of database postgres", il refresh lo
-- puo' fare solo il supporto Supabase. Il reindex qui sopra e' comunque
-- gia' bastato a mettere in sicurezza i dati: resta solo il messaggio nei
-- log. `template1` non e' toccabile e non riguarda l'applicazione.


-- ── 6. VERIFICA ────────────────────────────────────────────────────────
-- Rilancia il blocco 1: la colonna `disallineato` deve essere false.
