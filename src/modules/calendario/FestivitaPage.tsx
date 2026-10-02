import { useState } from 'react'
import { Avviso, Button, Card, Campo, CampoSelect, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import { eFineSettimana, festivita, type Patrono } from '../../lib/giorni'
import { usePatrono, useSalvaPatrono } from './calendario'

/* ══════════════════════════════════════════════════════════════════
   FESTIVITA', dal 2026-10-02.

   Il posto dove si scrive il santo patrono dell'impresa — deciso con
   l'utente: una data per impresa, la scrive chi tiene le anagrafiche —
   e dove si VEDE cosa il programma considera giorno di festa. Senza
   l'elenco, chi si chiede perche' il 6 aprile il calendario e' grigio
   non avrebbe un posto dove trovare la risposta.

   Le festivita' nazionali non si scrivono: sono calcolate
   (`lib/giorni.ts`), Pasquetta compresa.
   ══════════════════════════════════════════════════════════════════ */

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

const due = (n: number) => String(n).padStart(2, '0')

export function FestivitaPage() {
  const { data: patrono, isPending } = usePatrono()

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">Festività</h1>
        <p className="text-sm font-semibold text-gray-600">
          I giorni in cui non si lavora: sabato, domenica, le festività nazionali e il santo
          patrono dell&rsquo;impresa. In questi giorni il programma non aspetta rapportini, e
          non li conta per la tariffa della paga globale.
        </p>
      </div>

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico il calendario…</p>
      ) : (
        /* La chiave rimonta il modulo quando il patrono salvato cambia:
           i campi ripartono da cio' che c'e' nel database. */
        <SantoPatrono key={patrono ? `${patrono.giorno}|${patrono.nome}` : 'nessuno'} patrono={patrono ?? null} />
      )}

      <ElencoDellAnno patrono={patrono ?? null} />
    </div>
  )
}

function SantoPatrono({ patrono }: { patrono: Patrono | null }) {
  const salva = useSalvaPatrono()
  const [mese, setMese] = useState(patrono ? patrono.giorno.slice(0, 2) : '')
  const [giorno, setGiorno] = useState(patrono ? patrono.giorno.slice(3) : '')
  const [nome, setNome] = useState(patrono?.nome ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  function conferma() {
    setProblema(null)
    if (!mese || !giorno) {
      setProblema('Scegli il giorno e il mese.')
      return
    }
    // Il 31 aprile non esiste: la data deve tornare uguale.
    const d = new Date(2000, Number(mese) - 1, Number(giorno))
    if (d.getMonth() !== Number(mese) - 1) {
      setProblema(`Il ${Number(giorno)} ${MESI[Number(mese) - 1]} non esiste.`)
      return
    }
    salva.mutate({ giorno: `${mese}-${giorno}`, nome: nome.trim() || null })
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-200 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Santo patrono
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          {patrono
            ? `${patrono.nome?.trim() || 'Santo patrono'}, il ${Number(patrono.giorno.slice(3))} ${MESI[Number(patrono.giorno.slice(0, 2)) - 1]}: vale per tutti i cantieri.`
            : 'Non è ancora scritto. Vale per tutti i cantieri dell’impresa.'}
        </p>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[6rem_10rem_1fr]">
          <CampoSelect etichetta="Giorno" value={giorno} onChange={(e) => setGiorno(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={due(i + 1)}>
                {i + 1}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect etichetta="Mese" value={mese} onChange={(e) => setMese(e.target.value)}>
            <option value="">—</option>
            {MESI.map((m, i) => (
              <option key={m} value={due(i + 1)}>
                {m}
              </option>
            ))}
          </CampoSelect>
          <Campo
            etichetta="Nome del santo"
            suggerimento="Facoltativo: compare nei calendari al posto di «Santo patrono»."
            placeholder="San Gennaro"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        {problema && <Avviso tono="errore">{problema}</Avviso>}
        {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
        {salva.isSuccess && <Avviso tono="successo">Salvato.</Avviso>}

        <div className="flex flex-wrap gap-2">
          <Button variante="primario" disabled={salva.isPending} onClick={conferma}>
            Salva
          </Button>
          {patrono && (
            <Button disabled={salva.isPending} onClick={() => salva.mutate(null)}>
              Togli il patrono
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Le feste di un anno, una riga per festa. Quelle che cadono di sabato
 *  o domenica si dicono ma si spengono: quel giorno non si lavorava
 *  comunque. */
function ElencoDellAnno({ patrono }: { patrono: Patrono | null }) {
  const [anno, setAnno] = useState(new Date().getFullYear())

  const feste: { iso: string; nome: string }[] = []
  for (let m = 1; m <= 12; m++) {
    for (let g = 1; g <= 31; g++) {
      const d = new Date(anno, m - 1, g)
      if (d.getMonth() !== m - 1) break
      const iso = `${anno}-${due(m)}-${due(g)}`
      const nome = festivita(iso, patrono)
      if (nome) feste.push({ iso, nome })
    }
  }
  const infrasettimanali = feste.filter((f) => !eFineSettimana(f.iso)).length

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-sky-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Le feste del {anno}
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            {infrasettimanali} {infrasettimanali === 1 ? 'cade' : 'cadono'} in un giorno
            feriale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button dimensione="sm" onClick={() => setAnno(anno - 1)} aria-label="Anno precedente">
            ‹
          </Button>
          <Button dimensione="sm" onClick={() => setAnno(anno + 1)} aria-label="Anno successivo">
            ›
          </Button>
        </div>
      </div>

      <ul className="divide-y-2 divide-black/10">
        {feste.map((f) => {
          const spenta = eFineSettimana(f.iso)
          return (
            <li
              key={f.iso}
              className={cn(
                'flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2',
                spenta && 'text-gray-400',
              )}
            >
              <span className={cn('text-sm font-extrabold', !spenta && 'text-black')}>
                {f.nome}
              </span>
              <span className="text-xs font-bold">
                {dataEstesa(f.iso)}
                {spenta && ' · già festivo'}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
