import { useState } from 'react'
import { Avviso, Button, CampoSelect, Campo, Card } from '../../ui'
import { useDipendenti, useMioDipendente } from '../anagrafiche/dipendenti'
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
  const { data: persone } = useDipendenti({ soloAttivi: true, inServizioIl: giorno })
  const { data: mio } = useMioDipendente()
  const { data: suRapportini } = useOreSuRapportini(giorno)
  const segna = useSegnaAssenza(giorno)
  const togli = useTogliAssenza(giorno)

  const [chi, setChi] = useState('')
  const [motivo, setMotivo] = useState<string>(ASSENZE[0])
  const [nota, setNota] = useState('')
  /* Il modulo si apre a richiesta, dal 2026-09-24: sempre aperto
     occupava mezzo riquadro anche nei giorni in cui non manca nessuno,
     cioe' quasi sempre. */
  const [aperto, setAperto] = useState(false)

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
  /* SOLO GLI OPERAI, E SE STESSO (2026-09-23). «Ogni impiegato si
     segna le proprie ore e mai viceversa»: il tecnico non segna
     l'assenza di Stefania, ne' di un altro tecnico. Chi ha un foglio
     personale le sue assenze le dichiara li'. Resta il tecnico stesso,
     per il giorno in cui e' lui a mancare e qualcuno compila con la sua
     utenza. Il database applica la stessa regola (`assenze_insert`). */
  const inForza = (persone ?? []).filter(
    (p) =>
      (p.tipo === 'operaio' || p.id === mio?.id) &&
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
          setAperto(false)
        },
      },
    )
  }

  /* UNA RIGA SOLA, dal 2026-09-24: gli assenti come etichette con la
     loro ✕, e il pulsante per segnarne uno nuovo. Prima erano un
     riquadro con intestazione, elenco e modulo sempre aperto. */
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <h3 className="mr-1 text-xs font-extrabold uppercase tracking-wide text-black">
          Assenti
        </h3>

        {isPending ? (
          <span className="text-xs font-semibold text-gray-600">Carico…</span>
        ) : elenco.length === 0 ? (
          <span className="text-xs font-semibold text-gray-500">nessuno</span>
        ) : (
          elenco.map((a) => (
            <span
              key={a.id}
              title={a.nota ?? undefined}
              className="flex items-center gap-1.5 rounded-full border-2 border-black bg-gray-100 py-0.5 pr-1 pl-2.5 text-xs font-bold text-black"
            >
              {nome(a.dipendente_id)}
              <span className="text-[10px] font-extrabold uppercase text-gray-600">
                · {a.nota ?? a.motivo}
              </span>
              {!bloccata ? (
                <button
                  type="button"
                  aria-label={`Togli ${nome(a.dipendente_id)} dagli assenti`}
                  disabled={togli.isPending}
                  onClick={() => togli.mutate(a.dipendente_id)}
                  className="grid h-5 w-5 cursor-pointer place-content-center rounded-full text-xs font-black hover:bg-rose-200"
                >
                  ✕
                </button>
              ) : (
                <span className="w-1" />
              )}
            </span>
          ))
        )}

        {!bloccata && !aperto && (
          <Button
            dimensione="sm"
            variante="secondario"
            className="ml-auto"
            onClick={() => setAperto(true)}
          >
            + Segna assente
          </Button>
        )}
        {bloccata && (
          <span className="ml-auto text-[11px] font-semibold text-gray-500">
            Giornata già validata: non si modificano più.
          </span>
        )}
      </div>

      {!bloccata && aperto && (
        <div className="grid gap-3 border-t-2 border-black bg-gray-50 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] sm:items-end">
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
            <Button variante="primario" disabled={!pronto || segna.isPending} onClick={salva}>
              {segna.isPending ? 'Salvo…' : 'Segna assente'}
            </Button>
            <Button
              variante="secondario"
              onClick={() => {
                segna.reset()
                setAperto(false)
              }}
            >
              Annulla
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
        </div>
      )}

      {(segna.error || togli.error) && (
        <div className="border-t-2 border-black px-4 py-3">
          <Avviso tono="errore">{(segna.error ?? togli.error)?.message}</Avviso>
        </div>
      )}
    </Card>
  )
}
