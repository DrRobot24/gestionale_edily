import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Button, Campo, CampoSelect, Card, cn } from '../../ui'
import { numero } from '../../lib/formato'
import {
  MOTIVI,
  MOTIVI_DI,
  doveAndare,
  useGiustificazioni,
  useOreSuRapportini,
  useSalvaGiustificazione,
  type Giustificazione,
  type MotivoOre,
  type TipoGiustificazione,
} from '../rapportini/useGiustificazioni'
import {
  ORE_STANDARD,
  anomaliaDi,
  funzioneMancante,
  useOreGiornata,
  type Anomalia,
  type OrePersona,
} from '../rapportini/useOreGiornata'

/* ══════════════════════════════════════════════════════════════════
   Il controllo delle 8 ore.

   La domanda a cui risponde non se la puo' porre un rapportino da solo:
   e' sulla PERSONA e sul GIORNO, attraverso tutti i cantieri. Mario
   Rossi con 4 ore sul cantiere X e' a posto; Mario Rossi con 4 ore sul X
   piu' 2 sul Y piu' 3 sul Z ha fatto 9 ore, e un'ora e' straordinario
   che nessuno ha ancora dichiarato.

   Compare SOLO quando c'e' qualcosa che non torna. Una giornata che
   quadra non merita un riquadro verde: la home del tecnico deve dire
   cosa fare adesso, e un pannello che si accende sempre e' un pannello
   che si smette di leggere.
   ══════════════════════════════════════════════════════════════════ */

export function ControlloOre({ giorno }: { giorno: string }) {
  const { data, isPending, error } = useOreGiornata(giorno)
  /* Le motivazioni gia' scritte e dove stanno le ore di ciascuno: due
     chiamate per tutta la giornata, non una per riga. Le anomalie di un
     giorno sono poche, e chiedere al server a ogni riga farebbe
     lampeggiare il riquadro. */
  const { data: giustificate } = useGiustificazioni(giorno)
  const { data: suRapportini } = useOreSuRapportini(giorno)

  /* Il file dello schema non e' stato eseguito: e' una cosa da fare, non
     un guasto, e va detta con quel tono. Senza questo ramo la home si
     riempirebbe di rosso per una funzione che manca. */
  if (error) {
    if (funzioneMancante(error)) {
      return (
        <Card className="border-dashed p-4">
          <p className="text-xs font-semibold text-gray-600">
            Il controllo delle ore non è ancora attivo: manca la funzione nel database
            (<span className="font-mono">supabase/schema/ore-giornata.sql</span>).
          </p>
        </Card>
      )
    }
    return (
      <Card className="border-rose-500 p-4">
        <p className="text-xs font-semibold text-rose-700">
          Non riesco a controllare le ore della giornata: {error.message}
        </p>
      </Card>
    )
  }

  if (isPending) {
    return (
      <Card className="p-5">
        <p className="text-sm font-bold text-gray-600">Controllo le ore…</p>
      </Card>
    )
  }

  if (!data) return null

  const anomalie: { persona: OrePersona; anomalia: Anomalia }[] = []
  for (const persona of data) {
    const anomalia = anomaliaDi(persona)
    if (anomalia) anomalie.push({ persona, anomalia })
  }

  /* Quando tutto torna il riquadro RESTA, e dice il totale.
     E' un cambio rispetto a prima, quando spariva: stava dentro le card
     della giornata e la sua assenza era gia' il messaggio. Adesso vive
     accanto al calendario, in una griglia a due colonne, e sparire
     lascerebbe mezza riga bianca — che e' esattamente cio' che
     l'utente non vuole vedere in una dashboard.
     Il tono resta sobrio: nessun verde da «bravo», solo il conto della
     giornata. La regola «la home mostra cose da fare» vale per i
     riquadri che CHIEDONO; questo e' un totale, e un totale serve
     anche quando e' giusto. */
  if (anomalie.length === 0) {
    const persone = data.length
    const ore = data.reduce(
      (t, p) => t + Number(p.ore_ordinarie) + Number(p.ore_straordinarie),
      0,
    )

    /* UNA RIGA, dal 2026-09-24: titolo a sinistra, totale a destra.
       Nella colonna stretta della home il riquadro con intestazione e
       spiegazione la allungava oltre la giornata accanto, lasciando un
       vuoto sotto gli assenti. Il metro delle otto ore sta nel `title`.
       Quando qualcosa non torna il riquadro pieno qui sotto resta: li'
       c'e' da fare. */
    return (
      <Card
        className="flex items-center justify-between gap-3 px-4 py-3"
        title={`Il conto è sulla persona, su tutti i cantieri. Il metro sono ${ORE_STANDARD} ore.`}
      >
        <div className="min-w-0">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">
            Ore della giornata
          </h2>
          <p className="text-[11px] font-semibold text-gray-600">
            {persone === 0
              ? 'nessuna ora registrata'
              : `${persone} ${persone === 1 ? 'persona' : 'persone'} · tornano per tutti`}
          </p>
        </div>
        {persone > 0 && (
          <p className="shrink-0 text-xl font-extrabold leading-none text-black">
            <span className="numerico">{numero(ore)}</span> ore
          </p>
        )}
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-200 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Controllo delle ore
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          Il conto è sulla persona e sulla giornata, su tutti i cantieri dell&rsquo;impresa. Il
          metro sono {ORE_STANDARD} ore.
        </p>
      </div>

      <ul className="divide-y-2 divide-black">
        {anomalie.map(({ persona, anomalia }) => (
          <RigaAnomalia
            key={persona.dipendente_id}
            persona={persona}
            anomalia={anomalia}
            giorno={giorno}
            gia={giustificate?.get(persona.dipendente_id)}
            dove={doveAndare(suRapportini?.get(persona.dipendente_id))}
          />
        ))}
      </ul>
    </Card>
  )
}

/** "1 ora" e non "1 ore". Una svista che fa sembrare improvvisato tutto
 *  il resto della schermata. */
function frase(ore: number): string {
  return ore === 1 ? '1 ora' : `${numero(ore)} ore`
}

/* ─────────────────────────────────────────────────────────────────
   UNA RIGA DEL CONTROLLO, con la strada per rimediare.

   Chiesto dall'utente il 2026-09-21: «si possa in maniera veloce e
   diretta andare a segnare la motivazione di quell'ammanco o di quello
   straordinario, prima nel rapportino in cui c'è inserito quel dato da
   allineare e poi se manca ci deve essere la possibilità di inserire
   manualmente».

   Quindi l'ordine e' quello: PRIMA il rapportino, POI il campo libero.
   Non si fa scrivere a mano una cosa che il programma sa gia' dove sta.
   ───────────────────────────────────────────────────────────────── */
function RigaAnomalia({
  persona,
  anomalia,
  giorno,
  gia,
  dove,
}: {
  persona: OrePersona
  anomalia: Anomalia
  giorno: string
  gia?: Giustificazione
  dove: ReturnType<typeof doveAndare>
}) {
  const navigate = useNavigate()
  const [scrivo, setScrivo] = useState(false)

  const totale = Number(persona.ore_ordinarie)
  const altrove = totale + Number(persona.ore_straordinarie) - Number(persona.ore_visibili)
  const straordinario = anomalia.tipo === 'straordinario'
  const tipo: TipoGiustificazione = straordinario ? 'eccedenza' : 'mancanza'

  /* GIA' MOTIVATA: la riga resta — il conto non torna lo stesso, e
     nasconderla farebbe sparire un'informazione vera — ma cambia tono.
     Verde perche' non chiede piu' niente: la palla e' passata al
     titolare, che valutera' se la motivazione convince. */
  if (gia && !scrivo) {
    return (
      <li className="bg-lime-50 px-5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-extrabold text-black">{persona.nominativo}</p>
          <p className="text-sm font-bold text-black">{numero(totale)} ore ordinarie</p>
        </div>
        <p className="mt-1 text-xs font-bold text-lime-800">
          {MOTIVI[gia.motivo]}
          {gia.descrizione && <span className="font-semibold"> — {gia.descrizione}</span>}
        </p>
        <div className="mt-2">
          <Button dimensione="sm" variante="secondario" onClick={() => setScrivo(true)}>
            Correggi il motivo
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className={cn('px-5 py-3', straordinario ? 'bg-amber-50' : 'bg-rose-50')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-extrabold text-black">{persona.nominativo}</p>
        <p className="text-sm font-bold text-black">
          {numero(totale)} ore ordinarie
          {Number(persona.ore_straordinarie) > 0 &&
            ` + ${numero(persona.ore_straordinarie)} di straordinario`}
        </p>
      </div>

      <p
        className={cn(
          'mt-1 text-xs font-bold',
          straordinario ? 'text-amber-800' : 'text-rose-700',
        )}
      >
        {straordinario
          ? `${frase(anomalia.ore)} oltre le ${ORE_STANDARD}: è straordinario da dichiarare.`
          : `Mancano ${frase(anomalia.ore)} alle ${ORE_STANDARD}.`}
      </p>

      {/* Quanto sta fuori dal perimetro di chi guarda. Si dice il quanto
          e mai il dove: il totale di giornata serve a chi compila, la
          mappa di chi lavora dove no. */}
      {altrove > 0 && (
        <p className="mt-1 text-xs font-semibold text-gray-600">
          Di queste, {numero(altrove)} sono su cantieri che non sono fra i tuoi.
        </p>
      )}

      {scrivo ? (
        <div className="mt-3">
          <ModuloMotivo
            dipendenteId={persona.dipendente_id}
            nominativo={persona.nominativo}
            giorno={giorno}
            tipo={tipo}
            ore={anomalia.ore}
            gia={gia}
            onChiudi={() => setScrivo(false)}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {/* IL RAPPORTINO PRIMA DI TUTTO, quando si sa quale.

              `dove` ha tre risposte e la seconda e' quella che l'utente
              ha descritto per lo straordinario: se nasce dalla somma di
              piu' rapportini non si puo' scegliere per lui, e allora
              resta il campo libero. */}
          {dove.tipo === 'uno' && (
            <Button
              dimensione="sm"
              onClick={() => navigate(`/rapportini/${dove.rapportinoId}/modifica`)}
            >
              Apri {dove.cantiere}
            </Button>
          )}

          <Button
            dimensione="sm"
            variante={dove.tipo === 'uno' ? 'secondario' : 'primario'}
            onClick={() => setScrivo(true)}
          >
            Scrivi il motivo
          </Button>
        </div>
      )}

      {/* Perche' il pulsante del rapportino non c'e'. Dirlo evita che il
          tecnico lo cerchi: senza spiegazione sembra una schermata
          incompleta, non una regola. */}
      {!scrivo && dove.tipo === 'molti' && (
        <p className="mt-1 text-[11px] font-semibold text-gray-600">
          Le ore stanno su più rapportini: qui non si può scegliere per te, scrivi il motivo.
        </p>
      )}
      {!scrivo && dove.tipo === 'nessuno' && (
        <p className="mt-1 text-[11px] font-semibold text-gray-600">
          Nessun rapportino tuo da correggere per questa persona.
        </p>
      )}
    </li>
  )
}

/* ─────────────────────────────────────────────────────────────────
   IL CAMPO LIBERO.

   Motivo da elenco PIU' testo libero, scelto con l'utente: l'elenco
   rende il dato utilizzabile per le paghe — «permesso» scritto in dieci
   modi diversi non si conta — e il testo racconta il caso, che e' quello
   che l'utente chiedeva: «cosa ha fatto per giustificare quella
   mancanza».
   ───────────────────────────────────────────────────────────────── */
function ModuloMotivo({
  dipendenteId,
  nominativo,
  giorno,
  tipo,
  ore,
  gia,
  onChiudi,
}: {
  dipendenteId: string
  nominativo: string
  giorno: string
  tipo: TipoGiustificazione
  ore: number
  gia?: Giustificazione
  onChiudi: () => void
}) {
  const salva = useSalvaGiustificazione(giorno)
  const [motivo, setMotivo] = useState<MotivoOre>(gia?.motivo ?? MOTIVI_DI[tipo][0])
  const [descrizione, setDescrizione] = useState(gia?.descrizione ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  async function invia() {
    if (motivo === 'altro' && !descrizione.trim()) {
      setProblema('Hai scelto «Altro»: scrivi cosa è successo.')
      return
    }
    setProblema(null)
    await salva.mutateAsync({
      dipendente_id: dipendenteId,
      tipo,
      motivo,
      descrizione: descrizione.trim() || null,
      ore,
    })
    onChiudi()
  }

  return (
    <div className="grid gap-2 rounded-xl border-2 border-black bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
        {nominativo} · {frase(ore)} {tipo === 'eccedenza' ? 'in più' : 'in meno'}
      </p>

      <CampoSelect
        etichetta="Motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as MotivoOre)}
      >
        {MOTIVI_DI[tipo].map((m) => (
          <option key={m} value={m}>
            {MOTIVI[m]}
          </option>
        ))}
      </CampoSelect>

      <Campo
        etichetta="Cosa è successo"
        value={descrizione}
        onChange={(e) => setDescrizione(e.target.value)}
        placeholder={
          tipo === 'eccedenza'
            ? 'Es. finita la gettata, è rimasto fino alle 18'
            : 'Es. visita medica, è andato via alle 16'
        }
        suggerimento="Lo legge il titolare quando valida: se non lo convince, respinge."
      />

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {salva.error && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}

      <div className="flex gap-2">
        <Button dimensione="sm" onClick={invia} disabled={salva.isPending}>
          {salva.isPending ? 'Salvo…' : 'Salva il motivo'}
        </Button>
        <Button
          dimensione="sm"
          variante="secondario"
          onClick={onChiudi}
          disabled={salva.isPending}
        >
          Annulla
        </Button>
      </div>
    </div>
  )
}
