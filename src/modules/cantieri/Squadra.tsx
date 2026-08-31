import { useState } from 'react'
import { data as fmtData } from '../../lib/formato'
import { Avviso, Badge, Button, Card, Select, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import {
  assegnazioneInCorso,
  useAssegna,
  useAssegnazioni,
  useChiudiAssegnazione,
  useMembri,
} from './assegnazioni'

/** `ruolo_cantiere` e' testo libero nel database. Lo proponiamo come
 *  lista chiusa per lo stesso motivo di sempre: due modi di scrivere la
 *  stessa parola diventano due categorie. */
const RUOLI_CANTIERE = ['capocantiere', 'tecnico', 'direttore lavori', 'assistente', 'operaio']

const oggi = () => new Date().toLocaleDateString('sv-SE')

export function Squadra({ cantiereId }: { cantiereId: string }) {
  const puoAssegnare = usePermission('cantieri.assign')
  const { data: assegnazioni, isPending } = useAssegnazioni(cantiereId)
  const { data: membri } = useMembri()
  const assegna = useAssegna()
  const chiudi = useChiudiAssegnazione()

  const [apri, setApri] = useState(false)
  const [chi, setChi] = useState('')
  const [ruolo, setRuolo] = useState('tecnico')
  const [dal, setDal] = useState(oggi())

  const nomeDi = (userId: string) =>
    membri?.find((m) => m.userId === userId)?.nome ?? 'Utente non più in azienda'
  const ruoloOrgDi = (userId: string) => membri?.find((m) => m.userId === userId)?.ruolo

  const inCorso = (assegnazioni ?? []).filter((a) => assegnazioneInCorso(a))
  const giaDentro = new Set(inCorso.map((a) => a.user_id))
  const assegnabili = (membri ?? []).filter((m) => m.attivo && !giaDentro.has(m.userId))

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Squadra</h2>
          {/* Questa frase e' la cosa piu' importante della schermata:
              spiega al titolare che assegnare NON e' un'etichetta
              descrittiva, e' l'atto che apre la porta. */}
          <p className="text-xs font-semibold text-gray-600">
            Chi è in questo elenco <strong>vede</strong> il cantiere e può compilarci i
            rapportini. Chi non c&rsquo;è non lo trova nemmeno cercandolo.
          </p>
        </div>
        {puoAssegnare && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)} disabled={assegnabili.length === 0}>
            Assegna persona
          </Button>
        )}
      </div>

      {assegna.isError && <Avviso tono="errore">{(assegna.error as Error).message}</Avviso>}

      {apri && (
        <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase">Persona</span>
              <Select value={chi} onChange={(e) => setChi(e.target.value)}>
                <option value="">— scegli —</option>
                {assegnabili.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nome} ({m.ruolo})
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase">Ruolo in cantiere</span>
              <Select value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
                {RUOLI_CANTIERE.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase">Dal</span>
              <input
                type="date"
                value={dal}
                onChange={(e) => setDal(e.target.value)}
                className="w-full rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
          </div>

          <p className="text-[11px] font-semibold text-gray-600">
            Il ruolo in cantiere è descrittivo: serve a sapere chi fa cosa sul posto. Non
            cambia i permessi — quelli restano quelli del ruolo aziendale.
          </p>

          <div className="flex gap-2">
            <Button
              variante="primario"
              dimensione="sm"
              disabled={!chi || assegna.isPending}
              onClick={() =>
                assegna.mutate(
                  { cantiere_id: cantiereId, user_id: chi, ruolo_cantiere: ruolo, dal },
                  {
                    onSuccess: () => {
                      setApri(false)
                      setChi('')
                    },
                  },
                )
              }
            >
              {assegna.isPending ? 'Assegno…' : 'Assegna'}
            </Button>
            <Button dimensione="sm" onClick={() => setApri(false)}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico la squadra…</p>
      ) : assegnazioni?.length === 0 ? (
        <Vuoto>
          Nessuno è assegnato: al momento questo cantiere è invisibile a tutti tranne a chi
          ha il permesso di vederli tutti.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Ruolo aziendale</th>
              <th>In cantiere</th>
              <th>Dal</th>
              <th>Al</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assegnazioni!.map((a) => {
              const attiva = assegnazioneInCorso(a)
              return (
                <tr key={a.id} className={attiva ? undefined : 'bg-gray-50 text-gray-500'}>
                  <td className="font-semibold">
                    {nomeDi(a.user_id)}
                    {!attiva && (
                      <Badge className="ml-2 px-2 py-0.5 text-[10px]">terminata</Badge>
                    )}
                  </td>
                  <td className="text-gray-600">{ruoloOrgDi(a.user_id) ?? '—'}</td>
                  <td className="text-gray-600">{a.ruolo_cantiere}</td>
                  <td className="numerico text-gray-600">{fmtData(a.dal)}</td>
                  <td className="numerico text-gray-600">{a.al ? fmtData(a.al) : '—'}</td>
                  <td className="text-right">
                    {puoAssegnare &&
                      (attiva ? (
                        <Button
                          dimensione="sm"
                          variante="danger"
                          disabled={chiudi.isPending}
                          onClick={() => {
                            const risposta = prompt(
                              'Ultimo giorno di accesso al cantiere (l’accesso vale FINO a questa data compresa).\n' +
                                'Lascia oggi se ha lavorato oggi; metti ieri per togliere l’accesso subito.',
                              oggi(),
                            )
                            if (!risposta) return
                            chiudi.mutate({ id: a.id, al: risposta, cantiereId })
                          }}
                        >
                          Termina
                        </Button>
                      ) : (
                        <Button
                          dimensione="sm"
                          disabled={chiudi.isPending}
                          onClick={() => chiudi.mutate({ id: a.id, al: null, cantiereId })}
                        >
                          Riapri
                        </Button>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
