-- =====================================================================
-- PIU' CLIENTI PER UN CANTIERE
--
-- Chiesto dall'utente il 2026-09-24: «devo dare la possibilita' di
-- aggiungere due o piu' figure come clienti di riferimento di un
-- cantiere», privati o aziende indifferentemente. Il caso vero: due
-- fratelli comproprietari, un condominio piu' un condomino che fa
-- lavori suoi nello stesso cantiere.
--
-- COME ERA: `cantieri.cliente_id`, un cliente solo.
--
-- COME DIVENTA: `cantieri.cliente_id` RESTA ed e' il cliente
-- PRINCIPALE, quello che si sceglie nel modulo del cantiere. Gli altri
-- stanno in questa tabella nuova, `cantiere_clienti`.
--
-- Perche' non spostare tutto nella tabella nuova e togliere la
-- colonna: IL DATABASE E' CONDIVISO CON wbs-office, che legge e scrive
-- `cantieri.cliente_id`. Toglierla o cambiarne il senso romperebbe
-- l'altro frontend. Cosi' wbs-office continua a vedere il principale
-- come ha sempre fatto, e i clienti in piu' esistono solo per chi sa
-- guardarli. Per la stessa ragione su `cantieri` non si aggiunge
-- nessun trigger: e' una tabella che non e' solo nostra.
--
-- CHI SCRIVE: chi ha `cantieri.write`, cioe' alla Edily Stefania e il
-- titolare — gli stessi che scelgono il cliente principale nel modulo.
-- Il tecnico LEGGE i clienti dei cantieri suoi, come gia' legge il
-- principale nella testa della scheda.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend che la
-- legge. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1. LA TABELLA ───────────────────────────────────────────────────

-- ⚠️ LA CHIAVE PRIMARIA E' `id`, NON LA COPPIA (cantiere_id,
-- cliente_id), ed e' una protezione per wbs-office. PostgREST tratta
-- come «tabella ponte» molti-a-molti una tabella le cui due foreign key
-- stanno nella chiave primaria: a quel punto `cantieri → clienti`
-- avrebbe DUE strade (la colonna cliente_id e il ponte), e ogni
-- `select('..., clienti(...)')` su cantieri — nostro e di wbs-office —
-- fallirebbe con PGRST201 «more than one relationship». Con la chiave
-- surrogata il ponte non viene riconosciuto e l'unicita' della coppia
-- la garantisce il vincolo `unique` qui sotto.
create table if not exists public.cantiere_clienti (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Cancellato il cantiere, i suoi legami non significano piu' niente.
  cantiere_id uuid not null references public.cantieri(id) on delete cascade,

  -- RESTRICT, non cascade: un cliente legato a un cantiere non si
  -- cancella, si archivia. E' la stessa regola del principale, e il
  -- form del cliente traduce gia' il 23503 in una frase («ha gia' dei
  -- cantieri collegati: archivialo invece»).
  cliente_id uuid not null references public.clienti(id) on delete restrict,

  created_at timestamptz not null default now(),

  -- Lo stesso cliente due volte sullo stesso cantiere non vuol dire
  -- niente.
  constraint cantiere_clienti_uniq unique (cantiere_id, cliente_id)
);

alter table public.cantiere_clienti enable row level security;

create index if not exists cantiere_clienti_cliente_idx
  on public.cantiere_clienti (cliente_id);
create index if not exists cantiere_clienti_org_idx
  on public.cantiere_clienti (org_id);

comment on table public.cantiere_clienti is
  'I clienti di un cantiere OLTRE al principale, che resta in cantieri.cliente_id (letto anche da wbs-office).';


-- ── 2. LA COERENZA, CONTROLLATA DAL DATABASE ────────────────────────
-- Tre cose che il frontend rispetta ma che non gli si lasciano in
-- mano, perche' una riga sbagliata qui mescola i clienti fra aziende:
--
--   1. il cantiere e' dell'azienda scritta nella riga;
--   2. anche il cliente e' di quell'azienda — senza questo controllo
--      chi ha `cantieri.write` in un'impresa potrebbe legare al suo
--      cantiere il cliente di un'altra, se ne conosce l'id;
--   3. il cliente in piu' non e' gia' il principale: sarebbe lo stesso
--      nome due volte in scheda.
--
-- SECURITY INVOKER (il default): il controllo legge cantieri e clienti
-- con gli occhi di chi scrive. Chi non vede il cantiere non trova la
-- riga, e viene respinto come se il cantiere non esistesse.

create or replace function public.cantiere_clienti_controlla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org_cantiere uuid;
  principale uuid;
  org_cliente uuid;
begin
  select c.org_id, c.cliente_id into org_cantiere, principale
  from public.cantieri c where c.id = new.cantiere_id;

  if org_cantiere is null or org_cantiere <> new.org_id then
    raise exception 'Il cantiere non appartiene a questa azienda'
      using errcode = '42501';
  end if;

  select k.org_id into org_cliente
  from public.clienti k where k.id = new.cliente_id;

  if org_cliente is null or org_cliente <> new.org_id then
    raise exception 'Il cliente non appartiene a questa azienda'
      using errcode = '42501';
  end if;

  if principale = new.cliente_id then
    raise exception 'Questo cliente è già il principale del cantiere'
      using errcode = '23505';
  end if;

  return new;
end $$;

drop trigger if exists cantiere_clienti_controlla on public.cantiere_clienti;
create trigger cantiere_clienti_controlla
  before insert or update on public.cantiere_clienti
  for each row execute function public.cantiere_clienti_controlla();


-- ── 3. CHI PUO' FARE COSA ───────────────────────────────────────────
-- Legge chi vede il cantiere: la stessa porta della scheda.
-- Scrive chi ha `cantieri.write`. Niente UPDATE: un legame non si
-- corregge, si toglie e se ne mette un altro — cosi' non esiste il
-- caso di un legame che «cambia cliente» sotto gli occhi di qualcuno.

drop policy if exists cantiere_clienti_select on public.cantiere_clienti;
create policy cantiere_clienti_select on public.cantiere_clienti
  for select using (app.puo_vedere_cantiere(cantiere_id));

drop policy if exists cantiere_clienti_insert on public.cantiere_clienti;
create policy cantiere_clienti_insert on public.cantiere_clienti
  for insert with check (app.has_perm(org_id, 'cantieri.write'));

drop policy if exists cantiere_clienti_delete on public.cantiere_clienti;
create policy cantiere_clienti_delete on public.cantiere_clienti
  for delete using (app.has_perm(org_id, 'cantieri.write'));

grant select, insert, delete on public.cantiere_clienti to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Le tre policy e il trigger. Devono tornare 3 righe e poi 1.

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'cantiere_clienti'
order by policyname;

select tgname
from pg_trigger
where tgrelid = 'public.cantiere_clienti'::regclass and not tgisinternal;

-- Poi, NELL'APP: aprire un cantiere come amministrazione, aggiungere un
-- secondo cliente dal riquadro «Clienti», e riaprire la scheda come
-- tecnico assegnato. Il tecnico deve vederlo e non avere il pulsante.
