import { useState } from 'react'
import { Avviso, Button, Campo, CampoSelect, Card } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { useDipendenti } from './dipendenti'
import type { TipoParco } from './parco'
import {
  nominativo,
  useConsegna,
  useConsegneParco,
  useEliminaConsegna,
  useRestituisci,
} from './consegneParco'

/* ══════════════════════════════════════════════════════════════════
   Il riquadro della consegna, nella scheda di un mezzo o di
   un'attrezzatura. Vedi `consegneParco.ts`.

   In testa la risposta alla domanda che si fa davvero — «chi ce l'ha?»
   — e il gesto che serve adesso: «Consegna a…» se e' in sede,
   «Restituito» se ce l'ha qualcuno. Sotto, lo storico.
   ══════════════════════════════════════════════════════════════════ */

const oggi = () => new Date().toLocaleDateString('sv-SE')

export function RiquadroConsegne({ tipo, voceId }: { tipo: TipoParco; voceId: string }) {
  const { data: consegne, isPending, error } = useConsegneParco(tipo, voceId)
  // Si consegna a chi e' in servizio oggi, come per le squadre.
  const { data: persone } = useDipendenti({ inServizioIl: oggi() })
  const consegna = useConsegna(tipo, voceId)
  const restituisci = useRestituisci(tipo)
  const elimina = useEliminaConsegna(tipo)

  const [modo, setModo] = useState<'consegna' | 'restituzione' | null>(null)
  const [persona, setPersona] = useState('')
  const [dal, setDal] = useState(oggi)
  const [note, setNote] = useState('')
  const [al, setAl] = useState(oggi)
  const [problema, setProblema] = useState<string | null>(null)

  const aperta = (consegne ?? []).find((c) => !c.restituito_il)
  const storico = (consegne ?? []).filter((c) => c.restituito_il)
  const cosa = tipo === 'mezzi' ? 'il mezzo' : 'l’attrezzatura'

  function chiudi() {
    setModo(null)
    setPersona('')
    setDal(oggi())
    setAl(oggi())
    setNote('')
    setProblema(null)
  }

  function confermaConsegna() {
    if (!persona) return setProblema('Scegli a chi lo consegni.')
    if (!dal) return setProblema('Serve la data di consegna.')
    consegna.mutate(
      { dipendente_id: persona, consegnato_il: dal, note: note.trim() || null },
      { onSuccess: chiudi },
    )
  }

  function confermaRestituzione() {
    if (!aperta) return
    if (!al) return setProblema('Serve la data di restituzione.')
    if (al < aperta.consegnato_il) return setProblema('La restituzione non può essere prima della consegna.')
    restituisci.mutate({ id: aperta.id, restituito_il: al }, { onSuccess: chiudi })
  }

  const errore = (consegna.error ?? restituisci.error ?? elimina.error) as Error | null

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">Consegna</h2>
          <p className="text-xs font-semibold text-gray-700">
            {isPending
              ? 'Carico…'
              : aperta
                ? `Ce l’ha ${nominativo(aperta.dipendente)} dal ${fmtData(aperta.consegnato_il)}.`
                : `In sede: ${cosa} non è consegnat${tipo === 'mezzi' ? 'o' : 'a'} a nessuno.`}
          </p>
        </div>
        {!isPending && !error && modo === null && (
          <Button
            dimensione="sm"
            variante="primario"
            onClick={() => setModo(aperta ? 'restituzione' : 'consegna')}
          >
            {aperta ? 'Restituito' : 'Consegna a…'}
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere le consegne: {error.message}</Avviso>
        </div>
      )}

      {modo === 'consegna' && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <CampoSelect
              etichetta="A chi"
              suggerimento="Le persone in servizio, dall’anagrafica"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="">— scegli —</option>
              {(persone ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cognome} {p.nome}
                </option>
              ))}
            </CampoSelect>
          </div>
          <Campo etichetta="Consegnato il" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          <div className="sm:col-span-3">
            <Campo
              etichetta="Note"
              placeholder="Con chiavi di scorta e carta carburante…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Azioni
            problema={problema ?? (consegna.isError ? errore?.message : null)}
            inCorso={consegna.isPending}
            etichetta="Consegna"
            onConferma={confermaConsegna}
            onAnnulla={chiudi}
          />
        </div>
      )}

      {modo === 'restituzione' && aperta && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5 sm:grid-cols-3">
          <p className="text-sm font-semibold text-gray-800 sm:col-span-2">
            {nominativo(aperta.dipendente)} riconsegna {cosa}, avuto il {fmtData(aperta.consegnato_il)}.
          </p>
          <Campo
            etichetta="Restituito il"
            type="date"
            min={aperta.consegnato_il}
            value={al}
            onChange={(e) => setAl(e.target.value)}
          />
          <Azioni
            problema={problema ?? (restituisci.isError ? errore?.message : null)}
            inCorso={restituisci.isPending}
            etichetta="Segna la restituzione"
            onConferma={confermaRestituzione}
            onAnnulla={chiudi}
          />
        </div>
      )}

      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">{errore?.message}</Avviso>
        </div>
      )}

      {/* La consegna in corso, con le sue note, e lo storico. La × e'
          per cio' che e' stato segnato per sbaglio: una consegna vera si
          chiude con la restituzione e resta qui. */}
      {(aperta || storico.length > 0) && (
        <ul className="divide-y-2 divide-black">
          {[...(aperta ? [aperta] : []), ...storico].map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-black">
                  {nominativo(c.dipendente)}
                  <span className="numerico ml-2 text-xs font-semibold text-gray-700">
                    dal {fmtData(c.consegnato_il)}
                    {c.restituito_il ? ` al ${fmtData(c.restituito_il)}` : ' · ce l’ha adesso'}
                  </span>
                </p>
                {c.note && <p className="mt-0.5 text-xs font-semibold text-gray-600">{c.note}</p>}
              </div>
              <Button
                dimensione="sm"
                variante="danger"
                disabled={elimina.isPending}
                aria-label="Elimina la consegna segnata per sbaglio"
                onClick={() => {
                  if (!confirm(`Eliminare la consegna a ${nominativo(c.dipendente)}? Serve solo se è stata segnata per sbaglio.`)) return
                  elimina.mutate(c.id)
                }}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Azioni({
  problema,
  inCorso,
  etichetta,
  onConferma,
  onAnnulla,
}: {
  problema: string | null | undefined
  inCorso: boolean
  etichetta: string
  onConferma: () => void
  onAnnulla: () => void
}) {
  return (
    <>
      {problema && (
        <div className="sm:col-span-3">
          <Avviso tono="errore">{problema}</Avviso>
        </div>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <Button variante="primario" dimensione="sm" disabled={inCorso} onClick={onConferma}>
          {inCorso ? 'Salvo…' : etichetta}
        </Button>
        <Button dimensione="sm" onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </Button>
      </div>
    </>
  )
}
