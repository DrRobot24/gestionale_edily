import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Dipendenti + tariffe storicizzate.

   `dipendente_costi` non e' un campo del dipendente: e' una serie
   temporale con `valido_dal`. Randazzo costa 28,50 €/h DAL 1 gennaio.
   Quando cambia il CCNL non si sovrascrive, si aggiunge una riga — cosi'
   un rapportino di gennaio continua a costare la tariffa di gennaio
   anche se lo si rilegge a dicembre. E' l'unico modo perche' un
   consuntivo resti vero nel tempo.
   ══════════════════════════════════════════════════════════════════ */

const CAMPI =
  'id, matricola, nome, cognome, codice_fiscale, mansione, livello_ccnl, tipo_contratto, ' +
  'data_impiego, data_assunzione, data_cessazione, telefono, email, attivo, user_id, tipo, ' +
  // La scheda della persona, dal 2026-09-18: vedi `scheda-personale.sql`.
  'data_nascita, luogo_nascita, residenza, patente, note, ' +
  'permesso_soggiorno, permesso_scadenza, dpi, stato_rapporto'

const CAMPI_CON_COSTI = `${CAMPI}, dipendente_costi ( id, valido_dal, costo_orario, costo_orario_straordinario, tariffa_vendita_oraria, note )`

type Tariffa = {
  id: string
  valido_dal: string
  costo_orario: number
  costo_orario_straordinario: number | null
  tariffa_vendita_oraria: number | null
  note: string | null
}

/**
 * La tariffa in vigore a una certa data: l'ultima che comincia entro
 * quella data. Non basta prendere la piu' recente in assoluto, perche'
 * si possono inserire in anticipo le tariffe del prossimo anno.
 */
export function tariffaVigente(tariffe: Tariffa[] | null, aData = new Date().toLocaleDateString('sv-SE')) {
  if (!tariffe?.length) return null
  return (
    tariffe
      .filter((t) => t.valido_dal <= aData)
      .sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))[0] ?? null
  )
}

/**
 * @param soloOperai  Chi puo' stare nella squadra di un cantiere.
 *
 *   Serve al form del rapportino, e non e' un filtro cosmetico: dal
 *   2026-09-17 il tecnico e gli impiegati NON hanno ore di cantiere —
 *   le dichiarano in `ore_personali` — e un trigger nel database
 *   rifiuta le loro righe in `rapportino_ore`.
 *
 *   Senza questo filtro comparivano lo stesso nella squadra: toglierli
 *   con la × funzionava a schermo, ma al ricaricamento l'elenco si
 *   ricostruisce dall'anagrafica e tornavano tutti. Una porta che si
 *   chiude e si riapre da sola.
 */
export function useDipendenti({ soloAttivi = true, soloOperai = false } = {}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['dipendenti', org?.id, soloAttivi, soloOperai],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      let q = supabase.from('dipendenti').select(CAMPI_CON_COSTI).eq('org_id', org!.id)
      if (soloAttivi) q = q.eq('attivo', true)
      if (soloOperai) q = q.eq('tipo', 'operaio')

      const { data, error } = await q.order('cognome')
      if (error) throw error
      return data
    },
  })
}

export function useDipendente(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['dipendente', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dipendenti')
        .select(CAMPI_CON_COSTI)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type TipoRisorsa = 'operaio' | 'tecnico' | 'impiegato'

/** Se un contratto c'e' o manca.
 *
 *  Si chiama cosi' di proposito, deciso con l'utente il 2026-09-18:
 *  `da_inquadrare` dice che manca un contratto senza lasciare scritta
 *  nel database la prova di un illecito. L'informazione operativa e' la
 *  stessa, il rischio no. Vedi `scheda-personale.sql`, blocco 4. */
export type StatoRapporto = 'assunto' | 'in_prova' | 'da_inquadrare'

export type DatiDipendente = {
  /** Operaio = va in cantiere e le sue ore stanno nel rapportino.
   *  Tecnico e impiegato dichiarano le proprie in `ore_personali`, e un
   *  trigger li rifiuta nelle ore di un cantiere. */
  tipo: TipoRisorsa
  matricola: string | null
  nome: string
  cognome: string
  codice_fiscale: string | null
  mansione: string | null
  livello_ccnl: string | null
  tipo_contratto: string | null
  /** Il primo giorno di lavoro, dal 2026-09-24. Puo' venire PRIMA
   *  dell'assunzione — prova, da inquadrare — mai dopo: lo impone un
   *  check, e un trigger la riempie con l'assunzione se manca. */
  data_impiego: string | null
  data_assunzione: string | null
  data_cessazione: string | null
  telefono: string | null
  email: string | null

  /* ── chi e' la persona, dal 2026-09-18 ── */
  data_nascita: string | null
  luogo_nascita: string | null
  residenza: string | null
  /** Testo libero: B, C, CQC, muletto, piattaforma aerea. Un enum
   *  vorrebbe dire una migrazione a ogni abilitazione nuova. */
  patente: string | null
  /** Patologie, limitazioni, contatti di emergenza. Dato sensibile:
   *  la scheda e' chiusa su `anagrafiche.write`. */
  note: string | null
  permesso_soggiorno: boolean
  /** Esiste solo se `permesso_soggiorno`: lo impone un check nel
   *  database, non solo il form. */
  permesso_scadenza: string | null
  /** Scarpe, casco, imbracatura: cosa gli e' stato consegnato. */
  dpi: string[]
  stato_rapporto: StatoRapporto

  /** L'utente che entra nel gestionale con questa anagrafica.
   *
   *  Serve a chi lavora E compila: un tecnico che passa in cantiere fa
   *  ore come tutti, ma senza questo collegamento non esiste in
   *  `dipendenti` e le sue ore non si possono scrivere da nessuna parte.
   *
   *  Collegarlo lo fa comparire nella tendina della squadra come
   *  chiunque altro, e il controllo delle 8 ore comincia a valere anche
   *  per lui senza una riga di codice in piu'. */
  user_id: string | null
}

/** Un solo hook per creare e per modificare: il chiamante passa l'id
 *  oppure no. Due hook quasi identici divergono al primo campo nuovo. */
export function useSalvaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiDipendente }) => {
      if (id) {
        const { error } = await supabase
          .from('dipendenti')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('dipendenti')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['dipendenti'] })
      qc.invalidateQueries({ queryKey: ['dipendente', id] })
    },
  })
}

export function useAggiungiTariffa() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (t: {
      dipendente_id: string
      valido_dal: string
      costo_orario: number
      costo_orario_straordinario: number | null
      tariffa_vendita_oraria: number | null
      note: string | null
    }) => {
      const { error } = await supabase.from('dipendente_costi').insert({ ...t, org_id: org!.id })
      if (error) throw error
    },
    onSuccess: (_, t) => {
      qc.invalidateQueries({ queryKey: ['dipendenti'] })
      qc.invalidateQueries({ queryKey: ['dipendente', t.dipendente_id] })
    },
  })
}

export function useArchiviaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase
        .from('dipendenti')
        .update({ attivo })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipendenti'] }),
  })
}

/**
 * Cancellazione vera, per il caso "l'ho appena inserito con un refuso".
 *
 * Se il dipendente ha gia' delle ore su un rapportino, Postgres rifiuta
 * con 23503 (violazione di chiave esterna) e noi lo traduciamo in una
 * frase leggibile invece di un codice. Non forziamo mai la mano: un
 * operaio con tre anni di rapportini si ARCHIVIA, non si cancella —
 * cancellarlo vorrebbe dire buttare via pezzi di storia contabile.
 */
export function useEliminaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dipendenti')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)

      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'Questo dipendente ha già delle ore registrate sui rapportini, quindi non può essere eliminato senza perderne la storia. Archivialo invece: sparisce dagli elenchi ma i documenti restano corretti.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipendenti'] }),
  })
}

/**
 * L'anagrafica di chi sta usando il gestionale, se ne ha una.
 *
 * Il legame passa da `dipendenti.user_id`, e serve a chi lavora E
 * compila: un tecnico che passa in cantiere fa ore come tutti, ma senza
 * questo collegamento non esiste in `dipendenti` e le sue ore non hanno
 * dove andare.
 *
 * Torna `null` senza errore quando il collegamento non c'e': non e' un
 * guasto, e' una cosa che l'amministrazione non ha ancora fatto dalla
 * scheda operaio. Chi legge questo hook deve comportarsi di conseguenza
 * invece di dare per scontato che ci sia.
 */
export function useMioDipendente() {
  const { org, app } = useSession()

  return useQuery({
    queryKey: ['dipendenti', 'mio', org?.id, app?.userId],
    enabled: Boolean(org?.id && app?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dipendenti')
        .select('id, nome, cognome')
        .eq('org_id', org!.id)
        .eq('user_id', app!.userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/* ══════════════════════════════════════════════════════════════════
   Lo stipendio pattuito, dal 2026-09-24.

   In una tabella sua e non in `dipendenti`, perche' `dipendenti` la
   legge anche il tecnico: qui la RLS chiude su `paghe.read`. Storico
   per data come le tariffe — si aggiunge, non si sovrascrive. Vedi
   `supabase/schema/risorse-impiego-stipendio.sql`.

   Chi non ha `paghe.read` non deve nemmeno chiedere: la query
   tornerebbe vuota, e un elenco vuoto si leggerebbe come «stipendio
   mancante» su tutti. Per questo `abilitato`.
   ══════════════════════════════════════════════════════════════════ */

export type Stipendio = {
  id: string
  dipendente_id: string
  valido_dal: string
  importo_mensile: number
  note: string | null
}

export function useStipendi({
  dipendenteId,
  abilitato,
}: {
  dipendenteId?: string
  abilitato: boolean
}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['stipendi', org?.id, dipendenteId ?? 'tutti'],
    enabled: Boolean(org?.id) && abilitato,
    queryFn: async (): Promise<Stipendio[]> => {
      let q = supabase
        .from('dipendente_stipendi')
        .select('id, dipendente_id, valido_dal, importo_mensile, note')
        .eq('org_id', org!.id)
      if (dipendenteId) q = q.eq('dipendente_id', dipendenteId)
      const { data, error } = await q.order('valido_dal', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Lo stipendio in vigore oggi: l'ultimo gia' cominciato. Come
 *  `tariffaVigente`, uno inserito in anticipo non conta finche' non
 *  arriva la sua data. */
export function stipendioVigente(
  stipendi: Stipendio[] | undefined,
  dipendenteId: string,
  aData = new Date().toLocaleDateString('sv-SE'),
) {
  return (
    (stipendi ?? [])
      .filter((s) => s.dipendente_id === dipendenteId && s.valido_dal <= aData)
      .sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))[0] ?? null
  )
}

export function useAggiungiStipendio() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (s: Omit<Stipendio, 'id'>) => {
      const { error } = await supabase
        .from('dipendente_stipendi')
        .insert({ ...s, org_id: org!.id })
      if (error) {
        if (error.code === '23505') {
          throw new Error('C’è già uno stipendio che parte da quel giorno.')
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stipendi'] }),
  })
}

export function useEliminaStipendio() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Una DELETE respinta dalla RLS tocca zero righe senza errore:
      // `.select()` dice se e' sparita davvero.
      const { data, error } = await supabase
        .from('dipendente_stipendi')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Non hai il permesso di cancellare questo stipendio.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stipendi'] }),
  })
}
