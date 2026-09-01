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
create policy rapportini_write on storage.objects
  for insert with check (
    bucket_id = 'rapportini'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'rapportini.create')
    and app.puo_vedere_cantiere(((storage.foldername(name))[2])::uuid)
  );

-- Cancellare una foto e' un'azione da chi valida, non da chi compila:
-- un rapportino inviato non deve poter perdere le sue prove.
create policy rapportini_delete on storage.objects
  for delete using (
    bucket_id = 'rapportini'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'rapportini.validate')
  );


-- 4. VERIFICA
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
