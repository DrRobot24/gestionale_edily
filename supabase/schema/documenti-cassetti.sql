-- =====================================================================
-- I DOCUMENTI DELLA PERSONA IN CASSETTI SEPARATI
--
-- L'utente, il 2026-09-29: «non confondiamo i cassetti! Tu metteresti
-- mutande e calzini insieme con le camicie e i maglioni?». I documenti
-- di identita' e il permesso di soggiorno vanno in anagrafica (il
-- riquadro «Chi e'», in cima alla scheda), lontano dai documenti di
-- lavoro: attestati, patentini, formazione, corsi.
--
-- Una colonna e non tre tabelle: il file, la scadenza, il bucket, le
-- policy e il promemoria in home sono gli stessi. Cambia solo il
-- cassetto in cui la scheda mostra il documento.
--
--   identita   carta d'identita', passaporto, tessera sanitaria
--   permesso   il permesso di soggiorno (la scadenza sta sulla scheda,
--              `dipendenti.permesso_scadenza`)
--   lavoro     attestati, patentini, formazione, corsi, visite
--
-- Da eseguire nel SQL Editor PRIMA di pubblicare il frontend. Si puo'
-- rilanciare.
-- =====================================================================


-- ── 1. LA COLONNA ───────────────────────────────────────────────────
-- Default «lavoro»: e' dove stavano tutti fino a oggi.

alter table public.dipendente_documenti
  add column if not exists categoria text not null default 'lavoro';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dipendente_documenti_categoria'
      and conrelid = 'public.dipendente_documenti'::regclass
  ) then
    alter table public.dipendente_documenti
      add constraint dipendente_documenti_categoria
      check (categoria in ('identita', 'permesso', 'lavoro'));
  end if;
end $$;

comment on column public.dipendente_documenti.categoria is
  'Il cassetto: identita (carta, passaporto, tessera sanitaria), permesso (di soggiorno), lavoro (attestati, patentini, corsi). Deciso con l''utente il 2026-09-29.';


-- ── 2. I DOCUMENTI GIA' CARICATI ────────────────────────────────────
-- Si smistano dal nome che gli ha dato Stefania. Solo quelli ancora
-- nel cassetto di partenza: uno spostato a mano dalla scheda non si
-- tocca rilanciando il file. Quello che il nome non dice resta in
-- «lavoro», e dalla scheda si sposta con «modifica».

update public.dipendente_documenti
set categoria = 'permesso'
where categoria = 'lavoro'
  and titolo ~* 'permesso\s+(di\s+)?soggiorno';

update public.dipendente_documenti
set categoria = 'identita'
where categoria = 'lavoro'
  and titolo ~* '(carta\s+d.?\s*identit|passaport|tessera\s+sanitaria|codice\s+fiscale|documento\s+d.?\s*identit)';


-- La scadenza del permesso sta sulla scheda (`permesso_scadenza`), e il
-- cassetto del permesso non ne chiede un'altra: due date per la stessa
-- cosa prima o poi dicono cose diverse, e in home scatterebbero due
-- promemoria. Quella del documento passa alla scheda se li' manca
-- (accendendo la spunta, che il check vuole insieme alla data), poi si
-- toglie dal documento.

update public.dipendenti d
set permesso_soggiorno = true,
    permesso_scadenza = x.scadenza
from (
  select dipendente_id, max(scadenza) as scadenza
  from public.dipendente_documenti
  where categoria = 'permesso' and scadenza is not null
  group by dipendente_id
) x
where x.dipendente_id = d.id
  and d.permesso_scadenza is null;

update public.dipendente_documenti
set scadenza = null
where categoria = 'permesso' and scadenza is not null;


-- ── 3. VERIFICA ─────────────────────────────────────────────────────
-- Quanti per cassetto, e i nomi: quello che e' finito nel cassetto
-- sbagliato si sposta dalla scheda.

select categoria, count(*) as quanti
from public.dipendente_documenti
group by categoria
order by categoria;

select d.cognome, d.nome, x.categoria, x.titolo
from public.dipendente_documenti x
join public.dipendenti d on d.id = x.dipendente_id
order by d.cognome, d.nome, x.categoria, x.titolo;
