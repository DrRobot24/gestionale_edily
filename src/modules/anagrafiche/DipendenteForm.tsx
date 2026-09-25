import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Campo, CampoArea, CampoSelect, Card, Cifra, Percorso, Table, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { RiquadroDocumentiPersona } from './RiquadroDocumentiPersona'
import { RiquadroStipendio } from './RiquadroStipendio'
import { useMembri } from '../cantieri/assegnazioni'
import {
  tariffaVigente,
  useDipendenti,
  useAggiungiTariffa,
  useArchiviaDipendente,
  useDipendente,
  useEliminaDipendente,
  useSalvaDipendente,
  dpiConsegnatiDi,
  patentiDi,
} from './dipendenti'

const CONTRATTI = ['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale']

/* MATRICOLA E LIVELLO CCNL SONO USCITI DALLA SCHEDA il 2026-09-25, su
   indicazione dell'utente. Le colonne restano nel database — le legge
   wbs-office, e chi ce le ha le conserva — ma il modulo non le mostra e
   non le riscrive: `DatiDipendente` le ha facoltative apposta. */

/** Suggerimenti per il tipo di patente o abilitazione. Non un elenco
 *  chiuso: si puo' scrivere quello che manca. */
const TIPI_PATENTE = [
  'B',
  'C',
  'CE',
  'CQC',
  'Carrello elevatore (muletto)',
  'PLE (piattaforma aerea)',
  'Gru su autocarro',
  'Escavatore',
  'Ponteggi (montaggio)',
]

/** I DPI che si consegnano davvero in un cantiere edile. Spunte e non
 *  testo libero: «scarpe», «scarpe antinf.» e «calzature» nella stessa
 *  colonna renderebbero impossibile chiedere chi ha cosa. Il campo nel
 *  database e' `text[]`, quindi aggiungerne uno domani non e' una
 *  migrazione. */
const DPI = [
  'Scarpe antinfortunistiche',
  'Casco',
  'Guanti',
  'Occhiali protettivi',
  'Imbracatura anticaduta',
  'Otoprotettori',
  'Gilet alta visibilita',
  'Mascherina / respiratore',
]

/* Perche' non e' assunto. L'assunzione e' una spunta a parte (vedi
   «In servizio e assunzione» nel modulo): qui restano le due ragioni
   per cui si e' in servizio senza contratto. */
const NON_ASSUNTO = [
  ['in_prova', 'In prova'],
  ['da_inquadrare', 'Da inquadrare — contratto ancora da fare'],
] as const

const vuotoSeVuoto = (v: string) => (v.trim() === '' ? null : v.trim())

const schema = z.object({
  cognome: z.string().min(1, 'Serve il cognome'),
  nome: z.string().min(1, 'Serve il nome'),
  codice_fiscale: z
    .string()
    .refine((v) => v === '' || v.trim().length === 16, 'Il codice fiscale ha 16 caratteri'),
  tipo: z.enum(['operaio', 'tecnico', 'impiegato']),
  mansione: z.string(),
  tipo_contratto: z.string(),
  data_impiego: z.string(),
  data_assunzione: z.string(),
  data_cessazione: z.string(),
  azienda_assunzione: z.string(),
  telefono: z.string(),
  email: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'Email non valida'),
  user_id: z.string(),

  /* ── la scheda della persona, dal 2026-09-18 ── */
  data_nascita: z.string(),
  luogo_nascita: z.string(),
  residenza: z.string(),
  note: z.string(),
  permesso_soggiorno: z.boolean(),
  permesso_scadenza: z.string(),
  /* Patenti e DPI con le date, dal 2026-09-25. La spunta «ha patenti»
     apre le righe; un DPI spuntato chiede il giorno della consegna. */
  ha_patenti: z.boolean(),
  patenti: z.array(
    z.object({ tipo: z.string(), conseguita_il: z.string(), scade_il: z.string() }),
  ),
  dpi_consegnati: z.array(z.object({ dpi: z.string(), consegnato_il: z.string() })),
  stato_rapporto: z.enum(['assunto', 'in_prova', 'da_inquadrare']),
})
  /* La scadenza si chiede solo se il permesso c'e', ed e' obbligatoria
     quando c'e': un permesso senza data non risponde alla domanda per
     cui esiste il campo, cioe' «quando va rinnovato». Il database ha il
     suo check, ma quello rifiuta il caso opposto — data senza permesso —
     e un 23514 non e' una frase leggibile. */
  /* «Non ci puo' essere assunzione senza impiego, ma impiego senza
     assunzione si'» (2026-09-24). Il database ha lo stesso check; qui
     serve a dirlo con una frase invece che con un 23514. L'impiego
     vuoto con l'assunzione piena invece passa: lo riempie il trigger
     con la data di assunzione, che e' l'unica cosa certa. */
  .refine((v) => !v.data_impiego || !v.data_assunzione || v.data_impiego <= v.data_assunzione, {
    message: 'Il servizio non può cominciare dopo l’assunzione',
    path: ['data_impiego'],
  })
  /* IL PERIODO DI SERVIZIO, e l'assunzione che ci sta dentro
     (2026-09-25). Il database ha gli stessi check; qui servono a dirlo
     con una frase. */
  .refine((v) => !v.data_cessazione || !v.data_impiego || v.data_cessazione >= v.data_impiego, {
    message: 'La fine del servizio viene prima dell’inizio',
    path: ['data_cessazione'],
  })
  .refine(
    (v) =>
      v.stato_rapporto !== 'assunto' ||
      !v.data_cessazione ||
      !v.data_assunzione ||
      v.data_assunzione <= v.data_cessazione,
    { message: 'L’assunzione non può cominciare dopo la fine del servizio', path: ['data_assunzione'] },
  )
  /* Assunto vuol dire un contratto: DA QUANDO e CON CHI. Una spunta
     senza queste due cose non risponde a nessuna delle domande per cui
     esiste. */
  .refine((v) => v.stato_rapporto !== 'assunto' || v.data_assunzione !== '', {
    message: 'Da quando è assunto?',
    path: ['data_assunzione'],
  })
  .refine((v) => v.stato_rapporto !== 'assunto' || v.azienda_assunzione.trim() !== '', {
    message: 'Con quale azienda è assunto?',
    path: ['azienda_assunzione'],
  })
  /* Ogni patente dice COSA e almeno UNA DATA: «B» senza date non
     risponde alla domanda per cui il campo esiste — fino a quando vale.
     E ogni DPI spuntato dice QUANDO e' stato consegnato. Gli errori
     vanno sulla riga che li ha, non in cima al modulo. Solo per gli
     operai: per gli altri il riquadro non c'e'. */
  .superRefine((v, ctx) => {
    if (v.tipo !== 'operaio') return
    if (v.ha_patenti) {
      if (v.patenti.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Aggiungi almeno una patente', path: ['ha_patenti'] })
      }
      v.patenti.forEach((p, i) => {
        if (p.tipo.trim() === '') {
          ctx.addIssue({ code: 'custom', message: 'Quale patente?', path: ['patenti', i, 'tipo'] })
        }
        if (!p.conseguita_il && !p.scade_il) {
          ctx.addIssue({
            code: 'custom',
            message: 'Serve almeno una data',
            path: ['patenti', i, 'conseguita_il'],
          })
        }
        if (p.conseguita_il && p.scade_il && p.scade_il < p.conseguita_il) {
          ctx.addIssue({
            code: 'custom',
            message: 'Scade prima di essere conseguita',
            path: ['patenti', i, 'scade_il'],
          })
        }
      })
    }
    v.dpi_consegnati.forEach((d, i) => {
      if (!d.consegnato_il) {
        ctx.addIssue({
          code: 'custom',
          message: 'Quando è stato consegnato?',
          path: ['dpi_consegnati', i, 'consegnato_il'],
        })
      }
    })
  })
  .refine((v) => !v.permesso_soggiorno || v.permesso_scadenza !== '', {
    message: 'Quando scade il permesso?',
    path: ['permesso_scadenza'],
  })

type Campi = z.infer<typeof schema>

const VUOTO: Campi = {
  cognome: '',
  nome: '',
  codice_fiscale: '',
  tipo: 'operaio' as const,
  mansione: '',
  tipo_contratto: '',
  data_impiego: '',
  data_assunzione: '',
  data_cessazione: '',
  azienda_assunzione: '',
  telefono: '',
  email: '',
  user_id: '',
  data_nascita: '',
  luogo_nascita: '',
  residenza: '',
  note: '',
  permesso_soggiorno: false,
  permesso_scadenza: '',
  ha_patenti: false,
  patenti: [],
  dpi_consegnati: [],
  /* Una risorsa nuova parte NON assunta: il contratto e' il passo in
     piu', e si spunta quando c'e'. Prima il default era «assunto», e
     schede mai toccate risultavano assunte senza data ne' azienda. */
  stato_rapporto: 'in_prova' as const,
}

/** L'intestazione di un riquadro. Quattro gruppi di campi hanno bisogno
 *  di dire di cosa parlano, e una <h2> nuda in mezzo a un form si perde
 *  fra le etichette dei campi. */
function Titolo({ children, nota }: { children: React.ReactNode; nota?: string }) {
  return (
    <div className="border-b-2 border-black bg-amber-100 px-5 py-2.5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">{children}</h2>
      {nota && <p className="text-xs font-semibold text-gray-700">{nota}</p>}
    </div>
  )
}

export function DipendenteForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')
  const puoVederePaghe = usePermission('paghe.read')

  const { data: dipendente, isPending, error } = useDipendente(id)
  const { data: membri } = useMembri()
  // Anche gli archiviati: una scheda archiviata tiene comunque occupato
  // il suo utente, e riassegnarlo conterebbe le ore due volte.
  const { data: tutti } = useDipendenti({ soloAttivi: false })
  const salva = useSalvaDipendente()
  const archivia = useArchiviaDipendente()
  const elimina = useEliminaDipendente()

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: VUOTO })

  /* Il tipo scelto ADESSO, non quello salvato: la tendina dell'utente
     deve comparire nel momento in cui si sceglie «tecnico», non dopo
     aver salvato e riaperto la scheda. */
  const tipoScelto = useWatch({ control, name: 'tipo' })
  /* Stessa ragione: la data di scadenza deve comparire nell'istante in
     cui si spunta il permesso, non dopo aver salvato. */
  const haPermesso = useWatch({ control, name: 'permesso_soggiorno' })
  /* Patenti e DPI con le date (2026-09-25). Le patenti sono righe che si
     aggiungono e si tolgono; i DPI una lista fissa, e spuntarne uno
     aggiunge la riga con la sua data da scrivere. */
  const haPatenti = useWatch({ control, name: 'ha_patenti' })
  const patenti = useFieldArray({ control, name: 'patenti' })
  const consegnati = useWatch({ control, name: 'dpi_consegnati' }) ?? []
  function cambiaDpi(nuovi: { dpi: string; consegnato_il: string }[]) {
    // Dopo il primo invio l'errore si aggiorna mentre si scrive la data.
    setValue('dpi_consegnati', nuovi, { shouldDirty: true, shouldValidate: isSubmitted })
  }
  /* Stessa ragione per l'assunzione: data e azienda compaiono quando
     si spunta. E il servizio, per avvisare subito chi lo lascia vuoto. */
  const statoRapporto = useWatch({ control, name: 'stato_rapporto' })
  const assunto = statoRapporto === 'assunto'
  const inServizioDal = useWatch({ control, name: 'data_impiego' })
  /* Togliendo la spunta si torna alla ragione di prima, se c'era: chi
     la rimette e la toglie per sbaglio non deve perdere «da
     inquadrare». */
  const [nonAssunto, setNonAssunto] = useState<'in_prova' | 'da_inquadrare'>('in_prova')

  /* Come si chiama quello che si sta creando. La scheda non fa piu'
     solo operai — Stefania ci registra sé stessa e il tecnico — e
     «Crea operaio» su una scheda da impiegato e' semplicemente falso. */
  const comeSiChiama =
    tipoScelto === 'impiegato' ? 'impiegato' : tipoScelto === 'tecnico' ? 'tecnico' : 'operaio'

  const giaCollegati = new Set(
    (tutti ?? []).filter((d) => d.user_id && d.id !== id).map((d) => d.user_id as string),
  )
  const collegabili = (membri ?? []).filter((m) => !giaCollegati.has(m.userId))

  useEffect(() => {
    if (!dipendente) return
    reset({
      cognome: dipendente.cognome,
      nome: dipendente.nome,
      codice_fiscale: dipendente.codice_fiscale ?? '',
      tipo: dipendente.tipo ?? 'operaio',
      mansione: dipendente.mansione ?? '',
      tipo_contratto: dipendente.tipo_contratto ?? '',
      data_impiego: dipendente.data_impiego ?? '',
      data_assunzione: dipendente.data_assunzione ?? '',
      data_cessazione: dipendente.data_cessazione ?? '',
      azienda_assunzione: dipendente.azienda_assunzione ?? '',
      telefono: dipendente.telefono ?? '',
      email: dipendente.email ?? '',
      user_id: dipendente.user_id ?? '',
      data_nascita: dipendente.data_nascita ?? '',
      luogo_nascita: dipendente.luogo_nascita ?? '',
      residenza: dipendente.residenza ?? '',
      note: dipendente.note ?? '',
      permesso_soggiorno: dipendente.permesso_soggiorno ?? false,
      permesso_scadenza: dipendente.permesso_scadenza ?? '',
      ha_patenti: patentiDi(dipendente.patenti).length > 0,
      patenti: patentiDi(dipendente.patenti).map((p) => ({
        tipo: p.tipo,
        conseguita_il: p.conseguita_il ?? '',
        scade_il: p.scade_il ?? '',
      })),
      dpi_consegnati: dpiConsegnatiDi(dipendente.dpi_consegnati).map((d) => ({
        dpi: d.dpi,
        consegnato_il: d.consegnato_il ?? '',
      })),
      stato_rapporto: dipendente.stato_rapporto ?? 'assunto',
    })
  }, [dipendente, reset])

  if (!nuovo && isPending) {
    return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  }
  if (error) return <Avviso tono="errore">Non trovo questa persona: {error.message}</Avviso>

  async function onSubmit(c: Campi) {
    const salvato = await salva.mutateAsync({
      id,
      dati: {
        cognome: c.cognome.trim(),
        nome: c.nome.trim(),
        codice_fiscale: vuotoSeVuoto(c.codice_fiscale)?.toUpperCase() ?? null,
        tipo: c.tipo,
        mansione: vuotoSeVuoto(c.mansione),
        /* Il tipo di contratto esiste solo se c'e' un contratto: se ne
           va con la spunta dell'assunzione, come la data e l'azienda. */
        tipo_contratto:
          c.stato_rapporto === 'assunto' ? vuotoSeVuoto(c.tipo_contratto) : null,
        data_impiego: vuotoSeVuoto(c.data_impiego),
        /* Data e azienda dell'assunzione se ne vanno insieme alla
           spunta: una data rimasta li' direbbe «assunto» a chiunque
           legga la colonna, contro la spunta tolta. */
        data_assunzione: c.stato_rapporto === 'assunto' ? vuotoSeVuoto(c.data_assunzione) : null,
        azienda_assunzione:
          c.stato_rapporto === 'assunto' ? vuotoSeVuoto(c.azienda_assunzione) : null,
        data_cessazione: vuotoSeVuoto(c.data_cessazione),
        telefono: vuotoSeVuoto(c.telefono),
        email: vuotoSeVuoto(c.email),
        user_id: vuotoSeVuoto(c.user_id),

        data_nascita: vuotoSeVuoto(c.data_nascita),
        luogo_nascita: vuotoSeVuoto(c.luogo_nascita),
        residenza: vuotoSeVuoto(c.residenza),
        note: vuotoSeVuoto(c.note),
        stato_rapporto: c.stato_rapporto,

        /* Patente e DPI SOLO PER GLI OPERAI, e si azzerano cambiando
           tipo. Non e' pulizia formale: la scheda di chi passa a
           «impiegato» nasconde quei campi, e lasciarci dentro i vecchi
           valori vorrebbe dire un dato che nessuno vede piu' e che
           nessuno puo' piu' correggere. */
        ...(() => {
          if (c.tipo !== 'operaio') {
            return { patente: null, patenti: [], dpi: [], dpi_consegnati: [] }
          }
          const patenti = c.ha_patenti
            ? c.patenti.map((p) => ({
                tipo: p.tipo.trim(),
                conseguita_il: p.conseguita_il || null,
                scade_il: p.scade_il || null,
              }))
            : []
          const dpi = c.dpi_consegnati.map((d) => ({
            dpi: d.dpi,
            consegnato_il: d.consegnato_il || null,
          }))
          /* Le colonne vecchie restano allineate: `patente` coi tipi in
             fila, `dpi` coi soli nomi. Chi le legge ancora non si
             accorge del cambio. */
          return {
            patenti,
            patente: patenti.map((p) => p.tipo).join(', ') || null,
            dpi_consegnati: dpi,
            dpi: dpi.map((d) => d.dpi),
          }
        })(),

        /* La data se ne va insieme alla spunta: il database ha un check
           che rifiuta una scadenza senza permesso, e senza questo la
           riga verrebbe respinta con un 23514. */
        permesso_soggiorno: c.permesso_soggiorno,
        permesso_scadenza: c.permesso_soggiorno ? vuotoSeVuoto(c.permesso_scadenza) : null,
      },
    })
    // Dopo la creazione si resta sulla scheda invece di tornare alla
    // lista: senza tariffa l'operaio non costa niente, e la sezione
    // tariffe esiste solo quando c'e' un id. Rimandarlo alla lista
    // significherebbe fargli dimenticare il pezzo che conta.
    if (nuovo) navigate(`/anagrafiche/operai/${salvato}`, { replace: true })
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <Percorso
        indietro={{ etichetta: 'Risorse', a: '/anagrafiche/operai' }}
        qui={[
          {
            etichetta: nuovo ? 'Nuovo' : `${dipendente?.cognome ?? ''} ${dipendente?.nome ?? ''}`.trim() || '—',
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            {nuovo ? `Nuovo ${comeSiChiama}` : `${dipendente?.cognome} ${dipendente?.nome}`}
          </h1>
          {!nuovo && !dipendente?.attivo && (
            <Badge className="mt-1">archiviato — non compare negli elenchi</Badge>
          )}
        </div>
        {/* L'economia della persona sta in una sottopagina: netto, ferie e
            permessi mese per mese. Solo per chi fa le paghe. */}
        {!nuovo && puoVederePaghe && (
          <Button onClick={() => navigate(`/anagrafiche/operai/${id}/economia`)}>
            Economia →
          </Button>
        )}
      </div>

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {/* ══ CHI E' ══
            I dati della persona, non del suo rapporto con l'impresa.
            Stanno per primi perche' sono quelli che si scrivono guardando
            un documento in mano, ed e' il gesto con cui si apre una
            scheda nuova. */}
        <Card className="overflow-hidden">
          <Titolo>Chi è</Titolo>
          <div className="grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Cognome"
              disabled={!puoScrivere}
              errore={errors.cognome?.message}
              {...register('cognome')}
            />
            <Campo
              etichetta="Nome"
              disabled={!puoScrivere}
              errore={errors.nome?.message}
              {...register('nome')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              etichetta="Data di nascita"
              type="date"
              disabled={!puoScrivere}
              errore={errors.data_nascita?.message}
              {...register('data_nascita')}
            />
            <Campo
              etichetta="Luogo di nascita"
              placeholder="Siracusa (SR)"
              disabled={!puoScrivere}
              errore={errors.luogo_nascita?.message}
              {...register('luogo_nascita')}
            />
            <Campo
              etichetta="Codice fiscale"
              disabled={!puoScrivere}
              className="uppercase"
              errore={errors.codice_fiscale?.message}
              {...register('codice_fiscale')}
            />
          </div>

          <Campo
            etichetta="Residenza"
            placeholder="Via Roma 12, 96100 Siracusa (SR)"
            disabled={!puoScrivere}
            errore={errors.residenza?.message}
            {...register('residenza')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Telefono"
              type="tel"
              disabled={!puoScrivere}
              errore={errors.telefono?.message}
              {...register('telefono')}
            />
            <Campo
              etichetta="Email"
              type="email"
              disabled={!puoScrivere}
              errore={errors.email?.message}
              {...register('email')}
            />
          </div>
          </div>
        </Card>

        {/* DUE COLONNE DA QUI IN GIU'.

            La scheda e' passata da 13 campi a 22, e in colonna singola
            erano «due chilometri di scorrimento» — parole dell'utente il
            2026-09-18, che la stava usando da Stefania. Lo spazio ai
            lati c'era ed era sprecato.

            «Chi e'» resta a tutta larghezza perche' i suoi campi sono
            gia' affiancati fra loro. Questi due invece sono liste di
            campi, e stretti stanno comodi: Inquadramento e' il piu'
            lungo e sta a sinistra, dove si legge per primo.

            `items-start`: senza, le due card si allungano fino alla piu'
            alta e quella corta resta con mezzo riquadro vuoto in fondo. */}
        <div className="grid items-start gap-4 lg:grid-cols-2">

        {/* ══ INQUADRAMENTO ══
            Il rapporto con l'impresa: che ruolo ha, con che contratto,
            da quando. E' la parte che serve a Stefania per la busta
            paga. */}
        <Card className="overflow-hidden">
          <Titolo>Inquadramento</Titolo>
          <div className="grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* IL TIPO decide, la mansione racconta.

                «Muratore» e «geometra» dicono il mestiere; questo campo
                risponde a una domanda sola: le sue ore stanno su un
                cantiere o in un foglio suo? Solo l'operaio compare nella
                squadra di un rapportino — per gli altri lo rifiuta un
                trigger, non questa tendina. */}
            <CampoSelect
              etichetta="Tipo di risorsa"
              disabled={!puoScrivere}
              suggerimento="L'operaio va in cantiere e le sue ore stanno nel rapportino. Tecnico e impiegato dichiarano le proprie in «Le mie ore»."
              errore={errors.tipo?.message}
              {...register('tipo')}
            >
              <option value="operaio">Operaio — va in cantiere</option>
              <option value="tecnico">Tecnico — segue i cantieri</option>
              <option value="impiegato">Impiegato — ufficio</option>
            </CampoSelect>
            <Campo
              etichetta="Mansione"
              placeholder="capo squadra, muratore, manovale…"
              disabled={!puoScrivere}
              errore={errors.mansione?.message}
              {...register('mansione')}
            />
          </div>

          {/* IN SERVIZIO E ASSUNZIONE, ridisegnato il 2026-09-25 sul
              principio dell'utente: «la messa in servizio e' il
              requisito fondamentale affinche' una risorsa sia
              disponibile e spunti nelle anagrafiche; l'assunzione e' una
              messa in servizio ancora piu' profonda, perche' sancisce
              l'arrivo di un contratto».

              Quindi prima il PERIODO DI SERVIZIO, che decide se la
              risorsa esiste negli elenchi da cui si sceglie — squadre,
              assenti, anagrafica. Poi, dentro, l'ASSUNZIONE: una spunta,
              e solo spuntandola compaiono da quando e con quale azienda.
              Si puo' essere in servizio senza essere assunti — in prova,
              o per il tempo di un progetto — non il contrario.

              «In servizio» e non «impiego»: la parola «impiegato» la usa
              gia' il tipo di risorsa, e le due cose si confondevano. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="In servizio dal"
              type="date"
              disabled={!puoScrivere}
              suggerimento="Il primo giorno di lavoro, in cantiere o in ufficio"
              errore={errors.data_impiego?.message}
              {...register('data_impiego')}
            />
            <Campo
              etichetta="Fine servizio"
              type="date"
              disabled={!puoScrivere}
              suggerimento="Vuota se non c’è una scadenza"
              errore={errors.data_cessazione?.message}
              {...register('data_cessazione')}
            />
          </div>

          {/* Si dice SUBITO cosa comporta lasciarla vuota: la scheda si
              salva lo stesso, ma poi la persona non si trova piu' da
              nessuna parte, e senza questo avviso sembrerebbe sparita
              per un errore. */}
          {!inServizioDal && (
            <Avviso tono="info">
              Senza la data di messa in servizio questa risorsa non compare negli elenchi: né
              in Risorse, né nelle squadre dei rapportini, né fra gli assenti.
            </Avviso>
          )}

          <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                disabled={!puoScrivere}
                checked={assunto}
                onChange={(e) => {
                  if (e.target.checked) {
                    if (statoRapporto !== 'assunto') setNonAssunto(statoRapporto)
                    setValue('stato_rapporto', 'assunto', { shouldDirty: true })
                  } else {
                    setValue('stato_rapporto', nonAssunto, { shouldDirty: true })
                  }
                }}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-black accent-amber-400"
              />
              <span>
                <span className="block text-sm font-extrabold text-black">Assunto</span>
                <span className="block text-xs font-semibold text-gray-600">
                  C&rsquo;è un contratto. Da spuntare quando arriva: si può essere in servizio
                  senza, in prova o per il tempo di un progetto.
                </span>
              </span>
            </label>

            {assunto ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo
                  etichetta="Assunto dal"
                  type="date"
                  disabled={!puoScrivere}
                  errore={errors.data_assunzione?.message}
                  {...register('data_assunzione')}
                />
                {/* Testo libero per ora: diventera' una tendina di ditte
                    quando l'elenco ci sara' (utente, 2026-09-25). */}
                <Campo
                  etichetta="Assunto con"
                  placeholder="L’azienda che ha fatto il contratto"
                  disabled={!puoScrivere}
                  errore={errors.azienda_assunzione?.message}
                  {...register('azienda_assunzione')}
                />
                {/* Qui e non fra i campi generali (2026-09-25): un tipo
                    di contratto senza contratto non ha senso. */}
                <CampoSelect
                  etichetta="Tipo contratto"
                  disabled={!puoScrivere}
                  errore={errors.tipo_contratto?.message}
                  {...register('tipo_contratto')}
                >
                  <option value="">—</option>
                  {CONTRATTI.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </CampoSelect>
              </div>
            ) : (
              <CampoSelect
                etichetta="Perché non è assunto"
                disabled={!puoScrivere}
                className="sm:w-80"
                errore={errors.stato_rapporto?.message}
                {...register('stato_rapporto')}
              >
                {NON_ASSUNTO.map(([v, etichetta]) => (
                  <option key={v} value={v}>
                    {etichetta}
                  </option>
                ))}
              </CampoSelect>
            )}
          </div>

          {/* IL PERMESSO DI SOGGIORNO, e la sua scadenza.

              Due campi e non uno: SE serve, e QUANDO scade. La data
              compare solo spuntando la casella — chiederla a un
              cittadino italiano sarebbe una domanda senza risposta — ed
              e' obbligatoria quando c'e', perche' un permesso senza
              data non risponde alla domanda per cui il campo esiste.

              E' l'unico campo della scheda CHE SCADE: la data sta in un
              campo suo, e non dentro le note, perche' un domani diventa
              il promemoria in home che avvisa prima che sia tardi. */}
          <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                disabled={!puoScrivere}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-black accent-amber-400"
                {...register('permesso_soggiorno')}
              />
              <span>
                <span className="block text-sm font-extrabold text-black">
                  Ha un permesso di soggiorno
                </span>
                <span className="block text-xs font-semibold text-gray-600">
                  Da spuntare per chi non è cittadino UE: il documento va rinnovato e la
                  scadenza va tenuta d&rsquo;occhio.
                </span>
              </span>
            </label>

            {haPermesso && (
              <Campo
                etichetta="Scade il"
                type="date"
                disabled={!puoScrivere}
                className="sm:w-56"
                errore={errors.permesso_scadenza?.message}
                {...register('permesso_scadenza')}
              />
            )}
          </div>

          {/* Il collegamento all'utente del gestionale.

              Non e' un campo anagrafico come gli altri: e' quello che
              permette a chi COMPILA i rapportini di comparire nella
              squadra e segnare le proprie ore. Un tecnico che passa in
              cantiere lavora come tutti, ma senza questa riga non esiste
              in anagrafica e le sue ore non hanno dove andare.

              La tendina mostra solo le persone non ancora collegate a
              un'altra anagrafica: due schede sullo stesso utente
              conterebbero le sue ore due volte. */}
          {/* LA TENDINA COMPARE SOLO PER CHI NEL GESTIONALE CI ENTRA.

              Deciso con l'utente il 2026-09-17: «un operaio non avra'
              mai la possibilita' di accedere al gestionale aziendale,
              quindi per evitare che qualcuno crei qualcosa che non sia
              nelle logiche togliamola subito».

              Nasconderla non e' cosmesi: finche' c'era, la strada per
              collegare per sbaglio un muratore a un'utenza era aperta e
              nessuno avvisava. Togliendola, quella strada non esiste
              proprio — e chi cambia idea mette «tecnico» e la ritrova
              subito, senza salvare. */}
          {tipoScelto !== 'operaio' && (
            <CampoSelect
              etichetta="Utente del gestionale"
              disabled={!puoScrivere}
              suggerimento="Collegalo se questa persona entra nel programma: da lì dichiara le proprie ore in «Le mie ore» e, se è il tecnico, manda la giornata al titolare."
              errore={errors.user_id?.message}
              {...register('user_id')}
            >
              <option value="">— nessun utente collegato —</option>
              {collegabili.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.nome} ({m.ruolo})
                </option>
              ))}
            </CampoSelect>
          )}
          </div>
        </Card>

        {/* ══ SICUREZZA E ABILITAZIONI ══
            Patente e DPI SOLO PER GLI OPERAI: chi non va in cantiere non
            guida il furgone e non indossa l'imbracatura, e un riquadro
            di caselle che non si spunteranno mai e' rumore sulla scheda
            di Stefania. Le note invece valgono per tutti — una patologia
            e' una patologia ovunque si lavori. */}
        <Card className="overflow-hidden">
          <Titolo nota={
            tipoScelto === 'operaio'
              ? 'Cosa può guidare, cosa gli è stato consegnato, cosa bisogna sapere.'
              : 'Quello che bisogna sapere su questa persona.'
          }>
            {tipoScelto === 'operaio' ? 'Sicurezza e abilitazioni' : 'Note'}
          </Titolo>
          <div className="grid gap-4 p-5">
            {tipoScelto === 'operaio' && (
              <>
                {/* ── PATENTI E ABILITAZIONI, con le date (2026-09-25) ──
                    Una spunta, poi una riga per ognuna: il tipo, quando e'
                    stata presa, quando scade. Righe e non un campo di
                    testo, perche' la scadenza della CQC e' una data da
                    controllare, non una parola dentro una frase. */}
                <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      disabled={!puoScrivere}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-black accent-amber-400"
                      {...register('ha_patenti', {
                        // Spuntando si apre gia' la prima riga: una spunta
                        // che non mostra niente da compilare sembra rotta.
                        onChange: (e) => {
                          if (e.target.checked && patenti.fields.length === 0) {
                            patenti.append({ tipo: '', conseguita_il: '', scade_il: '' })
                          }
                        },
                      })}
                    />
                    <span>
                      <span className="block text-sm font-extrabold text-black">
                        Ha patenti o abilitazioni
                      </span>
                      <span className="block text-xs font-semibold text-gray-600">
                        Patente di guida, CQC, muletto, piattaforma aerea: chi può guidare il
                        furgone o salire sul mezzo, e fino a quando.
                      </span>
                    </span>
                  </label>
                  {errors.ha_patenti?.message && (
                    <p className="text-xs font-bold text-rose-700">{errors.ha_patenti.message}</p>
                  )}

                  {haPatenti && (
                    <div className="grid gap-3">
                      {patenti.fields.map((f, i) => (
                        <div
                          key={f.id}
                          className="grid items-start gap-2 border-t-2 border-gray-200 pt-3 sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_auto]"
                        >
                          <Campo
                            etichetta="Tipo"
                            list="tipi-patente"
                            placeholder="B, CQC, muletto…"
                            disabled={!puoScrivere}
                            errore={errors.patenti?.[i]?.tipo?.message}
                            {...register(`patenti.${i}.tipo`)}
                          />
                          <Campo
                            etichetta="Conseguita il"
                            type="date"
                            disabled={!puoScrivere}
                            errore={errors.patenti?.[i]?.conseguita_il?.message}
                            {...register(`patenti.${i}.conseguita_il`)}
                          />
                          <Campo
                            etichetta="Scade il"
                            type="date"
                            disabled={!puoScrivere}
                            errore={errors.patenti?.[i]?.scade_il?.message}
                            {...register(`patenti.${i}.scade_il`)}
                          />
                          {puoScrivere && (
                            <button
                              type="button"
                              onClick={() => patenti.remove(i)}
                              aria-label="Togli questa patente"
                              className="neo-press mt-6 h-9 w-9 cursor-pointer rounded-lg border-2 border-black bg-rose-200 text-sm font-black"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {puoScrivere && (
                        <Button
                          dimensione="sm"
                          className="justify-self-start"
                          onClick={() =>
                            patenti.append({ tipo: '', conseguita_il: '', scade_il: '' })
                          }
                        >
                          + Aggiungi un&rsquo;altra
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Suggerimenti e non un elenco chiuso: le abilitazioni
                      di un cantiere sono tante, e una che manca non deve
                      impedire di scriverla. */}
                  <datalist id="tipi-patente">
                    {TIPI_PATENTE.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>

                {/* ── DPI CONSEGNATI, ognuno con il suo giorno ──
                    Spunte e non testo libero: «scarpe», «scarpe antinf.»
                    e «calzature» nella stessa colonna renderebbero
                    impossibile chiedere chi ha cosa. Dal 2026-09-25 ogni
                    spunta chiede QUANDO: la consegna di un DPI e' una cosa
                    che si deve poter dimostrare con una data. */}
                <fieldset className="grid gap-2">
                  <legend className="text-xs font-bold uppercase text-black">
                    DPI consegnati
                  </legend>
                  <p className="text-xs font-semibold text-gray-600">
                    Spunta quelli che gli sono stati dati e scrivi il giorno della consegna.
                    Resta nella scheda, anche quando la persona viene archiviata.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {/* La lista fissa, piu' quelli gia' registrati che non
                        ci sono (scritti prima, o tolti dalla lista): un
                        DPI consegnato non deve sparire dalla scheda perche'
                        la lista e' cambiata. */}
                    {[...DPI, ...consegnati.map((c) => c.dpi).filter((n) => !DPI.includes(n))].map(
                      (d) => {
                        const i = consegnati.findIndex((c) => c.dpi === d)
                        const spuntato = i >= 0
                        const errore = spuntato
                          ? errors.dpi_consegnati?.[i]?.consegnato_il?.message
                          : undefined
                        return (
                          <div
                            key={d}
                            className={cn(
                              'grid gap-2 rounded-xl border-2 border-black px-3 py-2',
                              spuntato ? 'bg-lime-50' : 'bg-white',
                            )}
                          >
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={spuntato}
                                disabled={!puoScrivere}
                                onChange={(e) =>
                                  cambiaDpi(
                                    e.target.checked
                                      ? [...consegnati, { dpi: d, consegnato_il: '' }]
                                      : consegnati.filter((c) => c.dpi !== d),
                                  )
                                }
                                className="h-4 w-4 shrink-0 cursor-pointer rounded border-2 border-black accent-lime-400"
                              />
                              <span className="text-sm font-bold text-black">{d}</span>
                            </label>
                            {spuntato && (
                              <label className="grid gap-1">
                                <span className="text-[10px] font-bold uppercase text-gray-600">
                                  Consegnato il
                                </span>
                                <input
                                  type="date"
                                  value={consegnati[i].consegnato_il}
                                  disabled={!puoScrivere}
                                  onChange={(e) =>
                                    cambiaDpi(
                                      consegnati.map((c, j) =>
                                        j === i ? { ...c, consegnato_il: e.target.value } : c,
                                      ),
                                    )
                                  }
                                  className={cn(
                                    'h-9 rounded-lg border-2 bg-white px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400',
                                    errore ? 'border-rose-600' : 'border-black',
                                  )}
                                />
                                {errore && (
                                  <span className="text-xs font-bold text-rose-700">{errore}</span>
                                )}
                              </label>
                            )}
                          </div>
                        )
                      },
                    )}
                  </div>
                </fieldset>
              </>
            )}

            {/* SENZA ETICHETTA quando il riquadro si chiama gia' «Note»:
                leggere la stessa parola due volte a tre centimetri e'
                rumore, ed e' la stessa regola dei percorsi. Per un
                operaio invece il riquadro si intitola «Sicurezza e
                abilitazioni» e l'etichetta serve. */}
            <CampoArea
              etichetta={tipoScelto === 'operaio' ? 'Note' : undefined}
              rows={3}
              disabled={!puoScrivere}
              placeholder="Patologie, allergie, limitazioni, chi chiamare in caso di emergenza…"
              suggerimento="Le legge solo chi gestisce le anagrafiche: il tecnico non vede questa scheda."
              errore={errors.note?.message}
              {...register('note')}
            />
          </div>
        </Card>
        </div>

        {puoScrivere && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variante="primario" disabled={salva.isPending || !isDirty}>
              {salva.isPending ? 'Salvo…' : nuovo ? `Crea ${comeSiChiama}` : 'Salva modifiche'}
            </Button>

            {!nuovo && (
              <>
                <Button
                  onClick={() =>
                    archivia.mutate({ id: id!, attivo: !dipendente?.attivo })
                  }
                  disabled={archivia.isPending}
                >
                  {dipendente?.attivo ? 'Archivia' : 'Riattiva'}
                </Button>
                <Button
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (!confirm('Eliminare definitivamente questa persona?')) return
                    elimina.mutate(id!, { onSuccess: () => navigate('/anagrafiche/operai') })
                  }}
                >
                  Elimina
                </Button>
              </>
            )}
          </div>
        )}
      </form>

      {/* ══ DOCUMENTI E TARIFFE ══
          Fuori dal <form>: hanno i loro salvataggi, e i loro pulsanti
          dentro il form farebbero partire il submit della scheda.

          Affiancati, come i due riquadri sopra. Sono le due cose che si
          aggiungono DOPO aver creato la persona — un documento e una
          tariffa — e stanno bene una accanto all'altra invece che una in
          coda all'altra.

          Solo su una scheda gia' salvata: tutti e due hanno bisogno di
          una persona a cui appartenere, e prima del primo salvataggio
          quella persona non ha ancora un id. */}
      {/* DUE PILE INDIPENDENTI, dal 2026-09-24, non celle di una
          griglia sola. Con la griglia la seconda riga partiva sotto il
          piu' alto dei due riquadri della prima: le tariffe col modulo
          aperto lasciavano un buco sotto i documenti, e lo stipendio
          restava solo con mezza pagina vuota accanto. A sinistra
          documenti e stipendio, a destra le tariffe, che sono le piu'
          alte: le due colonne vengono circa pari. */}
      {!nuovo && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {id && <RiquadroDocumentiPersona dipendenteId={id} puoScrivere={puoScrivere} />}

          {/* PAGA MENSILE E TARIFFE INSIEME, a destra, dal 2026-09-25:
              la tariffa oraria Stefania la ricava dalla paga mensile, e
              le due si leggono una sopra l'altra. I documenti stanno da
              soli a sinistra. */}
          <div className="grid gap-4">
            {/* Lo stipendio solo a chi fa le paghe: chi non ha
                `paghe.read` non vede nemmeno che il riquadro esiste. */}
            {dipendente && puoVederePaghe && (
              <RiquadroStipendio dipendenteId={dipendente.id} puoScrivere={puoScrivere} />
            )}
            {dipendente && (
              <Tariffe
                dipendenteId={dipendente.id}
                tariffe={dipendente.dipendente_costi}
                puoScrivere={puoScrivere}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════ */

type Tariffa = {
  id: string
  valido_dal: string
  costo_orario: number
  costo_orario_straordinario: number | null
  tariffa_vendita_oraria: number | null
  note: string | null
}

function Tariffe({
  dipendenteId,
  tariffe,
  puoScrivere,
}: {
  dipendenteId: string
  tariffe: Tariffa[]
  puoScrivere: boolean
}) {
  const [apri, setApri] = useState(false)
  const aggiungi = useAggiungiTariffa()
  const vigente = tariffaVigente(tariffe)

  const ordinate = [...tariffe].sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Tariffe</h2>
          <p className="text-xs font-semibold text-gray-600">
            Non si modificano: se ne aggiunge una nuova con la data da cui vale. Così i
            rapportini vecchi continuano a costare quello che costavano.
          </p>
        </div>
        {puoScrivere && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)}>
            Nuova tariffa
          </Button>
        )}
      </div>

      {tariffe.length === 0 && (
        <Avviso tono="errore">
          Nessuna tariffa: le ore di questa persona valgono zero euro nel consuntivo dei
          cantieri.
        </Avviso>
      )}

      {apri && (
        <FormTariffa
          onAnnulla={() => setApri(false)}
          inCorso={aggiungi.isPending}
          errore={aggiungi.error ? (aggiungi.error as Error).message : undefined}
          onSalva={(t) =>
            aggiungi.mutate(
              { ...t, dipendente_id: dipendenteId },
              { onSuccess: () => setApri(false) },
            )
          }
        />
      )}

      {tariffe.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Valida dal</th>
              <th className="text-right">Ordinario</th>
              <th className="text-right">Straordinario</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {ordinate.map((t) => (
              <tr key={t.id} className={t.id === vigente?.id ? 'bg-lime-100' : undefined}>
                <td className="numerico font-bold">
                  {fmtData(t.valido_dal)}
                  {t.id === vigente?.id && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-gray-600">
                      in vigore
                    </span>
                  )}
                </td>
                <Cifra>{euro(t.costo_orario)}</Cifra>
                <Cifra className="text-gray-600">{euro(t.costo_orario_straordinario)}</Cifra>
                <td className="text-gray-600">{t.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

const schemaTariffa = z.object({
  valido_dal: z.string().min(1, 'Serve la data di decorrenza'),
  costo_orario: z.coerce.number().positive('Deve essere maggiore di zero'),
  costo_orario_straordinario: z.string(),
  note: z.string(),
})

type CampiTariffa = z.infer<typeof schemaTariffa>

function FormTariffa({
  onSalva,
  onAnnulla,
  inCorso,
  errore,
}: {
  onSalva: (t: {
    valido_dal: string
    costo_orario: number
    costo_orario_straordinario: number | null
    tariffa_vendita_oraria: number | null
    note: string | null
  }) => void
  onAnnulla: () => void
  inCorso: boolean
  errore?: string
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CampiTariffa>({
    resolver: zodResolver(schemaTariffa),
    defaultValues: {
      valido_dal: new Date().toLocaleDateString('sv-SE'),
      costo_orario: 0,
      costo_orario_straordinario: '',
      note: '',
    },
  })

  const numeroOpzionale = (v: string) => (v.trim() === '' ? null : Number(v))

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      {errore && <Avviso tono="errore">{errore}</Avviso>}

      {/* Tre per riga solo su schermo largo: il riquadro sta in mezza
          pagina accanto ai documenti, e a quattro colonne il campo data
          non ci stava — finiva sotto il costo orario.

          IL PREZZO DI VENDITA NON C'E' PIU', dal 2026-09-24: «togli
          vendita, non serve». La colonna resta nel database (e'
          condiviso, e le tariffe vecchie la hanno valorizzata), ma qui
          non si chiede e non si mostra: le tariffe nuove la scrivono
          vuota. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Campo
          etichetta="Valida dal"
          type="date"
          errore={errors.valido_dal?.message}
          {...register('valido_dal')}
        />
        <Campo
          etichetta="Costo orario €"
          type="number"
          step="0.01"
          min="0"
          className="numerico"
          errore={errors.costo_orario?.message}
          {...register('costo_orario')}
        />
        <Campo
          etichetta="Straordinario €"
          type="number"
          step="0.01"
          min="0"
          className="numerico"
          errore={errors.costo_orario_straordinario?.message}
          {...register('costo_orario_straordinario')}
        />
      </div>

      <Campo etichetta="Note" placeholder="Rinnovo CCNL, scatto di anzianità…" {...register('note')} />

      <div className="flex gap-2">
        <Button
          variante="primario"
          dimensione="sm"
          disabled={inCorso}
          onClick={handleSubmit((c) =>
            onSalva({
              valido_dal: c.valido_dal,
              costo_orario: c.costo_orario,
              costo_orario_straordinario: numeroOpzionale(c.costo_orario_straordinario),
              tariffa_vendita_oraria: null,
              note: c.note.trim() === '' ? null : c.note.trim(),
            }),
          )}
        >
          {inCorso ? 'Salvo…' : 'Aggiungi tariffa'}
        </Button>
        <Button dimensione="sm" onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </Button>
      </div>
    </div>
  )
}
