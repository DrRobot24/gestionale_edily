import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import { useMioDipendente } from '../anagrafiche/dipendenti'

/* ══════════════════════════════════════════════════════════════════
   COSA HO LASCIATO INDIETRO.

   Nasce il 2026-09-22 da un caso vero, trovato interrogando il
   database perche' dall'applicazione non si vedeva: Zito aveva quattro
   giornate ferme in due punti diversi — 21 e 22 settembre in `bozza`,
   mai inviate, e 17 e 18 in `inviato` da cinque giorni. Nessuna delle
   due cose era scritta da nessuna parte nel programma.

   «Il tecnico deve sapere che ha delle giornate mai inviate! Ed allo
   stesso modo deve sapere se gli sono state respinte alcune cose.
   Insomma consapevolezza al massimo» (utente).

   ── PERCHE' LA HOME NON BASTAVA ─────────────────────────────────────

   La home del tecnico parla del GIORNO che sta guardando: le card dei
   cantieri, il controllo delle ore, le sue ore. Tutto al presente.
   Una bozza di martedi' scorso non compare in nessuna di quelle
   schede, e il calendario la colora di rosso insieme ai giorni in cui
   non ha fatto niente — due casi diversi, stesso colore.

   Il risultato e' che una giornata dimenticata resta ferma per sempre
   in silenzio, e se ne accorge qualcuno a fine mese guardando le
   buste paga. Che e' il momento peggiore.

   ── COSA GUARDA ─────────────────────────────────────────────────────

   Tre cose che chiedono un gesto A LUI, e nessun'altra:

     bozze ferme     giornate e rapportini scritti e mai inviati. Il
                     gesto e' «mandali».
     respinti        il titolare li ha rimandati indietro, col motivo.
                     Il gesto e' «correggili e rimandali».
     in attesa       inviati e non ancora firmati. NON chiede un gesto a
                     lui, ma sapere da quanto aspettano evita di
                     ricompilarli credendoli persi — e dopo qualche
                     giorno e' lui a dover sollecitare.

   OGGI RESTA FUORI dalle bozze, ed e' deliberato: la giornata in corso
   e' normale che sia in bozza fino a sera, e segnalarla vorrebbe dire
   accendere un avviso ogni mattina per una cosa che non e' un problema.
   Si diventa «rimasto indietro» dal giorno dopo.
   ══════════════════════════════════════════════════════════════════ */

export type GiornataFerma = {
  id: string
  data: string
  stato: string
  motivo_rifiuto: string | null
  inviato_at: string | null
  ore: number
}

export type SchedaFerma = {
  id: string
  data: string
  stato: string
  motivo_rifiuto: string | null
  cantiere: string
}

export type RimastoIndietro = {
  /** Le MIE giornate di ore proprie ancora in bozza, oggi escluso. */
  bozze: GiornataFerma[]
  /** Le mie ore rimandate indietro dal titolare, col motivo. */
  respinte: GiornataFerma[]
  /** Le mie ore inviate e non ancora firmate. */
  inAttesa: GiornataFerma[]
  /** I rapportini che ho scritto e mai inviato, oggi escluso. */
  rapportiniInBozza: SchedaFerma[]
  /** I rapportini che il titolare mi ha rimandato indietro. */
  rapportiniRespinti: SchedaFerma[]
}

/** Quante cose chiedono un gesto A ME. L'attesa non si conta: non e'
 *  lavoro mio, e sommarla gonfierebbe un numero che serve a dire
 *  «quanto ti manca». */
export function quanteDaFare(r: RimastoIndietro): number {
  return (
    r.bozze.length +
    r.respinte.length +
    r.rapportiniInBozza.length +
    r.rapportiniRespinti.length
  )
}

/** Da quanti giorni aspetta. Le date sono giorni di calendario, quindi
 *  si contano a mezzanotte e non a ore: «due giorni» dev'essere lo
 *  stesso numero letto la mattina e la sera. */
export function giorniDa(iso: string): number {
  const [a, m, g] = iso.slice(0, 10).split('-').map(Number)
  const quel = new Date(a, m - 1, g)
  const ora = new Date()
  const oggiMezzanotte = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate())
  return Math.round((oggiMezzanotte.getTime() - quel.getTime()) / 86400000)
}

/**
 * Tutto cio' che il tecnico ha lasciato indietro, in una query sola.
 *
 * Il perimetro e' MIO: le ore proprie le filtra `dipendente_id`, i
 * rapportini `compilato_da`. Non e' una svista che la RLS mostrerebbe
 * anche altro — un tecnico vede i rapportini dei cantieri suoi, anche
 * scritti dai colleghi — ed e' proprio il motivo del filtro: qui si
 * risponde a «cosa devo fare IO», e un rapportino di un collega in
 * bozza non e' lavoro mio.
 *
 * Due mesi indietro e non tutto lo storico: una bozza di marzo non e'
 * piu' una cosa da mandare, e' un residuo da cancellare. Se un giorno
 * servisse, si guarda in «Le mie ore», che ha lo storico intero.
 */
export function useRimastoIndietro() {
  const { org, app } = useSession()
  const { data: mio } = useMioDipendente()

  return useQuery({
    queryKey: ['rimasto-indietro', org?.id, mio?.id, app?.userId],
    // Senza scheda collegata le ore proprie non esistono; i rapportini
    // si', quindi basta l'utente.
    enabled: Boolean(org?.id && app?.userId),
    queryFn: async (): Promise<RimastoIndietro> => {
      const oggi = new Date().toLocaleDateString('sv-SE')
      const dal = new Date()
      dal.setMonth(dal.getMonth() - 2)
      const daQuando = dal.toLocaleDateString('sv-SE')

      const [ore, schede] = await Promise.all([
        mio?.id
          ? supabase
              .from('ore_personali')
              .select(
                'id, data, stato, motivo_rifiuto, inviato_at, ore_ordinarie, ore_straordinarie, ore_assenza',
              )
              .eq('org_id', org!.id)
              .eq('dipendente_id', mio.id)
              .in('stato', ['bozza', 'respinto', 'inviato'])
              .gte('data', daQuando)
              .order('data', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('rapportini')
          .select('id, data, stato, motivo_rifiuto, cantieri ( codice, denominazione )')
          .eq('org_id', org!.id)
          .eq('compilato_da', app!.userId)
          .in('stato', ['bozza', 'respinto'])
          .gte('data', daQuando)
          .order('data', { ascending: false }),
      ])

      if (ore.error) throw ore.error
      if (schede.error) throw schede.error

      const righe = (ore.data ?? []) as {
        id: string
        data: string
        stato: string
        motivo_rifiuto: string | null
        inviato_at: string | null
        ore_ordinarie: number
        ore_straordinarie: number
        ore_assenza: number
      }[]

      const conOre = (r: (typeof righe)[number]): GiornataFerma => ({
        id: r.id,
        data: r.data,
        stato: r.stato,
        motivo_rifiuto: r.motivo_rifiuto,
        inviato_at: r.inviato_at,
        ore: Number(r.ore_ordinarie ?? 0) + Number(r.ore_straordinarie ?? 0),
      })

      const perCantiere = (s: {
        id: string
        data: string
        stato: string
        motivo_rifiuto: string | null
        cantieri: { codice: string; denominazione: string } | null
      }): SchedaFerma => ({
        id: s.id,
        data: s.data,
        stato: s.stato,
        motivo_rifiuto: s.motivo_rifiuto,
        cantiere: s.cantieri
          ? `${s.cantieri.codice} — ${s.cantieri.denominazione}`
          : 'Cantiere non indicato',
      })

      const tutteLeSchede = (schede.data ?? []) as unknown as Parameters<typeof perCantiere>[0][]

      return {
        // Oggi fuori dalle bozze: vedi la nota in testa al file.
        bozze: righe.filter((r) => r.stato === 'bozza' && r.data < oggi).map(conOre),
        respinte: righe.filter((r) => r.stato === 'respinto').map(conOre),
        inAttesa: righe.filter((r) => r.stato === 'inviato').map(conOre),
        rapportiniInBozza: tutteLeSchede
          .filter((s) => s.stato === 'bozza' && s.data < oggi)
          .map(perCantiere),
        rapportiniRespinti: tutteLeSchede
          .filter((s) => s.stato === 'respinto')
          .map(perCantiere),
      }
    },
  })
}
