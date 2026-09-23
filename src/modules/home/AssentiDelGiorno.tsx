import { useState } from 'react'
import { Avviso, Button, CampoSelect, Campo, Card } from '../../ui'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { ALTRO_MOTIVO, ASSENZE } from '../rapportini/campiRapportino'
import { useAssenze, useSegnaAssenza, useTogliAssenza } from '../rapportini/useAssenze'
import { tabellaMancante, useOreSuRapportini } from '../rapportini/useGiustificazioni'

/* ══════════════════════════════════════════════════════════════════
   CHI NON C'ERA, nella giornata del tecnico.

   Nasce il 2026-09-23. Prima l'assenza si scriveva dentro il
   rapportino di un cantiere, e chi era in ferie risultava su un
   cantiere dove non aveva messo piede. L'utente: «una risorsa assente
   in un giorno preciso non deve risultare in alcun cantiere, quindi in
   nessun rapportino».

   STA SOTTO LE CARD E SOPRA L'INVIO: e' l'ultima cosa da guardare prima
   di mandare la giornata. Le card dicono dove si e' lavorato, questo
   dice chi non c'era; insieme collocano tutta la squadra, ed e' cio'
   che l'invio pretende.

   LO SCRIVE IL TECNICO, col motivo. Se e' lui a mancare, qualcuno
   compila con la sua utenza (utente, 2026-09-23).

   Solo la GIORNATA INTERA. Il permesso di due ore resta sulla riga del
   rapportino, accanto alle sei lavorate: la persona in quel cantiere
   c'era.
   ══════════════════════════════════════════════════════════════════ */

export function AssentiDelGiorno({
  giorno,
  bloccata,
}: {
  giorno: string
  /** Il titolare ha gia' firmato almeno una scheda di questo giorno: le
   *  assenze si leggono ma non si toccano piu', come nel database. */
  bloccata: boolean
}) {
  const { data: assenze, error, isPending } = useAssenze(giorno)
  const { data: persone } = useDipendenti({ soloAttivi: true })
  const { data: suRapportini } = useOreSuRapportini(giorno)
  const segna = useSegnaAssenza(giorno)
  const togli = useTogliAssenza(giorno)

  const [chi, setChi] = useState('')
  const [motivo, setMotivo] = useState<string>(ASSENZE[0])
  const [nota, setNota] = useState('')

  if (error) {
    return tabellaMancante(error) ? (
      <Avviso tono="info">
        Il riquadro degli assenti non è ancora attivo: manca <code>assenze.sql</code> nel
        database.
      </Avviso>
    ) : (
      <Avviso tono="errore">Non riesco a leggere le assenze: {error.message}</Avviso>
    )
  }

  /* In forza QUEL giorno, non oggi: chi e' stato assunto dopo o cessato
     prima non puo' essere assente, perche' non c'era proprio. */
  const inForza = (persone ?? []).filter(
    (p) =>
      (!p.data_assunzione || p.data_assunzione <= giorno) &&
      (!p.data_cessazione || p.data_cessazione >= giorno),
  )
  const nome = (id: string) => {
    const p = inForza.find((x) => x.id === id) ?? (persone ?? []).find((x) => x.id === id)
    return p ? `${p.cognome} ${p.nome}` : '—'
  }

  const elenco = [...(assenze?.values() ?? [])].sort((a, b) =>
    nome(a.dipendente_id).localeCompare(nome(b.dipendente_id), 'it'),
  )

  /* Nella tendina: chi non e' gia' assente. Chi e' su un rapportino di
     questo giorno resta visibile ma spento, col cantiere accanto: il
     database lo rifiuterebbe, e dirlo prima evita di scoprirlo dopo. */
  const scegliibili = inForza.filter((p) => !assenze?.has(p.id))

  const altro = motivo === ALTRO_MOTIVO
  const pronto = chi !== '' && (!altro || nota.trim() !== '')

  function salva() {
    if (!pronto) return
    segna.mutate(
      { dipendente_id: chi, motivo, nota: altro ? nota.trim() : null },
      {
        onSuccess: () => {
          setChi('')
          setNota('')
        },
      },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black bg-gray-100 px-5 py-3">
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-black">Assenti</h3>
        <p className="text-xs font-semibold text-gray-600">
          Chi oggi non era in nessun cantiere, e perché
        </p>
      </div>

      {isPending ? (
        <p className="px-5 py-3 text-sm font-semibold text-gray-600">Carico le assenze…</p>
      ) : elenco.length === 0 ? (
        <p className="px-5 py-3 text-sm font-semibold text-gray-600">
          Nessun assente segnato.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {elenco.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
              <span className="text-sm font-bold text-black">
                {nome(a.dipendente_id)}
                <span className="ml-2 rounded-full border-2 border-black bg-gray-200 px-2 py-0.5 text-[10px] font-extrabold uppercase">
                  {a.motivo}
                </span>
                {a.nota && (
                  <span className="ml-2 text-xs font-semibold text-gray-600">{a.nota}</span>
                )}
              </span>
              {!bloccata && (
                <Button
                  dimensione="sm"
                  variante="secondario"
                  disabled={togli.isPending}
                  onClick={() => togli.mutate(a.dipendente_id)}
                >
                  Togli
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {bloccata ? (
        <p className="border-t-2 border-black bg-gray-50 px-5 py-2 text-xs font-semibold text-gray-600">
          Il titolare ha già validato questa giornata: le assenze non si modificano più.
        </p>
      ) : (
        <div className="grid gap-3 border-t-2 border-black bg-gray-50 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <CampoSelect etichetta="Chi" value={chi} onChange={(e) => setChi(e.target.value)}>
              <option value="">Scegli la persona…</option>
              {scegliibili.map((p) => {
                const dove = suRapportini?.get(p.id)
                return (
                  <option key={p.id} value={p.id} disabled={Boolean(dove)}>
                    {p.cognome} {p.nome}
                    {dove ? ` — già su ${dove.map((d) => d.cantiere_codice).join(', ')}` : ''}
                  </option>
                )
              })}
            </CampoSelect>
            <CampoSelect
              etichetta="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {ASSENZE.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </CampoSelect>
            <Button
              variante="primario"
              disabled={!pronto || segna.isPending}
              onClick={salva}
            >
              {segna.isPending ? 'Salvo…' : 'Segna assente'}
            </Button>
          </div>

          {altro && (
            <Campo
              etichetta="Qual è il motivo?"
              placeholder="per esempio: lutto familiare, visita medica"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          )}

          {(segna.error || togli.error) && (
            <Avviso tono="errore">{(segna.error ?? togli.error)?.message}</Avviso>
          )}
        </div>
      )}
    </Card>
  )
}
