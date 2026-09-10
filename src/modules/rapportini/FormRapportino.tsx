import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Avviso, Button, CampoArea, Campo, CampoSelect, Card, Input, cn } from '../../ui'
import {
  ASSENZE,
  ORE_STANDARD,
  schemaRapportino,
  type CampiRapportino,
} from './campiRapportino'
import { RiquadroFoto } from './RiquadroFoto'

type Props = {
  valoriIniziali: CampiRapportino
  cantieri: { id: string; codice: string; denominazione: string }[]
  /** In modifica il cantiere non si cambia: cambiarlo sposterebbe il
   *  rapportino sotto un'altra visibilita' e ne falserebbe la
   *  numerazione. Se e' quello sbagliato, la bozza si cancella. */
  bloccaCantiere?: boolean
  /** Assente su una scheda nuova: non esiste ancora niente a cui
   *  attaccare una foto. Le scelte restano in attesa e le carica chi
   *  salva, subito dopo aver creato il rapportino. */
  scheda?: { rapportinoId: string; orgId: string; cantiereId: string }
  etichettaSalva: string
  inCorso: boolean
  errore?: string
  onSalva: (campi: CampiRapportino, foto: File[]) => void
  onAnnulla: () => void
}

export function FormRapportino({
  valoriIniziali,
  cantieri,
  bloccaCantiere = false,
  scheda,
  etichettaSalva,
  inCorso,
  errore,
  onSalva,
  onAnnulla,
}: Props) {
  const [foto, setFoto] = useState<File[]>([])
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

  /**
   * La squadra si costruisce aggiungendo chi c'era, non togliendo chi
   * non c'era.
   *
   * Finche' il rapportino era uno solo al giorno funzionava al
   * contrario: partivano tutti presenti e il tecnico spuntava le
   * eccezioni. Ma adesso ogni cantiere attivo vuole la sua scheda, e lo
   * stesso operaio non puo' stare su sette cantieri: partire con tutti
   * dentro vorrebbe dire toglierne sei su sette, ogni volta.
   *
   * L'elenco delle righe resta completo — c'e' un posto per ogni
   * dipendente, sempre — e cambia solo quali si vedono. Il salvataggio
   * scarta gia' da se' chi non e' ne' presente ne' assente giustificato,
   * quindi sotto non cambia niente.
   */
  const conIndice = fields.map((campo, i) => {
    const riga = righe?.[i] ?? valoriIniziali.ore[i]
    return {
      campo,
      i,
      presente: Boolean(riga?.presente),
      motivo: String(riga?.tipo_assenza ?? ''),
      scelto: Boolean(riga?.presente) || Boolean(riga?.tipo_assenza),
    }
  })
  const inSquadra = conIndice.filter((r) => r.scelto)
  const disponibili = conIndice.filter((r) => !r.scelto)

  function aggiungi(i: number) {
    setValue(`ore.${i}.presente`, true)
    setValue(`ore.${i}.tipo_assenza`, '')
    setValue(`ore.${i}.ore_assenza`, 0)
    setValue(`ore.${i}.ore_ordinarie`, ORE_STANDARD)
  }

  /** Toglierlo dalla scheda, non segnarlo assente: sono due cose
   *  diverse. Chi non c'entra con questo cantiere sparisce e basta, chi
   *  manca per ferie o malattia resta scritto con il suo motivo. */
  function togli(i: number) {
    setValue(`ore.${i}.presente`, false)
    setValue(`ore.${i}.tipo_assenza`, '')
    setValue(`ore.${i}.ore_ordinarie`, 0)
    setValue(`ore.${i}.ore_straordinarie`, 0)
    setValue(`ore.${i}.ore_trasferta`, 0)
    setValue(`ore.${i}.ore_assenza`, 0)
  }

  return (
    <form
      onSubmit={handleSubmit((campi) => onSalva(campi, foto))}
      className="grid gap-4"
      noValidate
    >
      {errore && <Avviso tono="errore">{errore}</Avviso>}

      {/* La fascia di testa, a tutta larghezza.

          Dice DI CHI e' la scheda — quale cantiere, quale giorno, cosa si
          e' fatto — e va letta prima di tutto, da chi compila come da chi
          valida. Sotto, il lavoro vero si divide in due colonne.

          Dentro la fascia sono a loro volta due colonne: a sinistra gli
          identificativi, che sono campi corti, a destra la descrizione,
          che e' l'unica cosa lunga da scrivere. Impilarle sprecherebbe
          mezza riga per il cantiere e lascerebbe la descrizione larga
          come una pagina, che e' la misura peggiore per scrivere. */}
      <Card className="grid gap-4 p-5 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-4">
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
              className="neo-press w-fit cursor-pointer justify-self-end rounded-lg border-2 border-black bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide"
            >
              {mostraOrario ? 'Niente orario' : '+ Orario di cantiere'}
            </button>
          </div>
        </div>

        {/* Il campo si chiama `note` nel database — condiviso con
            wbs-office, non lo tocchiamo — ma qui si legge per quello che
            e': la descrizione di cosa si e' fatto in quel cantiere. Era
            l'ultima voce del riquadro e sembrava un ripensamento; e'
            invece la parte che il titolare legge per prima. */}
        <CampoArea
          etichetta="Descrizione attività"
          placeholder="Lavorazioni svolte, imprevisti, visite in cantiere…"
          className="lg:min-h-44"
          errore={errors.note?.message}
          {...register('note')}
        />
      </Card>

      {/* Il piano di lavoro, in due colonne dal formato laptop in su.

          A sinistra la squadra da sola: e' il blocco piu' largo — nome,
          tendina, due caselle e la ics sulla stessa riga — e il piu'
          cliccato della pagina. A destra foto e note, che sono materiale
          di corredo e stanno bene stretti.

          L'ordine nel codice e' anche l'ordine sul telefono, dove le
          colonne non esistono e si legge dall'alto in basso: squadra,
          subappalto, foto, note. Sotto i 1024 pixel non cambia niente
          rispetto a prima. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-4 lg:col-span-2">
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
                    // Anche le assenze: una scheda "nessuna attivita" che si
                    // porta dietro righe di ferie non e' vuota, e il vincolo
                    // del database la rifiuterebbe.
                    fields.forEach((_, i) => togli(i))
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

            {errors.ore?.message && <Avviso tono="errore">{errors.ore.message}</Avviso>}

            {!nessunaAttivita && (
              <>
                {inSquadra.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-gray-400 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                    Ancora nessuno su questo cantiere. Scegli qui sotto chi c&rsquo;era.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {inSquadra.map(({ campo, i, presente, motivo }) => (
                      <li
                        key={campo.id}
                        /* Tre stati, non due: in cantiere, in cantiere
                           con una parte di giornata coperta da un motivo,
                           e fuori del tutto. Il giallo e' il caso nuovo, ed
                           e' quello che prima non si poteva nemmeno
                           scrivere. */
                        className={cn(
                          'rounded-xl border-2 border-black p-3',
                          !presente ? 'bg-gray-100' : motivo ? 'bg-amber-50' : 'bg-white',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={
                              presente
                                ? 'flex-1 text-sm font-bold text-black'
                                : 'flex-1 text-sm font-bold text-gray-500'
                            }
                          >
                            {campo.nominativo}
                          </span>

                          {/* Una tendina al posto della spunta: dice in che
                              veste la persona sta su questa scheda, e
                              "assente per ferie" e "assente e basta" non
                              sono la stessa cosa per chi fa le paghe. */}
                          <select
                            className="cursor-pointer rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                            {...register(`ore.${i}.tipo_assenza`, {
                              onChange: (e) => {
                                if (e.target.value === '') {
                                  setValue(`ore.${i}.ore_assenza`, 0)
                                  setValue(`ore.${i}.presente`, true)
                                  if (!Number(righe?.[i]?.ore_ordinarie)) {
                                    setValue(`ore.${i}.ore_ordinarie`, ORE_STANDARD)
                                  }
                                  return
                                }

                                // Il motivo copre quello che MANCA alle otto,
                                // non per forza la giornata intera. Chi ha
                                // gia' scritto sei ore sta dichiarando un
                                // permesso di due, non un giorno di permesso:
                                // prima questa distinzione non si poteva
                                // nemmeno scrivere.
                                const lavorate = Number(righe?.[i]?.ore_ordinarie) || 0
                                setValue(
                                  `ore.${i}.ore_assenza`,
                                  Math.max(0, ORE_STANDARD - lavorate),
                                )
                                setValue(`ore.${i}.presente`, lavorate > 0)
                                if (lavorate === 0) {
                                  // Otto ore di lavoro mentre e' in ferie
                                  // gliele pagherebbero due volte.
                                  setValue(`ore.${i}.ore_straordinarie`, 0)
                                  setValue(`ore.${i}.ore_trasferta`, 0)
                                }
                              },
                            })}
                          >
                            <option value="">In cantiere</option>
                            {ASSENZE.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-2">
                            {/* Le ore lavorate si vedono SEMPRE, anche su una
                                riga con un motivo addosso: e' scrivendo qui
                                le ore fatte davvero che si dichiara mezza
                                giornata di permesso invece di una intera.
                                Nasconderle finche' non e' "presente"
                                lascerebbe la mezza giornata senza una porta
                                da cui entrare. */}
                            <CampoOre
                              etichetta="ord."
                              {...register(`ore.${i}.ore_ordinarie`, {
                                onChange: (e) =>
                                  setValue(`ore.${i}.presente`, Number(e.target.value) > 0),
                              })}
                            />
                            <CampoOre etichetta="str." {...register(`ore.${i}.ore_straordinarie`)} />
                            {mostraTrasferta && (
                              <CampoOre etichetta="trasf." {...register(`ore.${i}.ore_trasferta`)} />
                            )}
                            {motivo !== '' && (
                              <CampoOre etichetta="assenza" {...register(`ore.${i}.ore_assenza`)} />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => togli(i)}
                            aria-label={`Togli ${campo.nominativo} da questa scheda`}
                            title="Togli da questa scheda"
                            className="neo-press h-8 w-8 shrink-0 cursor-pointer rounded-lg border-2 border-black bg-white text-base font-extrabold leading-none hover:bg-rose-200"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* La tendina torna sempre sul segnaposto dopo la scelta:
                    serve ad aggiungere, non a ricordare l'ultimo scelto. */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    disabled={disponibili.length === 0}
                    onChange={(e) => {
                      if (e.target.value !== '') aggiungi(Number(e.target.value))
                    }}
                    className="neo-press flex-1 cursor-pointer rounded-xl border-2 border-black bg-amber-50 px-4 py-2.5 text-sm font-bold disabled:cursor-default disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">
                      {disponibili.length === 0
                        ? 'Ci sono già tutti'
                        : '+ Aggiungi chi c’era in cantiere'}
                    </option>
                    {disponibili.map(({ campo, i }) => (
                      <option key={campo.id} value={i}>
                        {campo.nominativo}
                      </option>
                    ))}
                  </select>

                  {/* Quando la squadra e' tutta sullo stesso cantiere,
                      sceglierli uno per uno e' lavoro inutile. */}
                  {disponibili.length > 1 && (
                    <button
                      type="button"
                      onClick={() => disponibili.forEach(({ i }) => aggiungi(i))}
                      className="neo-press cursor-pointer rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-bold"
                    >
                      Tutta la squadra
                    </button>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Subappalto: sta subito sotto la squadra perche' risponde alla
              stessa domanda — chi ha lavorato oggi qui — solo per le
              imprese che non sono la nostra.

              Per ora e' un posto riservato e basta: non ha campi e non
              salva niente. Inventarsi adesso le colonne (ragione sociale?
              fornitore collegato? ore? importo?) vorrebbe dire scegliere al
              posto di chi lo usera', e poi migrare dati veri per
              correggersi. */}
          <Card className="grid gap-2 border-dashed p-5">
            <h2 className="text-lg font-extrabold text-gray-500">Subappalto</h2>
            <p className="text-sm font-semibold text-gray-500">
              Le imprese esterne che hanno lavorato in questo cantiere oggi. Sezione ancora da
              costruire: per adesso non si compila e non salva nulla.
            </p>
          </Card>
        </div>

        <div className="grid gap-4">
          {/* Le foto stanno fra la squadra e il taccuino: sono i fatti della
              giornata, come le ore, e vengono prima dei commenti. */}
          <RiquadroFoto scheda={scheda} inAttesa={foto} onCambia={setFoto} />

          {/* Il taccuino sta per conto suo, in fondo.
              Dentro il riquadro della squadra sembrerebbe una nota sulle
              persone, e in cima verrebbe scambiato per la descrizione. Qui
              e' la casella dell'"altro": la si legge dopo aver visto i
              fatti, che e' anche l'ordine in cui il titolare guarda. */}
          <Card className="grid gap-3 p-5">
            <CampoArea
              etichetta="Note per il titolare"
              placeholder="Manca il cemento, il cliente si è lamentato, lunedì serve la gru…"
              suggerimento="Quello che vuoi dire e che non è lavoro svolto. Facoltativo."
              errore={errors.annotazioni?.message}
              {...register('annotazioni')}
            />
          </Card>
        </div>
      </div>

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
