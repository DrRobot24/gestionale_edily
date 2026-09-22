import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Button, Cifra, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { StatoCantiere } from './stato'
import { useCantieri } from './useCantieri'
import { useFigureRiepilogo } from '../anagrafiche/figure'

export function CantieriPage() {
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Cantieri</h1>
          <p className="text-xs font-semibold text-gray-600">
            {cantieri.length} {cantieri.length === 1 ? 'cantiere' : 'cantieri'}
            {!vedeTutti && ' assegnati a te'}
          </p>
        </div>
        {puoScrivere && (
          <Button variante="primario" onClick={() => navigate('/cantieri/nuovo')}>
            Nuovo cantiere
          </Button>
        )}
      </div>

      {cantieri.length === 0 ? (
        <Vuoto>
          {vedeTutti
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
            {cantieri.map((c) => (
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
