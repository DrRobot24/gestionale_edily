import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   IL PALLINO SULLA VOCE DI MENU: quante giornate sono state validate
   di recente e aspettano di essere elaborate.

   Chiesto dall'utente il 2026-09-21, con una precisazione che cambia il
   senso della cosa: Stefania **non ci lavora tutti i giorni, lei VIVE
   in quella pagina**. Il gestionale e' il punto di riferimento di tutto
   l'ufficio, non un posto dove si passa ogni tanto.

   Quindi il pallino non serve a richiamare qualcuno da fuori: serve
   perche' mentre lei sta gia' dentro il programma — su un'altra
   schermata, a fare altro — veda che e' arrivata roba nuova senza
   doverla andare a cercare.

   PERCHE' UNA FINESTRA DI GIORNI E NON "IL NON LETTO".

   Un "non letto" vero vorrebbe una tabella che registra chi ha guardato
   cosa e quando: una riga per persona e per giornata, da tenere pulita
   per sempre. E' molto peso per una domanda che in realta' e' semplice
   — «c'e' arrivato qualcosa di fresco?» — e introdurrebbe un secondo
   posto in cui si decide cosa e' gia' stato lavorato, quando quel posto
   esiste gia' ed e' la chiusura del periodo (`periodi_paga`).

   Quindi si guarda la finestra breve: quanto e' stato validato negli
   ultimi giorni. Il pallino si spegne da se' col passare del tempo,
   che e' il comportamento giusto per un avviso di freschezza.
   ══════════════════════════════════════════════════════════════════ */

/** Quanto indietro si guarda. Sette giorni copre la settimana di
 *  lavoro: qualcosa validato lunedi' resta segnalato fino al lunedi'
 *  dopo, che e' il ritmo con cui Stefania tira le somme. */
const GIORNI = 7

export type OreDaLeggere = {
  /** Quante GIORNATE distinte sono state validate nella finestra. Non
   *  le righe: una giornata con sei cantieri e' una giornata sola, e
   *  dire «6» farebbe sembrare arretrato quello che e' un giorno. */
  giornate: number
}

export function useOreDaLeggere() {
  const { org, can } = useSession()
  const abilitato = Boolean(org?.id) && can('paghe.read')

  return useQuery({
    queryKey: ['ore-settimana', 'da-leggere', org?.id],
    enabled: abilitato,
    retry: false,
    /* Si ricontrolla ogni cinque minuti mentre la finestra e' aperta.
       Stefania passa la giornata dentro il gestionale: se Giuseppe
       valida alle dieci, alle dieci e cinque il pallino c'e' gia',
       senza che nessuno ricarichi la pagina. */
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OreDaLeggere> => {
      const da = new Date()
      da.setDate(da.getDate() - GIORNI)
      const dal = da.toLocaleDateString('sv-SE')

      /* Si contano le GIORNATE validate, da tutti e due i posti in cui
         stanno le ore: i rapportini di chi va in cantiere e il foglio
         personale del tecnico e di chi sta in ufficio. Stefania riceve
         le ore di tutti, quindi tutti e due contano.

         `head: true` con `count`: al server si chiede solo il numero,
         le righe non viaggiano. Il conteggio passa dalla RLS, ma chi ha
         `paghe.read` e' owner, admin o amministrazione — nessuno di
         loro ha il perimetro ristretto per assegnazione, quindi qui il
         numero e' completo. Se un domani il permesso finisse a un ruolo
         con lo scope per cantiere, questo conteggio andrebbe spostato
         in una funzione `security definer` come le altre tre. */
      const [rapportini, personali] = await Promise.all([
        supabase
          .from('rapportini')
          .select('data', { count: 'exact', head: true })
          .eq('org_id', org!.id)
          .eq('stato', 'validato')
          .gte('data', dal),
        supabase
          .from('ore_personali')
          .select('data', { count: 'exact', head: true })
          .eq('org_id', org!.id)
          .eq('stato', 'validato')
          .gte('data', dal),
      ])

      if (rapportini.error) throw rapportini.error
      if (personali.error) throw personali.error

      return {
        giornate: (rapportini.count ?? 0) + (personali.count ?? 0),
      }
    },
  })
}
