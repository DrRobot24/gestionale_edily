-- =====================================================================
-- SCHEDA RISORSA: patenti con le date, DPI con la data di consegna
--
-- Chiesto dall'utente il 2026-09-25: «il campo patente sia da flaggare
-- e dopo si inserisce il tipo di patente con le date di conseguimento
-- e/o scadenza; stesso principio per i DPI: se ne viene flaggato uno si
-- deve inserire la data di consegna. Tutte queste informazioni devono
-- rimanere nella scheda della risorsa, e quindi in archivio.»
--
-- ── COM'ERA ─────────────────────────────────────────────────────────
-- `patente text` (testo libero: «B, CQC, muletto») e `dpi text[]` (i
-- nomi dei DPI spuntati). Nessuna data: non si poteva dire quando
-- scade la CQC ne' quando sono state date le scarpe.
--
-- ── COM'E' ADESSO ───────────────────────────────────────────────────
-- Due colonne jsonb sulla riga della persona, liste di oggetti:
--
--   patenti         [{ "tipo": "CQC", "conseguita_il": "2019-03-01",
--                      "scade_il": "2029-03-01" }, ...]
--   dpi_consegnati  [{ "dpi": "Casco", "consegnato_il": "2026-09-17" }, ...]
--
-- SULLA RIGA DELLA PERSONA e non in tabelle a parte: si salvano insieme
-- alla scheda, con lo stesso pulsante, e restano con lei quando viene
-- archiviata — che e' esattamente «rimanere nella scheda, e quindi in
-- archivio». Le leggono gli stessi che leggono la scheda.
--
-- LE COLONNE VECCHIE RESTANO, e il modulo continua a riempirle: `patente`
-- con i tipi separati da virgola, `dpi` con i nomi. Chi le legge — un
-- report, wbs-office un domani — non si rompe.
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend che le
-- legge. Si puo' rilanciare.
-- =====================================================================


-- ── 1. LE COLONNE ───────────────────────────────────────────────────

alter table public.dipendenti
  add column if not exists patenti jsonb not null default '[]'::jsonb;

alter table public.dipendenti
  add column if not exists dpi_consegnati jsonb not null default '[]'::jsonb;

-- Una lista, sempre: un oggetto sciolto o una stringa al posto della
-- lista romperebbe la scheda alla prima lettura.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendenti_patenti_lista'
      and conrelid = 'public.dipendenti'::regclass
  ) then
    alter table public.dipendenti
      add constraint dipendenti_patenti_lista
      check (jsonb_typeof(patenti) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendenti_dpi_consegnati_lista'
      and conrelid = 'public.dipendenti'::regclass
  ) then
    alter table public.dipendenti
      add constraint dipendenti_dpi_consegnati_lista
      check (jsonb_typeof(dpi_consegnati) = 'array');
  end if;
end $$;

comment on column public.dipendenti.patenti is
  'Patenti e abilitazioni: [{tipo, conseguita_il, scade_il}]. Date in formato YYYY-MM-DD o null; almeno una delle due la chiede il modulo.';

comment on column public.dipendenti.dpi_consegnati is
  'DPI consegnati: [{dpi, consegnato_il}]. La data di consegna la chiede il modulo.';


-- ── 2. QUELLO CHE C'E' GIA' ─────────────────────────────────────────
-- Si ricopia, senza date — non si sanno — e senza toccare chi ha gia'
-- la colonna nuova piena. Le date mancanti le chiedera' il modulo al
-- primo salvataggio della scheda.

-- «B, CQC, muletto» → tre patenti.
update public.dipendenti d
set patenti = (
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', btrim(t), 'conseguita_il', null, 'scade_il', null)), '[]'::jsonb)
  from regexp_split_to_table(d.patente, '\s*[,;/]\s*') as t
  where btrim(t) <> ''
)
where d.patenti = '[]'::jsonb
  and d.patente is not null
  and btrim(d.patente) <> '';

update public.dipendenti d
set dpi_consegnati = (
  select coalesce(jsonb_agg(jsonb_build_object('dpi', x, 'consegnato_il', null)), '[]'::jsonb)
  from unnest(d.dpi) as x
)
where d.dpi_consegnati = '[]'::jsonb
  and cardinality(d.dpi) > 0;


-- ── 3. VERIFICA ─────────────────────────────────────────────────────
-- Le due colonne, e chi ha gia' qualcosa dentro.

select cognome, nome, patenti, dpi_consegnati
from public.dipendenti
where patenti <> '[]'::jsonb or dpi_consegnati <> '[]'::jsonb
order by cognome, nome;

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'dipendenti'
  and column_name in ('patenti', 'dpi_consegnati')
order by column_name;
