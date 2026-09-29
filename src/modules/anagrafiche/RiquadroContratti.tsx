import { useState } from 'react'
import { data as fmtData } from '../../lib/formato'
import { Avviso, Badge, Button, Campo, CampoSelect } from '../../ui'
import {
  A_TERMINE,
  CONTRATTI,
  ETICHETTA_MOTIVO,
  MOTIVI_SCELTI,
  aperto,
  useAggiungiContratto,
  useContratti,
  useEliminaContratto,
  useFineContratto,
  type Contratto,
  type MotivoFine,
} from './contratti'

/* ══════════════════════════════════════════════════════════════════
   I CONTRATTI, dentro Inquadramento. Dal 2026-09-29, al posto della
   spunta «Assunto» con data, ditta e tipo.

   «L'assunzione e' una conseguenza del servizio»: sta sotto il periodo
   di servizio, e puo' finire lasciando la persona in servizio. Un
   contratto dopo l'altro, anche con ditte diverse — il perche' di
   «Assunto con». Vedi `contratti.ts`.

   Dal database, senza che nessuno debba ricordarselo:
     * un contratto nuovo chiude quello aperto, il giorno prima;
     * la fine del servizio chiude i contratti ancora aperti.
   ══════════════════════════════════════════════════════════════════ */

const oggi = () => new Date().toLocaleDateString('sv-SE')

export function RiquadroContratti({
  dipendenteId,
  puoScrivere,
  inServizioDal,
}: {
  dipendenteId: string
  puoScrivere: boolean
  /** Il primo giorno che il modulo propone per un contratto nuovo. */
  inServizioDal: string
}) {
  const { data: tutti, error } = useContratti({ abilitato: true })
  const suoi = (tutti ?? []).filter((c) => c.dipendente_id === dipendenteId)
  const [nuovo, setNuovo] = useState(false)
  const [inModifica, setInModifica] = useState<string | null>(null)
  const elimina = useEliminaContratto()

  const vivo = suoi.find((c) => aperto(c))

  return (
    <div className="grid gap-3">
      {error && <Avviso tono="errore">Non riesco a leggere i contratti: {error.message}</Avviso>}

      {suoi.length === 0 && !nuovo && (
        <p className="text-xs font-semibold text-gray-600">
          Nessun contratto. Si può essere in servizio senza, in prova o per il tempo di un
          progetto: il contratto si aggiunge quando arriva.
        </p>
      )}

      {suoi.length > 0 && (
        <ul className="grid gap-2">
          {suoi.map((c) =>
            inModifica === c.id ? (
              <li key={c.id}>
                <FineContratto contratto={c} onChiudi={() => setInModifica(null)} />
              </li>
            ) : (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border-2 border-black/15 px-3 py-2"
              >
                <RigaContratto c={c} />
                {puoScrivere && (
                  <span className="flex gap-3">
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-bold text-black underline"
                      onClick={() => setInModifica(c.id)}
                    >
                      {c.al ? 'cambia la fine' : 'chiudi'}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-bold text-gray-600 underline hover:text-black"
                      disabled={elimina.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Cancellare il contratto con ${c.azienda} dal ${fmtData(c.dal)}?\n\nSolo se era sbagliato: un contratto finito si chiude, non si cancella.`,
                          )
                        )
                          elimina.mutate(c.id)
                      }}
                    >
                      cancella
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      {puoScrivere &&
        (nuovo ? (
          <NuovoContratto
            dipendenteId={dipendenteId}
            inServizioDal={inServizioDal}
            vivo={vivo}
            onChiudi={() => setNuovo(false)}
          />
        ) : (
          <div>
            <Button dimensione="sm" onClick={() => setNuovo(true)}>
              {suoi.length === 0 ? 'Aggiungi il contratto' : 'Nuovo contratto'}
            </Button>
          </div>
        ))}
    </div>
  )
}

function RigaContratto({ c }: { c: Contratto }) {
  const g = oggi()
  const stato =
    c.dal > g ? (
      <Badge colore="info" className="px-2 py-0.5 text-[10px]">
        comincia il {fmtData(c.dal)}
      </Badge>
    ) : aperto(c, g) ? (
      <Badge colore="successo" className="px-2 py-0.5 text-[10px]">
        in corso
      </Badge>
    ) : null

  return (
    <span className="grid min-w-0 gap-0.5 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <strong className="font-extrabold text-black">{c.azienda}</strong>
        {c.tipo_contratto && (
          <span className="font-semibold text-gray-700">· {c.tipo_contratto}</span>
        )}
        {stato}
      </span>
      <span className="numerico text-xs font-bold text-gray-700">
        dal {fmtData(c.dal)}
        {c.al ? ` al ${fmtData(c.al)}` : ' · senza scadenza'}
      </span>
      {c.motivo_fine && (
        <span className="text-xs font-semibold text-gray-600">
          {/* Una data di fine ancora da venire e' una scadenza, non una
              fine: si dice «scade», non «finito». */}
          {c.al && c.al >= g ? 'Scade: ' : 'Finito: '}
          {ETICHETTA_MOTIVO[c.motivo_fine] ?? c.motivo_fine}
          {c.note_fine && ` — ${c.note_fine}`}
        </span>
      )}
    </span>
  )
}

function NuovoContratto({
  dipendenteId,
  inServizioDal,
  vivo,
  onChiudi,
}: {
  dipendenteId: string
  inServizioDal: string
  vivo: Contratto | undefined
  onChiudi: () => void
}) {
  const aggiungi = useAggiungiContratto()
  // Il primo contratto parte di solito col servizio; i successivi oggi.
  const [dal, setDal] = useState(() => (vivo ? oggi() : inServizioDal || oggi()))
  const [al, setAl] = useState('')
  // Chi rinnova con la stessa ditta non deve riscriverla.
  const [azienda, setAzienda] = useState(vivo?.azienda ?? '')
  const [tipo, setTipo] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const aTermine = A_TERMINE.has(tipo)

  function salva() {
    if (azienda.trim() === '') return setProblema('Con quale azienda è assunto?')
    if (!dal) return setProblema('Da quando è assunto?')
    if (aTermine && !al) return setProblema(`Un contratto a ${tipo.toLowerCase()} ha una data di fine.`)
    if (al && al < dal) return setProblema('Il contratto finisce prima di cominciare.')
    setProblema(null)
    aggiungi.mutate(
      {
        dipendente_id: dipendenteId,
        azienda: azienda.trim(),
        tipo_contratto: tipo || null,
        dal,
        al: al || null,
        // Una fine scritta gia' all'assunzione e' la scadenza del
        // termine; se finira' prima, si cambia.
        motivo_fine: al ? 'scadenza_termine' : null,
        note_fine: null,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Testo libero per ora: diventera' una tendina di ditte quando
            l'elenco ci sara' (utente, 2026-09-25). */}
        <Campo
          etichetta="Assunto con"
          placeholder="L’azienda che ha fatto il contratto"
          value={azienda}
          onChange={(e) => setAzienda(e.target.value)}
        />
        <CampoSelect etichetta="Tipo contratto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">—</option>
          {CONTRATTI.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </CampoSelect>
        <Campo etichetta="Assunto dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
        <Campo
          etichetta="Fino al"
          type="date"
          value={al}
          suggerimento={aTermine ? 'La scadenza del contratto' : 'Vuota se non c’è una scadenza'}
          onChange={(e) => setAl(e.target.value)}
        />
      </div>
      {vivo && (
        <Avviso tono="info">
          Il contratto con {vivo.azienda} dal {fmtData(vivo.dal)} si chiude da solo il giorno prima
          di questo, come «sostituito da un nuovo contratto».
        </Avviso>
      )}
      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}
      <div className="flex gap-2">
        <Button variante="primario" dimensione="sm" onClick={salva} disabled={aggiungi.isPending}>
          {aggiungi.isPending ? 'Salvo…' : 'Salva contratto'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={aggiungi.isPending}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

/** La fine di un contratto: chiuderlo, spostarne la scadenza, o
 *  riaprirlo svuotando la data. */
function FineContratto({ contratto: c, onChiudi }: { contratto: Contratto; onChiudi: () => void }) {
  const salvaFine = useFineContratto()
  const [al, setAl] = useState(c.al ?? '')
  const [motivo, setMotivo] = useState<MotivoFine | ''>(
    c.motivo_fine ?? (c.tipo_contratto && A_TERMINE.has(c.tipo_contratto) ? 'scadenza_termine' : ''),
  )
  const [note, setNote] = useState(c.note_fine ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  /* I due motivi che scrive il database si vedono, se ci sono, ma non si
     scelgono: sono fatti successi, non una ragione da dare. */
  const scelte: MotivoFine[] =
    c.motivo_fine && !MOTIVI_SCELTI.includes(c.motivo_fine)
      ? [c.motivo_fine, ...MOTIVI_SCELTI]
      : MOTIVI_SCELTI

  function salva() {
    if (al && al < c.dal) return setProblema('Il contratto finisce prima di cominciare.')
    if (al && !motivo) return setProblema('Perché finisce?')
    if (al && motivo === 'altro' && note.trim() === '')
      return setProblema('Con «Altro» serve due parole di spiegazione.')
    setProblema(null)
    salvaFine.mutate(
      {
        id: c.id,
        al: al || null,
        motivo_fine: al ? (motivo as MotivoFine) : null,
        note_fine: al ? note.trim() || null : null,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      <p className="text-sm font-extrabold text-black">
        {c.azienda}
        {c.tipo_contratto && <span className="font-semibold text-gray-700"> · {c.tipo_contratto}</span>}
        <span className="numerico font-semibold text-gray-700"> · dal {fmtData(c.dal)}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etichetta="Fine rapporto"
          type="date"
          value={al}
          suggerimento="Svuotala per riaprire il contratto"
          onChange={(e) => setAl(e.target.value)}
        />
        {al && (
          <CampoSelect
            etichetta="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoFine | '')}
          >
            <option value="">—</option>
            {scelte.map((m) => (
              <option key={m} value={m}>
                {ETICHETTA_MOTIVO[m]}
              </option>
            ))}
          </CampoSelect>
        )}
      </div>
      {al && (
        <Campo
          etichetta="Note sulla fine"
          placeholder={motivo === 'altro' ? 'Cosa è successo' : 'Facoltative'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <p className="text-xs font-semibold text-gray-600">
        La fine del contratto non chiude il servizio: se la persona se ne va, va scritta anche la
        «Fine servizio» qui sopra.
      </p>
      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {salvaFine.isError && <Avviso tono="errore">{(salvaFine.error as Error).message}</Avviso>}
      <div className="flex gap-2">
        <Button variante="primario" dimensione="sm" onClick={salva} disabled={salvaFine.isPending}>
          {salvaFine.isPending ? 'Salvo…' : 'Salva'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={salvaFine.isPending}>
          Annulla
        </Button>
      </div>
    </div>
  )
}
