import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, Cifra, Table } from '../../ui'
import { usePermission } from '../auth/usePermission'
import {
  tariffaVigente,
  useAggiungiTariffa,
  useArchiviaDipendente,
  useDipendente,
  useEliminaDipendente,
  useSalvaDipendente,
} from './dipendenti'

const CONTRATTI = ['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale']

/** I livelli del CCNL Edilizia industria. Testo libero nel database, ma
 *  proposti in lista: i livelli sono questi e digitarli a mano produce
 *  solo "4", "IV" e "quarto" nella stessa colonna. */
const LIVELLI = ['1', '2', '3', '4', '5', '6', '7']

const vuotoSeVuoto = (v: string) => (v.trim() === '' ? null : v.trim())

const schema = z.object({
  cognome: z.string().min(1, 'Serve il cognome'),
  nome: z.string().min(1, 'Serve il nome'),
  matricola: z.string(),
  codice_fiscale: z
    .string()
    .refine((v) => v === '' || v.trim().length === 16, 'Il codice fiscale ha 16 caratteri'),
  mansione: z.string(),
  livello_ccnl: z.string(),
  tipo_contratto: z.string(),
  data_assunzione: z.string(),
  data_cessazione: z.string(),
  telefono: z.string(),
  email: z.string().refine((v) => v === '' || /.+@.+\..+/.test(v), 'Email non valida'),
})

type Campi = z.infer<typeof schema>

const VUOTO: Campi = {
  cognome: '',
  nome: '',
  matricola: '',
  codice_fiscale: '',
  mansione: '',
  livello_ccnl: '',
  tipo_contratto: '',
  data_assunzione: '',
  data_cessazione: '',
  telefono: '',
  email: '',
}

export function DipendenteForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: dipendente, isPending, error } = useDipendente(id)
  const salva = useSalvaDipendente()
  const archivia = useArchiviaDipendente()
  const elimina = useEliminaDipendente()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: VUOTO })

  useEffect(() => {
    if (!dipendente) return
    reset({
      cognome: dipendente.cognome,
      nome: dipendente.nome,
      matricola: dipendente.matricola ?? '',
      codice_fiscale: dipendente.codice_fiscale ?? '',
      mansione: dipendente.mansione ?? '',
      livello_ccnl: dipendente.livello_ccnl ?? '',
      tipo_contratto: dipendente.tipo_contratto ?? '',
      data_assunzione: dipendente.data_assunzione ?? '',
      data_cessazione: dipendente.data_cessazione ?? '',
      telefono: dipendente.telefono ?? '',
      email: dipendente.email ?? '',
    })
  }, [dipendente, reset])

  if (!nuovo && isPending) {
    return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  }
  if (error) return <Avviso tono="errore">Non trovo questo operaio: {error.message}</Avviso>

  async function onSubmit(c: Campi) {
    const salvato = await salva.mutateAsync({
      id,
      dati: {
        cognome: c.cognome.trim(),
        nome: c.nome.trim(),
        matricola: vuotoSeVuoto(c.matricola),
        codice_fiscale: vuotoSeVuoto(c.codice_fiscale)?.toUpperCase() ?? null,
        mansione: vuotoSeVuoto(c.mansione),
        livello_ccnl: vuotoSeVuoto(c.livello_ccnl),
        tipo_contratto: vuotoSeVuoto(c.tipo_contratto),
        data_assunzione: vuotoSeVuoto(c.data_assunzione),
        data_cessazione: vuotoSeVuoto(c.data_cessazione),
        telefono: vuotoSeVuoto(c.telefono),
        email: vuotoSeVuoto(c.email),
      },
    })
    // Dopo la creazione si resta sulla scheda invece di tornare alla
    // lista: senza tariffa l'operaio non costa niente, e la sezione
    // tariffe esiste solo quando c'e' un id. Rimandarlo alla lista
    // significherebbe fargli dimenticare il pezzo che conta.
    if (nuovo) navigate(`/anagrafiche/operai/${salvato}`, { replace: true })
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            {nuovo ? 'Nuovo operaio' : `${dipendente?.cognome} ${dipendente?.nome}`}
          </h1>
          {!nuovo && !dipendente?.attivo && (
            <Badge className="mt-1">archiviato — non compare negli elenchi</Badge>
          )}
        </div>
        <Button onClick={() => navigate('/anagrafiche/operai')}>Torna all&rsquo;elenco</Button>
      </div>

      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5">
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
              etichetta="Matricola"
              disabled={!puoScrivere}
              errore={errors.matricola?.message}
              {...register('matricola')}
            />
            <Campo
              etichetta="Codice fiscale"
              disabled={!puoScrivere}
              className="uppercase"
              errore={errors.codice_fiscale?.message}
              {...register('codice_fiscale')}
            />
            <CampoSelect
              etichetta="Livello CCNL"
              disabled={!puoScrivere}
              errore={errors.livello_ccnl?.message}
              {...register('livello_ccnl')}
            >
              <option value="">—</option>
              {LIVELLI.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </CampoSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Mansione"
              placeholder="capo squadra, muratore, manovale…"
              disabled={!puoScrivere}
              errore={errors.mansione?.message}
              {...register('mansione')}
            />
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Data assunzione"
              type="date"
              disabled={!puoScrivere}
              errore={errors.data_assunzione?.message}
              {...register('data_assunzione')}
            />
            <Campo
              etichetta="Data cessazione"
              type="date"
              disabled={!puoScrivere}
              suggerimento="Da compilare solo quando lascia l’azienda"
              errore={errors.data_cessazione?.message}
              {...register('data_cessazione')}
            />
          </div>

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
        </Card>

        {puoScrivere && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variante="primario" disabled={salva.isPending || !isDirty}>
              {salva.isPending ? 'Salvo…' : nuovo ? 'Crea operaio' : 'Salva modifiche'}
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
                    if (!confirm('Eliminare definitivamente questo operaio?')) return
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

      {!nuovo && dipendente && (
        <Tariffe
          dipendenteId={dipendente.id}
          tariffe={dipendente.dipendente_costi}
          puoScrivere={puoScrivere}
        />
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
          Nessuna tariffa: le ore di questo operaio valgono zero euro nel consuntivo dei
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
              <th className="text-right">Vendita</th>
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
                <Cifra className="text-gray-600">{euro(t.tariffa_vendita_oraria)}</Cifra>
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
  tariffa_vendita_oraria: z.string(),
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
      tariffa_vendita_oraria: '',
      note: '',
    },
  })

  const numeroOpzionale = (v: string) => (v.trim() === '' ? null : Number(v))

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      {errore && <Avviso tono="errore">{errore}</Avviso>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Campo
          etichetta="Vendita €"
          type="number"
          step="0.01"
          min="0"
          className="numerico"
          suggerimento="Quanto lo fatturi"
          errore={errors.tariffa_vendita_oraria?.message}
          {...register('tariffa_vendita_oraria')}
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
              tariffa_vendita_oraria: numeroOpzionale(c.tariffa_vendita_oraria),
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
