import { useState } from 'react'
import { Avviso, Button, Campo, CampoSelect, Card, Vuoto } from '../../ui'
import { data as fmtData, euro } from '../../lib/formato'
import { useFornitori } from './fornitori'
import type { TipoParco } from './parco'
import {
  CATEGORIE_SPESA,
  etichettaCategoria,
  useEliminaSpesa,
  useSalvaSpesa,
  useSpeseParco,
  type CategoriaSpesa,
  type Spesa,
} from './speseParco'

/* ══════════════════════════════════════════════════════════════════
   Il riquadro delle spese, nella scheda di un mezzo o di
   un'attrezzatura. Vedi `speseParco.ts`.

   In testa i due totali che si chiedono davvero: quanto e' costato
   quest'anno, e quanto da quando c'e'. Sotto, le spese dalla piu'
   recente. Lo stesso gesto del riquadro dei documenti — «+ Aggiungi»
   apre il modulo in alto, «Correggi» lo riapre sulla riga.
   ══════════════════════════════════════════════════════════════════ */

type Valori = {
  data: string
  categoria: CategoriaSpesa
  importo: string
  descrizione: string
  fornitore_id: string
  numero_documento: string
}

const oggi = () => new Date().toLocaleDateString('sv-SE')

const VUOTI = (): Valori => ({
  data: oggi(),
  categoria: 'carburante',
  importo: '',
  descrizione: '',
  fornitore_id: '',
  numero_documento: '',
})

export function RiquadroSpese({ tipo, voceId }: { tipo: TipoParco; voceId: string }) {
  const { data: spese, isPending, error } = useSpeseParco(tipo, voceId, true)
  const { data: fornitori } = useFornitori()
  const salva = useSalvaSpesa(tipo, voceId)
  const elimina = useEliminaSpesa(tipo, voceId)

  /** `null` = chiuso, `''` = nuova, un id = in correzione. */
  const [aperto, setAperto] = useState<string | null>(null)
  const [valori, setValori] = useState<Valori>(VUOTI)
  const [problema, setProblema] = useState<string | null>(null)

  const righe = spese ?? []
  const anno = oggi().slice(0, 4)
  const totale = righe.reduce((s, r) => s + Number(r.importo), 0)
  const totaleAnno = righe
    .filter((r) => r.data.startsWith(anno))
    .reduce((s, r) => s + Number(r.importo), 0)

  const cambia = <K extends keyof Valori>(k: K, v: Valori[K]) =>
    setValori((x) => ({ ...x, [k]: v }))

  function chiudi() {
    setAperto(null)
    setValori(VUOTI())
    setProblema(null)
  }

  function apriCorrezione(s: Spesa) {
    setValori({
      data: s.data,
      categoria: s.categoria as CategoriaSpesa,
      importo: String(s.importo).replace('.', ','),
      descrizione: s.descrizione ?? '',
      fornitore_id: s.fornitore_id ?? '',
      numero_documento: s.numero_documento ?? '',
    })
    setProblema(null)
    setAperto(s.id)
  }

  function conferma() {
    const importo = Number(valori.importo.trim().replace(',', '.'))
    if (valori.importo.trim() === '' || !Number.isFinite(importo) || importo < 0) {
      setProblema('Scrivi l’importo in euro, per esempio 85,50.')
      return
    }
    if (!valori.data) {
      setProblema('Serve la data della spesa.')
      return
    }
    salva.mutate(
      {
        id: aperto || undefined,
        dati: {
          data: valori.data,
          categoria: valori.categoria,
          importo,
          descrizione: valori.descrizione.trim() || null,
          fornitore_id: valori.fornitore_id || null,
          numero_documento: valori.numero_documento.trim() || null,
        },
      },
      { onSuccess: chiudi },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-sky-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">Spese</h2>
          <p className="text-xs font-semibold text-gray-700">
            {righe.length === 0
              ? 'Carburante, tagliandi, riparazioni, gomme, assicurazione, bollo.'
              : `Nel ${anno}: ${euro(totaleAnno)} · in tutto: ${euro(totale)}`}
          </p>
        </div>
        {aperto === null && (
          <Button dimensione="sm" variante="primario" onClick={() => setAperto('')}>
            + Aggiungi spesa
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere le spese: {error.message}</Avviso>
        </div>
      )}
      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>
        </div>
      )}

      {aperto !== null && (
        <div className="grid gap-3 border-b-2 border-black bg-sky-50 p-5 sm:grid-cols-3">
          <Campo
            etichetta="Data"
            type="date"
            value={valori.data}
            onChange={(e) => cambia('data', e.target.value)}
          />
          <CampoSelect
            etichetta="Categoria"
            value={valori.categoria}
            onChange={(e) => cambia('categoria', e.target.value as CategoriaSpesa)}
          >
            {CATEGORIE_SPESA.map((c) => (
              <option key={c.valore} value={c.valore}>
                {c.etichetta}
              </option>
            ))}
          </CampoSelect>
          <Campo
            etichetta="Importo (€)"
            inputMode="decimal"
            placeholder="85,50"
            className="numerico"
            value={valori.importo}
            onChange={(e) => cambia('importo', e.target.value)}
          />
          <div className="sm:col-span-3">
            <Campo
              etichetta="Descrizione"
              placeholder="Tagliando 60.000 km, cambio olio e filtri…"
              value={valori.descrizione}
              onChange={(e) => cambia('descrizione', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <CampoSelect
              etichetta="Fornitore"
              suggerimento="Facoltativo: servirà ad abbinare la spesa alla sua fattura"
              value={valori.fornitore_id}
              onChange={(e) => cambia('fornitore_id', e.target.value)}
            >
              <option value="">— nessuno —</option>
              {(fornitori ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.ragione_sociale}
                </option>
              ))}
            </CampoSelect>
          </div>
          <Campo
            etichetta="N. fattura / scontrino"
            value={valori.numero_documento}
            onChange={(e) => cambia('numero_documento', e.target.value)}
          />

          {(problema || salva.isError) && (
            <div className="sm:col-span-3">
              <Avviso tono="errore">{problema ?? (salva.error as Error).message}</Avviso>
            </div>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button variante="primario" dimensione="sm" disabled={salva.isPending} onClick={conferma}>
              {salva.isPending ? 'Salvo…' : aperto ? 'Salva le correzioni' : 'Aggiungi'}
            </Button>
            <Button dimensione="sm" onClick={chiudi} disabled={salva.isPending}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le spese…</p>
      ) : righe.length === 0 ? (
        <div className="p-5">
          <Vuoto>Nessuna spesa segnata.</Vuoto>
        </div>
      ) : (
        <ul className="divide-y-2 divide-black">
          {righe.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-black">
                  <span className="numerico">{fmtData(s.data)}</span> · {etichettaCategoria(s.categoria)}
                  {s.descrizione && <span className="font-semibold text-gray-700"> — {s.descrizione}</span>}
                </p>
                {(s.fornitore || s.numero_documento) && (
                  <p className="mt-0.5 text-xs font-semibold text-gray-600">
                    {s.fornitore?.ragione_sociale}
                    {s.fornitore && s.numero_documento && ' · '}
                    {s.numero_documento && `doc. ${s.numero_documento}`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="numerico mr-1 text-sm font-extrabold text-black">{euro(Number(s.importo))}</span>
                <Button dimensione="sm" onClick={() => apriCorrezione(s)}>
                  Correggi
                </Button>
                <Button
                  dimensione="sm"
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (!confirm(`Eliminare la spesa di ${euro(Number(s.importo))} del ${fmtData(s.data)}?`)) return
                    elimina.mutate(s.id)
                  }}
                >
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
