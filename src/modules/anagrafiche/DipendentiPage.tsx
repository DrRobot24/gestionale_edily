import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Vuoto, cn } from '../../ui'
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

   ── UNA GRIGLIA DI CARD, dal 2026-09-22 ───────────────────────────

   Era una tabella di sette colonne, e su uno schermo largo diventava
   quasi tutta trattini: mansione vuota per tutti, data di assunzione
   per uno su nove, straordinario per nessuno. «C'e' pure moltissimo
   spazio vuoto», ha detto l'utente dopo aver visto la griglia dei
   clienti.

   La tabella ha un difetto strutturale che qui pesa: chiede a ogni
   riga le stesse caselle, e quando il dato non c'e' mette un trattino
   per tenere la colonna. La card mostra solo cio' che quella persona
   ha davvero, e chi non ha un allarme ha semplicemente una card piu'
   corta.

   ⚠️ PROGETTATA PER CRESCERE, ed e' il vincolo piu' importante.
   L'utente ha detto nello stesso momento: «ancora ci sono molte cose
   che dobbiamo aggiungere come attributi per ogni singolo operaio che
   poi e' il lavoro di Stefania, quindi ferie maturate, contributi
   etc». Quindi la card NON e' riempita fino all'orlo: ha una fascia in
   fondo — oggi il costo orario — che e' il posto dove quei numeri
   entreranno senza riprogettare niente. Chi aggiunge le ferie
   maturate mette una voce li' dentro, non sposta il resto.

   COSA RESTA FUORI, e perche'. La mansione non c'e' piu': e' vuota per
   tutti e nove, e una riga che dice «—» in ogni card e' la stessa
   colonna vuota di prima con un'altra forma. Tornera' quando
   qualcuno la compilera'. Lo straordinario nemmeno: sta nella scheda,
   accanto alla tariffa ordinaria da cui dipende.

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dipendenti.map((d) => {
            const t = tariffaVigente(d.dipendente_costi)
            const tipo = TIPI[d.tipo] ?? TIPI.operaio
            const permesso = d.permesso_soggiorno ? statoScadenza(d.permesso_scadenza) : null

            /* Gli allarmi si raccolgono PRIMA di disegnare: servono a
               sapere se la fascia esiste, e un `&&` dentro il markup
               non risponde a quella domanda senza ripetere le stesse
               tre condizioni due volte. */
            const allarmi: { testo: string; colore: 'errore' | 'attesa' }[] = []
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
              /* Un `button` e non una `Card`: la primitiva e' un `div`,
                 quindi si clicca col mouse ma non si raggiunge col tab.
                 Stessa scelta della griglia dei clienti. */
              <button
                key={d.id}
                type="button"
                onClick={() => navigate(`/anagrafiche/operai/${d.id}`)}
                className={cn(
                  'neo-press flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-black bg-white text-left shadow-neo transition-colors hover:bg-amber-50',
                  !d.attivo && 'bg-gray-50 text-gray-500',
                )}
              >
                {/* `min-h-28` sul corpo: l'altezza minima comune che
                    rende UGUALI tutte le card della pagina, non solo
                    quelle della stessa riga.

                    Senza, la griglia si comporta cosi': ogni riga si
                    alza sulla card piu' alta che contiene, e le righe
                    non si parlano fra loro. Bastava un «da inquadrare»
                    su Michalski per gonfiare tutta la riga di mezzo
                    mentre la prima e la terza restavano basse, e chi non
                    aveva niente da dire — Mancuso — si ritrovava un
                    buco bianco in mezzo alla card, stirato dal vicino.
                    Notato dall'utente il 2026-09-22: «perche' alcune
                    sono piu' alte e altre meno?».

                    La misura tiene un nome su due righe piu' una riga di
                    badge: e' il caso peggiore che l'anagrafica produce
                    oggi. Chi ha meno da dire ha piu' aria dentro, ed e'
                    il prezzo di una griglia regolare — con l'arrivo di
                    ferie e contributi quello spazio si riempira' da
                    solo. */}
                <div className="min-h-28 flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    {/* Il nome si prende due righe se serve: l'anagrafica
                        ha gia' «Michalski Velmichalak Norbert, Lucasz», e
                        tagliarlo a meta' cognome lo rende irriconoscibile
                        proprio nell'elenco dove lo si cerca. */}
                    <p className="line-clamp-2 text-base font-extrabold leading-tight text-black">
                      {d.cognome} {d.nome}
                    </p>
                    {/* `title` e `aria-label` portano la spiegazione a
                        chi passa col mouse e a chi legge con la voce:
                        un'emoji senza testo alternativo, per un lettore
                        di schermo, e' rumore o silenzio. */}
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        aria-label={`${tipo.etichetta}, ${tipo.dove}`}
                        title={`${tipo.etichetta} — ${tipo.dove}`}
                        className="text-base leading-none"
                        role="img"
                      >
                        {tipo.segno}
                      </span>
                      <Badge colore={tipo.colore} className="px-2 py-0.5 text-[10px]">
                        {tipo.etichetta}
                      </Badge>
                    </span>
                  </div>

                  {!d.attivo && (
                    <Badge className="mt-2 px-2 py-0.5 text-[10px]">archiviato</Badge>
                  )}

                  {/* La data di assunzione sotto il nome, piccola: e' un
                      dato di contorno, non il motivo per cui si apre
                      questa pagina. Compare solo se c'e'. */}
                  {d.data_assunzione && (
                    <p className="numerico mt-2 text-xs font-semibold text-gray-500">
                      dal {fmtData(d.data_assunzione)}
                    </p>
                  )}

                  {/* GLI ALLARMI, e niente quando non ce ne sono. Un
                      badge «tutto a posto» su nove card su nove sarebbe
                      inchiostro che non dice niente, e finirebbe per far
                      saltare l'occhio anche sugli altri. */}
                  {allarmi.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {allarmi.map((a) => (
                        <Badge
                          key={a.testo}
                          colore={a.colore}
                          className="px-2 py-0.5 text-[10px]"
                        >
                          {a.testo}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── LA FASCIA DEI NUMERI ──────────────────────────
                    Oggi c'e' solo il costo orario. E' il posto previsto
                    per ferie maturate, contributi e il resto del lavoro
                    di Stefania: si aggiunge una voce qui dentro e la
                    card si allunga da sola, senza toccare il sopra.

                    ROSA QUANDO LA TARIFFA MANCA, e non e' un dettaglio
                    estetico: senza tariffa le ore di questa persona
                    valgono zero euro nel consuntivo del cantiere. Va
                    gridato, non nascosto — ed e' l'unico caso in cui
                    la fascia cambia colore. */}
                <div
                  className={cn(
                    'flex items-baseline justify-between gap-2 border-t-2 border-black px-4 py-2',
                    t ? 'bg-white' : 'bg-rose-300',
                  )}
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-black">
                    Costo orario
                  </span>
                  <span className="numerico text-sm font-black text-black">
                    {t ? euro(t.costo_orario) : 'MANCA'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
