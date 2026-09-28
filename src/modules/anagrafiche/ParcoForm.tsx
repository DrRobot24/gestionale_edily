import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Avviso, Badge, Button, Campo, CampoArea, CampoSelect, Card, Percorso } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useFornitori } from './fornitori'
import {
  PARCO,
  useArchiviaParco,
  useEliminaParco,
  useSalvaParco,
  useVoceParco,
  type TipoParco,
} from './parco'

/** La scheda di un mezzo o di un'attrezzatura. I campi li decide
 *  `PARCO[tipo].campi`: e' l'unico posto dove le due differiscono. */
export function ParcoForm({ tipo }: { tipo: TipoParco }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')
  const conf = PARCO[tipo]

  const { data: voce, isPending, error } = useVoceParco(tipo, id)
  const { data: fornitori } = useFornitori()
  const salva = useSalvaParco(tipo)
  const archivia = useArchiviaParco(tipo)
  const elimina = useEliminaParco(tipo)

  const [valori, setValori] = useState<Record<string, string>>({ proprieta: 'propria' })
  const [toccato, setToccato] = useState(false)
  const [problema, setProblema] = useState<string | null>(null)

  useEffect(() => {
    if (!voce) return
    const v: Record<string, string> = {}
    for (const c of conf.campi) v[c.nome] = (voce[c.nome] as string | null) ?? ''
    if (!v.proprieta) v.proprieta = 'propria'
    setValori(v)
  }, [voce, conf.campi])

  if (!nuovo && isPending) return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  if (error) return <Avviso tono="errore">Non trovo questa scheda: {error.message}</Avviso>

  const cambia = (nome: string, valore: string) => {
    setValori((v) => ({ ...v, [nome]: valore }))
    setToccato(true)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!(valori.descrizione ?? '').trim()) return setProblema('Serve la descrizione.')
    setProblema(null)
    const dati: Record<string, string | null> = {}
    for (const c of conf.campi) {
      const v = (valori[c.nome] ?? '').trim()
      dati[c.nome] = v === '' ? null : c.nome === 'targa' ? v.toUpperCase().replace(/\s+/g, '') : v
    }
    // Il fornitore ha senso solo a noleggio.
    if (dati.proprieta !== 'noleggio') dati.fornitore_id = null
    await salva.mutateAsync({ id, dati })
    navigate(conf.percorso)
  }

  const noleggio = valori.proprieta === 'noleggio'
  const titolo = nuovo ? `Nuovo ${conf.singolare}` : (voce?.descrizione ?? '—')

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Percorso
        indietro={{ etichetta: conf.titolo, a: conf.percorso }}
        qui={[{ etichetta: nuovo ? 'Nuovo' : (voce?.descrizione ?? '—') }]}
      />

      <div>
        <h1 className="text-2xl font-extrabold text-black">{titolo}</h1>
        {!nuovo && voce && !voce.attivo && (
          <Badge className="mt-1">archiviato — non compare nella tendina del rapportino</Badge>
        )}
      </div>

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          {conf.campi.map((c) => {
            if (c.tipo === 'fornitore' && !noleggio) return null
            const comune = {
              etichetta: c.etichetta,
              disabled: !puoScrivere,
              value: valori[c.nome] ?? '',
            }
            if (c.tipo === 'proprieta') {
              return (
                <CampoSelect key={c.nome} {...comune} onChange={(e) => cambia(c.nome, e.target.value)}>
                  <option value="propria">Propria</option>
                  <option value="noleggio">A noleggio</option>
                </CampoSelect>
              )
            }
            if (c.tipo === 'fornitore') {
              return (
                <CampoSelect key={c.nome} {...comune} onChange={(e) => cambia(c.nome, e.target.value)}>
                  <option value="">— nessuno —</option>
                  {(fornitori ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.ragione_sociale}
                    </option>
                  ))}
                </CampoSelect>
              )
            }
            if (c.tipo === 'area') {
              return (
                <div key={c.nome} className="sm:col-span-2">
                  <CampoArea {...comune} onChange={(e) => cambia(c.nome, e.target.value)} />
                </div>
              )
            }
            return (
              <div key={c.nome} className={c.nome === 'descrizione' ? 'sm:col-span-2' : undefined}>
                <Campo
                  {...comune}
                  type={c.tipo === 'data' ? 'date' : 'text'}
                  placeholder={c.segnaposto}
                  suggerimento={c.suggerimento}
                  className={c.nome === 'targa' || c.nome === 'codice' ? 'numerico uppercase' : undefined}
                  onChange={(e) => cambia(c.nome, e.target.value)}
                />
              </div>
            )
          })}
        </Card>

        {puoScrivere && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variante="primario" disabled={salva.isPending || !toccato}>
              {salva.isPending ? 'Salvo…' : nuovo ? `Crea ${conf.singolare}` : 'Salva modifiche'}
            </Button>
            {!nuovo && voce && (
              <>
                <Button
                  onClick={() => archivia.mutate({ id: id!, attivo: !voce.attivo })}
                  disabled={archivia.isPending}
                >
                  {voce.attivo ? 'Archivia' : 'Riattiva'}
                </Button>
                <Button
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (!confirm(`Eliminare definitivamente questo ${conf.singolare}?`)) return
                    elimina.mutate(id!, { onSuccess: () => navigate(conf.percorso) })
                  }}
                >
                  Elimina
                </Button>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
