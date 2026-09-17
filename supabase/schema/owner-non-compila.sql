-- =====================================================================
-- L'OWNER NON COMPILA: via `rapportini.create` dal titolare
--
-- Deciso dall'utente il 2026-09-17, con parole sue: «Giuseppe e' owner e
-- non compila un cazzo. Lui solo vede, valida o respinge. E' il tecnico
-- che fa i rapportini».
--
-- IL PROBLEMA, notato dall'utente guardando la home da titolare: gli
-- compariva il pulsante «Invia il foglio della giornata». Cioe' inviava
-- a se stesso, e poi validava se stesso. Un assurdo logico che nessuno
-- aveva visto finche' qualcuno non ha guardato quella schermata con gli
-- occhi di chi la usa.
--
-- PERCHE' SI TOGLIE IL PERMESSO E NON SI NASCONDE IL PULSANTE. Nascondere
-- il pulsante avrebbe curato il sintomo: il titolare resterebbe uno che
-- PUO' compilare ma a cui non lo mostriamo, e ogni schermata nuova
-- dovrebbe ricordarsi di fare la stessa eccezione. Togliendo il permesso
-- la cosa diventa vera nel modello, e tutto si spegne da se': le sezioni
-- della home, le rotte di scrittura, il pulsante «Nuovo rapportino»,
-- lo scarico di magazzino. E' la regola del progetto — i permessi li
-- applica la RLS, mai il frontend — applicata a chi comanda.
--
-- COSA CONTINUA A VEDERE IL TITOLARE, ed e' il suo lavoro:
--   - la coda «Giornate da validare» in home     `rapportini.validate`
--   - l'elenco Rapportini in sola lettura        `rapportini.read_all`
--   - validare, respingere, riaprire             `validate` / `reopen`
--   - cantieri, anagrafiche, economia, magazzino, WBS
--
-- ⚠️  `admin` NON viene toccato, ed e' una scelta. Alla Edily oggi il
-- titolare e' owner e basta, ma il gestionale nasce per essere venduto:
-- in un'impresa piu' grande `admin` puo' essere un direttore tecnico che
-- in cantiere ci va davvero. Se un domani si decidesse che nemmeno lui
-- compila, la riga da aggiungere e' la stessa con 'admin' al posto di
-- 'owner'.
--
-- Da eseguire nel SQL Editor. Il database e' condiviso con wbs-office,
-- ma `role_permissions` e' una tabella di modello e non ha `org_id`: la
-- modifica vale per tutte le aziende sull'istanza. E' corretto — il
-- significato di «owner» non cambia da azienda ad azienda — ma va
-- saputo.
-- =====================================================================


-- ── PRIMA: com'e' adesso ────────────────────────────────────────────
-- Di sola lettura. Serve per confronto dopo.

select role, permission
from public.role_permissions
where role in ('owner', 'admin')
  and permission like 'rapportini%'
order by role, permission;


-- ── LA MODIFICA ─────────────────────────────────────────────────────

delete from public.role_permissions
where role = 'owner'
  and permission = 'rapportini.create';


-- ── DOPO: la verifica ───────────────────────────────────────────────
-- `owner` deve avere read_all, validate, reopen — e NON create.
-- `admin` resta com'era, con create compreso.

select role, permission
from public.role_permissions
where role in ('owner', 'admin')
  and permission like 'rapportini%'
order by role, permission;


-- ── POI, NELL'APP ───────────────────────────────────────────────────
-- Il titolare deve fare LOGOUT e rientrare: i permessi si leggono
-- all'avvio della sessione, quindi finche' non riapre continua a vedere
-- la home di prima.
--
-- Cosa deve trovare, rientrando:
--   - NIENTE card dei cantieri del giorno, niente pulsante di invio,
--     niente «Le tue ore»
--   - la coda delle giornate da validare, che e' il suo lavoro
--   - Rapportini ancora in menu, in sola lettura: il pulsante «Nuovo
--     rapportino» non c'e' piu'
--
-- ⚠️  SE PROVANDO IL PULSANTE C'E' ANCORA, prima di dare la colpa alla
-- modifica: controllare con CHI si sta guardando. Chi ha
-- `profiles.is_platform_admin` (l'utenza ENCREADE, non Giuseppe) riceve
-- l'UNIONE di tutti i permessi di tutti i ruoli — vedi `session.ts` — e
-- quindi vede il pulsante comunque. La prova va fatta con l'utenza vera
-- del titolare:
--
--   select p.email, p.is_platform_admin, m.ruolo
--   from public.profiles p
--   join public.memberships m on m.user_id = p.id
--   where m.org_id = '0d989cd9-d077-48f6-8ab9-6b5434229394'::uuid;
--
-- ⚠️  UN EFFETTO DA CONOSCERE: nella pagina Magazzino lo scarico di
-- materiale e' gated su `rapportini.create`, quindi il titolare non
-- potra' piu' scaricare materiale su un cantiere. E' coerente — chi non
-- va in cantiere non preleva — ma se un giorno servisse, il cancello
-- giusto da rivedere e' quello del magazzino, non questo permesso.
