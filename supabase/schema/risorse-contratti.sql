-- =====================================================================
-- RISORSE: I CONTRATTI, UNO DOPO L'ALTRO, E COME FINISCE IL SERVIZIO
--
-- Chiesto dall'utente il 2026-09-29, guardando la scheda:
--
--   «voglio il campo per la chiusura della data di assunzione [...] per
--   entrambi [determinato e indeterminato], anche perche' bisogna pure
--   un campo dove venga segnato il motivo della fine del rapporto».
--
-- E poi, alle tre domande:
--   1. «L'assunzione e' una conseguenza del servizio. Quindi puo' finire
--      e rimanere in servizio, si'.» Il contratto finisce, la persona
--      puo' restare: la fine del contratto NON chiude il servizio.
--      Il contrario si': finito il servizio, nessun contratto resta
--      aperto oltre.
--   2. Il motivo della fine sta anche sul SERVIZIO, cosi' vale per chi
--      non e' mai stato assunto (la prova non superata).
--   3. «Tabella per i contratti, perche' possono essere oltre che di
--      diversa tipologia anche di diversa azienda» — ecco il perche' di
--      «Assunto con». Un determinato rinnovato, trasformato, o rifatto
--      con un'altra ditta del gruppo: ogni contratto e' una riga, e i
--      vecchi restano.
--
-- ── DOVE STA COSA ───────────────────────────────────────────────────
--   dipendente_contratti   un contratto per riga: con chi, che tipo,
--                          dal, al, perche' e' finito
--   dipendente_uscite      il motivo della fine del SERVIZIO, una riga
--                          per persona (la data resta `data_cessazione`)
--
-- TUTTE E DUE CHIUSE SU `anagrafiche.write`, lettura compresa. Come per
-- i documenti della persona: `dipendenti` la legge anche il tecnico, e
-- «licenziamento» scritto in una colonna li' sarebbe nascosto
-- dall'interfaccia ma leggibile da chiunque interroghi le API.
--
-- ── LE COLONNE VECCHIE RESTANO, COME COPIA ──────────────────────────
-- `data_assunzione`, `tipo_contratto`, `azienda_assunzione` e
-- `stato_rapporto` su `dipendenti` le legge wbs-office, e le usano
-- funzioni del database (`ore_griglia`, il foglio degli assenti). Non si
-- scrivono piu' a mano: le ricopia un trigger da questa tabella.
--   data_assunzione     = il PRIMO contratto (da quando e' in forza)
--   tipo_contratto,
--   azienda_assunzione  = l'ULTIMO contratto
--   stato_rapporto      = 'assunto' se c'e' un contratto aperto (senza
--                         fine, o con la fine non ancora passata)
-- Lo stato e' fotografato all'ultima modifica: un determinato scaduto
-- stanotte resta «assunto» nella colonna finche' qualcuno non tocca la
-- scheda. Il gestionale non la guarda, guarda i contratti.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend. Si puo'
-- rilanciare.
-- =====================================================================


-- ── 0. I MOTIVI ─────────────────────────────────────────────────────
-- Un check e non un enum: il database e' condiviso con wbs-office, e un
-- enum nuovo e' una cosa in piu' da portarsi dietro. Le etichette
-- stanno nel frontend (`contratti.ts`).
--
--   scadenza_termine          il determinato arrivato alla sua data
--   dimissioni
--   licenziamento
--   prova_non_superata
--   risoluzione_consensuale
--   pensionamento
--   nuovo_contratto           SOLO contratti: sostituito da un altro
--                             (rinnovo, trasformazione, cambio ditta)
--   fine_servizio             SOLO contratti: chiuso perche' e' finito
--                             il servizio (il motivo vero sta li')
--   altro                     con la nota obbligatoria


-- ── 1. I CONTRATTI ──────────────────────────────────────────────────

create table if not exists public.dipendente_contratti (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  dipendente_id  uuid not null references public.dipendenti(id) on delete cascade,
  -- «Assunto con». Testo libero per ora: diventera' una tabella di ditte.
  azienda        text not null check (btrim(azienda) <> ''),
  tipo_contratto text,
  dal            date not null,
  -- Vuota = senza scadenza. Per il determinato si scrive subito, col
  -- motivo «scadenza del termine»; per l'indeterminato quando finisce.
  al             date,
  motivo_fine    text,
  note_fine      text,
  scritto_da     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint dipendente_contratti_periodo check (al is null or al >= dal),
  -- Una fine senza motivo non risponde alla domanda per cui il campo
  -- esiste; un motivo senza fine non ha niente da motivare.
  constraint dipendente_contratti_motivo_con_fine check ((al is null) = (motivo_fine is null)),
  constraint dipendente_contratti_motivo check (
    motivo_fine is null or motivo_fine in (
      'scadenza_termine', 'dimissioni', 'licenziamento', 'prova_non_superata',
      'risoluzione_consensuale', 'pensionamento', 'nuovo_contratto',
      'fine_servizio', 'altro'
    )
  ),
  constraint dipendente_contratti_altro_con_nota check (
    motivo_fine is distinct from 'altro' or btrim(coalesce(note_fine, '')) <> ''
  )
);

create index if not exists dipendente_contratti_persona_idx
  on public.dipendente_contratti (dipendente_id, dal desc);
create index if not exists dipendente_contratti_org_idx
  on public.dipendente_contratti (org_id);

comment on table public.dipendente_contratti is
  'I contratti di una risorsa, uno per riga, dentro il periodo di servizio. Non si sovrappongono. Le colonne data_assunzione, tipo_contratto, azienda_assunzione e stato_rapporto di dipendenti ne sono la copia, tenuta da un trigger.';

alter table public.dipendente_contratti enable row level security;

drop policy if exists dipendente_contratti_select on public.dipendente_contratti;
create policy dipendente_contratti_select on public.dipendente_contratti
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_contratti_scrive on public.dipendente_contratti;
create policy dipendente_contratti_scrive on public.dipendente_contratti
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.dipendente_contratti to authenticated;


-- ── 2. LE REGOLE DI UN CONTRATTO ────────────────────────────────────
-- * la persona e' dell'azienda della riga;
-- * sta DENTRO il servizio: non comincia prima della messa in servizio,
--   non comincia ne' finisce dopo la fine del servizio;
-- * un contratto nuovo CHIUDE quello aperto prima di lui, il giorno
--   prima, col motivo «nuovo contratto»: e' il rinnovo, la
--   trasformazione, il cambio di ditta, e nessuno deve ricordarsi di
--   chiudere a mano il vecchio;
-- * due contratti non si sovrappongono: con due righe vive lo stesso
--   giorno non si saprebbe con chi e' assunto.

create or replace function public.dipendente_contratti_controlla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  p record;
  altro record;
begin
  select d.org_id, d.data_impiego, d.data_cessazione, d.cognome, d.nome
  into p
  from public.dipendenti d where d.id = new.dipendente_id;

  if p.org_id is null or p.org_id <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
  end if;

  new.azienda := btrim(new.azienda);

  if p.data_impiego is not null and new.dal < p.data_impiego then
    raise exception 'Il contratto comincia il %, prima della messa in servizio (%).',
      to_char(new.dal, 'DD/MM/YYYY'), to_char(p.data_impiego, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  if p.data_cessazione is not null and new.dal > p.data_cessazione then
    raise exception 'Il contratto comincia il %, dopo la fine del servizio (%).',
      to_char(new.dal, 'DD/MM/YYYY'), to_char(p.data_cessazione, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  if p.data_cessazione is not null and (new.al is null or new.al > p.data_cessazione) then
    raise exception 'Il servizio finisce il %: il contratto non può andare oltre.',
      to_char(p.data_cessazione, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  -- Il contratto nuovo chiude quello che era aperto prima di lui. SOLO
  -- se e' il piu' recente: uno inserito nel passato, in mezzo a un
  -- altro, e' un errore di date e deve fermarsi sulla sovrapposizione,
  -- non accorciare in silenzio un contratto che c'era (trovato provando
  -- il file, 2026-09-29).
  if tg_op = 'INSERT' and not exists (
    select 1 from public.dipendente_contratti c
    where c.dipendente_id = new.dipendente_id and c.dal >= new.dal
  ) then
    update public.dipendente_contratti c
    set al = new.dal - 1,
        motivo_fine = 'nuovo_contratto',
        note_fine = null
    where c.dipendente_id = new.dipendente_id
      and c.dal < new.dal
      and (c.al is null or c.al >= new.dal);
  end if;

  select c.dal, c.al, c.azienda into altro
  from public.dipendente_contratti c
  where c.dipendente_id = new.dipendente_id
    and c.id <> new.id
    and daterange(c.dal, c.al, '[]') && daterange(new.dal, new.al, '[]')
  order by c.dal
  limit 1;

  if found then
    raise exception 'Si sovrappone al contratto con % dal %.',
      altro.azienda,
      to_char(altro.dal, 'DD/MM/YYYY')
        || case when altro.al is null then '' else ' al ' || to_char(altro.al, 'DD/MM/YYYY') end
      using errcode = 'P0001';
  end if;

  return new;
end;
$fn$;

drop trigger if exists dipendente_contratti_controlla on public.dipendente_contratti;
create trigger dipendente_contratti_controlla
  before insert or update on public.dipendente_contratti
  for each row execute function public.dipendente_contratti_controlla();


-- ── 3. LA COPIA SU `dipendenti` ─────────────────────────────────────
-- `security definer`: la copia deve succedere sempre, anche se un
-- domani chi scrive i contratti non potesse scrivere la scheda. E' una
-- funzione di trigger e non una funzione da chiamare: dall'esterno non
-- la raggiunge nessuno.

create or replace function public.dipendente_contratti_allinea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  chi uuid := case when tg_op = 'DELETE' then old.dipendente_id else new.dipendente_id end;
  primo date;
  ultimo record;
  aperto boolean;
begin
  select min(c.dal) into primo
  from public.dipendente_contratti c where c.dipendente_id = chi;

  select c.azienda, c.tipo_contratto into ultimo
  from public.dipendente_contratti c
  where c.dipendente_id = chi
  order by c.dal desc
  limit 1;

  select exists (
    select 1 from public.dipendente_contratti c
    where c.dipendente_id = chi
      and (c.al is null or c.al >= current_date)
  ) into aperto;

  update public.dipendenti d
  set data_assunzione    = primo,
      tipo_contratto     = ultimo.tipo_contratto,
      azienda_assunzione = ultimo.azienda,
      -- Finito il contratto e rimasta in servizio, la persona torna
      -- «da inquadrare»: e' il compito che resta aperto. Chi era in
      -- prova resta in prova.
      stato_rapporto = case
        when aperto then 'assunto'::public.stato_rapporto
        when d.stato_rapporto = 'assunto' then 'da_inquadrare'::public.stato_rapporto
        else d.stato_rapporto
      end
  where d.id = chi;

  return null;
end;
$fn$;

drop trigger if exists dipendente_contratti_allinea on public.dipendente_contratti;
create trigger dipendente_contratti_allinea
  after insert or update or delete on public.dipendente_contratti
  for each row execute function public.dipendente_contratti_allinea();


-- ── 4. COME FINISCE IL SERVIZIO ─────────────────────────────────────
-- La data e' la colonna di sempre (`data_cessazione`, «Fine servizio»);
-- qui c'e' il perche'. Una riga per persona, senza storico: il servizio
-- di una scheda e' uno.

create table if not exists public.dipendente_uscite (
  dipendente_id uuid primary key references public.dipendenti(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  motivo        text not null check (motivo in (
    'scadenza_termine', 'dimissioni', 'licenziamento', 'prova_non_superata',
    'risoluzione_consensuale', 'pensionamento', 'altro'
  )),
  note          text,
  updated_at    timestamptz not null default now(),
  constraint dipendente_uscite_altro_con_nota check (
    motivo <> 'altro' or btrim(coalesce(note, '')) <> ''
  )
);

create index if not exists dipendente_uscite_org_idx on public.dipendente_uscite (org_id);

comment on table public.dipendente_uscite is
  'Perché è finito il servizio di una risorsa (la data è dipendenti.data_cessazione). Letta solo da chi ha anagrafiche.write.';

alter table public.dipendente_uscite enable row level security;

drop policy if exists dipendente_uscite_select on public.dipendente_uscite;
create policy dipendente_uscite_select on public.dipendente_uscite
  for select using (app.has_perm(org_id, 'anagrafiche.write'));

drop policy if exists dipendente_uscite_scrive on public.dipendente_uscite;
create policy dipendente_uscite_scrive on public.dipendente_uscite
  for all
  using (app.has_perm(org_id, 'anagrafiche.write'))
  with check (app.has_perm(org_id, 'anagrafiche.write'));

grant select, insert, update, delete on public.dipendente_uscite to authenticated;

create or replace function public.dipendente_uscite_controlla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  org_persona uuid;
begin
  select d.org_id into org_persona from public.dipendenti d where d.id = new.dipendente_id;
  if org_persona is null or org_persona <> new.org_id then
    raise exception 'La persona non appartiene a questa azienda' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists dipendente_uscite_controlla on public.dipendente_uscite;
create trigger dipendente_uscite_controlla
  before insert or update on public.dipendente_uscite
  for each row execute function public.dipendente_uscite_controlla();


-- ── 5. QUANDO CAMBIA LA FINE DEL SERVIZIO ───────────────────────────
-- * I contratti ancora aperti a quella data si chiudono li', col motivo
--   «fine del servizio»: il contratto sta dentro il servizio.
-- * Un contratto che comincia DOPO la nuova fine e' un errore da
--   correggere a mano, non da cancellare in silenzio.
-- * Tolta la fine (servizio riaperto), il motivo non ha piu' niente da
--   spiegare e se ne va. I contratti chiusi restano chiusi: riaprirli e'
--   una decisione, non una conseguenza.
-- `security definer` per la stessa ragione della copia: la regola deve
-- valere sempre, non solo se chi scrive vede i contratti.

create or replace function public.dipendenti_fine_servizio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  dopo date;
begin
  if new.data_cessazione is null then
    delete from public.dipendente_uscite u where u.dipendente_id = new.id;
    return new;
  end if;

  select min(c.dal) into dopo
  from public.dipendente_contratti c
  where c.dipendente_id = new.id and c.dal > new.data_cessazione;

  if dopo is not null then
    raise exception 'C''è un contratto che comincia il %, dopo la fine del servizio: correggi prima quello.',
      to_char(dopo, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  update public.dipendente_contratti c
  set al = new.data_cessazione,
      motivo_fine = 'fine_servizio',
      note_fine = null
  where c.dipendente_id = new.id
    and (c.al is null or c.al > new.data_cessazione);

  return new;
end;
$fn$;

drop trigger if exists dipendenti_fine_servizio on public.dipendenti;
create trigger dipendenti_fine_servizio
  after insert or update of data_cessazione on public.dipendenti
  for each row
  execute function public.dipendenti_fine_servizio();


-- ── 6. I CONTRATTI CHE C'ERANO GIA' ─────────────────────────────────
-- Ogni scheda con una data di assunzione diventa il suo primo
-- contratto: stessa data, stessa ditta, stesso tipo. Se il servizio e'
-- gia' finito, il contratto finisce con lui. Solo per chi non ha ancora
-- contratti: rilanciando il file non si duplica niente.
--
-- La ditta mancante (schede di prima del 25 settembre) diventa «da
-- indicare»: la colonna non la accetta vuota, e un nome inventato
-- sarebbe peggio di una scritta che chiede di essere corretta.

insert into public.dipendente_contratti
  (org_id, dipendente_id, azienda, tipo_contratto, dal, al, motivo_fine, scritto_da)
select d.org_id, d.id,
       coalesce(nullif(btrim(d.azienda_assunzione), ''), 'da indicare'),
       d.tipo_contratto,
       d.data_assunzione,
       d.data_cessazione,
       case when d.data_cessazione is not null then 'fine_servizio' end,
       null
from public.dipendenti d
where d.data_assunzione is not null
  and not exists (
    select 1 from public.dipendente_contratti c where c.dipendente_id = d.id
  );


-- ── 7. VERIFICA ─────────────────────────────────────────────────────

-- Policy (4: due per tabella) e trigger (4).
select 'policy' as cosa, count(*)::text as quanti
from pg_policies
where schemaname = 'public' and tablename in ('dipendente_contratti', 'dipendente_uscite')
union all
select 'trigger', count(*)::text
from pg_trigger
where tgname in ('dipendente_contratti_controlla', 'dipendente_contratti_allinea',
                 'dipendente_uscite_controlla', 'dipendenti_fine_servizio');

-- I contratti, persona per persona.
select d.cognome, d.nome, c.azienda, c.tipo_contratto, c.dal, c.al, c.motivo_fine
from public.dipendente_contratti c
join public.dipendenti d on d.id = c.dipendente_id
order by d.cognome, d.nome, c.dal;

-- DA SISTEMARE A MANO: segnati «assunto» senza nessun contratto (la
-- data di assunzione non c'era), o con la ditta «da indicare». E' la
-- lista da passare a Stefania.
select d.cognome, d.nome, d.stato_rapporto,
       case when c.id is null then 'nessun contratto' else 'ditta da indicare' end as cosa_manca
from public.dipendenti d
left join public.dipendente_contratti c on c.dipendente_id = d.id
where (d.stato_rapporto = 'assunto' and c.id is null)
   or c.azienda = 'da indicare'
order by d.cognome, d.nome;
