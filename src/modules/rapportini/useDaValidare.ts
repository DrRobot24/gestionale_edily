import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/**
 * Le schede in attesa di validazione, con dentro le ore.
 *
 * Sta in un hook suo e non dentro useRapportini() perche' porta con se'
 * `rapportino_ore`, che serve solo a chi valida: caricarle sempre
 * appesantirebbe ogni elenco per un dato che quasi nessuna pagina usa.
 *
 * Il filtro e' su `inviato` e non su "tutto il resto": una scheda gia'
 * validata non torna in questa coda, e una ancora compilata non ci e'
 * mai entrata.
 */
export function useDaValidare() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['da-validare', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rapportini')
        .select(
          'id, data, numero, anno, stato, nessuna_attivita, note, annotazioni, ora_inizio, ora_fine, meteo, compilato_da, inviato_at, cantieri ( codice, denominazione ), rapportino_ore ( ore_ordinarie, ore_straordinarie, ore_trasferta, tipo_assenza )',
        )
        .eq('org_id', org!.id)
        .eq('stato', 'inviato')
        .order('data', { ascending: false })
        .limit(200)

      if (error) throw error
      return data
    },
  })
}

export type SchedaDaValidare = NonNullable<ReturnType<typeof useDaValidare>['data']>[number]

/** Ore lavorate: ordinarie piu' straordinarie, come nel totale del form.
 *  Le trasferte restano fuori di proposito — sono un rimborso, non
 *  tempo passato in cantiere, e sommarle gonfierebbe la giornata. */
export function oreDi(s: SchedaDaValidare): number {
  return (s.rapportino_ore ?? []).reduce(
    (t, r) => t + Number(r.ore_ordinarie ?? 0) + Number(r.ore_straordinarie ?? 0),
    0,
  )
}

/** Chi era in cantiere: le righe con un tipo di assenza sono persone
 *  che quel giorno non c'erano, e contarle direbbe una squadra piu'
 *  numerosa di quella che ha lavorato. */
export function presentiDi(s: SchedaDaValidare): number {
  return (s.rapportino_ore ?? []).filter((r) => !r.tipo_assenza).length
}
