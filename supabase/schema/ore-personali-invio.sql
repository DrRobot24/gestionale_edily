-- =====================================================================
-- Il tecnico non riusciva a INVIARE le proprie ore: manca il WITH CHECK
--
-- Trovato dall'utente il 2026-09-18, provando da tecnico: premendo
-- «invia al titolare» arrivava un 403 da PostgREST, cioe' un
-- «new row violates row-level security policy for table ore_personali».
--
-- LA CAUSA, ed e' sottile. La policy di UPDATE creata da
-- `foglio-ore-personale.sql` ha solo USING e nessun WITH CHECK. Su un
-- UPDATE le due clausole fanno lavori diversi:
--
--   USING        quali righe posso toccare — si valuta PRIMA
--   WITH CHECK   come possono risultare dopo — si valuta DOPO
--
-- E quando WITH CHECK manca, Postgres RIUSA USING per il controllo
-- finale. Qui USING dice `stato in ('bozza','respinto')`: la riga di
-- partenza passa, ma quella di arrivo ha stato `inviato` e non passa
-- piu'. L'autore poteva correggere la sua giornata quanto voleva, ma
-- non mandarla: la transizione che serve si autoescludeva.
--
-- Chi valida non se n'era accorto perche' ha `rapportini.validate`, che
-- e' il secondo ramo della policy e vale sia prima sia dopo.
--
-- IL RIMEDIO: dichiarare il WITH CHECK, e dichiararlo STRETTO.
-- L'autore puo' lasciare la riga in `bozza`, `respinto` o portarla a
-- `inviato` — e basta. `validato` resta fuori, quindi nessuno puo'
-- autovalidarsi passando dall'invio: sarebbe il difetto peggiore di
-- quello che si sta riparando.
--
-- PROVATO su un Postgres 17 usa e getta, quattro casi: bozza→inviato
-- passa, da inviato non si tocca piu', bozza→validato viene rifiutato,
-- e modificare le ore restando in bozza continua a funzionare.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare senza danno.
-- =====================================================================


drop policy if exists ore_personali_update on public.ore_personali;

create policy ore_personali_update on public.ore_personali
for update
  using (
    app.is_member(org_id)
    and (
      -- l'autore, finche' non e' partita o se gli e' tornata indietro
      (
        dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
        and stato in ('bozza', 'respinto')
      )
      -- chi valida: e' il suo mestiere, e agisce sull'inviato
      or app.has_perm(org_id, 'rapportini.validate')
    )
  )
  with check (
    app.is_member(org_id)
    and (
      -- L'AUTORE PUO' ANCHE MANDARLA, ed e' la riga che mancava. Non
      -- puo' portarla a `validato`: quello e' il mestiere di un altro,
      -- e lasciarglielo qui vorrebbe dire che chi compila si approva da
      -- solo.
      (
        dipendente_id in (select d.id from public.dipendenti d where d.user_id = auth.uid())
        and stato in ('bozza', 'respinto', 'inviato')
      )
      or app.has_perm(org_id, 'rapportini.validate')
    )
  );


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire due clausole: `qual` (USING) e `with_check`, e la
-- seconda NON dev'essere nulla — era quello il difetto.

select policyname, cmd,
       qual is not null       as ha_using,
       with_check is not null as ha_with_check
from pg_policies
where tablename = 'ore_personali' and policyname = 'ore_personali_update';

-- Poi, NELL'APP: il tecnico apre «Le mie ore», compila e preme «invia
-- al titolare». Deve partire, e la giornata deve comparire nella coda
-- di Giuseppe. Non serve rifare il login: le policy valgono subito.
