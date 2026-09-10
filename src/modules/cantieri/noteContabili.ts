import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le note contabili: a che punto sono le lavorazioni di un cantiere.

   Il rapportino dice chi c'era e quante ore ha fatto. Non dice a che
   punto e' il lavoro. Sono due domande diverse e servono tutte e due:
   dalle ore non si ricava l'avanzamento, e dall'avanzamento non si
   ricavano le paghe.

   Niente importi, per scelta: i soldi stanno in `costi_cantiere` e
   `ricavi_cantiere`, e una seconda fonte di verita' sugli stessi numeri
   prima o poi diverge da sola.

   Tabella e policy in `supabase/schema/note-contabili.sql`.
   ══════════════════════════════════════════════════════════════════ */

export const STATI_NOTA = ['in_corso', 'completata', 'sospesa'] as const
export type StatoNota = (typeof STATI_NOTA)[number]

export const ETICHETTA_STATO: Record<StatoNota, string> = {
  in_corso: 'In corso',
  completata: 'Completata',
  sospesa: 'Sospesa',
}

export type NotaContabile = {
  id: string
  cantiere_id: string
  lavorazione: string
  stato: StatoNota
  iniziata_il: string | null
  completata_il: string | null
  note: string | null
  scritta_da: string | null
  created_at: string
}

const CAMPI = 'id, cantiere_id, lavorazione, stato, iniziata_il, completata_il, note, scritta_da, created_at'

/**
 * Le note di un cantiere, con quelle aperte in cima.
 *
 * L'ordine e' la risposta alla domanda che si fa aprendo la pagina:
 * «a che punto siamo». Prima cio' che e' ancora aperto — in corso e
 * sospese — poi il fatto, dal piu' recente. Un elenco in ordine di
 * inserimento sotterrerebbe la lavorazione di oggi sotto tre mesi di
 * storia.
 *
 * L'ordinamento vero lo fa il client: in SQL servirebbe una `case` in
 * `order by` che PostgREST non sa esprimere, e le note di un cantiere
 * sono decine, non decine di migliaia.
 */
export function useNoteContabili(cantiereId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['note-contabili', cantiereId, org?.id],
    enabled: Boolean(cantiereId && org?.id),
    queryFn: async (): Promise<NotaContabile[]> => {
      const { data, error } = await supabase
        .from('note_contabili')
        .select(CAMPI)
        .eq('cantiere_id', cantiereId!)
        .eq('org_id', org!.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const peso: Record<string, number> = { in_corso: 0, sospesa: 1, completata: 2 }
      return [...((data ?? []) as NotaContabile[])].sort((a, b) => {
        const d = (peso[a.stato] ?? 9) - (peso[b.stato] ?? 9)
        if (d !== 0) return d
        return (b.completata_il ?? b.created_at).localeCompare(a.completata_il ?? a.created_at)
      })
    },
  })
}

export type DatiNota = {
  lavorazione: string
  stato: StatoNota
  iniziata_il: string | null
  completata_il: string | null
  note: string | null
}

/** Un hook solo per creare e per correggere: due hook quasi identici
 *  divergono al primo campo aggiunto, e divergono in silenzio. */
export function useSalvaNota() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      cantiereId,
      dati,
    }: {
      id?: string
      cantiereId: string
      dati: DatiNota
    }) => {
      if (id) {
        // `scritta_da` NON si riscrive correggendo: la riga deve
        // continuare a dire chi l'ha aperta, se no il titolare che
        // sistema un refuso si ritrova intestata la nota del tecnico.
        const { error } = await supabase
          .from('note_contabili')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('note_contabili')
        .insert({ ...dati, org_id: org!.id, cantiere_id: cantiereId, scritta_da: app!.userId })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['note-contabili', v.cantiereId] })
    },
  })
}

export function useEliminaNota() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; cantiereId: string }) => {
      const { error } = await supabase.from('note_contabili').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['note-contabili', v.cantiereId] })
    },
  })
}
