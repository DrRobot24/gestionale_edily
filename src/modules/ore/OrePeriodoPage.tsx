import { useState } from 'react'
import { Avviso, Badge, Button, Card, Table, Cifra, Vuoto, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import {
  conPasso,
  contieneOggi,
  etichetta,
  fuoriGriglia,
  funzioneMancante,
  giorniDi,
  inGriglia,
  iso,
  lavorate,
  nelFuturo,
  ore,
  periodoCorrente,
  sposta,
  totaleGiorno,
  useGiornateInSospeso,
  useOreGriglia,
  type OreGiorno,
  type RigaGriglia,
} from './useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   LE ORE PER PERSONA — la pagina dell'amministrazione.

   Chiude un buco aperto da noi. Il 2026-09-15 i rapportini sono usciti
   dal menu dell'amministrazione — provato in ufficio, a Stefania non
   interessano — ma il sostituto non c'era, e da allora lei non aveva
   NESSUNA strada per leggere le ore che deve elaborare.

   Non e' l'elenco dei rapportini con un filtro sopra. Il rapportino e'
   il documento della giornata di un cantiere; questa e' la riga di una
   persona su un periodo, che e' cio' su cui si mettono le tariffe e da
   cui esce la busta paga.

   ── LA FORMA: UN FOGLIO PRESENZE ──────────────────────────────────

   Dal 2026-09-22 le colonne sono I GIORNI, non piu' le categorie di
   ore. Prima erano ORDINARIE / STRAORDINARIE / TRASFERTA / ASSENZE /
   GIORNI: cinque totali del periodo, giusti per moltiplicarli per una
   tariffa, ma muti su QUANDO. Chiesto dall'utente guardando la pagina:
   «gli operai come righe (tutti quelli in anagrafica ovviamente) ed i
   giorni della settimana sopra come colonne».

   La differenza non e' grafica, e' di gesto. Un foglio presenze si
   legge in due direzioni:

     per riga      quanto ha fatto una persona, giorno per giorno. Dove
                   mancano le ore, e QUALE giorno manca.
     per colonna   chi c'era quel giorno. Un venerdi' a mezzo organico
                   si vede solo in verticale, e da una colonna di totali
                   settimanali non si vedrebbe mai.

   I totali per categoria non sono spariti: stanno nel dettaglio che si
   apre, dove servono davvero — accanto ai cantieri che li spiegano.

   ── TUTTI QUELLI IN ANAGRAFICA ────────────────────────────────────

   Anche chi ha zero ore, in un gruppo in fondo sotto una riga di
   stacco. E' la differenza fra un foglio presenze e un estratto conto:
   una riga vuota e' una domanda che si puo' andare a chiudere, una riga
   che NON C'E' non la nota nessuno — e l'operaio dimenticato dal
   rapportino resterebbe fuori dalla busta in silenzio.

   ── LE DECISIONI PRECEDENTI DELL'UTENTE (2026-09-21) ───────────────

     settimana E mese     la settimana e' il ritmo del controllo, il
                          mese quello della firma. Un interruttore, non
                          due pagine.
     solo i validati      e' il senso del flusso: il titolare filtra con
                          la sua esperienza, e se si lavorasse anche
                          sulle bozze il suo giudizio sarebbe decorativo
     dettaglio per        non una colonna in piu': e' il mattone che
     cantiere             regge anche lo storico del cantiere e lo
                          storico delle lavorazioni di ogni risorsa
     le attivita' svolte  «dove sono le descrizioni delle attivita'?» —
                          oggi arrivano come giustificazioni e cantieri
                          dentro il dettaglio di ogni giornata

   NIENTE SOMME NEL BROWSER sui dati grezzi: le righe arrivano da una
   funzione `security definer`, perche' le viste sono
   `security_invoker=on` e a chi non ha cantieri assegnati — Stefania —
   tornerebbero zero senza nessun errore.
   ══════════════════════════════════════════════════════════════════ */

/** Cosa si sta guardando nel dettaglio aperto: una persona, e
 *  facoltativamente il giorno su cui si e' cliccato. */
type Aperta = { chi: string; giorno: string | null }

export function OrePeriodoPage() {
  const [periodo, setPeriodo] = useState(() => periodoCorrente('settimana'))
  const [aperta, setAperta] = useState<Aperta | null>(null)

  const griglia = useOreGriglia(periodo)
  const sospeso = useGiornateInSospeso(periodo)

  const righe = inGriglia(griglia.data ?? [])
  /* Da lunedi' a venerdi': «ovviamente da lun a ven perche' i non
     feriali non si lavora». Il sabato lavorato non sparisce — le sue
     ore restano nel totale della riga, che lo dichiara. */
  const giorni = giorniDi(periodo, true)

  /* Chi ha lavorato sopra, chi non ha niente in fondo. La tabella resta
     leggibile anche con venti operai di cui meta' fermi, e la riga di
     stacco dice che sotto comincia un'altra cosa. */
  const conOre = righe.filter((r) => r.ordinarie + r.straordinarie + r.assenza > 0)
  const senzaOre = righe.filter((r) => r.ordinarie + r.straordinarie + r.assenza === 0)

  const prossimo = sposta(periodo, 1)

  /* Sfogliando il periodo il dettaglio si chiude: resterebbe aperto su
     una persona e un giorno che non sono piu' quelli sullo schermo. */
  function vaiA(p: typeof periodo) {
    setPeriodo(p)
    setAperta(null)
  }

  /** Il `+` apre la persona su tutto il periodo; il click su una cella
   *  apre la stessa persona ma posizionata su quel giorno. Ricliccare
   *  dove si e' aperto chiude, che e' il modo piu' naturale. */
  function apriChiudi(chi: string, giorno: string | null) {
    setAperta((prima) =>
      prima && prima.chi === chi && prima.giorno === giorno ? null : { chi, giorno },
    )
  }

  const errore = griglia.error as Error | null
  if (errore && funzioneMancante(errore)) {
    return (
      <div className="space-y-4">
        <Testata />
        <Avviso tono="errore">
          La funzione della griglia non è ancora nel database. Va eseguito
          <code className="mx-1">supabase/schema/ore-griglia.sql</code>
          nel SQL Editor.
        </Avviso>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Testata />

      {/* ── La barra del periodo ──────────────────────────────────
          Le frecce stanno ai lati della data e non in una barra loro:
          e' la stessa scelta fatta in home il 2026-09-15, dove la data
          grande era gia' il titolo della pagina. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-emerald-100">
        <div className="flex items-center gap-3">
          <Button
            variante="secondario"
            onClick={() => vaiA(sposta(periodo, -1))}
            aria-label={periodo.passo === 'mese' ? 'Mese precedente' : 'Settimana precedente'}
          >
            ‹
          </Button>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              {periodo.passo === 'mese' ? 'Mese' : 'Settimana'}
            </div>
            <div className="text-xl font-black leading-tight">{etichetta(periodo)}</div>
          </div>
          <Button
            variante="secondario"
            onClick={() => vaiA(prossimo)}
            disabled={nelFuturo(prossimo)}
            aria-label={periodo.passo === 'mese' ? 'Mese successivo' : 'Settimana successiva'}
          >
            ›
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* L'interruttore. Due bottoni e non una tendina: le scelte
              sono due, e una tendina da due voci chiede un click in
              piu' per dire una cosa che sta gia' tutta sullo schermo. */}
          <div className="flex overflow-hidden rounded-xl border-2 border-black">
            {(['settimana', 'mese'] as const).map((p) => (
              <button
                key={p}
                type="button"
                /* `conPasso` e non `periodoCorrente`: chi sta guardando
                   la terza settimana di agosto e passa al mese vuole
                   agosto, non settembre. */
                onClick={() => vaiA(conPasso(periodo, p))}
                aria-pressed={periodo.passo === p}
                className={cn(
                  'px-4 py-2 text-xs font-bold uppercase tracking-wide',
                  periodo.passo === p
                    ? 'bg-amber-400 text-black'
                    : 'bg-white text-gray-600 hover:bg-amber-50',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {!contieneOggi(periodo) && (
            <Button variante="secondario" onClick={() => vaiA(periodoCorrente(periodo.passo))}>
              {periodo.passo === 'mese' ? 'Questo mese' : 'Questa settimana'}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Cosa non e' ancora arrivato ───────────────────────────
          Il numero piu' importante della pagina, e non sta nei totali.
          Se tre giornate sono ferme da Giuseppe il totale e' parziale e
          SEMBRA completo, e un totale che sembra completo finisce in
          busta paga. */}
      <InSospeso righe={sospeso.data ?? []} />

      {griglia.isLoading ? (
        <Card className="p-5 text-sm font-bold text-gray-600">Sto leggendo le ore…</Card>
      ) : errore ? (
        <Avviso tono="errore">{errore.message}</Avviso>
      ) : righe.length === 0 ? (
        <Vuoto>
          Nessuna persona in anagrafica per questo periodo. Le risorse si inseriscono da
          «Risorse».
        </Vuoto>
      ) : (
        <>
          <Griglia
            conOre={conOre}
            senzaOre={senzaOre}
            giorni={giorni}
            periodo={periodo.passo}
            aperta={aperta}
            onApri={apriChiudi}
          />
          <Legenda />
        </>
      )}
    </div>
  )
}

function Testata() {
  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight">Ore per persona</h1>
      <p className="text-xs font-bold text-gray-600">
        Solo le giornate validate dal titolare · clicca un numero per vedere dove ha lavorato
      </p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Le giornate ancora per strada.

   Si dice CHE cosa manca e QUANTO, mai di chi: qui non si viene a
   cercare un colpevole, si viene a sapere se ci si puo' fidare del
   totale. Il posto dove si sollecita e' un altro.
   ───────────────────────────────────────────────────────────────── */
function InSospeso({ righe }: { righe: { stato: string; giornate: number }[] }) {
  if (righe.length === 0) return null

  const totale = righe.reduce((s, r) => s + Number(r.giornate), 0)
  const dettagli = righe.map((r) => `${r.giornate} ${r.stato}`).join(' · ')

  return (
    <Avviso tono="errore">
      {totale === 1 ? "C'è 1 giornata" : `Ci sono ${totale} giornate`} non ancora
      validat{totale === 1 ? 'a' : 'e'} dal titolare in questo periodo ({dettagli}).
      I totali qui sotto sono parziali, e un buco può essere una giornata ferma invece che un
      giorno non lavorato.
    </Avviso>
  )
}

/* ── la griglia ──────────────────────────────────────────────────── */

function Griglia({
  conOre,
  senzaOre,
  giorni,
  periodo,
  aperta,
  onApri,
}: {
  conOre: RigaGriglia[]
  senzaOre: RigaGriglia[]
  giorni: string[]
  periodo: 'settimana' | 'mese'
  aperta: Aperta | null
  onApri: (chi: string, giorno: string | null) => void
}) {
  const oggi = iso(new Date())

  return (
    <Table>
      <colgroup>
        <col className="w-10" />
        <col />
        {giorni.map((g) => (
          <col key={g} className="w-16" />
        ))}
        <col className="w-24" />
      </colgroup>

      <thead>
        <tr>
          <th />
          <th>Persona</th>
          {giorni.map((g) => (
            <th
              key={g}
              className={cn(
                'border-l-2 border-gray-300 text-center',
                // Oggi si accende: su un periodo in corso dice a che
                // punto si e', e quali colonne sono ancora da riempire.
                g === oggi && 'bg-amber-200',
              )}
            >
              <div>{giornoCorto(g)}</div>
              <div className="text-[13px] font-black">{numeroGiorno(g)}</div>
            </th>
          ))}
          <th className="border-l-2 border-black text-right">Totale</th>
        </tr>
      </thead>

      <tbody>
        {conOre.map((r) => (
          <RigaPersona
            key={r.dipendente_id}
            riga={r}
            giorni={giorni}
            aperta={aperta?.chi === r.dipendente_id ? aperta : null}
            onApri={onApri}
          />
        ))}

        {/* La riga dei totali per giorno: la lettura verticale, e da
            sola giustifica la forma a griglia. Sta sotto chi ha
            lavorato e sopra chi non ha niente, perche' e' il totale di
            cio' che sta sopra. */}
        <tr className="border-t-2 border-black bg-gray-100 font-black">
          <td />
          <td className="uppercase">Totale {periodo === 'mese' ? 'mese' : 'settimana'}</td>
          {giorni.map((g) => {
            const t = totaleGiorno(conOre, g)
            return (
              <td
                key={g}
                className={cn(
                  'numerico border-l-2 border-gray-300 text-center',
                  t === 0 && 'font-semibold text-gray-300',
                )}
              >
                {t === 0 ? '—' : ore(t)}
              </td>
            )
          })}
          <Cifra className="border-l-2 border-black">
            {ore(conOre.reduce((s, r) => s + r.ordinarie + r.straordinarie, 0))}
          </Cifra>
        </tr>

        {/* ── chi non ha ore ─────────────────────────────────────
            Sotto una riga di stacco, non mescolati: la tabella resta
            leggibile anche con venti operai di cui meta' fermi. Ma ci
            SONO, perche' una riga vuota e' una domanda e una riga
            assente non la nota nessuno. */}
        {senzaOre.length > 0 && (
          <>
            <tr className="border-t-2 border-black bg-gray-50">
              <td />
              <td
                colSpan={giorni.length + 2}
                className="text-[10px] font-black uppercase tracking-wider text-gray-500"
              >
                Nessuna ora in questo periodo — {senzaOre.length}{' '}
                {senzaOre.length === 1 ? 'persona' : 'persone'}
              </td>
            </tr>

            {senzaOre.map((r) => (
              <RigaPersona
                key={r.dipendente_id}
                riga={r}
                giorni={giorni}
                aperta={aperta?.chi === r.dipendente_id ? aperta : null}
                onApri={onApri}
                spenta
              />
            ))}
          </>
        )}
      </tbody>
    </Table>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Una persona, con il suo dettaglio sotto.

   Chiusa di default: venti righe aperte sono un muro, e la domanda
   della prima occhiata e' «quante ore ha fatto Mario», non «dove».

   DUE GESTI PER DUE DOMANDE. Il `+` apre tutto il periodo giorno per
   giorno; cliccare una cella apre la stessa riga gia' posizionata su
   quel giorno — piu' diretto quando l'occhio cade su un numero strano.
   ───────────────────────────────────────────────────────────────── */
function RigaPersona({
  riga,
  giorni,
  aperta,
  onApri,
  spenta = false,
}: {
  riga: RigaGriglia
  giorni: string[]
  aperta: Aperta | null
  onApri: (chi: string, giorno: string | null) => void
  spenta?: boolean
}) {
  const fuori = fuoriGriglia(riga, giorni)
  const conGiustificazione = [...riga.giorni.values()].filter(
    (c) => c.giustificazione !== null,
  ).length

  return (
    <>
      <tr className={cn(aperta && 'bg-amber-50', spenta && 'text-gray-500')}>
        <td>
          <button
            type="button"
            onClick={() => onApri(riga.dipendente_id, null)}
            aria-expanded={Boolean(aperta)}
            aria-label={
              aperta
                ? `Chiudi il dettaglio di ${riga.nominativo}`
                : `Apri il dettaglio di ${riga.nominativo}`
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-white font-black hover:bg-amber-200"
          >
            {aperta ? '−' : '+'}
          </button>
        </td>

        <td>
          <button
            type="button"
            onClick={() => onApri(riga.dipendente_id, null)}
            className="block text-left hover:underline"
          >
            <span className="font-bold uppercase">{riga.nominativo}</span>
            {riga.matricola && (
              <span className="ml-2 text-[10px] font-bold text-gray-500">
                matr. {riga.matricola}
              </span>
            )}
            {/* Il tipo si scrive solo quando NON e' operaio: la griglia
                e' fatta per loro, e ripetere «operaio» venti volte e'
                rumore. Su un tecnico invece spiega perche' le sue ore
                non stanno su nessun cantiere. */}
            {riga.tipo !== 'operaio' && (
              <Badge className="ml-2 bg-sky-200">{riga.tipo}</Badge>
            )}
            {/* Si dichiara PRIMA di aprire cosa c'e' dentro: un «+» non
                promette niente, e una motivazione che nessuno ha motivo
                di cercare e' una motivazione che nessuno legge. */}
            {!aperta && conGiustificazione > 0 && (
              <span className="block text-[11px] font-semibold text-sky-700">
                {conGiustificazione}{' '}
                {conGiustificazione === 1 ? 'giornata motivata' : 'giornate motivate'}
              </span>
            )}
          </button>
        </td>

        {giorni.map((g) => (
          <Cella
            key={g}
            casella={riga.giorni.get(g)}
            aperta={aperta?.giorno === g}
            onApri={() => onApri(riga.dipendente_id, g)}
          />
        ))}

        <td className="border-l-2 border-black px-3 py-2 text-right">
          <span className="numerico text-sm font-black">
            {ore(riga.ordinarie + riga.straordinarie)}
          </span>
          {riga.straordinarie > 0 && (
            <div className="numerico text-[10px] font-bold text-rose-700">
              di cui {ore(riga.straordinarie)} str.
            </div>
          )}
          {/* Il sabato lavorato non ha una colonna, ma sta nel totale:
              dirlo evita che la riga sembri sbagliata a chi somma le
              celle con l'occhio. */}
          {fuori > 0 && (
            <div className="numerico text-[10px] font-bold text-gray-500">
              {ore(fuori)} fuori settimana
            </div>
          )}
        </td>
      </tr>

      {aperta && (
        <tr className="bg-amber-50">
          <td />
          <td colSpan={giorni.length + 2} className="pb-3">
            <Dettaglio riga={riga} giorni={giorni} giorno={aperta.giorno} onApri={onApri} />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Una casella: un numero, e basta — ma cliccabile.
 *
 * Un numero solo per giorno, perche' la griglia serve a leggersi di
 * sfuggita e due cifre per cella la trasformano in un tabulato. Lo
 * straordinario non sparisce: si vede dal colore, e il dettaglio lo
 * scompone.
 *
 * Un giorno di sola assenza NON e' un buco: si scrive la sigla. Un buco
 * dice «non so», una sigla dice «so che non c'era, ed ecco perche'» — e
 * in busta paga sono due cose diversissime.
 *
 * IL PUNTINO segna dove il tecnico ha scritto una motivazione. Senza,
 * per sapere se una giornata da sei ore e' spiegata bisognerebbe
 * aprirle tutte; con il puntino si aprono solo quelle che hanno
 * qualcosa da dire.
 */
function Cella({
  casella,
  aperta,
  onApri,
}: {
  casella: OreGiorno | undefined
  aperta: boolean
  onApri: () => void
}) {
  if (!casella) {
    return (
      <td className="border-l-2 border-gray-300 text-center text-gray-300">
        {/* Il trattino e non la cella vuota: una cella davvero vuota si
            confonde con un difetto di impaginazione, il trattino dice
            «qui ho guardato, e non c'era niente». Non e' cliccabile
            perche' non ha niente da raccontare. */}
        <span aria-hidden="true">—</span>
        <span className="sr-only">Nessuna ora</span>
      </td>
    )
  }

  const lav = lavorate(casella)
  const straordinario = Number(casella.ore_straordinarie) > 0
  const assente = lav === 0 && Number(casella.ore_assenza) > 0

  return (
    <td className="border-l-2 border-gray-300 p-1 text-center">
      <button
        type="button"
        onClick={onApri}
        aria-expanded={aperta}
        aria-label={`${assente ? 'Assenza' : `${ore(lav)} ore`} il ${dataEstesa(casella.data)}`}
        className={cn(
          'relative w-full rounded-lg border-2 px-1 py-1.5 transition-colors',
          aperta
            ? 'border-black bg-amber-300'
            : 'border-transparent hover:border-black hover:bg-amber-100',
        )}
      >
        {assente ? (
          <span className="inline-block rounded-md border-2 border-gray-400 bg-white px-1 text-[10px] font-extrabold uppercase text-gray-600">
            {siglaAssenza(casella.tipo_assenza)}
          </span>
        ) : (
          <span
            className={cn(
              'numerico text-sm font-black',
              straordinario ? 'text-rose-700' : 'text-black',
            )}
          >
            {ore(lav)}
          </span>
        )}

        {casella.giustificazione && (
          <span
            aria-hidden="true"
            title="C'è una motivazione"
            className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-600"
          />
        )}
      </button>
    </td>
  )
}

/* ── il dettaglio ────────────────────────────────────────────────── */

/**
 * Cosa c'e' dentro i numeri di una riga.
 *
 * Con `giorno` si guarda una giornata sola — si e' cliccata una cella —
 * e si puo' allargare a tutto il periodo. Senza, si e' premuto il `+` e
 * si vedono tutte le giornate in fila.
 *
 * Tre cose per ogni giornata, nell'ordine in cui servono: quanto, dove,
 * perche'.
 */
function Dettaglio({
  riga,
  giorni,
  giorno,
  onApri,
}: {
  riga: RigaGriglia
  giorni: string[]
  giorno: string | null
  onApri: (chi: string, giorno: string | null) => void
}) {
  /* Quando si guarda tutto il periodo si mostrano solo le giornate che
     hanno qualcosa: le altre sono gia' un trattino nella griglia, e
     ripeterle qui sarebbe una lista di «niente». */
  const daMostrare = giorno
    ? [giorno]
    : [...riga.giorni.keys()].sort()

  if (daMostrare.length === 0) {
    return (
      <div className="text-xs font-bold text-gray-600">
        Nessuna ora in questo periodo. Se ha lavorato, la giornata potrebbe essere ancora in
        attesa del titolare.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Da una giornata sola si torna a tutte: chi ha cliccato una
          cella per capire un numero spesso vuole poi vedere il resto
          della settimana, ed e' un click, non una seconda ricerca. */}
      {giorno && (
        <button
          type="button"
          onClick={() => onApri(riga.dipendente_id, null)}
          className="text-[11px] font-black uppercase tracking-wide text-sky-700 underline decoration-2 underline-offset-2"
        >
          › Vedi tutte le giornate del periodo
        </button>
      )}

      {daMostrare.map((g) => (
        <Giornata key={g} casella={riga.giorni.get(g)} giorno={g} tipo={riga.tipo} />
      ))}

      {/* Le ore fuori dalle colonne mostrate: il sabato lavorato. Lo si
          DICE, invece di lasciarlo dedurre da una sottrazione fra il
          totale della riga e la somma delle celle. */}
      {!giorno && fuoriGriglia(riga, giorni) > 0 && (
        <div className="rounded-lg border-2 border-black bg-sky-100 px-3 py-2 text-xs font-bold">
          {ore(fuoriGriglia(riga, giorni))} ore nel fine settimana, fuori dalle colonne qui
          sopra ma dentro il totale.
        </div>
      )}
    </div>
  )
}

/** Una giornata nel dettaglio: quanto, dove, perche'. */
function Giornata({
  casella,
  giorno,
  tipo,
}: {
  casella: OreGiorno | undefined
  giorno: string
  tipo: string
}) {
  if (!casella) {
    return (
      <div className="rounded-lg border-2 border-black bg-white px-3 py-2">
        <div className="text-[11px] font-black uppercase text-gray-500">
          {dataEstesa(giorno)}
        </div>
        <p className="text-xs font-semibold text-gray-600">
          Nessuna ora registrata. Se era un giorno lavorativo, il rapportino potrebbe essere
          ancora fermo in attesa del titolare.
        </p>
      </div>
    )
  }

  const g = casella.giustificazione

  return (
    <div className="overflow-hidden rounded-lg border-2 border-black bg-white">
      {/* ── quanto ──────────────────────────────────────────────
          Le voci a zero non si scrivono: una riga «0 di trasferta» su
          ogni giornata insegna a saltare tutto il riquadro. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black bg-gray-100 px-3 py-2">
        <span className="text-[11px] font-black uppercase">{dataEstesa(giorno)}</span>
        <span className="numerico text-xs font-bold">
          {ore(casella.ore_ordinarie)} ord
          {Number(casella.ore_straordinarie) > 0 &&
            ` · ${ore(casella.ore_straordinarie)} str`}
          {Number(casella.ore_trasferta) > 0 && ` · ${ore(casella.ore_trasferta)} tras`}
          {Number(casella.ore_assenza) > 0 &&
            ` · ${ore(casella.ore_assenza)} ass${casella.tipo_assenza ? ` (${casella.tipo_assenza})` : ''}`}
        </span>
      </div>

      {/* ── dove ────────────────────────────────────────────────
          Il NOME del cantiere, non il codice. Stessa regola applicata ai
          lavori extra il 2026-09-15: il codice lo conosce chi lo ha
          scritto, il nome lo riconoscono tutti. */}
      {casella.cantieri.length > 0 ? (
        <ul className="divide-y divide-gray-200">
          {casella.cantieri.map((k) => (
            <li key={k.cantiere_id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="numerico w-12 shrink-0 text-xs font-black">{ore(k.ore)} h</span>
              <span className="min-w-0">
                <span className="text-xs font-bold">{k.denominazione}</span>
                <span className="ml-2 text-[10px] font-bold text-gray-500">{k.codice}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-2 text-[11px] font-semibold text-gray-500">
          {tipo === 'operaio'
            ? 'Nessun cantiere su questa giornata.'
            : tipo === 'tecnico'
              ? 'Ore dal foglio personale: il tecnico gira tutti i cantieri e le segna nel suo.'
              : 'Ore dal foglio personale: lavoro in ufficio.'}
        </p>
      )}

      {/* ── perche' ─────────────────────────────────────────────
          «se hanno qualche ora in meno o in piu' e per quale motivo».
          La scrive il tecnico in `giustificazioni_ore`, ed e' il pezzo
          che rende leggibile una giornata da sei ore senza aprire
          nessun rapportino. */}
      {g && (
        <div className="border-t-2 border-black bg-sky-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-md border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase',
                g.tipo === 'mancanza' ? 'bg-rose-200' : 'bg-lime-200',
              )}
            >
              {g.tipo === 'mancanza' ? 'Ore in meno' : 'Ore in più'}
            </span>
            <span className="text-[11px] font-black uppercase tracking-wide">{g.motivo}</span>
            {Number(g.ore) > 0 && (
              <span className="numerico text-[11px] font-bold text-gray-700">
                {ore(g.ore)} h
              </span>
            )}
          </div>
          {/* `whitespace-pre-wrap`: il tecnico scrive a mano, e puo'
              andare a capo. */}
          {g.descrizione && (
            <p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-gray-800">
              {g.descrizione}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Cosa vuol dire quello che si vede. Sta SOTTO la tabella e non sopra:
 *  i colori si capiscono quasi tutti da soli, e chi non capisce guarda
 *  in basso — chi ha capito non ha una riga di istruzioni fra sé e i
 *  dati. */
function Legenda() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-semibold text-gray-600">
      <span>
        <span className="font-black text-rose-700">8</span> comprende straordinario
      </span>
      <span>
        <span className="rounded-md border-2 border-gray-400 bg-white px-1 text-[10px] font-extrabold uppercase text-gray-600">
          FER
        </span>{' '}
        giorno di assenza
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" /> c’è una
        motivazione del tecnico
      </span>
      <span>— nessuna ora registrata</span>
      <span className="text-gray-500">
        Il <strong>+</strong> apre tutto il periodo, un numero apre quel giorno.
      </span>
    </p>
  )
}

/* ── minuzie di scrittura ────────────────────────────────────────── */

/** «lun» — l'intestazione di colonna. Tre lettere: sopra una colonna
 *  stretta «lunedì» andrebbe a capo. */
function giornoCorto(g: string): string {
  const [a, m, d] = g.split('-').map(Number)
  return new Date(a, m - 1, d)
    .toLocaleDateString('it-IT', { weekday: 'short' })
    .replace('.', '')
}

/** Il numero del giorno, sotto il nome: senza, due settimane di fila
 *  sono indistinguibili e non si sa mai quale si sta guardando. */
function numeroGiorno(g: string): number {
  return Number(g.slice(8, 10))
}

/**
 * La sigla di un'assenza, per starci in una cella stretta.
 *
 * Le prime tre lettere di cio' che ha scritto chi compila: il campo e'
 * libero, quindi non esiste un elenco chiuso da tradurre. Per esteso lo
 * dice il dettaglio, che e' il posto giusto per una parola intera.
 */
function siglaAssenza(tipo: string | null): string {
  if (!tipo) return 'ASS'
  return tipo.trim().slice(0, 3).toUpperCase()
}
