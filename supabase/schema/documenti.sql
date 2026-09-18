-- =====================================================================
-- I DOCUMENTI: cantieri, clienti, fornitori, magazzino
--
-- Chiesto dall'utente il 2026-09-18: «la possibilita' di creare,
-- modificare ed eliminare i documenti per i clienti (o relativi ai
-- cantieri). Il tecnico li puo' solo visionare».
--
-- COSA C'ERA. Nella scheda del cantiere un riquadro «Documenti» che
-- dichiarava di essere vuoto: il bucket `rapportini` accetta solo
-- immagini, quindi i PDF volevano uno spazio loro che non era mai stato
-- creato. Su clienti, fornitori e magazzino non c'era niente.
--
-- UNA TABELLA SOLA, NON QUATTRO. Un documento e' sempre la stessa cosa —
-- un file, un titolo, una data — e cambia solo a CHE COSA e' attaccato.
-- Quattro tabelle identiche vorrebbero dire quattro volte le policy,
-- quattro componenti e quattro posti dove correggere lo stesso difetto.
--
-- Il legame e' una coppia (`ambito`, `riferimento_id`): un enum dice a
-- che cosa e' attaccato, un uuid dice a quale. Non ci sono quattro
-- chiavi esterne nullable, che e' l'altra strada possibile: con quelle
-- nulla impedirebbe una riga con due riferimenti insieme, o con
-- nessuno.
--
-- ⚠️ IL PREZZO DA PAGARE, detto perche' si sappia: senza chiave esterna
-- il database NON cancella da solo i documenti di un cliente cancellato.
-- Restano righe orfane. E' il compromesso per avere una tabella sola, e
-- si tiene sotto controllo con la query di manutenzione in fondo.
--
-- `dipendente_documenti` NON viene toccata e resta separata: i documenti
-- di una persona sono dati sensibili — carte d'identita', permessi di
-- soggiorno — e hanno un cancello piu' stretto di tutto questo file.
-- Unificarle vorrebbe dire far dipendere quella riservatezza da un
-- `ambito` scritto giusto.
--
-- DATABASE CONDIVISO CON WBS-OFFICE: qui si aggiunge soltanto.
-- Si puo' rilanciare senza danno.
--
-- Da eseguire nel SQL Editor, un blocco per volta, IN QUEST'ORDINE.
-- =====================================================================


-- =====================================================================
-- 1. A CHE COSA E' ATTACCATO
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ambito_documento') then
    create type public.ambito_documento as enum
      ('cantiere', 'cliente', 'fornitore', 'materiale');
  end if;
end $$;


-- =====================================================================
-- 2. LA TABELLA
-- =====================================================================

create table if not exists public.documenti (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  ambito public.ambito_documento not null,
  -- L'id della cosa a cui appartiene. Niente foreign key perche'
  -- punterebbe a quattro tabelle diverse: vedi l'avvertenza in cima.
  riferimento_id uuid not null,

  -- Come lo chiama chi lo cerca — «Computo metrico», «Contratto 2026»,
  -- «Scheda tecnica» — non il nome del file, che e' scan_0034.pdf.
  titolo text not null,
  -- Il percorso nello storage. Si chiama `percorso` come in
  -- `dipendente_documenti`: `rapportino_foto` usa `storage_path`, ed e'
  -- un'incoerenza che esiste gia' e che non vale la pena propagare
  -- scegliendo a caso ogni volta.
  percorso text not null,
  -- Facoltativa: un contratto scade, un disegno no. Quando c'e', la
  -- scheda la segnala in rosso o in ambra come fa quella delle persone.
  scadenza date,
  note text,

  caricato_da uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documenti enable row level security;

-- L'indice sulla coppia, che e' come si legge sempre: «i documenti di
-- QUESTO cantiere». Senza, ogni apertura di scheda e' una scansione.
create index if not exists documenti_riferimento_idx
  on public.documenti (ambito, riferimento_id);

create index if not exists documenti_org_idx on public.documenti (org_id);


-- =====================================================================
-- 3. IL BUCKET, CHIUSO
-- =====================================================================
--
-- Come `personale`, e per la stessa ragione: `public = false` dalla
-- nascita. Qui dentro finiscono contratti con gli importi e computi
-- metrici, e un bucket pubblico vorrebbe dire che chiunque abbia
-- l'indirizzo se li scarica senza autenticazione.
--
-- CONVENZIONE DI PATH, senza eccezioni:
--
--     {org_id}/{ambito}/{riferimento_id}/{file}
--
-- Il primo segmento isola l'impresa ed e' l'unico appiglio delle
-- policy. Il secondo e il terzo servono a ritrovare i file a mano dal
-- pannello di Supabase, che con migliaia di documenti e' l'unico modo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti',
  'documenti',
  false,
  -- 50 MB e non 20 come `personale`: un computo metrico o una tavola di
  -- progetto pesano molto piu' di una carta d'identita' scansionata.
  52428800,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    -- I formati d'ufficio: un computo arriva spesso in Excel, un
    -- verbale in Word.
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- =====================================================================
-- 4. CHI PUO' FARE COSA
-- =====================================================================
--
-- LA REGOLA, con le parole dell'utente: «sia per Stefania che per il
-- titolare la possibilita' di creare, modificare ed eliminare. Il
-- tecnico li puo' solo visionare».
--
-- Scrive chi ha `anagrafiche.write` — alla Edily Stefania e Giuseppe.
--
-- IN LETTURA IL TECNICO VEDE SOLO I CANTIERI SUOI, ed e' una scelta
-- fatta con l'utente il 2026-09-18. Sui cantieri e' lavoro suo: deve
-- poter aprire un computo o un disegno del posto dove va. Clienti e
-- fornitori no — contratti, listini, condizioni di pagamento sono
-- documenti commerciali, e il tecnico gia' oggi non vede quelle
-- anagrafiche. Il magazzino lo vede, come vede il magazzino stesso.
--
-- Il perimetro passa da `app.puo_vedere_cantiere()`, la stessa funzione
-- che decide i rapportini e le note contabili. Non una regola nuova:
-- quella che c'e' gia', applicata anche qui.

drop policy if exists documenti_select on public.documenti;
create policy documenti_select on public.documenti
  for select using (
    app.has_perm(org_id, 'anagrafiche.write')
    or (
      ambito = 'cantiere'
      and app.has_perm(org_id, 'rapportini.create')
      and app.puo_vedere_cantiere(riferimento_id)
    )
    or (
      ambito = 'materiale'
      and app.has_perm(org_id, 'anagrafiche.read')
    )
  );

drop policy if exists documenti_insert on public.documenti;
create policy documenti_insert on public.documenti
  for insert with check (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists documenti_update on public.documenti;
create policy documenti_update on public.documenti
  for update using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists documenti_delete on public.documenti;
create policy documenti_delete on public.documenti
  for delete using (app.has_perm(org_id, 'anagrafiche.write'));


-- Lo storage. In LETTURA basta appartenere all'impresa: chi non ha il
-- diritto di vedere un documento non ne conosce il percorso, perche' la
-- riga che lo nomina gli e' gia' nascosta dalla policy qui sopra.
--
-- Fare di meglio vorrebbe dire rileggere `ambito` dal path e
-- interrogare `puo_vedere_cantiere` a ogni download: si puo', ma
-- costringerebbe la convenzione di path a non cambiare mai piu'. Se un
-- domani i documenti di cantiere diventassero davvero riservati, la
-- policy da stringere e' questa — ed e' scritto qui perche' si sappia
-- dove mettere le mani.
drop policy if exists documenti_read on storage.objects;
create policy documenti_read on storage.objects
  for select using (
    bucket_id = 'documenti'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.read')
  );

drop policy if exists documenti_write on storage.objects;
create policy documenti_write on storage.objects
  for insert with check (
    bucket_id = 'documenti'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.write')
  );

drop policy if exists documenti_remove on storage.objects;
create policy documenti_remove on storage.objects
  for delete using (
    bucket_id = 'documenti'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.write')
  );


-- =====================================================================
-- 5. VERIFICA — di sola lettura, si puo' rilanciare sempre
-- =====================================================================

-- La tabella c'e' con le sue colonne? Devono uscire 11 righe.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'documenti'
order by ordinal_position;

-- La RLS e' accesa? Deve dire `true`.
select relrowsecurity as rls_attiva
from pg_class where relname = 'documenti';

-- Il bucket e' chiuso? `public` deve essere false, il limite 52428800.
select id, public, file_size_limit from storage.buckets where id = 'documenti';

-- Le policy: 4 sulla tabella, 3 sullo storage.
select tablename, policyname, cmd
from pg_policies
where policyname like 'documenti%'
order by tablename, policyname;


-- =====================================================================
-- 6. MANUTENZIONE: i documenti rimasti orfani
-- =====================================================================
--
-- Da lanciare ogni tanto, e SEMPRE prima di dire che un cliente e'
-- stato cancellato del tutto. Senza chiave esterna il database non
-- pulisce da se': e' il prezzo della tabella unica, dichiarato in cima.
--
-- Di sola lettura: mostra cosa c'e' da togliere, non lo toglie.

select d.id, d.ambito, d.titolo, d.percorso, d.created_at
from public.documenti d
where (d.ambito = 'cantiere'  and not exists (select 1 from public.cantieri  x where x.id = d.riferimento_id))
   or (d.ambito = 'cliente'   and not exists (select 1 from public.clienti   x where x.id = d.riferimento_id))
   or (d.ambito = 'fornitore' and not exists (select 1 from public.fornitori x where x.id = d.riferimento_id))
   or (d.ambito = 'materiale' and not exists (select 1 from public.materiali x where x.id = d.riferimento_id))
order by d.created_at;

-- I file nello storage vanno tolti a parte: cancellare la riga non
-- cancella il file. Prendere i `percorso` della query qui sopra e
-- rimuoverli dal bucket `documenti`.
