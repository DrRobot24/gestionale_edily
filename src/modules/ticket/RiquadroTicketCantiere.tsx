import { useNavigate } from 'react-router'
import { Button, Card } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { RigaTicket } from './RigaTicket'
import { usePuoTicket, useTicketMiei, useTicketPersone } from './ticket'

/* ══════════════════════════════════════════════════════════════════
   I ticket di un cantiere, nella sua scheda: «nella scheda del cantiere
   si vedono i suoi» (deciso con l'utente il 2026-10-02). Ognuno vede i
   suoi — quelli che ha scritto o ricevuto — come in tutta la pagina
   dei ticket.

   «Nuovo ticket» apre il modulo gia' col cantiere e il giorno guardato.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroTicketCantiere({ cantiereId, giorno }: { cantiereId: string; giorno: string }) {
  const navigate = useNavigate()
  const { app } = useSession()
  const puo = usePuoTicket()
  const { data } = useTicketMiei()
  const { data: persone } = useTicketPersone()

  if (!puo || data?.mancante) return null
  const suoi = (data?.righe ?? []).filter((t) => t.cantiere_id === cantiereId)
  const aperti = suoi.filter((t) => t.stato === 'aperto')

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">Ticket</h2>
          <p className="text-xs font-semibold text-gray-700">
            {suoi.length === 0
              ? 'Le cose da dirsi su questo cantiere.'
              : `${aperti.length} ${aperti.length === 1 ? 'aperto' : 'aperti'} su ${suoi.length}`}
          </p>
        </div>
        <Button
          dimensione="sm"
          variante="primario"
          onClick={() => navigate(`/ticket?nuovo=1&cantiere=${cantiereId}&giorno=${giorno}`)}
        >
          Nuovo ticket
        </Button>
      </div>
      {aperti.length > 0 && (
        <div className="grid gap-2 p-3">
          {aperti.map((t) => (
            <RigaTicket key={t.id} t={t} io={app?.userId} nomi={persone} />
          ))}
        </div>
      )}
    </Card>
  )
}
