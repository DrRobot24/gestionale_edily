import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Button, Cifra, Table, Vuoto, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { StatoCantiere } from './stato'
import { useCantieri } from './useCantieri'
import type { CantiereStato } from './cantieri'
import { useFigureRiepilogo } from '../anagrafiche/figure'

/* ══════════════════════════════════════════════════════════════════
   IL FILTRO PER STATO.

   Chiesto dall'utente il 2026-09-22: «mettimi un filtro con toggle per
   filtrare gli stati dei cantieri, cosi' si filtra un domani che la
   lista si fa molto lunga». Oggi sono otto e tutti attivi: il filtro
   non serve adesso, serve fra sei mesi — ed e' il momento giusto per
   metterlo, perche' quando la lista sara' lunga il problema sara' gia'
   in corso.

   DUE VOCI, NON CINQUE. Gli stati nel database sono cinque — in
   preparazione, attivo, sospeso, chiuso, archiviato — ma un filtro con
   cinque bottoni chiede di scegliere fra cose che quasi sempre non si
   vogliono distinguere. La domanda vera che ci si fa aprendo la pagina
   e' una sola: «quelli che lavoro adesso, o tutti?».

     in corso   in preparazione, attivo, sospeso. Cioe' tutto cio' che
                non e' finito: un cantiere sospeso torna, un cantiere
                in preparazione partira'.
     tutti      anche chiusi e archiviati, per andare a cercare uno
                storico

   Il default e' «in corso», e conta: chi apre i Cantieri sta lavorando,
   non consultando un archivio.

   ⚠️ SI FILTRA NEL BROWSER, non nella query. `useCantieri()` legge
   tutto e la RLS ha gia' ristretto al perimetro di chi guarda: con
   qualche centinaio di righe e' il compromesso giusto, perche' cambiare
   filtro e' immediato e non fa ripartire una chiamata. Se un giorno i
   cantieri saranno migliaia, il filtro va spostato nella query — e
   allora `stato` andra' nella queryKey.
   ══════════════════════════════════════════════════════════════════ */

/** Gli stati che vuol dire «non e' finito». */
const IN_CORSO: CantiereStato[] = ['in_preparazione', 'attivo', 'sospeso']

type Vista = 'in-corso' | 'tutti'

export function CantieriPage() {
  const [vista, setVista] = useState<Vista>('in-corso')
  const { data: cantieri, isPending, error } = useCantieri()
  /* Le figure in colonna: «così so ogni cantiere che personaggi ha
     all'interno» (utente, 2026-09-21). Una chiamata sola per tutto
     l'elenco, non una per riga.

     Se la vista non c'e' ancora la colonna resta vuota e l'elenco
     funziona lo stesso: `figure.sql` si esegue a mano, e una pagina che
     si rompe per una colonna accessoria sarebbe una punizione
     sproporzionata. */
  const { data: figure } = useFigureRiepilogo('cantiere')

  // Chi non ha cantieri.read_all vede solo quelli che gli sono stati
  // assegnati. Vale la pena dirglielo: altrimenti una lista con un
  // cantiere solo sembra un database vuoto, non un filtro che funziona.
  const vedeTutti = usePermission('cantieri.read_all')
  const puoScrivere = usePermission('cantieri.write')
  const navigate = useNavigate()

  if (isPending) {
    return <p className="text-sm font-bold text-gray-600">Carico i cantieri…</p>
  }

  if (error) {
    return <Avviso tono="errore">Non riesco a leggere i cantieri: {error.message}</Avviso>
  }

  const mostrati =
    vista === 'tutti' ? cantieri : cantieri.filter((c) => IN_CORSO.includes(c.stato))

  /* Quanti ne restano fuori: senza questo numero, «in corso» nasconde
     righe senza dire quante, e chi non trova un cantiere non sa se e'
     filtrato o se non esiste. */
  const nascosti = cantieri.length - mostrati.length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Cantieri</h1>
          <p className="text-xs font-semibold text-gray-600">
            {mostrati.length} {mostrati.length === 1 ? 'cantiere' : 'cantieri'}
            {vista === 'in-corso' && nascosti > 0 && ` · ${nascosti} chiusi non mostrati`}
            {!vedeTutti && ' assegnati a te'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* DUE BOTTONI E NON UNA TENDINA: le scelte sono due, e una
              tendina da due voci chiede un click in piu' per dire una
              cosa che sta gia' tutta sullo schermo. E' lo stesso
              interruttore di «Ore per persona», settimana/mese.

              Compare solo quando c'e' qualcosa da filtrare: con otto
              cantieri tutti attivi, due bottoni di cui uno non cambia
              niente sono rumore. Si accende da solo il giorno che il
              primo cantiere viene chiuso. */}
          {nascosti > 0 || vista === 'tutti' ? (
            <div className="flex overflow-hidden rounded-xl border-2 border-black">
              {(
                [
                  ['in-corso', 'In corso'],
                  ['tutti', 'Tutti'],
                ] as const
              ).map(([valore, etichetta]) => (
                <button
                  key={valore}
                  type="button"
                  onClick={() => setVista(valore)}
                  aria-pressed={vista === valore}
                  className={cn(
                    'cursor-pointer px-4 py-2 text-xs font-bold uppercase tracking-wide',
                    vista === valore
                      ? 'bg-amber-400 text-black'
                      : 'bg-white text-gray-600 hover:bg-amber-50',
                  )}
                >
                  {etichetta}
                </button>
              ))}
            </div>
          ) : null}

          {puoScrivere && (
            <Button variante="primario" onClick={() => navigate('/cantieri/nuovo')}>
              Nuovo cantiere
            </Button>
          )}
        </div>
      </div>

      {mostrati.length === 0 ? (
        <Vuoto>
          {/* Tre vuoti diversi, perche' sono tre situazioni diverse e
              mandano a fare tre cose diverse: non ce ne sono, non te ne
              hanno assegnati, oppure ci sono ma li sta nascondendo il
              filtro — e in quest'ultimo caso la via d'uscita e' il
              filtro stesso, non una spiegazione. */}
          {cantieri.length > 0
            ? 'Nessun cantiere in corso: quelli che ci sono sono tutti chiusi. Premi «Tutti» per vederli.'
            : vedeTutti
              ? 'Non c’è ancora nessun cantiere.'
              : 'Non sei assegnato a nessun cantiere. Chiedi al titolare di assegnartene uno.'}
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Codice</th>
              <th>Denominazione</th>
              <th>Luogo</th>
              <th>D.L. e sicurezza</th>
              <th>Inizio</th>
              <th>Fine prevista</th>
              {/* `!` obbligatorio: la primitiva `Table` impone
                  `[&_th]:text-left`, un selettore discendente che per
                  specificita' batte una classe sulla cella. Senza,
                  l'intestazione restava a sinistra mentre gli importi
                  sotto andavano a destra. */}
              <th className="!text-right">Contratto</th>
              <th>Stato</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mostrati.map((c) => (
              <tr key={c.id}>
                <td className="numerico font-bold">{c.codice}</td>
                <td className="font-semibold">{c.denominazione}</td>
                <td className="text-gray-600">
                  {c.comune ? `${c.comune}${c.provincia ? ` (${c.provincia})` : ''}` : '—'}
                </td>
                {/* DL e CSE in UNA colonna, non due: la tabella ne ha
                    gia' otto, e due colonne di nomi lunghi la
                    spingerebbero fuori schermo. La sigla davanti dice
                    chi e' chi senza bisogno dell'intestazione. */}
                <td className="text-gray-600">
                  <Figure riga={figure?.get(c.id)} />
                </td>
                <td className="numerico text-gray-600">{fmtData(c.data_inizio)}</td>
                <td className="numerico text-gray-600">{fmtData(c.data_fine_prevista)}</td>
                <Cifra>{euro(c.importo_contratto)}</Cifra>
                <td>
                  <StatoCantiere stato={c.stato} />
                </td>
                <td className="text-right">
                  <Button dimensione="sm" onClick={() => navigate(`/cantieri/${c.id}`)}>
                    Apri
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Le figure di un cantiere, in una cella sola.

   Si mostrano DL e CSE perche' sono le due che si vanno a cercare: chi
   dirige e chi risponde della sicurezza. Le altre — RSPP, collaudatore,
   progettista — stanno nella scheda: in elenco riempirebbero la riga
   senza che nessuno le stia cercando li'.
   ───────────────────────────────────────────────────────────────── */
function Figure({ riga }: { riga?: { dl: string | null; cse: string | null } }) {
  if (!riga || (!riga.dl && !riga.cse)) return <>—</>

  return (
    <div className="grid gap-0.5 text-xs">
      {riga.dl && (
        <div>
          <span className="font-bold">D.L.</span> {riga.dl}
        </div>
      )}
      {riga.cse && (
        <div>
          <span className="font-bold">CSE</span> {riga.cse}
        </div>
      )}
    </div>
  )
}
