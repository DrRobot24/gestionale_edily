# Gestionale Edily

Piattaforma gestionale multi-tenant per imprese edili, sviluppata da **ENCREADE**.
Primo tenant: Edily S.r.l.

Il gestionale è il prodotto principale; la WBS (`wbs-office`) diventa un modulo
agganciato al cantiere. Le due applicazioni sono frontend separati che
condividono lo **stesso backend Supabase**: stesso database, stessa Auth,
stesse policy RLS.

---

## Stack

| Livello | Tecnologia |
|---|---|
| Build | Vite |
| UI | React 19 + TypeScript |
| Dati remoti | TanStack Query |
| Form e validazione | react-hook-form + Zod |
| Routing | react-router |
| Backend | Supabase (Postgres, Auth, RLS) |
| Lint | ESLint |

---

## Avvio in locale

Serve Node 20 o superiore.

```bash
git clone <url-del-repo>
cd gestionale
npm install
cp .env.example .env    # su Windows: copy .env.example .env
```

Apri `.env` e compila i valori:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key oppure sb_publishable_...>
VITE_APP_NAME=ENCREADE Gestionale
```

I valori si prendono dalla dashboard Supabase, in **Settings → API Keys**.
Nel tab *Legacy API Keys* c'è la `anon`; nel tab *API Keys* la `sb_publishable_...`.
Vanno bene entrambe.

> `VITE_SUPABASE_URL` è l'URL **base** del progetto, senza `/rest/v1/` in coda.

```bash
npm run dev
```

Poi apri l'indirizzo stampato dal terminale (di norma `http://localhost:5173`).

### Se vedi una pagina bianca

È un comportamento voluto. `src/lib/env.ts` valida le variabili d'ambiente
all'avvio con Zod e, se manca qualcosa, lancia un errore invece di proseguire.
Apri la console del browser: l'errore dice esattamente quale variabile manca.

Ricorda che **Vite legge `.env` solo all'avvio**: dopo averlo modificato bisogna
riavviare il dev server, l'hot reload non basta.

---

## Struttura

```
src/
├── App.tsx                 rotte e layout
├── main.tsx                entry point, provider React Query
├── lib/
│   ├── env.ts              validazione delle variabili d'ambiente
│   ├── supabase.ts         client Supabase (singleton)
│   ├── queryClient.ts      configurazione TanStack Query
│   └── database.types.ts   tipi generati dallo schema
└── modules/
    └── auth/
        ├── SessionProvider.tsx   context di sessione
        ├── session.ts            fetch di profilo, org e permessi
        ├── guards.tsx            RequireAuth, RequirePermission
        ├── usePermission.ts      hook per i controlli in UI
        └── LoginPage.tsx         form di accesso
```

Gli import fra questi file sono **relativi**: la struttura delle cartelle è
parte del contratto, non una convenzione estetica. Spostare un file rompe la
build.

---

## Modello di autorizzazione

Il permesso si decide in tre passaggi indipendenti che si compongono, tutti
applicati da Postgres via RLS — **mai dal frontend**.

| Livello | Domanda | Implementazione |
|---|---|---|
| Tenant | A quale azienda appartieni? | `memberships` → `app.org_ids()` |
| Capability | Cosa ti è permesso fare? | `role_permissions` → `app.has_perm()` |
| Scope | Su quali cantieri? | `cantiere_assegnazioni` → `app.cantieri_visibili()` |

Esempio: un tecnico appartiene a Edily (livello 1), può creare rapportini ma
non leggere i costi (livello 2), e solo sui cantieri che gli sono assegnati
(livello 3).

I permessi stanno in tabella, non nelle policy. Aggiungere un ruolo è quindi
un `insert`, non una riscrittura delle policy:

```sql
insert into role_permissions (ruolo, permission)
values ('contabile_esterno', 'economics.read'),
       ('contabile_esterno', 'anagrafiche.read');
```

I sei ruoli previsti: `owner`, `admin`, `amministrazione`, `capocantiere`,
`tecnico`, `lettore`.

### I controlli lato client non sono sicurezza

`usePermission` e `RequirePermission` servono a **non mostrare** pulsanti e
rotte inutili. Non proteggono nulla: chiunque può aggirarli dai DevTools.
La barriera vera è la RLS. Se una query non passa la policy, Postgres non
restituisce la riga, punto.

---

## Sicurezza delle chiavi

Le variabili `VITE_*` finiscono nel bundle JavaScript: sono **pubbliche**.

Va bene solo per la chiave anon/publishable, che di per sé non concede
privilegi — è la RLS a decidere cosa quell'utente può leggere.

**Non mettere mai** in `.env` la `service_role` o una `sb_secret_...`:
bypassano completamente la RLS ed equivarrebbero a pubblicare il database.

Il file `.env` non è versionato. `.env.example` sì, ed è il riferimento per
sapere quali variabili servono.

---

## Sessione condivisa con wbs-office

In `src/lib/supabase.ts` il client è configurato con
`storageKey: 'encreade-auth'`. Il valore **deve coincidere** con quello di
wbs-office perché chi è autenticato su una app lo sia anche sull'altra.

Attenzione al limite: `localStorage` è per-origine. La sessione è condivisa
solo se le due app stanno sullo **stesso dominio** (es. `/wbs` e `/gestionale`
sullo stesso host). Su sottodomini distinti (`wbs.encreade.it` e
`cantieri.encreade.it`) il `localStorage` non è condiviso e serve passare a
uno storage su cookie con `domain=.encreade.it`.

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo con hot reload |
| `npm run build` | Build di produzione in `dist/` |
| `npm run preview` | Serve localmente la build di produzione |
| `npm run lint` | Analisi statica con ESLint |

Per rigenerare i tipi dopo una modifica allo schema:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

---

## Stato del progetto

- [x] **A** — Schema database: 16 permessi, 6 ruoli, 7 viste `security_invoker`, 60+ policy RLS
- [x] **B** — Ponte WBS: sincronizzazione ricorsiva jsonb di progetti e task
- [x] **C** — Dati di prova e verifica RLS: impersonazione, macchina a stati dei rapportini
- [x] **D1** — Impalcatura Vite, moduli auth, schermata di login
- [ ] **D2** — Primo login e verifica della catena Auth → JWT → RLS dal browser
- [ ] **E** — Prima verticale funzionale

---

## Note

**La WBS non contiene ore, contiene euro.** L'avanzamento si misura su
`costoTotale` (preventivo) e `costoReale` (consuntivo). Il confronto
preventivo/consuntivo passa dal costo manodopera dei rapportini; il campo ore
resta `null` in `wbs_tasks`.

**Le migration sono un punto di rottura condiviso.** Il database serve due
frontend: aggiungere colonne è sicuro, rinominarle silenziosamente no.

**Le viste devono essere `SECURITY INVOKER`.** Senza, la RLS viene bypassata
sulla vista: è una vulnerabilità silenziosa ma critica.
