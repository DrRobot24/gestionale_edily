-- =====================================================================
-- Foglio Riepilogativo di Giornata (F.R.G.)
--
-- Sostituisce l'email che oggi il tecnico manda al titolare con tutti i
-- cantieri incollati uno sotto l'altro. Il foglio non e' un documento
-- nuovo: e' l'insieme dei rapportini di quella data, inviati insieme.
--
-- Due regole nuove, entrambe qui e non nell'interfaccia:
--
--   1. Una scheda si chiude anche senza operai, dichiarando che non c'e'
--      stata attivita'. Serve un flag esplicito: un rapportino a zero ore
--      e uno compilato male oggi sono indistinguibili.
--
--   2. Il singolo rapportino non si invia piu' da solo. Si spedisce la
--      giornata intera, e solo quando OGNI cantiere attivo ha la sua
--      scheda e nessuna e' stata respinta.
--
-- La 2 in particolare vive nel database di proposito: se la regola
-- stesse solo nel frontend, basterebbe una chiamata diretta all'API per
-- mandare al titolare mezza giornata.
--
-- Da eseguire nel SQL Editor, in ordine.
-- DOPO: rigenerare i tipi (`supabase gen types typescript`), perche'
-- `nessuna_attivita` e la funzione non sono in database.types.ts.
-- =====================================================================


-- 1. LA SCHEDA SENZA ATTIVITA'
-- Il default a false lascia intatti i rapportini gia' esistenti: erano
-- tutti con attivita', altrimenti il vincolo del form non li avrebbe
-- fatti salvare.
alter table public.rapportini
  add column if not exists nessuna_attivita boolean not null default false;

comment on column public.rapportini.nessuna_attivita is
  'Il tecnico ha aperto la scheda e ha dichiarato che in questo cantiere, quel giorno, non si e'' lavorato. Diverso da un rapportino a zero ore: qui la scelta e'' esplicita.';

-- Le due cose si escludono: o ci sono ore, o non c'e' stata attivita'.
-- Un rapportino marcato "nessuna attivita'" con dentro delle ore
-- significa che qualcuno ha cambiato idea a meta' e non ha ripulito.
create or replace function app.rapportino_coerente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  righe integer;
begin
  if not new.nessuna_attivita then
    return new;
  end if;

  select count(*) into righe
  from public.rapportino_ore
  where rapportino_id = new.id;

  if righe > 0 then
    raise exception
      'Questa scheda ha % righe di ore: non puo'' essere marcata "nessuna attivita".', righe
      using errcode = 'P0001',
            hint = 'Togli le ore, oppure togli la spunta.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists rapportino_nessuna_attivita_coerente on public.rapportini;
create trigger rapportino_nessuna_attivita_coerente
before insert or update of nessuna_attivita on public.rapportini
for each row execute function app.rapportino_coerente();


-- 2. L'INVIO DELLA GIORNATA
-- Sta in `public` e non in `app` perche' PostgREST espone solo lo schema
-- pubblico: una funzione in `app` non sarebbe chiamabile con
-- supabase.rpc().
--
-- SECURITY INVOKER, non definer: gira con i privilegi di chi la chiama,
-- quindi la RLS decide quali cantieri vede e il trigger degli stati
-- controlla ogni singola transizione come se fosse stata fatta a mano.
-- Una funzione definer qui scavalcherebbe entrambi.
create or replace function public.invia_foglio_giornata(p_org uuid, p_giorno date)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  mancanti      integer;
  da_correggere integer;
  inviate       integer;
begin
  -- Cantieri attivi che quel giorno non hanno nessuna scheda. La RLS fa
  -- gia' vedere solo quelli di competenza, quindi il conto e' sul
  -- perimetro di chi chiama.
  select count(*) into mancanti
  from public.cantieri c
  where c.org_id = p_org
    and c.stato = 'attivo'
    and not exists (
      select 1
      from public.rapportini r
      where r.cantiere_id = c.id
        and r.data = p_giorno
    );

  if mancanti > 0 then
    raise exception
      'Mancano % schede. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.',
      mancanti
      using errcode = 'P0001';
  end if;

  -- Una scheda respinta e' tornata indietro dal titolare: rimandargli la
  -- giornata senza averla corretta gli ripresenta lo stesso problema.
  select count(*) into da_correggere
  from public.rapportini r
  join public.cantieri c on c.id = r.cantiere_id
  where r.org_id = p_org
    and r.data = p_giorno
    and c.stato = 'attivo'
    and r.stato = 'respinto';

  if da_correggere > 0 then
    raise exception
      '% schede sono state respinte: vanno corrette prima di rimandare la giornata.',
      da_correggere
      using errcode = 'P0001';
  end if;

  -- Solo le bozze: quelle gia' inviate o validate restano dove sono, e
  -- rilanciare l'invio non le fa tornare indietro.
  update public.rapportini r
  set stato = 'inviato',
      inviato_at = now(),
      motivo_rifiuto = null
  from public.cantieri c
  where c.id = r.cantiere_id
    and r.org_id = p_org
    and r.data = p_giorno
    and c.stato = 'attivo'
    and r.stato = 'bozza';

  get diagnostics inviate = row_count;

  if inviate = 0 then
    raise exception 'Non c''e'' niente da inviare: la giornata risulta gia'' partita.'
      using errcode = 'P0001';
  end if;

  return inviate;
end;
$fn$;

revoke all on function public.invia_foglio_giornata(uuid, date) from public;
grant execute on function public.invia_foglio_giornata(uuid, date) to authenticated;


-- 3. VERIFICA
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rapportini'
  and column_name = 'nessuna_attivita';

select p.proname, pg_get_function_identity_arguments(p.oid) as argomenti,
       case p.prosecdef when true then 'definer' else 'invoker' end as sicurezza
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'invia_foglio_giornata';


-- 4. PROVA DAL VIVO
-- Come tecnico@cassia.com, con almeno un cantiere attivo scoperto:
--
--   select public.invia_foglio_giornata(
--     '0d989cd9-d077-48f6-8ab9-6b5434229394', current_date);
--
-- Deve rispondere "Mancano N schede...". Completa tutte le schede e
-- rilancia: deve restituire il numero di rapportini spediti.
