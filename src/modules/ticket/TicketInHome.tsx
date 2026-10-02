import { useNavigate } from 'react-router'
import { Button, Card } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { RigaTicket } from './RigaTicket'
import { daFare, daLeggere, usePuoTicket, useTicketMiei, useTicketPersone } from './ticket'

/* ══════════════════════════════════════════════════════════════════
   I TICKET IN HOME, in cima, per chi valida, chi compila e chi fa le
   paghe.

   Solo quelli che chiedono qualcosa a chi guarda — una risposta da
   leggere, una cosa da fare — e il riquadro sparisce quando non ce ne
   sono: la home mostra cose da fare, non una bacheca.
   ══════════════════════════════════════════════════════════════════ */

export function TicketInHome() {
  const navigate = useNavigate()
  const { app } = useSession()
  const io = app?.userId
  const puo = usePuoTicket()
  const { data } = useTicketMiei()
  const { data: persone } = useTicketPersone()

  if (!puo) return null
  const urgenti = (data?.righe ?? []).filter((t) => daLeggere(t, io) || daFare(t, io))
  if (urgenti.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-200 px-4 py-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">
          Ticket · {urgenti.length} {urgenti.length === 1 ? 'chiede' : 'chiedono'} qualcosa a te
        </h2>
        <Button dimensione="sm" variante="secondario" onClick={() => navigate('/ticket')}>
          Tutti i ticket
        </Button>
      </div>
      <div className="grid gap-2 p-3">
        {urgenti.slice(0, 5).map((t) => (
          <RigaTicket key={t.id} t={t} io={io} nomi={persone} />
        ))}
      </div>
    </Card>
  )
}
