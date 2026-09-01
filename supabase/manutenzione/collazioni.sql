-- =====================================================================
-- collation version mismatch - diagnosi e riparazione
--
-- Da eseguire nel SQL Editor di Supabase UN BLOCCO ALLA VOLTA.
-- Seleziona dalla riga "select"/"reindex" in giu': se la selezione taglia
-- i due trattini di un commento, Postgres prova a eseguirlo e fallisce
-- con "syntax error".
--
-- Vedi STATO_LAVORI.md, sezione "Manutenzione: collation version mismatch".
-- =====================================================================


-- 1. CHI E' DISALLINEATO, E CON QUALE LIBRERIA
-- Esito del 2026-09-01: ICU, en_US.UTF-8, 153.120 -> 153.121,
-- disallineati sia "postgres" sia "template1".
select datname                                         as database,
       case datlocprovider when 'c' then 'libc'
                           when 'i' then 'ICU'
                           when 'b' then 'builtin' end as libreria,
       datcollate,
       datcollversion                                  as registrata,
       pg_database_collation_actual_version(oid)       as reale,
       datcollversion is distinct from
         pg_database_collation_actual_version(oid)     as disallineato
from pg_database
where datallowconn
order by datname;


-- 2. COLLAZIONI NON-DEFAULT FUORI POSTO
-- Quelle create a parte, es. per ordinamenti case-insensitive.
select collname,
       collversion                      as registrata,
       pg_collation_actual_version(oid) as reale
from pg_collation
where collversion is not null
  and collversion is distinct from pg_collation_actual_version(oid);


-- 3. QUALI INDICI SONO DAVVERO ESPOSTI
-- Solo gli indici su colonne testuali con una collazione linguistica
-- rischiano: "C" e "POSIX" ordinano byte a byte e sono immuni. Gli unici
-- sono i piu' delicati, perche' li' un ordinamento sbagliato non rallenta
-- una ricerca, lascia entrare un duplicato.
-- Questo elenco e' la lista della spesa per il passo 6.
select n.nspname      as schema,
       c.relname      as tabella,
       i.relname      as indice,
       a.attname      as colonna,
       co.collname    as collazione,
       x.indisunique  as unico
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
order by x.indisunique desc, 1, 2, 3;


-- 4. POSSO ARRIVARE FINO IN FONDO?
-- "refresh collation version" vuole l'ownership del database. Su Supabase
-- il ruolo `postgres` non e' superuser, quindi conviene saperlo prima di
-- arrivare al passo 7 e prendersi un errore.
select current_user,
       pg_get_userbyid(datdba)                            as proprietario_db,
       pg_has_role(current_user, datdba, 'member')        as posso_fare_refresh
from pg_database
where datname = current_database();


-- 5. IL DANNO C'E' GIA'?
-- amcheck sarebbe lo strumento giusto, ma su Supabase non e' abilitabile:
-- "permission denied to create extension amcheck - must be superuser".
-- Ripiego: cerchiamo i duplicati leggendo la TABELLA invece dell'indice.
-- Se un indice unico avesse lasciato passare un doppione, l'indice non lo
-- vede (e' lui il bugiardo) ma una scansione sequenziale si'.
-- Questa query non controlla niente: GENERA i controlli da eseguire.
-- Copia la colonna `controllo` e lanciala.
select format(
         'set enable_indexscan=off; set enable_bitmapscan=off; '
         'set enable_indexonlyscan=off; '
         'select %I, count(*) from %I.%I group by 1 having count(*) > 1;',
         a.attname, n.nspname, c.relname) as controllo
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
where n.nspname = 'public'
  and x.indisunique
  and k.colloid <> 0
  and co.collname not in ('C', 'POSIX')
  and array_length(string_to_array(x.indkey::text, ' '), 1) = 1;


-- 6. RIPARAZIONE: RICOSTRUIRE GLI INDICI
-- L'ORDINE NON E' NEGOZIABILE: prima si ricostruisce con le regole nuove,
-- poi si registra la versione. Il passo 7 da solo spegne la spia senza
-- togliere il guasto.
--
-- `reindex schema public` non gira dentro una transazione e l'editor SQL
-- ne apre sempre una: ti becchi "cannot run inside a transaction block".
-- `reindex table` invece in transazione ci sta. Una riga per tabella,
-- prese dal passo 3:
--
--   reindex table public.cantieri;
--   reindex table public.clienti;
--   reindex table public.organizations;
--   ...
--
-- Per generare l'elenco gia' scritto, con le sole tabelle che servono:
select string_agg(distinct
         format('reindex table %I.%I;', n.nspname, c.relname),
         E'\n' order by format('reindex table %I.%I;', n.nspname, c.relname)
       ) as da_eseguire
from pg_index x
join pg_class i     on i.oid = x.indexrelid
join pg_class c     on c.oid = x.indrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral unnest(
       string_to_array(x.indkey::text, ' ')::int[],
       string_to_array(x.indcollation::text, ' ')::oid[]
     ) with ordinality as k(attnum, colloid, pos)
where n.nspname = 'public'
  and k.colloid <> 0
  and (select collname from pg_collation where oid = k.colloid)
      not in ('C', 'POSIX');


-- 7. REGISTRARE LA VERSIONE NUOVA
-- Solo dopo il passo 6. Se il passo 4 diceva posso_fare_refresh = false,
-- questo rimbalza con "must be owner of database postgres": in quel caso
-- lo puo' fare solo il supporto Supabase. Non e' grave: il reindex ha gia'
-- messo i dati in sicurezza, quello che resta e' rumore nei log.
-- `template1` non e' toccabile e non riguarda l'applicazione.
alter database postgres refresh collation version;


-- 8. VERIFICA
-- Rilancia il passo 1: `disallineato` deve essere false.
