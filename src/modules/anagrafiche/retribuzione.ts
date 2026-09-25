import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import { eFeriale } from '../../lib/giorni'
import type { OreGiorno } from '../ore/useOrePeriodo'
import type { Stipendio } from './dipendenti'

/* ══════════════════════════════════════════════════════════════════
   LA RETRIBUZIONE di una risorsa: paga mensile OPPURE tariffa oraria,
   mai tutte e due. Regola dell'utente del 2026-09-25.

   «La tariffa oraria deve nascere in due modi diversi e mai insieme: o
   nasce da un inserimento manuale da parte di Stefania, oppure nasce dal
   calcolo che fa il programma, sulla base della paga mensile e dei
   giorni effettivamente lavorati, inclusi permessi e ferie.»

   ── I DUE REGIMI ───────────────────────────────────────────────────
   Tutti e due con lo storico, come prima: ogni riga ha la data da cui
   vale e non si corregge, se ne aggiunge una nuova. Vale la PIU' RECENTE
   GIA' COMINCIATA fra le due tabelle — `dipendente_stipendi` per la paga
   mensile, `dipendente_costi` per la tariffa scritta a mano. Passare
   dall'uno all'altro e' aggiungere una riga dell'altro tipo.

   ── IL CALCOLO, con la paga globale ────────────────────────────────
   Corretto dall'utente il 2026-09-25, guardando 44,44 €/h in una scheda:

     tariffa del mese = paga globale ÷ (giorni lavorabili del mese
                                        × ore della giornata piena)

   L'esempio dell'utente: 2000 € in un mese da 23 giorni lavorabili →
   2000 ÷ 23 = 86,96 € al giorno → ÷ 8 ore = 10,87 €/h.

   I GIORNI LAVORABILI sono i feriali, dal lunedi' al venerdi', contati
   sul calendario del mese — non i giorni che la persona ha lavorato.
   Stessa regola di `eFeriale`: i festivi infrasettimanali non si
   tolgono (vedi `lib/giorni.ts`). LA GIORNATA PIENA e' l'orario da
   contratto: 8 a tempo pieno, meno per un part-time.

   La prima versione (stesso giorno) divideva per le ore VALIDATE del
   mese — una risposta data prima, «giorni lavorati», presa alla
   lettera — e a meta' settembre, con 45 ore firmate, dava 44,44 €/h.
   Adesso la tariffa di un mese si conosce dal primo giorno e non si
   muove.

   QUELLO CHE PRENDE resta la paga intera: «quello che conta e' che
   quella risorsa prende quell'importo nel mese di riferimento». La
   tariffa e' il costo di un'ora, e serve a pesare le ore sui cantieri.
   Lo straordinario costa come l'ordinario.

   ── DOVE NON STA ───────────────────────────────────────────────────
   La tariffa calcolata non si scrive nel database: si ricava ogni volta
   da paga e ore, che sono le due verita'. Scriverla vorrebbe dire una
   terza copia da tenere allineata a ogni giornata firmata o respinta.
   ══════════════════════════════════════════════════════════════════ */

/** Una tariffa scritta a mano, come arriva con la scheda. */
export type TariffaManuale = {
  id: string
  valido_dal: string
  costo_orario: number
  costo_orario_straordinario: number | null
  note: string | null
}

export type Regime =
  | { tipo: 'paga'; id: string; valido_dal: string; importo: number; note: string | null }
  | { tipo: 'tariffa'; id: string; valido_dal: string; importo: number; note: string | null }

/** Paga mensile e tariffe in una lista sola, dalla piu' recente. */
export function storicoRegimi(
  stipendi: Stipendio[] | undefined,
  tariffe: TariffaManuale[] | null | undefined,
  dipendenteId: string,
): Regime[] {
  const paghe: Regime[] = (stipendi ?? [])
    .filter((s) => s.dipendente_id === dipendenteId)
    .map((s) => ({
      tipo: 'paga',
      id: s.id,
      valido_dal: s.valido_dal,
      importo: Number(s.importo_mensile),
      note: s.note,
    }))
  const orarie: Regime[] = (tariffe ?? []).map((t) => ({
    tipo: 'tariffa',
    id: t.id,
    valido_dal: t.valido_dal,
    importo: Number(t.costo_orario),
    note: t.note,
  }))
  return [...paghe, ...orarie].sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))
}

/** Il regime in vigore a una data: la riga piu' recente gia' cominciata,
 *  di qualunque dei due tipi. */
export function regimeVigente(storico: Regime[], aData: string): Regime | null {
  return storico.find((r) => r.valido_dal <= aData) ?? null
}

/** Primo e ultimo giorno del mese di una data, YYYY-MM-DD. */
export function limitiMese(giorno: string): { dal: string; al: string } {
  const [a, m] = giorno.split('-').map(Number)
  const dal = new Date(a, m - 1, 1).toLocaleDateString('sv-SE')
  const al = new Date(a, m, 0).toLocaleDateString('sv-SE')
  return { dal, al }
}

/** Le ore retribuite di una persona fra due date: lavorate (ordinarie +
 *  straordinarie) piu' ferie, permessi e assenze. Vedi in cima. */
export function oreRetribuite(
  righe: OreGiorno[] | undefined,
  dipendenteId: string,
  dal: string,
  al: string,
): { lavorate: number; assenza: number; totale: number } {
  let lavorate = 0
  let assenza = 0
  for (const r of righe ?? []) {
    if (r.dipendente_id !== dipendenteId || !r.data || r.data < dal || r.data > al) continue
    lavorate += Number(r.ore_ordinarie) + Number(r.ore_straordinarie)
    assenza += Number(r.ore_assenza)
  }
  return { lavorate, assenza, totale: lavorate + assenza }
}

export type TariffaDelMese =
  /** Scritta a mano da Stefania: paga giornaliera. */
  | { origine: 'manuale'; euroOra: number }
  /** Calcolata dalla paga globale: paga ÷ (giorni × ore al giorno). */
  | { origine: 'calcolata'; euroOra: number; paga: number; giorni: number; oreGiorno: number }
  /** Ne' paga ne' tariffa. */
  | { origine: 'manca' }

/** I giorni lavorabili del mese che contiene `giorno`: dal lunedi' al
 *  venerdi', sul calendario. */
export function giorniLavorabili(giorno: string): number {
  const { dal, al } = limitiMese(giorno)
  let n = 0
  const d = new Date(`${dal}T00:00:00`)
  for (;;) {
    const iso = d.toLocaleDateString('sv-SE')
    if (iso > al) break
    if (eFeriale(iso)) n += 1
    d.setDate(d.getDate() + 1)
  }
  return n
}

/**
 * La tariffa oraria di una persona per il mese che contiene `giorno`.
 *
 * Il regime e' quello in vigore alla fine del mese, o oggi se il mese e'
 * in corso: una paga cambiata a meta' mese vale per tutto il mese. E' una
 * semplificazione voluta — il mese e' l'unita' della paga.
 */
export function tariffaDelMese(
  storico: Regime[],
  giorno: string,
  /** La giornata piena da contratto: 8, o meno per un part-time. */
  oreGiorno: number = 8,
): TariffaDelMese {
  const oggi = new Date().toLocaleDateString('sv-SE')
  const { al } = limitiMese(giorno)
  const riferimento = al < oggi ? al : oggi
  const regime = regimeVigente(storico, riferimento)

  if (!regime) return { origine: 'manca' }
  if (regime.tipo === 'tariffa') return { origine: 'manuale', euroOra: regime.importo }

  const giorni = giorniLavorabili(giorno)
  return {
    origine: 'calcolata',
    euroOra: regime.importo / (giorni * oreGiorno),
    paga: regime.importo,
    giorni,
    oreGiorno,
  }
}

/* ── le scritture ─────────────────────────────────────────────────── */

/**
 * Cancella una tariffa scritta per sbaglio. Come per la paga mensile:
 * se la tariffa e' cambiata se ne aggiunge una nuova, non si cancella la
 * vecchia.
 */
export function useEliminaTariffa() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Una DELETE respinta dalla RLS tocca zero righe senza errore.
      const { data, error } = await supabase
        .from('dipendente_costi')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) {
        if (error.code === '23503') {
          throw new Error('Questa tariffa è già usata da documenti registrati: non si cancella.')
        }
        throw error
      }
      if (!data?.length) throw new Error('Non hai il permesso di cancellare questa tariffa.')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dipendenti'] })
      qc.invalidateQueries({ queryKey: ['dipendente'] })
    },
  })
}

/* ── la riga del Riepilogo economico ──────────────────────────────── */

/** Le assenze in tre mucchi. Il motivo e' testo libero (vedi i difetti
 *  noti in STATO_LAVORI): si riconosce dalla radice, maiuscole e spazi
 *  a parte, e cio' che non e' ne' ferie ne' permesso va in «altre» —
 *  malattia, infortunio, altro. */
export function categoriaAssenza(tipo: string | null): 'ferie' | 'permessi' | 'altre' {
  const t = (tipo ?? '').trim().toLowerCase()
  if (t.startsWith('feri')) return 'ferie'
  if (t.startsWith('perm')) return 'permessi'
  return 'altre'
}

export type RigaEconomica = {
  giorni: number
  ore_lavorate: number
  ore_straordinarie: number
  ore_ferie: number
  ore_permessi: number
  ore_altre: number
  tariffa: TariffaDelMese
  /** Quanto ha maturato nel mese, prima di acconti e trattenute. */
  maturato: number
  /** A paga globale, ma nel mese nessuna ora validata: il maturato resta
   *  a zero finche' non arriva la prima giornata firmata. */
  senzaOre: boolean
}

/**
 * Il mese di una persona: ore, assenze e quanto ha maturato.
 *
 * IL MATURATO SEGUE IL REGIME (utente, 2026-09-25):
 *   paga globale      la paga intera: «quello che conta e' che prende
 *                     quell'importo nel mese». Zero finche' nel mese non
 *                     c'e' nessuna ora validata.
 *   paga giornaliera  tariffa × ore effettivamente lavorate: le ore di
 *                     ferie e permesso a tariffa non si pagano.
 */
export function rigaDelMese(
  storico: Regime[],
  righe: OreGiorno[] | undefined,
  dipendenteId: string,
  giorno: string,
  oreGiorno: number = 8,
): RigaEconomica {
  const { dal, al } = limitiMese(giorno)
  const giorniLavorati = new Set<string>()
  const r: RigaEconomica = {
    giorni: 0,
    ore_lavorate: 0,
    ore_straordinarie: 0,
    ore_ferie: 0,
    ore_permessi: 0,
    ore_altre: 0,
    tariffa: { origine: 'manca' },
    maturato: 0,
    senzaOre: false,
  }

  for (const o of righe ?? []) {
    if (o.dipendente_id !== dipendenteId || !o.data || o.data < dal || o.data > al) continue
    const lav = Number(o.ore_ordinarie) + Number(o.ore_straordinarie)
    if (lav > 0) giorniLavorati.add(o.data)
    r.ore_lavorate += lav
    r.ore_straordinarie += Number(o.ore_straordinarie)
    const ass = Number(o.ore_assenza)
    if (ass > 0) r[`ore_${categoriaAssenza(o.tipo_assenza)}`] += ass
  }
  r.giorni = giorniLavorati.size
  r.tariffa = tariffaDelMese(storico, giorno, oreGiorno)

  const retribuite = r.ore_lavorate + r.ore_ferie + r.ore_permessi + r.ore_altre
  if (r.tariffa.origine === 'calcolata') {
    r.senzaOre = retribuite <= 0
    r.maturato = r.senzaOre ? 0 : r.tariffa.paga
  } else if (r.tariffa.origine === 'manuale') r.maturato = r.tariffa.euroOra * r.ore_lavorate

  // Al centesimo: e' un importo che finisce in un bonifico.
  r.maturato = Math.round(r.maturato * 100) / 100
  return r
}
