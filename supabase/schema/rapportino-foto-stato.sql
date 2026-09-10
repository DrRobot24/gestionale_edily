-- =====================================================================
-- `rapportino_foto`: legare le foto allo stato della scheda
--
-- ⚠️  NON ESEGUIRE ANCORA. Va prima verificato wbs-office: vedi il
--     blocco 0. Questo file cambia policy che NON abbiamo scritto noi.
--
-- COSA C'E' ADESSO (letto il 2026-09-10 sul database vero)
--
--   rapportino_foto_select   SELECT   chi vede il cantiere
--   rapportino_foto_write    ALL      chi vede il cantiere, ed e'
--                                     l'autore della scheda oppure ha
--                                     rapportini.validate
--
-- Queste due non le ha create il gestionale: `rapportino-foto.sql` ne
-- crea tre o nessuna, e si e' fermato da solo trovandole. Vengono da
-- wbs-office, che condivide questo database.
--
-- FUNZIONA? Si'. `FOR ALL` copre insert, update e delete, e la select e'
-- coperta due volte (le policy permissive si sommano in OR). Le foto si
-- caricano, si vedono e si tolgono. Non c'e' niente di rotto da riparare
-- in fretta.
--
-- ALLORA QUAL E' IL PROBLEMA: manca il controllo sullo STATO della
-- scheda. L'autore di un rapportino puo' aggiungere e togliere foto
-- anche dopo averlo inviato, e anche dopo che il titolare l'ha validato.
--
-- Un rapportino inviato e' un documento consegnato. Aggiungerci dentro
-- una foto il giorno dopo, o togliercene una, senza che chi l'ha
-- ricevuto se ne accorga, e' esattamente cio' che un rapporto di lavoro
-- non deve permettere: le prove di una giornata gia' consegnata non
-- devono poter cambiare.
--
-- E' la stessa famiglia del difetto 🔴 «`inviato` e' modificabile
-- dall'autore»: stessa causa, stesso rimedio, va sistemato insieme.
--
-- C'E' ANCHE UN DISALLINEAMENTO CON I FILE. Le policy su
-- `storage.objects`, quelle si' scritte da noi, lo stato lo controllano:
-- `rapportini_delete` lascia cancellare all'autore solo in `bozza` o
-- `respinto`. Quindi oggi, su una scheda validata, l'autore riuscirebbe
-- a cancellare la RIGA ma non il FILE. `eliminaFoto()` cancella prima la
-- riga e poi il file, e non guarda l'esito del secondo passo: resterebbe
-- un file orfano, che occupa spazio e che nessuna query trova piu'.
--
-- Oggi non succede perche' l'interfaccia il pulsante non lo mostra
-- (`RiquadroFoto` vive solo dentro il form, e il form si apre solo in
-- bozza o respinto). Ma la regola vera e' la RLS, non l'interfaccia.
-- =====================================================================


-- 0. DA FARE PRIMA: VERIFICARE WBS-OFFICE
--
-- Questo file toglie a wbs-office la possibilita' di toccare le foto di
-- una scheda gia' inviata. Se di la' esiste una funzione che lo fa —
-- per esempio un allegato aggiunto dall'ufficio dopo l'invio — questa
-- modifica gliela rompe, e va concordata invece che eseguita.
--
-- Serve anche sapere cosa fa `app.puo_vedere_cantiere` con chi ha
-- `cantieri.read_all`: la select qui sopra non ha il ramo
-- `rapportini.read_all`, quindi se la funzione non copre chi vede tutti
-- i cantieri, l'amministrazione non vedrebbe le foto dei cantieri su cui
-- non e' assegnata.

select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app' and p.proname = 'puo_vedere_cantiere';


-- 1. LE TRE POLICY, UNA PER COMANDO
--
-- `FOR ALL` sparisce: un permesso solo per quattro operazioni diverse
-- costringe a scrivere la condizione piu' larga fra le quattro, che e'
-- il motivo per cui qui lo stato non era controllato da nessuna parte.
-- Con una policy per comando, ognuna dice la sua regola.
--
-- La select NON si tocca: quella che c'e' fa gia' la cosa giusta, e
-- rifarla vorrebbe dire rischiare di stringere una lettura che a
-- wbs-office serve.

begin;

drop policy if exists rapportino_foto_write on public.rapportino_foto;

-- Si carica una foto solo su una scheda ancora in mano a chi la scrive.
create policy rapportino_foto_insert on public.rapportino_foto
  for insert with check (
    app.has_perm(org_id, 'rapportini.create')
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and app.puo_vedere_cantiere(r.cantiere_id)
        and r.stato in ('bozza', 'respinto')
    )
  );

-- La didascalia si corregge finche' la scheda e' aperta. Esiste come
-- policy a se' perche' senza, togliendo `FOR ALL`, l'update sparirebbe
-- del tutto: e se wbs-office lo usa, glielo romperemmo in silenzio.
create policy rapportino_foto_update on public.rapportino_foto
  for update using (
    exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and app.puo_vedere_cantiere(r.cantiere_id)
        and r.stato in ('bozza', 'respinto')
        and (r.compilato_da = auth.uid() or app.has_perm(r.org_id, 'rapportini.validate'))
    )
  );

-- Togliere una foto: chi valida sempre, l'autore finche' la scheda e'
-- sua. E' la gemella esatta di `rapportini_delete` su storage.objects —
-- devono dire la stessa cosa, o si resta con dei file orfani.
create policy rapportino_foto_delete on public.rapportino_foto
  for delete using (
    app.has_perm(org_id, 'rapportini.validate')
    or exists (
      select 1 from public.rapportini r
      where r.id = rapportino_id
        and r.compilato_da = auth.uid()
        and r.stato in ('bozza', 'respinto')
    )
  );

commit;


-- 2. VERIFICA
-- Devono comparire quattro righe: la select che c'era, piu' insert,
-- update e delete. Nessuna piu' con cmd = 'ALL'.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'rapportino_foto'
order by policyname;


-- 3. PROVA DAL VIVO
-- Come tecnico@cassia.com: su una bozza sua il caricamento va a buon
-- fine; sulla stessa scheda una volta inviata, forzando la chiamata da
-- console, l'insert deve tornare 42501 e la riga non deve comparire.
