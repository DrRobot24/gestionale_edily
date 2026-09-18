-- =====================================================================
-- La scheda della persona: anagrafica vera, documenti, DPI
--
-- Chiesto dall'utente il 2026-09-18, dal punto di vista di Stefania
-- (amministrazione@cassia.com), che e' quella che crea le anagrafiche.
--
-- COSA MANCAVA. La scheda sapeva come si chiama una persona, che
-- mansione ha e quanto costa, ma non CHI E': niente data di nascita,
-- niente residenza, niente documenti. Per fare una busta paga o per
-- mandare qualcuno in cantiere quelle cose servono, e finora vivevano
-- su fogli di carta in ufficio.
--
-- QUATTRO COSE, che sono la stessa decisione:
--   1. colonne nuove su `dipendenti`
--   2. `dipendente_documenti` per patentini, attestati, identita'
--   3. il bucket `personale`, chiuso dal primo momento
--   4. le policy, che seguono quelle delle anagrafiche
--
-- DATABASE CONDIVISO CON WBS-OFFICE: qui si AGGIUNGE soltanto —
-- colonne con un default, una tabella nuova, un bucket nuovo — e non si
-- rinomina ne' si restringe niente. L'altro frontend non se ne accorge.
--
-- Si puo' rilanciare senza danno: `if not exists` ovunque, le policy si
-- tolgono prima di rimetterle.
--
-- Da eseguire nel SQL Editor, un blocco per volta, IN QUEST'ORDINE.
-- =====================================================================


-- =====================================================================
-- 1. CHI E' LA PERSONA
-- =====================================================================

alter table public.dipendenti
  add column if not exists data_nascita date,
  add column if not exists luogo_nascita text,
  add column if not exists residenza text;

-- Testo libero e non un enum: le patenti sono B, C, CQC, i patentini
-- del muletto o della piattaforma aerea, e l'elenco cambia da impresa a
-- impresa. Un enum qui vorrebbe dire una migrazione ogni volta che
-- qualcuno prende un'abilitazione nuova.
alter table public.dipendenti
  add column if not exists patente text;

-- Il taccuino della persona: patologie, allergie, «non puo' salire sui
-- ponteggi», il numero di chi chiamare. Roba che non sta in nessun
-- campo strutturato ma che in cantiere puo' servire il giorno
-- sbagliato.
alter table public.dipendenti
  add column if not exists note text;

comment on column public.dipendenti.note is
  'Note generali: patologie, limitazioni, contatti di emergenza. Dato sensibile (salute): la scheda e'' chiusa su anagrafiche.write, vedi il blocco 7.';


-- =====================================================================
-- 2. IL PERMESSO DI SOGGIORNO
-- =====================================================================
--
-- Due colonne e non una, perche' sono due fatti diversi: SE serve, e
-- QUANDO scade. Un cittadino italiano non ha un permesso e la scadenza
-- non esiste; uno straniero ce l'ha e quella data va guardata.
--
-- E' L'UNICO CAMPO DI TUTTA LA SCHEDA CHE SCADE, ed e' il motivo per
-- cui la scadenza sta in una colonna sua invece che dentro le note: una
-- data in un campo `date` si puo' interrogare, e un domani diventa il
-- promemoria in home che avvisa PRIMA che sia tardi — che e' il posto
-- dove l'utente ha detto che stanno le cose da fare. Dentro le note
-- sarebbe testo che nessuno rilegge.

alter table public.dipendenti
  add column if not exists permesso_soggiorno boolean not null default false,
  add column if not exists permesso_scadenza date;

-- La scadenza esiste solo se il permesso c'e'. Senza questo vincolo
-- resterebbe una data orfana quando si toglie la spunta, e fra un anno
-- nessuno saprebbe piu' se vale.
alter table public.dipendenti
  drop constraint if exists dipendenti_permesso_coerente;
alter table public.dipendenti
  add constraint dipendenti_permesso_coerente
  check (permesso_soggiorno or permesso_scadenza is null);


-- =====================================================================
-- 3. I DPI CONSEGNATI
-- =====================================================================
--
-- Cosa gli e' stato dato: scarpe antinfortunistiche, casco, imbracatura,
-- guanti. Serve a sapere chi e' equipaggiato prima di mandarlo in
-- cantiere, e a rispondere a un'ispezione che chiede se i DPI sono
-- stati consegnati davvero.
--
-- `text[]` e non una tabella a parte: e' un elenco di etichette senza
-- attributi propri, e una tabella con due colonne chiederebbe una join
-- per leggere una lista di parole. Il giorno che servisse la data di
-- consegna o la taglia diventa una tabella — ma oggi l'utente ha
-- chiesto di sapere COSA possiede, non quando gli e' stato dato.

alter table public.dipendenti
  add column if not exists dpi text[] not null default '{}';


-- =====================================================================
-- 4. LO STATO DEL RAPPORTO
-- =====================================================================
--
-- Deciso con l'utente il 2026-09-18. La domanda vera era «ha un
-- contratto oppure no», perche' cambia come si tratta la persona nelle
-- paghe e nella sicurezza.
--
-- SI CHIAMA COSI' DI PROPOSITO. Una colonna che dicesse «in nero»
-- lascerebbe scritta nel database, con data e autore, la prova di un
-- illecito — e questo gestionale si vende ad altre imprese. «Da
-- inquadrare» dice la stessa cosa a chi lavora («questa persona non ha
-- ancora un contratto attivo») ma descrive il COMPITO CHE MANCA invece
-- dell'illecito in corso. L'informazione operativa e' identica, il
-- rischio no.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'stato_rapporto') then
    create type public.stato_rapporto as enum ('assunto', 'in_prova', 'da_inquadrare');
  end if;
end $$;

-- Default `assunto`: le righe che esistono gia' sono dipendenti veri, e
-- marcarle tutte «da inquadrare» sarebbe inventare un dato.
alter table public.dipendenti
  add column if not exists stato_rapporto public.stato_rapporto
  not null default 'assunto';


-- =====================================================================
-- 5. I DOCUMENTI DELLA PERSONA
-- =====================================================================
--
-- Patentini, qualifiche, attestati di formazione, documenti di
-- identita'. Una tabella e non un campo, perche' i documenti sono
-- tanti, hanno un nome, una data e chi li ha caricati.
--
-- IL FILE STA NELLO STORAGE, qui c'e' solo il percorso. E' la stessa
-- forma di `rapportino_foto`, e per la stessa ragione: un PDF dentro
-- una colonna gonfia il database e rende lenta ogni lettura.

create table if not exists public.dipendente_documenti (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- `cascade`: cancellata la persona spariscono i suoi documenti. Non
  -- e' storia contabile come le ore di un rapportino — sono i SUOI
  -- documenti, e senza di lei non vogliono dire niente.
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  -- Come lo chiama chi lo cerca: «Attestato ponteggi», «Carta
  -- d'identita'». Non il nome del file, che e' scan_0034.pdf.
  titolo text not null,
  -- Il percorso nello storage, convenzione nel blocco 6.
  percorso text not null,
  -- Facoltativa perche' non tutti i documenti scadono: una carta
  -- d'identita' si', un attestato di qualifica no.
  scadenza date,
  caricato_da uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.dipendente_documenti enable row level security;

create index if not exists dipendente_documenti_dipendente_idx
  on public.dipendente_documenti (dipendente_id);


-- =====================================================================
-- 6. IL BUCKET, CHIUSO
-- =====================================================================
--
-- `public = false` DAL PRIMO MOMENTO, ed e' la lezione del bucket
-- `rapportini`, nato pubblico e chiuso dopo (`storage-rapportini.sql`).
-- Qui dentro ci sono documenti di identita' e permessi di soggiorno: un
-- bucket pubblico vorrebbe dire che chiunque abbia l'indirizzo se li
-- scarica, senza autenticazione e senza che la RLS venga nemmeno
-- interpellata.
--
-- CONVENZIONE DI PATH, senza eccezioni:
--
--     {org_id}/{dipendente_id}/{file}
--
-- Il primo segmento isola l'impresa ed e' l'unico appiglio che le
-- policy hanno per decidere.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personale',
  'personale',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- =====================================================================
-- 7. CHI PUO' VEDERE E SCRIVERE
-- =====================================================================
--
-- `anagrafiche.write` PER LEGGERE, e non e' un errore di copiatura.
--
-- Le altre anagrafiche si leggono con `anagrafiche.read`, che ce l'hanno
-- tutti — il tecnico compreso, perche' deve sapere chi puo' mettere in
-- squadra. Ma qui dentro ci sono le patologie di una persona, la sua
-- residenza e la sua carta d'identita': sapere che Rossi esiste e' una
-- cosa, potergli scaricare il permesso di soggiorno e' un'altra.
--
-- Alla Edily vuol dire Stefania e il titolare. Il tecnico continua a
-- vedere i nomi nella tendina della squadra, che e' cio' che gli serve.

drop policy if exists dipendente_documenti_select on public.dipendente_documenti;
create policy dipendente_documenti_select on public.dipendente_documenti
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_documenti_insert on public.dipendente_documenti;
create policy dipendente_documenti_insert on public.dipendente_documenti
  for insert with check (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_documenti_update on public.dipendente_documenti;
create policy dipendente_documenti_update on public.dipendente_documenti
  for update using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_documenti_delete on public.dipendente_documenti;
create policy dipendente_documenti_delete on public.dipendente_documenti
  for delete using (app.has_perm(org_id, 'anagrafiche.write'));


-- Lo storage, con lo stesso cancello e la stessa forma delle policy di
-- `rapportini`: il primo segmento del path dev'essere un UUID, e da li'
-- si decide. Il controllo sul formato non e' pignoleria — senza, un
-- path costruito a mano farebbe fallire il cast a uuid con un errore
-- invece di una negazione pulita.
drop policy if exists personale_read on storage.objects;
create policy personale_read on storage.objects
  for select using (
    bucket_id = 'personale'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.write')
  );

drop policy if exists personale_write on storage.objects;
create policy personale_write on storage.objects
  for insert with check (
    bucket_id = 'personale'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.write')
  );

drop policy if exists personale_delete on storage.objects;
create policy personale_delete on storage.objects
  for delete using (
    bucket_id = 'personale'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and app.has_perm(((storage.foldername(name))[1])::uuid, 'anagrafiche.write')
  );


-- =====================================================================
-- 8. VERIFICA — di sola lettura, si puo' rilanciare sempre
-- =====================================================================

-- Le colonne nuove ci sono tutte? Devono uscire 9 righe.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'dipendenti'
  and column_name in (
    'data_nascita', 'luogo_nascita', 'residenza', 'patente', 'note',
    'permesso_soggiorno', 'permesso_scadenza', 'dpi', 'stato_rapporto'
  )
order by column_name;

-- Il vincolo del permesso morde? Deve dire `true`.
select exists (
  select 1 from pg_constraint where conname = 'dipendenti_permesso_coerente'
) as vincolo_permesso_attivo;

-- Il bucket e' chiuso? `public` deve essere false.
select id, public, file_size_limit from storage.buckets where id = 'personale';

-- La RLS e' accesa sulla tabella dei documenti? Deve dire `true`.
select relrowsecurity as rls_attiva
from pg_class where relname = 'dipendente_documenti';

-- Le policy ci sono tutte? Devono uscire 4 righe per la tabella
-- e 3 per lo storage.
select tablename, policyname
from pg_policies
where policyname like 'dipendente_documenti%' or policyname like 'personale%'
order by tablename, policyname;
