import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I documenti di una persona: patentini, attestati, identita'.

   Chiesti dall'utente il 2026-09-18 insieme al resto della scheda:
   «documenti relativi ad esso come patentini, qualifiche, attestati, o
   doc. di identita' etc quindi in pdf o files in generale».

   IL FILE STA NELLO STORAGE, la riga qui tiene solo il percorso. E' la
   stessa forma delle foto di cantiere (`useFoto.ts`) e per la stessa
   ragione: un PDF dentro una colonna gonfia il database e rende lenta
   ogni lettura della scheda.

   IL BUCKET E' CHIUSO e lo e' dalla nascita — `scheda-personale.sql`,
   blocco 6. Qui dentro ci sono carte d'identita' e permessi di
   soggiorno: gli indirizzi si firmano a ogni lettura e scadono, perche'
   un link copiato in una chat non deve restare valido per sempre.

   CHI LI VEDE: solo `anagrafiche.write`, cioe' alla Edily Stefania e il
   titolare. Il tecnico ha `anagrafiche.read` per sapere chi mettere in
   squadra — sapere che Rossi esiste e' una cosa, potergli scaricare il
   documento un'altra. La regola vera sta nelle policy, non qui.
   ══════════════════════════════════════════════════════════════════ */

const BUCKET = 'personale'

/** Un'ora: il tempo di guardare una scheda con calma, non abbastanza
 *  perche' un indirizzo finito per sbaglio in una chat resti buono. */
const DURATA_FIRMA = 3600

/**
 * La convenzione di path, scritta una volta sola.
 *
 *     {org_id}/{dipendente_id}/{file}
 *
 * Il primo segmento non e' ordine estetico: e' l'unico appiglio che le
 * policy su `storage.objects` hanno per isolare l'impresa. Cambiarla
 * qui senza cambiarla nel SQL rende i file illeggibili.
 */
export function percorsoDocumento(
  orgId: string,
  dipendenteId: string,
  nomeFile: string,
): string {
  const pulito = nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
  return `${orgId}/${dipendenteId}/${Date.now()}-${pulito}`
}

export type DocumentoPersonale = {
  id: string
  titolo: string
  percorso: string
  scadenza: string | null
  created_at: string
  /** Firmato al momento della lettura: `null` se la firma non arriva. */
  url: string | null
}

/**
 * I documenti di una persona, gia' con l'indirizzo firmato.
 *
 * Le firme si chiedono tutte insieme con `createSignedUrls`: una
 * chiamata per documento sarebbe un viaggio in piu' per ogni riga.
 */
export function useDocumentiPersonali(dipendenteId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['documenti-personali', dipendenteId, org?.id],
    enabled: Boolean(dipendenteId && org?.id),
    queryFn: async (): Promise<DocumentoPersonale[]> => {
      const { data, error } = await supabase
        .from('dipendente_documenti')
        .select('id, titolo, percorso, scadenza, created_at')
        .eq('dipendente_id', dipendenteId!)
        .eq('org_id', org!.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) return []

      const { data: firme, error: erroreFirme } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          data.map((d) => d.percorso),
          DURATA_FIRMA,
        )

      // Senza firme si mostrano lo stesso i documenti, senza il link:
      // meglio sapere che l'attestato c'e' e non poterlo aprire, che
      // credere che non sia mai stato caricato.
      if (erroreFirme) return data.map((d) => ({ ...d, url: null }))

      const perPath = new Map((firme ?? []).map((f) => [f.path, f.signedUrl]))
      return data.map((d) => ({ ...d, url: perPath.get(d.percorso) ?? null }))
    },
  })
}

/**
 * Carica un documento: prima il file, poi la riga.
 *
 * In quest'ordine perche' una riga che punta a un file mai arrivato e'
 * un documento fantasma — compare in elenco e non si apre. Al
 * contrario, un file senza riga e' solo spazio occupato che nessuno
 * vede, e se la riga fallisce lo si toglie subito.
 */
export function useCaricaDocumento() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dipendenteId,
      file,
      titolo,
      scadenza,
    }: {
      dipendenteId: string
      file: File
      titolo: string
      scadenza: string | null
    }) => {
      const percorso = percorsoDocumento(org!.id, dipendenteId, file.name)

      const { error: erroreFile } = await supabase.storage
        .from(BUCKET)
        .upload(percorso, file, { contentType: file.type, upsert: false })
      if (erroreFile) throw erroreFile

      const { error } = await supabase.from('dipendente_documenti').insert({
        org_id: org!.id,
        dipendente_id: dipendenteId,
        titolo,
        percorso,
        scadenza,
        caricato_da: app!.userId,
      })

      if (error) {
        // Il file e' gia' salito: senza questa riga resterebbe nel
        // bucket senza che niente lo nomini.
        await supabase.storage.from(BUCKET).remove([percorso])
        throw error
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['documenti-personali', v.dipendenteId] })
    },
  })
}

/** Toglie prima la riga e poi il file: se il file non si cancella resta
 *  spazio occupato, ma la scheda e' gia' pulita. L'ordine opposto
 *  lascerebbe in elenco un documento che non si apre piu'. */
export function useEliminaDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, percorso }: { id: string; percorso: string; dipendenteId: string }) => {
      const { error } = await supabase.from('dipendente_documenti').delete().eq('id', id)
      if (error) throw error
      await supabase.storage.from(BUCKET).remove([percorso])
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['documenti-personali', v.dipendenteId] })
    },
  })
}

/* ── le scadenze ───────────────────────────────────────────────── */

/** Giorni da oggi a una data. Negativo se e' gia' passata. */
export function giorniA(data: string): number {
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const quando = new Date(`${data}T00:00:00`)
  return Math.round((quando.getTime() - oggi.getTime()) / 86400000)
}

/**
 * Come sta messa una scadenza.
 *
 * Trenta giorni e non sette: rinnovare un permesso di soggiorno o
 * rifare un attestato non si fa in un pomeriggio, e un avviso che
 * arriva quando il documento e' gia' scaduto ha solo il merito di dare
 * la notizia.
 */
export function statoScadenza(data: string | null): 'scaduto' | 'in-scadenza' | 'valido' | null {
  if (!data) return null
  const g = giorniA(data)
  if (g < 0) return 'scaduto'
  if (g <= 30) return 'in-scadenza'
  return 'valido'
}
