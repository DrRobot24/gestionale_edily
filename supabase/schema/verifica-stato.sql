-- =====================================================================
-- "Questi SQL li ho gia' lanciati o no?"
--
-- Una sola query di sola lettura: non scrive niente, non crea niente, si
-- puo' incollare nel SQL Editor tutte le volte che si vuole.
--
-- Serve perche' i file dello schema si eseguono a mano, uno per volta, e
-- fra una sessione e l'altra non resta traccia di chi ha lanciato cosa.
-- Finche' non c'e' un sistema di migrazioni vero (punto 1 dei prossimi
-- passi in STATO_LAVORI.md), questa e' la memoria.
--
-- Come si legge: ogni riga e' un pezzo di uno dei tre file. FATTO vuol
-- dire che quel pezzo c'e' gia'. DA FARE vuol dire che manca.
-- =====================================================================

select '1. colonna rapportini.annotazioni' as verifica,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'rapportini'
           and column_name = 'annotazioni'
       ) then 'FATTO' else 'DA FARE' end as stato,
       'rapportino-annotazioni.sql' as file

union all

-- Il pezzo piu' importante dei tre: finche' `public` e' true chiunque
-- abbia l'indirizzo di un file lo legge senza autenticarsi, e la RLS non
-- viene nemmeno interpellata.
select '2a. bucket rapportini chiuso',
       case
         when not exists (select 1 from storage.buckets where id = 'rapportini')
           then 'BUCKET ASSENTE'
         when exists (select 1 from storage.buckets where id = 'rapportini' and public = false)
           then 'FATTO'
         else 'DA FARE — oggi e'' PUBBLICO'
       end,
       'storage-rapportini.sql'

union all

select '2b. policy sui file (attese 3)',
       (select count(*)::text || ' su 3'
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname in ('rapportini_read', 'rapportini_write', 'rapportini_delete')),
       'storage-rapportini.sql'

union all

select '3a. RLS attiva su rapportino_foto',
       case when exists (
         select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'rapportino_foto'
           and c.relrowsecurity
       ) then 'FATTO' else 'DA FARE' end,
       'rapportino-foto.sql'

union all

-- Il conteggio e non "FATTO/DA FARE": se wbs-office ha messo policy sue,
-- il numero non e' 3 e non e' zero, e va guardato a mano invece che
-- interpretato da qui.
select '3b. policy su rapportino_foto',
       (select count(*)::text || ' presenti'
        from pg_policies
        where schemaname = 'public' and tablename = 'rapportino_foto'),
       'rapportino-foto.sql'

order by 1;


-- ── Se 3b non fa 3, guarda quali sono prima di decidere ──────────────
-- select policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public' and tablename = 'rapportino_foto'
-- order by policyname;
