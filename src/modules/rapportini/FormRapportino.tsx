import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Avviso, Button, CampoArea, Campo, CampoSelect, Card, Input } from '../../ui'
import { ASSENZE, schemaRapportino, type CampiRapportino } from './campiRapportino'

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

  /**
   * La trasferta parte nascosta.
   *
   * Alla Edily la squadra sta praticamente sempre in sede, quindi quella
   * casella era una terza cifra da guardare e saltare per ogni operaio,
   * ogni giorno, su ogni cantiere: rumore. Ma il giorno che si spostano
   * davvero l'ora va scritta, e a stipendio si paga — quindi il campo
   * resta, si apre a richiesta.
   *
   * Si apre da sola se la scheda ha gia' delle trasferte dentro: un
   * valore salvato che non si vede e' un valore che nessuno puo' piu'
   * correggere.
   */
  const [mostraTrasferta, setMostraTrasferta] = useState(() =>
    valoriIniziali.ore.some((o) => Number(o.ore_trasferta) > 0),
  )

  /**
   * Stessa storia per l'orario di cantiere, con un'aggravante: era
   * precompilato 08:00–17:00. Un campo che nessuno guarda ma che si
   * riempie da solo non e' un campo inutile, e' un campo che scrive una
   * cosa non vera su ogni rapportino — e il giorno che serve davvero,
   * per una mezza giornata o una contestazione, quel dato non varrebbe
   * niente perche' c'e' su tutti uguale.
   *
   * Quindi: nascosto e vuoto. Chi ha bisogno di scrivere l'orario lo
   * apre, e allora quello che c'e' scritto vuol dire qualcosa. Le ore di
   * ogni operaio restano dove sono sempre state, nella squadra.
   */
  const [mostraOrario, setMostraOrario] = useState(
    () => Boolean(valoriIniziali.ora_inizio) || Boolean(valoriIniziali.ora_fine),
  )

  // useWatch e non watch(): watch() rilegge a ogni render e il
  // compilatore React non puo' memoizzarlo.
  const righe = useWatch({ control, name: 'ore' })
  const nessunaAttivita = useWatch({ control, name: 'nessuna_attivita' })
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
          suggerimento={bloccaCantiere ? 'Non si cambia: se è sbagliato, elimina la scheda' : undefined}
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

        <div className="grid gap-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              etichetta="Data"
              type="date"
              errore={errors.data?.message}
              {...register('data')}
            />
            {mostraOrario && (
              <>
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
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              // Chiuderlo svuota gli orari, come per la trasferta: un
              // 08:00–17:00 che non si vede piu' ma che parte lo stesso
              // e' peggio di non averlo.
              if (mostraOrario) {
                setValue('ora_inizio', '')
                setValue('ora_fine', '')
              }
              setMostraOrario((v) => !v)
            }}
            className="neo-press w-fit cursor-pointer rounded-lg border-2 border-black bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide"
          >
            {mostraOrario ? 'Niente orario' : '+ Orario di cantiere'}
          </button>
        </div>

        {/* Il campo si chiama `note` nel database — condiviso con
            wbs-office, non lo tocchiamo — ma qui si legge per quello che
            e': la descrizione di cosa si e' fatto in quel cantiere. Era
            l'ultima voce del riquadro e sembrava un ripensamento; e'
            invece la parte che il titolare legge per prima. */}
        <CampoArea
          etichetta="Descrizione attività"
          placeholder="Lavorazioni svolte, imprevisti, visite in cantiere…"
          errore={errors.note?.message}
          {...register('note')}
        />
      </Card>

      <Card className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-black">Squadra</h2>
          {!nessunaAttivita && (
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-gray-600">
                totale <span className="numerico">{totale}</span> ore
              </p>
              <button
                type="button"
                onClick={() => {
                  // Chiudendola si azzerano le ore di trasferta: un
                  // valore che non si vede piu' ma che parte lo stesso
                  // nel salvataggio e' il tipo di sorpresa che si scopre
                  // in busta paga.
                  if (mostraTrasferta) {
                    fields.forEach((_, i) => setValue(`ore.${i}.ore_trasferta`, 0))
                  }
                  setMostraTrasferta((v) => !v)
                }}
                className="neo-press cursor-pointer rounded-lg border-2 border-black bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide"
              >
                {mostraTrasferta ? 'Niente trasferta' : '+ Trasferta'}
              </button>
            </div>
          )}
        </div>

        {/* La giornata si chiude solo con TUTTE le schede compilate,
            compresi i cantieri fermi. Senza questa spunta l'unico modo
            di chiudere la scheda di un cantiere dove non si e' lavorato
            sarebbe inventare una presenza. */}
        <label className="neo-press flex cursor-pointer items-start gap-3 rounded-xl border-2 border-black bg-amber-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-amber-400"
            {...register('nessuna_attivita', {
              onChange: (e) => {
                // Spuntarla azzera la squadra: il database rifiuta una
                // scheda "nessuna attivita" che abbia righe di ore, e
                // chiedere all'utente di togliere le presenze a mano
                // sarebbe farlo lavorare per compiacere un vincolo.
                if (!e.target.checked) return
                fields.forEach((_, i) => {
                  setValue(`ore.${i}.presente`, false)
                  setValue(`ore.${i}.ore_ordinarie`, 0)
                  setValue(`ore.${i}.ore_straordinarie`, 0)
                  setValue(`ore.${i}.ore_trasferta`, 0)
                })
              },
            })}
          />
          <span>
            <span className="block text-sm font-extrabold text-black">
              Nessuna attività in questo cantiere
            </span>
            <span className="block text-xs font-semibold text-gray-600">
              La scheda si chiude lo stesso e la giornata può partire. Resta scritto che sei
              passato di qui e hai deciso, non che te ne sei dimenticato.
            </span>
          </span>
        </label>

        {!nessunaAttivita && (
          <p className="text-xs font-semibold text-gray-600">
            Togli chi non c&rsquo;era e correggi solo le differenze.
          </p>
        )}

        {errors.ore?.message && <Avviso tono="errore">{errors.ore.message}</Avviso>}

        <ul className={nessunaAttivita ? 'hidden' : 'grid gap-2'}>
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
                      {mostraTrasferta && (
                        <CampoOre etichetta="trasf." {...register(`ore.${i}.ore_trasferta`)} />
                      )}
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
