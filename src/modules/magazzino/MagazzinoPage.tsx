import { useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, Input, Table, Vuoto, cn } from '../../ui'
import { data as fmtData, numero as fmtNumero } from '../../lib/formato'
import { usePermission } from '../auth/usePermission'
import { useCantieri } from '../cantieri/useCantieri'
import { oggi } from '../rapportini/campiRapportino'
import {
  cercaFra,
  sottoScorta,
  useGiacenze,
  useMovimenti,
  useNuovoMateriale,
  useRegistraMovimento,
  type DatiMateriale,
  type Giacenza,
} from './magazzino'

/* ══════════════════════════════════════════════════════════════════
   Il magazzino.

   Una pagina sola che risponde a tre domande, in quest'ordine:

     cosa sta finendo   in cima, e solo se c'e' qualcosa sotto scorta
     cosa c'e'          la tabella, con la ricerca
     come ci e' arrivato  aprendo una riga, gli ultimi movimenti

   L'ordine non e' casuale. Un elenco di giacenze lo si guarda quando si
   ha gia' una domanda; l'avviso di cio' che sta finendo serve a chi una
   domanda non ce l'ha ancora, ed e' l'unico modo perche' il magazzino
   sia utile a chi lo apre di sfuggita.

   La giacenza non si scrive: si registra un carico o uno scarico, e la
   somma la fa il database. Un movimento sbagliato si compensa con quello
   opposto — un magazzino in cui si puo' riscrivere il passato non e' un
   magazzino, e' un foglio di appunti.
   ══════════════════════════════════════════════════════════════════ */

export function MagazzinoPage() {
  const puoTenereIlRegistro = usePermission('anagrafiche.write')
  const puoScaricare = usePermission('rapportini.create')
  const puoMuovere = puoTenereIlRegistro || puoScaricare

  const { data: righe, isPending, error } = useGiacenze()

  const [cerca, setCerca] = useState('')
  const [aperto, setAperto] = useState<string | null>(null)
  const [movimento, setMovimento] = useState<{ g: Giacenza; tipo: 'carico' | 'scarico' } | null>(
    null,
  )
  const [nuovo, setNuovo] = useState(false)

  if (error) {
    return <Avviso tono="errore">Non riesco a leggere il magazzino: {error.message}</Avviso>
  }

  const tutte = righe ?? []
  const attive = tutte.filter((g) => g.attivo)
  const viste = cercaFra(attive, cerca)
  const inAllarme = attive.filter(sottoScorta)

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Magazzino</h1>
          <p className="text-sm font-semibold text-gray-600">
            Quello che c&rsquo;è, e come ci è arrivato. La giacenza non si scrive a mano: si
            registra un carico o uno scarico.
          </p>
        </div>
        {puoTenereIlRegistro && !nuovo && (
          <Button variante="primario" onClick={() => setNuovo(true)}>
            Nuovo materiale
          </Button>
        )}
      </div>

      {nuovo && <FormMateriale onChiudi={() => setNuovo(false)} />}

      {/* Cio' che sta finendo, in cima e solo quando c'e'. Un riquadro
          che compare sempre lo si smette di leggere. */}
      {inAllarme.length > 0 && (
        <Card className="grid gap-2 bg-rose-100 p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Sotto scorta — {inAllarme.length}{' '}
            {inAllarme.length === 1 ? 'materiale' : 'materiali'}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {inAllarme.map((g) => (
              <li key={g.materiale_id}>
                <Badge className="bg-white px-3 py-1 text-xs normal-case">
                  {g.descrizione} · <strong>{fmtNumero(g.giacenza)}</strong> {g.unita_misura}{' '}
                  <span className="text-gray-600">
                    (minimo {fmtNumero(g.scorta_minima)})
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {movimento && (
        <FormMovimento
          giacenza={movimento.g}
          tipo={movimento.tipo}
          onChiudi={() => setMovimento(null)}
        />
      )}

      <Card className="p-3">
        <Input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un materiale: descrizione, codice o dove sta"
          className="py-2 text-sm"
        />
      </Card>

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico il magazzino…</p>
      ) : attive.length === 0 ? (
        <Vuoto>
          Il magazzino è vuoto. {puoTenereIlRegistro
            ? 'Comincia creando un materiale, poi registra il primo carico.'
            : 'I materiali li mette in elenco chi tiene l’anagrafica.'}
        </Vuoto>
      ) : viste.length === 0 ? (
        <Vuoto>Nessun materiale corrisponde a quello che hai cercato.</Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Codice</th>
              <th>Materiale</th>
              <th>Dove</th>
              <th className="text-right">Giacenza</th>
              <th>Ultimo mov.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {viste.map((g) => {
              const allarme = sottoScorta(g)
              return (
                <tr key={g.materiale_id} className={allarme ? 'bg-rose-50' : undefined}>
                  <td className="numerico text-gray-600">{g.codice ?? '—'}</td>
                  <td className="font-semibold">
                    {g.descrizione}
                    {aperto === g.materiale_id && <Storico materialeId={g.materiale_id} />}
                  </td>
                  <td className="text-gray-600">{g.ubicazione ?? '—'}</td>
                  <td
                    className={cn(
                      'numerico text-right font-extrabold',
                      allarme ? 'text-rose-700' : 'text-black',
                    )}
                  >
                    {fmtNumero(g.giacenza)} <span className="font-bold">{g.unita_misura}</span>
                  </td>
                  <td className="numerico text-gray-600">{fmtData(g.ultimo_movimento)}</td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {puoTenereIlRegistro && (
                        <Button
                          dimensione="sm"
                          onClick={() => setMovimento({ g, tipo: 'carico' })}
                        >
                          + Carico
                        </Button>
                      )}
                      {puoMuovere && (
                        <Button
                          dimensione="sm"
                          onClick={() => setMovimento({ g, tipo: 'scarico' })}
                        >
                          − Scarico
                        </Button>
                      )}
                      <Button
                        dimensione="sm"
                        onClick={() =>
                          setAperto((v) => (v === g.materiale_id ? null : g.materiale_id))
                        }
                      >
                        {aperto === g.materiale_id ? 'Chiudi' : 'Storico'}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </div>
  )
}

/* ── lo storico di un materiale ────────────────────────────────── */

function Storico({ materialeId }: { materialeId: string }) {
  const { data: movimenti, isPending } = useMovimenti(materialeId)

  if (isPending) {
    return <p className="mt-2 text-xs font-bold text-gray-600">Carico i movimenti…</p>
  }
  if (!movimenti || movimenti.length === 0) {
    return (
      <p className="mt-2 text-xs font-semibold text-gray-500">
        Nessun movimento: questo materiale è in anagrafica ma non è mai entrato.
      </p>
    )
  }

  return (
    <ul className="mt-2 grid gap-1 border-l-2 border-gray-300 pl-3">
      {movimenti.map((m) => (
        <li key={m.id} className="text-xs font-semibold text-gray-600">
          <span className="numerico">{fmtData(m.data)}</span>{' '}
          <span className={m.tipo === 'carico' ? 'text-lime-700' : 'text-rose-700'}>
            {m.tipo === 'carico' ? '+' : '−'}
            {fmtNumero(m.quantita)}
          </span>
          {m.cantiere && ` → ${m.cantiere.codice}`}
          {m.riferimento && ` · ${m.riferimento}`}
          {m.note && ` · ${m.note}`}
        </li>
      ))}
    </ul>
  )
}

/* ── registrare un movimento ───────────────────────────────────── */

function FormMovimento({
  giacenza,
  tipo,
  onChiudi,
}: {
  giacenza: Giacenza
  tipo: 'carico' | 'scarico'
  onChiudi: () => void
}) {
  const registra = useRegistraMovimento()
  const { data: cantieri } = useCantieri()

  const [data, setData] = useState(oggi())
  const [quantita, setQuantita] = useState(0)
  const [cantiere, setCantiere] = useState('')
  const [riferimento, setRiferimento] = useState('')
  const [note, setNote] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const carico = tipo === 'carico'

  function conferma() {
    if (!(quantita > 0)) {
      setProblema('Quanto? Un movimento da zero non è un movimento.')
      return
    }
    registra.mutate(
      {
        materiale_id: giacenza.materiale_id,
        data,
        tipo,
        quantita,
        // Il carico viene dal fornitore, non da un cantiere: il database
        // ha un vincolo che lo impone, e mandarglielo comunque sarebbe
        // farsi respingere con un 23514 invece che con una frase.
        cantiere_id: carico ? null : cantiere || null,
        riferimento: riferimento.trim() || null,
        note: note.trim() || null,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <Card className={cn('grid gap-3 p-5', carico ? 'bg-lime-100' : 'bg-amber-50')}>
      <div>
        <h2 className="text-lg font-extrabold text-black">
          {carico ? 'Carico' : 'Scarico'} — {giacenza.descrizione}
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          Adesso in magazzino: {fmtNumero(giacenza.giacenza)} {giacenza.unita_misura}.{' '}
          {carico
            ? 'Il carico è quello che arriva dal fornitore.'
            : 'Lo scarico è quello che esce, di solito verso un cantiere.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etichetta="Giorno" type="date" max={oggi()} value={data} onChange={(e) => setData(e.target.value)} />
        <Campo
          etichetta={`Quantità (${giacenza.unita_misura})`}
          type="number"
          min={0}
          step={0.001}
          inputMode="decimal"
          className="numerico"
          value={quantita}
          onChange={(e) => setQuantita(Number(e.target.value))}
        />
        {carico ? (
          <Campo
            etichetta="DDT o bolla"
            placeholder="n. 1234"
            value={riferimento}
            onChange={(e) => setRiferimento(e.target.value)}
          />
        ) : (
          <CampoSelect
            etichetta="Su quale cantiere"
            value={cantiere}
            onChange={(e) => setCantiere(e.target.value)}
          >
            <option value="">— nessuno in particolare —</option>
            {(cantieri ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.codice} — {c.denominazione}
              </option>
            ))}
          </CampoSelect>
        )}
      </div>

      <Campo
        etichetta="Note"
        placeholder={carico ? 'Fornitore, ordine, stato della merce.' : 'Chi l’ha preso, a cosa serviva.'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {registra.isError && <Avviso tono="errore">{(registra.error as Error).message}</Avviso>}

      <div className="flex flex-wrap gap-2">
        <Button variante="primario" disabled={registra.isPending} onClick={conferma}>
          {registra.isPending ? 'Registro…' : carico ? 'Registra il carico' : 'Registra lo scarico'}
        </Button>
        <Button onClick={onChiudi}>Annulla</Button>
      </div>

      <p className="text-[11px] font-semibold text-gray-600">
        I movimenti non si correggono: uno sbagliato si compensa con quello opposto, così resta
        scritto cosa è successo.
      </p>
    </Card>
  )
}

/* ── un materiale nuovo in anagrafica ──────────────────────────── */

const MATERIALE_VUOTO: DatiMateriale = {
  codice: null,
  descrizione: '',
  unita_misura: 'pz',
  ubicazione: null,
  scorta_minima: null,
}

function FormMateriale({ onChiudi }: { onChiudi: () => void }) {
  const crea = useNuovoMateriale()
  const [c, setC] = useState<DatiMateriale>(MATERIALE_VUOTO)
  const [problema, setProblema] = useState<string | null>(null)

  function conferma() {
    if (c.descrizione.trim() === '') {
      setProblema('Serve una descrizione: è come lo chiamate in cantiere.')
      return
    }
    if (c.unita_misura.trim() === '') {
      setProblema('Serve l’unità di misura: sacchi, metri, pezzi.')
      return
    }
    crea.mutate(
      {
        ...c,
        codice: c.codice?.trim() || null,
        descrizione: c.descrizione.trim(),
        unita_misura: c.unita_misura.trim(),
        ubicazione: c.ubicazione?.trim() || null,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <Card className="grid gap-3 bg-amber-50 p-5">
      <h2 className="text-lg font-extrabold text-black">Nuovo materiale</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etichetta="Descrizione"
          placeholder="Cemento 32.5 R — sacco 25 kg"
          value={c.descrizione}
          onChange={(e) => setC((v) => ({ ...v, descrizione: e.target.value }))}
        />
        <Campo
          etichetta="Codice"
          suggerimento="Facoltativo, ma è quello che si cerca più in fretta."
          value={c.codice ?? ''}
          onChange={(e) => setC((v) => ({ ...v, codice: e.target.value }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          etichetta="Unità di misura"
          placeholder="sacchi, m, pz"
          value={c.unita_misura}
          onChange={(e) => setC((v) => ({ ...v, unita_misura: e.target.value }))}
        />
        <Campo
          etichetta="Dove sta"
          placeholder="Scaffale B3"
          value={c.ubicazione ?? ''}
          onChange={(e) => setC((v) => ({ ...v, ubicazione: e.target.value }))}
        />
        <Campo
          etichetta="Scorta minima"
          type="number"
          min={0}
          step={0.001}
          inputMode="decimal"
          className="numerico"
          suggerimento="Sotto questa quantità il magazzino lo segnala. Vuoto = nessun avviso."
          value={c.scorta_minima ?? ''}
          onChange={(e) =>
            setC((v) => ({
              ...v,
              scorta_minima: e.target.value === '' ? null : Number(e.target.value),
            }))
          }
        />
      </div>

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {crea.isError && <Avviso tono="errore">{(crea.error as Error).message}</Avviso>}

      <div className="flex flex-wrap gap-2">
        <Button variante="primario" disabled={crea.isPending} onClick={conferma}>
          {crea.isPending ? 'Creo…' : 'Crea il materiale'}
        </Button>
        <Button onClick={onChiudi}>Annulla</Button>
      </div>

      <p className="text-[11px] font-semibold text-gray-600">
        Il materiale nasce a giacenza zero: la quantità arriva col primo carico, non da qui.
      </p>
    </Card>
  )
}
