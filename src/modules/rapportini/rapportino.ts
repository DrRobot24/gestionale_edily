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
  'id, data, numero, anno, stato, note, annotazioni, meteo, nessuna_attivita, ora_inizio, ora_fine, compilato_da, inviato_at, validato_at, validato_da, contabilizzato_at, motivo_rifiuto, cantiere_id, cantieri ( codice, denominazione ), rapportino_ore ( id, dipendente_id, ore_ordinarie, ore_straordinarie, ore_trasferta, ore_assenza, tipo_assenza, mansione, note, dipendenti ( nome, cognome, matricola ) )' as const

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

/**
 * Piu' rapportini completi in una lettura sola: squadra, ore, note.
 * Serve al riepilogo della giornata del tecnico prima dell'invio
 * (2026-09-25), che li mostra tutti insieme.
 */
export function useRapportiniCompleti(ids: string[]) {
  const { org } = useSession()
  const chiave = [...ids].sort().join(',')

  return useQuery({
    queryKey: ['rapportini', 'completi', org?.id, chiave],
    enabled: Boolean(org?.id) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rapportini')
        .select(SELECT)
        .in('id', ids)
        .eq('org_id', org!.id)
      if (error) throw error
      return data
    },
  })
}

export type RapportinoCompleto = NonNullable<ReturnType<typeof useRapportino>['data']>

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

/**
 * Cancella un rapportino, e con lui tutto quello che ci pende.
 *
 * Chiesto dall'utente il 2026-09-17. Fino a ieri una scheda aperta per
 * sbaglio — sul cantiere sbagliato, sul giorno sbagliato — non si poteva
 * togliere: restava li' a sporcare il calendario e a far contare una
 * giornata che non era mai esistita.
 *
 * QUANDO: solo in `bozza` o `respinto`, la regola sta in
 * `cancellabile()`. Finche' il foglio e' sulla scrivania di chi lo
 * scrive e' suo; da quando parte e' un documento consegnato.
 *
 * PERCHE' I FIGLI A MANO. Le foreign key di `rapportino_ore` e sorelle
 * sono `restrict`, non `cascade`: Postgres rifiuta di cancellare il
 * padre finche' esistono le righe. Le togliamo qui, nell'ordine, come
 * fa lo script di pulizia. Non e' una svista dello schema — `restrict`
 * e' la scelta giusta per un documento contabile, dove una cascata
 * silenziosa e' peggio di un errore.
 *
 * LE FOTO sono il punto delicato: la riga se ne va, il FILE nello
 * storage no. Si cancellano prima i file, e se quel passo fallisce ci
 * si ferma invece di proseguire — meglio un rapportino ancora li' che
 * un bucket pieno di immagini che nessuna query trova piu'.
 */
export function useEliminaRapportino() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // I path dei file PRIMA di togliere le righe: dopo non ci sarebbe
      // piu' modo di sapere quali file erano suoi.
      const { data: foto, error: erroreFoto } = await supabase
        .from('rapportino_foto')
        .select('storage_path')
        .eq('rapportino_id', id)

      if (erroreFoto) throw erroreFoto

      const percorsi = (foto ?? []).map((f) => f.storage_path).filter(Boolean)
      if (percorsi.length > 0) {
        const { error } = await supabase.storage.from('rapportini').remove(percorsi)
        // Ci si ferma: un file orfano non lo trova piu' nessuno, mentre
        // un rapportino ancora in elenco si ricancella.
        if (error) {
          throw new Error(
            `Non riesco a togliere le foto dallo spazio file: ${error.message}. Il rapportino non e' stato cancellato.`,
          )
        }
      }

      // I figli, poi il padre: le foreign key sono `restrict`.
      for (const tabella of [
        'rapportino_foto',
        'rapportino_ore',
        'rapportino_materiali',
        'rapportino_mezzi',
      ] as const) {
        const { error } = await supabase.from(tabella).delete().eq('rapportino_id', id)
        if (error) throw error
      }

      const { data, error } = await supabase
        .from('rapportini')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
        .maybeSingle()

      if (error) throw error
      // Zero righe senza errore = la RLS ha filtrato. Senza questo
      // controllo si vedrebbe un successo e la scheda resterebbe li'.
      if (!data) {
        throw new Error(
          'Il database non ti permette di cancellare questo rapportino: controlla che sia ancora una bozza.',
        )
      }
      return id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['rapportino', id] })
      qc.invalidateQueries({ queryKey: ['rapportini'] })
    },
  })
}
