import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le ore di una giornata solare, per persona.

   Passa da una funzione del database e non dalla vista
   `v_ore_giornaliere` per una ragione di correttezza. La vista e'
   `security_invoker=on` — verificato il 2026-09-10 su tutte e sette le
   viste — quindi mostra solo i cantieri del perimetro di chi legge. E il
   perimetro qui e' per assegnazione: un tecnico non vede i cantieri di
   un collega.

   Su un conto che deve dire «Mario oggi ha fatto 9 ore in tutto» questo
   e' fatale: la somma tornerebbe 4 senza nessun errore e senza nessun
   avviso. Un numero sbagliato che si presenta come giusto e' peggio di
   un numero che manca.

   La funzione `ore_giornata` e' `security definer` e restituisce solo
   l'aggregato per persona, mai su quali cantieri. Sta in
   `supabase/schema/ore-giornata.sql`.
   ══════════════════════════════════════════════════════════════════ */

/** Le ore di una giornata piena in Italia. E' il metro di tutto il
 *  controllo: sopra c'e' straordinario, sotto ci vuole un motivo. */
export const ORE_STANDARD = 8

export type OrePersona = {
  dipendente_id: string
  nominativo: string
  ore_ordinarie: number
  ore_straordinarie: number
  /** Quante di quelle ore stanno su cantieri che chi guarda puo' gia'
   *  vedere. La differenza col totale e' quanto sta altrove, e si
   *  racconta senza dire dove. */
  ore_visibili: number
  assenze: string | null
}

export function useOreGiornata(giorno: string) {
  const { org } = useSession()

  return useQuery({
    // Sotto ['rapportini'] perche' chi salva una scheda invalida quel
    // prefisso: le ore della giornata cambiano proprio quando cambia un
    // rapportino, e una chiave sorella resterebbe ferma.
    queryKey: ['rapportini', 'ore-giornata', org?.id, giorno],
    enabled: Boolean(org?.id),
    // Se la funzione non e' ancora stata creata nel database, riprovare
    // tre volte non la fa comparire.
    retry: false,
    queryFn: async (): Promise<OrePersona[]> => {
      const { data, error } = await supabase.rpc('ore_giornata', {
        p_org: org!.id,
        p_giorno: giorno,
      })
      if (error) throw error
      return (data ?? []) as OrePersona[]
    },
  })
}

export type Anomalia = { tipo: 'straordinario' | 'mancano'; ore: number }

/**
 * Cosa non torna nelle ore di una persona, se qualcosa non torna.
 *
 * Guarda solo le ORDINARIE. Lo straordinario gia' segnato come tale sta
 * in una colonna sua ed e' giusto che ci sia: il difetto non e' lavorare
 * piu' di otto ore, e' scriverne nove come se fossero ordinarie.
 *
 * Chi ha un motivo di assenza non risulta mai in difetto: quel motivo
 * e' esattamente la risposta alla domanda «perche' meno di otto».
 *
 * Chi non compare su nessun rapportino della giornata non entra qui
 * dentro affatto: la funzione restituisce solo chi ha almeno una riga.
 * Un operaio che quel giorno non e' stato messo da nessuna parte non ha
 * "ore mancanti", semplicemente non e' stato assegnato — e segnalarlo
 * riempirebbe la schermata di allarmi il mattino, prima che il tecnico
 * abbia compilato qualcosa.
 */
export function anomaliaDi(p: OrePersona): Anomalia | null {
  const ordinarie = Number(p.ore_ordinarie)
  if (ordinarie > ORE_STANDARD) {
    return { tipo: 'straordinario', ore: ordinarie - ORE_STANDARD }
  }
  if (ordinarie < ORE_STANDARD && !p.assenze) {
    return { tipo: 'mancano', ore: ORE_STANDARD - ordinarie }
  }
  return null
}

/** La funzione nel database non c'e' ancora: e' un file dello schema
 *  mai eseguito, non un guasto. Si riconosce dal codice di PostgREST
 *  quando non trova la funzione da chiamare. */
export function funzioneMancante(errore: Error): boolean {
  return /PGRST202|Could not find the function|does not exist/i.test(errore.message)
}
