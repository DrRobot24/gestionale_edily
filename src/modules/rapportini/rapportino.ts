import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import type { RapportinoStato } from './regole'

/* ══════════════════════════════════════════════════════════════════
   La macchina a stati, verificata una transizione alla volta contro il
   database reale. Non e' dedotta dallo schema: e' misurata.

     bozza ──invia──▶ inviato ──valida──▶ validato ──▶ contabilizzato
       ▲                 │                   │               │
       │       respingi  │          riapri   │      storna   │
       │                 ▼                   ▼               ▼
       └──────────── respinto ──────────▶ bozza          validato

   Quel che NON e' ammesso, e che quindi l'interfaccia non deve offrire:
     inviato  → bozza      (l'invio non si ritira: si fa respingere)
     validato → respinto   (da validato si torna solo in bozza)

   Chi puo' cosa lo controlla il trigger, non solo la RLS: un tecnico che
   prova a validarsi il proprio rapportino riceve
   "Permesso rapportini.validate mancante".
   ══════════════════════════════════════════════════════════════════ */

/**
 * La select va scritta come UN letterale, non composta da variabili.
 * supabase-js deduce il tipo della riga leggendo questa stringa a
 * compile-time: se la costruisci con `${...}` TypeScript la vede come
 * `string` generica, non riesce piu' a dedurre nulla e ti restituisce
 * `GenericStringError` su ogni campo. Bruttissima da leggere, ma e' il
 * prezzo dell'autocompletamento e degli errori a compile-time.
 */
const SELECT =
  'id, data, numero, anno, stato, note, meteo, ora_inizio, ora_fine, compilato_da, inviato_at, validato_at, validato_da, contabilizzato_at, motivo_rifiuto, cantiere_id, cantieri ( codice, denominazione ), rapportino_ore ( id, dipendente_id, ore_ordinarie, ore_straordinarie, ore_trasferta, tipo_assenza, mansione, note, dipendenti ( nome, cognome, matricola ) )' as const

export function useRapportino(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['rapportino', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rapportini')
        .select(SELECT)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

type Transizione = {
  id: string
  stato: RapportinoStato
  motivo_rifiuto?: string | null
  inviato_at?: string | null
  validato_at?: string | null
  validato_da?: string | null
  contabilizzato_at?: string | null
}

/**
 * Un solo hook per tutte le transizioni: cambiano i campi accessori, non
 * la meccanica. Il messaggio d'errore del trigger (P0001) e' gia' in
 * italiano e dice esattamente cosa e' mancato, quindi lo mostriamo
 * com'e' invece di riscriverlo peggio.
 */
export function useTransizione() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...campi }: Transizione) => {
      const { data, error } = await supabase
        .from('rapportini')
        .update(campi)
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('stato')
        .maybeSingle()

      if (error) throw error
      // Nessun errore ma zero righe = la RLS ha filtrato la riga. Senza
      // questo controllo l'utente vedrebbe un successo silenzioso e si
      // chiederebbe perche' non e' cambiato niente.
      if (!data) {
        throw new Error(
          'Il database non ti permette di modificare questo rapportino nel suo stato attuale.',
        )
      }
      return data.stato
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['rapportino', v.id] })
      qc.invalidateQueries({ queryKey: ['rapportini'] })
    },
  })
}
