-- =====================================================================
-- `ore_giornata()`: il controllo delle 8 ore, per persona e per giorno
--
-- Il metro sono le 8 ore del contratto italiano, e il conto va fatto
-- sulla PERSONA e sul GIORNO, non sul singolo rapportino. Se Mario Rossi
-- ha 4 ore sul cantiere X, 2 sul Y e 3 sul Z, il totale e' 9: l'ora in
-- piu' e' straordinario e va detto in quale cantiere e' stata fatta.
--
-- PERCHE' UNA FUNZIONE E NON UNA QUERY DAL BROWSER
--
-- La vista `v_ore_giornaliere` avrebbe gia' tutto: una riga per
-- dipendente, cantiere e giorno. Ma e' `security_invoker=on` (verificato
-- il 2026-09-10 su tutte e sette le viste), quindi mostra a chi la legge
-- solo i cantieri del suo perimetro.
--
-- E il perimetro del gestionale e' per ASSEGNAZIONE: un tecnico non vede
-- i cantieri di un collega. Quindi sommare nel browser darebbe 4 invece
-- di 9, senza nessun errore, senza nessun avviso. Un conto sbagliato che
-- si presenta come giusto e' peggio di un conto che manca.
--
-- COSA QUESTA FUNZIONE RIVELA, E COSA NO
--
-- Restituisce l'AGGREGATO per persona: quante ore ha fatto Mario oggi in
-- tutta l'impresa. Non restituisce su QUALI cantieri. Chi guarda vede il
-- dettaglio solo dei cantieri suoi (colonna `ore_visibili`) e per il
-- resto legge «altri cantieri: 5 ore».
--
-- E' la riga giusta dove tagliare: il totale di giornata di un collega
-- serve a chi compila e non e' un segreto dentro la stessa impresa; la
-- mappa di chi lavora dove, invece, e' esattamente cio' che il perimetro
-- per assegnazione tiene separato.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare: e' `create or replace`.
-- =====================================================================


create or replace function public.ore_giornata(p_org uuid, p_giorno date)
returns table (
  dipendente_id     uuid,
  nominativo        text,
  ore_ordinarie     numeric,
  ore_straordinarie numeric,
  ore_visibili      numeric,
  assenze           text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Il cancello sta qui, e va prima di tutto il resto.
  --
  -- `security definer` vuol dire che la RLS non guarda piu' niente:
  -- il controllo che la RLS avrebbe fatto va rifatto a mano, e se lo si
  -- dimentica la funzione diventa una porta aperta sui dati di ogni
  -- impresa del database. `app.has_perm` risponde solo per le
  -- organizzazioni di cui chi chiama e' membro, quindi verifica insieme
  -- l'appartenenza e il requisito.
  if not (
    app.has_perm(p_org, 'rapportini.create')
    or app.has_perm(p_org, 'rapportini.read_all')
    or app.has_perm(p_org, 'rapportini.validate')
  ) then
    raise exception 'Non hai i requisiti per leggere le ore di questa giornata.'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    (d.cognome || ' ' || d.nome)::text,
    coalesce(sum(o.ore_ordinarie), 0)::numeric,
    coalesce(sum(o.ore_straordinarie), 0)::numeric,
    -- Le ore che chi chiama puo' gia' vedere da solo. La differenza col
    -- totale e' quanto sta fuori dal suo perimetro, e si racconta senza
    -- dire dove.
    coalesce(sum(
      case when app.puo_vedere_cantiere(r.cantiere_id)
           then o.ore_ordinarie + o.ore_straordinarie
           else 0 end
    ), 0)::numeric,
    -- I motivi di assenza del giorno, uniti. `string_agg` salta i null,
    -- quindi chi ha lavorato e basta esce con `assenze` a null.
    string_agg(distinct o.tipo_assenza, ', ')
  from public.rapportino_ore o
  join public.rapportini r on r.id = o.rapportino_id
  join public.dipendenti d on d.id = o.dipendente_id
  where o.org_id = p_org
    and r.data = p_giorno
  group by d.id, d.cognome, d.nome
  order by d.cognome, d.nome;
end;
$fn$;

comment on function public.ore_giornata(uuid, date) is
  'Ore per persona su una giornata solare, sommate su TUTTI i cantieri dell''impresa. Security definer di proposito: il perimetro per assegnazione renderebbe il totale incompleto. Restituisce solo l''aggregato, mai su quali cantieri.';

revoke all on function public.ore_giornata(uuid, date) from public;
grant execute on function public.ore_giornata(uuid, date) to authenticated;


-- VERIFICA
-- Deve dire `security definer`, e comparire fra le funzioni eseguibili
-- da `authenticated`.
select p.proname,
       case when p.prosecdef then 'security definer' else 'security invoker' end as modo,
       pg_get_function_identity_arguments(p.oid) as argomenti
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ore_giornata';

-- PROVA DAL VIVO
-- Come tecnico@cassia.com, sostituendo l'id dell'impresa:
--   select * from public.ore_giornata('...'::uuid, current_date);
-- Chi non e' membro dell'impresa deve prendere un 42501.
