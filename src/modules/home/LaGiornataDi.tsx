import { useLocation, useNavigate } from 'react-router'
import { apriDa } from '../rapportini/percorso'
import { Avviso, Badge, Card, cn } from '../../ui'
import { dataEstesa, numero } from '../../lib/formato'
import { useOreGriglia, lavorate, type OreGiorno } from '../ore/useOrePeriodo'
import { useRapportini } from '../rapportini/useRapportini'
import { StatoRapportino } from '../rapportini/stato'

/* ══════════════════════════════════════════════════════════════════
   COS'E' SUCCESSO QUEL GIORNO.

   Nasce il 2026-09-22 da un'osservazione dell'utente: «perche' non ci
   sono le frecce di spostamento delle date dal POV titolare o
   amministrazione? Solo il tecnico lo puo' fare».

   L'osservazione era giusta, la cura no — ed e' valsa la pena
   guardarci dentro prima di aggiungerle. Le frecce nella fascia
   muovono `giorno`, che in quella home alimenta SOLO i riquadri di chi
   compila: le card dei cantieri, il controllo delle ore, il
   calendario del tecnico. Il titolare e l'amministrazione non ne
   ricevono nessuno —

     «Giornate da validare»   elenca TUTTE le giornate in coda, di
                              qualunque data: non guarda un giorno
     «Cosa aspetto dal campo» ha il suo sfogliatore per MESE, perche'
                              la sua domanda e' «cosa manca nel mese»
     «Ore arrivate»           lavora sulla settimana corrente
     «I registri»             conteggi, nessuna data

   — quindi le frecce avrebbero mosso la data grande in cima senza
   cambiare niente sotto. Un comando che gira a vuoto e' peggio di un
   comando assente: la prima volta lo si prova, la seconda non ci si
   fida piu' della pagina.

   C'E' ANCHE UNA RAGIONE DI MESTIERE. Il tecnico compila per giorno —
   la prassi e' «si compila oggi per ieri», quindi tornare indietro e'
   il suo gesto quotidiano. Il titolare firma per CODA: apre la home e
   trova tutto cio' che aspetta, in ordine. Non deve andare a cercare
   martedi', perche' martedi' e' gia' li' se ha qualcosa in sospeso.

   ── LA DOMANDA VERA CHE RESTAVA SCOPERTA ────────────────────────────

   «Cos'e' successo giovedi' 17?» — tutti i cantieri, tutte le ore,
   comprese le cose gia' firmate. Il dettaglio dentro «Cosa aspetto dal
   campo» non risponde: mostra le CONSEGNE di un tecnico, cioe' cosa
   manca, e una volta che tutto e' arrivato non dice piu' niente.

   Questo riquadro risponde a quella. Si apre cliccando un giorno nel
   calendario e racconta la giornata intera: quante persone, quante
   ore, su quali cantieri, e a che punto sono le schede.

   NESSUNA QUERY NUOVA PER I RAPPORTINI: escono da `useRapportini()`,
   che la home carica gia'. Le ore passano da `ore_griglia` con dal e al
   sullo stesso giorno — la funzione accetta un periodo qualunque, e un
   giorno e' un periodo di uno.
   ══════════════════════════════════════════════════════════════════ */

export function LaGiornataDi({ giorno }: { giorno: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: rapportini } = useRapportini()
  /* `ore_griglia` chiede `paghe.read`. Ce l'hanno owner, admin e
     amministrazione — cioe' tutti quelli che vedono questo riquadro —
     ma se un domani qualcun altro ci arrivasse, l'errore non deve
     portarsi via la pagina: le ore restano vuote e i rapportini si
     leggono lo stesso. */
  const { data: ore, error: erroreOre } = useOreGriglia({
    passo: 'settimana',
    dal: giorno,
    al: giorno,
  })

  /* Le bozze no: il titolare vede cio' che gli e' stato INVIATO. Una
     scheda non ancora partita non e' pronta (utente, 2026-09-23). */
  const schede = (rapportini ?? []).filter((r) => r.data === giorno && r.stato !== 'bozza')
  const righeOre = (ore ?? []).filter((o) => o.data === giorno)

  /* Le persone che quel giorno hanno fatto qualcosa, e il totale.
     Si contano le PERSONE e non le righe: chi e' passato su tre
     cantieri ha tre righe e una persona sola. */
  const persone = new Set(righeOre.filter((o) => lavorate(o) > 0).map((o) => o.dipendente_id))
  const oreTotali = righeOre.reduce((t, o) => t + lavorate(o), 0)

  return (
    <Card className="overflow-hidden">
      {/* LA DATA NON SI RIPETE: la dice gia' il riquadro qui sopra, e
          due intestazioni azzurre attaccate con lo stesso «Giovedi' 17
          Settembre» erano la stessa ripetizione che l'utente ha notato
          sulle schede. Qui basta dire COSA si sta guardando — la
          giornata intera — e i numeri che la riassumono.

          Niente pulsante «Chiudi» per lo stesso motivo: quello sopra
          chiude tutti e due, perche' si aprono e si chiudono insieme.
          Due pulsanti identici a mezzo schermo di distanza fanno
          chiedere se facciano cose diverse. */}
      <div className="border-b-2 border-black bg-white px-5 py-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-600">
          Cos&rsquo;è successo
        </p>
        <p className="text-sm font-bold text-black">
          {schede.length} {schede.length === 1 ? 'scheda' : 'schede'} ·{' '}
          <span className="numerico">{numero(oreTotali)}</span> ore · {persone.size}{' '}
          {persone.size === 1 ? 'persona' : 'persone'}
        </p>
      </div>

      {erroreOre && (
        <Avviso tono="info" className="m-4">
          Le ore di questa giornata non sono leggibili con questa utenza. Le schede sotto
          si leggono lo stesso.
        </Avviso>
      )}

      {schede.length === 0 && righeOre.length === 0 ? (
        <p className="px-5 py-4 text-sm font-semibold text-gray-600">
          Per questa giornata non risulta niente: nessuna scheda e nessuna ora.
        </p>
      ) : (
        <ul className="divide-y-2 divide-black">
          {schede.map((r) => {
            const cantiere = Array.isArray(r.cantieri) ? r.cantieri[0] : r.cantieri
            /* Le ore di QUEL cantiere in QUEL giorno: `ore_griglia`
               porta i cantieri annidati dentro ogni riga, quindi il
               conto si fa qui senza una seconda lettura. */
            const sue = righeOre.reduce(
              (t, o) =>
                t + (o.cantieri ?? []).reduce((q, c) => q + (c.cantiere_id === r.cantiere_id ? Number(c.ore) : 0), 0),
              0,
            )

            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/rapportini/${r.id}`, apriDa(location, 'Home'))}
                  className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-black">
                      {cantiere?.codice ? `${cantiere.codice} — ` : ''}
                      {cantiere?.denominazione ?? 'Cantiere non indicato'}
                    </p>
                    <p className="truncate text-xs font-semibold text-gray-600">
                      {r.nessuna_attivita ? (
                        'Nessuna attività dichiarata'
                      ) : (
                        <>
                          <span className="numerico">{numero(sue)}</span> ore
                          {r.meteo && ` · ${r.meteo}`}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* NIENTE badge «nota» qui, a differenza della coda
                        da validare: `useRapportini()` non carica
                        `annotazioni`, e aggiungercele vorrebbe dire
                        appesantire di un campo OGNI elenco dell'app per
                        un segno che qui e' accessorio. La nota si legge
                        aprendo la scheda, che e' dove si va comunque
                        quando qualcosa non torna. */}
                    {r.numero && (
                      <Badge className="px-2 py-0.5 text-[10px]">
                        n. {r.numero}/{r.anno}
                      </Badge>
                    )}
                    <StatoRapportino stato={r.stato} />
                  </div>
                </button>
              </li>
            )
          })}

          {/* Le assenze e i permessi non stanno piu' qui: dal
              2026-09-25 sono sotto il calendario, uno per riga. Vedi
              `AssenzeDelGiorno`. */}
        </ul>
      )}
    </Card>
  )
}

/* ── assenze e permessi ─────────────────────────────────────────── */

/**
 * Chi quel giorno non ha fatto una giornata normale, e perche'.
 *
 * SOLO I CASI PARTICOLARI, dal 2026-09-23: prima c'era «Chi c'era»,
 * tutti i presenti con le loro ore, tolto perche' ripeteva i rapportini
 * e il Foglio presenze. Restano le persone di cui c'e' qualcosa da
 * sapere: un'assenza (ferie, permesso, malattia) o una giustificazione
 * scritta dal tecnico.
 *
 * IN COLONNA E SOTTO IL CALENDARIO, dal 2026-09-25. Prima erano pillole
 * affiancate in fondo a «Cos'e' successo», l'ultima cosa che l'occhio
 * raggiungeva; l'utente le voleva «in verticale, cosi' mi arrivano
 * prima all'occhio», nello spazio vuoto sotto il calendario. Una
 * persona per riga: il nome a sinistra, il motivo a destra.
 *
 * Stessa lettura di `LaGiornataDi`, stessa chiave: la cache la
 * condividono, nessuna query in piu'.
 */
export function AssenzeDelGiorno({ giorno }: { giorno: string }) {
  const { data: ore } = useOreGriglia({ passo: 'settimana', dal: giorno, al: giorno })

  const particolari = (ore ?? [])
    .filter((o) => o.data === giorno)
    .filter((o) => Number(o.ore_assenza) > 0 || o.tipo_assenza || o.giustificazione)
    .sort((x, y) => x.nominativo.localeCompare(y.nominativo, 'it'))

  // Nessuno assente: il riquadro sparisce, non dice «nessuno».
  if (particolari.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-white px-4 py-3">
        <p className="text-sm font-extrabold uppercase tracking-wide text-black">
          Assenze e permessi
        </p>
        <p className="text-xs font-semibold capitalize text-gray-600">{dataEstesa(giorno)}</p>
      </div>
      <ul className="divide-y-2 divide-black">
        {particolari.map((o) => (
          <CasoParticolare key={o.dipendente_id} riga={o} />
        ))}
      </ul>
    </Card>
  )
}

/** Una persona e il motivo per cui la sua giornata non e' normale.
 *  Si dice il motivo, non le ore lavorate: quelle stanno nei rapportini. */
function CasoParticolare({ riga: o }: { riga: OreGiorno }) {
  const assenza = Number(o.ore_assenza)
  const motivo = o.tipo_assenza ?? o.giustificazione?.motivo ?? 'assente'
  const tutto = lavorate(o) === 0
  const nota = o.nota_assenza ?? o.giustificazione?.descrizione

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-black">{o.nominativo}</p>
        {nota && <p className="text-xs font-semibold text-gray-600">{nota}</p>}
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full border-2 border-black px-2.5 py-0.5 text-[11px] font-extrabold uppercase',
          tutto ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-black',
        )}
      >
        {motivo}
        {assenza > 0 && !tutto && (
          <>
            {' · '}
            <span className="numerico">{numero(assenza)} h</span>
          </>
        )}
      </span>
    </li>
  )
}
