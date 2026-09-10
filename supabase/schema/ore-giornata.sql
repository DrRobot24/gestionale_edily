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
-- Fa due cose: aggiunge la colonna `ore_assenza` a `rapportino_ore`, e
-- crea la funzione. In quest'ordine, perche' la seconda legge la prima.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare tutte le volte che si
-- vuole: la colonna e' `if not exists`, il vincolo si toglie prima di
-- rimetterlo, la funzione si droppa prima di ricrearla.
-- =====================================================================


-- 1. LA COLONNA `ore_assenza`
--
-- Finora una persona era o presente con le ore, o assente con un motivo
-- e zero ore. Un permesso di 2 ore in mezzo a una giornata lavorata non
-- si poteva scrivere, e senza quello il ramo «sotto le 8, segna il
-- motivo» sarebbe un avviso senza rimedio.
--
-- Una colonna e non due righe per la stessa persona: resta una riga per
-- persona per scheda, la somma non deve indovinare niente, e non serve
-- verificare vincoli di unicità che oggi potrebbero impedirlo.
--
-- `not null default 0` così le righe che ci sono già restano valide
-- senza toccarle. DATABASE CONDIVISO: si aggiunge e basta, nessuna
-- colonna esistente cambia, le query di wbs-office continuano identiche.
--
-- Le righe vecchie NON si riscrivono. Una riga con `tipo_assenza` e zero
-- ovunque è un'assenza a giornata scritta prima che questa colonna
-- esistesse: metterle 8 d'ufficio vorrebbe dire inventare un dato. Il
-- controllo le riconosce e le lascia stare.

alter table public.rapportino_ore
  add column if not exists ore_assenza numeric(5,2) not null default 0;

alter table public.rapportino_ore
  drop constraint if exists rapportino_ore_ore_assenza_valide;

alter table public.rapportino_ore
  add constraint rapportino_ore_ore_assenza_valide
  check (ore_assenza >= 0 and ore_assenza <= 24);

comment on column public.rapportino_ore.ore_assenza is
  'Quante delle ore della giornata sono coperte dal motivo in `tipo_assenza`. Zero con `tipo_assenza` valorizzato = assenza a giornata intera (righe scritte prima che questa colonna esistesse).';


-- 2. LA FUNZIONE
--
-- Il tipo restituito cambia rispetto alla prima stesura, e `create or
-- replace` non sa cambiare il tipo di ritorno di una funzione che
-- esiste: va tolta prima.
drop function if exists public.ore_giornata(uuid, date);

create or replace function public.ore_giornata(p_org uuid, p_giorno date)
returns table (
  dipendente_id     uuid,
  nominativo        text,
  ore_ordinarie     numeric,
  ore_straordinarie numeric,
  ore_assenza       numeric,
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
    -- Le ore coperte da un motivo: permesso, malattia, ferie. Sommate
    -- alle ordinarie devono arrivare a otto, ed e' proprio questa
    -- colonna a rendere rispondibile la domanda «perche' meno di otto».
    coalesce(sum(o.ore_assenza), 0)::numeric,
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
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rapportino_ore'
  and column_name like 'ore_%'
order by column_name;

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
