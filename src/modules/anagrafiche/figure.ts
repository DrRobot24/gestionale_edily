import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   LE FIGURE: i personaggi di un cliente e di un cantiere.

   Chiesto dall'utente il 2026-09-21. Prima stavano nelle note come
   testo libero — «Amministratore: Ing. Renato La Runa, DL: Ing. Adriano
   De Franciscis» — dove sono scritte bene ma non servono a niente: non
   si cercano, non stanno in colonna, e non si puo' telefonare a
   nessuno.

   DOVE VIVE OGNI FIGURA, deciso dall'utente:

     sul CLIENTE    amministratore e referente. Non cambiano: sono
                    quelli qualunque lavoro si faccia.
     sul CANTIERE   DL, progettista, CSP, CSE, RSPP, ASPP, RUP,
                    collaudatore. Sono NOMINATI PER QUELL'OPERA — lo
                    stesso condominio che fa due interventi puo' avere
                    due DL diversi, e il CSE e' per definizione il
                    coordinatore *di quel cantiere*.

   Il database non impone questa divisione (accetta qualunque ruolo su
   qualunque ambito): e' il form a proporre i ruoli giusti. Una regola di
   prassi puo' avere eccezioni vere — un cliente con un tecnico di
   fiducia fisso — e inchiodarla nello schema vorrebbe dire una
   migrazione il giorno che capita.

   Lo schema sta in `supabase/schema/figure.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type AmbitoFigura = 'cliente' | 'cantiere'

export type RuoloFigura =
  | 'amministratore'
  | 'referente'
  | 'rup'
  | 'dl'
  | 'progettista'
  | 'csp'
  | 'cse'
  | 'rspp'
  | 'aspp'
  | 'collaudatore'
  | 'altro'

/* Come si chiamano le cose in pagina.

   Le sigle restano sigle — in cantiere nessuno dice «Coordinatore per
   la Sicurezza in fase di Esecuzione», dice CSE — ma accanto c'e' per
   esteso, perche' chi apre la tendina per la prima volta deve poter
   scegliere senza sapere il gergo. */
export const RUOLI: Record<RuoloFigura, { breve: string; esteso: string }> = {
  amministratore: { breve: 'Amministratore', esteso: 'Amministratore del condominio' },
  referente: { breve: 'Referente', esteso: 'La persona da chiamare per prima' },
  rup: { breve: 'RUP', esteso: 'Responsabile Unico del Procedimento' },
  dl: { breve: 'D.L.', esteso: 'Direttore dei Lavori' },
  progettista: { breve: 'Progettista', esteso: 'Chi ha firmato il progetto' },
  csp: { breve: 'CSP', esteso: 'Coordinatore Sicurezza in Progettazione' },
  cse: { breve: 'CSE', esteso: 'Coordinatore Sicurezza in Esecuzione' },
  rspp: { breve: 'RSPP', esteso: 'Responsabile Servizio Prevenzione e Protezione' },
  aspp: { breve: 'ASPP', esteso: 'Addetto Servizio Prevenzione e Protezione' },
  collaudatore: { breve: 'Collaudatore', esteso: 'Chi collauda l’opera' },
  altro: { breve: 'Altro', esteso: 'Un ruolo che non è in elenco' },
}

/** I ruoli che il form propone, per ambito. L'ordine e' quello in cui
 *  si leggono in una scheda: prima chi comanda, poi chi progetta, poi
 *  la sicurezza. E' lo stesso ordine dell'enum nel database, cosi' le
 *  righe arrivano gia' impaginate. */
export const RUOLI_DI: Record<AmbitoFigura, RuoloFigura[]> = {
  cliente: ['amministratore', 'referente', 'altro'],
  cantiere: [
    /* L'AMMINISTRATORE STA ANCHE QUI, dal 2026-09-22.

       Il 21 settembre era solo del cliente, col ragionamento che non
       cambia da un lavoro all'altro. Poi l'utente ha deciso il
       contrario — «e' un'informazione che riguarda il cantiere» — e ha
       ragione sul caso che conta: chi e' in cantiere cerca il numero
       dell'amministratore li', non risalendo al cliente.

       Resta ANCHE sul cliente: per un condominio con un amministratore
       stabile e' il posto giusto, e toglierlo vorrebbe dire riscriverlo
       a ogni lavoro. Il database accetta qualunque ruolo su qualunque
       ambito, quindi nessuna migrazione: e' il form a proporre.

       Primo della lista, prima del RUP: e' la persona che decide e
       che paga, e in un condominio e' il primo numero che si cerca. */
    'amministratore',
    'rup',
    'dl',
    'progettista',
    'csp',
    'cse',
    'rspp',
    'aspp',
    'collaudatore',
    'altro',
  ],
}

export type Figura = {
  id: string
  ambito: AmbitoFigura
  riferimento_id: string
  ruolo: RuoloFigura
  ruolo_libero: string | null
  titolo: string | null
  nominativo: string
  telefono: string | null
  email: string | null
  note: string | null
}

export type DatiFigura = {
  ruolo: RuoloFigura
  ruolo_libero: string | null
  titolo: string | null
  nominativo: string
  telefono: string | null
  email: string | null
  note: string | null
}

const SELECT =
  'id, ambito, riferimento_id, ruolo, ruolo_libero, titolo, nominativo, telefono, email, note' as const

/** Come si legge una figura in una riga: «Ing. Renato La Runa». */
export function nomeCompleto(f: Pick<Figura, 'titolo' | 'nominativo'>): string {
  return [f.titolo, f.nominativo].filter(Boolean).join(' ')
}

/** L'etichetta del ruolo, con lo scritto a mano quando e' «altro». */
export function etichettaRuolo(f: Pick<Figura, 'ruolo' | 'ruolo_libero'>): string {
  if (f.ruolo === 'altro') return f.ruolo_libero || 'Altro'
  return RUOLI[f.ruolo].breve
}

export function useFigure(ambito: AmbitoFigura, riferimentoId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['figure', ambito, riferimentoId],
    enabled: Boolean(riferimentoId && org?.id),
    queryFn: async (): Promise<Figura[]> => {
      const { data, error } = await supabase
        .from('figure')
        .select(SELECT)
        .eq('org_id', org!.id)
        .eq('ambito', ambito)
        .eq('riferimento_id', riferimentoId!)
        // Sull'enum l'ordine e' quello di dichiarazione, che e' quello
        // in cui le figure si leggono: non serve ordinarle a mano.
        .order('ruolo')
        .order('nominativo')
      if (error) throw error
      return data as Figura[]
    },
  })
}

export function useSalvaFigura(ambito: AmbitoFigura, riferimentoId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiFigura }) => {
      /* `ruolo_libero` va a null quando il ruolo non e' «altro»: il
         database ha un vincolo che lo impone, e senza questa riga
         cambiare da «Altro» a «CSE» lascerebbe il testo vecchio e
         farebbe rifiutare il salvataggio con un messaggio oscuro. */
      const pulito: DatiFigura = {
        ...dati,
        ruolo_libero: dati.ruolo === 'altro' ? dati.ruolo_libero : null,
      }

      if (id) {
        const { error } = await supabase
          .from('figure')
          .update(pulito)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('figure')
        .insert({
          ...pulito,
          ambito,
          riferimento_id: riferimentoId,
          org_id: org!.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['figure', ambito, riferimentoId] })
      // Le colonne negli elenchi vengono dalla vista: cambiata una
      // figura, quelle righe non sono piu' vere.
      qc.invalidateQueries({ queryKey: ['figure-riepilogo'] })
    },
  })
}

export function useEliminaFigura(ambito: AmbitoFigura, riferimentoId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('figure')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['figure', ambito, riferimentoId] })
      qc.invalidateQueries({ queryKey: ['figure-riepilogo'] })
    },
  })
}

/* ─────────────────────────────────────────────────────────────────
   LE COLONNE NEGLI ELENCHI

   «Le voglio vedere anche come colonne nella tabella riepilogativa
   panoramica, cosi' so ogni cantiere che personaggi ha all'interno».

   Una chiamata sola per tutto l'elenco, non una per riga: la vista
   `v_figure_riepilogo` ha gia' raggruppato e impaginato, e due DL sullo
   stesso cantiere arrivano nella stessa cella separati da virgola
   invece di raddoppiare la riga.
   ───────────────────────────────────────────────────────────────── */

export type FigureRiepilogo = {
  riferimento_id: string
  amministratore: string | null
  referente: string | null
  dl: string | null
  cse: string | null
  sicurezza: string | null
  quante: number
}

export function useFigureRiepilogo(ambito: AmbitoFigura) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['figure-riepilogo', ambito, org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<Map<string, FigureRiepilogo>> => {
      const { data, error } = await supabase
        .from('v_figure_riepilogo')
        .select('riferimento_id, amministratore, referente, dl, cse, sicurezza, quante')
        .eq('org_id', org!.id)
        .eq('ambito', ambito)
      if (error) throw error

      // Una mappa e non un array: chi la usa cerca sempre per id di
      // riga, e cercare in un array dentro un `map()` e' quadratico.
      const per = new Map<string, FigureRiepilogo>()
      for (const r of (data ?? []) as FigureRiepilogo[]) {
        if (r.riferimento_id) per.set(r.riferimento_id, r)
      }
      return per
    },
  })
}

/** La vista non c'e' ancora: e' un file dello schema mai eseguito, non
 *  un guasto. Gli elenchi mostrano le colonne vuote invece di rompersi. */
export function vistaMancante(errore: Error): boolean {
  return /PGRST20[0-9]|does not exist|Could not find the table/i.test(errore.message)
}
