-- =====================================================================
-- Bucket `rapportini`: da pubblico a isolato per impresa
--
-- Stato trovato il 2026-09-01:
--   public = true         -> chiunque abbia l'URL legge il file senza
--                            autenticazione, la RLS non viene nemmeno
--                            interpellata
--   nessuna policy        -> di conseguenza nessuno puo' scriverci
--   allowed_mime_types    -> null, cioe' qualunque tipo di file
--   rapportino_foto       -> 0 righe
--
-- Su un gestionale multi-tenant un bucket pubblico vuol dire che per
-- quei file l'isolamento fra imprese non esiste: basta che un indirizzo
-- finisca in una mail, in un log o nella cache di un proxy. E nelle foto
-- di cantiere ci sono volti di operai, targhe, documenti fotografati.
--
-- Si ripara adesso a costo zero perche' il bucket e' vuoto: nessun file
-- da spostare, nessun URL pubblico gia' in circolazione da invalidare.
--
-- ATTENZIONE, DATABASE CONDIVISO: se wbs-office mostra quelle foto con
-- getPublicUrl(), dopo il blocco 1 smettera' di vederle e dovra' passare
-- a createSignedUrl(). Il gestionale non e' interessato - non ha una
-- sola chiamata a supabase.storage. Verificare di la' prima di eseguire.
-- =====================================================================


-- 1. CHIUDERE IL BUCKET
-- Un limite ai tipi di file c'e' un motivo per metterlo: senza, quello
-- che nasce come archivio di foto diventa il posto dove finisce di tutto.
update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id = 'rapportini';


-- 2. LA CONVENZIONE DI PATH
-- Da qui in avanti, e senza eccezioni:
--
--     {org_id}/{cantiere_id}/{rapportino_id}/{file}
--
-- I primi due segmenti non sono ordine estetico, sono gli unici appigli
-- che una policy ha per decidere: il primo isola l'impresa, il secondo
-- permette di applicare lo scope per cantiere. `rapportino_foto` non ha
-- una colonna cantiere_id, quindi se il cantiere non sta nel path la
-- policy non ha modo di sapere a quale cantiere appartiene la foto.
--
-- La si sceglie ora perche' il bucket e' vuoto. Dopo, cambiarla vuol
-- dire spostare i file gia' caricati.


-- 3. LE POLICY
-- La condizione e' scritta come "chi vede tutto OPPURE chi e' assegnato"
-- invece di affidarsi a cio' che app.puo_vedere_cantiere() fa al suo
-- interno con chi ha cantieri.read_all: cosi' regge comunque, qualunque
-- sia il comportamento della funzione.
--
-- I controlli sul formato prima dei cast non sono pignoleria: un file
-- con segmenti non-uuid farebbe fallire il cast, e una policy che va in
-- errore blocca la lettura dell'intero bucket, non solo di quel file.
--
-- Ogni policy si toglie prima di rifarla, cosi' il file si puo'
-- rilanciare senza schiantarsi con un 42710 «policy gia' esistente».
-- Non e' pigrizia: questi file si eseguono a mano, fra una sessione e
-- l'altra, e chi li lancia non ha modo di ricordare cosa aveva gia'
-- fatto. Un file che si puo' rilanciare e' un file che si puo' lanciare.
-- Il SQL Editor esegue tutto in una transazione, quindi fra il drop e il
-- create non esiste un istante in cui il bucket resta scoperto.

drop policy if exists rapportini_read on storage.objects;
create policy rapportini_read on storage.objects
  for select using (
    bucket_id = 'rapportini'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and (
      app.has_perm(((storage.foldername(name))[1])::uuid, 'rapportini.read_all')
      or app.puo_vedere_cantiere(((storage.foldername(name))[2])::uuid)
    )
  );

-- Chi carica una foto e' il tecnico che compila il rapportino: gli serve
-- rapportini.create, e solo sui cantieri che gli sono assegnati.
drop policy if exists rapportini_write on storage.objects;
create policy rapportini_write on storage.objects
  for insert with check (
    bucket_id = 'rapportini'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'rapportini.create')
    and app.puo_vedere_cantiere(((storage.foldername(name))[2])::uuid)
  );

-- Cancellare una foto da un rapportino gia' partito e' un'azione da chi
-- valida: le prove di una giornata inviata non devono poter sparire.
--
-- Ma finche' la scheda e' in mano al tecnico - bozza o respinta - deve
-- poter togliere la foto storta o quella sbagliata che ha appena
-- caricato. Negarglielo non protegge niente e lo costringe a mandare al
-- titolare una scheda che sa di avere un errore dentro.
drop policy if exists rapportini_delete on storage.objects;
create policy rapportini_delete on storage.objects
  for delete using (
    bucket_id = 'rapportini'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (
      app.has_perm(((storage.foldername(name))[1])::uuid, 'rapportini.validate')
      or (
        (storage.foldername(name))[3] ~ '^[0-9a-fA-F-]{36}$'
        and exists (
          select 1
          from public.rapportini r
          where r.id = ((storage.foldername(name))[3])::uuid
            and r.compilato_da = auth.uid()
            and r.stato in ('bozza', 'respinto')
        )
      )
    )
  );


-- 4. VERIFICA
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
