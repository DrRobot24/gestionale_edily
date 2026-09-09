import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/* ══════════════════════════════════════════════════════════════════
   Le foto di cantiere.

   Due pezzi che devono restare allineati: il file dentro il bucket
   `rapportini` e la riga in `rapportino_foto` che dice che quel file
   esiste. Una riga senza file e' un'anteprima rotta, un file senza riga
   e' spazio occupato che nessuno trova piu'.

   Il bucket e' privato — lo chiude `supabase/schema/storage-rapportini.sql`
   — quindi non esistono URL permanenti: ogni immagine si guarda con un
   indirizzo firmato che scade. E' il motivo per cui le anteprime passano
   di qui e non da un semplice `getPublicUrl()`.
   ══════════════════════════════════════════════════════════════════ */

const BUCKET = 'rapportini'

/** Un'ora. Abbastanza per compilare e rileggere una scheda con calma,
 *  poco abbastanza perche' un indirizzo copiato per sbaglio in una chat
 *  non resti valido per sempre. */
const DURATA_FIRMA = 3600

/**
 * La convenzione di path, scritta una volta sola.
 *
 *     {org_id}/{cantiere_id}/{rapportino_id}/{file}
 *
 * I primi tre segmenti non sono ordine estetico: sono gli unici appigli
 * che le policy su storage.objects hanno per decidere. Il primo isola
 * l'impresa, il secondo applica lo scope per cantiere, il terzo permette
 * di risalire allo stato della scheda. Cambiarla qui senza cambiarla la'
 * rende i file illeggibili.
 */
export function percorsoFoto(
  orgId: string,
  cantiereId: string,
  rapportinoId: string,
  nomeFile: string,
): string {
  const pulito = nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
  return `${orgId}/${cantiereId}/${rapportinoId}/${Date.now()}-${pulito}`
}

export type Foto = {
  id: string
  storage_path: string
  didascalia: string | null
  scattata_at: string | null
  url: string | null
}

/**
 * Le foto di una scheda, gia' con l'indirizzo firmato per vederle.
 *
 * Le firme si chiedono tutte in una volta con createSignedUrls: una
 * chiamata per foto, su una connessione di cantiere, si sente.
 */
export function useFoto(rapportinoId: string | undefined) {
  return useQuery({
    queryKey: ['foto', rapportinoId],
    enabled: Boolean(rapportinoId),
    queryFn: async (): Promise<Foto[]> => {
      const { data, error } = await supabase
        .from('rapportino_foto')
        .select('id, storage_path, didascalia, scattata_at')
        .eq('rapportino_id', rapportinoId!)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) return []

      const { data: firme, error: erroreFirme } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          data.map((f) => f.storage_path),
          DURATA_FIRMA,
        )

      // Se le firme non arrivano si mostrano lo stesso le foto, senza
      // anteprima: meglio sapere che ci sono tre foto e non vederle, che
      // credere che non ce ne sia nessuna.
      if (erroreFirme) return data.map((f) => ({ ...f, url: null }))

      const perPath = new Map((firme ?? []).map((f) => [f.path, f.signedUrl]))
      return data.map((f) => ({ ...f, url: perPath.get(f.storage_path) ?? null }))
    },
  })
}

/**
 * Rimpicciolisce la foto prima di spedirla.
 *
 * Una foto di telefono pesa 3-5 MB. Cinque foto per scheda, sette schede
 * al giorno, dalla connessione di un cantiere: sono duecento megabyte
 * caricati in salita per guardare dei muri. A 1600 pixel di lato lungo
 * un muro con una crepa si vede uguale e il file sta in trecento
 * kilobyte.
 *
 * Se qualcosa non va — un HEIC che il browser non sa decodificare, una
 * canvas negata — si spedisce l'originale. Il caricamento di una foto
 * non deve fallire per colpa di un'ottimizzazione.
 */
export async function rimpicciolisci(file: File, latoMax = 1600): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scala = Math.min(1, latoMax / Math.max(bitmap.width, bitmap.height))
    if (scala === 1 && file.size < 1_000_000) {
      bitmap.close()
      return file
    }

    const tela = document.createElement('canvas')
    tela.width = Math.round(bitmap.width * scala)
    tela.height = Math.round(bitmap.height * scala)

    const ctx = tela.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, tela.width, tela.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((risolvi) =>
      tela.toBlob(risolvi, 'image/jpeg', 0.82),
    )
    if (!blob || blob.size >= file.size) return file

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

/**
 * Carica una foto e scrive la riga che la registra.
 *
 * Se la riga fallisce il file viene tolto subito: lasciarlo li' vorrebbe
 * dire occupare spazio con qualcosa che nessuna query trovera' mai.
 */
export async function caricaFoto(opzioni: {
  file: File
  orgId: string
  cantiereId: string
  rapportinoId: string
}): Promise<void> {
  const { orgId, cantiereId, rapportinoId } = opzioni
  const file = await rimpicciolisci(opzioni.file)
  const percorso = percorsoFoto(orgId, cantiereId, rapportinoId, file.name)

  const { error: erroreFile } = await supabase.storage
    .from(BUCKET)
    .upload(percorso, file, { contentType: file.type, upsert: false })
  if (erroreFile) throw new Error(`Non riesco a caricare ${opzioni.file.name}: ${erroreFile.message}`)

  const { error: erroreRiga } = await supabase.from('rapportino_foto').insert({
    org_id: orgId,
    rapportino_id: rapportinoId,
    storage_path: percorso,
    scattata_at: new Date(file.lastModified).toISOString(),
  })

  if (erroreRiga) {
    await supabase.storage.from(BUCKET).remove([percorso])
    throw new Error(`Foto caricata ma non registrata: ${erroreRiga.message}`)
  }
}

/** Prima la riga, poi il file. In quest'ordine: se la riga non si
 *  cancella — la RLS puo' dire di no — il file resta al suo posto e la
 *  foto continua a vedersi, invece di diventare un'anteprima rotta. */
export async function eliminaFoto(foto: { id: string; storage_path: string }): Promise<void> {
  const { error } = await supabase.from('rapportino_foto').delete().eq('id', foto.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([foto.storage_path])
}
