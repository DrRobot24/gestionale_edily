import { useState } from 'react'
import { Avviso, Button, Campo, CampoSelect, Card, Cifra, Table, Vuoto } from '../../ui'
import { data as fmtData, euro, numero } from '../../lib/formato'
import { useDipendenti } from './dipendenti'
import { useFornitori } from './fornitori'
import type { TipoParco } from './parco'
import { nominativo, useConsegneParco } from './consegneParco'
import { useEliminaSpesa, useSalvaSpesa, useSpeseParco, type Spesa } from './speseParco'

/* ══════════════════════════════════════════════════════════════════
   LA SCHEDA CARBURANTE, dal 2026-10-02: «ed infine la scheda
   carburanti» (utente).

   Un rifornimento per riga: quando, quanti litri, quanto, a quanti km
   (o a quante ore di lavoro, per un'attrezzatura), chi l'ha fatto. Dai
   numeri escono il prezzo al litro e il consumo fra un rifornimento e
   il precedente — il dato che fa notare un mezzo che beve troppo, o un
   pieno che non torna.

   SONO SPESE, categoria `carburante`, nella stessa tabella del riquadro
   Spese (`speseParco.ts`): un euro di gasolio e' contato una volta
   sola. Le colonne del carburante in `parco-consegne-carburante.sql`.

   Chi ha fatto rifornimento parte da chi ha il mezzo in consegna: e'
   quasi sempre lui, e quando non lo e' si cambia.
   ══════════════════════════════════════════════════════════════════ */

type Valori = {
  data: string
  litri: string
  importo: string
  contatore: string
  dipendente_id: string
  descrizione: string
  fornitore_id: string
  numero_documento: string
}

const oggi = () => new Date().toLocaleDateString('sv-SE')
const daTesto = (s: string) => Number(s.trim().replace(',', '.'))
const aTesto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

/** Le parole del contatore: km per un mezzo, ore per un'attrezzatura. */
const UNITA: Record<TipoParco, { contatore: string; etichetta: string; consumo: string; differenza: string }> = {
  mezzi: { contatore: 'Km', etichetta: 'Km al contachilometri', consumo: 'km/l', differenza: 'Km fatti' },
  attrezzature: { contatore: 'Ore', etichetta: 'Ore di lavoro al contaore', consumo: 'l/h', differenza: 'Ore fatte' },
}

/**
 * Fra un rifornimento e il precedente (in ordine di data, poi di
 * contatore): quanto si e' percorso o lavorato, e il consumo. Il pieno
 * di oggi paga la strada fatta da quello di prima: km ÷ litri di oggi.
 */
function consumi(righe: Spesa[], tipo: TipoParco): Map<string, { differenza: number; consumo: number }> {
  const ordinate = [...righe]
    .filter((r) => r.contatore !== null)
    .sort((a, b) => a.data.localeCompare(b.data) || Number(a.contatore) - Number(b.contatore))
  const out = new Map<string, { differenza: number; consumo: number }>()
  for (let i = 1; i < ordinate.length; i++) {
    const r = ordinate[i]
    const differenza = Number(r.contatore) - Number(ordinate[i - 1].contatore)
    if (differenza <= 0 || !r.litri) continue
    const litri = Number(r.litri)
    out.set(r.id, { differenza, consumo: tipo === 'mezzi' ? differenza / litri : litri / differenza })
  }
  return out
}

export function RiquadroCarburante({ tipo, voceId }: { tipo: TipoParco; voceId: string }) {
  const { data: spese, isPending, error } = useSpeseParco(tipo, voceId, true)
  const { data: consegne } = useConsegneParco(tipo, voceId)
  const { data: fornitori } = useFornitori()
  const { data: persone } = useDipendenti()
  const salva = useSalvaSpesa(tipo, voceId)
  const elimina = useEliminaSpesa(tipo, voceId)
  const u = UNITA[tipo]

  const righe = (spese ?? []).filter((s) => s.categoria === 'carburante')
  const conConsumo = consumi(righe, tipo)
  const consegnatario = (consegne ?? []).find((c) => !c.restituito_il)?.dipendente_id ?? ''

  const vuoti = (): Valori => ({
    data: oggi(),
    litri: '',
    importo: '',
    contatore: '',
    dipendente_id: consegnatario,
    descrizione: '',
    fornitore_id: '',
    numero_documento: '',
  })

  /** `null` = chiuso, `''` = nuovo, un id = in correzione. */
  const [aperto, setAperto] = useState<string | null>(null)
  const [valori, setValori] = useState<Valori>(vuoti)
  const [problema, setProblema] = useState<string | null>(null)

  const anno = oggi().slice(0, 4)
  const dellAnno = righe.filter((r) => r.data.startsWith(anno))
  const litriAnno = dellAnno.reduce((s, r) => s + Number(r.litri ?? 0), 0)
  const euroAnno = dellAnno.reduce((s, r) => s + Number(r.importo), 0)

  const cambia = <K extends keyof Valori>(k: K, v: Valori[K]) =>
    setValori((x) => ({ ...x, [k]: v }))

  function chiudi() {
    setAperto(null)
    setProblema(null)
  }

  function apriNuovo() {
    setValori(vuoti())
    setProblema(null)
    setAperto('')
  }

  function apriCorrezione(s: Spesa) {
    setValori({
      data: s.data,
      litri: aTesto(s.litri),
      importo: aTesto(s.importo),
      contatore: aTesto(s.contatore),
      dipendente_id: s.dipendente_id ?? '',
      descrizione: s.descrizione ?? '',
      fornitore_id: s.fornitore_id ?? '',
      numero_documento: s.numero_documento ?? '',
    })
    setProblema(null)
    setAperto(s.id)
  }

  function conferma() {
    const litri = daTesto(valori.litri)
    const importo = daTesto(valori.importo)
    const contatore = valori.contatore.trim() === '' ? null : daTesto(valori.contatore)
    if (!valori.data) return setProblema('Serve la data del rifornimento.')
    if (valori.litri.trim() === '' || !Number.isFinite(litri) || litri <= 0) {
      return setProblema('Scrivi i litri, per esempio 45,5.')
    }
    if (valori.importo.trim() === '' || !Number.isFinite(importo) || importo < 0) {
      return setProblema('Scrivi l’importo in euro, per esempio 82,40.')
    }
    if (contatore !== null && (!Number.isFinite(contatore) || contatore < 0)) {
      return setProblema(`${u.etichetta}: scrivi solo il numero.`)
    }
    /* Il contatore non torna indietro: un numero piu' basso del
       rifornimento precedente e' quasi sempre una cifra sbagliata, e
       falserebbe tutti i consumi dopo. */
    if (contatore !== null) {
      const prima = righe
        .filter((r) => r.id !== aperto && r.contatore !== null && r.data <= valori.data)
        .reduce((m, r) => Math.max(m, Number(r.contatore)), -1)
      if (contatore < prima) {
        return setProblema(
          `${u.etichetta}: ${numero(contatore)} è meno del rifornimento precedente (${numero(prima)}). Controlla la cifra.`,
        )
      }
    }
    salva.mutate(
      {
        id: aperto || undefined,
        dati: {
          data: valori.data,
          categoria: 'carburante',
          importo,
          litri,
          contatore,
          dipendente_id: valori.dipendente_id || null,
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-lime-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Scheda carburante
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            {dellAnno.length === 0
              ? `Ogni rifornimento: litri, importo, ${u.contatore.toLowerCase()} e chi l’ha fatto.`
              : `Nel ${anno}: ${numero(litriAnno)} l · ${euro(euroAnno)}${
                  litriAnno > 0 ? ` · in media ${euro(euroAnno / litriAnno)}/l` : ''
                }`}
          </p>
        </div>
        {aperto === null && (
          <Button dimensione="sm" variante="primario" onClick={apriNuovo}>
            + Rifornimento
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere i rifornimenti: {error.message}</Avviso>
        </div>
      )}
      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>
        </div>
      )}

      {aperto !== null && (
        <div className="grid gap-3 border-b-2 border-black bg-lime-50 p-5 sm:grid-cols-4">
          <Campo etichetta="Data" type="date" value={valori.data} onChange={(e) => cambia('data', e.target.value)} />
          <Campo
            etichetta="Litri"
            inputMode="decimal"
            placeholder="45,5"
            className="numerico"
            value={valori.litri}
            onChange={(e) => cambia('litri', e.target.value)}
          />
          <Campo
            etichetta="Importo (€)"
            inputMode="decimal"
            placeholder="82,40"
            className="numerico"
            value={valori.importo}
            onChange={(e) => cambia('importo', e.target.value)}
          />
          <Campo
            etichetta={u.etichetta}
            inputMode="decimal"
            className="numerico"
            suggerimento="Serve a calcolare il consumo"
            value={valori.contatore}
            onChange={(e) => cambia('contatore', e.target.value)}
          />
          <div className="sm:col-span-2">
            <CampoSelect
              etichetta="Chi ha fatto rifornimento"
              value={valori.dipendente_id}
              onChange={(e) => cambia('dipendente_id', e.target.value)}
            >
              <option value="">— non indicato —</option>
              {(persone ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cognome} {p.nome}
                </option>
              ))}
            </CampoSelect>
          </div>
          <div className="sm:col-span-2">
            <Campo
              etichetta="Distributore / note"
              placeholder="Q8 via Elorina, pieno…"
              value={valori.descrizione}
              onChange={(e) => cambia('descrizione', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <CampoSelect
              etichetta="Fornitore"
              suggerimento="Facoltativo: per la carta carburante con fattura"
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
          <div className="sm:col-span-2">
            <Campo
              etichetta="N. scontrino / fattura"
              value={valori.numero_documento}
              onChange={(e) => cambia('numero_documento', e.target.value)}
            />
          </div>

          {(problema || salva.isError) && (
            <div className="sm:col-span-4">
              <Avviso tono="errore">{problema ?? (salva.error as Error).message}</Avviso>
            </div>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-4">
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
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico i rifornimenti…</p>
      ) : righe.length === 0 ? (
        <div className="p-5">
          <Vuoto>Nessun rifornimento segnato.</Vuoto>
        </div>
      ) : (
        <div className="p-3">
          <Table>
            <thead>
              <tr>
                <th>Data</th>
                <th className="!text-right">Litri</th>
                <th className="!text-right">Importo</th>
                <th className="!text-right">€/l</th>
                <th className="!text-right">{u.contatore}</th>
                <th className="!text-right">{u.differenza}</th>
                <th className="!text-right">{u.consumo}</th>
                <th>Chi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const c = conConsumo.get(r.id)
                const litri = r.litri ? Number(r.litri) : null
                return (
                  <tr key={r.id}>
                    <td className="numerico font-bold">
                      {fmtData(r.data)}
                      {r.descrizione && (
                        <span className="block text-[10px] font-semibold text-gray-500">{r.descrizione}</span>
                      )}
                    </td>
                    <Cifra>{litri ? numero(litri) : '—'}</Cifra>
                    <Cifra>{euro(Number(r.importo))}</Cifra>
                    <Cifra className="text-gray-600">{litri ? euro(Number(r.importo) / litri) : '—'}</Cifra>
                    <Cifra className="text-gray-600">{r.contatore !== null ? numero(Number(r.contatore)) : '—'}</Cifra>
                    <Cifra className="text-gray-600">{c ? numero(c.differenza) : '—'}</Cifra>
                    <Cifra>{c ? numero(Math.round(c.consumo * 100) / 100) : '—'}</Cifra>
                    <td className="text-gray-700">{r.dipendente ? nominativo(r.dipendente) : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button dimensione="sm" onClick={() => apriCorrezione(r)}>
                        Correggi
                      </Button>{' '}
                      <Button
                        dimensione="sm"
                        variante="danger"
                        disabled={elimina.isPending}
                        aria-label="Elimina il rifornimento"
                        onClick={() => {
                          if (!confirm(`Eliminare il rifornimento del ${fmtData(r.data)}?`)) return
                          elimina.mutate(r.id)
                        }}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}
