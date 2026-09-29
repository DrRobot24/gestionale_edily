import { useState } from 'react'
import { numero } from '../../lib/formato'
import { Avviso, Button, Campo, CampoArea, CampoSelect, Card } from '../../ui'
import {
  useAggiungiSubappalto,
  useImprese,
  useSubappaltiDelRapportino,
  useTogliSubappalto,
  type RigaSubappalto,
} from './subappalti'

/* ══════════════════════════════════════════════════════════════════
   IL SUBAPPALTO DELLA GIORNATA, nel rapportino. Dal 2026-09-29, al
   posto del segnaposto.

   Chi ha lavorato oggi qui oltre alla nostra squadra: l'impresa in
   subappalto — scelta fra i fornitori di tipo «Subappalto» — cosa ha
   fatto, quante persone, le ore, le note. Sta sotto la squadra perche'
   risponde alla stessa domanda, per le imprese che non sono la nostra.

   Persone e ore sono DELL'IMPRESA: non toccano le ore della squadra ne'
   le paghe.

   Si comporta come i lavori extra e i mezzi:

     scheda gia' salvata   la riga parte subito
     scheda nuova          resta in attesa e la scrive chi salva
   ══════════════════════════════════════════════════════════════════ */

type Props = {
  /** Presente solo su una scheda che esiste gia'. */
  rapportinoId?: string
  inAttesa: RigaSubappalto[]
  onCambia: (righe: RigaSubappalto[]) => void
  modificabile?: boolean
}

const VUOTA = { fornitore: '', lavorazione: '', persone: '', ore: '', note: '' }

export function RiquadroSubappalto({ rapportinoId, inAttesa, onCambia, modificabile = true }: Props) {
  // Anche le archiviate: una riga vecchia deve continuare a dire il nome.
  const { data: tutte } = useImprese({ tutte: true })
  const { data: salvate, error } = useSubappaltiDelRapportino(rapportinoId)
  const aggiungi = useAggiungiSubappalto(rapportinoId)
  const togli = useTogliSubappalto()

  const [apri, setApri] = useState(false)
  const [campi, setCampi] = useState(VUOTA)
  const [problema, setProblema] = useState<string | null>(null)

  const attive = (tutte ?? []).filter((i) => i.attivo)
  const nome = (id: string) => tutte?.find((i) => i.id === id)?.ragione_sociale ?? 'Impresa'
  const quante = (salvate?.length ?? 0) + inAttesa.length

  /* In sola lettura e senza righe il riquadro non c'e': sulla scheda
     validata un «nessun subappalto» su ogni giornata insegna a saltarlo. */
  if (!modificabile && quante === 0) return null

  function conferma() {
    if (!campi.fornitore) return setProblema('Scegli l’impresa.')
    if (campi.lavorazione.trim() === '') return setProblema('Scrivi cosa ha fatto l’impresa.')
    const persone = campi.persone.trim() === '' ? null : Number(campi.persone)
    const ore = campi.ore.trim() === '' ? null : Number(campi.ore.replace(',', '.'))
    if (persone !== null && !(Number.isInteger(persone) && persone >= 0 && persone <= 200))
      return setProblema('Le persone sono un numero intero, da 0 a 200.')
    if (ore !== null && !(ore >= 0 && ore <= 2000)) return setProblema('Le ore non tornano.')

    const riga: RigaSubappalto = {
      fornitore_id: campi.fornitore,
      lavorazione: campi.lavorazione.trim(),
      persone,
      ore,
      note: campi.note.trim() || null,
    }
    const chiudi = () => {
      setCampi(VUOTA)
      setProblema(null)
      setApri(false)
    }
    if (!rapportinoId) {
      onCambia([...inAttesa, riga])
      chiudi()
      return
    }
    aggiungi.mutate(riga, { onSuccess: chiudi })
  }

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Subappalto</h2>
          <p className="text-xs font-semibold text-gray-600">
            Le imprese esterne che hanno lavorato in questo cantiere oggi. Persone e ore sono le
            loro: non toccano quelle della squadra.
          </p>
        </div>
        {quante > 0 && (
          <p className="shrink-0 text-xs font-extrabold text-black">
            {quante} {quante === 1 ? 'impresa' : 'imprese'}
          </p>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere i subappalti: {error.message}</Avviso>}
      {togli.isError && <Avviso tono="errore">{(togli.error as Error).message}</Avviso>}

      {quante === 0 ? (
        <p className="text-xs font-semibold text-gray-500">Nessun subappalto in questa giornata.</p>
      ) : (
        <ul className="grid gap-2">
          {(salvate ?? []).map((s) => (
            <Riga
              key={s.id}
              nome={nome(s.fornitore_id)}
              riga={s}
              onTogli={modificabile ? () => togli.mutate(s.id) : undefined}
            />
          ))}
          {inAttesa.map((s, i) => (
            <Riga
              key={`attesa-${i}`}
              nome={nome(s.fornitore_id)}
              riga={s}
              inAttesa
              onTogli={() => onCambia(inAttesa.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      {modificabile && !apri && (
        <div>
          <Button dimensione="sm" onClick={() => setApri(true)}>
            + Segna un subappalto
          </Button>
        </div>
      )}

      {modificabile && apri && (
        <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
          {attive.length === 0 ? (
            <Avviso tono="info">
              Non ci sono imprese di subappalto in anagrafica. Le inserisce l&rsquo;amministrazione
              fra i Fornitori, con il tipo «Subappalto».
            </Avviso>
          ) : (
            <>
              <CampoSelect
                etichetta="Impresa"
                value={campi.fornitore}
                onChange={(e) => setCampi((c) => ({ ...c, fornitore: e.target.value }))}
              >
                <option value="">— scegli —</option>
                {attive.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.ragione_sociale}
                  </option>
                ))}
              </CampoSelect>
              <CampoArea
                etichetta="Cosa ha fatto"
                rows={3}
                placeholder="Posa cartongesso al piano secondo, lato nord."
                value={campi.lavorazione}
                onChange={(e) => setCampi((c) => ({ ...c, lavorazione: e.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  etichetta="Quante persone"
                  type="number"
                  min="0"
                  step="1"
                  className="numerico"
                  suggerimento="Facoltativo"
                  value={campi.persone}
                  onChange={(e) => setCampi((c) => ({ ...c, persone: e.target.value }))}
                />
                <Campo
                  etichetta="Ore in tutto"
                  type="number"
                  min="0"
                  step="0.5"
                  className="numerico"
                  suggerimento="Facoltativo: la somma di tutte le persone"
                  value={campi.ore}
                  onChange={(e) => setCampi((c) => ({ ...c, ore: e.target.value }))}
                />
              </div>
              <CampoArea
                etichetta="Note"
                rows={2}
                placeholder="Ritardi, problemi, materiale loro o nostro…"
                value={campi.note}
                onChange={(e) => setCampi((c) => ({ ...c, note: e.target.value }))}
              />
            </>
          )}

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}

          <div className="flex flex-wrap gap-2">
            {attive.length > 0 && (
              <Button variante="primario" dimensione="sm" disabled={aggiungi.isPending} onClick={conferma}>
                {aggiungi.isPending ? 'Salvo…' : 'Aggiungi'}
              </Button>
            )}
            <Button
              dimensione="sm"
              onClick={() => {
                setApri(false)
                setProblema(null)
              }}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Riga({
  nome,
  riga,
  inAttesa = false,
  onTogli,
}: {
  nome: string
  riga: RigaSubappalto
  inAttesa?: boolean
  onTogli?: () => void
}) {
  const quanto = [
    riga.persone !== null && `${riga.persone} ${riga.persone === 1 ? 'persona' : 'persone'}`,
    riga.ore !== null && `${numero(riga.ore)} h`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className={
        inAttesa
          ? 'rounded-xl border-2 border-dashed border-black bg-amber-50 p-3'
          : 'rounded-xl border-2 border-black bg-white p-3'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase text-black">
            {nome}
            {quanto && <span className="ml-2 text-xs font-bold normal-case text-gray-600">{quanto}</span>}
          </p>
          <p className="whitespace-pre-wrap text-sm font-semibold text-black">{riga.lavorazione}</p>
          {riga.note && <p className="text-xs font-semibold text-gray-600">{riga.note}</p>}
        </div>
        {onTogli && (
          <button
            type="button"
            onClick={onTogli}
            aria-label={`Togli il subappalto di ${nome}`}
            title="Togli"
            className="neo-press h-7 w-7 cursor-pointer rounded-lg border-2 border-black bg-white text-sm font-extrabold leading-none hover:bg-rose-200"
          >
            ×
          </button>
        )}
      </div>
    </li>
  )
}
