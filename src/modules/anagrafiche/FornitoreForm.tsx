import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { Avviso, Badge, Button, Campo, CampoArea, Card } from '../../ui'
import { usePermission } from '../auth/usePermission'
import {
  useArchiviaFornitore,
  useEliminaFornitore,
  useFornitore,
  useSalvaFornitore,
} from './fornitori'

const vuoto = (v: string) => (v.trim() === '' ? null : v.trim())

/* ══════════════════════════════════════════════════════════════════
   Un fornitore e' sempre un'azienda.

   Per questo qui non c'e' la scelta azienda/privato che ha il form dei
   clienti, e nel database `fornitori` non ha nemmeno la colonna
   `codice_fiscale`: chi ti manda una bolla ha una partita IVA.

   La partita IVA resta comunque facoltativa perche' la colonna lo
   permette e ci possono essere anagrafiche incomplete da sistemare, ma
   il form dice a cosa si va incontro lasciandola vuota.
   ══════════════════════════════════════════════════════════════════ */

/** Le categorie ricorrenti in edilizia, come suggerimento e non come
 *  vincolo: `categoria` e' testo libero nel database e imporre qui un
 *  elenco chiuso creerebbe una regola che la tabella non conosce. */
const CATEGORIE = [
  'Materiali edili',
  'Ferramenta',
  'Calcestruzzo',
  'Noleggio mezzi',
  'Trasporti',
  'Carburanti',
  'Impianti',
  'Smaltimento',
] as const

const schema = z.object({
  ragione_sociale: z.string().min(1, 'Serve la ragione sociale'),
  partita_iva: z
    .string()
    .refine((v) => v === '' || /^\d{11}$/.test(v.trim()), 'La partita IVA ha 11 cifre'),
  categoria: z.string(),
  indirizzo: z.string(),
  comune: z.string(),
  provincia: z.string().refine((v) => v === '' || v.length === 2, 'Due lettere, es. CT'),
  cap: z.string().refine((v) => v === '' || /^\d{5}$/.test(v), 'Cinque cifre'),
  email: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'Email non valida'),
  pec: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'PEC non valida'),
  telefono: z.string(),
  note: z.string(),
})

type Campi = z.infer<typeof schema>

const VUOTO: Campi = {
  ragione_sociale: '',
  partita_iva: '',
  categoria: '',
  indirizzo: '',
  comune: '',
  provincia: '',
  cap: '',
  email: '',
  pec: '',
  telefono: '',
  note: '',
}

export function FornitoreForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: fornitore, isPending, error } = useFornitore(id)
  const salva = useSalvaFornitore()
  const archivia = useArchiviaFornitore()
  const elimina = useEliminaFornitore()

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: VUOTO })

  // useWatch e non watch(): watch() restituisce una funzione che il
  // React Compiler non sa memoizzare, e la sua presenza gli fa saltare
  // l'ottimizzazione dell'intero componente. Stessa scelta di
  // ClienteForm, per lo stesso motivo.
  const partitaIva = useWatch({ control, name: 'partita_iva' })
  const senzaPiva = (partitaIva ?? '').trim() === ''

  useEffect(() => {
    if (!fornitore) return
    reset({
      ragione_sociale: fornitore.ragione_sociale,
      partita_iva: fornitore.partita_iva ?? '',
      categoria: fornitore.categoria ?? '',
      indirizzo: fornitore.indirizzo ?? '',
      comune: fornitore.comune ?? '',
      provincia: fornitore.provincia ?? '',
      cap: fornitore.cap ?? '',
      email: fornitore.email ?? '',
      pec: fornitore.pec ?? '',
      telefono: fornitore.telefono ?? '',
      note: fornitore.note ?? '',
    })
  }, [fornitore, reset])

  if (!nuovo && isPending)
    return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  if (error) return <Avviso tono="errore">Non trovo questo fornitore: {error.message}</Avviso>

  async function onSubmit(c: Campi) {
    await salva.mutateAsync({
      id,
      dati: {
        ragione_sociale: c.ragione_sociale.trim(),
        partita_iva: vuoto(c.partita_iva),
        categoria: vuoto(c.categoria),
        indirizzo: vuoto(c.indirizzo),
        comune: vuoto(c.comune),
        provincia: vuoto(c.provincia)?.toUpperCase() ?? null,
        cap: vuoto(c.cap),
        email: vuoto(c.email),
        pec: vuoto(c.pec),
        telefono: vuoto(c.telefono),
        note: vuoto(c.note),
      },
    })

    navigate('/anagrafiche/fornitori')
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            {nuovo ? 'Nuovo fornitore' : fornitore?.ragione_sociale}
          </h1>
          {!nuovo && !fornitore?.attivo && (
            <Badge className="mt-1">archiviato — non compare nelle tendine</Badge>
          )}
        </div>
        <Button onClick={() => navigate('/anagrafiche/fornitori')}>Torna all’elenco</Button>
      </div>

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5">
          <Campo
            etichetta="Ragione sociale"
            placeholder="Edilforniture S.r.l."
            disabled={!puoScrivere}
            errore={errors.ragione_sociale?.message}
            {...register('ragione_sociale')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Partita IVA"
              inputMode="numeric"
              maxLength={11}
              className="numerico"
              disabled={!puoScrivere}
              errore={errors.partita_iva?.message}
              {...register('partita_iva')}
            />
            <Campo
              etichetta="Categoria"
              list="categorie-fornitore"
              placeholder="Materiali edili"
              suggerimento="Serve a raggruppare la spesa per tipo"
              disabled={!puoScrivere}
              errore={errors.categoria?.message}
              {...register('categoria')}
            />
            <datalist id="categorie-fornitore">
              {CATEGORIE.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {senzaPiva && (
            <Avviso tono="info">
              Senza partita IVA questo fornitore resta registrabile, ma non potrai riconciliare
              le sue fatture: è il dato con cui si riconosce chi ti ha mandato la merce.
            </Avviso>
          )}

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
          <h2 className="text-lg font-extrabold text-black">Contatti</h2>

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

          <Campo
            etichetta="PEC"
            type="email"
            disabled={!puoScrivere}
            suggerimento="Dove arrivano le sue fatture elettroniche"
            errore={errors.pec?.message}
            {...register('pec')}
          />

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
              {salva.isPending ? 'Salvo…' : nuovo ? 'Crea fornitore' : 'Salva modifiche'}
            </Button>

            {!nuovo && (
              <>
                <Button
                  onClick={() => archivia.mutate({ id: id!, attivo: !fornitore?.attivo })}
                  disabled={archivia.isPending}
                >
                  {fornitore?.attivo ? 'Archivia' : 'Riattiva'}
                </Button>
                <Button
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (!confirm('Eliminare definitivamente questo fornitore?')) return
                    elimina.mutate(id!, { onSuccess: () => navigate('/anagrafiche/fornitori') })
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
