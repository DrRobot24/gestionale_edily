import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Avviso, Badge, Button, Campo, CampoArea, Card, Percorso, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { RiquadroDocumenti } from '../documenti/RiquadroDocumenti'
import { RiquadroFigure } from './RiquadroFigure'
import { useArchiviaCliente, useCliente, useEliminaCliente, useSalvaCliente } from './clienti'

const vuoto = (v: string) => (v.trim() === '' ? null : v.trim())

/* ══════════════════════════════════════════════════════════════════
   Azienda o privato.

   Nel database NON esiste una colonna `tipo`: c'e' solo `ragione_sociale`
   con `partita_iva` e `codice_fiscale` entrambi facoltativi. Un cliente
   privato quindi si e' sempre potuto inserire — ma il form non lo
   aiutava, gli chiedeva la "ragione sociale" e lo lasciava salvare senza
   nessun identificativo fiscale, cioe' inutilizzabile per fatturare.

   DAL 2026-09-22 IL TIPO E' UNA COLONNA VERA (`cliente-tipo.sql`).
   Prima era uno stato dell'interfaccia, dedotto dai campi fiscali
   riaprendo la scheda: niente partita IVA piu' codice fiscale di 16
   caratteri voleva dire «privato», tutto il resto «azienda».

   La deduzione reggeva quasi sempre, ma sbagliava in due casi reali:
   un privato di cui non si conosce ancora il codice fiscale risultava
   «azienda», e una ditta individuale — codice fiscale di 16 caratteri
   come una persona — risultava «privato» se le mancava la partita IVA.
   In tutti e due il programma cambiava idea da solo su una cosa che
   l'utente aveva scelto.

   IL TAB SI SPEGNE IN MODIFICA, chiesto dall'utente: «dopo che io creo
   un cliente e lo creo come privato, perche' e' ancora possibile
   cambiare il tab? Non e' che mi permetti di fare ste cose». Adesso che
   il tipo e' un dato salvato e non un indovinello, congelarlo ha senso:
   si sta proteggendo una scelta, non una deduzione. La scelta si fa una
   volta, alla creazione.

   Per i clienti creati PRIMA della migration il tipo e' stato scritto
   con la stessa regola di deduzione, cosi' nessuna scheda cambia
   aspetto il giorno dell'esecuzione.
   ══════════════════════════════════════════════════════════════════ */
type Tipo = 'azienda' | 'privato'

const schema = z
  .object({
    tipo: z.enum(['azienda', 'privato']),
    // Il nominativo si chiede in due modi: ragione sociale per
    // l'azienda, cognome e nome separati per il privato. Quale dei due
    // e' obbligatorio lo decide il tipo, piu' sotto.
    ragione_sociale: z.string(),
    cognome: z.string(),
    nome: z.string(),
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
      if (!v.cognome.trim()) {
        ctx.addIssue({ code: 'custom', path: ['cognome'], message: 'Serve il cognome' })
      }
      if (!v.nome.trim()) {
        ctx.addIssue({ code: 'custom', path: ['nome'], message: 'Serve il nome' })
      }
      if (cf.length !== 16) {
        ctx.addIssue({
          code: 'custom',
          path: ['codice_fiscale'],
          message: 'Il codice fiscale di una persona ha 16 caratteri',
        })
      }
    } else {
      if (!v.ragione_sociale.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['ragione_sociale'],
          message: 'Serve la ragione sociale',
        })
      }
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
  cognome: '',
  nome: '',
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
    /* Si LEGGE la colonna. Il ripiego sulla vecchia deduzione serve
       solo alle righe scritte da wbs-office, che la colonna non la
       passa: li' `tipo` e' nullo e va comunque mostrato qualcosa di
       sensato invece di un tab spento su niente. */
    const suo: Tipo =
      cliente.tipo === 'privato' || cliente.tipo === 'azienda'
        ? cliente.tipo
        : !cliente.partita_iva && cliente.codice_fiscale?.trim().length === 16
          ? 'privato'
          : 'azienda'
    reset({
      tipo: suo,
      ragione_sociale: cliente.ragione_sociale,
      // Un privato senza le due colonne (scritto da wbs-office, o prima
      // di `cliente-cognome-nome.sql`) apre coi campi vuoti: meglio
      // chiederli che indovinare dove finisce un cognome doppio. Il
      // nominativo di adesso resta leggibile nel titolo della pagina.
      cognome: cliente.cognome ?? '',
      nome: cliente.nome ?? '',
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
    const cognome = c.cognome.trim()
    const nome = c.nome.trim()
    const salvato = await salva.mutateAsync({
      id,
      dati: {
        tipo: c.tipo,
        // Per il privato `ragione_sociale` si compone qui, «Cognome
        // Nome»: e' la colonna che leggono l'elenco, le tendine dei
        // cantieri e wbs-office, e cosi' si ordina per cognome.
        ragione_sociale: c.tipo === 'privato' ? `${cognome} ${nome}` : c.ragione_sociale.trim(),
        cognome: c.tipo === 'privato' ? cognome : null,
        nome: c.tipo === 'privato' ? nome : null,
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
      {/* Con `ritorno` si e' arrivati qui dal modulo di un cantiere, per
          creare al volo il cliente che mancava: il passo indietro e'
          quello, non l'elenco.

          La tappa «Clienti» nel percorso compare solo in quel caso, cioe'
          quando la freccia NON la sta gia' dicendo: venendo dal cantiere
          aggiunge un livello vero, venendo dall'elenco ripeterebbe la
          freccia a tre centimetri di distanza. */}
      <Percorso
        indietro={
          ritorno
            ? { etichetta: 'Cantiere', a: ritorno }
            : { etichetta: 'Clienti', a: '/anagrafiche/clienti' }
        }
        qui={[
          ...(ritorno ? [{ etichetta: 'Clienti', a: '/anagrafiche/clienti' }] : []),
          { etichetta: nuovo ? 'Nuovo' : (cliente?.ragione_sociale ?? '—') },
        ]}
      />

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
      </div>

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5">
          {/* La scelta viene per prima perche' decide quali campi
              servono davvero e come si chiamano.

              SI SCEGLIE UNA VOLTA SOLA, alla creazione. In modifica i
              due bottoni sono spenti e resta solo quello scelto, con
              scritto sotto perche'. Prima si potevano premere entrambi
              anche su un cliente gia' salvato, e passando ad «azienda»
              il form cancellava partita IVA e codice SdI in silenzio:
              chi toccava il tab per sbaglio perdeva due campi senza
              accorgersene fino al salvataggio.

              Non e' un divieto assoluto e non finge di esserlo: chi
              deve davvero cambiare la natura di un cliente lo dice a
              chi tiene le anagrafiche. La frase sotto lo indica invece
              di lasciare davanti a un muro. */}
          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase text-black">Tipo di cliente</span>
            <div className="flex gap-2">
              {(
                [
                  ['azienda', 'Azienda o ente'],
                  ['privato', 'Privato'],
                ] as const
              )
                // In modifica resta il solo tipo scelto: due bottoni di
                // cui uno spento chiedono di provare a premerlo.
                .filter(([valore]) => nuovo || tipo === valore)
                .map(([valore, etichetta]) => (
                  <button
                    key={valore}
                    type="button"
                    disabled={!puoScrivere || !nuovo}
                    onClick={() => cambiaTipo(valore)}
                    className={cn(
                      'rounded-xl border-2 border-black px-4 py-2 text-sm font-bold',
                      tipo === valore ? 'bg-amber-400 shadow-neo-xs' : 'bg-white',
                      nuovo && puoScrivere
                        ? 'neo-press cursor-pointer'
                        : 'cursor-default',
                    )}
                  >
                    {etichetta}
                  </button>
                ))}
            </div>

            {!nuovo && (
              <p className="text-xs font-semibold text-gray-600">
                Il tipo si sceglie alla creazione e non si cambia: decide come questo
                cliente viene fatturato. Se è sbagliato, va corretto dall&rsquo;amministrazione.
              </p>
            )}
          </div>

          {/* Il privato ha cognome e nome in due campi, dal 2026-09-24:
              con un campo solo l'ordine dipendeva da chi scriveva, e
              la rubrica dei clienti finiva mezza al rovescio. */}
          {privato ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etichetta="Cognome"
                placeholder="Rossi"
                disabled={!puoScrivere}
                errore={errors.cognome?.message}
                {...register('cognome')}
              />
              <Campo
                etichetta="Nome"
                placeholder="Mario"
                disabled={!puoScrivere}
                errore={errors.nome?.message}
                {...register('nome')}
              />
            </div>
          ) : (
            <Campo
              etichetta="Ragione sociale"
              placeholder="Costruzioni Rossi S.r.l."
              disabled={!puoScrivere}
              errore={errors.ragione_sociale?.message}
              {...register('ragione_sociale')}
            />
          )}

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

      {/* ══ DOCUMENTI ══
          Fuori dal <form>: ha i suoi salvataggi, e i suoi pulsanti
          dentro il form farebbero partire il submit della scheda.

          Solo su una scheda gia' salvata: un documento ha bisogno di
          qualcosa a cui appartenere, e prima del primo salvataggio
          quella riga non ha ancora un id. */}
      {/* ══ CHI RAPPRESENTA IL CLIENTE ══
          Prima queste persone stavano nelle NOTE come testo libero —
          «Amministratore: Ing. Renato La Runa, DL: Ing. Adriano De
          Franciscis» — dove sono scritte bene ma non si cercano, non
          stanno in colonna e non si puo' telefonare a nessuno.

          Qui ci sono solo amministratore e referente. Il DL e i
          coordinatori della sicurezza stanno sul CANTIERE, perche' sono
          nominati per quell'opera: lo stesso condominio che fa due
          interventi puo' avere due DL diversi. */}
      {!nuovo && id && (
        <RiquadroFigure ambito="cliente" riferimentoId={id} puoScrivere={puoScrivere} />
      )}

      {!nuovo && id && (
        <RiquadroDocumenti ambito="cliente" riferimentoId={id} puoScrivere={puoScrivere} />
      )}
    </div>
  )
}
