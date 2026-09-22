import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Button, Card, Vuoto, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import {
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
   LA GRIGLIA DELLE ORE — il foglio che in ufficio sta sul tavolo.

   Chiesta dall'utente il 2026-09-22, e le parole contano tutte:

     «Le righe devono essere i nomi degli operai, le colonne i giorni
      della settimana (ovviamente da lun a ven perche' i non feriali non
      si lavora). Al loro incrocio voglio vedere il numero appunto delle
      ore lavorate con la possibilita' di cliccare e di vedere dove
      hanno lavorato cioe' in quale cantiere e se hanno qualche ora in
      meno o in piu' e per quale motivo.»

   PERCHE' NON BASTAVA «ORE PER PERSONA».

   Quella pagina risponde «quanto ha fatto Mario questa settimana»: un
   numero per persona, che e' cio' su cui si mette la tariffa. Giusta
   cosi' per il gesto che serve li' — prendere un totale e
   moltiplicarlo.

   Questa risponde a una domanda diversa, e si legge in DUE direzioni:

     per riga      quanto ha fatto una persona, giorno per giorno. Dove
                   mancano le ore, e quale giorno manca.
     per colonna   chi c'era quel giorno. Un venerdi' a mezzo organico
                   si vede solo guardando in verticale, e da un elenco
                   di totali settimanali non si vedrebbe mai.

   E' la differenza fra un totale e un foglio presenze. Il totale dice
   quanto pagare, il foglio dice se quel totale ha senso — ed e' il
   controllo che si fa PRIMA di mettere le tariffe, non dopo.

   LA CELLA SI APRE, e questo e' il punto che la rende utile davvero.
   Un numero da solo dice «sei ore» e lascia la domanda peggiore senza
   risposta: sei ore invece di otto, perche'? Cliccandolo si vede dove
   e' stato — con le ore su ciascun cantiere — e cosa ha scritto il
   tecnico per giustificare cio' che manca o cio' che avanza. Senza,
   Stefania dovrebbe aprire i rapportini uno per uno, che e' esattamente
   il lavoro da cui questa pagina la toglie.

   DA LUNEDI' A VENERDI'. Cinque colonne, non sette: il fine settimana
   non si lavora, e due colonne vuote su sette sono un terzo della
   larghezza buttato. Il sabato lavorato — che capita — non sparisce:
   le sue ore restano nel totale della riga, e la riga lo dice.

   CHI LA VEDE: `paghe.read`. Owner, admin e amministrazione. Chi
   compila NON entra: qui dentro ci sono le ore di tutti i colleghi.

   SOLO LE ORE VALIDATE, come «Ore per persona», e non e' una comodita':
   se qui entrassero anche le bozze, la somma delle celle non farebbe il
   totale dell'altra pagina e nessuno saprebbe quale delle due credere.
   Cio' che manca all'appello lo dice l'avviso in cima.
   ══════════════════════════════════════════════════════════════════ */

/** Cosa si sta guardando nel pannello di dettaglio. */
type Aperta = { riga: RigaGriglia; giorno: string }

export function GrigliaOrePage() {
  /* Si apre sulla SETTIMANA e non sul mese, al contrario dell'altra
     pagina che le offre tutte e due. Un mese sono ventidue colonne
     feriali: su uno schermo da ufficio si legge solo scorrendo, e una
     griglia che va scrollata di lato smette di essere un colpo
     d'occhio — che e' l'unica cosa per cui esiste. Il mese resta il
     ritmo della firma, e quello si guarda in «Ore per persona». */
  const [periodo, setPeriodo] = useState(() => periodoCorrente('settimana'))
  const [aperta, setAperta] = useState<Aperta | null>(null)

  const griglia = useOreGriglia(periodo)
  const sospeso = useGiornateInSospeso(periodo)

  const righe = inGriglia(griglia.data ?? [])
  const giorni = giorniDi(periodo, true)
  const prossimo = sposta(periodo, 1)

  /* Sfogliando la settimana il pannello si chiude: resterebbe aperto su
     una persona e un giorno che non sono piu' quelli sullo schermo. */
  function vaiA(p: typeof periodo) {
    setPeriodo(p)
    setAperta(null)
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

      {/* ── La barra della settimana ──────────────────────────────
          Le frecce ai lati della data, come in home e in «Ore per
          persona»: sfogliare il tempo e' lo stesso gesto ovunque, e
          cambiargli forma da una pagina all'altra costringe a
          ricercarlo. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-sky-100">
        <div className="flex items-center gap-3">
          <Button
            variante="secondario"
            onClick={() => vaiA(sposta(periodo, -1))}
            aria-label="Settimana precedente"
          >
            ‹
          </Button>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Settimana
            </div>
            <div className="text-xl font-black leading-tight">{etichetta(periodo)}</div>
          </div>
          <Button
            variante="secondario"
            onClick={() => vaiA(prossimo)}
            disabled={nelFuturo(prossimo)}
            aria-label="Settimana successiva"
          >
            ›
          </Button>
        </div>

        {!contieneOggi(periodo) && (
          <Button variante="secondario" onClick={() => vaiA(periodoCorrente('settimana'))}>
            Questa settimana
          </Button>
        )}
      </Card>

      {/* Cio' che non e' ancora arrivato. Sta in cima e non in fondo: un
          totale parziale che SEMBRA completo finisce in busta paga. */}
      <InSospeso righe={sospeso.data ?? []} />

      {griglia.isLoading ? (
        <Card className="p-5 text-sm font-bold text-gray-600">Sto leggendo le ore…</Card>
      ) : errore ? (
        <Avviso tono="errore">{errore.message}</Avviso>
      ) : righe.length === 0 ? (
        <Vuoto>
          Nessuna ora validata in questa settimana. Se il tecnico ha compilato, le giornate
          sono ancora in attesa del titolare.
        </Vuoto>
      ) : (
        <>
          <Griglia
            righe={righe}
            giorni={giorni}
            aperta={aperta}
            onApri={(riga, giorno) =>
              /* Ricliccare la stessa cella chiude: il pannello e' il
                 seguito di quel numero, e il modo piu' naturale di
                 chiuderlo e' togliere il dito da dove l'ha aperto. */
              setAperta((prima) =>
                prima && prima.riga.dipendente_id === riga.dipendente_id && prima.giorno === giorno
                  ? null
                  : { riga, giorno },
              )
            }
          />

          {aperta && <Dettaglio aperta={aperta} onChiudi={() => setAperta(null)} />}

          <Legenda />
        </>
      )}
    </div>
  )
}

function Testata() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-black">Ore della settimana</h1>
      <p className="text-sm font-semibold text-gray-600">
        Chi ha lavorato e quando, da lunedì a venerdì. Clicca un numero per vedere su quali
        cantieri è stato e perché la giornata non torna. Solo le giornate già validate dal
        titolare.
      </p>
    </div>
  )
}

/* ── la griglia ──────────────────────────────────────────────────── */

/**
 * La tabella vera e propria.
 *
 * NON usa la primitiva `Table`: quella impagina elenchi, e qui la prima
 * colonna deve restare ferma mentre le altre scorrono. Su uno schermo
 * stretto, senza la colonna bloccata, si scorre di lato e si perde di
 * vista DI CHI e' la riga che si sta leggendo — l'unica informazione
 * che non puo' mancare.
 */
function Griglia({
  righe,
  giorni,
  aperta,
  onApri,
}: {
  righe: RigaGriglia[]
  giorni: string[]
  aperta: Aperta | null
  onApri: (riga: RigaGriglia, giorno: string) => void
}) {
  const oggi = iso(new Date())

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-black bg-white shadow-neo">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black bg-gray-100">
            {/* `sticky left-0`: la colonna dei nomi non scorre. Ha il suo
                fondo pieno perche' sotto ci passano le celle. */}
            <th className="sticky left-0 z-10 min-w-[11rem] border-r-2 border-black bg-gray-100 px-3 py-2 text-left font-bold uppercase tracking-wider">
              Persona
            </th>

            {giorni.map((g) => (
              <th
                key={g}
                className={cn(
                  'px-2 py-2 text-center font-bold uppercase tracking-wider',
                  // Oggi si accende: su una settimana in corso dice a che
                  // punto si e', e quali colonne sono ancora da riempire.
                  g === oggi && 'bg-amber-200',
                )}
              >
                <div>{giornoCorto(g)}</div>
                <div className="text-[13px] font-black">{numeroGiorno(g)}</div>
              </th>
            ))}

            <th className="w-24 border-l-2 border-black bg-gray-100 px-3 py-2 text-right font-bold uppercase tracking-wider">
              Totale
            </th>
          </tr>
        </thead>

        <tbody>
          {righe.map((r) => {
            const fuori = fuoriGriglia(r, giorni)
            return (
              <tr key={r.dipendente_id} className="border-b border-gray-200 last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r-2 border-black bg-white px-3 py-2 text-left font-bold normal-case tracking-normal"
                >
                  <div className="truncate text-xs font-extrabold text-black">
                    {r.nominativo}
                  </div>
                  {/* Il tipo si scrive solo quando NON e' operaio: la
                      griglia e' fatta per loro, e ripetere «operaio»
                      venti volte e' rumore. Su un tecnico invece spiega
                      perche' le sue ore non stanno su nessun cantiere. */}
                  {r.tipo !== 'operaio' && (
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      {r.tipo}
                    </div>
                  )}
                </th>

                {giorni.map((g) => (
                  <Cella
                    key={g}
                    casella={r.giorni.get(g)}
                    aperta={
                      aperta?.riga.dipendente_id === r.dipendente_id && aperta.giorno === g
                    }
                    onApri={() => onApri(r, g)}
                  />
                ))}

                <td className="border-l-2 border-black px-3 py-2 text-right">
                  <span className="text-sm font-black tabular-nums text-black">
                    {ore(r.ordinarie + r.straordinarie)}
                  </span>
                  {r.straordinarie > 0 && (
                    <div className="text-[10px] font-bold tabular-nums text-rose-700">
                      di cui {ore(r.straordinarie)} str.
                    </div>
                  )}
                  {/* Il sabato lavorato non ha una colonna, ma sta nel
                      totale: dirlo qui evita che la riga sembri sbagliata
                      a chi somma le celle con l'occhio. */}
                  {fuori > 0 && (
                    <div className="text-[10px] font-bold tabular-nums text-gray-500">
                      {ore(fuori)} nel fine settimana
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>

        {/* ── la riga dei totali per giorno ───────────────────────
            E' la lettura verticale, e da sola giustifica la griglia: da
            un elenco di totali settimanali non si vedrebbe mai che il
            venerdi' si e' sempre a mezzo organico. */}
        <tfoot>
          <tr className="border-t-2 border-black bg-gray-100">
            <th className="sticky left-0 z-10 border-r-2 border-black bg-gray-100 px-3 py-2 text-left font-bold uppercase tracking-wider">
              Tutti
            </th>

            {giorni.map((g) => {
              const t = totaleGiorno(righe, g)
              return (
                <td
                  key={g}
                  className={cn(
                    'px-2 py-2 text-center text-xs font-black tabular-nums',
                    t === 0 ? 'text-gray-300' : 'text-black',
                  )}
                >
                  {t === 0 ? '—' : ore(t)}
                </td>
              )
            })}

            <td className="border-l-2 border-black px-3 py-2 text-right text-sm font-black tabular-nums text-black">
              {ore(righe.reduce((s, r) => s + r.ordinarie + r.straordinarie, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
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
 * IL SEGNO DELLA GIUSTIFICAZIONE e' il dettaglio che fa funzionare la
 * pagina: un puntino sull'angolo dove il tecnico ha scritto qualcosa.
 * Senza, per sapere se una giornata da sei ore e' spiegata bisognerebbe
 * aprirle tutte; con il puntino si aprono solo quelle che hanno da dire
 * qualcosa.
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
      <td className="px-2 py-2 text-center text-gray-300">
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
  const spiegata = casella.giustificazione !== null

  return (
    <td className="p-1 text-center">
      <button
        type="button"
        onClick={onApri}
        aria-expanded={aperta}
        aria-label={`${assente ? 'Assenza' : `${ore(lav)} ore`} il ${dataEstesa(casella.data)}`}
        className={cn(
          'relative w-full rounded-lg border-2 px-1 py-1.5 transition-colors',
          aperta
            ? 'border-black bg-amber-300'
            : 'border-transparent hover:border-black hover:bg-amber-50',
        )}
      >
        {assente ? (
          <span className="inline-block rounded-md border-2 border-gray-400 bg-white px-1 text-[10px] font-extrabold uppercase text-gray-600">
            {siglaAssenza(casella.tipo_assenza)}
          </span>
        ) : (
          <span
            className={cn(
              'text-sm font-black tabular-nums',
              straordinario ? 'text-rose-700' : 'text-black',
            )}
          >
            {ore(lav)}
          </span>
        )}

        {/* Il puntino: qui c'e' un perche' scritto. In alto a destra,
            dove non copre la cifra. */}
        {spiegata && (
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

/* ── il dettaglio di una cella ───────────────────────────────────── */

/**
 * Cosa c'e' dentro un numero.
 *
 * Sta SOTTO la griglia e non in una finestra sopra: cosi' si puo'
 * continuare a leggere la tabella mentre lo si guarda — confrontare il
 * martedi' di Mario con quello di Fadera e' esattamente il gesto per
 * cui serve — e su un portatile una finestra centrata coprirebbe
 * proprio le righe che si stanno confrontando.
 *
 * Tre cose, nell'ordine in cui servono: quanto, dove, perche'.
 */
function Dettaglio({ aperta, onChiudi }: { aperta: Aperta; onChiudi: () => void }) {
  const { riga, giorno } = aperta
  const c = riga.giorni.get(giorno)

  const lav = c ? lavorate(c) : 0
  const g = c?.giustificazione ?? null

  return (
    <Card className="grid gap-4 border-2 bg-amber-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-black">{riga.nominativo}</h2>
          <p className="text-sm font-semibold text-gray-700">{dataEstesa(giorno)}</p>
        </div>
        <Button variante="secondario" onClick={onChiudi}>
          Chiudi
        </Button>
      </div>

      {!c ? (
        <p className="text-sm font-bold text-gray-600">
          Nessuna ora registrata in questa giornata. Se era un giorno lavorativo, il rapportino
          potrebbe essere ancora fermo in attesa del titolare.
        </p>
      ) : (
        <>
          {/* ── quanto ──────────────────────────────────────────
              Le voci a zero non si scrivono: una riga «0 di trasferta»
              su ogni giornata insegna a saltare tutto il riquadro. */}
          <div className="flex flex-wrap gap-2">
            <Voce etichetta="Ore lavorate" valore={ore(lav)} forte />
            {Number(c.ore_straordinarie) > 0 && (
              <Voce
                etichetta="di cui straordinario"
                valore={ore(c.ore_straordinarie)}
                tono="rosa"
              />
            )}
            {Number(c.ore_trasferta) > 0 && (
              <Voce etichetta="Trasferta" valore={ore(c.ore_trasferta)} />
            )}
            {Number(c.ore_assenza) > 0 && (
              <Voce
                etichetta={c.tipo_assenza ? `Assenza · ${c.tipo_assenza}` : 'Assenza'}
                valore={ore(c.ore_assenza)}
              />
            )}
          </div>

          {/* ── dove ────────────────────────────────────────────
              La domanda testuale dell'utente: «dove hanno lavorato cioe'
              in quale cantiere». Una riga per cantiere con le sue ore,
              perche' chi in un giorno ne gira due ha due numeri diversi
              e la somma da sola non lo racconta. */}
          <div>
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-600">
              Dove ha lavorato
            </h3>

            {c.cantieri.length === 0 ? (
              <p className="text-sm font-semibold text-gray-600">
                {riga.tipo === 'operaio'
                  ? 'Nessun cantiere su questa giornata.'
                  : 'Ore dal foglio personale: non stanno su nessun cantiere.'}
              </p>
            ) : (
              <ul className="grid gap-2">
                {c.cantieri.map((k) => (
                  <li
                    key={k.cantiere_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-black bg-white px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="text-xs font-extrabold text-black">{k.codice}</span>
                      {k.denominazione && (
                        <span className="ml-2 text-xs font-semibold text-gray-600">
                          {k.denominazione}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-black tabular-nums text-black">
                      {ore(k.ore)} h
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── perche' ─────────────────────────────────────────
              «se hanno qualche ora in meno o in piu' e per quale
              motivo». La scrive il tecnico in `giustificazioni_ore`, ed
              e' il pezzo che rende leggibile una giornata da sei ore
              senza aprire nessun rapportino. */}
          <div>
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-600">
              Perché la giornata è così
            </h3>

            {g ? (
              <div className="rounded-xl border-2 border-black bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase',
                      g.tipo === 'mancanza' ? 'bg-rose-200' : 'bg-lime-200',
                    )}
                  >
                    {g.tipo === 'mancanza' ? 'Ore in meno' : 'Ore in più'}
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-wide text-black">
                    {g.motivo}
                  </span>
                  {Number(g.ore) > 0 && (
                    <span className="text-xs font-bold tabular-nums text-gray-700">
                      {ore(g.ore)} h
                    </span>
                  )}
                </div>
                {g.descrizione && (
                  /* `whitespace-pre-wrap`: il tecnico scrive a mano, e
                     puo' andare a capo. */
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-black">
                    {g.descrizione}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-600">
                {lav === 8
                  ? 'Giornata piena: non c’era niente da giustificare.'
                  : 'Il tecnico non ha scritto nessuna motivazione per questa giornata.'}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

/** Un numero con la sua etichetta, nel riquadro del dettaglio. */
function Voce({
  etichetta: nome,
  valore,
  forte = false,
  tono,
}: {
  etichetta: string
  valore: string
  forte?: boolean
  tono?: 'rosa'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-black px-3 py-2',
        tono === 'rosa' ? 'bg-rose-100' : forte ? 'bg-white' : 'bg-white',
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{nome}</div>
      <div
        className={cn(
          'tabular-nums font-black text-black',
          forte ? 'text-xl' : 'text-sm',
        )}
      >
        {valore}
      </div>
    </div>
  )
}

/** Cosa vuol dire quello che si vede. Sta SOTTO la griglia e non sopra:
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
      <span className="text-gray-500">Clicca un numero per il dettaglio.</span>
    </p>
  )
}

/* ── cio' che manca all'appello ──────────────────────────────────── */

/**
 * Le giornate che il titolare non ha ancora validato.
 *
 * Stesso riquadro di «Ore per persona», e stesso motivo: la griglia qui
 * sotto mostra SOLO il validato, quindi un buco puo' voler dire due cose
 * diversissime — «non ha lavorato» oppure «ha lavorato e nessuno l'ha
 * ancora firmato». Senza questa riga in cima, le due si confondono e la
 * seconda sparisce dentro la prima.
 */
function InSospeso({
  righe,
}: {
  righe: { stato: string; giornate: number; dal: string; al: string }[]
}) {
  const navigate = useNavigate()
  const totale = righe.reduce((s, r) => s + Number(r.giornate), 0)
  if (totale === 0) return null

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-2 bg-yellow-100 p-4">
      <div>
        <p className="text-sm font-extrabold text-black">
          {totale === 1
            ? '1 giornata non è ancora stata validata'
            : `${totale} giornate non sono ancora state validate`}
        </p>
        <p className="text-xs font-semibold text-gray-700">
          Le loro ore non sono in griglia: i buchi che vedi potrebbero essere giornate lavorate
          e ferme dal titolare.
        </p>
      </div>
      <Button variante="secondario" onClick={() => navigate('/ore')}>
        Vedi il dettaglio
      </Button>
    </Card>
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
