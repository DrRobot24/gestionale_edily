import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/**
 * I cantieri che l'utente puo' vedere, nell'azienda attiva.
 *
 * Il filtro `.eq('org_id', ...)` NON e' ridondante rispetto alla RLS, ed
 * e' il punto piu' facile da sbagliare di tutta l'applicazione.
 *
 * La policy `cantieri_select` chiama `app.puo_vedere_cantiere(id)`, che
 * risponde per TUTTE le aziende a cui l'utente appartiene: il database
 * non sa quale azienda hai scelto nel selettore in alto, e' un concetto
 * che esiste solo nel browser. Senza questo filtro, un consulente
 * iscritto a due imprese vedrebbe i cantieri di entrambe mescolati nella
 * stessa lista, senza nessun errore da nessuna parte.
 *
 * La RLS decide cosa PUOI vedere; l'org attiva decide cosa STAI
 * guardando. Sono due domande diverse e servono tutte e due.
 *
 * Per lo stesso motivo `org.id` sta nella queryKey: cambiando azienda la
 * cache non deve riusare le righe di quella precedente.
 */
export function useCantieri() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['cantieri', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cantieri')
        .select(
          'id, codice, denominazione, stato, comune, provincia, data_inizio, data_fine_prevista, importo_contratto',
        )
        .eq('org_id', org!.id)
        .order('codice', { ascending: false })

      if (error) throw error
      return data
    },
  })
}

export type Cantiere = NonNullable<ReturnType<typeof useCantieri>['data']>[number]
