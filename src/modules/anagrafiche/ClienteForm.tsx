import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Avviso, Badge, Button, Campo, CampoArea, Card, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useArchiviaCliente, useCliente, useEliminaCliente, useSalvaCliente } from './clienti'

const vuoto = (v: string) => (v.trim() === '' ? null : v.trim())

/* ══════════════════════════════════════════════════════════════════
   Azienda o privato.

   Nel database NON esiste una colonna `tipo`: c'e' solo `ragione_sociale`
   con `partita_iva` e `codice_fiscale` entrambi facoltativi. Un cliente
   privato quindi si e' sempre potuto inserire — ma il form non lo
   aiutava, gli chiedeva la "ragione sociale" e lo lasciava salvare senza
   nessun identificativo fiscale, cioe' inutilizzabile per fatturare.

   Qui il tipo e' uno stato dell'interfaccia, dedotto dai dati quando si
   riapre una scheda: chi ha una partita IVA e' un'azienda, chi ha un
   codice fiscale di 16 caratteri e' una persona. Regge per tutti i casi
   reali. Il modo pulito sarebbe una colonna `tipo` in Postgres — una
   migration piccola, da fare quando toccheremo lo schema.
   ══════════════════════════════════════════════════════════════════ */
type Tipo = 'azienda' | 'privato'

const schema = z
  .object({
    tipo: z.enum(['azienda', 'privato']),
    ragione_sociale: z.string().min(1, 'Serve il nome'),
    partita_iva: z.string(),
    codice_fiscale: z.string(),
    indirizzo: z.string(),
    comune: z.string(),
    provincia: z.string().refine((v) => v === '' || v.length === 2, 'Due lettere, es. CT'),
    cap: z.string().refine((v) => v === '' || /^\d{5}$/.test(v), 'Cinque cifre'),
    email: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'Email non valida'),
    pec: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'PEC non valida'),
    telefono: z.string(),
    codice_sdi: z
      .string()
      .refine((v) => v === '' || v.trim().length === 7, 'Il codice SdI ha 7 caratteri'),
    note: z.string(),
  })
  .superRefine((v, ctx) => {
    const piva = v.partita_iva.trim()
    const cf = v.codice_fiscale.trim()

    // La partita IVA italiana e' di 11 cifre. Non e' pignoleria: finisce
    // in fattura elettronica, e una sbagliata la fa scartare dallo SdI —
    // e te ne accorgi giorni dopo.
    if (piva && !/^\d{11}$/.test(piva)) {
      ctx.addIssue({ code: 'custom', path: ['partita_iva'], message: 'La partita IVA ha 11 cifre' })
    }

    if (v.tipo === 'privato') {
      if (cf.length !== 16) {
        ctx.addIssue({
          code: 'custom',
          path: ['codice_fiscale'],
          message: 'Il codice fiscale di una persona ha 16 caratteri',
        })
      }
    } else {
      if (cf && cf.length !== 11 && cf.length !== 16) {
        ctx.addIssue({
          code: 'custom',
          path: ['codice_fiscale'],
          message: 'Per una società sono 11 cifre, per una ditta individuale 16 caratteri',
        })
      }
      // Un'azienda senza NESSUN identificativo fiscale non e' fatturabile:
      // e' il buco che il form vecchio lasciava passare in silenzio.
      if (!piva && !cf) {
        ctx.addIssue({
          code: 'custom',
          path: ['partita_iva'],
          message: 'Serve almeno la partita IVA o il codice fiscale, altrimenti non è fatturabile',
        })
      }
    }
  })

type Campi = z.infer<typeof schema>

const VUOTO: Campi = {
  tipo: 'azienda',
  ragione_sociale: '',
  partita_iva: '',
  codice_fiscale: '',
  indirizzo: '',
  comune: '',
  provincia: '',
  cap: '',
  email: '',
  pec: '',
  telefono: '',
  codice_sdi: '',
  note: '',
}

export function ClienteForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')

  // Si arriva qui anche dal form del cantiere ("manca il cliente,
  // crealo"): dopo il salvataggio si torna da dove si veniva, col
  // cliente appena creato gia' scelto.
  const ritorno = params.get('ritorno')

  const { data: cliente, isPending, error } = useCliente(id)
  const salva = useSalvaCliente()
  const archivia = useArchiviaCliente()
  const elimina = useEliminaCliente()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: VUOTO })

  // Il tipo e' gia' un campo del form: tenerlo anche in uno useState
  // aggiornato dentro un effetto innescherebbe render a cascata. Una
  // sola fonte di verita', letta con useWatch.
  const tipo = useWatch({ control, name: 'tipo' })

  useEffect(() => {
    if (!cliente) return
    const dedotto: Tipo =
      !cliente.partita_iva && cliente.codice_fiscale?.trim().length === 16 ? 'privato' : 'azienda'
    reset({
      tipo: dedotto,
      ragione_sociale: cliente.ragione_sociale,
      partita_iva: cliente.partita_iva ?? '',
      codice_fiscale: cliente.codice_fiscale ?? '',
      indirizzo: cliente.indirizzo ?? '',
      comune: cliente.comune ?? '',
      provincia: cliente.provincia ?? '',
      cap: cliente.cap ?? '',
      email: cliente.email ?? '',
      pec: cliente.pec ?? '',
      telefono: cliente.telefono ?? '',
      codice_sdi: cliente.codice_sdi ?? '',
      note: cliente.note ?? '',
    })
  }, [cliente, reset])

  if (!nuovo && isPending) return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  if (error) return <Avviso tono="errore">Non trovo questo cliente: {error.message}</Avviso>

  function cambiaTipo(t: Tipo) {
    setValue('tipo', t, { shouldValidate: false })
    // Una persona fisica non ha partita IVA ne' codice destinatario:
    // lasciarli valorizzati passando a "privato" salverebbe dati che
    // contraddicono il tipo scelto.
    if (t === 'privato') {
      setValue('partita_iva', '')
      setValue('codice_sdi', '')
    }
  }

  const privato = tipo === 'privato'

  async function onSubmit(c: Campi) {
    const salvato = await salva.mutateAsync({
      id,
      dati: {
        ragione_sociale: c.ragione_sociale.trim(),
        partita_iva: vuoto(c.partita_iva),
        codice_fiscale: vuoto(c.codice_fiscale)?.toUpperCase() ?? null,
        indirizzo: vuoto(c.indirizzo),
        comune: vuoto(c.comune),
        provincia: vuoto(c.provincia)?.toUpperCase() ?? null,
        cap: vuoto(c.cap),
        email: vuoto(c.email),
        pec: vuoto(c.pec),
        telefono: vuoto(c.telefono),
        codice_sdi: vuoto(c.codice_sdi)?.toUpperCase() ?? null,
        note: vuoto(c.note),
      },
    })

    if (ritorno) navigate(`${ritorno}?cliente=${salvato}`)
    else navigate('/anagrafiche/clienti')
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            {nuovo ? 'Nuovo cliente' : cliente?.ragione_sociale}
          </h1>
          {!nuovo && !cliente?.attivo && (
            <Badge className="mt-1">archiviato — non compare nelle tendine</Badge>
          )}
          {ritorno && (
            <p className="text-xs font-semibold text-gray-600">
              Appena salvato torni al cantiere con questo cliente già scelto.
            </p>
          )}
        </div>
        <Button onClick={() => navigate(ritorno ?? '/anagrafiche/clienti')}>
          {ritorno ? 'Torna al cantiere' : 'Torna all’elenco'}
        </Button>
      </div>

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5">
          {/* La scelta viene per prima perche' decide quali campi
              servono davvero e come si chiamano. */}
          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase text-black">Tipo di cliente</span>
            <div className="flex gap-2">
              {(
                [
                  ['azienda', 'Azienda o ente'],
                  ['privato', 'Privato'],
                ] as const
              ).map(([valore, etichetta]) => (
                <button
                  key={valore}
                  type="button"
                  disabled={!puoScrivere}
                  onClick={() => cambiaTipo(valore)}
                  className={cn(
                    'neo-press cursor-pointer rounded-xl border-2 border-black px-4 py-2 text-sm font-bold',
                    tipo === valore ? 'bg-amber-400 shadow-neo-xs' : 'bg-white',
                  )}
                >
                  {etichetta}
                </button>
              ))}
            </div>
          </div>

          <Campo
            etichetta={privato ? 'Nome e cognome' : 'Ragione sociale'}
            placeholder={privato ? 'Mario Rossi' : 'Costruzioni Rossi S.r.l.'}
            disabled={!puoScrivere}
            errore={errors.ragione_sociale?.message}
            {...register('ragione_sociale')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {!privato && (
              <Campo
                etichetta="Partita IVA"
                inputMode="numeric"
                maxLength={11}
                className="numerico"
                disabled={!puoScrivere}
                errore={errors.partita_iva?.message}
                {...register('partita_iva')}
              />
            )}
            <Campo
              etichetta="Codice fiscale"
              maxLength={16}
              className="uppercase"
              disabled={!puoScrivere}
              suggerimento={privato ? '16 caratteri' : undefined}
              errore={errors.codice_fiscale?.message}
              {...register('codice_fiscale')}
            />
          </div>

          <Campo
            etichetta="Indirizzo"
            disabled={!puoScrivere}
            errore={errors.indirizzo?.message}
            {...register('indirizzo')}
          />

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <Campo
              etichetta="Comune"
              disabled={!puoScrivere}
              errore={errors.comune?.message}
              {...register('comune')}
            />
            <Campo
              etichetta="Prov."
              maxLength={2}
              className="uppercase"
              disabled={!puoScrivere}
              errore={errors.provincia?.message}
              {...register('provincia')}
            />
            <Campo
              etichetta="CAP"
              inputMode="numeric"
              maxLength={5}
              className="numerico"
              disabled={!puoScrivere}
              errore={errors.cap?.message}
              {...register('cap')}
            />
          </div>
        </Card>

        <Card className="grid gap-4 p-5">
          <h2 className="text-lg font-extrabold text-black">Fatturazione e contatti</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Email"
              type="email"
              disabled={!puoScrivere}
              errore={errors.email?.message}
              {...register('email')}
            />
            <Campo
              etichetta="Telefono"
              type="tel"
              disabled={!puoScrivere}
              errore={errors.telefono?.message}
              {...register('telefono')}
            />
          </div>

          {privato ? (
            // Al privato senza PEC la fattura elettronica arriva nel
            // cassetto fiscale dell'Agenzia delle Entrate: il codice
            // destinatario non serve, e chiederglielo confonde.
            <Avviso tono="info">
              A un privato la fattura si manda via PEC se ne ha una, altrimenti finisce nel suo
              cassetto fiscale. Il codice destinatario SdI non serve.
            </Avviso>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etichetta="PEC"
                type="email"
                disabled={!puoScrivere}
                suggerimento="Serve se non c’è il codice SdI"
                errore={errors.pec?.message}
                {...register('pec')}
              />
              <Campo
                etichetta="Codice SdI"
                maxLength={7}
                className="uppercase"
                disabled={!puoScrivere}
                suggerimento="7 caratteri, per la fattura elettronica"
                errore={errors.codice_sdi?.message}
                {...register('codice_sdi')}
              />
            </div>
          )}

          {privato && (
            <Campo
              etichetta="PEC"
              type="email"
              disabled={!puoScrivere}
              suggerimento="Facoltativa"
              errore={errors.pec?.message}
              {...register('pec')}
            />
          )}

          <CampoArea
            etichetta="Note"
            disabled={!puoScrivere}
            errore={errors.note?.message}
            {...register('note')}
          />
        </Card>

        {puoScrivere && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variante="primario" disabled={salva.isPending || !isDirty}>
              {salva.isPending ? 'Salvo…' : nuovo ? 'Crea cliente' : 'Salva modifiche'}
            </Button>

            {!nuovo && (
              <>
                <Button
                  onClick={() => archivia.mutate({ id: id!, attivo: !cliente?.attivo })}
                  disabled={archivia.isPending}
                >
                  {cliente?.attivo ? 'Archivia' : 'Riattiva'}
                </Button>
                <Button
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (!confirm('Eliminare definitivamente questo cliente?')) return
                    elimina.mutate(id!, { onSuccess: () => navigate('/anagrafiche/clienti') })
                  }}
                >
                  Elimina
                </Button>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
