import { useState } from 'react'
import { Link } from 'react-router'
import { Avviso, Badge, Button, CampoSelect, Card } from '../../ui'
import { useClienti } from '../anagrafiche/clienti'
import {
  useAggiungiClienteCantiere,
  useClientiCantiere,
  useTogliClienteCantiere,
} from './clientiCantiere'

/* ══════════════════════════════════════════════════════════════════
   I clienti del cantiere: il principale e quelli in piu'.

   Chiesto dall'utente il 2026-09-24: «devo dare la possibilita' di
   aggiungere due o piu' figure come clienti di riferimento di un
   cantiere», privati o aziende, e a farlo sono solo Stefania o il
   titolare.

   IL PRINCIPALE NON SI TOCCA DA QUI. Resta nel modulo del cantiere,
   dove si e' sempre scelto: e' `cantieri.cliente_id`, lo legge anche
   wbs-office, e cambiarlo e' una decisione sull'anagrafica del
   cantiere, non un'aggiunta. Qui si aggiungono e si tolgono gli altri.

   TOGLIERE CHIEDE CONFERMA, ed e' la «molta attenzione» chiesta: non
   c'e' cestino, e un cliente tolto per sbaglio sparisce dalla scheda
   di tutti — tecnico compreso — finche' qualcuno non se ne accorge.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroClienti({
  cantiereId,
  principale,
  puoScrivere,
  vedeAnagrafica,
}: {
  cantiereId: string
  principale: { id: string; nome: string; telefono: string | null } | null
  /** `cantieri.write`: aggiunge e toglie. */
  puoScrivere: boolean
  /** Chi tiene le anagrafiche puo' aprire la scheda del cliente. */
  vedeAnagrafica: boolean
}) {
  const { data: altri, isPending, error } = useClientiCantiere(cantiereId)
  const aggiungi = useAggiungiClienteCantiere(cantiereId)
  const togli = useTogliClienteCantiere(cantiereId)
  const [aggiungendo, setAggiungendo] = useState(false)

  /* Se un cliente in piu' e' diventato poi il principale (cambiato dal
     modulo), il legame vecchio resta nel database: su `cantieri` non
     c'e' un trigger che lo pulisca, per non toccare una tabella di
     wbs-office. Qui lo si mostra una volta sola. */
  const inPiu = (altri ?? []).filter((a) => a.clienteId !== principale?.id)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-300 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          {inPiu.length > 0 ? 'I clienti' : 'Il cliente'}
        </h2>
        {puoScrivere && !aggiungendo && principale && (
          <Button dimensione="sm" onClick={() => setAggiungendo(true)}>
            + Aggiungi
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere i clienti in più: {error.message}</Avviso>
        </div>
      )}
      {togli.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">{(togli.error as Error).message}</Avviso>
        </div>
      )}

      <ul className="divide-y-2 divide-black">
        {principale ? (
          <Riga
            nome={principale.nome}
            telefono={principale.telefono}
            href={vedeAnagrafica ? `/anagrafiche/clienti/${principale.id}` : undefined}
            etichetta="principale"
          />
        ) : (
          <li className="px-5 py-3 text-sm font-semibold text-gray-600">
            Nessun cliente principale: si sceglie in «Modifica anagrafica».
          </li>
        )}

        {!isPending &&
          inPiu.map((a) => (
            <Riga
              key={a.id}
              nome={a.nome}
              telefono={a.telefono}
              href={vedeAnagrafica ? `/anagrafiche/clienti/${a.clienteId}` : undefined}
              archiviato={!a.attivo}
              onTogli={
                puoScrivere
                  ? () => {
                      if (
                        confirm(
                          `Togliere ${a.nome} dai clienti di questo cantiere?\n\nIl cliente resta in anagrafica: sparisce solo da questa scheda.`,
                        )
                      ) {
                        togli.mutate(a.id)
                      }
                    }
                  : undefined
              }
              togliendo={togli.isPending && togli.variables === a.id}
            />
          ))}
      </ul>

      {aggiungendo && principale && (
        <Aggiungi
          esclusi={[principale.id, ...inPiu.map((a) => a.clienteId)]}
          onAnnulla={() => {
            aggiungi.reset()
            setAggiungendo(false)
          }}
          onScegli={async (id) => {
            await aggiungi.mutateAsync(id)
            setAggiungendo(false)
          }}
          salvando={aggiungi.isPending}
          errore={aggiungi.error as Error | null}
        />
      )}
    </Card>
  )
}

function Riga({
  nome,
  telefono,
  href,
  etichetta,
  archiviato,
  onTogli,
  togliendo,
}: {
  nome: string
  telefono: string | null
  href?: string
  etichetta?: string
  archiviato?: boolean
  onTogli?: () => void
  togliendo?: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <Link to={href} className="truncate text-sm font-extrabold text-black underline decoration-2 underline-offset-2">
              {nome}
            </Link>
          ) : (
            <span className="truncate text-sm font-extrabold text-black">{nome}</span>
          )}
          {etichetta && <Badge className="px-2 py-0.5 text-[10px]">{etichetta}</Badge>}
          {archiviato && <Badge className="px-2 py-0.5 text-[10px]">archiviato</Badge>}
        </div>
        {/* Un link e non un testo: chi apre la scheda dal cantiere
            spesso lo fa per chiamare. */}
        {telefono && (
          <a
            href={`tel:${telefono.replace(/\s/g, '')}`}
            className="numerico text-xs font-semibold text-gray-700 underline"
          >
            {telefono}
          </a>
        )}
      </div>
      {onTogli && (
        <Button dimensione="sm" variante="secondario" onClick={onTogli} disabled={togliendo}>
          {togliendo ? 'Tolgo…' : 'Togli'}
        </Button>
      )}
    </li>
  )
}

function Aggiungi({
  esclusi,
  onAnnulla,
  onScegli,
  salvando,
  errore,
}: {
  esclusi: string[]
  onAnnulla: () => void
  onScegli: (id: string) => Promise<void>
  salvando: boolean
  errore: Error | null
}) {
  // Solo i clienti attivi, come nella tendina del principale: un
  // archiviato non si lega a un lavoro nuovo.
  const { data: clienti, isPending } = useClienti()
  const [scelto, setScelto] = useState('')

  const disponibili = [...(clienti ?? [])]
    .filter((c) => !esclusi.includes(c.id))
    .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale, 'it', { sensitivity: 'base' }))

  return (
    <div className="grid gap-3 border-t-2 border-black bg-amber-50 px-5 py-4">
      <CampoSelect
        etichetta="Cliente da aggiungere"
        value={scelto}
        onChange={(e) => setScelto(e.target.value)}
        disabled={isPending || salvando}
      >
        <option value="">{isPending ? 'Carico…' : '— scegli —'}</option>
        {disponibili.map((c) => (
          <option key={c.id} value={c.id}>
            {c.ragione_sociale}
          </option>
        ))}
      </CampoSelect>

      {!isPending && disponibili.length === 0 && (
        <p className="text-xs font-semibold text-gray-600">
          Non ci sono altri clienti attivi in anagrafica.{' '}
          <Link to="/anagrafiche/clienti/nuovo" className="underline">
            Creane uno
          </Link>
          .
        </p>
      )}

      {errore && <Avviso tono="errore">{errore.message}</Avviso>}

      <div className="flex gap-2">
        <Button onClick={() => {
            // L'errore lo mostra l'Avviso qui sopra: qui basta non
            // lasciare la promessa respinta a nessuno.
            if (scelto) onScegli(scelto).catch(() => {})
          }} disabled={!scelto || salvando}>
          {salvando ? 'Aggiungo…' : 'Aggiungi'}
        </Button>
        <Button variante="secondario" onClick={onAnnulla} disabled={salvando}>
          Annulla
        </Button>
      </div>
    </div>
  )
}
