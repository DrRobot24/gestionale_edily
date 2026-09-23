import { useState } from 'react'
import { useNavigate } from 'react-router'
import { euro } from '../../lib/formato'
import { Avviso, Badge, Button, Rubrica, Vuoto, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { tariffaVigente, useDipendenti, type TipoRisorsa } from './dipendenti'
import { statoScadenza, giorniA } from './documentiPersonali'

/* ══════════════════════════════════════════════════════════════════
   Il registro delle persone che lavorano per l'impresa.

   SI CHIAMA «RISORSE» E NON «OPERAI», dal 2026-09-18. Il nome vecchio
   era rimasto da quando qui dentro c'erano solo muratori, ma da quando
   Stefania crea anche tecnici e impiegati l'elenco conteneva un tecnico
   sotto un'intestazione che diceva «Operai» — e il pulsante prometteva
   «Nuovo operaio» per poi aprire una scheda dove si sceglie il tipo.

   Il percorso `/anagrafiche/operai` resta com'e': gli indirizzi
   girano, stanno nei preferiti, e cambiarlo romperebbe i segnalibri di
   chi lo usa da giorni per guadagnare una parola che nessuno legge.

   ── UN ELENCO A RUBRICA, dal 2026-09-23 ───────────────────────────

   Per un giorno e' stata una griglia di card; prima ancora una tabella
   di sette colonne quasi tutte trattini. L'utente: «preferisco un
   elenco con i nomi e cognomi sulla sinistra in ordine alfabetico».

   A sinistra cognome e nome, che e' come si cerca una persona. A
   destra solo tre cose, sempre nella stessa colonna: il tipo, gli
   allarmi (da inquadrare, in prova, permesso) e il costo orario.

   IL COSTO ORARIO RESTA, e resta rosa quando manca: senza tariffa le
   ore di quella persona valgono zero euro nel consuntivo del cantiere,
   ed e' il lavoro di Stefania accorgersene da qui. Quando arriveranno
   ferie maturate e contributi, avranno una colonna accanto a questa.

   GLI ALLARMI RESTANO VUOTI quando non c'e' niente da dire, che e' la
   stessa regola della home: si mostra solo cio' che chiede un'azione.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Come si chiama un tipo, in una parola, e il segno che lo distingue.
 *
 * L'EMOJI DICE DOVE STA LA PERSONA, non che mestiere fa: chiesta
 * dall'utente il 2026-09-22 — «per distinguere operaio dal tecnico,
 * insomma da chi sta in campo e chi invece in ufficio».
 *
 *   🦺  in cantiere, col gilet ad alta visibilita'
 *   🚙  il tecnico, che i cantieri li GIRA: «e' come un uccello che
 *       vola sui cantieri» (2026-09-18), quindi ne' del tutto in campo
 *       ne' del tutto in ufficio — sta in mezzo, e si muove
 *   💼  in ufficio
 *
 * NON SOSTITUISCE LA PAROLA, le sta accanto. Un'icona da sola si
 * interpreta, e due persone possono leggerla diverso; accanto al nome
 * del tipo diventa un appiglio per l'occhio, che e' cio' che serve
 * quando si scorre una griglia di nove card.
 *
 * L'emoji resta FUORI dal Badge colorato e sta prima: dentro, su un
 * fondo ambra o azzurro, si confonde col colore invece di staccarsene.
 */
const TIPI: Record<
  TipoRisorsa,
  { etichetta: string; colore: 'primario' | 'info' | 'accento'; segno: string; dove: string }
> = {
  operaio: { etichetta: 'Operaio', colore: 'primario', segno: '🦺', dove: 'in cantiere' },
  tecnico: { etichetta: 'Tecnico', colore: 'info', segno: '🚙', dove: 'gira i cantieri' },
  impiegato: { etichetta: 'Impiegato', colore: 'accento', segno: '💼', dove: 'in ufficio' },
}

export function DipendentiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: dipendenti, isPending, error } = useDipendenti({ soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico le risorse…</p>
  if (error) {
    return <Avviso tono="errore">Non riesco a leggere le risorse: {error.message}</Avviso>
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Risorse</h1>
          <p className="text-xs font-semibold text-gray-600">
            {dipendenti.length} in elenco · operai, tecnici e impiegati
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-amber-400"
              checked={conArchiviati}
              onChange={(e) => setConArchiviati(e.target.checked)}
            />
            Mostra archiviati
          </label>

          {puoScrivere && (
            <Button variante="primario" onClick={() => navigate('/anagrafiche/operai/nuovo')}>
              Nuova risorsa
            </Button>
          )}
        </div>
      </div>

      {dipendenti.length === 0 ? (
        <Vuoto>
          Nessuna risorsa in anagrafica. Qui vanno gli operai che vanno in cantiere, i
          tecnici che li seguono e chi lavora in ufficio.
        </Vuoto>
      ) : (
        <Rubrica
          voci={dipendenti}
          nome={(d) => `${d.cognome} ${d.nome}`}
          chiave={(d) => d.id}
          spenta={(d) => !d.attivo}
          onApri={(d) => navigate(`/anagrafiche/operai/${d.id}`)}
        >
          {(d) => {
            const t = tariffaVigente(d.dipendente_costi)
            const tipo = TIPI[d.tipo] ?? TIPI.operaio
            const permesso = d.permesso_soggiorno ? statoScadenza(d.permesso_scadenza) : null

            const allarmi: { testo: string; colore: 'errore' | 'attesa' }[] = []
            if (!d.attivo) allarmi.push({ testo: 'archiviato', colore: 'attesa' })
            if (d.stato_rapporto === 'da_inquadrare')
              allarmi.push({ testo: 'da inquadrare', colore: 'errore' })
            if (d.stato_rapporto === 'in_prova')
              allarmi.push({ testo: 'in prova', colore: 'attesa' })
            if (permesso === 'scaduto')
              allarmi.push({ testo: 'permesso scaduto', colore: 'errore' })
            if (permesso === 'in-scadenza' && d.permesso_scadenza)
              allarmi.push({
                testo: `permesso: ${giorniA(d.permesso_scadenza)} gg`,
                colore: 'attesa',
              })

            return (
              /* Colonne fisse a destra, cosi' tipo e costo si
                 incolonnano riga per riga e si leggono dall'alto in
                 basso. Su telefono il tipo si riduce all'emoji, che sta
                 comunque davanti al nome. */
              <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_8rem_6rem]">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    role="img"
                    aria-label={`${tipo.etichetta}, ${tipo.dove}`}
                    title={`${tipo.etichetta} — ${tipo.dove}`}
                    className="w-5 shrink-0 text-center text-base leading-none"
                  >
                    {tipo.segno}
                  </span>
                  <span className="text-sm font-extrabold text-black">
                    {d.cognome} {d.nome}
                  </span>
                  {allarmi.map((a) => (
                    <Badge key={a.testo} colore={a.colore} className="px-2 py-0.5 text-[10px]">
                      {a.testo}
                    </Badge>
                  ))}
                </span>

                <span className="hidden sm:block">
                  <Badge colore={tipo.colore} className="px-2 py-0.5 text-[10px]">
                    {tipo.etichetta}
                  </Badge>
                </span>

                <span
                  className={cn(
                    'numerico justify-self-end text-sm font-black text-black',
                    !t && 'rounded-md border-2 border-black bg-rose-300 px-2 py-0.5 text-xs',
                  )}
                  title={t ? 'Costo orario vigente' : 'Costo orario da inserire'}
                >
                  {t ? `${euro(t.costo_orario)}/h` : 'MANCA'}
                </span>
              </div>
            )
          }}
        </Rubrica>
      )}
    </div>
  )
}
