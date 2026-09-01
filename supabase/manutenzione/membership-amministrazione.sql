-- =====================================================================
-- Agganciare amministrazione@cassia.com al tenant di Edily
--
-- L'utente esiste in auth.users (si logga) ma non ha una riga in
-- `memberships`, e senza quella la RLS non gli fa vedere niente: e' il
-- primo dei tre livelli - tenant, capability, scope. Entra e trova una
-- schermata vuota, che e' il comportamento corretto per uno sconosciuto.
--
-- Da eseguire nel SQL Editor, in ordine.
-- =====================================================================


-- 1. COM'E' MESSO ADESSO
-- Se `org_id` e' null per amministrazione, e' confermato: manca la
-- membership, non un permesso.
select u.email,
       u.id                as user_id,
       m.org_id,
       m.ruolo,
       m.attivo,
       o.ragione_sociale
from auth.users u
left join public.memberships   m on m.user_id = u.id
left join public.organizations o on o.id = m.org_id
where u.email like '%@cassia.com'
order by u.email;


-- 2. L'AGGANCIO
-- Non serve conoscere l'id dell'organizzazione: la si prende da quella
-- di Giuseppe, che nel tenant di Edily c'e' gia'. Cosi' non si rischia
-- di agganciarlo all'azienda sbagliata copiando un uuid a mano.
--
-- `not exists` invece di `on conflict`: su memberships non risulta un
-- vincolo unico su (user_id, org_id), quindi un on conflict non
-- avrebbe a cosa appigliarsi e un secondo lancio creerebbe un doppione.
insert into public.memberships (user_id, org_id, ruolo, attivo)
select impiegata.id, capo_m.org_id, 'amministrazione', true
from auth.users impiegata
join auth.users capo         on capo.email = 'giuseppe@cassia.com'
join public.memberships capo_m on capo_m.user_id = capo.id and capo_m.attivo
where impiegata.email = 'amministrazione@cassia.com'
  and not exists (
    select 1 from public.memberships gia_presente
    where gia_presente.user_id = impiegata.id
      and gia_presente.org_id = capo_m.org_id
  );


-- 3. VERIFICA
-- Rilancia il blocco 1: amministrazione deve avere org_id valorizzato,
-- ruolo `amministrazione` e attivo = true. Poi fai ricaricare la pagina
-- all'utente: la sessione dell'app rilegge le membership al login.
--
-- Cosa deve vedere una volta entrata: Clienti, Fornitori, Operai,
-- Rapportini (ha rapportini.read_all) ed Economia. Non deve vedere il
-- pulsante per creare un rapportino - non ha rapportini.create - ne'
-- quello per validarlo.


-- 4. SE UN GIORNO SERVISSE STACCARLA
-- Non cancellare la riga: mettere `attivo = false` conserva la storia di
-- chi ha fatto cosa, che su documenti contabili serve.
--
--   update public.memberships set attivo = false
--   where user_id = (select id from auth.users
--                    where email = 'amministrazione@cassia.com');
