import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Il foglio ore di chi non le presta a un cantiere solo.

   Nasce il 2026-09-17 da una frase dell'utente sul tecnico: «puo'
   lavorare anche 8 ore dall'ufficio e seguire telefonicamente tutti i
   cantieri». Le sue ore non appartengono a nessun cantiere, e
   obbligarlo a spalmarle su uno sarebbe scrivere una cosa falsa per far
   quadrare un modello.

   LA SEPARAZIONE, che e' il punto di tutto il modulo:

     sul RAPPORTINO   racconta il LAVORO del cantiere — cosa si e'
                      fatto, chi c'era, foto, materiali
     QUI              dichiara le PROPRIE ore, una volta al giorno,
                      senza dire su quale cantiere

   «Non gliene fotte un cazzo a nessuno dove lui dice che e' stato.
   Importa cio' che lui dice sul cantiere a cui e' stato assegnato».

   Nessuno compila le ore di un altro: la RLS lascia scrivere solo la
   riga della persona collegata al proprio utente. E' la regola gia'
   decisa per il tecnico — il rapporto e' di fiducia, se le autoriporta —
   e vale anche qui.
   ══════════════════════════════════════════════════════════════════ */

const CAMPI =
  'id, data, dipendente_id, ore_ordinarie, ore_straordinarie, ore_assenza, ' +
  'tipo_assenza, descrizione, stato, motivo_rifiuto, inviato_at, validato_at'

export type StatoOre = 'bozza' | 'inviato' | 'validato' | 'respinto'

export type GiornataPersonale = {
  id: string
  data: string
  dipendente_id: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
  tipo_assenza: string | null
  descrizione: string | null
  stato: StatoOre
  motivo_rifiuto: string | null
  inviato_at: string | null
  validato_at: string | null
}

/** Le stesse regole del rapportino, e per la stessa ragione: finche' il
 *  foglio e' sulla scrivania di chi lo scrive e' suo. */
export function modificabile(stato: StatoOre): boolean {
  return stato === 'bozza' || stato === 'respinto'
}

export function totaleOre(g: {
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
}): number {
  return Number(g.ore_ordinarie) + Number(g.ore_straordinarie) + Number(g.ore_assenza)
}

/**
 * Il mio foglio ore, dal piu' recente.
 *
 * Non serve filtrare per dipendente: la RLS mostra gia' solo le proprie
 * righe a chi non valida. Chi valida le vede tutte, ed e' voluto — la
 * stessa query serve la coda del titolare.
 */
export function useOrePersonali(limite = 60) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-personali', org?.id, limite],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ore_personali')
        // Una riga sola per quanto lunga: supabase-js ricava il tipo del
        // risultato leggendo questa stringa, e spezzarla gliela rende
        // illeggibile.
        .select(`${CAMPI}, dipendenti ( nome, cognome, tipo )`)
        .eq('org_id', org!.id)
        .order('data', { ascending: false })
        .limit(limite)

      if (error) throw error
      return data
    },
  })
}

/** La giornata di una data precisa, per il form. */
export function useGiornataPersonale(giorno: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-personali', 'giorno', giorno, org?.id],
    enabled: Boolean(giorno && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ore_personali')
        .select(CAMPI)
        .eq('org_id', org!.id)
        .eq('data', giorno!)
        // `maybeSingle` e non `single`: una giornata non ancora
        // compilata NON e' un errore, e' il caso normale di ogni
        // mattina. `single` risponderebbe 406 e la pagina mostrerebbe
        // un errore rosso al posto di un form vuoto.
        .maybeSingle()

      if (error) throw error
      return data as GiornataPersonale | null
    },
  })
}

export type DatiGiornata = {
  data: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
  tipo_assenza: string | null
  descrizione: string | null
}

/**
 * Salva la giornata: la crea se non c'e', la aggiorna se c'e'.
 *
 * Si passa da `upsert` sul vincolo (dipendente, data) invece di
 * decidere nel browser fra insert e update: fra la lettura e la
 * scrittura la riga potrebbe nascere altrove — un secondo dispositivo,
 * una scheda lasciata aperta — e l'insert fallirebbe con un 23505 che
 * l'utente non saprebbe interpretare.
 */
export function useSalvaGiornata() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dipendenteId,
      dati,
    }: {
      dipendenteId: string
      dati: DatiGiornata
    }) => {
      const { data, error } = await supabase
        .from('ore_personali')
        .upsert(
          { ...dati, dipendente_id: dipendenteId, org_id: org!.id },
          { onConflict: 'dipendente_id,data' },
        )
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) {
        throw new Error(
          'Il database non ti permette di scrivere questa giornata: controlla che sia ancora aperta.',
        )
      }
      return data.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ore-personali'] }),
  })
}

type Transizione = {
  id: string
  stato: StatoOre
  motivo_rifiuto?: string | null
  inviato_at?: string | null
  validato_at?: string | null
  validato_da?: string | null
}

/** Un hook solo per tutte le transizioni: cambiano i campi accessori,
 *  non la meccanica. Stessa forma di `useTransizione()` sui rapportini. */
export function useTransizioneOre() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...campi }: Transizione) => {
      const { data, error } = await supabase
        .from('ore_personali')
        .update(campi)
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('stato')
        .maybeSingle()

      if (error) throw error
      // Zero righe senza errore = la RLS ha filtrato. Senza questo
      // controllo si vedrebbe un successo silenzioso.
      if (!data) {
        throw new Error(
          'Il database non ti permette di cambiare stato a questa giornata.',
        )
      }
      return data.stato
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ore-personali'] }),
  })
}

export function useEliminaGiornata() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ore_personali')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ore-personali'] }),
  })
}
