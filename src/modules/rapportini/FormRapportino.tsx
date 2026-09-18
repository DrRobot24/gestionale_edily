import { useEffect, useState } from 'react'
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
import { RiquadroEconomia, type DatiEconomia } from './RiquadroEconomia'

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
  onSalva: (campi: CampiRapportino, foto: File[], economia: DatiEconomia[]) => void
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
  // Come le foto: su una scheda nuova restano qui finche' non c'e' un
  // rapportino, perche' cantiere e giorno si possono ancora cambiare e
  // scriverle subito le lascerebbe appese al cantiere sbagliato.
  const [economia, setEconomia] = useState<DatiEconomia[]>([])
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CampiRapportino>({
    resolver: zodResolver(schemaRapportino),
    defaultValues: valoriIniziali,
  })

  const { fields } = useFieldArray({ control, name: 'ore' })

  /* E il browser avvisa prima di buttare via il lavoro.
  
     Copre il caso che il cartello qui sotto non prende: F5, la freccia
     indietro, la scheda chiusa per sbaglio. Il testo lo decide il
     browser e non si puo' cambiare — `preventDefault()` e' tutto cio'
     che serve, il resto e' cerimonia storica.
  
     Solo a form sporco: registrarlo sempre vorrebbe dire chiedere
     conferma per uscire da una pagina che non si e' toccata. */
  useEffect(() => {
    if (!isDirty || inCorso) return

    const avvisa = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [isDirty, inCorso])

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
  // Cantiere e giorno si leggono dal form, non dai valori iniziali: su
  // una scheda nuova si possono ancora cambiare, e le note in economia
  // devono seguire quello che si sta compilando adesso.
  const cantiereScelto = useWatch({ control, name: 'cantiere_id' })
  const giornoScelto = useWatch({ control, name: 'data' })
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
    const presente = Boolean(riga?.presente)
    const motivo = String(riga?.tipo_assenza ?? '')
    const lavorate = Number(riga?.ore_ordinarie ?? 0) + Number(riga?.ore_straordinarie ?? 0)
    const assenza = Number(riga?.ore_assenza ?? 0)

    return {
      campo,
      i,
      presente,
      motivo,
      scelto: presente || Boolean(motivo),
      /* La riga dice qualcosa: o ha ore lavorate, o ha un motivo con le
         sue ore di assenza. Non decide piu' il colore del segno — lo
         decide `confermata` — ma serve ancora a impedire di confermare
         una riga vuota. */
      completa: lavorate > 0 || (motivo !== '' && assenza > 0),
      confermata: Boolean(riga?.confermata),
    }
  })
  /* Il primo motivo per cui il salvataggio non parte, in parole.
  
     `errors` si riempie al primo tentativo fallito: finche' nessuno ha
     premuto Salva e' vuoto, quindi la barra resta gialla e non accusa
     nessuno prima del tempo. */
  const primoErrore =
    errors.ore?.message ??
    errors.cantiere_id?.message ??
    errors.data?.message ??
    Object.values(errors).find((e) => e && 'message' in e && e.message)?.message
  const bloccato = typeof primoErrore === 'string' && primoErrore.length > 0

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
      onSubmit={handleSubmit((campi) => onSalva(campi, foto, economia))}
      className="grid gap-4"
      noValidate
    >
      {errore && <Avviso tono="errore">{errore}</Avviso>}

      {/* LA BARRA DEL SALVATAGGIO, IN ALTO E APPICCICATA.

          Chiesta dall'utente il 2026-09-17: «uno giustamente puo'
          dimenticarsi di premerlo». Il rapportino e' lungo — squadra,
          lavori extra, foto, note — e il pulsante in fondo si vede solo
          arrivando in fondo. Chi tocca le ore in cima e poi cambia
          schermata non lo incontra mai.

          `sticky` e non un secondo pulsante fermo: scorrendo resta
          attaccata sotto il bordo e segue chi lavora, che e' l'unico
          modo perche' il pulsante sia li' quando serve invece che dove
          e' stato messo.

          COMPARE SOLO A FORM SPORCO, ed e' la stessa regola del
          cartello in fondo: finche' non hai toccato niente non c'e'
          niente da salvare, e una barra sempre accesa ruberebbe spazio
          alla scheda per non dire nulla. Quando appare, il suo apparire
          E' il messaggio. */}
      {isDirty && (
        <div
          className={cn(
            'sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-black px-4 py-2.5 shadow-neo',
            bloccato ? 'bg-rose-300' : 'bg-amber-300',
          )}
        >
          {/* QUANDO IL SALVATAGGIO E' BLOCCATO LO DICE QUI.

              react-hook-form, se la validazione fallisce, non chiama
              `onSalva` e non succede NIENTE: nessun errore, nessun
              movimento. L'utente preme e resta a guardare — e' successo
              il 2026-09-17, e la colpa era della regola sulla spunta
              verde introdotta poche ore prima.

              Il messaggio di quella regola esce con `path: ['ore']`,
              cioe' dentro il riquadro Squadra, che a pulsante premuto
              puo' essere fuori schermo. Qui invece sta accanto al
              pulsante, dove si sta guardando nel momento in cui non
              succede niente. */}
          <span className="text-sm font-extrabold text-black">
            {bloccato ? primoErrore : 'Modifiche non salvate'}
          </span>
          <Button type="submit" variante="primario" disabled={isSubmitting || inCorso}>
            {inCorso ? 'Salvo…' : etichettaSalva}
          </Button>
        </div>
      )}

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
                    {inSquadra.map(({ campo, i, presente, motivo, completa, confermata }) => (
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
                        {/* ALLINEATI IN BASSO, non al centro.

                            I campi ore portano l'etichetta ORD./STR.
                            sopra il riquadro, la tendina e i due
                            pulsanti no: sono alti diversi. Centrandoli
                            le basi cadevano a tre quote diverse e la
                            riga sembrava storta. Appoggiandoli in basso
                            tutti i controlli poggiano sulla stessa
                            linea, e le etichettine sporgono in alto —
                            che e' il posto giusto per una didascalia.

                            Il nome torna centrato per conto suo:
                            `self-center` su un testo alto una riga, o
                            resterebbe incollato al fondo. */}
                        <div className="flex flex-wrap items-end gap-3">
                          <span
                            className={
                              presente
                                ? 'flex-1 self-center text-sm font-bold text-black'
                                : 'flex-1 self-center text-sm font-bold text-gray-500'
                            }
                          >
                            {campo.nominativo}
                          </span>

                          {/* Una tendina al posto della spunta: dice in che
                              veste la persona sta su questa scheda, e
                              "assente per ferie" e "assente e basta" non
                              sono la stessa cosa per chi fa le paghe. */}
                          <select
                            className="h-8 cursor-pointer rounded-lg border-2 border-black bg-white px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
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

                                /* Il motivo copre quello che MANCA alle
                                   otto, e quanto manca dipende da cosa c'e'
                                   scritto nelle ore.

                                   Su una riga a giornata piena — otto ore,
                                   che e' anche il valore con cui la persona
                                   entra in squadra — scegliere un motivo
                                   vuol dire che non c'era proprio: le ore
                                   si azzerano e il motivo copre tutto il
                                   giorno. Lasciargliele mentre e' in ferie
                                   gliele pagherebbe due volte.

                                   Se invece le ore sono state abbassate a
                                   mano, quella e' una scelta: sei ore
                                   scritte piu' "Permesso" vogliono dire un
                                   permesso di due ore, non un giorno. E'
                                   la distinzione che prima non si poteva
                                   nemmeno esprimere. */
                                const lavorate = Number(righe?.[i]?.ore_ordinarie) || 0

                                if (lavorate >= ORE_STANDARD) {
                                  setValue(`ore.${i}.ore_ordinarie`, 0)
                                  setValue(`ore.${i}.ore_straordinarie`, 0)
                                  setValue(`ore.${i}.ore_trasferta`, 0)
                                  setValue(`ore.${i}.ore_assenza`, ORE_STANDARD)
                                  setValue(`ore.${i}.presente`, false)
                                  return
                                }

                                setValue(`ore.${i}.ore_assenza`, ORE_STANDARD - lavorate)
                                setValue(`ore.${i}.presente`, lavorate > 0)
                                if (lavorate === 0) {
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

                          <div className="flex items-end gap-2">
                            {/* Le ore lavorate si vedono SEMPRE, anche su una
                                riga con un motivo addosso: e' scrivendo qui
                                le ore fatte davvero che si dichiara mezza
                                giornata di permesso invece di una intera.
                                Nasconderle finche' non e' "presente"
                                lascerebbe la mezza giornata senza una porta
                                da cui entrare. */}
                            {/* CAMBIARE LE ORE FA CADERE LA CONFERMA.

                                Senza questo, si potrebbe confermare 8
                                ore, scrivere 12 e salvare con la spunta
                                verde ancora accesa: confermerebbe dei
                                numeri che nessuno ha guardato, ed e'
                                proprio cio' contro cui la spunta esiste.
                                Ogni campo che cambia il totale la
                                spegne. */}
                            <CampoOre
                              etichetta="ord."
                              {...register(`ore.${i}.ore_ordinarie`, {
                                onChange: (e) => {
                                  setValue(`ore.${i}.presente`, Number(e.target.value) > 0)
                                  setValue(`ore.${i}.confermata`, false)
                                },
                              })}
                            />
                            <CampoOre
                              etichetta="str."
                              {...register(`ore.${i}.ore_straordinarie`, {
                                onChange: () => setValue(`ore.${i}.confermata`, false),
                              })}
                            />
                            {mostraTrasferta && (
                              <CampoOre
                                etichetta="trasf."
                                {...register(`ore.${i}.ore_trasferta`, {
                                  onChange: () => setValue(`ore.${i}.confermata`, false),
                                })}
                              />
                            )}
                            {motivo !== '' && (
                              <CampoOre
                                etichetta="assenza"
                                {...register(`ore.${i}.ore_assenza`, {
                                  onChange: () => setValue(`ore.${i}.confermata`, false),
                                })}
                              />
                            )}
                          </div>

                          {/* LA SPUNTA DI CONFERMA — chiesta dall'utente
                              il 2026-09-17.

                              Nasce BIANCA e diventa verde quando ci si
                              clicca: chi compila dichiara di aver
                              guardato QUESTE ore. Senza, la riga non
                              parte — il blocco e' nello schema, non qui,
                              perche' e' una regola e non un consiglio.

                              Il rischio di una conferma obbligatoria e'
                              che chi la dimentica perda le ore di un
                              operaio senza capire perche'. Qui non
                              succede: il salvataggio si ferma e dice
                              quali righe mancano, invece di scartarle in
                              silenzio.

                              Disabilitata finche' la riga e' vuota:
                              confermare zero ore non vuol dire niente, e
                              il `title` spiega perche' non si preme. */}
                          <button
                            type="button"
                            disabled={!completa}
                            aria-pressed={confermata}
                            onClick={() => setValue(`ore.${i}.confermata`, !confermata)}
                            aria-label={
                              confermata
                                ? `Togli la conferma a ${campo.nominativo}`
                                : `Conferma le ore di ${campo.nominativo}`
                            }
                            title={
                              !completa
                                ? 'Scrivi prima le ore, o il motivo dell’assenza'
                                : confermata
                                  ? 'Ore confermate — clicca per rimetterle in dubbio'
                                  : 'Conferma queste ore'
                            }
                            className={cn(
                              'h-8 w-8 shrink-0 rounded-lg border-2 border-black text-base font-extrabold leading-none',
                              confermata
                                ? 'neo-press cursor-pointer bg-lime-300 text-black'
                                : completa
                                  ? 'neo-press cursor-pointer bg-white text-gray-300 hover:bg-lime-100 hover:text-lime-700'
                                  : 'cursor-not-allowed border-gray-300 bg-gray-50 text-gray-200',
                            )}
                          >
                            ✓
                          </button>

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

          {/* I lavori extra nascono qui, mentre si compila la
              giornata: chi li ha fatti se li ricorda oggi, e il mese dopo
              il nido d'api non se lo ricorda piu' nessuno. Sta sotto la
              squadra perche' parla della stessa giornata, e lontano dalla
              descrizione attivita' perche' e' l'opposto: quella e' il
              lavoro previsto, questo e' cio' che il progetto non
              prevedeva. */}
          <RiquadroEconomia
            cantiereId={cantiereScelto}
            giorno={giornoScelto}
            subito={Boolean(scheda)}
            inAttesa={economia}
            onCambia={setEconomia}
          />

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

      {/* Qui NON si ripete il cartello «modifiche non salvate»: lo dice
          gia' la barra in cima, che a questo punto della pagina e'
          ancora appiccicata sotto il bordo e visibile. Dirlo due volte
          in una schermata sola insegna a non leggerlo nessuna delle
          due. */}
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
        className="numerico h-8 w-16 px-2 py-0 text-center text-sm"
        {...props}
      />
    </label>
  )
}
