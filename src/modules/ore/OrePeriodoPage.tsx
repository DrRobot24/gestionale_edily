import { useState } from 'react'
import { Avviso, Badge, Button, Card, Table, Vuoto, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import { oreContratto, useOrari } from '../anagrafiche/dipendenti'
import { eFineSettimana, nomeNonFeriale } from '../../lib/giorni'
import {
  conPasso,
  contieneOggi,
  etichetta,
  fuoriGriglia,
  funzioneMancante,
  cantieriDelPeriodo,
  giorniDi,
  giorniLavorati,
  giornateMotivate,
  inGriglia,
  iso,
  lavorate,
  nelFuturo,
  ore,
  periodoCorrente,
  sposta,
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
  /* SETTIMANE COMPLETE, da lunedi' a domenica. Chiesto dall'utente il
     2026-09-22: «mettimi pure i sabati e le domeniche cosi' abbiamo le
     settimane complete, ovviamente evidenziando che sono sabati o
     domeniche».

     Prima erano solo i feriali, su sua indicazione del giorno prima:
     «i non feriali non si lavora». Vero come regola, ma incompleto come
     foglio presenze — il sabato lavorato capita, e finiva in un
     «fuori settimana» in coda alla riga: un numero giusto in un posto
     dove nessuno lo cerca. Con sette colonne quel caso ha la sua
     casella, al suo posto nel calendario.

     Il grigio delle due colonne dice «qui normalmente non si lavora»
     senza toglierle: e' la stessa scelta dei calendari, dove sabato e
     domenica sono grigi e non rossi. */
  const giorni = giorniDi(periodo)

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
      <h1 className="text-2xl font-black uppercase tracking-tight">Foglio presenze</h1>
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
  aperta,
  onApri,
}: {
  conOre: RigaGriglia[]
  senzaOre: RigaGriglia[]
  giorni: string[]
  aperta: Aperta | null
  onApri: (chi: string, giorno: string | null) => void
}) {
  const oggi = iso(new Date())

  return (
    /* `table-fixed` E' LA CORREZIONE VERA, non una rifinitura.

       Senza, la tabella e' a layout automatico: il browser IGNORA le
       misure del colgroup e dimensiona ogni colonna sul suo contenuto.
       Le colonne con un numero dentro diventavano larghe, quelle con un
       trattino strette, e la settimana usciva sbilenca — «le colonne in
       cui ci sono i numeri sono molto piu' larghe di quelle senza»
       (utente, 2026-09-22). Con `table-fixed` comanda il colgroup, e
       cinque giorni sono cinque colonne identiche.

       Sta qui e non nella primitiva `Table`: quella impagina nove
       elenchi dove il layout automatico e' giusto — una colonna di
       ragioni sociali deve potersi allargare. Qui invece le colonne
       sono una griglia, e una griglia ha i passi uguali. */
    <Table className="table-fixed">
      {/* LE LARGHEZZE, ridisegnate il 2026-09-22: «allarga le colonne
          perche' lo spazio c'e', cosi' mi sembra molto stretto il
          discorso settimana».

          Prima la colonna della persona era `<col />` senza misura, e
          in una tabella si prende TUTTO lo spazio avanzato: i nomi ne
          usavano un terzo e i giorni restavano spremuti a destra in
          sedici pixel l'uno. Adesso e' la persona ad avere una misura
          fissa — larga abbastanza per «MICHALSKI VELMICHALAK NORBERT,
          LUCASZ» e per la riga di sintesi sotto — e sono i GIORNI a
          spartirsi il resto, che e' giusto perche' sono loro il
          contenuto della pagina. */}
      <colgroup>
        <col className="w-12" />
        {/* Sul mese la colonna del nome si stringe: e' bloccata a
            sinistra (vedi `FERMA`), e 26rem fermi su trenta colonne che
            scorrono si mangerebbero un terzo dello schermo. I nomi
            lunghi vanno a capo. */}
        <col className={giorni.length > 7 ? 'w-72' : 'w-[26rem]'} />
        {giorni.map((g) => (
          <col key={g} className={larghezzaGiorno(giorni.length)} />
        ))}
        <col className="w-28" />
      </colgroup>

      <thead>
        <tr>
          <th className={cn(FERMA.segno, 'bg-gray-100')} />
          <th className={cn(FERMA.nome, 'bg-gray-100')}>Persona</th>
          {giorni.map((g) => (
            <th
              key={g}
              className={cn(
                /* `!` obbligatorio: la primitiva `Table` impone
                   `[&_th]:text-left`, un selettore discendente che per
                   specificita' batte una classe sulla cella. Senza, il
                   nome del giorno resta a sinistra mentre le cifre
                   sotto sono centrate — e si legge come un errore di
                   impaginazione. Stessa trappola di `align-middle`. */
                'border-l-2 border-gray-300 !text-center',
                /* Sabato e domenica in grigio: si riconoscono a colpo
                   d'occhio invece di far contare le colonne, e il
                   grigio dice «qui normalmente non si lavora» senza
                   dire «errore», che sarebbe il rosso. Stessa scelta
                   dei calendari in home. */
                eFineSettimana(g) && 'bg-gray-200 text-gray-500',
                // Oggi si accende: su un periodo in corso dice a che
                // punto si e', e quali colonne sono ancora da riempire.
                // Vince sul grigio: un sabato che e' oggi resta oggi.
                g === oggi && 'bg-amber-200 text-black',
              )}
            >
              <div>{giornoCorto(g)}</div>
              <div className="text-[13px] font-black">{numeroGiorno(g)}</div>
            </th>
          ))}
          <th className="border-l-2 border-black !text-center">Totale</th>
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

        {/* NIENTE RIGA DEI TOTALI PER GIORNO, dal 2026-09-23: c'era una
            riga «Totale settimana» con le ore e le presenze di ogni
            giorno, e l'utente l'ha tolta — «non e' il luogo adatto dove
            vedere questa cosa». Il foglio presenze si legge per persona;
            il totale che conta e' quello in fondo a ogni riga. */}
        {/* ── chi non ha ore ─────────────────────────────────────
            Sotto una riga di stacco, non mescolati: la tabella resta
            leggibile anche con venti operai di cui meta' fermi. Ma ci
            SONO, perche' una riga vuota e' una domanda e una riga
            assente non la nota nessuno. */}
        {senzaOre.length > 0 && (
          <>
            <tr className="border-t-2 border-black bg-gray-50">
              <td className={cn(FERMA.segno, 'bg-gray-50')} />
              <td
                colSpan={giorni.length + 2}
                className="text-[10px] font-black uppercase tracking-wider text-gray-500"
              >
                {/* La cella e' larga quanto tutta la riga: e' la scritta
                    dentro a restare ferma, non la cella. */}
                <span className="sticky left-15 bg-gray-50">
                  Nessuna ora in questo periodo — {senzaOre.length}{' '}
                  {senzaOre.length === 1 ? 'persona' : 'persone'}
                </span>
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
  const motivate = giornateMotivate(riga)
  const lavorati = giorniLavorati(riga)
  const totale = riga.ordinarie + riga.straordinarie

  /* La media giornaliera, che e' il numero che fa alzare un
     sopracciglio: otto e mezzo di media su cinque giorni e' una
     settimana normale, sei e' una settimana con qualcosa dentro. Si
     dice qui, dove si legge senza aprire niente, perche' e' proprio il
     tipo di cosa che nessuno va a cercare aprendo venti righe. */
  const media = lavorati > 0 ? totale / lavorati : 0

  /* Il verde e' la giornata piena DI QUESTA PERSONA (2026-09-25): 8, o
     meno per un part-time. La cache e' una sola per tutta la griglia. */
  const { data: orari } = useOrari()

  /* Le celle ferme hanno un fondo PIENO: trasparenti, i numeri che ci
     scorrono sotto si leggerebbero attraverso il nome. Ripetono a mano
     l'accensione della riga, che su di loro non arriva. */
  const fondoFermo = aperta ? 'bg-amber-50' : 'bg-white group-hover:bg-amber-50'

  return (
    <>
      {/* La riga si accende tutta al passaggio del mouse. Su una
          griglia larga l'occhio perde la riga fra il nome a sinistra e
          il totale a destra: una fascia continua tiene insieme i due
          capi, ed e' il modo piu' economico di dire «stai leggendo
          questa persona». `group` serve alle celle, che schiariscono un
          filo meno per restare distinguibili dal loro hover. */}
      <tr
        className={cn(
          'group transition-colors',
          aperta ? 'bg-amber-50' : 'hover:bg-amber-50/60',
          spenta && 'text-gray-500',
        )}
      >
        <td className={cn(FERMA.segno, fondoFermo)}>
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

        <td className={cn(FERMA.nome, fondoFermo)}>
          <button
            type="button"
            onClick={() => onApri(riga.dipendente_id, null)}
            className="block text-left hover:underline"
          >
            {/* `break-words`: l'anagrafica ha gia' un nome da trentasette
                caratteri, e il prossimo potrebbe essere piu' lungo. Va a
                capo invece di allargare la colonna e spremere i giorni,
                che e' esattamente il difetto da cui veniamo. */}
            <span className="break-words font-bold uppercase">{riga.nominativo}</span>
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
            {/* LA SINTESI DELLA RIGA, che la fa raccontare qualcosa
                prima ancora di aprirla. Si dichiara PRIMA: un «+» non
                promette niente, e una motivazione che nessuno ha motivo
                di cercare e' una motivazione che nessuno legge. */}
            {lavorati > 0 && (
              <span className="block text-[11px] font-semibold text-gray-500">
                {lavorati} {lavorati === 1 ? 'giorno' : 'giorni'} · {ore(media)} h al giorno
                {motivate.length > 0 && (
                  <span className="text-sky-700">
                    {' · '}
                    {motivate.length}{' '}
                    {motivate.length === 1 ? 'motivata' : 'motivate'}
                  </span>
                )}
              </span>
            )}
          </button>
        </td>

        {giorni.map((g) => (
          <Cella
            key={g}
            giorno={g}
            piena={oreContratto(orari, riga.dipendente_id, g)}
            casella={riga.giorni.get(g)}
            aperta={aperta?.giorno === g}
            onApri={() => onApri(riga.dipendente_id, g)}
          />
        ))}

        {/* CENTRATO come le colonne dei giorni, non allineato a destra.
            Su una griglia il totale e' l'ultima casella della riga, non
            una colonna di importi in un elenco: allinearlo a destra lo
            staccava dal passo delle altre celle e le cifre cadevano
            fuori asse. Segnalato dall'utente il 2026-09-22. */}
        <td className="border-l-2 border-black p-1 text-center">
          {/* `py-1.5` come il bottone dentro le celle-giorno: senza, i
              due padding verticali sono diversi e la cifra del totale
              cade su una linea sua invece che su quella delle ore. */}
          <span className="numerico block py-1.5 text-sm font-black">
            {ore(riga.ordinarie + riga.straordinarie)}
          </span>
          {riga.straordinarie > 0 && (
            <div className="numerico text-[10px] font-bold text-rose-700">
              di cui {ore(riga.straordinarie)} str.
            </div>
          )}
          {/* Ore che stanno nel totale ma non in nessuna colonna
              mostrata. Da quando le settimane sono complete (2026-09-22)
              non dovrebbe piu' capitare: era il sabato lavorato, che ora
              ha la sua casella.

              IL CONTROLLO RESTA lo stesso, e non e' codice morto: e' la
              rete che tiene onesta la riga se un giorno le colonne
              tornassero a essere meno dei giorni del periodo. Un totale
              che non torna con le sue celle si legge come un errore di
              somma, ed e' il genere di sospetto che fa perdere fiducia a
              tutta la pagina. Se compare, c'e' qualcosa da capire. */}
          {fuori > 0 && (
            <div className="numerico text-[10px] font-bold text-gray-500">
              {ore(fuori)} fuori dalle colonne
            </div>
          )}
        </td>
      </tr>

      {aperta && (
        <tr className="bg-amber-50">
          <td className={cn(FERMA.segno, 'bg-amber-50')} />
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
  giorno,
  piena,
  casella,
  aperta,
  onApri,
}: {
  /** Serve solo a riconoscere sabato e domenica: una cella vuota non
   *  sa che giorno e', perche' `casella` li' non c'e'. */
  giorno: string
  /** Le ore di una giornata piena per questa persona quel giorno. */
  piena: number
  casella: OreGiorno | undefined
  aperta: boolean
  onApri: () => void
}) {
  /* Il fondo grigio del fine settimana. Sta sulla CELLA e non solo
     sull'intestazione: una colonna riconoscibile in testa e bianca per
     venti righe non si distingue piu' gia' dalla terza riga, che e'
     dove si guarda davvero. */
  const nonFeriale = eFineSettimana(giorno)

  if (!casella) {
    return (
      /* `p-1` come la cella piena, non il padding di serie della
         tabella: con due padding diversi i trattini e le cifre cadono
         su due verticali diverse, e una colonna di numeri che non si
         incolonnano non si confronta a occhio. E' il difetto che
         l'utente ha visto il 2026-09-22 — «ci sono pure i numeri
         disallineati». */
      <td
        className={cn(
          'border-l-2 border-gray-300 p-1 text-center text-gray-300',
          nonFeriale && 'bg-gray-100',
        )}
      >
        {/* Il trattino e non la cella vuota: una cella davvero vuota si
            confonde con un difetto di impaginazione, il trattino dice
            «qui ho guardato, e non c'era niente». Non e' cliccabile
            perche' non ha niente da raccontare, ma occupa la stessa
            altezza della cella piena: senza, le righe ballano. */}
        <span aria-hidden="true" className="inline-block py-1.5">
          —
        </span>
        <span className="sr-only">
          {nonFeriale ? `Nessuna ora — ${nomeNonFeriale(giorno)}` : 'Nessuna ora'}
        </span>
      </td>
    )
  }

  const lav = lavorate(casella)
  const straordinario = Number(casella.ore_straordinarie) > 0
  const assente = lav === 0 && Number(casella.ore_assenza) > 0

  /* SU QUANTI CANTIERI, dal 2026-09-22: «esiste un modo per segnalare,
     nel numerino, se quelle ore sono state fatte in piu' cantieri o in
     uno solo?» (utente).

     Serve, e serve al titolare piu' che a chi fa le paghe: per la busta
     paga otto ore sono otto ore, ma una persona che in un giorno
     rimbalza fra tre cantieri o sta chiudendo qualcosa di corsa o e'
     stata chiamata d'urgenza — ed e' proprio il dato che i costi per
     cantiere poi devono spiegare.

     Prima l'unico modo di saperlo era aprire l'espansione della
     persona, che pero' somma TUTTO IL PERIODO: «8 h Monterosa» per una
     settimana non dice in quale giorno e' stato dove.

     UN PALLINO PER CANTIERE, E SOLO DA DUE IN SU. La cella con un
     cantiere solo — la stragrande maggioranza — resta identica: nessun
     segno. Si accende l'anomalia e nient'altro, come il semaforo dei
     cantieri o la fascia «MANCA» sulla tariffa.

     NON UN COLORE: il fondo della cella e' del semaforo delle ore (dal
     2026-09-24), e un secondo significato sullo stesso fondo non si
     leggerebbe piu'. E non il numero
     spezzato «6+2», che raddoppia la larghezza delle colonne e rompe
     l'incolonnamento appena sistemato.

     I cantieri con zero ore non si contano: una riga a zero c'e'
     quando la giornata e' stata aperta e poi svuotata, e non e' un
     posto dove la persona e' stata. */
  const quantiCantieri = casella.cantieri.filter((k) => Number(k.ore) > 0).length
  const sparso = quantiCantieri > 1
  const luce = semaforo(lav, nonFeriale, piena)

  return (
    /* UNA CELLA PIENA DI SABATO NON RESTA GRIGIA: se qualcuno ha
       lavorato, quella e' una giornata vera e il grigio del «non si
       lavora» direbbe il contrario. Il fondo torna bianco e il numero
       si legge come gli altri — anzi, spicca proprio perche' intorno e'
       grigio, che e' l'effetto giusto: un sabato lavorato E' una cosa
       da notare. */
    <td className={cn('border-l-2 border-gray-300 p-1 text-center', SEMAFORO[luce].cella)}>
      <button
        type="button"
        onClick={onApri}
        aria-expanded={aperta}
        aria-label={`${assente ? 'Assenza' : `${ore(lav)} ore`} il ${dataEstesa(casella.data)}${
          sparso ? ` su ${quantiCantieri} cantieri` : ''
        } — ${SEMAFORO[luce].detto}`}
        /* Il dettaglio passando sopra, senza aprire niente: i pallini
           dicono QUANTI, il `title` dice QUALI e con quante ore. Chi
           vuole solo togliersi il dubbio non deve piu' espandere. */
        title={
          sparso
            ? casella.cantieri
                .filter((k) => Number(k.ore) > 0)
                .map((k) => `${k.denominazione ?? k.codice ?? 'Cantiere'} ${ore(Number(k.ore))} h`)
                .join(' · ')
            : undefined
        }
        /* Largo il giusto, non quanto la colonna: un bersaglio da
           duecento pixel per una cifra di due caratteri accende un
           riquadro lontanissimo dal numero che si sta guardando.
           `mx-auto` lo tiene al centro, incollato alla cifra.

           NIENTE `min-w` QUI: la larghezza della colonna la decide il
           `colgroup`, non il contenuto. Con `min-w` sul bottone erano
           le colonne CON i numeri a diventare larghe e quelle coi
           trattini a restare strette — la tabella e' a layout
           automatico e dimensiona su cio' che trova dentro. */
        className={cn(
          'relative mx-auto block w-14 rounded-lg border-2 py-1.5 transition-colors',
          /* Aperta = bordo nero e basta: il fondo e' gia' del
             semaforo, e un giallo «aperta» sopra un giallo «da
             guardare» li renderebbe indistinguibili. */
          aperta ? 'border-black bg-white/60' : 'border-transparent hover:border-black',
        )}
      >
        {assente ? (
          /* ZERO, E IL MOTIVO SOTTO, dal 2026-09-23: «voglio vedere il
             numero 0 nel foglio presenze all'incrocio tra la riga e la
             colonna di quella persona in quel giorno». Prima la cella
             mostrava solo la sigla, e la colonna delle cifre si
             interrompeva proprio dove serviva leggerla.

             Lo zero e' rosso scuro e non nero: e' una giornata non
             lavorata, non un numero da sommare con gli altri a colpo
             d'occhio.

             NIENTE SIGLA SOTTO, dal 2026-09-25: la cella mostrava le
             prime tre lettere del motivo (FER, PER, MAL, ALT). L'utente
             l'ha tolta — «non mi serve come info visiva, mi va bene il
             colore». Il motivo per esteso resta nel `title`, per chi
             passa sopra la cella, e nel dettaglio che si apre. */
          <span
            title={
              casella.nota_assenza
                ? `${casella.tipo_assenza}: ${casella.nota_assenza}`
                : (casella.tipo_assenza ?? undefined)
            }
            className="numerico text-sm font-black text-rose-800"
          >
            0
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

        {/* SOTTO la cifra e non sopra: l'angolo in alto a destra ce
            l'ha gia' il pallino azzurro della motivazione, e due segni
            nello stesso angolo si leggono come uno solo. Qui i pallini
            stanno in fila sotto il numero, neri come il testo —
            appartengono alla cifra, non sono un'altra informazione.

            `-mb-1` li riprende: senza, la cella coi pallini sarebbe
            piu' alta delle altre e la riga ballerebbe. */}
        {sparso && !assente && (
          <span
            aria-hidden="true"
            className="-mb-1 mt-0.5 flex items-center justify-center gap-0.5"
          >
            {Array.from({ length: quantiCantieri }, (_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-black" />
            ))}
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

/* ── il semaforo ─────────────────────────────────────────────────── */

type Luce = 'verde' | 'giallo' | 'rosso'

/**
 * Il colore di una giornata VALIDATA, dal 2026-09-24. Proposto
 * dall'utente: «rosso se sono 0 ore, giallo se sono meno di 8 o piu'
 * di 8 perche' si deve fornire un motivo, verde se sono 8».
 *
 *   verde    8 ore esatte: niente da chiedere.
 *   giallo   diverso da 8, ma lavorato: serve un motivo. Il pallino
 *            azzurro dice se il tecnico l'ha gia' scritto — giallo con
 *            pallino e' spiegato, giallo senza pallino va chiesto.
 *   rosso    zero ore lavorate. Il motivo si legge passando sopra la
 *            cella o aprendola; resta rosso lo stesso perche' e' una
 *            giornata senza lavoro, ed e' la prima cosa che chi fa le
 *            paghe deve vedere.
 *
 * SABATO E DOMENICA NON SI PRETENDONO: l'attesa li' e' zero, non otto.
 * Un fine settimana lavorato e' giallo qualunque sia il numero — e' ore
 * in piu' rispetto al dovuto, con un motivo da dare — e uno a zero non
 * arriva nemmeno qui, perche' nessuno manda la scheda di un sabato di
 * riposo.
 *
 * IL TRATTINO NON HA COLORE. Vuol dire «nessuna giornata validata», non
 * «zero ore»: puo' essere una scheda ferma dal titolare, e colorarla di
 * rosso accuserebbe di un'assenza chi magari ha lavorato. Meglio non
 * dire che dire sbagliato.
 */
function semaforo(lavorate: number, nonFeriale: boolean, piena: number): Luce {
  if (nonFeriale) return lavorate > 0 ? 'giallo' : 'rosso'
  if (lavorate === 0) return 'rosso'
  if (lavorate === piena) return 'verde'
  return 'giallo'
}

/* Fondi tenui: il colore deve dire lo stato senza coprire la cifra.
   Il verde e' il piu' leggero dei tre, perche' e' il caso normale e
   ricopre quasi tutta la griglia; il rosso il piu' carico, perche' e'
   quello da trovare per primo. */
const SEMAFORO: Record<Luce, { cella: string; detto: string }> = {
  verde: { cella: 'bg-lime-100', detto: 'giornata piena' },
  giallo: { cella: 'bg-amber-200', detto: 'diverso dalla giornata piena, serve un motivo' },
  rosso: { cella: 'bg-rose-200', detto: 'nessuna ora lavorata' },
}

/* ── il dettaglio ────────────────────────────────────────────────── */

/**
 * Cosa c'e' dentro i numeri di una riga.
 *
 * DUE GESTI, DUE RISPOSTE DIVERSE — ed e' il punto di questo
 * componente. Prima il `+` mostrava le stesse schede del click sul
 * numero, solo cinque di fila: due strade che portavano allo stesso
 * posto, cioe' una strada di troppo. Segnalato dall'utente il
 * 2026-09-22: «non vorrei che ci fosse ridondanza».
 *
 *   click su un numero   quella giornata: quanto, dove, perche'.
 *                        E' la domanda «questo giorno com'e' andato».
 *   il `+` sul nome      il PERIODO INTERO, che una giornata sola non
 *                        sa dire: i totali per categoria, i cantieri
 *                        della settimana con le ore su ciascuno, e le
 *                        giornate che hanno qualcosa da spiegare. E'
 *                        la domanda «dov'e' stato, e cosa non torna».
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
  /* Una giornata sola: si e' cliccata una cella. */
  if (giorno) {
    return (
      <div className="space-y-2">
        <Giornata casella={riga.giorni.get(giorno)} giorno={giorno} tipo={riga.tipo} />
        {/* Da una giornata si sale al periodo: chi ha cliccato una cella
            per capire un numero spesso vuole poi vedere il resto, ed e'
            un click e non una seconda ricerca. */}
        <button
          type="button"
          onClick={() => onApri(riga.dipendente_id, null)}
          className="text-[11px] font-black uppercase tracking-wide text-sky-700 underline decoration-2 underline-offset-2"
        >
          › Vedi il riepilogo di tutto il periodo
        </button>
      </div>
    )
  }

  /* Il periodo intero: si e' premuto il `+`. */
  return <Riepilogo riga={riga} giorni={giorni} onApri={onApri} />
}

/**
 * Il riepilogo del periodo: cio' che le singole giornate non dicono.
 *
 * Tre blocchi, nell'ordine in cui servono a chi fa le paghe: quanto in
 * tutto, dove in tutto, e cosa e' da guardare. L'ultimo e' il piu'
 * importante e sta in fondo perche' e' quello su cui ci si ferma —
 * gli altri due si leggono di sfuggita e si va avanti.
 */
function Riepilogo({
  riga,
  giorni,
  onApri,
}: {
  riga: RigaGriglia
  giorni: string[]
  onApri: (chi: string, giorno: string | null) => void
}) {
  const cantieri = cantieriDelPeriodo(riga)
  const motivate = giornateMotivate(riga)
  const lavorati = giorniLavorati(riga)
  const fuori = fuoriGriglia(riga, giorni)
  const totale = riga.ordinarie + riga.straordinarie

  if (totale === 0 && riga.assenza === 0) {
    return (
      <div className="text-xs font-bold text-gray-600">
        Nessuna ora in questo periodo. Se ha lavorato, la giornata potrebbe essere ancora in
        attesa del titolare.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── quanto, in tutto il periodo ─────────────────────────
          I totali per categoria: sono le colonne che questa pagina
          aveva prima del 2026-09-22, e qui hanno ritrovato il loro
          posto — accanto ai cantieri che le spiegano, invece che al
          posto dei giorni. Le voci a zero non si scrivono: una riga
          «0 di trasferta» su ogni persona insegna a saltare il
          riquadro. */}
      <div className="flex flex-wrap gap-2">
        <Numero etichetta="Ore nel periodo" valore={ore(totale)} forte />
        <Numero etichetta="Giorni lavorati" valore={String(lavorati)} />
        {lavorati > 0 && (
          <Numero etichetta="Media al giorno" valore={`${ore(totale / lavorati)} h`} />
        )}
        {riga.straordinarie > 0 && (
          <Numero etichetta="Straordinario" valore={ore(riga.straordinarie)} tono="rosa" />
        )}
        {riga.assenza > 0 && <Numero etichetta="Assenza" valore={ore(riga.assenza)} />}
        {fuori > 0 && (
          <Numero
            etichetta="Nel fine settimana"
            valore={ore(fuori)}
            tono="celeste"
          />
        )}
      </div>

      {/* ── dove, in tutto il periodo ───────────────────────────
          Il pezzo che il giorno singolo non puo' dare: «nove ore sul
          Villa Rossi in due giornate» e' una frase che si compone solo
          guardando la settimana intera. Ordinati dal piu' frequentato,
          perche' la prima riga deve rispondere a «dov'e' stato». */}
      <div>
        <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500">
          Dove ha lavorato, in tutto il periodo
        </h3>

        {cantieri.length === 0 ? (
          <p className="text-xs font-semibold text-gray-600">
            {riga.tipo === 'operaio'
              ? 'Nessun cantiere in questo periodo.'
              : riga.tipo === 'tecnico'
                ? 'Ore dal foglio personale: il tecnico gira tutti i cantieri e le segna nel suo.'
                : 'Ore dal foglio personale: lavoro in ufficio.'}
          </p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {cantieri.map((k) => (
              <li
                key={k.cantiere_id}
                className="flex items-baseline gap-3 rounded-lg border-2 border-black bg-white px-3 py-2"
              >
                <span className="numerico w-14 shrink-0 text-sm font-black">
                  {ore(k.ore)} h
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-bold">{k.denominazione}</span>
                  <span className="ml-2 text-[10px] font-bold text-gray-500">{k.codice}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold text-gray-500">
                  {k.giorni} {k.giorni === 1 ? 'giorno' : 'giorni'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── cosa e' da guardare ─────────────────────────────────
          Le giornate che non tornano, tutte insieme. E' il blocco per
          cui il `+` vale la pena di essere premuto: senza, per sapere
          quali giornate hanno una motivazione bisognerebbe aprire le
          celle una per una cercando il puntino.

          Ogni riga riporta alla sua giornata: da qui si va al
          dettaglio, non si ripete il dettaglio. */}
      {motivate.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500">
            Da guardare — {motivate.length}{' '}
            {motivate.length === 1 ? 'giornata motivata' : 'giornate motivate'}
          </h3>

          <ul className="grid gap-1.5">
            {motivate.map((c) => {
              const g = c.giustificazione!
              return (
                <li key={c.data}>
                  <button
                    type="button"
                    onClick={() => onApri(riga.dipendente_id, c.data)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg border-2 border-black bg-sky-50 px-3 py-2 text-left hover:bg-sky-100"
                  >
                    <span className="text-[11px] font-black uppercase">
                      {c.data && giornoEtichetta(c.data)}
                    </span>
                    <span
                      className={cn(
                        'rounded-md border-2 border-black px-1.5 py-0.5 text-[10px] font-extrabold uppercase',
                        g.tipo === 'mancanza' ? 'bg-rose-200' : 'bg-lime-200',
                      )}
                    >
                      {g.tipo === 'mancanza' ? 'in meno' : 'in più'}
                    </span>
                    <span className="text-[11px] font-black uppercase">{g.motivo}</span>
                    {Number(g.ore) > 0 && (
                      <span className="numerico text-[11px] font-bold text-gray-600">
                        {ore(g.ore)} h
                      </span>
                    )}
                    {g.descrizione && (
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">
                        {g.descrizione}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Un numero con la sua etichetta, nel riepilogo. */
function Numero({
  etichetta: nome,
  valore,
  forte = false,
  tono,
}: {
  etichetta: string
  valore: string
  forte?: boolean
  tono?: 'rosa' | 'celeste'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 border-black px-3 py-1.5',
        tono === 'rosa' ? 'bg-rose-100' : tono === 'celeste' ? 'bg-sky-100' : 'bg-white',
      )}
    >
      <div className="text-[9px] font-black uppercase tracking-wider text-gray-500">
        {nome}
      </div>
      <div className={cn('numerico font-black', forte ? 'text-lg' : 'text-sm')}>{valore}</div>
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

      {/* La spiegazione di un'assenza «Altro», scritta dal tecnico.
          Sta in evidenza e non fra parentesi in testata: e' una frase,
          non una sigla, ed e' il motivo per cui la voce «Altro» esiste
          — «ALT» da solo non direbbe niente a chi fa le paghe. */}
      {casella.nota_assenza && (
        <p className="border-b-2 border-black bg-white px-3 py-2 text-xs font-semibold text-black">
          <span className="font-black uppercase text-gray-500">Motivo: </span>
          {casella.nota_assenza}
        </p>
      )}

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
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded border-2 border-gray-400 bg-lime-100" /> giornata
        piena (8 ore, o l&rsquo;orario del part-time)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded border-2 border-gray-400 bg-amber-200" /> più o
        meno, serve un motivo
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded border-2 border-gray-400 bg-rose-200" /> 0 ore
        lavorate
      </span>
      <span>
        <span className="font-black text-rose-700">8</span> comprende straordinario
      </span>
      <span>
        <span className="numerico font-black text-rose-800">0</span> assente tutto il giorno
        (il motivo passandoci sopra)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" /> c’è una
        motivazione del tecnico
      </span>
      {/* I pallini hanno bisogno della riga di legenda piu' di tutto il
          resto: il rosso dello straordinario e lo zero dell'assenza si
          intuiscono, due puntini neri no. */}
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center gap-0.5">
          <span className="inline-block h-1 w-1 rounded-full bg-black" />
          <span className="inline-block h-1 w-1 rounded-full bg-black" />
        </span>{' '}
        ore fatte su più cantieri (un pallino per cantiere)
      </span>
      <span>— nessuna ora registrata</span>
      {/* La colonna grigia si spiega, perche' e' l'unica cosa nella
          griglia che parla col solo colore di fondo. */}
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded border-2 border-gray-400 bg-gray-100" />{' '}
        sabato e domenica
      </span>
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

/**
 * LE PRIME DUE COLONNE STANNO FERME, dal 2026-09-25: sul mese la
 * tabella scorre in orizzontale, e scorrendo sparivano i nomi — un 8
 * il 23 senza sapere di chi e' non dice niente. Chiesto dall'utente.
 *
 * Il `+` e' largo 3rem (`w-12`), quindi il nome si ferma a 3rem dal
 * bordo. La riga nera a destra del nome segna dove finisce la parte
 * ferma: senza, le colonne che scorrono sotto sembrano tagliate a caso.
 * E' un'ombra interna e non un `border-r`: la tabella ha i bordi
 * collassati, e un bordo collassato su una cella ferma resta indietro
 * mentre la cella scorre. `z-10` le tiene sopra le celle-giorno, che
 * hanno pallini posizionati.
 */
const FERMA = {
  segno: 'sticky left-0 z-10',
  nome: 'sticky left-12 z-10 shadow-[inset_-2px_0_0_#000]',
}

/**
 * Quanto e' larga una colonna-giorno.
 *
 * Si dichiara invece di lasciarla dedurre al browser. Senza una misura
 * la tabella e' a layout automatico e dimensiona ogni colonna sul suo
 * contenuto: quelle con un numero dentro diventavano larghe, quelle con
 * un trattino strette, e la settimana usciva sbilenca. Segnalato
 * dall'utente il 2026-09-22 — «le colonne in cui ci sono i numeri sono
 * molto piu' larghe di quelle senza».
 *
 * Cinque giorni si prendono tutto lo spazio che avanza, ventidue (un
 * mese) devono starci: la misura cambia col numero di colonne, e sotto
 * una certa soglia la tabella scorre invece di schiacciarsi.
 */
function larghezzaGiorno(quanti: number): string {
  // Sette e' la settimana intera, da quando ci sono anche sabato e
  // domenica: le colonne si stringono un po' rispetto alle cinque di
  // prima, ma restano piu' larghe di quelle di un mese.
  if (quanti <= 7) return 'w-[7.5rem]'
  if (quanti <= 12) return 'w-24'
  return 'w-20'
}

/** «gio 17» — la giornata nominata per esteso quanto basta, nelle
 *  righe del riepilogo. La data completa sta nella scheda che si apre:
 *  qui serve solo a riconoscere quale colonna della griglia e'. */
function giornoEtichetta(g: string): string {
  return `${giornoCorto(g)} ${numeroGiorno(g)}`
}

/** Il numero del giorno, sotto il nome: senza, due settimane di fila
 *  sono indistinguibili e non si sa mai quale si sta guardando. */
function numeroGiorno(g: string): number {
  return Number(g.slice(8, 10))
}
