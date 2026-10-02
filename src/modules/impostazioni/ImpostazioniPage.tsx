import { Avviso, Card, cn } from '../../ui'
import { MOTIVI_PAGABILI, type AssenzePagate, type MotivoPagabile } from '../anagrafiche/retribuzione'
import { useAssenzePagate, useSalvaAssenzePagate } from './assenzePagate'

/* ══════════════════════════════════════════════════════════════════
   IMPOSTAZIONI, dal 2026-10-02: il pannello di controllo del titolare.

   «Io metterei un toggle in una pagina tipo impostazioni per accenderlo
   o meno, come un piccolo pannello di controllo, ovviamente solo per il
   titolare» (utente). Il cancello e' `org.manage`, che ha solo `owner`;
   la RLS di `assenze_pagate` dice la stessa cosa.

   Per ora un riquadro solo: quali assenze si pagano. Ogni interruttore
   salva al clic — e' un pannello, non un modulo da compilare.
   ══════════════════════════════════════════════════════════════════ */

const NOMI: Record<MotivoPagabile, string> = {
  ferie: 'Ferie',
  permessi: 'Permessi',
  malattia: 'Malattia',
  infortunio: 'Infortunio',
}

const REGIMI = [
  { chiave: 'calcolata', nome: 'Paga globale' },
  { chiave: 'manuale', nome: 'Paga giornaliera' },
] as const

export function ImpostazioniPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">Impostazioni</h1>
        <p className="text-sm font-semibold text-gray-600">
          Le regole dell&rsquo;impresa per il personale. Le cambia solo il titolare.
        </p>
      </div>
      <AssenzeDaPagare />
    </div>
  )
}

function AssenzeDaPagare() {
  const { data, isPending, error } = useAssenzePagate()
  const salva = useSalvaAssenzePagate()

  function cambia(regime: keyof AssenzePagate, motivo: MotivoPagabile) {
    if (!data) return
    salva.mutate({ ...data, [regime]: { ...data[regime], [motivo]: !data[regime][motivo] } })
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-lime-200 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Quali assenze si pagano
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          Acceso: le ore di quell&rsquo;assenza entrano nel maturato del Riepilogo economico,
          alla tariffa della persona.
        </p>
      </div>

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le regole…</p>
      ) : error ? (
        <p className="px-5 py-4 text-sm font-semibold text-rose-700">
          Non riesco a leggere le regole: {(error as Error).message}
        </p>
      ) : (
        <div className="grid gap-4 p-5">
          <table className="w-full max-w-lg text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-600">
                  Motivo
                </th>
                {REGIMI.map((r) => (
                  <th
                    key={r.chiave}
                    className="pb-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-gray-600"
                  >
                    {r.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOTIVI_PAGABILI.map((m) => (
                <tr key={m} className="border-t-2 border-black/10">
                  <td className="py-2.5 font-extrabold text-black">{NOMI[m]}</td>
                  {REGIMI.map((r) => (
                    <td key={r.chiave} className="py-2.5 text-center">
                      <Interruttore
                        acceso={data[r.chiave][m]}
                        etichetta={`${NOMI[m]}, ${r.nome.toLowerCase()}`}
                        disabled={salva.isPending}
                        onCambia={() => cambia(r.chiave, m)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}

          {/* Cosa questo pannello NON fa, detto qui perche' e' la prima
              domanda di chi lo accende. */}
          <ul className="grid gap-1 text-xs font-semibold text-gray-600">
            <li>Congedo e altri motivi non si pagano.</li>
            <li>
              Le ore validate dal campo non cambiano: qui si decide solo cosa entra nel maturato. I
              mesi già inviati restano come sono stati fotografati.
            </li>
            <li>
              Quante ore pagare in una singola giornata (per esempio 7 come 8) si decide sulle
              celle gialle del Foglio presenze.
            </li>
          </ul>
        </div>
      )}
    </Card>
  )
}

/** Un interruttore acceso/spento. Verde acceso, grigio spento, e la
 *  parola accanto: il colore da solo non basta a chi non lo distingue. */
function Interruttore({
  acceso,
  etichetta,
  disabled,
  onCambia,
}: {
  acceso: boolean
  etichetta: string
  disabled: boolean
  onCambia: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={etichetta}
      disabled={disabled}
      onClick={onCambia}
      className="inline-flex cursor-pointer items-center gap-2 disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className={cn(
          'relative inline-block h-7 w-12 rounded-full border-2 border-black transition-colors',
          acceso ? 'bg-lime-400' : 'bg-gray-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full border-2 border-black bg-white transition-all',
            acceso ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
      </span>
      <span className={cn('w-8 text-left text-xs font-extrabold', acceso ? 'text-black' : 'text-gray-500')}>
        {acceso ? 'Sì' : 'No'}
      </span>
    </button>
  )
}
