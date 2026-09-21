import { useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, Vuoto } from '../../ui'
import {
  RUOLI,
  RUOLI_DI,
  etichettaRuolo,
  nomeCompleto,
  useEliminaFigura,
  useFigure,
  useSalvaFigura,
  type AmbitoFigura,
  type DatiFigura,
  type Figura,
  type RuoloFigura,
} from './figure'

/* ══════════════════════════════════════════════════════════════════
   LE FIGURE di un cliente o di un cantiere.

   Chiesto dall'utente il 2026-09-21: «nella scheda cliente voglio poter
   inserire le figure apicali». Prima stavano nelle note come testo
   libero, dove sono scritte bene ma non si cercano, non stanno in
   colonna e non si puo' telefonare a nessuno.

   LO STESSO COMPONENTE PER I DUE POSTI, e cambia solo `ambito`: sul
   cliente propone amministratore e referente, sul cantiere le figure
   tecniche. Le due tendine escono da `RUOLI_DI`, non da un `if` qui
   dentro.

   Esiste solo su una scheda GIA' SALVATA, come il riquadro dei
   documenti: una figura ha bisogno di qualcosa a cui appartenere, e su
   una scheda nuova quel qualcosa non ha ancora un id.

   IL TELEFONO E' UN LINK, e non e' un vezzo: il tecnico che deve
   chiamare il CSE lo fa dal cantiere, dal telefono, con i guanti. Un
   numero da leggere e ricopiare a mano e' un numero che finisce su un
   foglietto.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroFigure({
  ambito,
  riferimentoId,
  puoScrivere,
}: {
  ambito: AmbitoFigura
  riferimentoId: string
  puoScrivere: boolean
}) {
  const { data: figure, isPending, error } = useFigure(ambito, riferimentoId)
  const salva = useSalvaFigura(ambito, riferimentoId)
  const elimina = useEliminaFigura(ambito, riferimentoId)

  /* `null` = chiuso, `'nuova'` = sto aggiungendo, un id = sto
     correggendo quella riga. Un solo stato invece di tre booleani che
     possono contraddirsi. */
  const [aperto, setAperto] = useState<string | null>(null)

  const righe = figure ?? []

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-sky-300 px-5 py-3">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            {ambito === 'cliente' ? 'Chi rappresenta il cliente' : 'Le figure del cantiere'}
          </h2>
          <p className="text-xs font-semibold text-black/70">
            {ambito === 'cliente'
              ? 'Amministratore e referente: non cambiano da un lavoro all’altro'
              : 'Direttore lavori, sicurezza, collaudo: nominati per questo cantiere'}
          </p>
        </div>
        {puoScrivere && aperto === null && (
          <Button dimensione="sm" onClick={() => setAperto('nuova')}>
            Aggiungi
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-4">
          <Avviso tono="errore">Non riesco a leggere le figure: {error.message}</Avviso>
        </div>
      )}

      {aperto === 'nuova' && (
        <div className="border-b-2 border-black bg-amber-50 px-5 py-4">
          <Modulo
            ambito={ambito}
            onAnnulla={() => setAperto(null)}
            onSalva={async (dati) => {
              await salva.mutateAsync({ dati })
              setAperto(null)
            }}
            salvando={salva.isPending}
            errore={salva.error as Error | null}
          />
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-semibold text-gray-600">Carico…</p>
      ) : righe.length === 0 && aperto === null ? (
        <div className="px-5 py-4">
          <Vuoto>
            {ambito === 'cliente'
              ? 'Nessuna figura registrata. Qui vanno l’amministratore e il referente.'
              : 'Nessuna figura registrata. Qui vanno il direttore lavori e i coordinatori della sicurezza.'}
          </Vuoto>
        </div>
      ) : (
        <ul className="divide-y-2 divide-black">
          {righe.map((f) =>
            aperto === f.id ? (
              <li key={f.id} className="bg-amber-50 px-5 py-4">
                <Modulo
                  ambito={ambito}
                  figura={f}
                  onAnnulla={() => setAperto(null)}
                  onSalva={async (dati) => {
                    await salva.mutateAsync({ id: f.id, dati })
                    setAperto(null)
                  }}
                  salvando={salva.isPending}
                  errore={salva.error as Error | null}
                />
              </li>
            ) : (
              <Riga
                key={f.id}
                figura={f}
                puoScrivere={puoScrivere}
                onCorreggi={() => setAperto(f.id)}
                onElimina={() => elimina.mutate(f.id)}
              />
            ),
          )}
        </ul>
      )}
    </Card>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Una figura in lettura.
   ───────────────────────────────────────────────────────────────── */
function Riga({
  figura: f,
  puoScrivere,
  onCorreggi,
  onElimina,
}: {
  figura: Figura
  puoScrivere: boolean
  onCorreggi: () => void
  onElimina: () => void
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-amber-400">{etichettaRuolo(f)}</Badge>
          <span className="text-sm font-bold">{nomeCompleto(f)}</span>
        </div>

        {(f.telefono || f.email) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
            {/* Link e non testo: dal telefono parte la chiamata, dal
                computer si apre la posta. Chi legge questa scheda lo fa
                quasi sempre perche' deve contattare qualcuno. */}
            {f.telefono && (
              <a href={`tel:${f.telefono.replace(/\s/g, '')}`} className="underline">
                {f.telefono}
              </a>
            )}
            {f.email && (
              <a href={`mailto:${f.email}`} className="truncate underline">
                {f.email}
              </a>
            )}
          </div>
        )}

        {f.note && (
          <p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-gray-600">
            {f.note}
          </p>
        )}
      </div>

      {puoScrivere && (
        <div className="flex shrink-0 gap-2">
          <Button dimensione="sm" variante="secondario" onClick={onCorreggi}>
            Correggi
          </Button>
          <Button
            dimensione="sm"
            variante="danger"
            onClick={() => {
              /* Si chiede conferma perche' non c'e' cestino: una figura
                 cancellata per sbaglio va riscritta a mano con i suoi
                 recapiti, che nessuno ricorda a memoria. */
              if (confirm(`Eliminare ${nomeCompleto(f)} da questa scheda?`)) onElimina()
            }}
          >
            Elimina
          </Button>
        </div>
      )}
    </li>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Il modulo, che serve sia per aggiungere sia per correggere.
   ───────────────────────────────────────────────────────────────── */
function Modulo({
  ambito,
  figura,
  onAnnulla,
  onSalva,
  salvando,
  errore,
}: {
  ambito: AmbitoFigura
  figura?: Figura
  onAnnulla: () => void
  onSalva: (dati: DatiFigura) => Promise<void>
  salvando: boolean
  errore: Error | null
}) {
  const [ruolo, setRuolo] = useState<RuoloFigura>(
    figura?.ruolo ?? RUOLI_DI[ambito][0],
  )
  const [ruoloLibero, setRuoloLibero] = useState(figura?.ruolo_libero ?? '')
  const [titolo, setTitolo] = useState(figura?.titolo ?? '')
  const [nominativo, setNominativo] = useState(figura?.nominativo ?? '')
  const [telefono, setTelefono] = useState(figura?.telefono ?? '')
  const [email, setEmail] = useState(figura?.email ?? '')
  const [note, setNote] = useState(figura?.note ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  /* Se sto correggendo una figura con un ruolo che questo ambito non
     propone — capita se e' stata scritta prima, o da un'altra scheda —
     il suo ruolo resta in tendina invece di sparire: altrimenti salvare
     senza accorgersene lo cambierebbe. */
  const disponibili = RUOLI_DI[ambito].includes(ruolo)
    ? RUOLI_DI[ambito]
    : [ruolo, ...RUOLI_DI[ambito]]

  async function invia() {
    const nome = nominativo.trim()
    if (!nome) {
      setProblema('Serve il nome della persona.')
      return
    }
    if (ruolo === 'altro' && !ruoloLibero.trim()) {
      setProblema('Hai scelto «Altro»: scrivi di che ruolo si tratta.')
      return
    }
    setProblema(null)

    await onSalva({
      ruolo,
      ruolo_libero: ruolo === 'altro' ? ruoloLibero.trim() : null,
      titolo: titolo.trim() || null,
      nominativo: nome,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      note: note.trim() || null,
    })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect
          etichetta="Ruolo"
          value={ruolo}
          onChange={(e) => setRuolo(e.target.value as RuoloFigura)}
        >
          {disponibili.map((r) => (
            <option key={r} value={r}>
              {RUOLI[r].breve} — {RUOLI[r].esteso}
            </option>
          ))}
        </CampoSelect>

        {ruolo === 'altro' ? (
          <Campo
            etichetta="Che ruolo"
            value={ruoloLibero}
            onChange={(e) => setRuoloLibero(e.target.value)}
            placeholder="Es. Geologo"
          />
        ) : (
          <div />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        {/* Il titolo separato dal nome perche' e' cosi' che si scrive in
            edilizia — «Ing. Renato La Runa» — e tenerlo in un campo suo
            permette di ordinare per cognome senza che «Ing.» finisca in
            testa a tutto. */}
        <Campo
          etichetta="Titolo"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
          placeholder="Ing."
        />
        <Campo
          etichetta="Nome e cognome"
          value={nominativo}
          onChange={(e) => setNominativo(e.target.value)}
          placeholder="Renato La Runa"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etichetta="Telefono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <Campo
          etichetta="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <Campo etichetta="Note" value={note} onChange={(e) => setNote(e.target.value)} />

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {errore && <Avviso tono="errore">{errore.message}</Avviso>}

      <div className="flex gap-2">
        <Button onClick={invia} disabled={salvando}>
          {salvando ? 'Salvo…' : 'Salva'}
        </Button>
        <Button variante="secondario" onClick={onAnnulla} disabled={salvando}>
          Annulla
        </Button>
      </div>
    </div>
  )
}
