import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/**
 * I rapportini visibili nell'azienda attiva, dal piu' recente.
 *
 * Vale la stessa avvertenza di useCantieri: `.eq('org_id', ...)` filtra
 * l'azienda SCELTA, la RLS filtra quelle a cui hai diritto. Due cose
 * diverse, servono entrambe.
 *
 * La policy `rapportini_select` passa da `app.puo_vedere_cantiere()`:
 * chi e' assegnato a un cantiere vede tutti i rapportini di QUEL
 * cantiere, anche quelli scritti dai colleghi. Non e' una svista: in
 * cantiere il giornale dei lavori e' un documento di squadra.
 */
export function useRapportini() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['rapportini', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rapportini')
        .select(
          'id, data, numero, anno, stato, note, ora_inizio, ora_fine, meteo, compilato_da, inviato_at, validato_at, motivo_rifiuto, cantieri ( codice, denominazione )',
        )
        .eq('org_id', org!.id)
        .order('data', { ascending: false })
        .limit(200)

      if (error) throw error
      return data
    },
  })
}

export type Rapportino = NonNullable<ReturnType<typeof useRapportini>['data']>[number]
