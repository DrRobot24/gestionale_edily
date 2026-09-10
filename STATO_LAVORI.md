# Stato lavori — Gestionale Edily

> Aggiornato al **10 settembre 2026**.
> Questo file raccoglie fatti **verificati contro il database reale**, non dedotti
> dallo schema. Dove c'è scritto "verificato" vuol dire che è stato provato con
> una query e ne è stato osservato l'esito.

---

## Cosa funziona oggi

| Area | Stato |
|---|---|
| Login, sessione, tre livelli di permesso | ✅ |
| Cantieri — elenco, scheda, creazione, modifica | ✅ |
| Cantieri — assegnazione della squadra | ✅ |
| Cantieri — scheda di riepilogo, tappa prima del rapportino | ✅ |
| Ore in economia — si segnano nel rapportino, si cercano nel cantiere | ✅ |
| Clienti — elenco, scheda, CRUD, azienda/privato | ✅ |
| Operai — elenco, scheda, CRUD, storico tariffe | ✅ |
| Rapportini — elenco, scheda, creazione, modifica | ✅ |
| Rapportini — invio, validazione, rifiuto, contabilizzazione | ✅ |
| Rapportini — Foglio Riepilogativo di Giornata | ✅ |
| Fornitori — elenco, scheda, CRUD | ✅ |
| Rapportini — note al titolare | ✅ |
| Rapportini — foto di cantiere | ✅ verificato sul database il 2026-09-10 |
| Rapportini — subappalto | ❌ segnaposto, specifiche da definire |
| Documenti (storage), Subappalti | ❌ voci di menu, pagine da costruire |
| Materiali e mezzi | ❌ da fare |
| Economia, paghe, WBS | ❌ da fare |

---

## SQL: cosa è già girato

Qui non c'è un sistema di migrazioni (vedi il punto 1 dei prossimi passi),
quindi i file dello schema si eseguono a mano nel SQL Editor e fra una sessione
e l'altra non resta traccia di chi ha lanciato cosa.

**Per saperlo senza tirare a indovinare:** incollare
[`supabase/schema/verifica-stato.sql`](supabase/schema/verifica-stato.sql). È
di sola lettura e dice riga per riga cosa è FATTO e cosa è DA FARE.

**Esito del 2026-09-10: tutti eseguiti.** Non c'è niente in sospeso.


| File | Stato |
|---|---|
| [`rapportino-annotazioni.sql`](supabase/schema/rapportino-annotazioni.sql) | ✅ la colonna `annotazioni` c'è |
| [`storage-rapportini.sql`](supabase/schema/storage-rapportini.sql) | ✅ bucket chiuso, 3 policy su 3 |
| [`rapportino-foto.sql`](supabase/schema/rapportino-foto.sql) | ✅ RLS attiva — ma le policy sono di wbs-office, vedi il difetto qui sotto |
| [`ore-giornata.sql`](supabase/schema/ore-giornata.sql) | ✅ eseguito il 2026-09-10: colonna `ore_assenza` e funzione `ore_giornata()`, verificata `security definer` |
| [`foglio-ore-tecnico.sql`](supabase/schema/foglio-ore-tecnico.sql) | ✅ eseguito il 2026-09-10 |
| [`note-contabili.sql`](supabase/schema/note-contabili.sql) | ✅ eseguito il 2026-09-10, RLS verificata attiva |

Tutti e tre si possono rilanciare senza danno. Il primo usa `add column if not
exists`; il terzo si ferma da solo se le policy ci sono già; il secondo dal
2026-09-10 toglie ogni policy prima di rifarla, e prima invece si schiantava con
un `42710` alla seconda esecuzione.

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

1. **Il controllo delle 8 ore: completare i due rami.** Chiesto il 2026-09-10.
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
   - **La stessa regola dentro `invia_foglio_giornata`.** Oggi il controllo vive
     solo nell'interfaccia, e un controllo che vive solo lì lo aggira chiunque
     chiami l'API. Va deciso se blocca l'invio o se avvisa e basta: il ramo dello
     straordinario probabilmente blocca, quello delle ore mancanti forse no.
   - **Nel form del rapportino**, un modo rapido per spostare ore da ordinarie a
     straordinarie: oggi l'avviso dice «aprilo e spostale» e chi lo fa deve
     ricalcolare a mano.

2. **Le ore del tecnico: fare il collegamento.** Chiesto il 2026-09-10, e il
   codice è pronto: resta un'operazione da fare a mano, una volta.

   *Già fatto il 2026-09-10.* La scheda operaio espone il campo **Utente del
   gestionale** (`dipendenti.user_id`), con la tendina delle persone non ancora
   collegate a un'altra anagrafica — due schede sullo stesso utente
   conterebbero le sue ore due volte. E
   [`foglio-ore-tecnico.sql`](supabase/schema/foglio-ore-tecnico.sql) impedisce
   di mandare la giornata senza le proprie ore, con l'avviso anche in home
   sopra il pulsante.

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

3. **Subappalto dentro il rapportino.** Chiesto il 2026-09-09. Nella scheda c'è
   un riquadro segnaposto sotto la squadra, che non ha campi e non salva niente:
   risponde alla stessa domanda della squadra — chi ha lavorato qui oggi — per le
   imprese che non sono la nostra.

   *Le domande da sciogliere prima di scrivere la tabella,* perché ognuna cambia
   lo schema e migrare dati veri per correggersi costa: il subappaltatore è un
   `fornitori` già in anagrafica o testo libero? Di lui si registrano le ore, il
   numero di persone, o solo la presenza? Entra nei costi del cantiere o resta
   cronaca della giornata? Serve allegare il contratto?

4. **Documenti: due posti diversi, perché sono due cose diverse.** Deciso il
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

5. **Foglio generale dei cantieri.** Chiesto il 2026-09-01. Una giornata solare
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

6. Anagrafiche mancanti: **mezzi** (con scadenze revisione/assicurazione e
   storico costi), **fornitori**, **materiali**.
7. Materiali e mezzi dentro il rapportino (`rapportino_materiali`,
   `rapportino_mezzi`): le tabelle ci sono, il form no.

### Pulizia

8. Ripulire l'utente di prova `Mario Rossi` (`lillo@lalli.com`), rimasto dal seed
   della fase C con membership e assegnazione.
9. Chiudere i due difetti di lint in `SessionProvider.tsx` (fast refresh rotto e
   dipendenza instabile di `useMemo`).
10. **Verificare i deep link in produzione**: ricaricare con F5 una route interna
   (es. `/cantieri`). Se torna 404 serve un `vercel.json` con il rewrite verso
   `index.html` — react-router fa il routing lato client, e senza fallback il
   server cerca un file che non esiste. Non ancora provato.
11. Decidere di `src/assets/logo_new.jpeg`: è il file originale del logo, fuori
    dal versionamento. Da tenere come sorgente ad alta risoluzione o da
    cancellare, visto che in `src/assets/logo-edily.png` c'è già il ritaglio
    pronto all'uso.

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
