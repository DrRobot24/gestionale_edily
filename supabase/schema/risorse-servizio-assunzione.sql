-- =====================================================================
-- RISORSE: la messa in servizio decide chi esiste, l'assunzione ci sta
-- dentro
--
-- Il principio, detto dall'utente il 2026-09-25:
--
--   «La messa in servizio e' il requisito fondamentale affinche' una
--   risorsa sia disponibile e spunti nelle anagrafiche; poi l'assunzione
--   e' una messa in servizio ancora piu' profonda, perche' sancisce
--   l'arrivo di un contratto. In servizio la risorsa si vede e si usa in
--   cantiere o in ufficio, ma di solito si fa perche' si e' in prova
--   oppure per un determinato periodo per un progetto: l'assunzione non
--   e' necessaria.» Si puo' essere in servizio senza essere assunti, non
--   il contrario. E l'assunzione dice con quale azienda.
--
--   NON «impiegato»: la parola la usa gia' il tipo di risorsa
--   (operaio / tecnico / impiegato) e le due cose si confonderebbero.
--
-- ── LE COLONNE, E I NOMI IN PAGINA ──────────────────────────────────
--   data_impiego      → «In servizio dal»   (gia' esistente)
--   data_cessazione   → «Fine servizio»     (gia' esistente)
--   data_assunzione   → «Assunto dal»       (gia' esistente)
--   azienda_assunzione → «Assunto con»      (NUOVA, testo libero per
--                        ora; diventera' una tabella di ditte)
-- Le colonne non si rinominano: le legge anche wbs-office.
--
-- ── COSA C'ERA GIA' ─────────────────────────────────────────────────
-- Il check `dipendenti_impiego_prima_di_assunzione` (l'assunzione non
-- comincia prima del servizio) e un trigger che riempie il servizio con
-- la data di assunzione quando manca. Qui si chiude il periodo anche
-- dall'altro lato.
--
-- LA VISIBILITA' NON E' NELLA RLS, ed e' voluto. Nascondere chi non e'
-- in servizio con la RLS lo toglierebbe anche dallo storico: il foglio
-- presenze di marzo, le paghe, i rapportini firmati parlano di persone
-- che oggi magari non ci sono piu', e devono continuare a chiamarle per
-- nome. La regola vale per gli ELENCHI DA CUI SI SCEGLIE (anagrafica,
-- squadre, assenti), e la applica il frontend.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare.
-- =====================================================================


-- ── 0. PRIMA DI TUTTO: CI SONO RIGHE FUORI REGOLA? ───────────────────
-- I vincoli qui sotto verrebbero rifiutati da Postgres se una riga gia'
-- scritta li violasse. Meglio fermarsi prima e dire chi, che fallire con
-- un 23514 che non nomina nessuno.

do $$
declare
  fuori text;
begin
  select string_agg(format('%s %s (servizio dal %s, assunto dal %s, fine %s)',
                           cognome, nome, data_impiego, data_assunzione, data_cessazione), '; ')
  into fuori
  from public.dipendenti
  where data_cessazione is not null
    and (
      (data_impiego is not null and data_cessazione < data_impiego)
      or (data_assunzione is not null and data_cessazione < data_assunzione)
    );

  if fuori is not null then
    raise exception 'Queste risorse hanno la fine servizio prima dell''inizio o dell''assunzione, correggile a mano e rilancia: %', fuori
      using errcode = 'P0001';
  end if;
end $$;


-- ── 1. LE DATE DI MESSA IN SERVIZIO CHE MANCANO ─────────────────────
-- Al 2026-09-25 quasi nessuno ce l'ha: senza, appena la regola si
-- accende il tecnico non trova piu' nessuno nella squadra.
--
-- Si riempie con il PRIMO GIORNO IN CUI LA PERSONA RISULTA AVER
-- LAVORATO, in un rapportino o nelle ore personali. Non e' una stima: se
-- ha lavorato, era in servizio. Puo' essere piu' tardi della data vera
-- (il gestionale e' partito a meta' settembre), e Stefania la anticipa
-- dalla scheda quando la conosce. Deciso con l'utente il 2026-09-25.
--
-- Solo dove manca: una data gia' scritta a mano non si tocca.

with primo as (
  select dipendente_id, min(giorno) as giorno
  from (
    select ro.dipendente_id, r.data as giorno
    from public.rapportino_ore ro
    join public.rapportini r on r.id = ro.rapportino_id
    union all
    select op.dipendente_id, op.data
    from public.ore_personali op
  ) t
  group by dipendente_id
)
update public.dipendenti d
set data_impiego = p.giorno
from primo p
where p.dipendente_id = d.id
  and d.data_impiego is null
  -- Il check esistente vuole il servizio non dopo l'assunzione.
  and (d.data_assunzione is null or p.giorno <= d.data_assunzione);


-- ── 2. IL PERIODO DI SERVIZIO SI CHIUDE DA TUTTI E DUE I LATI ────────

comment on column public.dipendenti.data_impiego is
  'Messa in servizio («In servizio dal»). Requisito per comparire negli elenchi da cui si sceglie. Puo'' precedere data_assunzione, mai seguirla.';

comment on column public.dipendenti.data_cessazione is
  'Fine del servizio. NULL = in servizio senza scadenza.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendenti_fine_dopo_impiego'
      and conrelid = 'public.dipendenti'::regclass
  ) then
    alter table public.dipendenti
      add constraint dipendenti_fine_dopo_impiego
      check (data_cessazione is null or data_impiego is null
             or data_cessazione >= data_impiego);
  end if;

  -- L'assunzione sta DENTRO il servizio: non comincia dopo la fine.
  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendenti_assunzione_prima_della_fine'
      and conrelid = 'public.dipendenti'::regclass
  ) then
    alter table public.dipendenti
      add constraint dipendenti_assunzione_prima_della_fine
      check (data_cessazione is null or data_assunzione is null
             or data_assunzione <= data_cessazione);
  end if;
end $$;


-- ── 3. L'AZIENDA DELL'ASSUNZIONE ────────────────────────────────────
-- Nullable e senza check: le schede gia' segnate «assunto» non ce
-- l'hanno, e un vincolo le renderebbe impossibili da salvare anche per
-- correggere un numero di telefono. La chiede il modulo, quando si
-- spunta l'assunzione.

alter table public.dipendenti
  add column if not exists azienda_assunzione text;

comment on column public.dipendenti.azienda_assunzione is
  'Con quale azienda e'' assunta la risorsa. Testo libero (2026-09-25); in futuro un riferimento a una tabella di ditte.';


-- ── 4. VERIFICA ─────────────────────────────────────────────────────

-- La colonna nuova.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'dipendenti'
  and column_name = 'azienda_assunzione';

-- I tre vincoli sulle date: devono uscire tutti e tre.
select conname
from pg_constraint
where conrelid = 'public.dipendenti'::regclass
  and conname in ('dipendenti_impiego_prima_di_assunzione',
                  'dipendenti_fine_dopo_impiego',
                  'dipendenti_assunzione_prima_della_fine')
order by conname;

-- CHI OGGI NON E' IN SERVIZIO, cioe' chi sparira' dagli elenchi: senza
-- data di messa in servizio, o con la fine gia' passata. E' la lista da
-- passare a Stefania: a queste persone la data la scrive lei.
select cognome, nome, tipo, data_impiego as in_servizio_dal,
       data_cessazione as fine_servizio, attivo
from public.dipendenti
where data_impiego is null
   or (data_cessazione is not null and data_cessazione < current_date)
order by cognome, nome;
