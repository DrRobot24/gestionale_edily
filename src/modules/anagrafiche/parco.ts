import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   IL PARCO: mezzi e attrezzature. Dal 2026-09-28.

   Due anagrafiche distinte e separate, decise con l'utente: i MEZZI
   hanno la targa (revisione, assicurazione), le ATTREZZATURE no (marca,
   modello, matricola, verifica periodica). Due tabelle — `mezzi` da
   wbs-office, `attrezzature` da `attrezzature.sql` — ma una sola coppia
   di pagine: elenco e scheda sono gli stessi gesti, cambiano i campi.
   I campi di ciascuna stanno in `CAMPI` qui sotto, ed e' l'unico posto
   dove differiscono.

   Le compilano l'amministrazione E il titolare, «ovviamente per
   aiutare» (utente, 2026-09-28): e' `anagrafiche.write`, che hanno tutti
   e due. Il tecnico le legge soltanto, dalla tendina del rapportino.
   ══════════════════════════════════════════════════════════════════ */

export type TipoParco = 'mezzi' | 'attrezzature'

type Tipo = 'testo' | 'data' | 'euro' | 'proprieta' | 'fornitore' | 'area'

export type Campo = {
  nome: string
  etichetta: string
  tipo: Tipo
  segnaposto?: string
  suggerimento?: string
  /** Occupa tutta la riga invece di mezza. */
  largo?: boolean
}

/** I campi della scheda vanno a gruppi, ognuno col suo titolo: dal
 *  2026-09-29, quando sono passati da otto a venti — «aumenta i campi
 *  che qua sono molto pochi» (utente). Venti caselle una dopo l'altra
 *  sono un modulo delle tasse; divise per argomento si trovano. */
export type Sezione = { titolo: string; campi: Campo[] }

/** Una riga, di qualunque delle due tabelle. */
export type RigaParco = {
  id: string
  descrizione: string
  attivo: boolean
  [campo: string]: string | number | boolean | null
}

/** Le sezioni comuni ai due tipi: chi e' il proprietario, e
 *  l'assicurazione — che c'e' anche su un'attrezzatura, una gru o un
 *  sollevatore. Il COSTO e' il premio annuo: il pagamento vero, con la
 *  sua data e il suo fornitore, si segna fra le spese. */
const PROPRIETA: Sezione = {
  titolo: 'Proprietà',
  campi: [
    { nome: 'proprieta', etichetta: 'Proprietà', tipo: 'proprieta' },
    { nome: 'fornitore_id', etichetta: 'Fornitore del noleggio', tipo: 'fornitore' },
    { nome: 'data_acquisto', etichetta: 'Data di acquisto', tipo: 'data' },
  ],
}

function assicurazione(scadenza: boolean): Sezione {
  return {
    titolo: 'Assicurazione',
    campi: [
      { nome: 'compagnia_assicurativa', etichetta: 'Compagnia assicuratrice', tipo: 'testo', segnaposto: 'Generali, Unipol, Allianz…' },
      { nome: 'numero_polizza', etichetta: 'Numero di polizza', tipo: 'testo' },
      {
        nome: 'costo_assicurazione',
        etichetta: 'Costo annuo (€)',
        tipo: 'euro',
        segnaposto: '1200,00',
        suggerimento: 'Il premio di un anno',
      },
      ...(scadenza
        ? [{ nome: 'scadenza_assicurazione', etichetta: 'Scadenza assicurazione', tipo: 'data' as const }]
        : []),
    ],
  }
}

const NOTE: Sezione = {
  titolo: 'Note',
  campi: [{ nome: 'note', etichetta: 'Note', tipo: 'area', largo: true }],
}

export const PARCO: Record<
  TipoParco,
  {
    titolo: string
    singolare: string
    percorso: string
    sottotitolo: string
    sezioni: Sezione[]
    /** Le colonne dell'elenco, oltre alla descrizione. */
    colonne: { nome: string; etichetta: string }[]
    /** Le scadenze da tenere d'occhio, col nome breve per l'elenco. */
    scadenze: { nome: string; etichetta: string; breve: string }[]
  }
> = {
  mezzi: {
    titolo: 'Mezzi',
    singolare: 'mezzo',
    percorso: '/anagrafiche/mezzi',
    sottotitolo: 'Tutto quello che ha la targa: furgoni, autocarri, escavatori omologati.',
    sezioni: [
      {
        titolo: 'Il mezzo',
        campi: [
          { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', segnaposto: 'Iveco Daily cassonato', largo: true },
          { nome: 'codice', etichetta: 'Codice interno', tipo: 'testo', segnaposto: 'M01' },
          { nome: 'tipo', etichetta: 'Tipo', tipo: 'testo', segnaposto: 'Furgone, autocarro, escavatore…' },
          { nome: 'marca', etichetta: 'Marca', tipo: 'testo', segnaposto: 'Iveco' },
          { nome: 'modello', etichetta: 'Modello', tipo: 'testo', segnaposto: 'Daily 35C14' },
          { nome: 'targa', etichetta: 'Targa', tipo: 'testo', segnaposto: 'AB123CD' },
          {
            nome: 'telaio',
            etichetta: 'Numero di telaio',
            tipo: 'testo',
            suggerimento: 'Il VIN, sul libretto alla lettera E',
          },
          { nome: 'data_immatricolazione', etichetta: 'Prima immatricolazione', tipo: 'data' },
        ],
      },
      PROPRIETA,
      assicurazione(true),
      {
        titolo: 'Scadenze',
        campi: [
          { nome: 'scadenza_revisione', etichetta: 'Scadenza revisione', tipo: 'data' },
          { nome: 'scadenza_bollo', etichetta: 'Scadenza bollo', tipo: 'data' },
        ],
      },
      NOTE,
    ],
    colonne: [
      { nome: 'targa', etichetta: 'Targa' },
      { nome: 'tipo', etichetta: 'Tipo' },
    ],
    scadenze: [
      { nome: 'scadenza_revisione', etichetta: 'Revisione', breve: 'Rev.' },
      { nome: 'scadenza_assicurazione', etichetta: 'Assicurazione', breve: 'Ass.' },
      { nome: 'scadenza_bollo', etichetta: 'Bollo', breve: 'Bollo' },
    ],
  },
  attrezzature: {
    titolo: 'Attrezzature',
    singolare: 'attrezzatura',
    percorso: '/anagrafiche/attrezzature',
    sottotitolo: 'Tutto quello che non ha la targa: demolitori, betoniere, trabattelli, generatori.',
    sezioni: [
      {
        titolo: 'L’attrezzatura',
        campi: [
          { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', segnaposto: 'Martello demolitore', largo: true },
          { nome: 'codice', etichetta: 'Codice interno', tipo: 'testo', segnaposto: 'A01' },
          { nome: 'categoria', etichetta: 'Categoria', tipo: 'testo', segnaposto: 'Demolizione, sollevamento, elettrico…' },
          { nome: 'marca', etichetta: 'Marca', tipo: 'testo', segnaposto: 'Hilti' },
          { nome: 'modello', etichetta: 'Modello', tipo: 'testo', segnaposto: 'TE 1000' },
          {
            nome: 'matricola',
            etichetta: 'Matricola',
            tipo: 'testo',
            suggerimento: 'Quella sulla targhetta: distingue due attrezzi uguali',
          },
        ],
      },
      PROPRIETA,
      assicurazione(true),
      {
        titolo: 'Verifiche',
        campi: [
          {
            nome: 'scadenza_verifica',
            etichetta: 'Prossima verifica periodica',
            tipo: 'data',
            suggerimento: 'INAIL (ex ISPESL) per sollevamento e ponteggi, impianti elettrici: quando va rifatta',
          },
        ],
      },
      NOTE,
    ],
    colonne: [
      { nome: 'categoria', etichetta: 'Categoria' },
      { nome: 'matricola', etichetta: 'Matricola' },
    ],
    scadenze: [
      { nome: 'scadenza_verifica', etichetta: 'Verifica periodica', breve: 'Ver.' },
      { nome: 'scadenza_assicurazione', etichetta: 'Assicurazione', breve: 'Ass.' },
    ],
  },
}

/** Tutti i campi della scheda, in fila. */
export function campiDi(tipo: TipoParco): Campo[] {
  return PARCO[tipo].sezioni.flatMap((s) => s.campi)
}

/* Le due tabelle hanno tipi diversi per supabase-js: le chiamate si
   fanno per ramo, e le righe escono nella forma comune `RigaParco`. */

export function useParco(tipo: TipoParco, { soloAttivi = true } = {}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['parco', tipo, org?.id, soloAttivi],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<RigaParco[]> => {
      const q =
        tipo === 'mezzi'
          ? supabase.from('mezzi').select('*').eq('org_id', org!.id)
          : supabase.from('attrezzature').select('*').eq('org_id', org!.id)
      const { data, error } = await (soloAttivi ? q.eq('attivo', true) : q).order('descrizione')
      if (error) throw error
      return (data ?? []) as unknown as RigaParco[]
    },
  })
}

export function useVoceParco(tipo: TipoParco, id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['parco', tipo, 'voce', id],
    enabled: Boolean(id && org?.id),
    queryFn: async (): Promise<RigaParco> => {
      const { data, error } =
        tipo === 'mezzi'
          ? await supabase.from('mezzi').select('*').eq('id', id!).eq('org_id', org!.id).single()
          : await supabase
              .from('attrezzature')
              .select('*')
              .eq('id', id!)
              .eq('org_id', org!.id)
              .single()
      if (error) throw error
      return data as unknown as RigaParco
    },
  })
}

function traduci(e: PostgrestError): Error | PostgrestError {
  if (e.code === '23505') return new Error('C’è già una voce con questo codice.')
  if (e.code === '23514')
    return new Error(`Il database rifiuta un valore: ${e.message}. Controlla la proprietà.`)
  return e
}

export function useSalvaParco(tipo: TipoParco) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: Record<string, string | number | null> }) => {
      // `descrizione` e' obbligatoria in tutte e due le tabelle: il form
      // la controlla prima di arrivare qui.
      const riga = { ...dati, descrizione: String(dati.descrizione ?? '') }
      if (id) {
        const { error } =
          tipo === 'mezzi'
            ? await supabase.from('mezzi').update(riga).eq('id', id).eq('org_id', org!.id)
            : await supabase.from('attrezzature').update(riga).eq('id', id).eq('org_id', org!.id)
        if (error) throw traduci(error)
        return id
      }
      const { data, error } =
        tipo === 'mezzi'
          ? await supabase
              .from('mezzi')
              .insert({ ...riga, org_id: org!.id })
              .select('id')
              .single()
          : await supabase
              .from('attrezzature')
              .insert({ ...riga, org_id: org!.id })
              .select('id')
              .single()
      if (error) throw traduci(error)
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parco', tipo] })
      qc.invalidateQueries({ queryKey: ['mezzi-attrezzature'] })
    },
  })
}

export function useArchiviaParco(tipo: TipoParco) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } =
        tipo === 'mezzi'
          ? await supabase.from('mezzi').update({ attivo }).eq('id', id).eq('org_id', org!.id)
          : await supabase.from('attrezzature').update({ attivo }).eq('id', id).eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parco', tipo] })
      qc.invalidateQueries({ queryKey: ['mezzi-attrezzature'] })
    },
  })
}

export function useEliminaParco(tipo: TipoParco) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } =
        tipo === 'mezzi'
          ? await supabase.from('mezzi').delete().eq('id', id).eq('org_id', org!.id)
          : await supabase.from('attrezzature').delete().eq('id', id).eq('org_id', org!.id)
      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'È già stato usato in qualche rapportino, ha delle spese o delle consegne segnate: eliminarlo le lascerebbe senza. Archivialo invece — sparisce dalla tendina ma lo storico resta.',
          )
        }
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parco', tipo] })
      qc.invalidateQueries({ queryKey: ['mezzi-attrezzature'] })
    },
  })
}

/** Una scadenza gia' passata o entro trenta giorni: da guardare. */
export function scadenzaVicina(data: string | null | undefined): 'scaduta' | 'vicina' | null {
  if (!data) return null
  const oggi = new Date().toLocaleDateString('sv-SE')
  if (data < oggi) return 'scaduta'
  const fra30 = new Date()
  fra30.setDate(fra30.getDate() + 30)
  return data <= fra30.toLocaleDateString('sv-SE') ? 'vicina' : null
}
