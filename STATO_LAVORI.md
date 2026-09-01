# Stato lavori — Gestionale Edily

> Aggiornato al **31 agosto 2026**.
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
| Clienti — elenco, scheda, CRUD, azienda/privato | ✅ |
| Operai — elenco, scheda, CRUD, storico tariffe | ✅ |
| Rapportini — elenco, scheda, creazione, modifica | ✅ |
| Rapportini — invio, validazione, rifiuto, contabilizzazione | ✅ |
| Fornitori, materiali, mezzi | ❌ da fare |
| Materiali e mezzi dentro il rapportino | ❌ da fare |
| Economia, paghe, WBS | ❌ da fare |

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

1. Anagrafiche mancanti: **mezzi** (con scadenze revisione/assicurazione e
   storico costi), **fornitori**, **materiali**.
2. Materiali e mezzi dentro il rapportino (`rapportino_materiali`,
   `rapportino_mezzi`): le tabelle ci sono, il form no.
3. Dump dello schema, poi correzione della policy dell'`inviato`.
4. Ripulire l'utente di prova `Mario Rossi` (`lillo@lalli.com`), rimasto dal seed
   della fase C con membership e assegnazione.
5. Chiudere i due difetti di lint in `SessionProvider.tsx` (fast refresh rotto e
   dipendenza instabile di `useMemo`).
6. ✅ **Collazioni disallineate** — risolto il 2026-09-01 su `postgres`. Resta
   `template1`, che non è nostro e non è azionabile: vedi la sezione qui sotto.
7. Passare in rassegna gli **Advisors** del pannello Supabase (pallino giallo
   nella barra laterale): sono i controlli automatici su sicurezza e prestazioni,
   la stessa famiglia di verifiche fatte a mano qui ma automatizzata. In
   particolare cercare viste senza `security_invoker` e tabelle senza RLS.
8. Passaggio al piano **Pro**, che è ciò che abilita i backup automatici.

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
