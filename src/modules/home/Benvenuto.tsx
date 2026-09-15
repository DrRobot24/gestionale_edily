import { Card, cn } from '../../ui'
import { dataLunga, giornoPiu } from '../../lib/formato'
import { useSession } from '../auth/SessionProvider'
import { oggi } from '../rapportini/campiRapportino'

/* ══════════════════════════════════════════════════════════════════
   La fascia di benvenuto.

   Questa pagina la apre la stessa persona ogni mattina, per anni. Prima
   la accoglieva la ragione sociale dell'impresa in nero su bianco, che
   e' un'informazione che quella persona conosce gia' e che non le dice
   niente: sa benissimo per chi lavora.

   Cosa serve invece la mattina: sapere che giorno e', ed essere accolti
   da qualcuno. Da qui la data grande — e' il titolo vero della pagina,
   perche' tutto quello che c'e' sotto parla di oggi — e il saluto col
   nome.

   IL COLORE, che e' cambiato due volte e vale spiegare perche'.

   Serve un blocco pieno di colore che non stia dicendo che qualcosa non
   va: sotto ci sono rossi da compilare e gialli rimasti aperti, e
   cominciare da quelli e' un modo faticoso di aprire la giornata.

   Era un verde pieno, e il verde pieno qui e' gia' preso: in questa
   schermata dice «fatto» in piu' posti — la fascia «Pronta» sulle card,
   i puntini dell'avanzamento, il riquadro dell'invio a giornata
   completa, il badge VALIDATO (`lime-300`). Una fascia verde piena che
   saluta e basta indebolisce quel segnale, perche' insegna all'occhio
   che il verde a volte non vuol dire niente.

   Poi e' stato azzurro, per il motivo giusto sulla carta — l'azzurro qui
   porta informazione neutra (`Avviso tono="info"`, `Badge colore="info"`)
   ed e' cio' che questa fascia e'. Ma provato per qualche giorno
   l'utente ha detto che non riposa: e' un colore che chiama, e questa
   fascia deve accogliere e poi lasciare andare l'occhio a cio' che c'e'
   sotto.

   Oggi e' `emerald-100`, un verde molto pallido. Recupera il riposo del
   verde senza toccare il segnale: il «fatto» e' `lime-300` pieno e
   saturo, questo e' un fondo tenue — non si confondono nemmeno guardando
   di sfuggita. Cambia il colore, non il ruolo.
   ══════════════════════════════════════════════════════════════════ */

/**
 * `giorno` e `onCambia` arrivano insieme o non arrivano affatto.
 *
 * Senza, la fascia e' solo un saluto con la data di oggi: e' cosi' per
 * chi non compila rapportini — il titolare, l'amministrazione — a cui
 * sfogliare le giornate del tecnico non serve.
 *
 * Con, la data diventa il comando: le frecce ai suoi lati muovono il
 * giorno di tutta la home. Stavano in una barra loro, sotto; l'utente
 * le ha volute qui il 2026-09-15, e aveva ragione — la data grande era
 * gia' il titolo della pagina, e il posto naturale per cambiarla e'
 * quello dove la si legge, non un riquadro piu' in basso che ripeteva
 * l'informazione per poterla modificare.
 */
export function Benvenuto({
  giorno,
  onCambia,
}: {
  giorno?: string
  onCambia?: (g: string) => void
} = {}) {
  const { app, org } = useSession()
  const adesso = oggi()
  const mostrato = giorno ?? adesso
  const chiSei = nomeDi(app?.nome, app?.email)

  const sfogliabile = Boolean(giorno && onCambia)
  const eOggi = mostrato === adesso

  return (
    <Card className="bg-emerald-100 p-5 sm:p-6">
      {/* Il saluto guarda l'OROLOGIO, non il giorno mostrato: e' rivolto
          alla persona che sta leggendo adesso. «Buongiorno» sopra la
          data di lunedi' scorso non e' un errore da correggere — lo
          sarebbe cambiarlo, perche' nessuno sta salutando lunedi'. */}
      <p className="text-sm font-extrabold uppercase tracking-wide text-emerald-900">
        {saluto()}
        {chiSei && `, ${chiSei}`}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        {sfogliabile && (
          <FrecciaGiorno
            verso="indietro"
            onClick={() => onCambia!(giornoPiu(mostrato, -1))}
          />
        )}

        {/* `capitalize` perche' Intl in italiano scrive "giovedi 10
            settembre 2026" tutto minuscolo, e in cima a una pagina la
            minuscola sembra un refuso. */}
        <p className="text-3xl font-extrabold capitalize leading-tight text-black sm:text-4xl">
          {dataLunga(mostrato)}
        </p>

        {/* Avanti si spegne su oggi: una giornata non ancora lavorata
            non si compila. */}
        {sfogliabile && (
          <FrecciaGiorno
            verso="avanti"
            disabled={eOggi}
            onClick={() => onCambia!(giornoPiu(mostrato, 1))}
          />
        )}

        {/* Il ritorno a oggi compare solo quando sei altrove. Sempre
            acceso sarebbe un pulsante che non fa niente, e quelli si
            imparano a ignorare. */}
        {sfogliabile && !eOggi && (
          <button
            type="button"
            onClick={() => onCambia!(adesso)}
            className="neo-press rounded-xl border-2 border-black bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-black shadow-neo-sm"
          >
            Torna a oggi
          </button>
        )}
      </div>

      <p className="mt-2 text-xs font-semibold text-emerald-900">
        {org?.ragioneSociale}
        {org?.ruolo && <span className="lowercase"> · {org.ruolo}</span>}
        {app?.isPlatformAdmin && ' · staff di piattaforma'}
      </p>
    </Card>
  )
}

/** Le frecce sono grandi come la data che affiancano: in cantiere si
 *  usa il telefono con le mani sporche, e un bersaglio da 44px non e'
 *  generosita' ma la misura minima perche' si riesca a premerlo. */
function FrecciaGiorno({
  verso,
  disabled = false,
  onClick,
}: {
  verso: 'indietro' | 'avanti'
  disabled?: boolean
  onClick: () => void
}) {
  const indietro = verso === 'indietro'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={indietro ? 'Giorno precedente' : 'Giorno successivo'}
      className={cn(
        'h-11 w-11 shrink-0 rounded-xl border-2 border-black text-xl font-extrabold leading-none',
        disabled
          ? 'cursor-not-allowed bg-white/50 text-gray-300'
          : 'neo-press cursor-pointer bg-white text-black shadow-neo-sm hover:bg-amber-100',
      )}
    >
      {indietro ? '‹' : '›'}
    </button>
  )
}

/**
 * Il saluto segue l'ora dell'orologio di chi guarda.
 *
 * I confini sono quelli dell'uso italiano e non quelli dell'orologio:
 * il pomeriggio comincia dopo pranzo, non alle 12:00 in punto, e la sera
 * comincia quando in cantiere si e' smontato.
 */
function saluto(adesso = new Date()): string {
  const ora = adesso.getHours()
  if (ora < 13) return 'Buongiorno'
  if (ora < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

/**
 * Il nome scritto nel profilo, per intero: nome e cognome.
 *
 * All'inizio prendeva solo il nome di battesimo. In un ufficio dove le
 * persone si chiamano per nome e cognome, e dove dietro
 * "amministrazione" c'e' una persona con un nome, accorciarlo la rende
 * meno riconoscibile, non piu' familiare.
 *
 * Senza profilo compilato ripiega sulla parte dell'email prima della
 * chiocciola: almeno e' una parola e non un indirizzo. Se non si ricava
 * niente di decente si saluta e basta — «Buongiorno» da solo funziona,
 * «Buongiorno, tecnico@cassia.com» no.
 */
function nomeDi(nome: string | null | undefined, email: string | null | undefined): string {
  if (nome) return nome
  const locale = email?.split('@')[0]
  if (!locale) return ''
  return locale.charAt(0).toUpperCase() + locale.slice(1)
}
