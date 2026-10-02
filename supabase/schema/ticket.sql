-- =====================================================================
-- I TICKET: IL TITOLARE E IL TECNICO SI SCRIVONO
--
-- Chiesto dall'utente il 2026-10-02: «serve una strada per far
-- comunicare il titolare con il tecnico. Quindi apriamo una chat o un
-- sistema tipo quello dei ticket, che forse e' meglio, dove il titolare
-- puo' dire al tecnico: ehi ricordati di aggiungere il sale [...] e poi
-- cosi' lui lo fa». Nello stesso messaggio: validare e' definitivo, il
-- «Riapri» e' uscito dal rapportino. Cio' che va detto si dice qui.
--
-- Deciso con l'utente lo stesso giorno:
--   * TICKET, non chat: un oggetto, un primo messaggio, le risposte
--     sotto; resta APERTO finche' qualcuno lo segna FATTO (e si puo'
--     riaprire).
--   * TITOLARE E TECNICO, A VICENDA: chi valida scrive a chi compila e
--     viceversa. Stefania no (non ha ne' l'uno ne' l'altro permesso).
--   * CANTIERE E GIORNO FACOLTATIVI: «ricordati il sale a Monterosa,
--     il 2 ottobre». Nella scheda del cantiere si vedono i suoi.
--   * SOLO DENTRO IL PROGRAMMA: in cima alla home e un pallino nel
--     menu. Niente email.
--
-- CHI LEGGE: solo i due che si scrivono. Il ticket non e' un registro
-- dell'impresa, e' una conversazione.
--
-- NIENTE CANCELLAZIONI: ne' del ticket ne' dei messaggi. Si chiude.
--
-- LETTO / NON LETTO: il ticket ricorda quando ciascuno dei due l'ha
-- aperto l'ultima volta, e chi ha scritto per ultimo. «Da leggere» =
-- l'ultimo messaggio e' dell'altro ed e' piu' recente della mia lettura.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1. LE PERSONE A CUI SI PUO' SCRIVERE ────────────────────────────
-- I membri attivi dell'impresa col loro nome, e per ciascuno se chi
-- chiama gli puo' aprire un ticket: chi valida scrive a chi compila,
-- chi compila a chi valida. Security definer perche' i nomi stanno in
-- `profiles` e le utenze in `memberships`, e non si vuole dipendere da
-- cosa il tecnico puo' leggere li': espone il NOME dei colleghi, che
-- l'elenco dei rapportini mostra gia'.

create or replace function public.ticket_persone(p_org uuid)
returns table (user_id uuid, nome text, destinatario boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with io as (
    select app.has_perm(p_org, 'rapportini.validate') as valida,
           app.has_perm(p_org, 'rapportini.create')   as compila
  )
  select
    m.user_id,
    coalesce(nullif(btrim(p.full_name), ''), p.email, 'Utente senza nome') as nome,
    m.user_id <> auth.uid() and (
      ((select valida from io) and exists (
        select 1 from public.role_permissions rp
        where rp.ruolo = m.ruolo and rp.permission = 'rapportini.create'))
      or
      ((select compila from io) and exists (
        select 1 from public.role_permissions rp
        where rp.ruolo = m.ruolo and rp.permission = 'rapportini.validate'))
    ) as destinatario
  from public.memberships m
  left join public.profiles p on p.id = m.user_id
  where m.org_id = p_org
    and m.attivo
    and app.is_member(p_org);
$$;

revoke all on function public.ticket_persone(uuid) from public, anon;
grant execute on function public.ticket_persone(uuid) to authenticated;


-- ── 2. IL TICKET ────────────────────────────────────────────────────

create table if not exists public.ticket (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- #1, #2, ... per impresa: il nome con cui se ne parla a voce.
  numero integer not null,

  oggetto text not null check (btrim(oggetto) <> ''),
  da_user uuid not null default auth.uid(),
  a_user uuid not null,

  cantiere_id uuid references public.cantieri(id) on delete set null,
  giorno date,

  stato text not null default 'aperto' check (stato in ('aperto', 'fatto')),
  fatto_at timestamptz,
  fatto_da uuid,

  -- Per «da leggere»: chi ha scritto per ultimo e quando, e quando
  -- ciascuno dei due l'ha letto l'ultima volta.
  ultimo_messaggio_at timestamptz not null default now(),
  ultimo_autore uuid,
  letto_da_mittente_at timestamptz,
  letto_da_destinatario_at timestamptz,

  created_at timestamptz not null default now(),

  constraint ticket_numero_unico unique (org_id, numero),
  constraint ticket_due_persone check (da_user <> a_user)
);

alter table public.ticket enable row level security;

create index if not exists ticket_da_idx on public.ticket (org_id, da_user);
create index if not exists ticket_a_idx on public.ticket (org_id, a_user);
create index if not exists ticket_cantiere_idx on public.ticket (cantiere_id) where cantiere_id is not null;

comment on table public.ticket is
  'Un ticket fra chi valida e chi compila: oggetto, cantiere e giorno facoltativi, aperto o fatto. I messaggi in ticket_messaggi.';


-- Alla nascita: il numero, chi scrive, e che il destinatario sia uno a
-- cui si puo' scrivere (`ticket_persone`).
--
-- SECURITY DEFINER per il NUMERO: chi apre vede solo i ticket suoi, e il
-- massimo calcolato coi suoi occhi darebbe a due ticket lo stesso numero
-- (trovato provandolo). `auth.uid()` resta quello di chi apre.
create or replace function public.ticket_nasce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  altra uuid;
begin
  new.da_user := auth.uid();

  if not exists (
    select 1 from public.ticket_persone(new.org_id) p
    where p.user_id = new.a_user and p.destinatario
  ) then
    raise exception 'A questa persona non puoi aprire un ticket' using errcode = '42501';
  end if;

  if new.cantiere_id is not null then
    select c.org_id into altra from public.cantieri c where c.id = new.cantiere_id;
    if altra is null or altra <> new.org_id then
      raise exception 'Il cantiere non appartiene a questa azienda' using errcode = '42501';
    end if;
  end if;

  -- Il numero: uno alla volta per impresa.
  perform pg_advisory_xact_lock(hashtext('ticket:' || new.org_id::text));
  select coalesce(max(t.numero), 0) + 1 into new.numero
  from public.ticket t where t.org_id = new.org_id;

  new.stato := 'aperto';
  new.fatto_at := null;
  new.fatto_da := null;
  new.ultimo_messaggio_at := now();
  new.ultimo_autore := auth.uid();
  new.letto_da_mittente_at := now();
  new.letto_da_destinatario_at := null;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists ticket_nasce on public.ticket;
create trigger ticket_nasce
  before insert on public.ticket
  for each row execute function public.ticket_nasce();


-- Dopo la nascita cambia solo lo stato e le letture. E ognuno segna
-- letto solo per se'.
create or replace function public.ticket_cambia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.org_id <> old.org_id or new.numero <> old.numero
     or new.oggetto <> old.oggetto or new.da_user <> old.da_user
     or new.a_user <> old.a_user
     or new.cantiere_id is distinct from old.cantiere_id
     or new.giorno is distinct from old.giorno
     or new.created_at <> old.created_at then
    raise exception 'Un ticket non si riscrive: si risponde' using errcode = 'P0001';
  end if;

  if new.letto_da_mittente_at is distinct from old.letto_da_mittente_at
     and auth.uid() <> old.da_user then
    raise exception 'Ognuno segna letto solo per se''' using errcode = '42501';
  end if;
  if new.letto_da_destinatario_at is distinct from old.letto_da_destinatario_at
     and auth.uid() <> old.a_user then
    raise exception 'Ognuno segna letto solo per se''' using errcode = '42501';
  end if;

  -- L'ora della lettura e' quella del database, non dell'orologio del
  -- telefono di chi legge: un orologio indietro farebbe tornare «da
  -- leggere» un messaggio gia' letto.
  if new.letto_da_mittente_at is distinct from old.letto_da_mittente_at then
    new.letto_da_mittente_at := now();
  end if;
  if new.letto_da_destinatario_at is distinct from old.letto_da_destinatario_at then
    new.letto_da_destinatario_at := now();
  end if;

  if new.stato <> old.stato then
    if new.stato = 'fatto' then
      new.fatto_at := now();
      new.fatto_da := auth.uid();
    else
      new.fatto_at := null;
      new.fatto_da := null;
    end if;
  else
    new.fatto_at := old.fatto_at;
    new.fatto_da := old.fatto_da;
  end if;

  return new;
end $$;

drop trigger if exists ticket_cambia on public.ticket;
create trigger ticket_cambia
  before update on public.ticket
  for each row execute function public.ticket_cambia();


drop policy if exists ticket_select on public.ticket;
create policy ticket_select on public.ticket
  for select using (
    app.is_member(org_id) and auth.uid() in (da_user, a_user)
  );

drop policy if exists ticket_insert on public.ticket;
create policy ticket_insert on public.ticket
  for insert with check (
    app.is_member(org_id)
    and (app.has_perm(org_id, 'rapportini.validate') or app.has_perm(org_id, 'rapportini.create'))
  );

drop policy if exists ticket_update on public.ticket;
create policy ticket_update on public.ticket
  for update
  using (auth.uid() in (da_user, a_user))
  with check (auth.uid() in (da_user, a_user));

grant select, insert, update on public.ticket to authenticated;


-- ── 3. I MESSAGGI ───────────────────────────────────────────────────

create table if not exists public.ticket_messaggi (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.ticket(id) on delete cascade,
  autore uuid not null default auth.uid(),
  testo text not null check (btrim(testo) <> ''),
  created_at timestamptz not null default now()
);

alter table public.ticket_messaggi enable row level security;

create index if not exists ticket_messaggi_ticket_idx
  on public.ticket_messaggi (ticket_id, created_at);

-- Chi scrive e' chi e' collegato, l'impresa e' quella del ticket.
create or replace function public.ticket_messaggio_nasce()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.ticket%rowtype;
begin
  select * into t from public.ticket where id = new.ticket_id;
  if t.id is null or t.org_id <> new.org_id then
    raise exception 'Il ticket non appartiene a questa azienda' using errcode = '42501';
  end if;
  new.autore := auth.uid();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists ticket_messaggio_nasce on public.ticket_messaggi;
create trigger ticket_messaggio_nasce
  before insert on public.ticket_messaggi
  for each row execute function public.ticket_messaggio_nasce();

-- Dopo: il ticket sa chi ha scritto per ultimo, e chi scrive l'ha letto.
create or replace function public.ticket_messaggio_scritto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.ticket t
  set ultimo_messaggio_at = new.created_at,
      ultimo_autore = new.autore,
      letto_da_mittente_at = case when t.da_user = new.autore then new.created_at else t.letto_da_mittente_at end,
      letto_da_destinatario_at = case when t.a_user = new.autore then new.created_at else t.letto_da_destinatario_at end
  where t.id = new.ticket_id;
  return null;
end $$;

drop trigger if exists ticket_messaggio_scritto on public.ticket_messaggi;
create trigger ticket_messaggio_scritto
  after insert on public.ticket_messaggi
  for each row execute function public.ticket_messaggio_scritto();

drop policy if exists ticket_messaggi_select on public.ticket_messaggi;
create policy ticket_messaggi_select on public.ticket_messaggi
  for select using (
    exists (
      select 1 from public.ticket t
      where t.id = ticket_id and auth.uid() in (t.da_user, t.a_user)
    )
  );

drop policy if exists ticket_messaggi_insert on public.ticket_messaggi;
create policy ticket_messaggi_insert on public.ticket_messaggi
  for insert with check (
    exists (
      select 1 from public.ticket t
      where t.id = ticket_id and auth.uid() in (t.da_user, t.a_user)
    )
  );

grant select, insert on public.ticket_messaggi to authenticated;


-- ── 4. APRIRE UN TICKET, IN UN COLPO SOLO ───────────────────────────
-- Il ticket e il suo primo messaggio insieme: o tutti e due o niente,
-- cosi' non resta mai un ticket senza testo. Security invoker: valgono
-- le policy e i trigger qui sopra.

create or replace function public.apri_ticket(
  p_org uuid,
  p_a_user uuid,
  p_oggetto text,
  p_testo text,
  p_cantiere uuid default null,
  p_giorno date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if btrim(coalesce(p_testo, '')) = '' then
    raise exception 'Scrivi il messaggio' using errcode = 'P0001';
  end if;

  insert into public.ticket (org_id, a_user, oggetto, cantiere_id, giorno)
  values (p_org, p_a_user, btrim(p_oggetto), p_cantiere, p_giorno)
  returning id into v_id;

  insert into public.ticket_messaggi (org_id, ticket_id, testo)
  values (p_org, v_id, btrim(p_testo));

  return v_id;
end $$;

revoke all on function public.apri_ticket(uuid, uuid, text, text, uuid, date) from public, anon;
grant execute on function public.apri_ticket(uuid, uuid, text, text, uuid, date) to authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: 3 policy sul ticket, 2 sui messaggi, 4 trigger, e le
-- due funzioni (persone, apri_ticket).
select 'policy ticket' as cosa, count(*)::text as quanti
from pg_policies where schemaname = 'public' and tablename = 'ticket'
union all
select 'policy messaggi', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'ticket_messaggi'
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname in ('ticket_nasce', 'ticket_cambia', 'ticket_messaggio_nasce', 'ticket_messaggio_scritto')
union all
select 'funzioni', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('ticket_persone', 'apri_ticket');
