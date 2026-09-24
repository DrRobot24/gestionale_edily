import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Rubrica, Vuoto, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import {
  stipendioVigente,
  tariffaVigente,
  useDipendenti,
  useStipendi,
  type TipoRisorsa,
} from './dipendenti'
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

   ── UNA TABELLA A RUBRICA, dal 2026-09-24 ───────────────────────

   L'utente ha fissato le colonne: «Cognome, Nome, Mansione, Data di
   impiego, Data di assunzione, Importo stipendio (se disp.), Costo
   orario (se disp.)», con i titoli sopra come nei clienti. Sempre in
   ordine alfabetico per cognome e nome.

   Impiego e assunzione sono due date diverse: si puo' lavorare in
   prova prima del contratto, mai il contrario. Dove l'assunzione manca
   la colonna dice perche' (da inquadrare, in prova) invece di un
   trattino. Lo stipendio lo vede solo chi ha `paghe.read`.

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

/* Le colonne, uguali per i titoli e per le righe cosi' restano in
   fila. Sotto lg restano cognome (col nome accanto) e costo orario:
   sette colonne su un telefono non si leggono.

   LE COLONNE DI TESTO HANNO UN TETTO (13-14rem), dal 2026-09-24:
   divise in frazioni dello schermo, su un monitor largo cognome e
   nome finivano a mezzo metro l'uno dall'altro. Lo spazio che avanza
   va in UNA colonna sola, quella prima dei soldi, cosi' anagrafica a
   sinistra e importi a destra restano due blocchi compatti. */
const COLONNE_CON_STIPENDIO =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,14rem)_6.5rem_8rem_minmax(6.5rem,1fr)_6.5rem]'
const COLONNE_SENZA_STIPENDIO =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,14rem)_6.5rem_minmax(8rem,1fr)_6.5rem]'

export function DipendentiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: dipendenti, isPending, error } = useDipendenti({ soloAttivi: !conArchiviati })
  // Lo stipendio solo a chi fa le paghe: per gli altri la colonna non
  // esiste, e la query non parte nemmeno.
  const vedePaghe = usePermission('paghe.read')
  const { data: stipendi } = useStipendi({ abilitato: vedePaghe })
  const COLONNE = vedePaghe ? COLONNE_CON_STIPENDIO : COLONNE_SENZA_STIPENDIO

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
          intestazioneDa="lg"
          intestazione={
            <div className={cn(COLONNE, 'w-full')}>
              <span>Cognome</span>
              <span>Nome</span>
              <span>Mansione</span>
              <span>Impiego</span>
              <span>Assunzione</span>
              {vedePaghe && <span className="text-right">Stipendio</span>}
              <span className="text-right">Costo orario</span>
            </div>
          }
        >
          {(d) => {
            const t = tariffaVigente(d.dipendente_costi)
            const s = vedePaghe ? stipendioVigente(stipendi, d.id) : null
            const tipo = TIPI[d.tipo] ?? TIPI.operaio
            const permesso = d.permesso_soggiorno ? statoScadenza(d.permesso_scadenza) : null

            /* Accanto al cognome restano solo gli allarmi che nessuna
               colonna dice: archiviato e permesso di soggiorno. «Da
               inquadrare» e «in prova» stanno nella colonna
               dell'assunzione, al posto della data che manca. */
            const allarmi: { testo: string; colore: 'errore' | 'attesa' }[] = []
            if (!d.attivo) allarmi.push({ testo: 'archiviato', colore: 'attesa' })
            if (permesso === 'scaduto')
              allarmi.push({ testo: 'permesso scaduto', colore: 'errore' })
            if (permesso === 'in-scadenza' && d.permesso_scadenza)
              allarmi.push({
                testo: `permesso: ${giorniA(d.permesso_scadenza)} gg`,
                colore: 'attesa',
              })

            return (
              <div className={cn(COLONNE, 'w-full items-center gap-y-1')}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-extrabold text-black">
                    {d.cognome}
                    {/* Sotto lg la colonna del nome non c'e': il nome
                        sta accanto al cognome, come in rubrica. */}
                    <span className="lg:hidden"> {d.nome}</span>
                  </span>
                  {allarmi.map((a) => (
                    <Badge key={a.testo} colore={a.colore} className="px-2 py-0.5 text-[10px]">
                      {a.testo}
                    </Badge>
                  ))}
                </span>

                <span className="hidden truncate text-sm font-extrabold text-black lg:block">
                  {d.nome}
                </span>

                {/* La mansione scritta nella scheda; se manca, il tipo
                    (operaio, tecnico, impiegato) in grigio, che dice
                    comunque qualcosa piu' di un trattino. */}
                <span
                  className={cn(
                    'hidden truncate text-sm font-semibold lg:block',
                    d.mansione?.trim() ? 'text-gray-800' : 'text-gray-400',
                  )}
                >
                  {d.mansione?.trim() || tipo.etichetta.toLowerCase()}
                </span>

                <Data valore={d.data_impiego} />

                <span className="hidden lg:block">
                  {d.data_assunzione ? (
                    <span className="numerico text-sm font-semibold text-gray-800">
                      {fmtData(d.data_assunzione)}
                    </span>
                  ) : d.stato_rapporto === 'da_inquadrare' ? (
                    <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                      da inquadrare
                    </Badge>
                  ) : d.stato_rapporto === 'in_prova' ? (
                    <Badge colore="attesa" className="px-2 py-0.5 text-[10px]">
                      in prova
                    </Badge>
                  ) : (
                    <span className="text-sm font-semibold text-gray-400">—</span>
                  )}
                </span>

                {vedePaghe && (
                  <span
                    className={cn(
                      'numerico hidden justify-self-end text-sm lg:block',
                      s ? 'font-black text-black' : 'font-semibold text-gray-400',
                    )}
                    title={s ? `Stipendio pattuito dal ${fmtData(s.valido_dal)}` : undefined}
                  >
                    {s ? euro(s.importo_mensile) : '—'}
                  </span>
                )}

                {/* IL COSTO ORARIO RESTA ROSA QUANDO MANCA: senza
                    tariffa le ore di questa persona valgono zero euro
                    nel consuntivo del cantiere, ed e' il lavoro di
                    Stefania accorgersene da qui. */}
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

/** Una data in colonna, o un trattino grigio se manca. */
function Data({ valore }: { valore: string | null }) {
  return valore ? (
    <span className="numerico hidden text-sm font-semibold text-gray-800 lg:block">
      {fmtData(valore)}
    </span>
  ) : (
    <span className="hidden text-sm font-semibold text-gray-400 lg:block">—</span>
  )
}
