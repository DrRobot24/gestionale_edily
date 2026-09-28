import { useState } from 'react'
import { Avviso, Button, Campo, CampoSelect, Card, cn } from '../../ui'
import { numero } from '../../lib/formato'
import {
  useAggiungiUso,
  useSceltePerRapportino,
  useTogliUso,
  useUsiDelRapportino,
  type RigaUso,
} from './mezziAttrezzature'

/* ══════════════════════════════════════════════════════════════════
   MEZZI E ATTREZZATURE — il piccolo box del rapportino. Dal 2026-09-28.

   Cosa si e' usato oggi in questo cantiere: il camion, il demolitore,
   il trabattello. Una riga per cosa, con le ore di utilizzo e, per i
   mezzi, i km. Tutto facoltativo tranne la scelta: «c'era il
   demolitore» e' gia' un'informazione.

   Si comporta come i lavori extra e le foto:

     scheda gia' salvata   la riga parte subito
     scheda nuova          resta in attesa e la scrive chi salva

   perche' su una scheda nuova cantiere e giorno si possono ancora
   cambiare.
   ══════════════════════════════════════════════════════════════════ */

type Props = {
  /** Presente solo su una scheda che esiste gia'. */
  rapportinoId?: string
  inAttesa: RigaUso[]
  onCambia: (righe: RigaUso[]) => void
  modificabile?: boolean
}

export function RiquadroMezzi({ rapportinoId, inAttesa, onCambia, modificabile = true }: Props) {
  const { data: scelte, error: erroreScelte } = useSceltePerRapportino()
  const { data: salvate, error: erroreRighe } = useUsiDelRapportino(rapportinoId)
  const aggiungi = useAggiungiUso(rapportinoId)
  const togli = useTogliUso(rapportinoId)

  const [scelta, setScelta] = useState('')
  const [ore, setOre] = useState('')
  const [km, setKm] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const etichettaDi = (tipo: string, id: string) =>
    scelte?.find((s) => s.tipo === tipo && s.id === id)?.etichetta ?? tipo

  // Una cosa gia' in lista non si ripropone nell'elenco.
  const presi = new Set([
    ...(salvate ?? []).map((r) => `${r.tipo}:${r.risorsaId}`),
    ...inAttesa.map((r) => `${r.tipo}:${r.risorsaId}`),
  ])
  const disponibili = (scelte ?? []).filter((s) => !presi.has(`${s.tipo}:${s.id}`))
  const mezzi = disponibili.filter((s) => s.tipo === 'mezzo')
  const attrezzi = disponibili.filter((s) => s.tipo === 'attrezzatura')
  const eMezzo = scelta.startsWith('mezzo:')

  function conferma() {
    if (!scelta) return setProblema('Scegli cosa è stato usato.')
    const o = Number(ore.replace(',', '.') || 0)
    const k = Number(km.replace(',', '.') || 0)
    if (!(o >= 0 && o <= 24)) return setProblema('Le ore di utilizzo vanno da 0 a 24.')
    if (!(k >= 0)) return setProblema('I km non possono essere negativi.')
    const [tipo, risorsaId] = scelta.split(':') as [RigaUso['tipo'], string]
    const riga: RigaUso = { tipo, risorsaId, ore: o, km: tipo === 'mezzo' ? k : 0, note: null }
    const pulisci = () => {
      setScelta('')
      setOre('')
      setKm('')
      setProblema(null)
    }
    if (!rapportinoId) {
      onCambia([...inAttesa, riga])
      pulisci()
      return
    }
    aggiungi.mutate(riga, { onSuccess: pulisci })
  }

  const righe = [
    ...(salvate ?? []).map((r) => ({
      chiave: r.id,
      etichetta: r.etichetta,
      riga: r,
      attesa: false,
      onTogli: modificabile ? () => togli.mutate(r) : undefined,
    })),
    ...inAttesa.map((r, i) => ({
      chiave: `attesa-${i}`,
      etichetta: etichettaDi(r.tipo, r.risorsaId),
      riga: r,
      attesa: true,
      onTogli: () => onCambia(inAttesa.filter((_, j) => j !== i)),
    })),
  ]

  const errore = (erroreScelte ?? erroreRighe) as Error | null
  const anagraficaVuota = scelte !== undefined && scelte.length === 0

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-black">Mezzi e attrezzature</h2>
        {righe.length > 0 && (
          <p className="text-xs font-extrabold text-black">{righe.length} usati</p>
        )}
      </div>

      {errore && <Avviso tono="errore">Non riesco a leggere mezzi e attrezzature: {errore.message}</Avviso>}
      {togli.isError && <Avviso tono="errore">{(togli.error as Error).message}</Avviso>}

      {righe.length > 0 && (
        <ul className="grid gap-1.5">
          {righe.map((r) => (
            <li
              key={r.chiave}
              className={cn(
                'flex items-center gap-2 rounded-lg border-2 border-black px-3 py-1.5',
                r.attesa ? 'border-dashed bg-amber-50' : 'bg-white',
              )}
            >
              <span
                className={cn(
                  'shrink-0 rounded border border-black px-1 text-[10px] font-extrabold uppercase',
                  r.riga.tipo === 'mezzo' ? 'bg-sky-200' : 'bg-lime-200',
                )}
              >
                {r.riga.tipo === 'mezzo' ? 'Mezzo' : 'Attr.'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-black">
                {r.etichetta}
              </span>
              <span className="numerico shrink-0 text-xs font-bold text-gray-700">
                {r.riga.ore > 0 && `${numero(r.riga.ore)} h`}
                {r.riga.km > 0 && ` · ${numero(r.riga.km)} km`}
              </span>
              {r.onTogli && (
                <button
                  type="button"
                  onClick={r.onTogli}
                  aria-label={`Togli ${r.etichetta}`}
                  className="neo-press h-6 w-6 shrink-0 cursor-pointer rounded-md border-2 border-black bg-white text-xs font-extrabold leading-none hover:bg-rose-200"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Anagrafiche vuote: dirlo, e dire chi le riempie. Una tendina
          vuota senza spiegazione sembra un guasto. */}
      {modificabile && anagraficaVuota && (
        <p className="text-xs font-semibold text-gray-600">
          Nessun mezzo o attrezzatura in anagrafica: li inseriscono l&rsquo;amministrazione o il titolare.
        </p>
      )}

      {modificabile && !anagraficaVuota && disponibili.length > 0 && (
        <div className="grid gap-2">
          <CampoSelect
            etichetta="Cosa è stato usato"
            value={scelta}
            onChange={(e) => setScelta(e.target.value)}
          >
            <option value="">— scegli —</option>
            {mezzi.length > 0 && (
              <optgroup label="Mezzi">
                {mezzi.map((s) => (
                  <option key={s.id} value={`mezzo:${s.id}`}>
                    {s.etichetta}
                  </option>
                ))}
              </optgroup>
            )}
            {attrezzi.length > 0 && (
              <optgroup label="Attrezzature">
                {attrezzi.map((s) => (
                  <option key={s.id} value={`attrezzatura:${s.id}`}>
                    {s.etichetta}
                  </option>
                ))}
              </optgroup>
            )}
          </CampoSelect>

          {scelta && (
            <div className={cn('grid gap-2', eMezzo && 'grid-cols-2')}>
              <Campo
                etichetta="Ore di utilizzo"
                type="number"
                step="0.5"
                min="0"
                max="24"
                className="numerico"
                value={ore}
                onChange={(e) => setOre(e.target.value)}
              />
              {eMezzo && (
                <Campo
                  etichetta="Km"
                  type="number"
                  step="1"
                  min="0"
                  className="numerico"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                />
              )}
            </div>
          )}

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}

          {/* `type="button"` di default nei nostri Button: siamo dentro il
              <form> del rapportino, e un submit qui salverebbe la scheda. */}
          <div>
            <Button dimensione="sm" onClick={conferma} disabled={!scelta || aggiungi.isPending}>
              {aggiungi.isPending ? 'Salvo…' : '+ Aggiungi'}
            </Button>
          </div>
        </div>
      )}

      {!modificabile && righe.length === 0 && (
        <p className="text-xs font-semibold text-gray-500">Nessun mezzo né attrezzatura.</p>
      )}
    </Card>
  )
}
