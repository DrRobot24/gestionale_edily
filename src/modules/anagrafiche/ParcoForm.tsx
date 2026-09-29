import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Avviso, Badge, Button, Campo, CampoArea, CampoSelect, Card, Percorso } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { RiquadroDocumenti } from '../documenti/RiquadroDocumenti'
import { useFornitori } from './fornitori'
import { RiquadroSpese } from './RiquadroSpese'
import {
  PARCO,
  campiDi,
  useArchiviaParco,
  useEliminaParco,
  useSalvaParco,
  useVoceParco,
  type Campo as CampoParco,
  type TipoParco,
} from './parco'

/** La scheda di un mezzo o di un'attrezzatura. I campi li decide
 *  `PARCO[tipo].sezioni`: e' l'unico posto dove le due differiscono. */
export function ParcoForm({ tipo }: { tipo: TipoParco }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuovo = !id
  const puoScrivere = usePermission('anagrafiche.write')
  const conf = PARCO[tipo]
  const campi = campiDi(tipo)

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
    for (const c of campiDi(tipo)) {
      const x = voce[c.nome]
      v[c.nome] =
        x === null || x === undefined ? '' : c.tipo === 'euro' ? String(x).replace('.', ',') : String(x)
    }
    if (!v.proprieta) v.proprieta = 'propria'
    setValori(v)
    setToccato(false)
  }, [voce, tipo])

  if (!nuovo && isPending) return <p className="text-sm font-bold text-gray-600">Carico la scheda…</p>
  if (error) return <Avviso tono="errore">Non trovo questa scheda: {error.message}</Avviso>

  const cambia = (nome: string, valore: string) => {
    setValori((v) => ({ ...v, [nome]: valore }))
    setToccato(true)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!(valori.descrizione ?? '').trim()) return setProblema('Serve la descrizione.')
    const dati: Record<string, string | number | null> = {}
    for (const c of campi) {
      const v = (valori[c.nome] ?? '').trim()
      if (v === '') dati[c.nome] = null
      else if (c.tipo === 'euro') {
        const n = Number(v.replace(',', '.'))
        if (!Number.isFinite(n) || n < 0)
          return setProblema(`«${c.etichetta}»: scrivi un importo, per esempio 1200,00.`)
        dati[c.nome] = n
      } else
        dati[c.nome] =
          c.nome === 'targa' || c.nome === 'telaio' ? v.toUpperCase().replace(/\s+/g, '') : v
    }
    setProblema(null)
    // Il fornitore ha senso solo a noleggio.
    if (dati.proprieta !== 'noleggio') dati.fornitore_id = null
    const salvato = await salva.mutateAsync({ id, dati })
    /* Una scheda NUOVA resta aperta dopo il salvataggio, dal
       2026-09-29: e' li' sotto che si aprono documenti e spese, che
       hanno bisogno di sapere a chi appartengono. Tornare all'elenco
       voleva dire cercarla e riaprirla per caricarci il libretto. */
    if (nuovo) navigate(`${conf.percorso}/${salvato}`, { replace: true })
    else navigate(conf.percorso)
  }

  const noleggio = valori.proprieta === 'noleggio'
  const titolo = nuovo ? `Nuovo ${conf.singolare}` : (voce?.descrizione ?? '—')

  function controllo(c: CampoParco) {
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
          <CampoArea {...comune} rows={3} onChange={(e) => cambia(c.nome, e.target.value)} />
        </div>
      )
    }
    return (
      <div key={c.nome} className={c.largo ? 'sm:col-span-2' : undefined}>
        <Campo
          {...comune}
          type={c.tipo === 'data' ? 'date' : 'text'}
          inputMode={c.tipo === 'euro' ? 'decimal' : undefined}
          placeholder={c.segnaposto}
          suggerimento={c.suggerimento}
          className={
            c.nome === 'targa' || c.nome === 'codice' || c.nome === 'telaio'
              ? 'numerico uppercase'
              : c.tipo === 'euro'
                ? 'numerico'
                : undefined
          }
          onChange={(e) => cambia(c.nome, e.target.value)}
        />
      </div>
    )
  }

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
        {conf.sezioni.map((sezione) => (
          <Card key={sezione.titolo} className="overflow-hidden">
            <h2 className="border-b-2 border-black bg-amber-100 px-5 py-2 text-sm font-extrabold uppercase tracking-wide text-black">
              {sezione.titolo}
            </h2>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {sezione.campi.map((c) => controllo(c))}
            </div>
          </Card>
        ))}

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

      {/* I DOCUMENTI del mezzo o dell'attrezzatura (2026-09-29): libretto,
          assicurazione, verifiche, manuali — «una cosa importantissima»
          (utente). Fuori dal <form>, coi suoi salvataggi; solo su una
          scheda gia' salvata, perche' un documento ha bisogno di sapere
          a chi appartiene. Sulla scheda nuova lo si DICE, invece di
          lasciar credere che non ci siano: «Crea» porta dritto qui. */}
      {!nuovo && id ? (
        <>
          <RiquadroDocumenti
            ambito={tipo === 'mezzi' ? 'mezzo' : 'attrezzatura'}
            riferimentoId={id}
            puoScrivere={puoScrivere}
          />
          {/* Le SPESE sono soldi: solo a chi tiene i registri, come la
              policy (`parco-schede-spese.sql`). */}
          {puoScrivere && <RiquadroSpese tipo={tipo} voceId={id} />}
        </>
      ) : (
        <Card className="border-dashed bg-amber-50 p-5">
          <p className="text-sm font-extrabold text-black">Documenti e spese</p>
          <p className="mt-1 text-xs font-semibold text-gray-700">
            Libretto, certificato di proprietà, polizza, verifiche INAIL (ex ISPESL) e le spese si
            aggiungono appena {tipo === 'mezzi' ? 'il mezzo è creato' : 'l’attrezzatura è creata'}:
            premi «Crea {conf.singolare}» e la scheda resta aperta, con i riquadri qui sotto.
          </p>
        </Card>
      )}
    </div>
  )
}
