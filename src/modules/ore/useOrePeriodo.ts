import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le ore di un periodo, per persona e per cantiere.

   E' l'altro capo del flusso dei rapportini. Il rapportino e' il
   documento della giornata di UN cantiere; questa e' la riga di UNA
   PERSONA su un periodo, che e' cio' su cui si mettono le tariffe e da
   cui esce la busta paga.

   IL PERIODO E' LIBERO, e non ci sono due famiglie di funzioni "per
   settimana" e "per mese". La settimana e' il ritmo del controllo, il
   mese quello della firma (`periodi_paga` e' mensile), ma sono due
   estremi passati alla stessa funzione: due implementazioni della
   stessa regola sarebbero due posti dove puo' divergere.

   Passa da funzioni `security definer` e non dalle viste: le sette
   viste sono tutte `security_invoker=on`, quindi mostrano solo i
   cantieri nel perimetro di chi legge. Chi tiene l'amministrazione i
   cantieri non li ha assegnati: il totale gli tornerebbe zero, o monco,
   senza nessun errore. Un numero sbagliato che si presenta come giusto
   e' peggio di un numero che manca.

   Le funzioni stanno in `supabase/schema/ore-periodo.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type OrePersona = {
  dipendente_id: string
  nominativo: string
  matricola: string | null
  /** `operaio` | `tecnico` | `impiegato`. Serve a spiegare in pagina
   *  perche' certe persone non hanno il dettaglio per cantiere. */
  tipo: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_trasferta: number
  ore_assenza: number
  /** I GIORNI in cui ha lavorato, non le righe: chi in un giorno e'
   *  passato su tre cantieri ha tre righe e un giorno solo. */
  giorni_lavorati: number
  assenze: string | null
}

/** Una giornata su un cantiere, con cosa ci si e' fatto. Viene da
 *  `rapportini.note`, che nel form si chiama «Descrizione attività». */
export type GiornoAttivita = {
  data: string
  descrizione: string
}

export type OreCantiere = {
  dipendente_id: string
  nominativo: string
  cantiere_id: string
  cantiere_codice: string
  cantiere: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_trasferta: number
  giorni: number
  /** Le descrizioni delle giornate, gia' ordinate per data. Vuoto se il
   *  tecnico non ha scritto niente: e' un array, mai null, cosi' la
   *  pagina non distingue due casi per dire la stessa cosa. */
  giorni_attivita: GiornoAttivita[]
}

/**
 * Una casella della griglia: quanto ha fatto UNA persona in UN giorno.
 *
 * Arriva una riga solo per i giorni in cui c'e' qualcosa. I buchi —
 * ferie, riposo, un giorno non ancora validato — non viaggiano come
 * zeri: li disegna la pagina, che sa gia' quali giorni contiene il
 * periodo. Su una settimana di ferie sarebbero state tutte righe di
 * zeri.
 */
export type OreGiorno = {
  dipendente_id: string
  nominativo: string
  matricola: string | null
  tipo: string
  data: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_trasferta: number
  ore_assenza: number
  tipo_assenza: string | null
  /** Dove ha lavorato quel giorno, con le ore su ciascun cantiere. Non
   *  entra nella cella — che resta un numero solo — ma e' la prima cosa
   *  che si vede aprendola. Vuoto per chi tiene il foglio personale,
   *  che su nessun cantiere ci sta. */
  cantieri: CantiereDelGiorno[]
  /** Perche' quel giorno non fa otto ore, se il tecnico l'ha scritto.
   *  Viene da `giustificazioni_ore`, che ha gia' la forma della
   *  domanda: una riga per persona e giorno. */
  giustificazione: Giustificazione | null
}

/** Un cantiere dentro una giornata, con le ore che ci sono state fatte. */
export type CantiereDelGiorno = {
  cantiere_id: string
  codice: string | null
  denominazione: string | null
  ore: number
}

/**
 * Il motivo di una giornata che non torna.
 *
 * `tipo` dice da che parte non torna — `mancanza` sotto le otto ore,
 * `eccedenza` sopra — e `motivo` e' l'enum scelto dal tecnico. La
 * descrizione c'e' sempre quando il motivo e' `altro`, e puo' esserci
 * negli altri casi: e' il vincolo che mette il database.
 */
export type Giustificazione = {
  tipo: 'mancanza' | 'eccedenza'
  motivo: string
  descrizione: string | null
  ore: number
}

export type GiornateInSospeso = {
  stato: string
  giornate: number
  dal: string
  al: string
}

/* ─────────────────────────────────────────────────────────────────
   Il periodo: due estremi e un'etichetta.
   ───────────────────────────────────────────────────────────────── */

export type Passo = 'settimana' | 'mese'

export type Periodo = {
  passo: Passo
  dal: string
  al: string
}

export function iso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}

export function daIso(s: string): Date {
  const [a, m, g] = s.split('-').map(Number)
  return new Date(a, m - 1, g)
}

/**
 * Il lunedi' della settimana di una data.
 *
 * `getDay()` da' 0 per domenica: la domenica appartiene alla settimana
 * che si chiude, non a quella che si apre.
 */
export function lunediDi(data: Date): string {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  const giorno = d.getDay()
  d.setDate(d.getDate() - (giorno === 0 ? 6 : giorno - 1))
  return iso(d)
}

export function periodoDi(passo: Passo, dentro: Date): Periodo {
  if (passo === 'settimana') {
    const dal = lunediDi(dentro)
    const fine = daIso(dal)
    fine.setDate(fine.getDate() + 6)
    return { passo, dal, al: iso(fine) }
  }
  const primo = new Date(dentro.getFullYear(), dentro.getMonth(), 1)
  const ultimo = new Date(dentro.getFullYear(), dentro.getMonth() + 1, 0)
  return { passo, dal: iso(primo), al: iso(ultimo) }
}

/** Il periodo prima o dopo, dello stesso passo. */
export function sposta(p: Periodo, di: number): Periodo {
  const d = daIso(p.dal)
  if (p.passo === 'settimana') d.setDate(d.getDate() + di * 7)
  else d.setMonth(d.getMonth() + di)
  return periodoDi(p.passo, d)
}

/** Lo stesso momento, visto con l'altro passo: cambiando da settimana a
 *  mese si resta dentro lo stesso periodo invece di saltare a oggi. */
export function conPasso(p: Periodo, passo: Passo): Periodo {
  return periodoDi(passo, daIso(p.dal))
}

export function periodoCorrente(passo: Passo): Periodo {
  return periodoDi(passo, new Date())
}

/** «15 – 21 settembre 2026» per la settimana, «Settembre 2026» per il
 *  mese: un mese si nomina, non si descrive con due estremi. */
export function etichetta(p: Periodo): string {
  const da = daIso(p.dal)
  const a = daIso(p.al)
  const mese = (d: Date) => d.toLocaleDateString('it-IT', { month: 'long' })

  if (p.passo === 'mese') {
    const nome = mese(da)
    return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${da.getFullYear()}`
  }

  if (da.getMonth() === a.getMonth()) {
    return `${da.getDate()} – ${a.getDate()} ${mese(a)} ${a.getFullYear()}`
  }
  if (da.getFullYear() === a.getFullYear()) {
    return `${da.getDate()} ${mese(da)} – ${a.getDate()} ${mese(a)} ${a.getFullYear()}`
  }
  return `${da.getDate()} ${mese(da)} ${da.getFullYear()} – ${a.getDate()} ${mese(a)} ${a.getFullYear()}`
}

/** Il periodo contiene oggi: serve a non offrire l'avanti nel futuro. */
export function contieneOggi(p: Periodo): boolean {
  const o = iso(new Date())
  return p.dal <= o && o <= p.al
}

export function nelFuturo(p: Periodo): boolean {
  return p.dal > iso(new Date())
}

/* ─────────────────────────────────────────────────────────────────
   I tre hook.
   ───────────────────────────────────────────────────────────────── */

export function useOrePeriodo(p: Periodo) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-periodo', 'persone', org?.id, p.dal, p.al],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<OrePersona[]> => {
      const { data, error } = await supabase.rpc('ore_periodo', {
        p_org: org!.id,
        p_dal: p.dal,
        p_al: p.al,
      })
      if (error) throw error
      return (data ?? []) as OrePersona[]
    },
  })
}

/**
 * Il dettaglio per cantiere di TUTTO il periodo, in un colpo solo.
 *
 * Si prende tutto invece di chiedere una persona per volta aprendo la
 * sua riga: le righe sono poche — una per persona e cantiere — e una
 * chiamata al server a ogni click farebbe lampeggiare la pagina.
 */
export function useOrePeriodoCantieri(p: Periodo) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-periodo', 'cantieri', org?.id, p.dal, p.al],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<OreCantiere[]> => {
      const { data, error } = await supabase.rpc('ore_periodo_cantieri', {
        p_org: org!.id,
        p_dal: p.dal,
        p_al: p.al,
        p_dipendente: undefined,
      })
      if (error) throw error
      return (data ?? []) as unknown as OreCantiere[]
    },
  })
}

/**
 * Le ore di tutti, giorno per giorno: la materia della griglia.
 *
 * Si prende tutto il periodo in un colpo solo, come il dettaglio per
 * cantiere: le righe sono al massimo una per persona e giorno — su una
 * settimana di venti operai, centoventi — e chiederne una per cella
 * farebbe una tempesta di chiamate per disegnare una tabella.
 */
export function useOreGriglia(p: Periodo) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-periodo', 'griglia', org?.id, p.dal, p.al],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<OreGiorno[]> => {
      const { data, error } = await supabase.rpc('ore_griglia', {
        p_org: org!.id,
        p_dal: p.dal,
        p_al: p.al,
      })
      if (error) throw error
      return (data ?? []) as unknown as OreGiorno[]
    },
  })
}

/**
 * Quante giornate del periodo non sono ancora passate da Giuseppe.
 *
 * E' il numero piu' importante della pagina e non si vede nei totali:
 * se tre giornate sono ancora ferme, il totale e' incompleto e sembra
 * completo. Un totale che sembra completo finisce in busta paga.
 */
export function useGiornateInSospeso(p: Periodo) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-periodo', 'sospeso', org?.id, p.dal, p.al],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<GiornateInSospeso[]> => {
      const { data, error } = await supabase.rpc('periodo_da_validare', {
        p_org: org!.id,
        p_dal: p.dal,
        p_al: p.al,
      })
      if (error) throw error
      return (data ?? []) as GiornateInSospeso[]
    },
  })
}

/* ─────────────────────────────────────────────────────────────────
   Conti fatti in memoria.

   Attenzione: qui si SOMMANO righe che il database ha gia' aggregato
   dentro il suo perimetro completo, non si ricostruisce un totale
   partendo dalle ore grezze. La differenza e' tutta: il divieto di
   sommare nel browser riguarda dati filtrati dalla RLS, e queste righe
   arrivano da funzioni `security definer` che la RLS l'hanno gia'
   scavalcata apposta.
   ───────────────────────────────────────────────────────────────── */

export function perPersona(righe: OreCantiere[]): Map<string, OreCantiere[]> {
  const mappa = new Map<string, OreCantiere[]>()
  for (const r of righe) {
    const gia = mappa.get(r.dipendente_id)
    if (gia) gia.push(r)
    else mappa.set(r.dipendente_id, [r])
  }
  return mappa
}

export type Totali = {
  ordinarie: number
  straordinarie: number
  trasferta: number
  assenza: number
}

export function totaliDi(righe: OrePersona[]): Totali {
  return righe.reduce<Totali>(
    (t, r) => ({
      ordinarie: t.ordinarie + Number(r.ore_ordinarie),
      straordinarie: t.straordinarie + Number(r.ore_straordinarie),
      trasferta: t.trasferta + Number(r.ore_trasferta),
      assenza: t.assenza + Number(r.ore_assenza),
    }),
    { ordinarie: 0, straordinarie: 0, trasferta: 0, assenza: 0 },
  )
}

/**
 * Le ore di una persona che NON stanno su nessun cantiere.
 *
 * Nasce dal foglio ore personale: il tecnico «e' come un uccello che
 * vola sui cantieri» e le sue ore non appartengono a nessuno di essi,
 * cosi' come quelle di chi sta in ufficio. La pagina lo DICE, invece di
 * lasciarlo dedurre da una sottrazione: chi guarda una busta paga non
 * deve fare i conti per capire perche' due numeri non combaciano.
 */
export function oreSenzaCantiere(
  persona: OrePersona,
  suoiCantieri: OreCantiere[],
): number {
  const suCantiere = suoiCantieri.reduce(
    (s, c) => s + Number(c.ore_ordinarie) + Number(c.ore_straordinarie),
    0,
  )
  const totali = Number(persona.ore_ordinarie) + Number(persona.ore_straordinarie)
  const fuori = totali - suCantiere
  // Mai negativo: se i conti non tornassero per un arrotondamento,
  // meglio non dire niente che dire «-0,5 ore altrove».
  return fuori > 0.001 ? fuori : 0
}

/** Ore con la virgola all'italiana e senza decimali inutili: «8» e non
 *  «8,00», «7,5» e non «7,50». In una tabella di numeri gli zeri di
 *  coda sono rumore che allontana le colonne. */
export function ore(n: number | string): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

/* ─────────────────────────────────────────────────────────────────
   LA GRIGLIA: da righe piatte a persone x giorni.
   ───────────────────────────────────────────────────────────────── */

/**
 * I giorni del periodo, uno per uno: l'asse orizzontale della griglia.
 *
 * Si ricava dal PERIODO e non dai dati. Una colonna deve esserci anche
 * quando nessuno ha lavorato quel giorno, altrimenti la settimana
 * cambierebbe forma a seconda di chi era in ferie, e due settimane di
 * fila non si potrebbero confrontare.
 *
 * `soloFeriali` toglie sabato e domenica, ed e' cio' che vuole la
 * griglia: «ovviamente da lun a ven perche' i non feriali non si
 * lavora» (utente, 2026-09-22). Cinque colonne invece di sette lasciano
 * respirare i numeri, e un sabato lavorato — che capita — non sparisce:
 * le sue ore restano nel totale della riga, e la pagina lo dice.
 */
export function giorniDi(p: Periodo, soloFeriali = false): string[] {
  const giorni: string[] = []
  const fine = daIso(p.al)
  for (const d = daIso(p.dal); d <= fine; d.setDate(d.getDate() + 1)) {
    const g = iso(d)
    if (soloFeriali && (d.getDay() === 0 || d.getDay() === 6)) continue
    giorni.push(g)
  }
  return giorni
}

/**
 * Le ore che una persona ha fatto FUORI dalle colonne mostrate.
 *
 * Nascono dal sabato lavorato: la griglia mostra lunedi'-venerdi', ma
 * il totale della riga comprende tutto il periodo — deve, perche' e'
 * quello che finisce in busta paga. Senza questo numero la riga non
 * tornerebbe con le sue celle e sembrerebbe un errore di somma.
 */
export function fuoriGriglia(riga: RigaGriglia, giorni: string[]): number {
  const mostrati = new Set(giorni)
  let fuori = 0
  for (const [data, c] of riga.giorni) {
    if (!mostrati.has(data)) fuori += lavorate(c)
  }
  return fuori
}

/** Una riga della griglia: la persona, e cosa ha fatto ogni giorno. */
export type RigaGriglia = {
  dipendente_id: string
  nominativo: string
  matricola: string | null
  tipo: string
  /** Le caselle, per data. Manca la chiave dove non c'e' niente. */
  giorni: Map<string, OreGiorno>
  ordinarie: number
  straordinarie: number
  assenza: number
}

/** Le ore lavorate di una casella: ordinarie piu' straordinarie. E'
 *  il numero che si scrive nella cella, e non comprende le assenze —
 *  quelle sono tempo non lavorato e si dicono con una sigla. */
export function lavorate(c: OreGiorno): number {
  return Number(c.ore_ordinarie) + Number(c.ore_straordinarie)
}

/**
 * Impagina le righe piatte in una riga per persona.
 *
 * L'ordine e' quello che arriva dal database — cognome, nome — e non si
 * ricalcola qui: e' lo stesso di `ore_periodo`, e due pagine che
 * elencano le stesse persone in ordine diverso si leggono come due
 * elenchi diversi.
 */
export function inGriglia(righe: OreGiorno[]): RigaGriglia[] {
  const per = new Map<string, RigaGriglia>()

  for (const r of righe) {
    let riga = per.get(r.dipendente_id)
    if (!riga) {
      riga = {
        dipendente_id: r.dipendente_id,
        nominativo: r.nominativo,
        matricola: r.matricola,
        tipo: r.tipo,
        giorni: new Map(),
        ordinarie: 0,
        straordinarie: 0,
        assenza: 0,
      }
      per.set(r.dipendente_id, riga)
    }
    riga.giorni.set(r.data, r)
    riga.ordinarie += Number(r.ore_ordinarie)
    riga.straordinarie += Number(r.ore_straordinarie)
    riga.assenza += Number(r.ore_assenza)
  }

  return [...per.values()]
}

/** Il totale di una colonna: quante ore ha lavorato la squadra quel
 *  giorno. E' la lettura verticale della griglia, quella che dice «il
 *  venerdi' siamo sempre a mezzo servizio». */
export function totaleGiorno(righe: RigaGriglia[], giorno: string): number {
  return righe.reduce((s, r) => {
    const c = r.giorni.get(giorno)
    return c ? s + lavorate(c) : s
  }, 0)
}

/** «lun 15» — la data breve di una giornata di attivita'. */
export function giornoBreve(s: string): string {
  return daIso(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })
}

/** La funzione nel database non c'e' ancora: e' un file dello schema
 *  mai eseguito, non un guasto. */
export function funzioneMancante(errore: Error): boolean {
  return /PGRST202|Could not find the function|does not exist/i.test(errore.message)
}
