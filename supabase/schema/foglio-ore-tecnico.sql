-- =====================================================================
-- `invia_foglio_giornata`: aggiunge le ore di chi compila
--
-- SOSTITUISCE la funzione creata da `foglio-giornata.sql`. Quel file
-- resta agli atti perche' racconta come e' nata la regola dell'invio
-- collettivo; questo la aggiorna.
--
-- LA REGOLA NUOVA, chiesta il 2026-09-10: la giornata non parte se chi
-- la manda non ci ha messo anche le PROPRIE ore. Un tecnico che passa
-- in cantiere lavora come tutti, e un foglio in cui l'unica persona
-- certa di esserci stata non compare non e' il resoconto della giornata.
--
-- PERCHE' NON BLOCCA NESSUNO PRIMA DEL TEMPO
--
-- Il controllo si accende da solo, e solo quando c'e' dove rispondere:
-- vale unicamente se chi chiama ha un'anagrafica in `dipendenti`
-- collegata al suo utente (`dipendenti.user_id`). Senza quel
-- collegamento non esisterebbe nessuna riga in cui scrivere quelle ore,
-- e pretenderle chiuderebbe l'invio per sempre senza via d'uscita.
--
-- Quindi: si esegue questo file anche adesso, e non cambia niente
-- finche' l'amministrazione non collega il tecnico dalla scheda operaio.
-- Da quel momento la regola comincia a valere, senza toccare piu' il
-- database.
--
-- Le ore di assenza contano quanto quelle lavorate: chi era in ferie ha
-- gia' risposto alla domanda, e chiedergli delle ore sarebbe assurdo.
--
-- Resta `security invoker`: la RLS decide quali cantieri vede chi
-- chiama, e il trigger degli stati controlla ogni transizione come se
-- fosse fatta a mano.
--
-- Da eseguire nel SQL Editor. Si puo' rilanciare: e' `create or replace`
-- e non cambia il tipo di ritorno.
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

  -- Il messaggio lo legge il tecnico, non un log: "Mancano 1 schede"
  -- e' esattamente il genere di sciatteria che fa sembrare rotto un
  -- programma che funziona.
  if mancanti > 0 then
    raise exception '%',
      case when mancanti = 1
        then 'Manca una scheda. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.'
        else format('Mancano %s schede. La giornata si invia solo quando ogni cantiere attivo ha la sua, anche quelli fermi.', mancanti)
      end
      using errcode = 'P0001';
  end if;

  -- Chi compila la giornata la lavora anche: senza le sue ore, il foglio
  -- racconta una giornata in cui l'unica persona certa di esserci stata
  -- non c'e'.
  --
  -- Il controllo si accende DA SOLO, e solo quando ha senso: vale
  -- unicamente se chi chiama ha un'anagrafica in `dipendenti` collegata
  -- al suo utente. Senza quel collegamento non esisterebbe nessuna riga
  -- dove scrivere quelle ore, e pretenderle bloccherebbe l'invio per
  -- sempre senza dare una via d'uscita. Il giorno che l'amministrazione
  -- collega il tecnico, la regola comincia a valere.
  select d.id into mio_dipendente
  from public.dipendenti d
  where d.org_id = p_org
    and d.user_id = auth.uid()
  limit 1;

  if mio_dipendente is not null then
    -- Le ore di assenza contano: chi era in ferie ha risposto alla
    -- domanda, e pretendergli delle ore lavorate sarebbe assurdo.
    select coalesce(sum(o.ore_ordinarie + o.ore_straordinarie + o.ore_assenza), 0)
      into mie_ore
    from public.rapportino_ore o
    join public.rapportini r on r.id = o.rapportino_id
    where o.org_id = p_org
      and r.data = p_giorno
      and o.dipendente_id = mio_dipendente;

    if mie_ore = 0 then
      raise exception 'Mancano le tue ore. Aggiungiti alla squadra del cantiere dove hai lavorato, oppure segna il motivo se non c''eri: una giornata senza chi l''ha scritta non e'' la giornata.'
        using errcode = 'P0001';
    end if;
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
    raise exception '%',
      case when da_correggere = 1
        then 'Una scheda e'' stata respinta: va corretta prima di rimandare la giornata.'
        else format('%s schede sono state respinte: vanno corrette prima di rimandare la giornata.', da_correggere)
      end
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


-- VERIFICA
-- Chi risulta collegato a un utente del gestionale, e quindi a chi la
-- regola nuova si applica gia'.
select d.cognome, d.nome, d.user_id, p.email
from public.dipendenti d
left join public.profiles p on p.id = d.user_id
where d.user_id is not null
order by d.cognome, d.nome;


-- PROVA DAL VIVO
-- Come tecnico@cassia.com, dopo essersi collegati dalla scheda operaio:
-- compilare tutti i cantieri della giornata SENZA mettersi in squadra e
-- premere «Invia il foglio della giornata». Deve rispondere che mancano
-- le tue ore. Aggiungendosi su un cantiere, deve partire.
