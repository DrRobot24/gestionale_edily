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
          'id, cantiere_id, data, numero, anno, stato, nessuna_attivita, note, ora_inizio, ora_fine, meteo, compilato_da, inviato_at, validato_at, motivo_rifiuto, cantieri ( codice, denominazione )',
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

/**
 * I rapportini di UN cantiere, dal piu' recente.
 *
 * Esiste separato da `useRapportini()` per una ragione di correttezza,
 * non di comodita': quella query si ferma a 200 righe su tutta
 * l'impresa, quindi filtrarla per cantiere darebbe una risposta giusta
 * oggi e sbagliata fra sei mesi, senza avvisare. Qui il limite e' per
 * cantiere, e la domanda "esiste gia' la scheda del giorno X?" ha una
 * risposta che regge nel tempo.
 *
 * Le ore arrivano annidate perche' servono a dire "quel giorno c'erano
 * quattro persone per 32 ore": una lista di date senza numeri non e' una
 * panoramica, e' un indice.
 */
export function useRapportiniCantiere(cantiereId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    // La chiave sta SOTTO ['rapportini'] di proposito: chi salva un
    // rapportino invalida quel prefisso, e una chiave sorella tipo
    // ['rapportini-cantiere'] non verrebbe toccata. Si tornerebbe
    // dalla creazione e il cantiere direbbe ancora «non c'e' nessuna
    // scheda» per la giornata appena compilata.
    queryKey: ['rapportini', 'cantiere', cantiereId, org?.id],
    enabled: Boolean(cantiereId && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rapportini')
        // Una riga sola, per quanto lunga: supabase-js ricava il tipo
        // del risultato leggendo questa stringa, e spezzarla con un `+`
        // gliela rende illeggibile. Il risultato diventa
        // `GenericStringError` e i campi spariscono tutti insieme.
        .select(
          'id, data, numero, anno, stato, nessuna_attivita, compilato_da, motivo_rifiuto, rapportino_ore ( ore_ordinarie, ore_straordinarie, tipo_assenza )',
        )
        .eq('org_id', org!.id)
        .eq('cantiere_id', cantiereId!)
        .order('data', { ascending: false })
        .limit(90)

      if (error) throw error
      return data
    },
  })
}

export type RapportinoCantiere = NonNullable<
  ReturnType<typeof useRapportiniCantiere>['data']
>[number]
