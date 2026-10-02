import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Avviso, Badge, Button, CampoArea, Card, Percorso, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { useSession } from '../auth/SessionProvider'
import {
  daLeggere,
  useRispondi,
  useSegnaLetto,
  useStatoTicket,
  useTicketPersone,
  useTicketScheda,
} from './ticket'

/* ══════════════════════════════════════════════════════════════════
   Un ticket: chi scrive a chi, su cosa, i messaggi in fila, la
   risposta e «fatto». Vedi `ticket.ts`.

   Aprirlo vuol dire averlo letto: la scheda lo segna da se', e il
   pallino nel menu si spegne.
   ══════════════════════════════════════════════════════════════════ */

const ORA = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function TicketScheda() {
  const { id } = useParams()
  const { app } = useSession()
  const io = app?.userId
  const { data, isPending, error } = useTicketScheda(id)
  const { data: persone } = useTicketPersone()
  const rispondi = useRispondi(id ?? '')
  const stato = useStatoTicket(id ?? '')
  const segnaLetto = useSegnaLetto()
  const [testo, setTesto] = useState('')

  /* Segna letto una volta per ogni messaggio nuovo dell'altro: la
     chiave e' l'ora dell'ultimo messaggio, cosi' un aggiornamento che
     porta una risposta nuova la segna di nuovo, e uno che non porta
     niente non scrive. */
  const segnato = useRef<string | null>(null)
  const t = data?.ticket
  useEffect(() => {
    if (!t || !daLeggere(t, io) || segnato.current === t.ultimo_messaggio_at) return
    segnato.current = t.ultimo_messaggio_at
    segnaLetto.mutate(t)
  }, [t, io, segnaLetto])

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico il ticket…</p>
  if (error || !t) {
    return <Avviso tono="errore">Non trovo questo ticket: {(error as Error | null)?.message ?? '—'}</Avviso>
  }

  const nome = (u: string | null) => (!u ? '—' : u === io ? 'Tu' : (persone?.get(u)?.nome ?? '…'))
  const errore = (rispondi.error ?? stato.error) as Error | null

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Percorso indietro={{ etichetta: 'Ticket', a: '/ticket' }} qui={[{ etichetta: `#${t.numero}` }]} />

      <Card className="overflow-hidden">
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-3 border-b-2 border-black px-5 py-3',
            t.stato === 'fatto' ? 'bg-lime-200' : 'bg-amber-200',
          )}
        >
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-black">
              <span className="numerico mr-2 text-sm font-bold text-gray-600">#{t.numero}</span>
              {t.oggetto}
            </h1>
            <p className="text-xs font-semibold text-gray-700">
              {nome(t.da_user)} → {nome(t.a_user) === 'Tu' ? 'te' : nome(t.a_user)}
              {t.cantiere && (
                <>
                  {' · '}
                  <Link
                    to={`/cantieri/${t.cantiere_id}${t.giorno ? `?data=${t.giorno}` : ''}`}
                    className="font-bold underline decoration-2 underline-offset-2"
                  >
                    {t.cantiere.codice} {t.cantiere.denominazione}
                  </Link>
                </>
              )}
              {t.giorno && ` · ${fmtData(t.giorno)}`}
            </p>
          </div>
          <Badge className={cn('px-2.5 py-1 text-xs', t.stato === 'fatto' ? 'bg-lime-300' : 'bg-white')}>
            {t.stato === 'fatto' ? 'fatto' : 'aperto'}
          </Badge>
        </div>

        {/* I messaggi, i miei a destra. */}
        <ul className="grid gap-3 p-5">
          {data.messaggi.map((m) => {
            const mio = m.autore === io
            return (
              <li key={m.id} className={cn('flex', mio ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl border-2 border-black px-4 py-2.5 shadow-neo-xs',
                    mio ? 'bg-amber-100' : 'bg-white',
                  )}
                >
                  <p className="text-[11px] font-bold text-gray-600">
                    {nome(m.autore)} · {ORA.format(new Date(m.created_at))}
                  </p>
                  <p className="whitespace-pre-wrap text-sm font-semibold text-black">{m.testo}</p>
                </div>
              </li>
            )
          })}
        </ul>

        {t.stato === 'fatto' && (
          <p className="border-t-2 border-black bg-lime-50 px-5 py-2 text-xs font-bold text-gray-700">
            Segnato fatto da {t.fatto_da === io ? 'te' : nome(t.fatto_da)}
            {t.fatto_at && ` il ${ORA.format(new Date(t.fatto_at))}`}.
          </p>
        )}

        <div className="grid gap-3 border-t-2 border-black bg-gray-50 p-5">
          <CampoArea
            etichetta="Rispondi"
            rows={3}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
          />
          {errore && <Avviso tono="errore">{errore.message}</Avviso>}
          <div className="flex flex-wrap gap-2">
            <Button
              variante="primario"
              disabled={!testo.trim() || rispondi.isPending}
              onClick={() => rispondi.mutate(testo.trim(), { onSuccess: () => setTesto('') })}
            >
              {rispondi.isPending ? 'Invio…' : 'Invia risposta'}
            </Button>
            {t.stato === 'aperto' ? (
              <Button disabled={stato.isPending} onClick={() => stato.mutate('fatto')}>
                Segna come fatto
              </Button>
            ) : (
              /* Non e' il «Riapri» del rapportino: un ticket e' una
                 conversazione, e se la cosa non e' fatta davvero si
                 rimette in ballo. */
              <Button disabled={stato.isPending} onClick={() => stato.mutate('aperto')}>
                Non è fatto: rimettilo aperto
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
