import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I documenti: di un cantiere, di un cliente, di un fornitore, di un
   materiale.

   Chiesti dall'utente il 2026-09-18: computi, disegni, permessi,
   verbali, contratti, listini, schede tecniche. Prima esisteva solo un
   riquadro segnaposto nella scheda del cantiere, che dichiarava di
   essere vuoto perche' il bucket `rapportini` accetta solo immagini.

   UN MODULO SOLO PER QUATTRO POSTI. Il documento e' sempre la stessa
   cosa — un file, un titolo, una scadenza — e cambia solo a CHE COSA e'
   attaccato. Quattro hook identici divergerebbero al primo difetto
   corretto in uno solo dei quattro.

   CHI VEDE COSA lo decide la RLS e non questo file: scrive
   `anagrafiche.write` (Stefania e il titolare), il tecnico legge i
   documenti dei cantieri SUOI e quelli del magazzino. Le policy stanno
   in `supabase/schema/documenti.sql`.

   NON C'ENTRA con `dipendente_documenti`, che e' una tabella sua: li'
   ci sono carte d'identita' e permessi di soggiorno, e hanno un
   cancello piu' stretto. Tenerle separate e' voluto.
   ══════════════════════════════════════════════════════════════════ */

const BUCKET = 'documenti'

/** Un'ora, come per le foto e i documenti personali: il tempo di
 *  guardare una scheda con calma, non abbastanza perche' un indirizzo
 *  finito per sbaglio in una chat resti buono. */
const DURATA_FIRMA = 3600

export type AmbitoDocumento = 'cantiere' | 'cliente' | 'fornitore' | 'materiale'

export type Documento = {
  id: string
  ambito: AmbitoDocumento
  riferimento_id: string
  titolo: string
  percorso: string
  scadenza: string | null
  note: string | null
  created_at: string
  /** Firmato alla lettura: `null` se la firma non arriva. */
  url: string | null
}

/**
 * La convenzione di path, scritta una volta sola.
 *
 *     {org_id}/{ambito}/{riferimento_id}/{file}
 *
 * Il primo segmento isola l'impresa ed e' l'unico appiglio che le
 * policy su `storage.objects` hanno per decidere. Il secondo e il terzo
 * servono a ritrovare i file a mano dal pannello di Supabase, che con
 * migliaia di documenti e' l'unico modo. Cambiarla qui senza cambiarla
 * nel SQL rende i file illeggibili.
 */
export function percorsoDocumento(
  orgId: string,
  ambito: AmbitoDocumento,
  riferimentoId: string,
  nomeFile: string,
): string {
  const pulito = nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
  return `${orgId}/${ambito}/${riferimentoId}/${Date.now()}-${pulito}`
}

/**
 * I documenti di una cosa, gia' con l'indirizzo firmato per aprirli.
 *
 * Le firme si chiedono tutte insieme con `createSignedUrls`: una
 * chiamata per documento sarebbe un viaggio in piu' per ogni riga.
 */
export function useDocumenti(ambito: AmbitoDocumento, riferimentoId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['documenti', ambito, riferimentoId, org?.id],
    enabled: Boolean(riferimentoId && org?.id),
    queryFn: async (): Promise<Documento[]> => {
      const { data, error } = await supabase
        .from('documenti')
        .select('id, ambito, riferimento_id, titolo, percorso, scadenza, note, created_at')
        .eq('ambito', ambito)
        .eq('riferimento_id', riferimentoId!)
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
      // meglio sapere che il computo c'e' e non poterlo aprire, che
      // credere che non sia mai stato caricato.
      if (erroreFirme) return data.map((d) => ({ ...d, url: null }) as Documento)

      const perPath = new Map((firme ?? []).map((f) => [f.path, f.signedUrl]))
      return data.map(
        (d) => ({ ...d, url: perPath.get(d.percorso) ?? null }) as Documento,
      )
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
      ambito,
      riferimentoId,
      file,
      titolo,
      scadenza,
      note,
    }: {
      ambito: AmbitoDocumento
      riferimentoId: string
      file: File
      titolo: string
      scadenza: string | null
      note: string | null
    }) => {
      const percorso = percorsoDocumento(org!.id, ambito, riferimentoId, file.name)

      const { error: erroreFile } = await supabase.storage
        .from(BUCKET)
        .upload(percorso, file, { contentType: file.type, upsert: false })
      if (erroreFile) throw erroreFile

      const { error } = await supabase.from('documenti').insert({
        org_id: org!.id,
        ambito,
        riferimento_id: riferimentoId,
        titolo,
        percorso,
        scadenza,
        note,
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
      qc.invalidateQueries({ queryKey: ['documenti', v.ambito, v.riferimentoId] })
    },
  })
}

/**
 * Corregge titolo, scadenza e note — NON il file.
 *
 * Sostituire il file vorrebbe dire che l'indirizzo resta lo stesso e il
 * contenuto cambia sotto i piedi di chi l'aveva aperto. Un documento
 * sbagliato si toglie e si ricarica: sono due gesti, ma nessuno dei due
 * mente su cosa e' successo.
 */
export function useCorreggiDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      titolo,
      scadenza,
      note,
    }: {
      id: string
      ambito: AmbitoDocumento
      riferimentoId: string
      titolo: string
      scadenza: string | null
      note: string | null
    }) => {
      const { error } = await supabase
        .from('documenti')
        .update({ titolo, scadenza, note, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['documenti', v.ambito, v.riferimentoId] })
    },
  })
}

/** Toglie prima la riga e poi il file: se il file non si cancella resta
 *  spazio occupato, ma la scheda e' gia' pulita. L'ordine opposto
 *  lascerebbe in elenco un documento che non si apre piu'. */
export function useEliminaDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      percorso,
    }: {
      id: string
      percorso: string
      ambito: AmbitoDocumento
      riferimentoId: string
    }) => {
      const { error } = await supabase.from('documenti').delete().eq('id', id)
      if (error) throw error
      await supabase.storage.from(BUCKET).remove([percorso])
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['documenti', v.ambito, v.riferimentoId] })
    },
  })
}
