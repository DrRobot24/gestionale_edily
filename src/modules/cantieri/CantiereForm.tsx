import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Avviso, Button, Campo, CampoArea, CampoSelect, Card } from '../../ui'
import { Link } from 'react-router'
import { usePermission } from '../auth/usePermission'
import { useClienti } from '../anagrafiche/clienti'
import { Squadra } from './Squadra'
import { StatoCantiere } from './stato'
import {
  useCantiere,
  useEliminaCantiere,
  useSalvaCantiere,
  type CantiereStato,
} from './cantieri'

const STATI: { valore: CantiereStato; etichetta: string }[] = [
  { valore: 'in_preparazione', etichetta: 'In preparazione' },
  { valore: 'attivo', etichetta: 'Attivo' },
  { valore: 'sospeso', etichetta: 'Sospeso' },
  { valore: 'chiuso', etichetta: 'Chiuso' },
  { valore: 'archiviato', etichetta: 'Archiviato' },
]

const vuoto = (v: string) => (v.trim() === '' ? null : v.trim())

const schema = z
  .object({
    codice: z.string().min(1, 'Il codice serve: è come lo chiamate al telefono'),
    denominazione: z.string().min(1, 'Serve una denominazione'),
    // Regola di Edily: prima il cliente, poi il cantiere. Nel database
    // `cliente_id` e' ancora nullable — questo vincolo per ora vive
    // qui. Diventera' vero quando lo metteremo NOT NULL in Postgres.
    cliente_id: z.string().min(1, 'Scegli il cliente: un cantiere è sempre per qualcuno'),
    stato: z.enum(['in_preparazione', 'attivo', 'sospeso', 'chiuso', 'archiviato']),
    indirizzo: z.string(),
    comune: z.string(),
    provincia: z.string().refine((v) => v === '' || v.length === 2, 'Due lettere, es. CT'),
    cap: z.string().refine((v) => v === '' || /^\d{5}$/.test(v), 'Cinque cifre'),
    data_inizio: z.string(),
    data_fine_prevista: z.string(),
    data_fine_effettiva: z.string(),
    importo_contratto: z.string(),
    note: z.string(),
  })
  .refine(
    (v) => !v.data_inizio || !v.data_fine_prevista || v.data_fine_prevista >= v.data_inizio,
    { message: 'La fine prevista non può precedere l’inizio', path: ['data_fine_prevista'] },
  )

type Campi = z.infer<typeof schema>

const VUOTO: Campi = {
  codice: '',
  denominazione: '',
  cliente_id: '',
  stato: 'in_preparazione',
  indirizzo: '',
  comune: '',
  provincia: '',
  cap: '',
  data_inizio: '',
  data_fine_prevista: '',
  data_fine_effettiva: '',
  importo_contratto: '',
  note: '',
}

export function CantiereForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('cantieri.write')

  const { data: cantiere, isPending, error } = useCantiere(id)
  const { data: clienti } = useClienti()
  const salva = useSalvaCantiere()
  const elimina = useEliminaCantiere()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: VUOTO })

  // Si torna qui dopo aver creato al volo un cliente: lo preselezione
  // evita di far ricercare a mano quello appena inserito.
  const clienteDaUrl = params.get('cliente')
  useEffect(() => {
    if (clienteDaUrl) setValue('cliente_id', clienteDaUrl, { shouldDirty: true })
  }, [clienteDaUrl, setValue])

  useEffect(() => {
    if (!cantiere) return
    reset({
      codice: cantiere.codice,
      denominazione: cantiere.denominazione,
      cliente_id: cantiere.cliente_id ?? '',
      stato: cantiere.stato,
      indirizzo: cantiere.indirizzo ?? '',
      comune: cantiere.comune ?? '',
      provincia: cantiere.provincia ?? '',
      cap: cantiere.cap ?? '',
      data_inizio: cantiere.data_inizio ?? '',
      data_fine_prevista: cantiere.data_fine_prevista ?? '',
      data_fine_effettiva: cantiere.data_fine_effettiva ?? '',
      importo_contratto: cantiere.importo_contratto?.toString() ?? '',
      note: cantiere.note ?? '',
    })
  }, [cantiere, reset])

  if (!nuovo && isPending) return <p className="text-sm font-bold text-gray-600">Carico il cantiere…</p>
  if (error) return <Avviso tono="errore">Non trovo questo cantiere: {error.message}</Avviso>

  async function onSubmit(c: Campi) {
    const salvato = await salva.mutateAsync({
      id,
      dati: {
        codice: c.codice.trim(),
        denominazione: c.denominazione.trim(),
        cliente_id: vuoto(c.cliente_id),
        stato: c.stato,
        indirizzo: vuoto(c.indirizzo),
        comune: vuoto(c.comune),
        provincia: vuoto(c.provincia)?.toUpperCase() ?? null,
        cap: vuoto(c.cap),
        data_inizio: vuoto(c.data_inizio),
        data_fine_prevista: vuoto(c.data_fine_prevista),
        data_fine_effettiva: vuoto(c.data_fine_effettiva),
        importo_contratto: c.importo_contratto.trim() === '' ? null : Number(c.importo_contratto),
        responsabile_id: cantiere?.responsabile_id ?? null,
        note: vuoto(c.note),
      },
    })
    // Come per gli operai: dopo la creazione si resta sulla scheda,
    // perche' la squadra si assegna solo quando il cantiere ha un id — e
    // un cantiere senza nessuno assegnato non lo vede nemmeno chi ci
    // deve lavorare.
    if (nuovo) navigate(`/cantieri/${salvato}`, { replace: true })
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            {nuovo ? 'Nuovo cantiere' : `${cantiere?.codice} — ${cantiere?.denominazione}`}
          </h1>
          {!nuovo && cantiere && (
            <div className="mt-1 flex items-center gap-2">
              <StatoCantiere stato={cantiere.stato} />
              {cantiere.clienti && (
                <span className="text-xs font-semibold text-gray-600">
                  per {cantiere.clienti.ragione_sociale}
                </span>
              )}
            </div>
          )}
        </div>
        <Button onClick={() => navigate('/cantieri')}>Torna all&rsquo;elenco</Button>
      </div>

      {clienti?.length === 0 && (
        <Avviso tono="errore">
          Non c’è nessun cliente in anagrafica, e un cantiere si apre sempre per qualcuno.{' '}
          <Link
            to={`/anagrafiche/clienti/nuovo?ritorno=${encodeURIComponent(nuovo ? '/cantieri/nuovo' : `/cantieri/${id}`)}`}
            className="underline decoration-2 underline-offset-2"
          >
            Crea il primo cliente
          </Link>{' '}
          e torni qui.
        </Avviso>
      )}

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <Campo
              etichetta="Codice"
              placeholder="2026-003"
              disabled={!puoScrivere}
              suggerimento="Come lo chiamate fra voi"
              errore={errors.codice?.message}
              {...register('codice')}
            />
            <Campo
              etichetta="Denominazione"
              disabled={!puoScrivere}
              errore={errors.denominazione?.message}
              {...register('denominazione')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <CampoSelect
                etichetta="Cliente"
                disabled={!puoScrivere}
                errore={errors.cliente_id?.message}
                {...register('cliente_id')}
              >
                <option value="">— scegli —</option>
              {(clienti ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ragione_sociale}
                  </option>
                ))}
              </CampoSelect>
              {puoScrivere && (
                <Link
                  to={`/anagrafiche/clienti/nuovo?ritorno=${encodeURIComponent(nuovo ? '/cantieri/nuovo' : `/cantieri/${id}`)}`}
                  className="text-[11px] font-bold text-gray-600 underline decoration-2 underline-offset-2"
                >
                  Non c’è? Crea un cliente nuovo
                </Link>
              )}
            </div>
            <CampoSelect
              etichetta="Stato"
              disabled={!puoScrivere}
              errore={errors.stato?.message}
              {...register('stato')}
            >
              {STATI.map((s) => (
                <option key={s.valore} value={s.valore}>
                  {s.etichetta}
                </option>
              ))}
            </CampoSelect>
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              etichetta="Inizio"
              type="date"
              disabled={!puoScrivere}
              errore={errors.data_inizio?.message}
              {...register('data_inizio')}
            />
            <Campo
              etichetta="Fine prevista"
              type="date"
              disabled={!puoScrivere}
              errore={errors.data_fine_prevista?.message}
              {...register('data_fine_prevista')}
            />
            <Campo
              etichetta="Fine effettiva"
              type="date"
              disabled={!puoScrivere}
              suggerimento="Solo a lavori finiti"
              errore={errors.data_fine_effettiva?.message}
              {...register('data_fine_effettiva')}
            />
          </div>

          <Campo
            etichetta="Importo contratto €"
            type="number"
            step="0.01"
            min="0"
            className="numerico"
            disabled={!puoScrivere}
            errore={errors.importo_contratto?.message}
            {...register('importo_contratto')}
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
              {salva.isPending ? 'Salvo…' : nuovo ? 'Crea cantiere' : 'Salva modifiche'}
            </Button>
            {!nuovo && (
              <Button
                variante="danger"
                disabled={elimina.isPending}
                onClick={() => {
                  if (!confirm('Eliminare definitivamente questo cantiere?')) return
                  elimina.mutate(id!, { onSuccess: () => navigate('/cantieri') })
                }}
              >
                Elimina
              </Button>
            )}
          </div>
        )}
      </form>

      {!nuovo && id && <Squadra cantiereId={id} />}
    </div>
  )
}
