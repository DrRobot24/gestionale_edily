# Lo schema del database, com'è davvero

> Estratto dal database reale il **2026-09-18** con due query a
> `information_schema`. Non è dedotto dal codice: è quello che c'è.
>
> **Perché questo file esiste.** Lo schema vive in un posto solo — il progetto
> Supabase `wbs-office` — e finora nel repository non c'era niente che dicesse
> come è fatto. La conseguenza pratica si è vista lo stesso giorno: una query
> scritta con `role` invece di `ruolo`, fallita con un `42703`, perché il nome
> era stato indovinato invece che letto.
>
> **Non sostituisce il dump.** Resta il punto 1 dei prossimi passi in
> `STATO_LAVORI.md`: qui ci sono tabelle, colonne e relazioni, ma **non** le
> policy RLS, i trigger, le funzioni e le viste. E soprattutto questo non è una
> copia di sicurezza — il database non ne ha ancora nessuna.

---

## La regola che vale per tutto

**Quasi ogni tabella ha `org_id` che punta a `organizations`.** È il perno del
multi-tenant: la RLS filtra su quello, e una tabella nuova senza `org_id` è una
tabella che perde l'isolamento fra imprese.

Le uniche senza sono quelle di modello — `permissions`, `role_permissions` — che
descrivono il significato dei ruoli e valgono per tutte le aziende
sull'istanza.

**Il database è condiviso con wbs-office.** Aggiungere colonne e tabelle è
sicuro; rinominare o restringere no.

---

## Le relazioni, per gruppi

### Anagrafiche

```
organizations
  ├── clienti
  ├── fornitori
  ├── dipendenti ─────── dipendente_costi      (tariffe con storico)
  │                  └── dipendente_documenti  (patentini, identità)
  ├── materiali ──────── fornitori
  └── mezzi ──────────── fornitori
                     └── mezzo_costi
```

### Cantieri e lavoro

```
cantieri ──────── clienti            (facoltativo: cliente_id è nullable)
  ├── cantiere_assegnazioni ──── chi può vedere il cantiere
  ├── rapportini
  │     ├── rapportino_ore ─────── dipendenti, wbs_tasks
  │     ├── rapportino_materiali ─ materiali, fornitori
  │     ├── rapportino_mezzi ───── mezzi
  │     └── rapportino_foto
  ├── note_contabili               (i «lavori extra»)
  ├── costi_cantiere ───────────── fornitori, wbs_tasks
  ├── ricavi_cantiere
  ├── movimenti_magazzino ──────── materiali
  └── projects ─────────────────── wbs_tasks, project_shares
```

### Ore: due posti, non uno

```
rapportino_ore   ── dipendenti   ore DI UN CANTIERE, per gli operai
ore_personali    ── dipendenti   ore SENZA cantiere, per tecnici e impiegati
```

È la separazione decisa il 2026-09-17: il tecnico «vola sui cantieri» e le sue
ore non appartengono a nessuno di essi. Vedi `foglio-ore-personale.sql`.

### Documenti di trasporto

```
ddt ──── fornitori
  └── ddt_righe ──── materiali
        └── ddt_riga_cantieri ──── cantieri, wbs_tasks
```

Una riga di DDT può essere ripartita su più cantieri: è il motivo per cui
`ddt_riga_cantieri` esiste invece di una colonna `cantiere_id` sulla riga.

### Ruoli e accessi

```
organizations
  ├── memberships        chi entra nel gestionale, con che ruolo
  └── org_inviti

role_permissions ──── permissions
```

⚠️ **`role_permissions` ha la colonna `ruolo`, non `role`.** Lo schema è in
italiano; è l'errore in cui si è già inciampato una volta.

---

## Nomi che non si indovinano

Raccolti perché sono quelli su cui si sbaglia, non perché siano tutti.

| Dove | Colonna | Nota |
|---|---|---|
| `role_permissions` | **`ruolo`** | non `role` |
| `cantiere_assegnazioni` | `ruolo_cantiere` | default `'tecnico'` |
| `cantiere_assegnazioni` | `dal` / `al` | `al` nullo = assegnazione in corso |
| `cantieri` | `cliente_id` | **nullable**: un cantiere può non avere committente |
| `cantieri` | `stato` | enum `cantiere_stato`, default `in_preparazione` |
| `ddt` | `stato` | enum `stato_ddt`, default `caricato` |
| `dipendenti` | `tipo` | enum `tipo_risorsa`: operaio / tecnico / impiegato |
| `dipendenti` | `stato_rapporto` | enum: assunto / in_prova / da_inquadrare |
| `rapportino_foto` | `storage_path` | il percorso, non il file |
| `ddt` | `storage_path` | idem |
| `dipendente_documenti` | `percorso` | **qui si chiama così**, non `storage_path` |

---

## Tabelle, in ordine alfabetico

`activity_log` · `cantiere_assegnazioni` · `cantieri` · `clienti` ·
`costi_cantiere` · `ddt` · `ddt_riga_cantieri` · `ddt_righe` ·
`dipendente_costi` · `dipendente_documenti` · `dipendenti` ·
`document_counters` · `fornitori` · `materiali` · `memberships` · `mezzi` ·
`mezzo_costi` · `movimenti_magazzino` · `note_contabili` · `ore_personali` ·
`org_inviti` · `organizations` · `periodi_paga` · `permissions` ·
`project_shares` · `projects` · `rapportini` · `rapportino_foto` ·
`rapportino_materiali` · `rapportino_mezzi` · `rapportino_ore` ·
`ricavi_cantiere` · `role_permissions` · `wbs_tasks`

---

## Come si rigenera

Nel SQL Editor, di sola lettura. La prima risposta è lunga e l'interfaccia la
tronca: conviene lanciarla per gruppi di tabelle.

```sql
-- colonne
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- relazioni
select tc.table_name as tabella, kcu.column_name as colonna,
       ccu.table_name as punta_a, ccu.column_name as colonna_di_destinazione
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by tabella, colonna;
```

Per le policy, i trigger e le funzioni serve `pg_dump --schema-only`, che vuole
la password del database.
