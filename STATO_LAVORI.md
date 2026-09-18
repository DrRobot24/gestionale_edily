# Stato lavori — Gestionale Edily

> Aggiornato al **18 settembre 2026**.
> Questo file raccoglie fatti **verificati contro il database reale**, non dedotti
> dallo schema. Dove c'è scritto "verificato" vuol dire che è stato provato con
> una query e ne è stato osservato l'esito.

---

## Come ripartire

Questa è la prima cosa da leggere aprendo il progetto, e vale sia per una chat
nuova sia per chi ci torna dopo giorni.

0. **Il muro "Lavori in corso": spento in locale, ALZATO in produzione.** Il
   `.env` locale ha `VITE_WIP=false` dal 15 settembre 2026, per i test in
   ufficio, e in `VITE_WIP_EMAIL_AMMESSE` ci sono ora tutte e quattro le
   utenze di Edily più quella dell'utente — serve da quando lo si rialza. Su
   Vercel il valore è ancora `true` e i clienti trovano il cartello. Il `.env`
   non è versionato, quindi chi apre il progetto su un'altra macchina parte da
   `.env.example`. Vedi la sezione dedicata qui sotto.
1. **Niente SQL in sospeso.** Tutti i file di `supabase/schema/` sono stati
   eseguiti, compreso
   [`invio-controllo-ore.sql`](supabase/schema/invio-controllo-ore.sql), girato
   l'11 settembre 2026 e verificato: entrambe le funzioni esistono, e
   `invia_foglio_giornata` è `security invoker` come deve. Resta fuori
   [`rapportino-foto-stato.sql`](supabase/schema/rapportino-foto-stato.sql),
   **non eseguito di proposito** (vedi il punto 7). Per verificare lo stato:
   [`verifica-stato.sql`](supabase/schema/verifica-stato.sql), di sola lettura.
2. **Il lavoro in corso è il flusso del tecnico**, non il backend: il database
   è già quasi completo, il frontend no. Si procede **un settore per volta**,
   con verifica in ufficio a ogni passaggio.
3. **Il cambio di prospettiva È AVVENUTO: si lavora sul lato amministrazione.**
   Il 15 settembre 2026 il punto di vista di `amministrazione@cassia.com` è
   stato aperto e provato in ufficio, nella data prevista.

   *Chi è.* Dietro quell'utenza c'è **Stefania Corritore**, l'impiegata
   amministrativa. Il suo lavoro, nell'ordine: crea **tutte le anagrafiche**
   (prima il cliente, poi il cantiere, poi gli operai), **riceve le ore** di
   tutti — incluse quelle del tecnico — e le **elabora per le buste paga**,
   assegnando le tariffe.

   *La cosa da non sbagliare:* a lei i **rapportini non interessano**, e l'ha
   detto l'utente provandolo. Il rapportino è lo strumento di chi compila in
   cantiere; a chi paga serve il **totale per persona**. Per questo la voce
   Rapportini è uscita dal suo menu, e per questo la vista delle ore per
   persona è il prossimo pezzo da costruire (vedi i prossimi passi).

   *Come procedere:* non anticipare costruendo pagine a indovinare. Si guarda
   cosa lei non riesce a fare, e si costruisce quello — un settore per volta,
   con verifica in ufficio. Le parole che usa lei valgono più delle ipotesi:
   i nomi delle cose vanno presi dal suo vocabolario.

   *Cosa NON è lei:* Stefania non va in cantiere e non presta ore. Non deve
   comparire fra le persone assegnabili alla squadra — vedi il punto 5.

4. **L'ordine di lavoro corrente** va scelto con l'utente: il controllo delle 8 ore è
   chiuso (blocca l'invio in tutti e due i rami, dall'11 settembre 2026) e lo
   spostamento rapido delle ore in straordinario è stato **rimandato** di
   proposito, per provare prima il blocco in ufficio. Il punto 1 e il
   subappalto aspettano l'utente e non vanno anticipati.

   *Il 18 settembre 2026* sono uscite **le ore dai lavori extra**, che era il
   primo lavoro in coda ed era già tutto deciso. Il prossimo pezzo è la **vista
   delle ore per persona**, che però ha quattro domande da fare a Stefania
   prima di scriverla: vedi i prossimi passi.
5. **Tre cose decise il 15 settembre 2026**, da non rimettere in discussione:
   - **`cantieri.assign` resta a owner e admin.** Le assegnazioni dei tecnici
     ai cantieri le fa **solo Giuseppe**, non l'amministrazione. La matrice
     attuale è già così: non va toccata.
   - **Stefania fuori dalla squadra.** La sua scheda operaio era stata
     collegata a `amministrazione@cassia.com`, e quel collegamento la faceva
     comparire fra gli assegnabili. Va sciolto o la scheda cancellata: lei
     riceve le ore, non le presta.
   - **Il modello del magazzino è deciso** — i luoghi, e nessun «consumato».
     Vedi il punto 9 dei prossimi passi.
6. **Due cose aperte che aspettano l'utente** e non vanno indovinate: le
   specifiche del **subappalto**, e come si **ribaltano al cliente** le ore in
   economia. Più gli **attributi della scheda di magazzino**, che l'utente
   chiede direttamente a Stefania.
7. **Un difetto da chiudere prima o poi**, registrato fra i difetti noti: le
   policy di `rapportino_foto` sono di wbs-office e non guardano lo stato della
   scheda. Il rimedio è già scritto in
   [`rapportino-foto-stato.sql`](supabase/schema/rapportino-foto-stato.sql) e
   **non è stato eseguito di proposito**: tocca policy dell'altro frontend e va
   concordato.

**Le tre regole di questo progetto che non si deducono dal codice:**

- I permessi si decidono su tre livelli (tenant / capability / scope) e li
  applica **sempre la RLS**, mai il frontend.
- Il database è **condiviso con wbs-office**: aggiungere colonne e tabelle è
  sicuro, rinominare o restringere no.
- Il tecnico vede **solo i cantieri assegnati a lui**. È una decisione presa il
  2026-09-10 e vale per il prodotto, non solo per Edily.

---

## Muro "Lavori in corso" — ATTIVO

> Acceso l'**11 settembre 2026**. Se apri l'app e trovi un cartello di attesa
> invece del gestionale, non è rotto: è questo.

I clienti conoscono l'indirizzo e ci entrano. Finché il flusso del tecnico non è
finito, davanti all'applicazione c'è una schermata di attesa che non dice mai
cosa stiamo costruendo — è tutto il suo scopo: niente elenco di moduli in
arrivo, niente date.

**Si spegne da `.env`, senza toccare il codice:**

```
VITE_WIP=false
```

Poi si riavvia `npm run dev`, o si ricostruisce per la produzione: le `VITE_*`
vengono lette alla compilazione, non a ogni caricamento della pagina.

**Chi passa comunque**, a muro alzato: solo le email in
`VITE_WIP_EMAIL_AMMESSE` (separate da virgola, maiuscole e spazi non contano).
Bisogna prima fare il login — l'email si sa solo da lì — e per questo `/login`
resta raggiungibile anche col cartello alzato. Chi entra con un'utenza non
ammessa ritrova il cartello, con un pulsante per uscire e riprovare.

**ATTENZIONE a cosa NON è.** Non è sicurezza. Il valore finisce nel bundle come
ogni `VITE_*`, e chi sa leggere il JavaScript aggira la schermata. A proteggere
i dati resta la RLS: superato il cartello si trova comunque solo ciò che quella
utenza poteva già leggere. È una tenda, non una porta blindata. Se un domani
servisse davvero chiudere fuori qualcuno, si toglie il suo accesso
sull'organizzazione, non si alza questo muro.

Se la riga sparisce dal `.env` o è scritta male, l'app resta **aperta**: la
scelta è deliberata, meglio sbagliare verso il funzionamento normale che verso
un muro di cui nessuno sa l'origine.

I file: [`src/lib/env.ts`](src/lib/env.ts) legge l'interruttore,
[`src/modules/wip/MuroWip.tsx`](src/modules/wip/MuroWip.tsx) decide chi passa,
[`src/modules/wip/LavoriInCorso.tsx`](src/modules/wip/LavoriInCorso.tsx) è il
cartello. L'aggancio sta in [`src/App.tsx`](src/App.tsx), sopra `RequireAuth`.

---

## Cosa funziona oggi

| Area | Stato |
|---|---|
| Login, sessione, tre livelli di permesso | ✅ |
| Punto di vista **amministrazione** — anagrafiche complete | ✅ provato in ufficio il 2026-09-15 |
| Vista delle **ore per persona** per le paghe | ❌ da costruire, è il prossimo pezzo |
| Cantieri — elenco, scheda, creazione, modifica | ✅ |
| Cantieri — assegnazione della squadra | ✅ |
| Cantieri — scheda di riepilogo, tappa prima del rapportino | ✅ |
| Ore in economia — nel rapportino, nel cantiere e tutte insieme sotto Economia | ✅ |
| Clienti — elenco, scheda, CRUD, azienda/privato | ✅ |
| Operai — elenco, scheda, CRUD, storico tariffe | ✅ |
| Rapportini — elenco, scheda, creazione, modifica | ✅ |
| Rapportini — invio, validazione, rifiuto, contabilizzazione | ✅ |
| Controllo delle 8 ore — avviso in home **e blocco all'invio** | ✅ |
| Rapportini — Foglio Riepilogativo di Giornata | ✅ |
| Fornitori — elenco, scheda, CRUD | ✅ |
| Rapportini — note al titolare | ✅ |
| Rapportini — foto di cantiere | ✅ verificato sul database il 2026-09-10 |
| Rapportini — subappalto | ❌ segnaposto, specifiche da definire |
| Documenti (storage), Subappalti | ❌ voci di menu, pagine da costruire |
| Magazzino — giacenze, carichi e scarichi | ✅ |
| Materiali dentro il rapportino, mezzi | ❌ da fare |
| Economia — costi, ricavi, margini | ❌ da fare |
| Paghe, WBS | ❌ da fare |

---

## SQL: cosa è già girato

Qui non c'è un sistema di migrazioni (vedi il punto 1 dei prossimi passi),
quindi i file dello schema si eseguono a mano nel SQL Editor e fra una sessione
e l'altra non resta traccia di chi ha lanciato cosa.

**Per saperlo senza tirare a indovinare:** incollare
[`supabase/schema/verifica-stato.sql`](supabase/schema/verifica-stato.sql). È
di sola lettura e dice riga per riga cosa è FATTO e cosa è DA FARE.

**Esito all'11 settembre 2026: tutti eseguiti**, compreso
`invio-controllo-ore.sql` dell'ultima riga.


| File | Stato |
|---|---|
| [`rapportino-annotazioni.sql`](supabase/schema/rapportino-annotazioni.sql) | ✅ la colonna `annotazioni` c'è |
| [`storage-rapportini.sql`](supabase/schema/storage-rapportini.sql) | ✅ bucket chiuso, 3 policy su 3 |
| [`rapportino-foto.sql`](supabase/schema/rapportino-foto.sql) | ✅ RLS attiva — ma le policy sono di wbs-office, vedi il difetto qui sotto |
| [`ore-giornata.sql`](supabase/schema/ore-giornata.sql) | ✅ eseguito il 2026-09-10: colonna `ore_assenza` e funzione `ore_giornata()`, verificata `security definer` |
| [`foglio-ore-tecnico.sql`](supabase/schema/foglio-ore-tecnico.sql) | ✅ eseguito il 2026-09-10 |
| [`note-contabili.sql`](supabase/schema/note-contabili.sql) | ✅ eseguito il 2026-09-10, RLS verificata attiva |
| [`magazzino.sql`](supabase/schema/magazzino.sql) | ✅ eseguito il 2026-09-10, vista verificata `security_invoker=on` |
| [`invio-controllo-ore.sql`](supabase/schema/invio-controllo-ore.sql) | ✅ eseguito l'11 settembre 2026, verificato: `invia_foglio_giornata` c'è ed è `security invoker`, `ore_in_lettere()` pure. Provato prima su un Postgres 17 usa e getta, nove casi (vedi sotto) |

**Si possono rilanciare tutti senza danno**, ed è una proprietà voluta: questi
file si eseguono a mano e fra una sessione e l'altra nessuno ricorda cosa aveva
già fatto. Chi crea colonne usa `add column if not exists`, chi crea policy le
toglie prima di rimetterle, chi crea funzioni le droppa prima di ricrearle.
`rapportino-foto.sql` si ferma da solo se la tabella ha già delle policy sue, e
`note-contabili.sql` si ferma se trova righe scritte con il suo schema vecchio.

**Come è stato provato `invio-controllo-ore.sql` prima di consegnarlo**, visto
che qui non c'è un ambiente di prova: un Postgres 17 in Docker usa e getta, uno
scheletro minimo delle quattro tabelle toccate, e nove casi — la giornata che
quadra, 4+5 ore su due cantieri diversi, le stesse 9 ore con una dichiarata
straordinario, 6 ore senza motivo, 6 più 2 di permesso, un motivo che copre
troppo poco, le righe vecchie con motivo e zero ore, due persone insieme, e
l'ordine dei controlli. La prova ha trovato un difetto vero nei messaggi
(«2, ore in meno», con la virgola di troppo di `to_char`, corretto con
`trim_scale`), che a leggere il codice non si vedeva.

**Resta da fare:** rigenerare i tipi con `supabase gen types typescript`.
`nessuna_attivita`, `annotazioni` e `invia_foglio_giornata` sono in
`database.types.ts` scritti a mano, e la distanza fra quello che il database
contiene e quello che il repository crede continua a crescere.

---

## La macchina a stati dei rapportini

Mappata provando **ogni** transizione contro il database. Il controllo è di un
trigger (errori `P0001`), non solo della RLS.

```
bozza ──invia──▶ inviato ──valida──▶ validato ──▶ contabilizzato
  ▲                 │                   │               │
  │       respingi  │          riapri   │      storna   │
  │                 ▼                   ▼               ▼
  └──────────── respinto ──────────▶ bozza          validato
```

**Ammesse:** `bozza→inviato`, `inviato→respinto`, `inviato→validato`,
`respinto→bozza`, `validato→bozza`, `validato→contabilizzato`,
`contabilizzato→validato`.

**Rifiutate:**
- `inviato → bozza` — «Transizione di stato non ammessa». L'invio non si ritira:
  se c'è un errore, ci si fa respingere.
- `validato → respinto` — da validato si torna solo in **bozza**. È questo che fa
  il permesso `rapportini.reopen`.

Il trigger controlla anche i permessi: un tecnico che prova ad autovalidarsi
riceve «Permesso rapportini.validate mancante».

Numero e anno del rapportino li assegna il database (`document_counters`): non
vanno mai passati dall'applicazione.

---

## Matrice dei permessi (49 righe in `role_permissions`)

| Ruolo | N. | Note |
|---|---|---|
| `owner` | 16 | tutti |
| `admin` | 15 | tutti tranne `org.manage` |
| `amministrazione` | 10 | legge tutto, **non valida** |
| `capocantiere` | 3 | `anagrafiche.read` `rapportini.create` `wbs.read` |
| `tecnico` | 3 | identici a capocantiere |
| `lettore` | 2 | `anagrafiche.read` `wbs.read` |

I 16 permessi in tabella coincidono esattamente con l'unione `Permission` scritta
a mano in `src/modules/auth/session.ts`.

**Regola di Edily, già soddisfatta dal modello:** owner e amministrazione creano
clienti (`anagrafiche.write`) e cantieri (`cantieri.write`); l'assegnazione della
squadra (`cantieri.assign`) resta a owner e admin. Verificato: il tecnico viene
respinto con `42501` su clienti, fornitori, dipendenti, mezzi e cantieri.

---

## Come si applicano i tre livelli

| Livello | Domanda | Dove |
|---|---|---|
| Tenant | a quale azienda appartieni | `memberships` |
| Capability | cosa sai fare | `role_permissions` → `app.has_perm()` |
| Scope | su quali cantieri | `cantiere_assegnazioni` → `app.puo_vedere_cantiere()` |

**Verificato:** un utente senza membership vede zero righe ovunque e non può
scrivere. Un utente assegnato a un cantiere vede quel cantiere e **tutti i
rapportini di quel cantiere**, anche quelli dei colleghi.

**L'assegnazione si revoca con una data, non cancellando la riga.**
`app.puo_vedere_cantiere()` rispetta `cantiere_assegnazioni.al`: con `al` a ieri
l'accesso sparisce, con `al` nel futuro resta. L'accesso vale **fino alla data
compresa**.

**`ruolo_cantiere` è descrittivo e non tocca nessun permesso.** È testo libero e
nessuna policy lo legge.

**Le anagrafiche non hanno scope per cantiere:** chi ha `anagrafiche.read` vede
*tutti* i dipendenti, clienti e mezzi dell'azienda. Con quaranta operai su otto
cantieri servirà un livello di scope che oggi non esiste.

---

## Difetti noti

### 🟡 Le foto non sono legate allo stato della scheda

`rapportino_foto` ha due policy, e **non le ha scritte il gestionale**: vengono
da wbs-office, che condivide questo database.
[`rapportino-foto.sql`](supabase/schema/rapportino-foto.sql) ne crea tre o
nessuna, e si è fermato da solo trovandole.

| Policy | Comando | Condizione |
|---|---|---|
| `rapportino_foto_select` | SELECT | chi vede il cantiere |
| `rapportino_foto_write` | **ALL** | chi vede il cantiere, ed è l'autore della scheda oppure ha `rapportini.validate` |

**Funziona:** `FOR ALL` copre insert, update e delete, e la select è coperta
due volte (le policy permissive si sommano in OR). Le foto si caricano, si
vedono e si tolgono.

**Il difetto è che manca il controllo sullo STATO.** L'autore può aggiungere e
togliere foto anche dopo aver inviato il rapportino, e anche dopo che il
titolare l'ha validato. Un rapportino inviato è un documento consegnato: le
prove di una giornata già sul tavolo del titolare non devono poter cambiare
senza che lui se ne accorga. È la stessa famiglia del difetto qui sopra, e
conviene chiuderli insieme.

**C'è anche un disallineamento con i file.** Le policy su `storage.objects`,
quelle scritte da noi, lo stato lo controllano: `rapportini_delete` lascia
cancellare all'autore solo in `bozza` o `respinto`. Quindi su una scheda
validata l'autore riuscirebbe a cancellare la **riga** ma non il **file**.
`eliminaFoto()` cancella prima la riga e poi il file, e non guarda l'esito del
secondo passo: resterebbe un file orfano, che occupa spazio e che nessuna query
trova più. Oggi non succede perché l'interfaccia il pulsante non lo mostra, ma
la regola vera è la RLS.

**Il rimedio è già scritto** in
[`supabase/schema/rapportino-foto-stato.sql`](supabase/schema/rapportino-foto-stato.sql):
sostituisce il `FOR ALL` con tre policy, una per comando, ognuna con la sua
regola. **Non è stato eseguito di proposito:** tocca policy di wbs-office, e va
prima verificato che di là non ci sia una funzione che aggiunge allegati a una
scheda già inviata. Il file contiene anche la query per controllarlo.

### 🔴 `inviato` è modificabile dall'autore
`rapportini_update` ammette `stato = ANY(ARRAY['bozza','respinto','inviato'])`.
L'autore può cambiare le ore **dopo** l'invio, mentre il titolare le sta
leggendo: si può validare un documento diverso da quello letto.

L'interfaccia si comporta **già** come se `inviato` fosse congelato
(`src/modules/rapportini/regole.ts`), quindi togliere `'inviato'` da quella lista
non richiede modifiche al frontend. La via per le correzioni esiste già ed è
`respingi → correggi → rimanda`.

### ✅ `clienti` non aveva unicità su partita IVA e codice fiscale
> **Risolto il 2026-09-01.** Creati `clienti_org_piva_uniq` e
> `clienti_org_cf_uniq`. Che la creazione sia passata senza errori è anche la
> prova che duplicati non ce n'erano: Postgres avrebbe rifiutato l'indice.

Trovato il 2026-09-01 indagando le collazioni: la tabella ha **solo**
`clienti_pkey` su `id` e `clienti_org_idx` su `org_id`. Nessun indice unico sugli
identificativi fiscali, quindi due clienti con la stessa partita IVA nella stessa
impresa entrano senza che nulla protesti.

Il form non copre il buco: [`ClienteForm.tsx`](src/modules/anagrafiche/ClienteForm.tsx)
valida il *formato* (11 cifre) e pretende almeno un identificativo fra i due, ma
l'unicità non la verifica. È marcato 🔴 perché a valle ci sono la fatturazione e
l'aggancio ai cantieri: un'anagrafica sdoppiata non resta un problema estetico,
si porta dietro i documenti.

Rimedio pronto in
[`supabase/manutenzione/clienti-unicita.sql`](supabase/manutenzione/clienti-unicita.sql):
indici unici parziali su `(org_id, partita_iva)` e `(org_id, codice_fiscale)`. La
chiave è per organizzazione — due imprese diverse possono avere lo stesso
cliente. Lato applicazione la traduzione dell'errore `23505` è in
[`clienti.ts`](src/modules/anagrafiche/clienti.ts): distingue i due vincoli e
copre anche l'`update`, che prima lo lasciava passare grezzo.

### 🔴 Il bucket `rapportini` era pubblico
> **Rimedio pronto in
> [`supabase/schema/storage-rapportini.sql`](supabase/schema/storage-rapportini.sql),
> da eseguire seguito da
> [`supabase/schema/rapportino-foto.sql`](supabase/schema/rapportino-foto.sql).**
>
> Il caricamento delle foto dal gestionale è scritto e non funziona finché
> questi due non girano: senza policy su `storage.objects` il bucket resta
> scrivibile da nessuno.

Trovato il 2026-09-01 preparando lo storage delle bolle. `storage.buckets`
diceva `public = true` per `rapportini`: chiunque avesse l'URL leggeva il file
**senza autenticazione e senza che la RLS venisse interpellata**. Su un
gestionale multi-tenant significa che per quei file l'isolamento fra imprese non
esisteva — e nelle foto di cantiere ci sono volti di operai, targhe, documenti
fotografati.

Su `storage.objects` non esisteva **nessuna** policy, quindi il bucket era
leggibile da tutti e scrivibile da nessuno. `allowed_mime_types` era `null`: ci
si poteva caricare qualsiasi cosa fino a 40 MB.

Si ripara a costo zero perché `rapportino_foto` ha 0 righe: nessun file da
spostare, nessun URL pubblico già in circolazione. Fra sei mesi sarebbe stata
una migrazione.

**Attenzione al database condiviso:** se wbs-office mostra quelle foto con
`getPublicUrl()`, dopo la chiusura del bucket dovrà passare a
`createSignedUrl()`. Il gestionale non è interessato, non ha una sola chiamata a
`supabase.storage`.

### 🟡 `cantieri_write` è `FOR ALL`
Le policy permissive si sommano in OR, quindi copre anche la SELECT: chi ha
`cantieri.write` vede **tutti** i cantieri dell'azienda, scavalcando
`puo_vedere_cantiere()`. Oggi innocuo (chi ha `write` ha anche `read_all`), ma un
futuro ruolo con `cantieri.write` e senza `read_all` avrebbe lettura totale senza
che nessuno l'abbia deciso.

### 🟡 `rapportini.read_all` non è usato da nessuna policy
La lettura dei rapportini passa da `puo_vedere_cantiere()`. Il permesso è
concesso a owner, admin e amministrazione ma oggi non concede niente: tutti e tre
hanno già `cantieri.read_all`, che è ciò che apre davvero la porta.

### 🟡 La sessione condivisa con wbs-office non funziona
`src/lib/supabase.ts` forza `storageKey: 'encreade-auth'`, ma wbs-office chiama
`createClient(url, key)` senza opzioni e usa quella di default
(`sb-<ref>-auth-token`). Sono due chiavi diverse: chi si logga su una **non** è
loggato sull'altra. Si risolve togliendo la riga da qui.

Resta comunque vero che `localStorage` è per-origine, **porta compresa**: in
sviluppo su porte diverse non si condivide in nessun caso.

### 🟡 Campi che dovrebbero essere enum e sono testo libero
- `rapportino_ore.tipo_assenza` — **il più pericoloso**: alimenta
  `v_riepilogo_paghe` e `chiudi_periodo_paga`. `"ferie"`, `"Ferie"` e `"ferie "`
  diventano tre categorie e le paghe sbagliano **in silenzio**.
- `cantiere_assegnazioni.ruolo_cantiere`
- `rapportino_materiali.unita_misura`

L'interfaccia propone liste chiuse, ma è un tappo lato applicazione: il vincolo
vero sarà un enum in Postgres.

### 🟡 `cantieri.cliente_id` è facoltativo
La regola «prima il cliente, poi il cantiere» vive **solo nel form**. Prima di
metterla `NOT NULL` va considerato che non tutte le imprese hanno sempre un
committente (lavori in economia, manutenzione della propria sede): è una regola
del *tenant*, non della piattaforma.

### 🟡 Il tipo di cliente (azienda/privato) non è salvato
Non esiste una colonna `tipo` in `clienti`: il form lo deduce dai dati. Serve una
migration piccola.

### ⚫ Due modelli di ruoli convivono nel database
`profiles.role` con l'enum `user_role` (`admin`/`moderator`/`user`) è di
**wbs-office**, ed è vivo: una sua policy ci si appoggia. Non è un residuo e non
va toccato. Il ruolo del gestionale sta in `memberships.ruolo` (`org_role`).

### ⚫ Il ponte WBS è staccato da entrambi i lati
`wbs_tasks` ha 151 righe importate il 4 agosto, ma **tutte con `cantiere_id`
null**: nessuna è agganciata a un cantiere, che è l'intera premessa del modulo.
E `projects` (la tabella di wbs-office) ha 0 righe, quindi il `project_id` dentro
`wbs_tasks` punta a un progetto che non esiste.

---

## ⚠️ Lo schema non è versionato e non c'è nessun backup

Il progetto Supabase dice `LAST MIGRATION: No migrations` e `LAST BACKUP: No
backups`, piano Free. **27 tabelle, 7 viste, 60+ policy e i trigger esistono in
un posto solo, senza storia e senza copia.**

Il `supabase/schema.sql` di wbs-office contiene solo le sue 4 tabelle ed è
precedente al multi-tenant: non serve da copia.

Per rimediare serve la password del database:

```bash
supabase db dump --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  > supabase/schema.sql
```

Da fare **prima** di toccare le policy.

---

## Prossimi passi

> **Chiusi il 2026-09-15.** Aperto il **punto di vista dell'amministrazione** e
> provato in ufficio con Stefania. Non è stato scritto codice nuovo di
> funzionalità: si è guardato lavorare qualcuno e si è sistemato ciò che
> intralciava. È il metodo, e ha reso più di una giornata di previsioni.
>
> *Cosa è stato messo a posto:*
>
> - **La sidebar nell'ordine del lavoro** — Clienti, Cantieri, Operai, poi il
>   resto. È anche l'ordine obbligato di inserimento: un cantiere vuole il suo
>   cliente, una squadra vuole gli operai.
> - **I rapportini fuori dal menu dell'amministrazione** (`rapportini.create`).
>   La voce era senza cancello *di proposito*, con il ragionamento che
>   `amministrazione` ha `rapportini.read_all` proprio per leggerli. Provato in
>   ufficio, l'utente ha detto il contrario: a Stefania non interessano. Il
>   ragionamento giusto sulla carta ha perso contro l'uso reale.
> - **La doppia etichetta nei percorsi.** Si leggeva «← Operai   OPERAI ›
>   NUOVO»: la freccia è il gesto, il percorso è il posto, e ripetere la stessa
>   parola a tre centimetri è rumore. Corretto su Operai e Fornitori; su
>   Clienti la tappa resta solo quando si arriva dal modulo di un cantiere,
>   dove aggiunge un livello vero. La regola è scritta in
>   [`Percorso.tsx`](src/ui/Percorso.tsx) perché non si ripresenti.
> - **La fascia della home torna verde**, pallido (`emerald-100`). Era verde,
>   poi azzurra l'11 settembre perché il verde pieno dice «fatto» in quella
>   schermata. Provata qualche giorno, l'utente ha detto che l'azzurro non
>   riposa: chiama troppo. Il verde tenue recupera il riposo senza toccare il
>   segnale, che è il `lime-300` pieno dei badge.
>
> *Un difetto trovato usandola,* e registrato fra i prossimi passi: l'operaio
> archiviato si riattiva, ma il percorso è nascosto dietro la spunta «Mostra
> archiviati». Chi non la conosce lo dà per perso.
>
> **Poi, nel pomeriggio, la HOME e la SCHEDA CANTIERE.** Stesso metodo:
> l'utente guarda, segna col rosso quello che non va, si sistema.
>
> *In home:*
>
> - **Le frecce dei giorni**, ai lati della data nella fascia. Prima la home era
>   inchiodata a oggi e una giornata dimenticata si recuperava solo passando dal
>   cantiere e cambiando la data nell'indirizzo. Un giorno per volta e mai nel
>   futuro; il salto di mese sta nel calendario, non qui. Erano nate in una
>   barra loro sotto il benvenuto: l'utente le ha volute nella fascia, e aveva
>   ragione — la data grande era già il titolo della pagina.
> - **Il default non è più oggi.** La prassi di Edily è che il tecnico compila
>   **oggi per ieri**: raccoglie le informazioni in giro e le scrive dopo, mai
>   due giorni indietro. Aprire su oggi voleva dire un click di correzione ogni
>   mattina, per anni. Ora si apre su ieri se ieri è rimasto incompleto.
> - **Un calendario da scrivania** al posto di «Giornate rimaste aperte», che
>   elencava una card per giorno con dentro tutte le schede — informazione
>   giusta, forma sbagliata. Rosso da chiudere, giallo dal titolare, verde
>   validata; un giorno senza schede resta bianco, perché domeniche e festivi
>   non sono giornate da recuperare.
> - **Una riga di tre riquadri**: calendario, ore della squadra, ore del
>   tecnico. Nascono perché il calendario stretto lasciava mezza riga bianca —
>   «è follia», e in una dashboard uno spazio vuoto è spazio che qualcuno ha
>   dimenticato di usare. Rispondono a tre domande diverse sullo stesso giorno.
> - **`ControlloOre` ha cambiato natura.** Spariva quando le ore tornavano, ed
>   era giusto finché stava fra le card e il pulsante di invio. Ora che ha un
>   posto fisso dice il totale anche quando quadra: un totale serve anche
>   quando è giusto.
> - **Le ore del tecnico** (`MieOre`): quante ne risultano segnate, quante ne
>   mancano alle otto, e un pulsante per ogni cantiere della giornata. **Non
>   apre una sezione nuova e non deve**: le ore si segnano dentro il rapportino
>   del cantiere, aggiungendosi alla squadra, ed è l'unico posto dove hanno una
>   data e un cantiere. Una pagina «le mie ore» che scrivesse dovrebbe comunque
>   chiedere su quale cantiere — cioè rifare il rapportino con un altro nome.
>
> *Nella scheda del cantiere:*
>
> - **Via «Chi lavora qui»**: se stai guardando quel cantiere ti è stato
>   assegnato, quindi leggere il tuo nome è una ripetizione.
> - **Foto chiuse** dietro un riquadro che dice quante sono. Una giornata ne
>   produce cinque o sei, e una panoramica che ne carica cento è «un salasso»:
>   ogni immagine è una richiesta al server, e in cantiere si guarda dal
>   telefono col campo che va e viene. Aperto ne mostra dodici.
> - **Un calendario anche qui**, al posto di «Giorni già lavorati». Semaforo
>   diverso perché la domanda è diversa: su un cantiere la scheda per giorno è
>   una sola, quindi giallo da chiudere, verde validata, grigio cantiere fermo.
> - **«Ore in economia» → «Lavori extra»** in tutto il programma, voce di menu
>   compresa. E nell'elenco il **nome** del cantiere al posto del codice.
>
> *Due incidenti che valgono più delle funzionalità, e sono in memoria:*
>
> - **Una pagina bianca in produzione.** Ripulendo gli import dopo aver tolto
>   «Chi lavora qui» ho rimosso anche `StatoRapportino`, che serviva ancora alla
>   fascia della giornata. La scheda del cantiere non si apriva più.
> - **Il motivo per cui non me ne sono accorto:** stavo verificando con
>   `npx tsc --noEmit`, che **su questo progetto non controlla niente** — il
>   `tsconfig.json` alla radice ha `"files": []` e solo `references`, quindi tsc
>   esce a zero senza guardare un file. Quattro «type-check pulito» di fila
>   erano falsi. Il comando giusto era già negli script: **`npm run build`**
>   (`tsc -b && vite build`). Da usare sempre, più `npx eslint src`.
>
> **Chiusi il 2026-09-10 (settimo giro).** Il **magazzino**, in sidebar per
> tutti quelli che hanno `anagrafiche.read`: sapere cosa c'è in magazzino non è
> un privilegio, e il tecnico che parte per il cantiere è proprio quello che
> deve poterlo guardare dal telefono.
>
> *`materiali` c'era già ma è solo un'anagrafica* — codice, descrizione, unità
> di misura — e non sapeva niente di cosa c'è in magazzino: la giacenza non
> esisteva da nessuna parte. Aggiunte `ubicazione` e `scorta_minima`.
>
> *La verità sono i movimenti, non un numero.* Una colonna `giacenza` da
> correggere a mano sarebbe stata la strada corta, ma non sa rispondere a «chi
> ha preso i venti sacchi e quando» né su quale cantiere sono finiti, che in un
> magazzino di cantiere sono le due domande vere. Quindi `movimenti_magazzino`
> con carichi e scarichi, e la giacenza calcolata dalla vista
> `v_giacenze_magazzino` (`security_invoker`, materiali fermi compresi).
>
> *Un movimento non si corregge:* non c'è policy di UPDATE, e uno sbagliato si
> compensa con quello opposto. Un magazzino in cui si riscrive il passato non è
> un magazzino.
>
> *Chi scrive:* carica chi tiene il registro (`anagrafiche.write`), scarica anche
> il tecnico (`rapportini.create`). È la scelta ragionevole di oggi, **non una
> regola stabilita con l'utente**: va rivista quando si vedrà la parte
> amministrativa.
>
> *Cosa non c'è di proposito:* prezzi, valorizzazione, ordini ai fornitori.
> `rapportino_materiali` esiste già e un giorno potrà generare gli scarichi da
> solo; oggi le due cose non si parlano.
>
> **Chiusi il 2026-09-10 (sesto giro).** La pagina **Economia**, che raccoglie
> le ore in economia di tutti i cantieri: periodo con scorciatoie, filtro per
> cantiere, ricerca, totale grosso in cima e ripartizione per cantiere. Prima
> quelle ore si potevano leggere solo un cantiere per volta.
>
> *La voce la vede anche il tecnico*, ed è lavoro suo: le note le scrive lui
> compilando i rapportini, e nella pagina non c'è un euro. Il cancello è in **OR**
> fra `rapportini.create` ed `economics.read` — `RequirePermission` adesso accetta
> una lista. Chi vede cosa lo decide la RLS: il tecnico i cantieri suoi, il
> titolare e l'amministrazione tutti. Stessa pagina, due risposte, e nessun `if`
> nel frontend a farsi carico di una regola che non gli appartiene.
>
> Quando in quella pagina arriveranno i soldi — costi, ricavi, margini — vanno
> chiusi su `economics.read` **dentro** la pagina, non spostando il cancello.
>
> **Chiusi il 2026-09-10 (quinto giro).** Le **note contabili** dentro la scheda
> del cantiere, cioè le **ore in economia**.
>
> In edilizia il lavoro si paga in due modi: *a misura*, sulle quantità previste
> dal progetto, e *in economia*, sulle ore effettivamente impiegate per ciò che
> nel progetto non c'era. L'esempio dell'utente: prima di alzare il muro si
> trova un nido d'api, le due ore per rimuoverlo si fatturano a parte. La nota
> registra il giorno, la descrizione, le ore e il perché, e il riquadro ha una
> ricerca che stringe l'elenco mentre si digita, con il totale delle ore di
> quello che resta.
>
> *Dove si scrivono e dove si leggono.* Si segnano **compilando il rapportino**,
> perché sono note della giornata e chi le ha fatte se le ricorda il giorno
> stesso; il mese dopo il nido d'api non se lo ricorda più nessuno e quelle ore
> restano a carico dell'impresa. Il riquadro sta sotto la squadra e lontano dalla
> **descrizione attività**, che è l'opposto: quella racconta il lavoro previsto
> dal progetto, questa ciò che il progetto non prevedeva. Compaiono poi nella
> scheda del rapportino, sotto le ore, perché chi valida deve vedere le due cose
> insieme; e nella scheda del cantiere con la ricerca, per la domanda «quante ore
> di economia abbiamo qui, e per cosa». Su una scheda nuova restano in attesa
> come le foto, perché cantiere e giorno si possono ancora cambiare.
>
> *Il fraintendimento da non fare, scritto anche nel codice e nell'interfaccia:*
> queste ore **non si sommano** a quelle del rapportino. Sono le stesse ore,
> viste dal lato di cosa si fattura invece che di cosa si paga. Chi calcola le
> paghe continua a guardare `rapportino_ore`.
>
> *Niente importi:* le ore ci sono, i soldi no. Quanto valgono lo dice la
> tariffa concordata, e restano in `costi_cantiere` e `ricavi_cantiere`. Due
> fonti di verità sugli stessi numeri prima o poi divergono da sole.
>
> *La prima stesura sbagliava concetto* — modellava l'avanzamento delle
> lavorazioni, con stati e date di inizio e fine. Il file dello schema converte
> da solo se quella tabella è già stata creata, e si ferma invece di buttare via
> righe se ne trova.
>
> *Perché non `wbs_tasks`, che sarebbe fatta apposta per le sottolavorazioni:*
> è uno **specchio** di wbs-office, con `synced_at` e `project_id` non nullo, e
> le sue righe le riscrive la sincronizzazione. E comunque la WBS è la struttura
> del progetto; qui c'è l'opposto, ciò che nel progetto non c'era.

> **Chiusi il 2026-09-10 (quarto giro).** Fascia di benvenuto in home: saluto
> con il nome, data grande per esteso, verde. Prima la pagina si apriva con la
> ragione sociale dell'impresa, che chi la legge ogni mattina conosce già.
> Documenti spostati dentro la scheda del cantiere e tolti dal menu. Campo
> «Utente del gestionale» nella scheda operaio, che è il ponte per far segnare
> al tecnico le proprie ore.
>
> **Chiusi il 2026-09-10 (terzo giro).** Il controllo delle 8 ore per persona e
> per giornata solare, con la colonna `ore_assenza` che finalmente permette di
> scrivere un permesso di mezza giornata. E la regola «sapere sempre dove si
> è»: il componente `Percorso` in `src/ui`, una freccia ambra col nome VERO
> della destinazione più il percorso fino alla pagina aperta, su tutte le
> schede e tutti i moduli. Prima c'era un link grigio «Torna alla giornata»,
> che era il nome di una sezione dentro la home e non il nome della home: si
> tornava in un posto che non si chiamava così.
>
> **Chiusi il 2026-09-10 (secondo giro).** Ripulita la home del tecnico. Via
> «Ultimi esiti», che mostrava cose già andate bene e non chiedeva niente a
> nessuno. Via «Bozze da inviare», il cui titolo era diventato falso: da quando
> si manda il foglio di giornata, una scheda da sola non si invia più. Al loro
> posto «Giornate rimaste aperte», che raggruppa per giorno e dice quante schede
> mancano per chiudere quel giorno — che è il fatto vero che si nascondeva
> dietro il titolo sbagliato. E «Da correggere» sparisce quando è vuota, invece
> di occupare mezza schermata per annunciare che non è successo niente.
>
> **Chiusi il 2026-09-10.** La scheda del cantiere, che era la tappa mancante:
> dalla card in home non si finisce piu' dritti nel form del rapportino, si
> approda su una panoramica con squadra assegnata, giorni gia' lavorati, foto e
> dati del cantiere, e il rapportino parte da li'. La giornata da compilare vive
> nell'indirizzo (`?data=`), quindi il link e' condivisibile e tornando indietro
> dal rapportino non si perde il giorno. Sciolto anche il nodo di
> `/cantieri/:id`, che apriva il modulo dell'anagrafica: adesso e' la scheda in
> lettura, e il modulo sta su `/cantieri/:id/modifica` dietro `cantieri.write`.
>
> *Decisione presa, e vale per il prodotto e non solo per Edily:* il tecnico
> continua a vedere **solo i cantieri assegnati a lui**, non tutti quelli
> dell'impresa. Alla Edily oggi il tecnico e' uno solo e le due cose
> coincidono, ma il gestionale nasce per essere venduto anche ad altri, e in
> un'impresa con tre tecnici il perimetro per assegnazione e' l'unico che
> regge. Non toccare quindi `app.puo_vedere_cantiere` ne' il perimetro di
> `invia_foglio_giornata`.

> **Chiusi il 2026-09-09.** Foglio Riepilogativo di Giornata: la giornata parte
> intera e solo quando ogni cantiere attivo ha la sua scheda, con la regola nel
> database (`invia_foglio_giornata`) e non nell'interfaccia. Cruscotto a card per
> il tecnico e vista panoramica per giornata per il titolare. Flag «nessuna
> attività» per chiudere la scheda di un cantiere fermo. Alleggerimento della
> scheda: via il meteo, orario e trasferta facoltativi e nascosti, la squadra si
> compone da una tendina invece che a spunte. Note al titolare, foto di cantiere,
> impaginazione su due colonne. Menu del tecnico ridotto a quello che fa davvero.
>
> **Chiusi il 2026-09-01.** Disallineamento delle collazioni su `postgres`;
> unicità degli identificativi dei clienti (database + traduzione dell'errore nel
> form); residui del template React sostituiti dal marchio Edily; primo deploy su
> Vercel, con le variabili `VITE_*` come **Config** e non Secret — hanno il
> prefisso pubblico apposta, finiscono nel bundle per costruzione.

L'ordine qui sotto non è casuale: prima quello che protegge il lavoro già fatto,
poi quello che ne aggiunge.

### Mettere al sicuro ciò che esiste

1. **Dump dello schema.** 27 tabelle, 7 viste, 60+ policy e i trigger vivono in
   un posto solo, senza storia e senza copia. Il 2026-09-01 ci abbiamo aggiunto
   a mano due indici unici su `clienti`: la distanza fra quello che il database
   contiene e quello che il repository sa continua a crescere, e nessuno la sta
   misurando. Serve la password del database, vedi la sezione dedicata.
2. **Piano Pro**, che è ciò che abilita i backup automatici. Finché restiamo su
   Free, il punto 1 non è documentazione: è l'unica copia che abbiamo.
3. **Advisors** del pannello Supabase (pallino giallo nella barra laterale):
   controlli automatici su sicurezza e prestazioni, la stessa famiglia di
   verifiche fatte a mano qui ma automatizzata. Cercare in particolare viste
   senza `security_invoker` e tabelle senza RLS.
4. Correggere la policy dell'`inviato`, il difetto 🔴 rimasto: oggi l'autore può
   ancora modificare un rapportino che ha già mandato.
5. **Rendere vera la separazione dei compiti sulla contabilizzazione.** Dal
   2026-09-01 il pulsante «Contabilizza» non compare più a chi valida — owner e
   admin — perché chi approva un rapportino non deve anche registrarlo nei conti.
   Ma è una regola dell'interfaccia: il trigger del database lascia ancora fare
   la transizione a chiunque abbia `economics.write`, owner compreso. Per farne
   una regola vera serve un permesso nuovo `rapportini.contabilizza`, da **non**
   assegnare a owner e admin, più il controllo dentro il trigger che oggi
   verifica `rapportini.validate`. Non è stato fatto subito perché il flusso di
   contabilizzazione va ancora definito: per ora il tecnico compila, l'owner
   valida, e da lì i dati passano all'amministrazione.

### Costruire il resto

> **Prima di tutto: eseguire i tre SQL** della sezione in cima. Finché non
> girano, note al titolare e foto di cantiere sono codice che non funziona, e il
> bucket `rapportini` resta pubblico.
>
> ⭐ **FATTO IL 2026-09-18: le ore sono uscite dai lavori extra.** Era la
> decisione del 2026-09-15, ed è applicata.
>
> *Il concetto, non un ritocco:* **le ore dei lavori extra non interessano a
> nessuno.** Al tecnico serve un campo libero dove scrivere le lavorazioni extra
> effettuate — misure, calcoli, appunti, lavori a corpo. La contabilità di quei
> lavori la fa lui a parte, fuori dal gestionale, e non passa dalle ore.
>
> *Sullo schema non si è toccato niente,* come deciso. La colonna
> `note_contabili.ore` è ancora `numeric(5,2) not null default 0` col suo check
> `0..24`: smettendo di scriverla arriva zero da sola. Nessuna migrazione,
> nessun rischio su un database condiviso con wbs-office e senza backup. **Le
> righe vecchie conservano il loro valore** — in correzione l'`update` non passa
> più la colonna, quindi non la azzera — e se un domani le ore servissero sono
> ancora lì.
>
> *Cosa è cambiato in pagina:*
>
> - **Il campo «Cosa è stato fatto» è diventato un'area di testo** (4 righe) in
>   tutti e due i moduli, con il suggerimento di scrivere per esteso. Era una
>   riga sola, e una riga sola dice a chi scrive di essere breve proprio dove
>   serve il contrario. Dove il testo si rilegge c'è `whitespace-pre-wrap`:
>   misure e calcoli vanno a capo, e schiacciarli butterebbe via il motivo per
>   cui il campo è largo.
> - **Il conto è passato dalle ore alle lavorazioni.** In
>   [`EconomiaPage`](src/modules/economia/EconomiaPage.tsx) il «TOTALE NEL
>   PERIODO» è diventato «NEL PERIODO · *n* lavorazioni», e la ripartizione per
>   cantiere conta quante ce ne sono invece di sommare ore. Stessa cosa nel
>   badge della scheda cantiere e nelle testate dei due riquadri.
> - **Via la colonna Ore** dalla tabella di Economia e il totale dal riquadro in
>   sola lettura del rapportino.
> - **L'unica validazione rimasta è la descrizione non vuota.** I due controlli
>   sulle ore (`> 0` e `<= 24`) non avevano più niente da controllare.
> - `sommaOre()` **tolta** da [`noteContabili.ts`](src/modules/cantieri/noteContabili.ts),
>   come previsto: era rimasta senza chiamanti.
>
> *Verificato con `npm run build`* (non con `npx tsc --noEmit`, che qui non
> controlla niente) più `npx eslint src`: pulito. Le due segnalazioni di eslint
> su `SessionProvider.tsx` sono preesistenti e non c'entrano.
>
> *Da provare in ufficio:* è un cambio di concetto, non di grafica. Vale la
> domanda di sempre — il tecnico ci scrive dentro quello che serve a fatturare,
> o il campo largo lo intimidisce?
>
> ⭐ **POI: la vista delle ore per persona.** Non è numerata perché non sta in
> coda a niente: viene prima dei punti qui sotto.
>
> **Oggi c'è un buco aperto da noi.** Il 15 settembre 2026 i rapportini sono
> usciti dal menu dell'amministrazione, e finché questa pagina non esiste
> Stefania non ha **nessuna** strada per leggere le ore che deve elaborare.
>
> *Cos'è.* Il totale delle ore **per persona e per periodo**, su cui lei mette
> le tariffe e da cui esce la busta paga. Non è l'elenco dei rapportini con un
> filtro: è l'altro capo del flusso. Il rapportino è il documento della giornata
> di un cantiere; questa è la riga di una persona su un mese.
>
> *Il mattone c'è già:* `v_ore_giornaliere` espone `data`, `cantiere`,
> `dipendente`, ore ordinarie/straordinarie/trasferta/totali, `tipo_assenza` e
> `stato` — quindi «solo i validati» è una condizione, non una query nuova. E
> `v_riepilogo_paghe` esiste: va verificato cosa contiene davvero prima di
> duplicarla.
>
> *Da chiedere a Stefania prima di scriverla,* perché sono decisioni sue e non
> si indovinano: quale periodo guarda (il mese? la quindicina?); se vuole vedere
> solo i rapportini validati o anche quelli ancora in corsa; se le serve il
> dettaglio per cantiere sotto ogni persona o solo il totale; e con quali parole
> chiama le cose — i suoi nomi valgono più delle nostre ipotesi.
>
> *Attenzione al perimetro:* il conto deve passare da `ore_giornata()` o da una
> funzione `security definer`, non da una somma nel browser. Le viste sono tutte
> `security_invoker=on`, e sommare nel frontend darebbe un numero plausibile e
> sbagliato. Vale qui la stessa ragione del controllo delle 8 ore.

1. **Il ribaltamento al cliente delle ore in economia.** Aspetta le specifiche
   dell'utente, che ha detto esplicitamente che dirà lui come si fa: **non
   anticiparlo**.

   *Già pronto:* la pagina **Economia** raccoglie tutte le ore in economia di
   tutti i cantieri, con periodo, filtro per cantiere, ricerca e totali. La vede
   anche il tecnico (cancello in OR fra `rapportini.create` e `economics.read`),
   e chi vede cosa lo decide la RLS.

   *Quando arriveranno le specifiche* serviranno probabilmente due colonne su
   `note_contabili` — una spunta «già fatturata» e il riferimento del documento
   — e la pagina diventa una coda di lavoro invece di un elenco. La tabella è
   già fatta per reggerlo.

2. **Il controllo delle 8 ore: completare i due rami.** Chiesto il 2026-09-10.
   Il metro sono le 8 ore del contratto italiano, e il conto va fatto sulla
   **persona** e sul **giorno**, non sul singolo rapportino.

   *Già fatto il 2026-09-10:* la funzione
   [`ore-giornata.sql`](supabase/schema/ore-giornata.sql) e il riquadro in home,
   che compare solo quando qualcosa non torna e dice quanto sta fuori dal
   perimetro di chi guarda senza dire dove.

   *Perché una funzione `security definer` e non la vista.* Le sette viste sono
   tutte `security_invoker=on` — verificato il 2026-09-10 — quindi
   `v_ore_giornaliere` mostra solo i cantieri del perimetro di chi legge. Con il
   perimetro per assegnazione, sommare nel browser darebbe 4 invece di 9 senza
   nessun errore. Un numero sbagliato che si presenta come giusto è peggio di un
   numero che manca. La funzione restituisce l'aggregato per persona e mai su
   quali cantieri, e ha il suo cancello su `rapportini.create` /
   `read_all` / `validate` scritto a mano, perché `definer` spegne la RLS.

   *Cosa resta.*

   - ~~Il buco nello schema.~~ **Chiuso il 2026-09-10** con la colonna
     `ore_assenza` su `rapportino_ore`, scelta dall'utente fra le tre proposte.
     Adesso sei ore lavorate e due di permesso stanno sulla stessa riga, e nel
     form il motivo non spegne più la presenza: la affianca. Scegliendo un
     motivo, le ore di assenza si riempiono con quello che manca alle otto, non
     con la giornata intera — chi ha già scritto sei ore sta dichiarando un
     permesso di due. Le righe vecchie con un motivo e zero ore non sono state
     riscritte: valgono come assenza a giornata e il controllo le riconosce.
   - ~~La stessa regola dentro `invia_foglio_giornata`.~~ **Chiusa l'11
     settembre 2026** con
     [`invio-controllo-ore.sql`](supabase/schema/invio-controllo-ore.sql).
     Blocca **tutti e due i rami**, e il dubbio scritto qui — «quello delle ore
     mancanti forse no» — è stato **corretto dall'utente**: il ramo delle ore
     mancanti blocca eccome. L'ipotesi era che il motivo dell'assenza lo
     sapesse l'amministrazione; è il contrario. **È il tecnico che fa il giro
     dei cantieri ogni giorno ed è lui che porta le informazioni in ufficio**:
     se qualcuno non c'era, lo sa prima di chiunque altro. Chiederglielo a fine
     giornata è chiederlo all'unica persona che ce l'ha.

     Il conto passa da `ore_giornata()` e non da una query dentro l'invio:
     quella funzione è `security invoker` e vedrebbe solo il perimetro di chi
     manda, cioè 4 dove il totale è 9.

     Il messaggio elenca **tutte** le persone in una volta, non si ferma alla
     prima: con una squadra di otto sarebbero otto viaggi per un lavoro solo.
     Dove le ore stanno su cantieri di un collega lo dice — «5 ore su cantieri
     non tuoi: sentile con chi li segue» — così il tecnico sa che deve sentire
     qualcuno invece di cercare a vuoto nei suoi.

     **La regola è scritta in due posti** e vanno tenuti allineati: `anomaliaDi()`
     in [`useOreGiornata.ts`](src/modules/rapportini/useOreGiornata.ts) per
     l'avviso in home, e il file SQL per il blocco. Se cambia una, cambiare
     l'altra.
   - **Nel form del rapportino**, un modo rapido per spostare ore da ordinarie a
     straordinarie: oggi l'avviso dice «aprilo e spostale» e chi lo fa deve
     ricalcolare a mano. **Rimandato dall'utente l'11 settembre 2026:** prima si
     prova in ufficio il blocco all'invio, poi si decide se serve.

3. **Le ore del tecnico: fare il collegamento.** Chiesto il 2026-09-10, e il
   codice è pronto: resta un'operazione da fare a mano, una volta.

   *Già fatto il 2026-09-10.* La scheda operaio espone il campo **Utente del
   gestionale** (`dipendenti.user_id`), con la tendina delle persone non ancora
   collegate a un'altra anagrafica — due schede sullo stesso utente
   conterebbero le sue ore due volte. E
   [`foglio-ore-tecnico.sql`](supabase/schema/foglio-ore-tecnico.sql) impedisce
   di mandare la giornata senza le proprie ore, con l'avviso anche in home
   sopra il pulsante.

   *Da VERIFICARE per prima cosa, il 2026-09-16:* se il collegamento su
   `tecnico@cassia.com` sia stato fatto davvero. L'utente il 2026-09-15 ha
   detto di sì, ma non è stato controllato sul database — e da quella riga
   dipendono due cose visibili: il riquadro **«Le tue ore»** in home, che senza
   collegamento dice «la tua scheda operaio non è collegata», e il **blocco
   dell'invio** della giornata, che senza non si accende affatto. Basta
   aprire la home come tecnico e leggere quel riquadro; oppure:

   ```sql
   select nominativo, user_id from public.dipendenti where user_id is not null;
   ```

   *Da fare, e lo fa amministrazione:* aprire la scheda operaio del tecnico —
   creandola se non esiste — e collegarla al suo utente. Da quel momento il
   tecnico compare nella tendina della squadra come chiunque altro, si divide le
   ore fra i cantieri della giornata, il controllo delle 8 ore vale anche per
   lui, e la giornata non parte senza le sue ore. Prima del collegamento non
   cambia niente e nessuno resta bloccato: il controllo si accende da solo
   quando c'è dove rispondere.

   *Da decidere:* se il tecnico collegato debba comparire già in squadra
   aprendo un rapportino nuovo. Sarebbe comodo, ma con più cantieri al giorno
   ricadrebbe nello stesso errore del vecchio precompilato a otto ore.

4. **Subappalto dentro il rapportino.** Chiesto il 2026-09-09. Nella scheda c'è
   un riquadro segnaposto sotto la squadra, che non ha campi e non salva niente:
   risponde alla stessa domanda della squadra — chi ha lavorato qui oggi — per le
   imprese che non sono la nostra.

   *Le domande da sciogliere prima di scrivere la tabella,* perché ognuna cambia
   lo schema e migrare dati veri per correggersi costa: il subappaltatore è un
   `fornitori` già in anagrafica o testo libero? Di lui si registrano le ore, il
   numero di persone, o solo la presenza? Entra nei costi del cantiere o resta
   cronaca della giornata? Serve allegare il contratto?

5. **Documenti: due posti diversi, perché sono due cose diverse.** Deciso il
   2026-09-10.

   *Documenti di CANTIERE* — computi, disegni, permessi, verbali. Appartengono
   a un cantiere, quindi stanno **nella scheda del cantiere**, accanto alle
   foto. La voce di menu è stata tolta: in un elenco generale la prima cosa da
   fare sarebbe filtrarli per cantiere, cioè rifare a mano il raggruppamento
   che il cantiere già offre. Oggi c'è il riquadro che dichiara di essere in
   attesa; manca il bucket, perché `rapportini` accetta solo immagini e i PDF
   ne vogliono uno loro.

   *Documenti dell'IMPRESA* — DURC, iscrizione alla cassa edile, assicurazioni,
   visura camerale, certificazioni. Non hanno un cantiere: hanno una
   **scadenza**, ed è quella il motivo per cui esistono nel gestionale. Un DURC
   scaduto ferma un cantiere.

   *Consiglio su come farli:* non un archivio di file ma una tabella di
   documenti con `tipo`, `numero`, `valido_dal`, `valido_al` e il file
   allegato, più un riquadro in home per chi tiene l'amministrazione che dice
   cosa scade nei prossimi trenta giorni. Un archivio dove cercare a mano
   funziona finché qualcuno si ricorda di guardarci; una scadenza che si fa
   avanti da sola funziona anche quando nessuno ci pensa. Da decidere anche se
   la stessa forma serva per le scadenze dei **mezzi** (revisione,
   assicurazione), che sono lo stesso problema con un'altra etichetta.

6. **Foglio generale dei cantieri.** Chiesto il 2026-09-01. Una giornata solare
   per volta, con tutti i cantieri di quel giorno insieme: chi c'era, su quale
   cantiere, quante ore, più il totale della giornata. Serve a sapere cosa ha
   fatto l'azienda il giorno X, cosa che oggi si può ricostruire solo aprendo i
   rapportini uno per uno.

   *Il mattone c'è già:* `v_ore_giornaliere` espone `data`, `cantiere`,
   `dipendente`, ore ordinarie/straordinarie/trasferta/totali, `tipo_assenza` e
   soprattutto `stato` — quindi il filtro «solo validati» è una condizione, non
   una query nuova.

   *Due nodi da sciogliere prima di scriverlo:*
   - **«Visibile a tutti» è una deroga allo scope, non una svista da evitare.**
     Oggi un tecnico vede solo i cantieri a cui è assegnato: è
     `app.puo_vedere_cantiere()` a deciderlo, e una vista `SECURITY INVOKER`
     eredita quella regola. Un foglio che mostri l'intera giornata dell'azienda
     fa vedere al tecnico anche i cantieri che non sono suoi. È una scelta
     legittima — il giornale dei lavori è un documento di squadra — ma va presa
     esplicitamente, perché è la prima volta che si allarga lo scope.
   - **Cosa contiene oltre alle ore.** Se deve essere "la summa della giornata",
     vanno decisi materiali (`rapportino_materiali`) e mezzi
     (`rapportino_mezzi`): ci sono le tabelle, e includerli cambia la forma
     della pagina.

7. Anagrafiche mancanti: **mezzi** (con scadenze revisione/assicurazione e
   storico costi), **fornitori**, **materiali**.
8. **Magazzino: completare la parte amministrativa.** Chiesto il 2026-09-10,
   che l'utente ha esplicitamente rimandato («poi lo vediamo con la parte
   amministrativa»). Da definire con lui: prezzi e valorizzazione delle
   giacenze; ordini ai fornitori e riordino automatico al sotto scorta;
   inventario periodico; e soprattutto **se lo scarico debba nascere da solo dal
   rapportino**, visto che `rapportino_materiali` già registra il materiale usato
   in cantiere e oggi le due cose non si parlano. Da rivedere anche chi può
   scrivere: oggi carica `anagrafiche.write` e scarica anche `rapportini.create`,
   ma è una scelta ragionevole presa da noi, non una regola concordata.

9. **Spostamento di materiale da cantiere a cantiere.** Chiesto il 2026-09-10 e
   **ribadito il 2026-09-15 come mancanza importante**, con la precisazione che
   cambia il quadro: **lo segna il tecnico**, non l'amministrazione. È lui che
   sta in cantiere e vede partire il bancale. Deve poter dire *quale materiale*
   e *in quale quantità* è passato dal cantiere X al cantiere Y.

   *Il nodo non è una tendina, è il modello.* Oggi i movimenti sanno solo
   entrare (carico dal fornitore) e uscire (scarico su un cantiere): non esiste
   il concetto di «materiale che **sta** in un cantiere». Quindi «spostato da X
   a Y» non si può scrivere perché **manca la giacenza per cantiere** — se il
   materiale appena scaricato esce dai conti, non c'è nessun posto da cui possa
   partire. È il passaggio da un magazzino con un luogo solo (il capannone) a un
   magazzino con tanti luoghi (il capannone più ogni cantiere aperto).

   *Il modello è DECISO dall'utente il 2026-09-15.* Il materiale ha un **luogo**,
   e i luoghi sono il capannone più ogni cantiere. Il capannone è un luogo fra i
   luoghi, non un posto speciale. Quattro gesti, tutti della stessa forma
   «da un luogo a un altro luogo»:

   | Gesto | Chi | Da → A |
   |---|---|---|
   | Carico | amministrazione | fornitore → capannone |
   | Prelievo | tecnico | capannone → cantiere |
   | Spostamento | tecnico | cantiere → cantiere |
   | Reso | tecnico | cantiere → capannone |

   *Il reso è lo spostamento con gli estremi invertiti*, non una funzione nuova:
   se il gesto è già «da un luogo a un altro», il ritorno in magazzino esce
   gratis. Un concetto in meno da spiegare a chi lo usa.

   *NIENTE concetto di «consumato», ed è una scelta esplicita.* Il materiale
   portato in cantiere **è** consumato da quel cantiere: il costo gli appartiene
   dal momento in cui arriva, che è ciò che serve al consuntivo. Se non viene
   spostato resta lì, e **un cantiere che chiude si tiene il suo materiale** —
   deciso dall'utente. Un gesto «segna il consumato» sarebbe un adempimento
   quotidiano in più per il tecnico, che ha già ore, foto e note: non lo farebbe,
   e dopo un mese le giacenze dei cantieri direbbero «40 sacchi» su cantieri
   chiusi da settimane. Un numero sbagliato che si presenta come giusto è peggio
   di un numero che manca — la stessa ragione per cui il conto delle ore passa da
   `ore_giornata()` e non da una somma nel browser.

   *Resta da definire, e sono domande di forma non di sostanza:* se serva un
   terzo tipo (`trasferimento`) con luogo di partenza e di arrivo, oppure una
   coppia di movimenti legati da un riferimento comune; e se lo spostamento si
   dichiari dentro il rapportino — dove il tecnico già scrive la giornata — o da
   una sua schermata.

10. **Materiali dentro il rapportino: la tendina del magazzino.** Chiesto
   esplicitamente il 2026-09-15 e definito **fondamentale** dall'utente: serve a
   sapere cosa ha preso un cantiere e quanto ne ha consumato nel tempo.

   *Come deve funzionare:* il tecnico, compilando la giornata, sceglie il
   materiale da una **tendina** — la voce esiste già in anagrafica perché l'ha
   importata Stefania dal punto di vista amministrazione — e ne dichiara
   **tipologia e quantità**.

   *Una domanda è già sciolta,* e va tenuta ferma: il materiale **esce dal
   magazzino quando il cantiere lo consuma**, non quando lo carica il camion,
   perché è il tecnico a dichiararlo dal cantiere. Quindi **un registro solo**,
   non due: i materiali del rapportino e i movimenti di magazzino sono la stessa
   cosa, altrimenti lo stesso sacco viene contato due volte. Il punto 9 non la
   contraddice: il prelievo del tecnico **è** il consumo del cantiere, e non
   esiste un gesto separato per dichiararlo.

   *Stato di oggi:* in `src/modules/rapportini` la parola `materiali` non
   compare da nessuna parte — verificato il 2026-09-15. La tabella
   `rapportino_materiali` esiste dai tempi di wbs-office, il form non la tocca.
   L'unica strada è la pagina Magazzino, con lo scarico verso un cantiere: il
   dato «cosa ha preso quel cantiere» è già nel registro dei movimenti, ma il
   gesto è fuori dal flusso del tecnico, e quello che non è nel flusso non si fa.

   *Mezzi* (`rapportino_mezzi`): tabella presente, form no, nessuna richiesta
   esplicita finora.

### Pulizia

11. Ripulire l'utente di prova `Mario Rossi` (`lillo@lalli.com`), rimasto dal seed
   della fase C con membership e assegnazione.
12. Chiudere i due difetti di lint in `SessionProvider.tsx` (fast refresh rotto e
   dipendenza instabile di `useMemo`).
13. **Verificare i deep link in produzione**: ricaricare con F5 una route interna
   (es. `/cantieri`). Se torna 404 serve un `vercel.json` con il rewrite verso
   `index.html` — react-router fa il routing lato client, e senza fallback il
   server cerca un file che non esiste. Non ancora provato.
14. Decidere di `src/assets/logo_new.jpeg`: è il file originale del logo, fuori
    dal versionamento. Da tenere come sorgente ad alta risoluzione o da
    cancellare, visto che in `src/assets/logo-edily.png` c'è già il ritaglio
    pronto all'uso.
15. **Il ritorno dall'archivio degli operai è nascosto.** Trovato dall'utente il
    2026-09-15 provando il punto di vista dell'amministrazione: archiviato un
    operaio, non si trova più il modo di farlo tornare.

    *Funziona, ma dietro due passaggi non segnalati:* spuntare «Mostra
    archiviati» nella pagina Operai, aprire la scheda, e lì il pulsante che
    diceva «Archivia» dice «Riattiva»
    ([`DipendenteForm.tsx`](src/modules/anagrafiche/DipendenteForm.tsx)). Chi non
    conosce la spunta vede solo una persona scomparsa.

    *Il rimedio non è un pulsante in più* ma dire dov'è finita: dopo
    l'archiviazione un avviso che la scheda è negli archiviati e come si
    rivedono, oppure un contatore accanto alla spunta («3 archiviati») che
    dichiara l'esistenza di quelle righe invece di aspettare che qualcuno provi
    la casella. Stessa famiglia della regola «sapere sempre dove si è».

---

## Manutenzione: `collation version mismatch`

> ✅ **Risolto il 2026-09-01 su `postgres`.** Reindicizzate le dieci tabelle con
> indici su collazioni linguistiche, poi `refresh collation version`: registrata e
> reale sono entrambe `153.121`. L'ownership del database c'era, quindi il refresh
> non ha rimbalzato.
>
> **`template1` resta disallineato** e continuerà a comparire nei log: è di
> `supabase_admin`, non lo possiamo toccare, ed è lo stampino per i database
> nuovi — che su Supabase non creeremo mai. Se il rumore dà fastidio va aperto un
> ticket, non c'è niente da fare da qui.
>
> Quanto segue resta valido come procedura: il disallineamento **si ripresenta a
> ogni aggiornamento dell'infrastruttura**.

Nei log del database compare in continuazione:

```
database "postgres" has a collation version mismatch
```

**Cos'è.** Postgres registra la versione della libreria di sistema che decide
l'ordinamento del testo — `glibc` oppure ICU, a seconda del provider con cui il
database è stato creato. Quando Supabase aggiorna l'immagine sottostante la
libreria cambia e il numero registrato non combacia più. Il messaggio esce **a
ogni nuova connessione** — per questo se ne vedono decine allo stesso secondo
quando gira uno script.

**Quanto è distante, qui.** Verificato sul database il 2026-09-01: provider
**ICU**, `en_US.UTF-8`, scarto `153.120` → `153.121`, su `postgres` e su
`template1`. È uno scarto di *patch* — un ritocco ai dati Unicode che
riguarda caratteri rari, non una revisione delle regole di ordinamento. Vale
comunque la pena chiuderlo, ma non è un incendio. `template1` è solo lo stampino
da cui nascono i database nuovi: non lo usa nessuno qui, e non è toccabile da
noi.

**Perché conta.** Non è un errore, ma se le regole di ordinamento sono cambiate
gli indici sui campi di testo sono ordinati con le regole vecchie mentre le query
confrontano con quelle nuove. Nel caso peggiore un indice non trova una riga che
esiste, o un vincolo di unicità lascia passare un duplicato. Qui i campi di testo
sotto vincolo ci sono: `cantieri.codice`, `organizations.slug`,
`permissions.code` — tutti però ASCII, e sull'ASCII l'ordine non cambia mai fra
due versioni della stessa libreria. I candidati veri sono i campi liberi con
accenti, tipo `clienti.ragione_sociale`, e solo se indicizzati: il passo 3 dello
script tira fuori l'elenco esatto.

> Qui `clienti.partita_iva` **non** compare, e non è una svista: quel vincolo non
> esiste. Vedi il difetto qui sotto.

**Come si risolve.** Le query pronte, commentate e in ordine, stanno in
[`supabase/manutenzione/collazioni.sql`](supabase/manutenzione/collazioni.sql):
diagnosi (blocchi 1-3), verifica del danno (4), riparazione (5), controllo
finale (6). In sintesi — il database ha poche decine di righe, quindi è
istantaneo:

```sql
-- 1. vedere quanto sono distanti le due versioni
select datname, datcollate, datcollversion as registrata,
       pg_database_collation_actual_version(oid) as reale
from pg_database
where datname = current_database();

-- 2. ricostruire gli indici con le regole NUOVE
reindex database postgres;

-- 3. solo adesso registrare la versione aggiornata
alter database postgres refresh collation version;
```

**L'ordine non è negoziabile.** Il passo 3 da solo fa sparire il messaggio ma
lascia gli indici ordinati come prima: spegne la spia senza togliere il guasto.

**Se il passo 3 rimbalza.** `refresh collation version` vuole l'ownership del
database e su Supabase il ruolo `postgres` non è superuser: può tornare *«must be
owner of database postgres»*. In quel caso il refresh lo fa solo il supporto
Supabase — ma il reindex del passo 2 ha già messo i dati in sicurezza, e quello
che resta è soltanto il messaggio nei log.

**Misurare il danno, qui, non si può.** Lo strumento giusto sarebbe `amcheck`,
che rilegge gli indici e verifica se l'ordinamento regge ancora, ma su Supabase
non è abilitabile: *«permission denied to create extension amcheck — must be
superuser»*, e superuser non lo diventeremo. Resta il ripiego del passo 5 dello
script, che cerca i duplicati leggendo la tabella invece dell'indice — se un
indice unico avesse lasciato passare un doppione, l'indice non lo vede ma una
scansione sequenziale sì.

Detto ciò: con un database di poche decine di righe **il reindex costa meno della
diagnosi**. È istantaneo, non tocca i dati e risolve a prescindere da quanto sia
grave. Ha senso saltare direttamente alla cura.

Se restano collazioni fuori posto:

```sql
select collname, collversion, pg_collation_actual_version(oid)
from pg_collation
where collversion is not null
  and collversion <> pg_collation_actual_version(oid);
-- poi, per ognuna:  alter collation "<nome>" refresh version;
```

`reindex database` non gira dentro una transazione: se l'editor SQL lo rifiuta
con *«cannot run inside a transaction block»*, usare `psql` con la stringa di
connessione, oppure `reindex table <nome>;` tabella per tabella.

> ⚠️ **Un upgrade di Postgres non è la cura, è più facilmente la causa.** Una
> nuova immagine porta una nuova libreria di collazione e può rigenerare il
> disallineamento. Dopo
> ogni upgrade dell'infrastruttura vanno ricontrollati i log e, se il messaggio
> torna, rilanciate le tre righe qui sopra.

---

## Utenti di prova

| Email | Ruolo | Note |
|---|---|---|
| `giuseppe@cassia.com` | `owner` | il titolare |
| `tecnico@cassia.com` | `tecnico` | assegnato al 2026-001 |
| `lillo@lalli.com` | `tecnico` | «Mario Rossi», residuo del seed |
