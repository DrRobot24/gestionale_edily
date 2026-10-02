import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Avviso, Button, Campo, CampoArea, CampoSelect, Card, Vuoto, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import {
  daFare,
  daLeggere,
  useApriTicket,
  useTicketMiei,
  useTicketPersone,
  type Ticket,
} from './ticket'
import { RigaTicket } from './RigaTicket'

/* ══════════════════════════════════════════════════════════════════
   I TICKET: l'elenco, e il modulo per aprirne uno. Vedi `ticket.ts`.

   In cima quelli che chiedono qualcosa a chi guarda — da leggere, da
   fare — poi gli altri aperti; i fatti in una scheda a parte, perche'
   la pagina e' per cio' che e' ancora in ballo.

   Il modulo si apre anche gia' compilato dall'indirizzo
   (`?nuovo=1&a=…&cantiere=…&giorno=…`): e' cosi' che ci arrivano il
   rapportino («Scrivi al tecnico») e la scheda del cantiere.
   ══════════════════════════════════════════════════════════════════ */

export function TicketPage() {
  const [params, setParams] = useSearchParams()
  const { app } = useSession()
  const io = app?.userId
  const { data, isPending, error } = useTicketMiei()
  const { data: persone } = useTicketPersone()
  const [vista, setVista] = useState<'aperti' | 'fatti'>('aperti')

  const nuovo = params.get('nuovo') === '1'
  const apri = () => {
    const p = new URLSearchParams(params)
    p.set('nuovo', '1')
    setParams(p, { replace: true })
  }
  const chiudi = () => setParams({}, { replace: true })

  const righe = data?.righe ?? []
  const aperti = righe
    .filter((t) => t.stato === 'aperto')
    .sort((a, b) => Number(urgente(b, io)) - Number(urgente(a, io)))
  const fatti = righe.filter((t) => t.stato === 'fatto')
  const mostrati = vista === 'aperti' ? aperti : fatti

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Ticket</h1>
          <p className="text-sm font-semibold text-gray-600">
            Le cose da dirsi fra titolare e tecnico: «ricordati di…», «mi serve…». Un ticket resta
            aperto finché qualcuno lo segna fatto.
          </p>
        </div>
        {!nuovo && !data?.mancante && (
          <Button variante="primario" onClick={apri}>
            Nuovo ticket
          </Button>
        )}
      </div>

      {data?.mancante && (
        <Avviso tono="info">
          I ticket non sono ancora attivi: manca <code>ticket.sql</code> nel database.
        </Avviso>
      )}

      {nuovo && !data?.mancante && (
        <ModuloNuovo
          // Rimonta se cambia l'indirizzo: i campi ripartono da li'.
          key={params.toString()}
          iniziali={{
            a: params.get('a') ?? '',
            cantiere: params.get('cantiere') ?? '',
            giorno: params.get('giorno') ?? '',
          }}
          onChiudi={chiudi}
        />
      )}

      {error && <Avviso tono="errore">Non riesco a leggere i ticket: {(error as Error).message}</Avviso>}

      {!data?.mancante && (
        <div className="flex gap-2">
          <Scheda attiva={vista === 'aperti'} onClick={() => setVista('aperti')}>
            Aperti · {aperti.length}
          </Scheda>
          <Scheda attiva={vista === 'fatti'} onClick={() => setVista('fatti')}>
            Fatti · {fatti.length}
          </Scheda>
        </div>
      )}

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico i ticket…</p>
      ) : data?.mancante ? null : mostrati.length === 0 ? (
        <Vuoto>{vista === 'aperti' ? 'Nessun ticket aperto.' : 'Nessun ticket fatto.'}</Vuoto>
      ) : (
        <div className="grid gap-2">
          {mostrati.map((t) => (
            <RigaTicket key={t.id} t={t} io={io} nomi={persone} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Chiede qualcosa a me: da leggere o da fare. */
function urgente(t: Ticket, io: string | undefined): boolean {
  return daLeggere(t, io) || daFare(t, io)
}

function Scheda({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        'neo-press cursor-pointer rounded-xl border-2 border-black px-3 py-1.5 text-xs font-extrabold uppercase',
        attiva ? 'bg-amber-400 shadow-neo-xs' : 'bg-white hover:bg-amber-50',
      )}
    >
      {children}
    </button>
  )
}

function ModuloNuovo({
  iniziali,
  onChiudi,
}: {
  iniziali: { a: string; cantiere: string; giorno: string }
  onChiudi: () => void
}) {
  const navigate = useNavigate()
  const { data: persone } = useTicketPersone()
  const { data: cantieri } = useCantieri()
  const apri = useApriTicket()

  const destinatari = [...(persone ?? [])]
    .filter(([, p]) => p.destinatario)
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome))

  /* Con un destinatario solo — il tecnico che scrive al titolare — lo
     si sceglie da se': una tendina con una voce sola e' un clic in piu'. */
  const [a, setA] = useState(iniziali.a)
  const scelto = a || (destinatari.length === 1 ? destinatari[0][0] : '')
  const [oggetto, setOggetto] = useState('')
  const [testo, setTesto] = useState('')
  const [cantiere, setCantiere] = useState(iniziali.cantiere)
  const [giorno, setGiorno] = useState(iniziali.giorno)
  const [problema, setProblema] = useState<string | null>(null)

  function conferma() {
    setProblema(null)
    if (!scelto) return setProblema('Scegli a chi scrivi.')
    if (!oggetto.trim()) return setProblema('Scrivi l’oggetto: due parole che dicano di cosa si tratta.')
    if (!testo.trim()) return setProblema('Scrivi il messaggio.')
    apri.mutate(
      {
        a_user: scelto,
        oggetto: oggetto.trim(),
        testo: testo.trim(),
        cantiere_id: cantiere || null,
        giorno: giorno || null,
      },
      { onSuccess: (id) => navigate(`/ticket/${id}`) },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-200 px-5 py-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">Nuovo ticket</h2>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <CampoSelect etichetta="A chi" value={scelto} onChange={(e) => setA(e.target.value)}>
          <option value="">— scegli —</option>
          {destinatari.map(([id, p]) => (
            <option key={id} value={id}>
              {p.nome}
            </option>
          ))}
        </CampoSelect>
        <Campo
          etichetta="Oggetto"
          placeholder="Il sale a Monterosa"
          value={oggetto}
          onChange={(e) => setOggetto(e.target.value)}
        />
        <div className="sm:col-span-2">
          <CampoArea
            etichetta="Messaggio"
            rows={4}
            placeholder="Ricordati di aggiungere il sale nel rapportino di oggi."
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
          />
        </div>
        <CampoSelect
          etichetta="Cantiere"
          suggerimento="Facoltativo"
          value={cantiere}
          onChange={(e) => setCantiere(e.target.value)}
        >
          <option value="">— nessuno —</option>
          {(cantieri ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.codice} {c.denominazione}
            </option>
          ))}
        </CampoSelect>
        <Campo
          etichetta="Giorno"
          type="date"
          suggerimento="Facoltativo"
          value={giorno}
          onChange={(e) => setGiorno(e.target.value)}
        />

        {(problema || apri.isError) && (
          <div className="sm:col-span-2">
            <Avviso tono="errore">{problema ?? (apri.error as Error).message}</Avviso>
          </div>
        )}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button variante="primario" disabled={apri.isPending} onClick={conferma}>
            {apri.isPending ? 'Invio…' : 'Invia il ticket'}
          </Button>
          <Button onClick={onChiudi} disabled={apri.isPending}>
            Annulla
          </Button>
        </div>
      </div>
    </Card>
  )
}
