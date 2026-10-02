-- =====================================================================
-- TICKET ANCHE FRA TITOLARE E AMMINISTRAZIONE; IL RIEPILOGO FIRMATO NON
-- SI RIAPRE PIU'
--
-- Dall'utente il 2026-10-02, subito dopo i ticket col tecnico: «e'
-- importante questa funzione anche per il flusso tra amministrazione e
-- titolare, che costituisce il secondo validamento definitivo sempre del
-- titolare. Quindi per evitare di respingere il foglio delle paghe a
-- Stefania e poi lei lo rimanda e via cosi' all'infinito, apriamo la
-- possibilita' di mandare ticket tra di loro, cosi' quando il titolare
-- valida non si torna piu' indietro e tutto va in archivio, quindi fa
-- storico».
--
-- ── 1. CHI SCRIVE A CHI ─────────────────────────────────────────────
-- Tre lati, due coppie:
--   chi valida  (rapportini.validate)           ↔ chi compila (rapportini.create)
--   chi valida                                   ↔ chi fa le paghe (paghe.read senza validate)
-- «Chi fa le paghe» e' la stessa definizione della home (`faLePaghe` in
-- Dashboard.tsx): il titolare ha anche paghe.read, ma e' dall'altra parte.
-- Tecnico e amministrazione NON si scrivono fra loro: non e' stato
-- chiesto.
--
-- ── 2. IL RIEPILOGO FIRMATO E' DEFINITIVO ───────────────────────────
-- Come per i rapportini: si discute PRIMA (ticket), si rimanda indietro
-- se serve PRIMA della firma (`decidi_paghe` con valida = false, resta),
-- e dopo la firma e' archivio. `riapri_paghe` non si esegue piu':
-- tolto il permesso, la funzione resta nel database. Qui, a differenza
-- dei rapportini, si chiude anche nel database: la funzione e' solo del
-- gestionale, wbs-office non la usa.
--
-- Per ridare la possibilita' (un caso eccezionale, deciso dall'utente):
--   grant execute on function public.riapri_paghe(uuid, integer, integer, text) to authenticated;
--
-- ⚠️ `ticket.sql` e' stato aggiornato allo stesso modo: rilanciarlo non
-- torna indietro. `riepilogo-economico.sql` invece ridarebbe il permesso
-- a `riapri_paghe`: se si rilancia, dopo va rilanciato questo.
--
-- NON e' una migration della CLI: si esegue a mano nel SQL Editor, tutto
-- insieme. Si puo' rilanciare senza danno.
-- =====================================================================


-- ── 1. A CHI SI PUO' SCRIVERE ───────────────────────────────────────

create or replace function public.ticket_persone(p_org uuid)
returns table (user_id uuid, nome text, destinatario boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with io as (
    select app.has_perm(p_org, 'rapportini.validate') as valida,
           app.has_perm(p_org, 'rapportini.create')   as compila,
           app.has_perm(p_org, 'paghe.read')
             and not app.has_perm(p_org, 'rapportini.validate') as paghe
  ),
  membri as (
    select
      m.user_id,
      coalesce(nullif(btrim(p.full_name), ''), p.email, 'Utente senza nome') as nome,
      exists (select 1 from public.role_permissions rp
              where rp.ruolo = m.ruolo and rp.permission = 'rapportini.validate') as valida,
      exists (select 1 from public.role_permissions rp
              where rp.ruolo = m.ruolo and rp.permission = 'rapportini.create') as compila,
      exists (select 1 from public.role_permissions rp
              where rp.ruolo = m.ruolo and rp.permission = 'paghe.read') as legge_paghe
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    where m.org_id = p_org
      and m.attivo
      and app.is_member(p_org)
  )
  select
    x.user_id,
    x.nome,
    x.user_id <> auth.uid() and (
      -- Io valido: scrivo a chi compila e a chi fa le paghe.
      ((select valida from io) and (x.compila or (x.legge_paghe and not x.valida)))
      or
      -- Io compilo o faccio le paghe: scrivo a chi valida.
      (((select compila from io) or (select paghe from io)) and x.valida)
    ) as destinatario
  from membri x;
$$;

revoke all on function public.ticket_persone(uuid) from public, anon;
grant execute on function public.ticket_persone(uuid) to authenticated;


-- Apre un ticket anche chi fa le paghe. A chi, lo decide `ticket_nasce`
-- con la funzione qui sopra.
drop policy if exists ticket_insert on public.ticket;
create policy ticket_insert on public.ticket
  for insert with check (
    app.is_member(org_id)
    and (
      app.has_perm(org_id, 'rapportini.validate')
      or app.has_perm(org_id, 'rapportini.create')
      or app.has_perm(org_id, 'paghe.read')
    )
  );


-- ── 2. IL RIEPILOGO FIRMATO NON SI RIAPRE ───────────────────────────

-- Anche da `public` e `anon`: in Postgres una funzione e' eseguibile da
-- tutti finche' non lo si toglie, e il permesso arriverebbe da li'.
revoke execute on function public.riapri_paghe(uuid, integer, integer, text)
  from public, anon, authenticated;


-- ── VERIFICA ────────────────────────────────────────────────────────
-- Devono uscire: la policy di inserimento che nomina paghe.read (true),
-- e riapri_paghe non piu' eseguibile (false).
select 'insert con paghe.read' as cosa,
       (select qual is null and with_check like '%paghe.read%'
        from pg_policies
        where schemaname = 'public' and tablename = 'ticket' and policyname = 'ticket_insert')::text as esito
union all
select 'riapri_paghe eseguibile',
       has_function_privilege('authenticated', 'public.riapri_paghe(uuid, integer, integer, text)', 'execute')::text;
