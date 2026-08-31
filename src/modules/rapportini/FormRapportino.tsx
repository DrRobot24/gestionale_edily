import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Avviso, Button, Campo, CampoArea, CampoSelect, Card, Input } from '../../ui'
import {
  ASSENZE,
  METEO,
  schemaRapportino,
  type CampiRapportino,
} from './campiRapportino'

type Props = {
  valoriIniziali: CampiRapportino
  cantieri: { id: string; codice: string; denominazione: string }[]
  /** In modifica il cantiere non si cambia: cambiarlo sposterebbe il
   *  rapportino sotto un'altra visibilita' e ne falserebbe la
   *  numerazione. Se e' quello sbagliato, la bozza si cancella. */
  bloccaCantiere?: boolean
  etichettaSalva: string
  inCorso: boolean
  errore?: string
  onSalva: (campi: CampiRapportino) => void
  onAnnulla: () => void
}

export function FormRapportino({
  valoriIniziali,
  cantieri,
  bloccaCantiere = false,
  etichettaSalva,
  inCorso,
  errore,
  onSalva,
  onAnnulla,
}: Props) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CampiRapportino>({
    resolver: zodResolver(schemaRapportino),
    defaultValues: valoriIniziali,
  })

  const { fields } = useFieldArray({ control, name: 'ore' })

  // useWatch e non watch(): watch() rilegge a ogni render e il
  // compilatore React non puo' memoizzarlo.
  const righe = useWatch({ control, name: 'ore' })
  const totale = (righe ?? []).reduce(
    (s, r) =>
      s + (r.presente ? Number(r.ore_ordinarie || 0) + Number(r.ore_straordinarie || 0) : 0),
    0,
  )

  return (
    <form onSubmit={handleSubmit(onSalva)} className="grid gap-4" noValidate>
      {errore && <Avviso tono="errore">{errore}</Avviso>}

      <Card className="grid gap-4 p-5">
        <CampoSelect
          etichetta="Cantiere"
          disabled={bloccaCantiere}
          suggerimento={bloccaCantiere ? 'Non si cambia: se è sbagliato, elimina la bozza' : undefined}
          errore={errors.cantiere_id?.message}
          {...register('cantiere_id')}
        >
          {cantieri.length > 1 && <option value="">— scegli —</option>}
          {cantieri.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codice} — {c.denominazione}
            </option>
          ))}
        </CampoSelect>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etichetta="Data" type="date" errore={errors.data?.message} {...register('data')} />
          <Campo
            etichetta="Inizio"
            type="time"
            errore={errors.ora_inizio?.message}
            {...register('ora_inizio')}
          />
          <Campo
            etichetta="Fine"
            type="time"
            errore={errors.ora_fine?.message}
            {...register('ora_fine')}
          />
        </div>

        {/* datalist e non select: `meteo` e' testo libero nel database e
            va bene che lo resti, ma i valori comuni devono stare a un
            tocco di distanza invece che da digitare sotto la pioggia. */}
        <Campo
          etichetta="Meteo"
          list="meteo-comuni"
          placeholder="Sereno, pioggia…"
          errore={errors.meteo?.message}
          {...register('meteo')}
        />
        <datalist id="meteo-comuni">
          {METEO.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <CampoArea
          etichetta="Note"
          placeholder="Lavorazioni svolte, imprevisti, visite in cantiere…"
          errore={errors.note?.message}
          {...register('note')}
        />
      </Card>

      <Card className="grid gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold text-black">Squadra</h2>
          <p className="text-xs font-bold text-gray-600">
            totale <span className="numerico">{totale}</span> ore
          </p>
        </div>

        <p className="text-xs font-semibold text-gray-600">
          Togli chi non c&rsquo;era e correggi solo le differenze.
        </p>

        {errors.ore?.message && <Avviso tono="errore">{errors.ore.message}</Avviso>}

        <ul className="grid gap-2">
          {fields.map((f, i) => {
            const presente = righe?.[i]?.presente ?? true
            return (
              <li
                key={f.id}
                className={
                  presente
                    ? 'rounded-xl border-2 border-black bg-white p-3'
                    : 'rounded-xl border-2 border-black bg-gray-100 p-3'
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-5 w-5 cursor-pointer accent-amber-400"
                      {...register(`ore.${i}.presente`, {
                        onChange: (e) => {
                          // Toglierlo dalla squadra azzera le ore:
                          // lasciarle a 8 salverebbe otto ore di un assente.
                          if (!e.target.checked) {
                            setValue(`ore.${i}.ore_ordinarie`, 0)
                            setValue(`ore.${i}.ore_straordinarie`, 0)
                            setValue(`ore.${i}.ore_trasferta`, 0)
                          } else {
                            setValue(`ore.${i}.ore_ordinarie`, 8)
                            setValue(`ore.${i}.tipo_assenza`, '')
                          }
                        },
                      })}
                    />
                    <span
                      className={presente ? 'text-sm font-bold' : 'text-sm font-bold text-gray-500'}
                    >
                      {f.nominativo}
                    </span>
                  </label>

                  {presente ? (
                    <div className="flex items-center gap-2">
                      <CampoOre etichetta="ord." {...register(`ore.${i}.ore_ordinarie`)} />
                      <CampoOre etichetta="str." {...register(`ore.${i}.ore_straordinarie`)} />
                      <CampoOre etichetta="trasf." {...register(`ore.${i}.ore_trasferta`)} />
                    </div>
                  ) : (
                    <select
                      className="cursor-pointer rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                      {...register(`ore.${i}.tipo_assenza`)}
                    >
                      <option value="">Assente — motivo?</option>
                      {ASSENZE.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" variante="primario" disabled={isSubmitting || inCorso}>
          {inCorso ? 'Salvo…' : etichettaSalva}
        </Button>
        <Button onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </Button>
      </div>
    </form>
  )
}

function CampoOre({
  etichetta,
  ...props
}: React.ComponentPropsWithRef<'input'> & { etichetta: string }) {
  return (
    <label className="grid justify-items-center gap-0.5">
      <span className="text-[10px] font-bold uppercase text-gray-500">{etichetta}</span>
      <Input
        type="number"
        min={0}
        max={24}
        step={0.5}
        inputMode="decimal"
        className="numerico w-16 px-2 py-1.5 text-center text-sm"
        {...props}
      />
    </label>
  )
}
