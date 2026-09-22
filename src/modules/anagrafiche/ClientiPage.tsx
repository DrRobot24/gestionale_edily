import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Vuoto, cn } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useCantieriPerCliente, useClienti } from './clienti'

export function ClientiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: clienti, isPending, error } = useClienti({ soloAttivi: !conArchiviati })

  /* QUI STAVA `useFigureRiepilogo('cliente')`, che riempiva la colonna
     Amministratore. Tolta col 2026-09-22 insieme alla colonna: le
     figure restano nella scheda del cliente e ora anche in quella del
     cantiere, che e' dove si vanno a cercare davvero.

     Al suo posto il conto dei cantieri aperti, che e' l'informazione
     che mancava: dice se un cliente e' vivo o di passaggio. */
  const { data: cantieriPer } = useCantieriPerCliente()

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico i clienti…</p>
  if (error) return <Avviso tono="errore">Non riesco a leggere i clienti: {error.message}</Avviso>

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Clienti</h1>
          <p className="text-xs font-semibold text-gray-600">
            {clienti.length} in elenco — è da qui che comincia ogni cantiere
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
            <Button variante="primario" onClick={() => navigate('/anagrafiche/clienti/nuovo')}>
              Nuovo cliente
            </Button>
          )}
        </div>
      </div>

      {clienti.length === 0 ? (
        <Vuoto>
          Nessun cliente in anagrafica. Finché non ce n&rsquo;è almeno uno non si può aprire
          un cantiere.
        </Vuoto>
      ) : (
        /* UNA GRIGLIA DI CARD, non una tabella. Dal 2026-09-22:
           «clienti e' troppo dispersiva e fredda, accorpala insomma fai
           qualcosa ma rendila piu' carina».

           Aveva ragione, e il difetto si misurava: tre colonne su uno
           schermo largo duemila pixel, meta' pagina bianca, e la
           colonna PARTITA IVA piena di trattini — sette clienti su
           dieci non ce l'hanno, perche' sono condomini e privati. Una
           colonna che per il settanta per cento dice «—» occupa spazio
           per non dire niente.

           La card risolve il contrario del problema di una tabella:
           invece di chiedere a ogni riga le stesse caselle — e lasciarle
           vuote quando il dato non c'e' — mostra solo cio' che quel
           cliente ha davvero. Un condominio senza partita IVA non ha un
           buco: ha una card piu' corta.

           STESSO LINGUAGGIO DELLE CARD DEI CANTIERI in home, che il
           tecnico usa ogni giorno: bordo nero, ombra piena, il nome
           grande e il resto sotto. Due elenchi che si guardano allo
           stesso modo si imparano una volta sola.

           L'utente ha poi confermato la direzione: «amo le griglie di
           cards». */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clienti.map((c) => {
            const quanti = cantieriPer?.get(c.id) ?? 0
            const contatto = c.email ?? c.telefono

            return (
              /* UN `button`, non una `Card` con `onClick`: la primitiva
                 e' un `div`, quindi si clicca col mouse ma non si
                 raggiunge col tab e nessun lettore di schermo la
                 annuncia come premibile. Tutta la card e' il bersaglio
                 — in una griglia il gesto naturale e' premere il
                 riquadro, non cercare un pulsante dentro — e allora
                 dev'essere un bersaglio vero.

                 Le classi della `Card` si ripetono a mano perche' la
                 primitiva non accetta un `as`: bordo, angoli e ombra
                 sono gli stessi, e `neo-press` da' l'affondamento che
                 in questo progetto dice «questo si preme». */
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/anagrafiche/clienti/${c.id}`)}
                className={cn(
                  'neo-press flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-black bg-white text-left shadow-neo transition-colors hover:bg-amber-50',
                  !c.attivo && 'bg-gray-50',
                )}
              >
                {/* Il nome e' il titolo della card e si prende lo spazio
                    che merita: e' l'unica cosa con cui si riconosce un
                    cliente. `line-clamp-2` invece di `truncate` perche'
                    «Adriana Ciancio Paratore» su una riga sola si
                    taglierebbe a meta' cognome, e due righe in una card
                    non spostano niente. */}
                {/* `min-h-28` sul corpo: l'altezza minima comune che
                    rende uguali tutte le card della pagina, non solo
                    quelle della stessa riga.

                    Senza, ogni riga della griglia si alza sulla card
                    piu' alta che contiene e le righe non si parlano fra
                    loro: un nome che va a capo, o un contatto presente
                    dove il vicino non ce l'ha, gonfiava una riga sola e
                    la pagina risultava a gradini. Stessa misura di
                    Risorse, perche' le due griglie si leggono insieme.

                    Chi ha meno da dire ha piu' aria dentro, ed e' il
                    prezzo di una griglia regolare. */}
                <div className="min-h-28 flex-1 p-4">
                  <p className="line-clamp-2 text-base font-extrabold leading-tight text-black">
                    {c.ragione_sociale}
                  </p>

                  {!c.attivo && (
                    <Badge className="mt-2 px-2 py-0.5 text-[10px]">archiviato</Badge>
                  )}

                  {/* Il contatto, se c'e'. Niente trattino quando manca:
                      in una card lo spazio non deve restare occupato da
                      un segno che dice «vuoto» — la riga semplicemente
                      non c'e'. E' la differenza con la tabella, dove il
                      trattino serviva a tenere la colonna. */}
                  {contatto && (
                    <p className="mt-2 truncate text-xs font-semibold text-gray-600">
                      {contatto}
                    </p>
                  )}
                </div>

                {/* LA FASCIA IN FONDO DICE QUANTI CANTIERI, ed e' il
                    dato che prima non c'era da nessuna parte: per
                    saperlo si doveva aprire il cliente.

                    Si contano gli ATTIVI — vedi `useCantieriPerCliente`
                    — quindi «nessun cantiere aperto» non vuol dire «non
                    ci ho mai lavorato»: lo si dice cosi', per non far
                    sembrare nuovo un cliente storico.

                    Verde quando ce n'e' almeno uno: e' l'unico colore
                    della card, e accende proprio i clienti su cui si sta
                    lavorando adesso. */}
                <div
                  className={cn(
                    'border-t-2 border-black px-4 py-2',
                    quanti > 0 ? 'bg-lime-300' : 'bg-white',
                  )}
                >
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-black">
                    {quanti === 0
                      ? 'Nessun cantiere aperto'
                      : `${quanti} ${quanti === 1 ? 'cantiere aperto' : 'cantieri aperti'}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
