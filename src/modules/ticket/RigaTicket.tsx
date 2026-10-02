import { useNavigate } from 'react-router'
import { Badge, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { daFare, daLeggere, type Ticket } from './ticket'

/** Una riga dell'elenco. Usata anche in home e nella scheda del cantiere. */
export function RigaTicket({
  t,
  io,
  nomi,
}: {
  t: Ticket
  io: string | undefined
  nomi: Map<string, { nome: string }> | undefined
}) {
  const navigate = useNavigate()
  const leggere = daLeggere(t, io)
  const fare = daFare(t, io)
  const nome = (u: string) => (u === io ? 'te' : (nomi?.get(u)?.nome ?? '…'))

  return (
    <button
      type="button"
      onClick={() => navigate(`/ticket/${t.id}`)}
      className={cn(
        'neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border-2 border-black px-4 py-2.5 text-left shadow-neo-xs',
        leggere || fare ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-gray-50',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-black">
          <span className="numerico mr-1.5 text-xs font-bold text-gray-500">#{t.numero}</span>
          {t.oggetto}
        </p>
        <p className="text-xs font-semibold text-gray-600">
          {nome(t.da_user) === 'te' ? 'Tu' : nome(t.da_user)} → {nome(t.a_user)}
          {t.cantiere && ` · ${t.cantiere.codice} ${t.cantiere.denominazione}`}
          {t.giorno && ` · ${fmtData(t.giorno)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {leggere && <Badge className="bg-rose-300 px-2 py-0.5 text-[10px]">da leggere</Badge>}
        {fare && <Badge className="bg-amber-300 px-2 py-0.5 text-[10px]">da fare</Badge>}
        {t.stato === 'fatto' && <Badge className="bg-lime-300 px-2 py-0.5 text-[10px]">fatto</Badge>}
        <span className="numerico text-[11px] font-semibold text-gray-500">
          {fmtData(t.ultimo_messaggio_at.slice(0, 10))}
        </span>
      </div>
    </button>
  )
}
