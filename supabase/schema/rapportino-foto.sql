-- =====================================================================
-- Foto di cantiere: la tabella `rapportino_foto`
--
-- Il posto dove finiscono i file e' gia' deciso e sta nell'altro file:
--
--     ESEGUIRE PRIMA supabase/schema/storage-rapportini.sql
--
-- Senza quello il bucket `rapportini` resta pubblico e senza policy,
-- cioe' leggibile da chiunque abbia l'URL e scrivibile da nessuno: il
-- caricamento fallirebbe comunque.
--
-- Qui si mette in sicurezza la TABELLA, che e' un'altra cosa dal bucket.
-- Storage e database sono due controlli separati: le policy su
-- `storage.objects` decidono chi tocca i file, queste decidono chi vede
-- e scrive le righe che dicono quali file esistono. Servono entrambe -
-- una riga senza file e' un'anteprima rotta, un file senza riga e' spazio
-- occupato che nessuno trova piu'.
--
-- ATTENZIONE, DATABASE CONDIVISO con wbs-office: il blocco 2 crea le
-- policy SOLO se la tabella non ne ha nessuna. Se wbs-office ne ha gia'
-- messe di sue, non le tocca: le policy permissive si sommano in OR, e
-- aggiungerne alla cieca allargherebbe l'accesso invece di stringerlo.
--
-- Da eseguire nel SQL Editor, in ordine.
-- =====================================================================


-- 1. COM'E' MESSA ADESSO
-- Da leggere PRIMA di eseguire il resto. Se `rls_attiva` e' false e non
-- compare nessuna policy, la tabella e' scoperta e il blocco 2 la copre.
select c.relrowsecurity as rls_attiva, c.relforcerowsecurity as rls_forzata
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'rapportino_foto';

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'rapportino_foto'
order by policyname;


-- 2. LE POLICY
-- Stessa forma delle altre tabelle del gestionale: `<tabella>_select`
-- per la lettura e `<tabella>_write` per la scrittura, sempre attraverso
-- app.has_perm() e app.puo_vedere_cantiere().
--
-- La foto non ha un cantiere suo: ce l'ha il rapportino a cui e'
-- attaccata, e da li' si passa per lo scope. E' il motivo per cui ogni
-- condizione risale a `rapportini` invece di guardare solo `org_id`:
-- fermarsi all'impresa farebbe vedere a un tecnico le foto di cantieri
-- che non sono suoi.
alter table public.rapportino_foto enable row level security;

do $blocco$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rapportino_foto'
  ) then
    raise notice 'La tabella ha gia'' delle policy: non tocco niente. Leggile nel blocco 1 e decidi a mano.';
    return;
  end if;

  execute $p$
    create policy rapportino_foto_select on public.rapportino_foto
      for select using (
        app.has_perm(org_id, 'rapportini.read_all')
        or exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and app.puo_vedere_cantiere(r.cantiere_id)
        )
      )
  $p$;

  -- Si carica una foto solo su una scheda che si sta ancora
  -- compilando. Dopo l'invio il rapportino e' un documento consegnato:
  -- aggiungerci dentro una foto il giorno dopo, senza che il titolare
  -- se ne accorga, e' esattamente cio' che un rapporto di lavoro non
  -- deve permettere.
  execute $p$
    create policy rapportino_foto_insert on public.rapportino_foto
      for insert with check (
        app.has_perm(org_id, 'rapportini.create')
        and exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and app.puo_vedere_cantiere(r.cantiere_id)
            and r.stato in ('bozza', 'respinto')
        )
      )
  $p$;

  -- Togliere una foto: chi valida sempre, l'autore finche' la scheda e'
  -- sua. Vedi la policy gemella su storage.objects, che deve dire la
  -- stessa cosa o si resta con dei file orfani.
  execute $p$
    create policy rapportino_foto_delete on public.rapportino_foto
      for delete using (
        app.has_perm(org_id, 'rapportini.validate')
        or exists (
          select 1 from public.rapportini r
          where r.id = rapportino_id
            and r.compilato_da = auth.uid()
            and r.stato in ('bozza', 'respinto')
        )
      )
  $p$;

  raise notice 'Create le tre policy su rapportino_foto.';
end
$blocco$;


-- 3. VERIFICA
-- Devono comparire rapportino_foto_select, _insert e _delete, oppure
-- quelle che c'erano gia' se il blocco 2 si e' fermato.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'rapportino_foto'
order by policyname;


-- 4. PROVA DAL VIVO
-- Come tecnico@cassia.com, su una sua bozza: il caricamento dal
-- gestionale deve andare a buon fine e la foto comparire nella scheda.
-- Poi, sulla stessa scheda una volta inviata, il pulsante per togliere
-- la foto non deve piu' esserci - e se si forza la chiamata, la riga non
-- si cancella.
