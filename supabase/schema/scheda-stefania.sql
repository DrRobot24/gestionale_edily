-- ═══════════════════════════════════════════════════════════════════
-- LA SCHEDA DI STEFANIA IN ANAGRAFICA.
--
-- 2026-09-22. La verifica ha mostrato che in `dipendenti` ci sono nove
-- persone e lei non c'e': otto operai (nessuno collegato a un utente,
-- ed e' giusto — non entrano nel gestionale) e Zito come tecnico.
--
-- NON LA METTE IN SQUADRA, e non contraddice
-- `stefania-fuori-squadra.sql`. Sono due cose diverse che si
-- somigliano:
--
--   stare in ANAGRAFICA   e' esistere come persona dell'azienda. Ce
--                         l'ha anche il tecnico, che in cantiere non ci
--                         va mai.
--   stare in SQUADRA      e' essere assegnabile a un cantiere, e lo
--                         decide `tipo = 'operaio'`. Con 'impiegato'
--                         non compare fra gli assegnabili — c'e' un
--                         trigger che rifiuta le righe di chi non e'
--                         operaio, quindi il confine e' nel database e
--                         non nel programma.
--
-- PERCHE' LE SERVE:
--
--   • «Le mie ore» compare a chi ha una scheda (`seHaScheda` in
--     App.tsx). Senza, Stefania non puo' dichiarare le proprie ore — e
--     il Riepilogo Economico deve contenerle «come ha fatto Sebastiano
--     il tecnico».
--   • Il foglio presenze mostra tutti quelli in anagrafica, anche a
--     zero: senza scheda lei non comparirebbe mai.
--   • Ferie, contributi e il resto del lavoro suo avranno dove stare.
--
-- ⚠️ PRIMA DI LANCIARE, due valori da controllare nel PASSO 1: il nome
--    esatto e l'org. Il passo 2 li usa e non indovina niente.
-- ═══════════════════════════════════════════════════════════════════


-- ── PASSO 1. L'UTENTE DI STEFANIA ESISTE? ──────────────────────────
-- GIA' LANCIATA il 2026-09-22, esito buono: utenza presente,
-- membership attiva, ruolo `amministrazione`. Resta qui per rilanciarla
-- se un domani «Le mie ore» non comparisse: il primo sospetto e' il
-- collegamento, non il programma.
-- select u.id,
--        u.email,
--        m.org_id,
--        m.ruolo,
--        m.attivo as membership_attiva,
--        o.ragione_sociale
-- from auth.users u
-- left join public.memberships m on m.user_id = u.id
-- left join public.organizations o on o.id = m.org_id
-- where u.email = 'amministrazione@cassia.com';


-- ── PASSO 2. LA SCHEDA ─────────────────────────────────────────────
-- Il passo 1 ha confermato tutto il 2026-09-22: utenza esistente,
-- membership ATTIVA, ruolo `amministrazione`, org Edily S.r.l.
-- (0d989cd9…). Nome e cognome dati dall'utente: Stefania Corritore.
--
-- `org_id` e `user_id` si ricavano dall'email invece di copiare UUID a
-- mano: un UUID sbagliato non da' errore, crea una scheda in un'altra
-- organizzazione o collegata a nessuno — e il sintomo sarebbe solo
-- «non mi compare Le mie ore», che porta a cercare nel posto sbagliato.
--
-- `on conflict do nothing` perche' rilanciarlo non deve creare un
-- doppione: due schede per la stessa persona spezzerebbero in due le
-- sue ore senza che nessuno se ne accorga.
insert into public.dipendenti (org_id, nome, cognome, tipo, attivo, user_id, mansione)
select m.org_id,
       'Stefania',
       'Corritore',
       'impiegato'::tipo_risorsa,  -- NON 'operaio': la terrebbe fra gli assegnabili
       true,
       u.id,
       'Amministrazione'
from auth.users u
join public.memberships m on m.user_id = u.id
where u.email = 'amministrazione@cassia.com'
on conflict do nothing;


-- ── PASSO 3. VERIFICA ──────────────────────────────────────────────
-- Deve comparire con tipo 'impiegato' e l'email collegata.
--
select d.cognome || ' ' || d.nome as persona,
       d.tipo,
       d.attivo,
       u.email
from public.dipendenti d
left join auth.users u on u.id = d.user_id
order by d.tipo, d.cognome;
