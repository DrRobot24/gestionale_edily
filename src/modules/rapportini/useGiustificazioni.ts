import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   LE GIUSTIFICAZIONI DELLE ORE.

   Chiesto dall'utente il 2026-09-21. Quando a una persona mancano ore
   per arrivare a otto — o ne ha in eccedenza non dichiarate — l'invio
   della giornata si blocca. Prima il tecnico leggeva «mancano 2 ore» e
   doveva CERCARE A MANO in quale rapportino stava quella persona.

   LA LOGICA, con le parole dell'utente: prima portami dove il dato gia'
   c'e', e solo se non basta fammelo scrivere.

     ammanco        vai al rapportino → se non risolve, campo libero
     straordinario  vai al rapportino dove l'ha segnato → ma se nasce
                    dalla SOMMA di piu' rapportini, campo libero
                    (quale rapportino apriresti?)

   CHI SCRIVE: solo il tecnico (`rapportini.create`). «La motivazione
   delle ore mancanti le scrive solo chi fa i rapportini. Infatti la
   validazione del titolare serve anche a questo: se il tecnico non
   motiva bene qualcosa si respinge il rapportino.»

   Lo schema sta in `supabase/schema/giustificazioni-ore.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type MotivoOre =
  | 'permesso'
  | 'malattia'
  | 'ferie'
  | 'infortunio'
  | 'recupero'
  | 'straordinario'
  | 'altro'

export type TipoGiustificazione = 'mancanza' | 'eccedenza'

/* Le parole in pagina. `straordinario` non compare fra i motivi di una
   MANCANZA — non si puo' mancare per straordinario — e infatti le due
   liste qui sotto sono diverse. */
export const MOTIVI: Record<MotivoOre, string> = {
  permesso: 'Permesso',
  malattia: 'Malattia',
  ferie: 'Ferie',
  infortunio: 'Infortunio',
  recupero: 'Recupero ore',
  straordinario: 'Straordinario',
  altro: 'Altro',
}

export const MOTIVI_DI: Record<TipoGiustificazione, MotivoOre[]> = {
  mancanza: ['permesso', 'malattia', 'ferie', 'infortunio', 'recupero', 'altro'],
  eccedenza: ['straordinario', 'recupero', 'altro'],
}

export type Giustificazione = {
  id: string
  dipendente_id: string
  data: string
  tipo: TipoGiustificazione
  motivo: MotivoOre
  descrizione: string | null
  ore: number
}

export type DatiGiustificazione = {
  dipendente_id: string
  tipo: TipoGiustificazione
  motivo: MotivoOre
  descrizione: string | null
  ore: number
}

/**
 * Le giustificazioni di una giornata, per tutte le persone.
 *
 * Una chiamata sola e non una per riga: le anomalie di un giorno sono
 * poche, e chiedere al server a ogni riga farebbe lampeggiare il
 * riquadro.
 */
export function useGiustificazioni(giorno: string) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['rapportini', 'giustificazioni', org?.id, giorno],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Map<string, Giustificazione>> => {
      const { data, error } = await supabase
        .from('giustificazioni_ore')
        .select('id, dipendente_id, data, tipo, motivo, descrizione, ore')
        .eq('org_id', org!.id)
        .eq('data', giorno)
      if (error) throw error

      // Una mappa per dipendente: chi la usa cerca sempre per persona.
      const per = new Map<string, Giustificazione>()
      for (const g of (data ?? []) as Giustificazione[]) {
        per.set(g.dipendente_id, g)
      }
      return per
    },
  })
}

export function useSalvaGiustificazione(giorno: string) {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dati: DatiGiustificazione) => {
      /* `upsert` sulla coppia (dipendente, data), che nel database ha un
         vincolo unico: la domanda «perche' quel giorno non fanno otto?»
         ha una risposta sola, e riscriverla deve correggere quella che
         c'e' invece di rifiutarsi. */
      const { error } = await supabase.from('giustificazioni_ore').upsert(
        {
          ...dati,
          data: giorno,
          org_id: org!.id,
          scritta_da: app!.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dipendente_id,data' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      /* Sotto ['rapportini'] c'e' anche il blocco dell'invio: scritta la
         motivazione, il pulsante deve sbloccarsi senza ricaricare. */
      qc.invalidateQueries({ queryKey: ['rapportini'] })
    },
  })
}

export function useEliminaGiustificazione(giorno: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dipendenteId: string) => {
      const { error } = await supabase
        .from('giustificazioni_ore')
        .delete()
        .eq('org_id', org!.id)
        .eq('dipendente_id', dipendenteId)
        .eq('data', giorno)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rapportini'] }),
  })
}

/* ─────────────────────────────────────────────────────────────────
   DOVE STANNO LE ORE DI UNA PERSONA, QUEL GIORNO

   Serve al pulsante «apri il rapportino». Passa da
   `v_ore_persona_giorno`, che e' `security_invoker`: mostra SOLO i
   rapportini che chi guarda gia' vede.

   E' esattamente il comportamento giusto, non un limite da aggirare: se
   le ore stanno sul cantiere di un collega qui non compaiono, e la
   pagina offre il campo libero invece di un pulsante che porterebbe a
   un 403. Il perimetro resta quello del 2026-09-10 — il tecnico vede
   solo i cantieri assegnati a lui.
   ───────────────────────────────────────────────────────────────── */

export type OreSuRapportino = {
  dipendente_id: string
  rapportino_id: string
  stato: string
  cantiere_id: string
  cantiere_codice: string
  cantiere: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
}

export function useOreSuRapportini(giorno: string) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['rapportini', 'ore-per-persona', org?.id, giorno],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Map<string, OreSuRapportino[]>> => {
      const { data, error } = await supabase
        .from('v_ore_persona_giorno')
        .select(
          'dipendente_id, rapportino_id, stato, cantiere_id, cantiere_codice, cantiere, ore_ordinarie, ore_straordinarie, ore_assenza',
        )
        .eq('org_id', org!.id)
        .eq('data', giorno)
      if (error) throw error

      const per = new Map<string, OreSuRapportino[]>()
      for (const r of (data ?? []) as OreSuRapportino[]) {
        const gia = per.get(r.dipendente_id)
        if (gia) gia.push(r)
        else per.set(r.dipendente_id, [r])
      }
      return per
    },
  })
}

/**
 * Dove mandare il tecnico che vuole sistemare le ore di una persona.
 *
 * Tre risposte diverse, e la terza e' quella che l'utente ha descritto
 * esplicitamente per lo straordinario:
 *
 *   un rapportino solo    ci si va dritti: e' li' che va corretto
 *   piu' rapportini       non si puo' scegliere per lui — «se lo
 *                         raggiunge con la somma di tutte le ore nei
 *                         vari rapportini allora si deve aprire il
 *                         campo di inserimento manuale»
 *   nessuno               le ore stanno su cantieri di colleghi, fuori
 *                         dal suo perimetro: resta solo il campo libero
 *
 * Un rapportino gia' validato non si corregge piu': mandarci il tecnico
 * vorrebbe dire fargli aprire una pagina in sola lettura senza dirgli
 * perche'.
 */
export function doveAndare(
  righe: OreSuRapportino[] | undefined,
): { tipo: 'uno'; rapportinoId: string; cantiere: string } | { tipo: 'molti' } | { tipo: 'nessuno' } {
  const correggibili = (righe ?? []).filter(
    (r) => r.stato === 'bozza' || r.stato === 'respinto',
  )
  if (correggibili.length === 0) return { tipo: 'nessuno' }
  if (correggibili.length === 1) {
    return {
      tipo: 'uno',
      rapportinoId: correggibili[0].rapportino_id,
      cantiere: correggibili[0].cantiere,
    }
  }
  return { tipo: 'molti' }
}

/** La tabella non c'e' ancora: e' un file dello schema mai eseguito,
 *  non un guasto. */
export function tabellaMancante(errore: Error): boolean {
  return /PGRST20[0-9]|does not exist|Could not find the table/i.test(errore.message)
}
