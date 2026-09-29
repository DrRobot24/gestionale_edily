import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { data as fmtData } from '../../lib/formato'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, Percorso, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useSession } from '../auth/SessionProvider'
import { useQueryClient } from '@tanstack/react-query'
import { CassettoDocumenti, RiquadroDocumentiPersona } from './RiquadroDocumentiPersona'
import { RiquadroOrario } from './RiquadroOrario'
import { RiquadroRetribuzione } from './RiquadroRetribuzione'
import { RiquadroAppunti } from './RiquadroAppunti'
import { RiquadroContratti } from './RiquadroContratti'
import {
  ETICHETTA_MOTIVO,
  MOTIVI_SCELTI,
  aperto,
  salvaUscita,
  useContratti,
  useUscita,
  type MotivoFine,
} from './contratti'
import { useMembri } from '../cantieri/assegnazioni'
import {
  useDipendenti,
  useArchiviaDipendente,
  useDipendente,
  useEliminaDipendente,
  useSalvaDipendente,
  dpiConsegnatiDi,
  patentiDi,
} from './dipendenti'

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

/* Perche' non e' assunto. I contratti stanno in un riquadro loro (vedi
   `RiquadroContratti`): qui restano le due ragioni per cui si e' in
   servizio senza contratto. */
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
  data_impiego: z.string(),
  data_cessazione: z.string(),
  /* Perche' finisce il servizio, dal 2026-09-29. Sta in una tabella sua
     (`dipendente_uscite`), letta solo da chi tiene le anagrafiche. */
  motivo_uscita: z.string(),
  note_uscita: z.string(),
  telefono: z.string(),
  email: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'Email non valida'),
  user_id: z.string(),

  /* ── la scheda della persona, dal 2026-09-18 ── */
  data_nascita: z.string(),
  luogo_nascita: z.string(),
  residenza: z.string(),
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
  /* IL PERIODO DI SERVIZIO (2026-09-25). Il database ha lo stesso
     check; qui serve a dirlo con una frase. I confronti coi contratti li
     fa `onSubmit`, che i contratti li conosce. */
  .refine((v) => !v.data_cessazione || !v.data_impiego || v.data_cessazione >= v.data_impiego, {
    message: 'La fine del servizio viene prima dell’inizio',
    path: ['data_cessazione'],
  })
  /* Una fine senza motivo non risponde alla domanda per cui il campo
     esiste (utente, 2026-09-29). */
  .refine((v) => !v.data_cessazione || v.motivo_uscita !== '', {
    message: 'Perché finisce il servizio?',
    path: ['motivo_uscita'],
  })
  .refine((v) => v.motivo_uscita !== 'altro' || v.note_uscita.trim() !== '', {
    message: 'Con «Altro» servono due parole di spiegazione',
    path: ['note_uscita'],
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
  data_impiego: '',
  data_cessazione: '',
  motivo_uscita: '',
  note_uscita: '',
  telefono: '',
  email: '',
  user_id: '',
  data_nascita: '',
  luogo_nascita: '',
  residenza: '',
  permesso_soggiorno: false,
  permesso_scadenza: '',
  ha_patenti: false,
  patenti: [],
  dpi_consegnati: [],
  /* Una risorsa nuova parte NON assunta: il contratto e' il passo in
     piu', e si aggiunge quando c'e'. Prima il default era «assunto», e
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
  const { org } = useSession()
  const qc = useQueryClient()
  /* I contratti e il perche' della fine: solo per chi tiene le
     anagrafiche, come le tabelle che li contengono. */
  const { data: contratti } = useContratti({ abilitato: puoScrivere })
  const suoiContratti = (contratti ?? []).filter((c) => c.dipendente_id === id)
  const contrattoAperto = suoiContratti.find((c) => aperto(c))
  const { data: uscita } = useUscita(id, puoScrivere)
  const [erroreUscita, setErroreUscita] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
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
  /* Il servizio, per avvisare subito chi lo lascia vuoto; la sua fine,
     per chiedere il perche' nel momento in cui si scrive. */
  const inServizioDal = useWatch({ control, name: 'data_impiego' })
  const fineServizio = useWatch({ control, name: 'data_cessazione' })
  const motivoUscita = useWatch({ control, name: 'motivo_uscita' })

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
      data_impiego: dipendente.data_impiego ?? '',
      data_cessazione: dipendente.data_cessazione ?? '',
      motivo_uscita: uscita?.motivo ?? '',
      note_uscita: uscita?.note ?? '',
      telefono: dipendente.telefono ?? '',
      email: dipendente.email ?? '',
      user_id: dipendente.user_id ?? '',
      data_nascita: dipendente.data_nascita ?? '',
      luogo_nascita: dipendente.luogo_nascita ?? '',
      residenza: dipendente.residenza ?? '',
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
      /* «Assunto» non si sceglie piu' a mano: lo dice un contratto
         aperto. Nella tendina restano le due ragioni per non esserlo, e
         una scheda segnata «assunto» senza contratto (le vecchie, o un
         contratto appena finito) parte da «da inquadrare», che e' il
         compito che resta. */
      stato_rapporto:
        dipendente.stato_rapporto === 'in_prova' ? 'in_prova' : 'da_inquadrare',
    })
  }, [dipendente, uscita, reset])

  if (!nuovo && isPending) {
    return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  }
  if (error) return <Avviso tono="errore">Non trovo questa persona: {error.message}</Avviso>

  async function onSubmit(c: Campi) {
    /* I confronti coi contratti, che lo schema non conosce. Il database
       ha gli stessi vincoli; qui servono a dirlo sul campo giusto invece
       che con un 23514. */
    const primo = suoiContratti.at(-1)?.dal
    const ultimo = suoiContratti[0]?.dal
    if (c.data_impiego && primo && c.data_impiego > primo) {
      setError('data_impiego', {
        message: `Il primo contratto comincia il ${fmtData(primo)}: il servizio non può cominciare dopo`,
      })
      return
    }
    if (c.data_cessazione && ultimo && c.data_cessazione < ultimo) {
      setError('data_cessazione', {
        message: `C’è un contratto che comincia il ${fmtData(ultimo)}: il servizio non può finire prima`,
      })
      return
    }

    const salvato = await salva.mutateAsync({
      id,
      dati: {
        cognome: c.cognome.trim(),
        nome: c.nome.trim(),
        codice_fiscale: vuotoSeVuoto(c.codice_fiscale)?.toUpperCase() ?? null,
        tipo: c.tipo,
        mansione: vuotoSeVuoto(c.mansione),
        /* Data, ditta e tipo del contratto non si scrivono da qui dal
           2026-09-29: le ricopia il database dai contratti. */
        data_impiego: vuotoSeVuoto(c.data_impiego),
        data_cessazione: vuotoSeVuoto(c.data_cessazione),
        telefono: vuotoSeVuoto(c.telefono),
        email: vuotoSeVuoto(c.email),
        user_id: vuotoSeVuoto(c.user_id),

        data_nascita: vuotoSeVuoto(c.data_nascita),
        luogo_nascita: vuotoSeVuoto(c.luogo_nascita),
        residenza: vuotoSeVuoto(c.residenza),
        /* Con un contratto aperto lo stato e' «assunto» e lo tiene il
           database: la tendina non c'e', e non si manda niente. */
        ...(contrattoAperto ? {} : { stato_rapporto: c.stato_rapporto }),

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

    /* Il perche' della fine servizio, DOPO la scheda: la data sta li'.
       Tolta la data, il motivo lo cancella il database da solo. La
       fine del servizio chiude anche i contratti aperti: si rileggono. */
    setErroreUscita(null)
    if (c.data_cessazione) {
      try {
        await salvaUscita(org!.id, salvato, {
          motivo: c.motivo_uscita as MotivoFine,
          note: vuotoSeVuoto(c.note_uscita),
        })
      } catch (e) {
        setErroreUscita(`La scheda è salvata, il motivo della fine no: ${(e as Error).message}`)
      }
    }
    qc.invalidateQueries({ queryKey: ['uscita', salvato] })
    qc.invalidateQueries({ queryKey: ['contratti'] })
    // Dopo la creazione si resta sulla scheda invece di tornare alla
    // lista: senza tariffa l'operaio non costa niente, e la sezione
    // tariffe esiste solo quando c'e' un id. Rimandarlo alla lista
    // significherebbe fargli dimenticare il pezzo che conta.
    if (nuovo) navigate(`/anagrafiche/operai/${salvato}`, { replace: true })
  }

  /* LA PULSANTIERA, dal 2026-09-28 sotto Sicurezza e abilitazioni.
     Tolte le note da quel riquadro, a destra restava un buco alto
     mezzo schermo mentre i pulsanti stavano a sinistra, sotto
     Inquadramento, a spingere giu' documenti e orario. L'utente l'ha
     visto prima di noi: «spostiamo la pulsantiera a destra, che c'e'
     piu' spazio libero». Per tecnici e impiegati la colonna di destra
     non c'e', e i pulsanti restano in fondo al modulo. */
  const pulsantiera = puoScrivere && (
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
  )

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
      {erroreUscita && <Avviso tono="errore">{erroreUscita}</Avviso>}

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

          {/* I DOCUMENTI DI IDENTITA', in anagrafica dal 2026-09-29: «non
              confondiamo i cassetti! Tu metteresti mutande e calzini
              insieme con le camicie e i maglioni?» (utente). Gli
              attestati e i corsi stanno nei documenti di lavoro, in
              fondo. Solo per chi tiene le anagrafiche, come la RLS. */}
          {puoScrivere && (
            <div className="rounded-xl border-2 border-black bg-white p-4">
              {id ? (
                <CassettoDocumenti
                  dipendenteId={id}
                  puoScrivere={puoScrivere}
                  cassetto="identita"
                  titolo="Documenti di identità"
                  nota="Carta d’identità, passaporto, tessera sanitaria."
                />
              ) : (
                <>
                  <span className="block text-sm font-extrabold text-black">
                    Documenti di identità
                  </span>
                  <span className="block text-xs font-semibold text-gray-600">
                    Salvata la scheda, qui si caricano carta d&rsquo;identità e gli altri.
                  </span>
                </>
              )}
            </div>
          )}

          {/* IL PERMESSO DI SOGGIORNO, e la sua scadenza. In «Chi e'»
              dal 2026-09-29, con la sua copia caricata: e' un documento
              della persona, non del suo lavoro («non confondiamo i
              cassetti», utente).

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

            {/* La copia del permesso, qui accanto alla sua scadenza e
                non fra gli attestati (2026-09-29). Senza scadenza sua:
                la data e' quella qui sopra. */}
            {haPermesso && id && puoScrivere && (
              <div className="border-t-2 border-gray-200 pt-3">
                <CassettoDocumenti
                  dipendenteId={id}
                  puoScrivere={puoScrivere}
                  cassetto="permesso"
                  conScadenza={false}
                  titolo="Copia del permesso"
                />
              </div>
            )}
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
        {/* Due colonne solo per l'operaio: per tecnici e impiegati il
            riquadro di destra non c'e' (vedi sotto) e Inquadramento
            prende tutta la riga invece di lasciarne mezza vuota. */}
        <div
          className={cn(
            'grid items-start gap-4',
            tipoScelto === 'operaio' && 'lg:grid-cols-2',
          )}
        >

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
              assenti, anagrafica. Poi, dentro, i CONTRATTI (dal
              2026-09-29 uno dopo l'altro, anche con ditte diverse: vedi
              `RiquadroContratti`). Si puo' essere in servizio senza
              essere assunti — in prova, o per il tempo di un progetto —
              non il contrario. E un contratto puo' finire lasciando la
              persona in servizio.

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

          {/* PERCHE' FINISCE IL SERVIZIO (2026-09-29): compare quando c'e'
              la data, e senza non si salva. Sul servizio e non sul
              contratto, cosi' vale anche per chi non e' mai stato assunto
              — la prova non superata. Solo per chi tiene le anagrafiche:
              la tabella la legge solo lui. */}
          {puoScrivere && fineServizio && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelect
                etichetta="Perché finisce il servizio"
                errore={errors.motivo_uscita?.message}
                {...register('motivo_uscita')}
              >
                <option value="">—</option>
                {MOTIVI_SCELTI.map((m) => (
                  <option key={m} value={m}>
                    {ETICHETTA_MOTIVO[m]}
                  </option>
                ))}
              </CampoSelect>
              <Campo
                etichetta="Note sulla fine"
                placeholder={motivoUscita === 'altro' ? 'Cosa è successo' : 'Facoltative'}
                errore={errors.note_uscita?.message}
                {...register('note_uscita')}
              />
              {contrattoAperto && (
                <p className="text-xs font-semibold text-gray-600 sm:col-span-2">
                  Salvando, il contratto con {contrattoAperto.azienda} si chiude alla stessa data.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4">
            <div>
              <span className="block text-sm font-extrabold text-black">Contratti</span>
              <span className="block text-xs font-semibold text-gray-600">
                Uno dopo l&rsquo;altro, anche con aziende diverse. Un contratto può finire e la
                persona restare in servizio.
              </span>
            </div>

            {nuovo ? (
              <p className="text-xs font-semibold text-gray-600">
                Salvata la scheda, qui si aggiungono i contratti.
              </p>
            ) : puoScrivere ? (
              <RiquadroContratti
                dipendenteId={id!}
                puoScrivere={puoScrivere}
                inServizioDal={inServizioDal}
              />
            ) : (
              /* Chi non tiene le anagrafiche non legge i contratti: vede
                 la copia sulla scheda, ditta e tipo dell'ultimo. */
              <p className="text-sm font-semibold text-gray-800">
                {dipendente?.stato_rapporto === 'assunto' && dipendente.azienda_assunzione
                  ? `Assunto con ${dipendente.azienda_assunzione}${
                      dipendente.tipo_contratto ? ` · ${dipendente.tipo_contratto}` : ''
                    }`
                  : 'Non assunto'}
              </p>
            )}

            {/* Senza un contratto aperto resta la domanda: perche' no? */}
            {puoScrivere && !contrattoAperto && (
              <CampoSelect
                etichetta="Perché non è assunto"
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
            di Stefania.

            LE NOTE NON STANNO PIU' QUI, dal 2026-09-28: sono diventate
            gli APPUNTI, un riquadro loro in fondo alla scheda — post-it
            su qualunque argomento, per tutti i tipi di risorsa. Qui
            dentro invitavano a scrivere solo di sicurezza. Vedi
            `RiquadroAppunti`. */}
        {tipoScelto === 'operaio' && (
        <div className="grid gap-4">
        <Card className="overflow-hidden">
          <Titolo nota="Cosa può guidare e cosa gli è stato consegnato.">
            Sicurezza e abilitazioni
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

          </div>
        </Card>
        {pulsantiera}
        </div>
        )}
        </div>

        {/* Senza la colonna di destra (tecnici e impiegati) i pulsanti
            restano sotto, dove sono sempre stati. */}
        {tipoScelto !== 'operaio' && pulsantiera}
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
          <div className="grid gap-4">
            {id && <RiquadroDocumentiPersona dipendenteId={id} puoScrivere={puoScrivere} />}
            {/* L'orario da contratto, sotto i documenti: tempo pieno o
                part-time. Vedi `RiquadroOrario`. */}
            {id && <RiquadroOrario dipendenteId={id} puoScrivere={puoScrivere} />}
          </div>

          {/* LA RETRIBUZIONE, a destra: paga mensile OPPURE tariffa
              oraria, in un riquadro solo dal 2026-09-25 — vedi
              `RiquadroRetribuzione`. Solo a chi fa le paghe: chi non ha
              `paghe.read` non vede nemmeno che il riquadro esiste. */}
          <div className="grid gap-4">
            {dipendente && puoVederePaghe && (
              <RiquadroRetribuzione
                dipendenteId={dipendente.id}
                tariffe={dipendente.dipendente_costi}
                puoScrivere={puoScrivere}
              />
            )}
            {/* Gli appunti nello spazio che restava vuoto sotto la
                retribuzione (2026-09-28). Li vede chi tiene le
                anagrafiche: e' la RLS a dirlo, qui si evita solo di
                mostrare un riquadro che risponderebbe vuoto. */}
            {id && puoScrivere && <RiquadroAppunti dipendenteId={id} puoScrivere={puoScrivere} />}
          </div>
        </div>
      )}
    </div>
  )
}
