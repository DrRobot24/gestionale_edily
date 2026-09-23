-- =====================================================================
-- LE ASSENZE: un dato della PERSONA e del GIORNO, non del cantiere
--
-- NON e' una migration della CLI Supabase: lo schema di questo progetto
-- non e' versionato (vedi STATO_LAVORI.md). Va eseguito a mano nel SQL
-- Editor, UN BLOCCO ALLA VOLTA, nell'ordine in cui sono scritti.
--
-- SEGUE, e li vuole gia' eseguiti, `nessuno-dimenticato.sql` e
-- `giustificazioni-ore.sql`. DOPO questo file va RIESEGUITO
-- `ore-griglia.sql`, che e' stato aggiornato per leggere la tabella
-- nuova: senza, il Foglio presenze non vede le assenze.
--
--
-- IL PROBLEMA, detto dall'utente il 2026-09-23:
--
--   «Una risorsa assente in un giorno preciso non deve risultare in
--    alcun cantiere, quindi in nessun rapportino, mi sembra logico no?!
--    Voglio vedere il numero 0 nel foglio presenze all'incrocio tra la
--    riga e la colonna di quella persona in quel giorno.»
--
-- Fino a oggi l'assenza a giornata intera si scriveva DENTRO il
-- rapportino di un cantiere: «Rossi · 0 ore · Ferie» sulla scheda di
-- Mazzotta. Tre difetti:
--
--   1. Rossi risultava sul rapportino di un cantiere dove non aveva
--      messo piede.
--   2. Due tecnici potevano segnarlo ognuno sul suo cantiere, e
--      l'assenza contava due volte.
--   3. Una riga scritta col motivo ma senza ore di assenza, nel Foglio
--      presenze, spariva: al suo posto il trattino di «non e' arrivato
--      niente».
--
--
-- LA REGOLA NUOVA
--
--   · L'assenza a giornata intera sta in `assenze`: una riga per
--     persona e giorno, col motivo. Il vincolo unico impedisce di
--     contarla due volte.
--   · La SCRIVE IL TECNICO, nella sua giornata, prima dell'invio. E' lui
--     che fa i rapportini di tutti i cantieri per tutti i giorni; se e'
--     lui a mancare, qualcuno compila con la SUA utenza. Non esiste un
--     secondo flusso per l'amministrazione (utente, 2026-09-23).
--   · Chi e' assente quel giorno NON PUO' stare su nessun rapportino di
--     quel giorno, e viceversa. Il blocco e' un trigger, cosi' vale
--     anche per chi chiama l'API direttamente.
--   · Il PERMESSO DI POCHE ORE resta sulla riga del rapportino: «6 ore
--     in cantiere + 2 di permesso» e' la stessa persona, sullo stesso
--     cantiere, nella stessa giornata. Cio' che sparisce dai rapportini
--     e' solo la riga con motivo e ZERO ore lavorate.
--
--
-- NIENTE STATO PROPRIO, come `giustificazioni_ore`: l'assenza viaggia
-- con la giornata. Si scrive finche' la giornata e' aperta, parte con
-- l'invio, e il Foglio presenze la mostra quando il titolare ha
-- validato la giornata. Una terza macchina a stati — dopo rapportini e
-- ore personali — sarebbe stata un terzo posto dove le cose possono
-- divergere.
-- =====================================================================


-- =====================================================================
-- 0. PRIMA DI TUTTO: cosa c'e' oggi (sola lettura, non cambia niente)
--
-- Le assenze a giornata intera scritte dentro i rapportini: sono le
-- righe che il blocco 4 spostera'. Guardale prima, cosi' dopo si puo'
-- controllare che siano arrivate tutte.
-- =====================================================================
select
  r.data,
  d.cognome || ' ' || d.nome as persona,
  o.tipo_assenza            as motivo,
  o.note                    as nota,
  c.codice                  as cantiere,
  r.stato                   as stato_rapportino
from public.rapportino_ore o
join public.rapportini  r on r.id = o.rapportino_id
join public.dipendenti  d on d.id = o.dipendente_id
left join public.cantieri c on c.id = r.cantiere_id
where o.tipo_assenza is not null
  and o.ore_ordinarie + o.ore_straordinarie = 0
order by r.data, persona;


-- =====================================================================
-- 1. LA TABELLA
-- =====================================================================
create table if not exists public.assenze (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  data          date not null,

  -- Testo e non un enum, e con gli STESSI valori che il modulo del
  -- rapportino usava per `tipo_assenza`: le assenze spostate dai
  -- rapportini ci entrano cosi' come sono, e il Foglio presenze le
  -- abbrevia allo stesso modo (FER, MAL, PER...).
  motivo text not null
    check (motivo in ('Ferie', 'Permesso', 'Malattia', 'Infortunio', 'Congedo', 'Altro')),

  -- La spiegazione, obbligatoria con «Altro»: un «Altro» e basta non
  -- dice niente piu' di una riga vuota, e in busta finirebbe la voce
  -- sbagliata. Stessa regola di `giustificazioni_ore`.
  nota text,

  scritta_da uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una sola assenza per persona e giorno: e' il difetto 2 qui sopra.
  constraint assenze_una_per_giorno unique (dipendente_id, data),

  constraint assenze_altro_spiegato
    check (motivo <> 'Altro' or (nota is not null and btrim(nota) <> ''))
);

create index if not exists assenze_giorno_idx on public.assenze (org_id, data);

comment on table public.assenze is
  'Le assenze a giornata intera: una riga per persona e giorno, scritta dal tecnico nella sua giornata. Chi e assente non puo stare su nessun rapportino di quel giorno. Il permesso di poche ore resta invece sulla riga del rapportino.';

alter table public.assenze enable row level security;


-- =====================================================================
-- 2. CHI PUO' FARE COSA
--
-- La giornata e' «chiusa» appena il titolare ha validato anche solo una
-- scheda di quel giorno: da li' le assenze non si toccano piu', come le
-- giustificazioni.
-- =====================================================================
create or replace function app.giornata_validata(p_org uuid, p_giorno date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.rapportini r
    where r.org_id = p_org
      and r.data = p_giorno
      and r.stato in ('validato', 'contabilizzato')
  );
$fn$;

-- Leggere: chi compila, chi valida, chi fa le paghe.
drop policy if exists assenze_select on public.assenze;
create policy assenze_select on public.assenze
  for select using (
    app.has_perm(org_id, 'rapportini.create')
    or app.has_perm(org_id, 'rapportini.validate')
    or app.has_perm(org_id, 'rapportini.read_all')
    or app.has_perm(org_id, 'paghe.read')
  );

-- Scrivere: chi compila i rapportini, cioe' il tecnico. Nessun altro.
drop policy if exists assenze_insert on public.assenze;
create policy assenze_insert on public.assenze
  for insert with check (
    app.has_perm(org_id, 'rapportini.create')
    and scritta_da = auth.uid()
    and not app.giornata_validata(org_id, data)
  );

drop policy if exists assenze_update on public.assenze;
create policy assenze_update on public.assenze
  for update using (
    app.has_perm(org_id, 'rapportini.create')
    and not app.giornata_validata(org_id, data)
  )
  with check (
    app.has_perm(org_id, 'rapportini.create')
    and not app.giornata_validata(org_id, data)
  );

drop policy if exists assenze_delete on public.assenze;
create policy assenze_delete on public.assenze
  for delete using (
    app.has_perm(org_id, 'rapportini.create')
    and not app.giornata_validata(org_id, data)
  );


-- =====================================================================
-- 3. ASSENTE E IN CANTIERE NELLO STESSO GIORNO: MAI
--
-- Due trigger, uno per lato. `security definer` perche' devono vedere
-- TUTTI i rapportini del giorno, anche quelli dei cantieri di un
-- collega: il perimetro di chi scrive li nasconderebbe, e il doppione
-- passerebbe proprio quando e' su un cantiere che non si vede.
-- =====================================================================

-- 3a. Si segna assente chi ha gia' ore su un rapportino di quel giorno.
create or replace function app.assenza_senza_ore()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  chi  text;
  dove text;
begin
  select string_agg(distinct coalesce(c.codice, c.denominazione, 'un cantiere'), ', ')
    into dove
  from public.rapportino_ore o
  join public.rapportini r on r.id = o.rapportino_id
  left join public.cantieri c on c.id = r.cantiere_id
  where o.dipendente_id = new.dipendente_id
    and r.data = new.data
    -- Solo le righe con ORE LAVORATE. Una riga con motivo e zero ore e'
    -- una vecchia assenza scritta nel rapportino: e' proprio cio' che il
    -- blocco 4 sposta qui, e contarla faceva fallire lo spostamento
    -- («Mancuso e' gia' sul rapportino di 2026-002», 2026-09-23).
    and o.ore_ordinarie + o.ore_straordinarie > 0;

  if dove is not null then
    select d.cognome || ' ' || d.nome into chi
    from public.dipendenti d where d.id = new.dipendente_id;

    raise exception '% e'' gia'' sul rapportino di % in questa giornata. Toglilo da li'' prima di segnarlo assente: chi e'' assente non sta in nessun cantiere.',
      chi, dove
      using errcode = 'P0001';
  end if;

  return new;
end $fn$;

drop trigger if exists trg_assenza_senza_ore on public.assenze;
create trigger trg_assenza_senza_ore
  before insert or update of dipendente_id, data on public.assenze
  for each row execute function app.assenza_senza_ore();

-- 3b. Si mette su un rapportino chi quel giorno e' segnato assente.
create or replace function app.ore_senza_assenza()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  chi    text;
  motivo text;
begin
  select a.motivo, d.cognome || ' ' || d.nome
    into motivo, chi
  from public.assenze a
  join public.rapportini r on r.id = new.rapportino_id
  join public.dipendenti d on d.id = a.dipendente_id
  where a.dipendente_id = new.dipendente_id
    and a.data = r.data;

  if motivo is not null then
    raise exception '% quel giorno e'' segnato assente (%). Chi e'' assente non va su nessun rapportino: se invece ha lavorato, togli prima l''assenza dalla giornata.',
      chi, lower(motivo)
      using errcode = 'P0001';
  end if;

  return new;
end $fn$;

drop trigger if exists trg_ore_senza_assenza on public.rapportino_ore;
create trigger trg_ore_senza_assenza
  before insert or update of dipendente_id, rapportino_id on public.rapportino_ore
  for each row execute function app.ore_senza_assenza();


-- =====================================================================
-- 4. LO SPOSTAMENTO: dalle righe dei rapportini alla tabella nuova
--
-- In una transazione sola: o si sposta tutto, o niente.
--
-- Se la stessa persona era segnata assente su due cantieri lo stesso
-- giorno — il difetto 2 — entra UNA riga sola, la prima scritta.
--
-- Una scheda che conteneva SOLO assenze resta senza righe: vuol dire
-- che su quel cantiere quel giorno non ha lavorato nessuno, e diventa
-- «nessuna attivita'» — che e' esattamente cio' che era.
-- =====================================================================
begin;

insert into public.assenze (org_id, dipendente_id, data, motivo, nota, scritta_da, created_at)
select distinct on (o.dipendente_id, r.data)
  o.org_id,
  o.dipendente_id,
  r.data,
  -- Un motivo fuori elenco (scritto a mano prima che l'elenco fosse
  -- chiuso) diventa «Altro», con il testo originale nella nota.
  case when o.tipo_assenza in ('Ferie', 'Permesso', 'Malattia', 'Infortunio', 'Congedo', 'Altro')
       then o.tipo_assenza else 'Altro' end,
  case
    when o.tipo_assenza in ('Ferie', 'Permesso', 'Malattia', 'Infortunio', 'Congedo') then null
    when o.tipo_assenza = 'Altro' then coalesce(nullif(btrim(o.note), ''), 'Motivo non specificato')
    else o.tipo_assenza
  end,
  r.compilato_da,
  r.created_at
from public.rapportino_ore o
join public.rapportini r on r.id = o.rapportino_id
where o.tipo_assenza is not null
  and o.ore_ordinarie + o.ore_straordinarie = 0
order by o.dipendente_id, r.data, r.created_at
on conflict (dipendente_id, data) do nothing;

-- Le schede che dopo lo spostamento resterebbero vuote, PRIMA di
-- togliere le righe: dopo non si saprebbe piu' quali erano.
create temporary table schede_solo_assenze on commit drop as
select r.id
from public.rapportini r
where exists (
    select 1 from public.rapportino_ore o
    where o.rapportino_id = r.id
      and o.tipo_assenza is not null
      and o.ore_ordinarie + o.ore_straordinarie = 0
  )
  and not exists (
    select 1 from public.rapportino_ore o
    where o.rapportino_id = r.id
      and not (o.tipo_assenza is not null and o.ore_ordinarie + o.ore_straordinarie = 0)
  );

delete from public.rapportino_ore o
where o.tipo_assenza is not null
  and o.ore_ordinarie + o.ore_straordinarie = 0;

update public.rapportini r
set nessuna_attivita = true
where r.id in (select id from schede_solo_assenze);

commit;

-- Controllo: deve tornare ZERO righe.
select count(*) as assenze_rimaste_nei_rapportini
from public.rapportino_ore o
where o.tipo_assenza is not null
  and o.ore_ordinarie + o.ore_straordinarie = 0;

-- E qui le assenze arrivate: confrontale con l'elenco del blocco 0.
select a.data, d.cognome || ' ' || d.nome as persona, a.motivo, a.nota
from public.assenze a
join public.dipendenti d on d.id = a.dipendente_id
order by a.data, persona;


-- =====================================================================
-- 5. DA ORA IN POI, NEI RAPPORTINI NIENTE ASSENZE A GIORNATA INTERA
--
-- Un motivo sulla riga del rapportino si accetta solo accanto a delle
-- ore lavorate: e' il permesso di poche ore. La giornata intera va in
-- `assenze`. Va DOPO lo spostamento, o le righe vecchie lo farebbero
-- fallire.
-- =====================================================================
alter table public.rapportino_ore
  drop constraint if exists rapportino_ore_niente_assenze_intere;

alter table public.rapportino_ore
  add constraint rapportino_ore_niente_assenze_intere
  check (tipo_assenza is null or ore_ordinarie + ore_straordinarie > 0);


-- =====================================================================
-- 6. L'INVIO DELLA GIORNATA IMPARA LE ASSENZE
--
-- ⚠️ RISCRITTURA INTERA di `invia_foglio_giornata`, come in
-- `nessuno-dimenticato.sql`: il corpo contiene TUTTI i controlli.
-- Cambiano due punti, segnati con «← ASSENZE»:
--
--   2. chi compila e' in ferie: la sua assenza risponde alla domanda
--      «dove sono le tue ore», come prima la riga col motivo
--   3. un operaio segnato assente e' COLLOCATO: di lui si sa qualcosa
--
-- Da qui in avanti e' QUESTO il file che definisce la funzione.
-- Rilanciare `nessuno-dimenticato.sql` toglierebbe le assenze
-- dall'invio.
-- =====================================================================
create or replace function public.invia_foglio_giornata(p_org uuid, p_giorno date)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  mancanti       integer;
  da_correggere  integer;
  inviate        integer;
  mio_dipendente uuid;
  mie_ore        numeric;
  guai           text;
  quanti         integer;
  dimenticati    text;
  quanti_fuori   integer;
begin
  -- 1. OGNI CANTIERE ASSEGNATO QUEL GIORNO HA LA SUA SCHEDA
  --
  -- Il principio (utente, 2026-09-23): «il tecnico deve rapportare SOLO
  -- quando il titolare gli assegna quel cantiere, e nelle date in cui e'
  -- stato assegnato». Quindi si contano i cantieri assegnati a CHI
  -- INVIA in quella data — `dal`/`al` di `cantiere_assegnazioni`, anche
  -- retroattivi — e gia' aperti. E' la stessa regola delle card e del
  -- calendario in home (`cantiereAtteso`): prima qui c'erano tutti gli
  -- attivi visibili oggi, e l'invio poteva chiedere schede che nessuna
  -- card mostrava.
  select count(*) into mancanti
  from public.cantieri c
  where c.org_id = p_org
    and c.stato = 'attivo'
    and (c.data_inizio is null or c.data_inizio <= p_giorno)
    and (c.data_fine_effettiva is null or c.data_fine_effettiva >= p_giorno)
    and exists (
      select 1
      from public.cantiere_assegnazioni a
      where a.cantiere_id = c.id
        and a.user_id = auth.uid()
        and a.dal <= p_giorno
        and (a.al is null or a.al >= p_giorno)
    )
    and not exists (
      select 1
      from public.rapportini r
      where r.cantiere_id = c.id
        and r.data = p_giorno
    );

  if mancanti > 0 then
    raise exception '%',
      case when mancanti = 1
        then 'Manca una scheda. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.'
        else format('Mancano %s schede. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.', mancanti)
      end
      using errcode = 'P0001';
  end if;

  -- 2. CHI COMPILA HA SCRITTO LE PROPRIE ORE (o e' assente)
  select d.id into mio_dipendente
  from public.dipendenti d
  where d.org_id = p_org
    and d.user_id = auth.uid()
  limit 1;

  if mio_dipendente is not null then
    select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
      into mie_ore
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    where o.org_id = p_org
      and r.data = p_giorno
      and o.dipendente_id = mio_dipendente;

    if mie_ore = 0 then
      select coalesce(sum(p.ore_ordinarie + p.ore_straordinarie + p.ore_assenza), 0)
        into mie_ore
      from public.ore_personali p
      where p.org_id = p_org
        and p.data = p_giorno
        and p.dipendente_id = mio_dipendente;
    end if;

    -- ← ASSENZE: chi compila e' segnato assente. Succede quando e' lui
    -- a mancare e qualcuno manda la giornata con la sua utenza.
    if mie_ore = 0 and exists (
      select 1 from public.assenze a
      where a.org_id = p_org
        and a.data = p_giorno
        and a.dipendente_id = mio_dipendente
    ) then
      mie_ore := 8;
    end if;

    if mie_ore = 0 then
      raise exception 'Mancano le tue ore di oggi. Compilale in «Le mie ore», oppure aggiungiti alla squadra del cantiere dove hai lavorato: una giornata senza chi l''ha scritta non e'' la giornata.'
        using errcode = 'P0001';
    end if;
  end if;

  -- 3. NESSUN OPERAIO E' RIMASTO FUORI
  select
    string_agg(format('· %s', (d.cognome || ' ' || d.nome)), E'\n' order by d.cognome, d.nome),
    count(*)
  into dimenticati, quanti_fuori
  from public.dipendenti d
  where d.org_id = p_org
    and d.attivo
    and d.tipo = 'operaio'
    and (d.data_assunzione is null or d.data_assunzione <= p_giorno)
    and (d.data_cessazione is null or d.data_cessazione >= p_giorno)
    and not exists (
      select 1
      from public.rapportino_ore o
      join public.rapportini r on r.id = o.rapportino_id
      where o.org_id = p_org
        and r.data = p_giorno
        and o.dipendente_id = d.id
        and (o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza) > 0
    )
    and not exists (
      select 1
      from public.giustificazioni_ore g
      where g.org_id = p_org
        and g.data = p_giorno
        and g.dipendente_id = d.id
    )
    -- ← ASSENZE: segnato assente con il motivo, quindi collocato.
    and not exists (
      select 1
      from public.assenze a
      where a.org_id = p_org
        and a.data = p_giorno
        and a.dipendente_id = d.id
    );

  if quanti_fuori > 0 then
    raise exception '%',
      format(
        E'%s\n\n%s\n\nOgni operaio in forza deve avere una collocazione: le ore del cantiere dove ha lavorato, oppure l''assenza col suo motivo (ferie, permesso, malattia) nel riquadro «Assenti» della giornata.',
        case when quanti_fuori = 1
          then 'Una persona non e'' su nessuna scheda.'
          else format('%s persone non sono su nessuna scheda.', quanti_fuori)
        end,
        dimenticati
      )
      using errcode = 'P0001';
  end if;

  -- 4. IL CONTROLLO DELLE 8 ORE
  select
    string_agg(
      format('· %s: %s%s',
        g.nominativo,
        case
          when g.ore_ordinarie > 8 then
            format('%s oltre le 8 da dichiarare come straordinario',
                   public.ore_in_lettere(g.ore_ordinarie - 8))
          else
            format('%s in meno delle 8, segna il motivo (permesso, malattia, ferie)',
                   public.ore_in_lettere(8 - (g.ore_ordinarie + g.ore_assenza)))
        end,
        case
          when (g.ore_ordinarie + g.ore_straordinarie) - g.ore_visibili > 0 then
            format(' (%s su cantieri non tuoi: sentile con chi li segue)',
                   public.ore_in_lettere((g.ore_ordinarie + g.ore_straordinarie) - g.ore_visibili))
          else ''
        end
      ),
      E'\n' order by g.nominativo
    ),
    count(*)
  into guai, quanti
  from public.ore_giornata(p_org, p_giorno) g
  where
    not exists (
      select 1
      from public.giustificazioni_ore gi
      where gi.org_id = p_org
        and gi.data = p_giorno
        and gi.dipendente_id = g.dipendente_id
    )
    and (
      g.ore_ordinarie > 8
      or (
        g.ore_ordinarie + g.ore_assenza < 8
        and not (g.assenze is not null and g.ore_assenza = 0)
      )
    );

  if quanti > 0 then
    raise exception '%',
      format(
        E'%s\n\n%s\n\nIl conto e'' sulla persona e sulla giornata, su tutti i cantieri: non sul singolo rapportino. Sistema le ore, oppure scrivi il motivo dal riquadro «Controllo delle ore» in home.',
        case when quanti = 1
          then 'Le ore di una persona non tornano.'
          else format('Le ore di %s persone non tornano.', quanti)
        end,
        guai
      )
      using errcode = 'P0001';
  end if;

  -- 5. NIENTE SCHEDE RESPINTE, POI SI MANDA
  select count(*) into da_correggere
  from public.rapportini r
  where r.org_id = p_org
    and r.data = p_giorno
    and r.stato = 'respinto';

  if da_correggere > 0 then
    raise exception '%',
      case when da_correggere = 1
        then 'Una scheda e'' tornata indietro da correggere. Sistemala prima di rimandare la giornata.'
        else format('%s schede sono tornate indietro da correggere. Sistemale prima di rimandare la giornata.', da_correggere)
      end
      using errcode = 'P0001';
  end if;

  update public.rapportini r
  set stato = 'inviato',
      inviato_at = now()
  where r.org_id = p_org
    and r.data = p_giorno
    and r.stato = 'bozza';

  get diagnostics inviate = row_count;
  return inviate;
end;
$fn$;

revoke all on function public.invia_foglio_giornata(uuid, date) from public;
grant execute on function public.invia_foglio_giornata(uuid, date) to authenticated;

comment on function public.invia_foglio_giornata(uuid, date) is
  'Invia al titolare tutte le bozze di una giornata, dopo cinque controlli in fila: ogni cantiere attivo ha la sua scheda, chi compila ha scritto le proprie ore (o e assente), nessun operaio in forza e rimasto fuori (ore, assenza o giustificazione), le ore di ognuno tornano a otto, nessuna scheda e ancora da correggere. Definita in assenze.sql.';


-- =====================================================================
-- 7. ADESSO: riesegui `ore-griglia.sql` per intero.
-- =====================================================================


-- =====================================================================
-- 8. IL TECNICO SEGNA SOLO GLI OPERAI, E SE STESSO  (2026-09-23)
--
-- «Togli al tecnico di segnare l'eventuale assenza di Stefania, che non
-- e' una cosa giusta assolutamente! Ogni impiegato si segna le proprie
-- ore e mai viceversa» (utente).
--
-- Chi ha un foglio personale — impiegati, altri tecnici — le sue
-- assenze le dichiara li'. Il tecnico puo' segnare:
--   · gli OPERAI, di cui fa i rapportini;
--   · SE STESSO, per il giorno in cui e' lui a mancare e qualcuno
--     compila con la sua utenza.
--
-- Si riscrive la sola policy di insert, e quella di update, perche' un
-- update potrebbe spostare la riga su un'altra persona. Rieseguibile.
-- =====================================================================
create or replace function app.assenza_segnabile(p_dipendente uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.dipendenti d
    where d.id = p_dipendente
      and (d.tipo = 'operaio' or d.user_id = auth.uid())
  );
$fn$;

drop policy if exists assenze_insert on public.assenze;
create policy assenze_insert on public.assenze
  for insert with check (
    app.has_perm(org_id, 'rapportini.create')
    and scritta_da = auth.uid()
    and not app.giornata_validata(org_id, data)
    and app.assenza_segnabile(dipendente_id)
  );

drop policy if exists assenze_update on public.assenze;
create policy assenze_update on public.assenze
  for update using (
    app.has_perm(org_id, 'rapportini.create')
    and not app.giornata_validata(org_id, data)
  )
  with check (
    app.has_perm(org_id, 'rapportini.create')
    and not app.giornata_validata(org_id, data)
    and app.assenza_segnabile(dipendente_id)
  );

-- Controllo: assenze gia' scritte su persone che non sono operai. Se
-- torna qualcosa, dimmelo: vanno spostate nel foglio personale di chi.
select a.data, d.cognome || ' ' || d.nome as persona, d.tipo, a.motivo
from public.assenze a
join public.dipendenti d on d.id = a.dipendente_id
where d.tipo <> 'operaio';
