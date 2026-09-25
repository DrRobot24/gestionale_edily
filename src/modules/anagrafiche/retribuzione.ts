import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
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

   ── IL CALCOLO, con la paga mensile ────────────────────────────────
   Deciso con l'utente, quattro risposte:

     tariffa del mese = paga mensile ÷ ore retribuite del mese

   dove le ORE RETRIBUITE sono quelle EFFETTIVE — ordinarie piu'
   straordinarie — piu' quelle di ferie, permessi e assenze giustificate
   (una giornata intera vale le ore del contratto — 8, o meno per un
   part-time — come nel foglio presenze). L'esempio
   dell'utente: 2000 € in un mese da 20 giorni di 8 ore → 2000 ÷ 20 =
   100 € al giorno → ÷ 8 = 12,50 €/h. Con giornate tutte da 8 e' lo
   stesso conto; con una giornata da 6 conta 6, perche' le ore sono
   quelle vere.

   Quindi il costo del mese resta la paga intera: chi lavora meno giorni
   costa di piu' all'ora, non prende di meno. Lo straordinario costa
   come l'ordinario. Le ore di trasferta non entrano: non sono ne' lavoro
   in cantiere ne' assenza, e il foglio presenze non le conta.

   SOLO LE GIORNATE VALIDATE DAL TITOLARE, perche' escono da
   `ore_griglia` come nel foglio presenze. Il mese in corso da' una
   tariffa PROVVISORIA, che si muove man mano che le giornate vengono
   firmate e diventa definitiva a fine mese (utente: «provvisoria, si
   aggiorna»).

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
  /** Scritta a mano da Stefania. */
  | { origine: 'manuale'; euroOra: number }
  /** Calcolata dalla paga mensile. `provvisoria` finche' il mese non e'
   *  finito. */
  | { origine: 'calcolata'; euroOra: number; paga: number; ore: number; provvisoria: boolean }
  /** Paga mensile, ma nessuna ora validata nel mese: non si puo'
   *  dividere per zero, e zero euro l'ora sarebbe falso. */
  | { origine: 'in-attesa'; paga: number }
  /** Ne' paga ne' tariffa. */
  | { origine: 'manca' }

/**
 * La tariffa oraria di una persona per il mese che contiene `giorno`.
 *
 * Il regime e' quello in vigore alla fine del mese, o oggi se il mese e'
 * in corso: una paga cambiata a meta' mese vale per tutto il mese. E' una
 * semplificazione voluta — il mese e' l'unita' della paga.
 */
export function tariffaDelMese(
  storico: Regime[],
  righe: OreGiorno[] | undefined,
  dipendenteId: string,
  giorno: string,
): TariffaDelMese {
  const oggi = new Date().toLocaleDateString('sv-SE')
  const { dal, al } = limitiMese(giorno)
  const riferimento = al < oggi ? al : oggi
  const regime = regimeVigente(storico, riferimento)

  if (!regime) return { origine: 'manca' }
  if (regime.tipo === 'tariffa') return { origine: 'manuale', euroOra: regime.importo }

  const ore = oreRetribuite(righe, dipendenteId, dal, al).totale
  if (ore <= 0) return { origine: 'in-attesa', paga: regime.importo }
  return {
    origine: 'calcolata',
    euroOra: regime.importo / ore,
    paga: regime.importo,
    ore,
    provvisoria: al >= oggi,
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
}

/**
 * Il mese di una persona: ore, assenze e quanto ha maturato.
 *
 * IL MATURATO SEGUE IL REGIME (utente, 2026-09-25):
 *   paga globale      la paga intera — chi lavora meno giorni costa di
 *                     piu' all'ora, non prende di meno. Zero finche' nel
 *                     mese non c'e' nessuna ora validata.
 *   paga giornaliera  tariffa × ore effettivamente lavorate: le ore di
 *                     ferie e permesso a tariffa non si pagano.
 */
export function rigaDelMese(
  storico: Regime[],
  righe: OreGiorno[] | undefined,
  dipendenteId: string,
  giorno: string,
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
  r.tariffa = tariffaDelMese(storico, righe, dipendenteId, giorno)

  if (r.tariffa.origine === 'calcolata') r.maturato = r.tariffa.paga
  else if (r.tariffa.origine === 'manuale') r.maturato = r.tariffa.euroOra * r.ore_lavorate

  // Al centesimo: e' un importo che finisce in un bonifico.
  r.maturato = Math.round(r.maturato * 100) / 100
  return r
}
