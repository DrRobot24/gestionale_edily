import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { giornoPiu } from '../../lib/formato'
import { useSession } from '../auth/SessionProvider'
import { lavorate, type OreGiorno } from '../ore/useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   L'economia di una risorsa, mese per mese.

   Nasce il 2026-09-23 (vedi `supabase/schema/economia-risorse.sql`).

   NESSUN NUMERO NUOVO SULLE ORE: giorni lavorati, ferie, malattia e
   permessi escono da `ore_griglia`, la stessa funzione del Foglio
   presenze, cioe' dalle sole giornate VALIDATE dal titolare. Qui si
   leggono per mese e per una persona sola; se un giorno i due numeri non
   tornassero, sarebbe un difetto di questo file e non del dato.

   Scritti a mano, e solo quelli: il NETTO in busta (dal cedolino del
   consulente) e il MONTE ferie/permessi con il saldo di partenza.
   ══════════════════════════════════════════════════════════════════ */

/** Le ore di una giornata piena A TEMPO PIENO. Per chi e' part-time il
 *  giorno vale il suo orario: vedi `oreContratto` (2026-09-25). */
export const ORE_GIORNO = 8

export type MeseRisorsa = {
  mese: number
  giorniLavorati: number
  oreOrdinarie: number
  oreStraordinarie: number
  /** Ore di assenza per motivo. I giorni sono ore / 8. */
  ferie: number
  malattia: number
  permesso: number
  altre: number
}

export type MonteFerie = {
  dipendente_id: string
  ferie_annue_ore: number
  permessi_annui_ore: number
  saldo_ferie_ore: number
  saldo_permessi_ore: number
  saldi_al: string
}

/**
 * Le giornate validate di una persona su un periodo qualunque.
 *
 * `ore_griglia` accetta al massimo un trimestre, quindi un anno si legge
 * a pezzi da 90 giorni. Ogni pezzo restituisce tutta l'impresa: si tiene
 * solo la persona che interessa.
 */
export function useGiornateRisorsa(dipendenteId: string | undefined, dal: string, al: string) {
  const { org } = useSession()

  return useQuery({
    // Sotto ['ore-periodo'] come il Foglio presenze: si aggiornano insieme.
    queryKey: ['ore-periodo', 'risorsa', org?.id, dipendenteId, dal, al],
    enabled: Boolean(org?.id && dipendenteId && dal <= al),
    retry: false,
    queryFn: async (): Promise<OreGiorno[]> => {
      const pezzi: { dal: string; al: string }[] = []
      for (let inizio = dal; inizio <= al; inizio = giornoPiu(inizio, 90)) {
        const fine = giornoPiu(inizio, 89)
        pezzi.push({ dal: inizio, al: fine < al ? fine : al })
      }

      const risposte = await Promise.all(
        pezzi.map((p) =>
          supabase.rpc('ore_griglia', { p_org: org!.id, p_dal: p.dal, p_al: p.al }),
        ),
      )

      const giorni: OreGiorno[] = []
      for (const r of risposte) {
        if (r.error) throw r.error
        for (const g of (r.data ?? []) as unknown as OreGiorno[]) {
          if (g.dipendente_id === dipendenteId && g.data) giorni.push(g)
        }
      }
      return giorni
    },
  })
}

/**
 * Il motivo di un'assenza, ricondotto alle quattro colonne della pagina.
 *
 * `tipo_assenza` e' testo: «Ferie», «Malattia», «Permesso», e in un
 * giorno sbagliato anche «Ferie, Permesso». Si prende la prima parola:
 * il caso doppio e' un errore di compilazione che il Foglio presenze
 * mostra gia' per intero.
 */
function colonnaDi(tipo: string | null): 'ferie' | 'malattia' | 'permesso' | 'altre' {
  const t = (tipo ?? '').split(',')[0].trim().toLowerCase()
  if (t.startsWith('ferie')) return 'ferie'
  if (t.startsWith('malattia')) return 'malattia'
  if (t.startsWith('permesso')) return 'permesso'
  return 'altre'
}

/** Le giornate di un anno, sommate per mese (1–12). */
export function perMese(giorni: OreGiorno[], anno: number): MeseRisorsa[] {
  const mesi: MeseRisorsa[] = Array.from({ length: 12 }, (_, i) => ({
    mese: i + 1,
    giorniLavorati: 0,
    oreOrdinarie: 0,
    oreStraordinarie: 0,
    ferie: 0,
    malattia: 0,
    permesso: 0,
    altre: 0,
  }))

  for (const g of giorni) {
    if (!g.data || Number(g.data.slice(0, 4)) !== anno) continue
    const m = mesi[Number(g.data.slice(5, 7)) - 1]
    if (lavorate(g) > 0) m.giorniLavorati += 1
    m.oreOrdinarie += Number(g.ore_ordinarie)
    m.oreStraordinarie += Number(g.ore_straordinarie)
    const assenza = Number(g.ore_assenza)
    if (assenza > 0) m[colonnaDi(g.tipo_assenza)] += assenza
  }
  return mesi
}

/**
 * Ferie o permessi: saldo, maturato, goduto, residuo — in ore.
 *
 * Matura 1/12 del monte annuo per ogni mese COMPLETATO dopo la data del
 * saldo: il mese in corso non e' ancora maturato. Il goduto sono le ore
 * di quel motivo nelle giornate validate DOPO la data del saldo, perche'
 * quelle prima sono gia' dentro il saldo del cedolino.
 */
export function contoFerie(
  monte: MonteFerie,
  giorni: OreGiorno[],
  voce: 'ferie' | 'permesso',
  oggi: string,
) {
  const annuo = voce === 'ferie' ? monte.ferie_annue_ore : monte.permessi_annui_ore
  const saldo = voce === 'ferie' ? monte.saldo_ferie_ore : monte.saldo_permessi_ore

  const [a0, m0] = monte.saldi_al.split('-').map(Number)
  const [a1, m1] = oggi.split('-').map(Number)
  const mesiCompleti = Math.max(0, (a1 - a0) * 12 + (m1 - m0))
  const maturato = (Number(annuo) / 12) * mesiCompleti

  const goduto = giorni
    .filter((g) => g.data && g.data > monte.saldi_al && colonnaDi(g.tipo_assenza) === voce)
    .reduce((t, g) => t + Number(g.ore_assenza), 0)

  return {
    saldo: Number(saldo),
    maturato,
    goduto,
    residuo: Number(saldo) + maturato - goduto,
  }
}

/**
 * Quanto ha percepito la persona, mese per mese, dal RIEPILOGO
 * ECONOMICO (dal 2026-09-25).
 *
 * Prima qui c'era il netto scritto a mano da Stefania dal cedolino
 * (`buste_paga`, mai attivata). Da quando il riepilogo del mese calcola
 * chi prende quanto — paga globale o giornaliera, acconti, rimborsi,
 * trattenute — quel numero c'e' gia', e scriverlo due volte vorrebbe
 * dire due cifre che prima o poi non tornano.
 *
 * PERCEPITO = maturato + rimborsi − trattenute. Gli acconti ci sono
 * dentro: sono soldi gia' dati durante il mese, non soldi in meno.
 *
 * Solo i mesi VALIDATI dal titolare hanno una cifra; un mese inviato e
 * non ancora firmato si dice come tale, non come un numero.
 */
export type PercepitoMese = { stato: 'validato' | 'inviato'; percepito: number | null }

export function usePercepito(dipendenteId: string | undefined, anno: number) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['paghe', 'percepito', org?.id, dipendenteId, anno],
    enabled: Boolean(org?.id && dipendenteId),
    retry: false,
    queryFn: async (): Promise<Map<number, PercepitoMese>> => {
      const { data: mesi, error } = await supabase
        .from('paghe_mesi')
        .select('id, mese, stato')
        .eq('org_id', org!.id)
        .eq('anno', anno)
        .in('stato', ['inviato', 'validato'])
      if (error) throw error
      const perMese = new Map<number, PercepitoMese>()
      if (!mesi?.length) return perMese

      const { data: righe, error: e2 } = await supabase
        .from('paghe_righe')
        .select('mese_id, maturato, rimborsi, trattenute')
        .eq('dipendente_id', dipendenteId!)
        .in(
          'mese_id',
          mesi.map((m) => m.id),
        )
      if (e2) throw e2

      for (const m of mesi) {
        const r = righe?.find((x) => x.mese_id === m.id)
        perMese.set(m.mese, {
          stato: m.stato as PercepitoMese['stato'],
          percepito:
            m.stato === 'validato' && r
              ? Number(r.maturato) + Number(r.rimborsi) - Number(r.trattenute)
              : null,
        })
      }
      return perMese
    },
  })
}

export function useMonteFerie(dipendenteId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['monte-ferie', org?.id, dipendenteId],
    enabled: Boolean(org?.id && dipendenteId),
    retry: false,
    queryFn: async (): Promise<MonteFerie | null> => {
      const { data, error } = await supabase
        .from('monte_ferie')
        .select(
          'dipendente_id, ferie_annue_ore, permessi_annui_ore, saldo_ferie_ore, saldo_permessi_ore, saldi_al',
        )
        .eq('org_id', org!.id)
        .eq('dipendente_id', dipendenteId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSalvaMonteFerie() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (m: MonteFerie) => {
      const { error } = await supabase
        .from('monte_ferie')
        .upsert({ ...m, org_id: org!.id, updated_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monte-ferie'] }),
  })
}
