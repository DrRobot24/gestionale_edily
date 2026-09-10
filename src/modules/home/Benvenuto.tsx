import { Card } from '../../ui'
import { dataLunga } from '../../lib/formato'
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

   Il verde non e' decorazione. E' l'unico blocco pieno di colore
   dell'intera schermata che non stia dicendo che qualcosa non va: sotto
   ci sono rossi da compilare e gialli rimasti aperti, e cominciare da
   quelli e' un modo faticoso di aprire la giornata.
   ══════════════════════════════════════════════════════════════════ */

export function Benvenuto() {
  const { app, org } = useSession()
  const giorno = oggi()

  return (
    <Card className="bg-lime-200 p-5 sm:p-6">
      <p className="text-sm font-extrabold uppercase tracking-wide text-lime-900">
        {saluto()}
        {nomeDi(app?.nome, app?.email) && `, ${nomeDi(app?.nome, app?.email)}`}
      </p>

      {/* `capitalize` perche' Intl in italiano scrive "giovedi 10
          settembre 2026" tutto minuscolo, e in cima a una pagina la
          minuscola sembra un refuso. */}
      <p className="mt-1 text-3xl font-extrabold capitalize leading-tight text-black sm:text-4xl">
        {dataLunga(giorno)}
      </p>

      <p className="mt-2 text-xs font-semibold text-lime-900">
        {org?.ragioneSociale}
        {org?.ruolo && <span className="lowercase"> · {org.ruolo}</span>}
        {app?.isPlatformAdmin && ' · staff di piattaforma'}
      </p>
    </Card>
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
 * Il nome di battesimo, se c'e'. Altrimenti la parte dell'email prima
 * della chiocciola, che almeno e' una parola e non un indirizzo.
 *
 * Se non si ricava niente di decente si saluta e basta: «Buongiorno» da
 * solo funziona, «Buongiorno, tecnico@cassia.com» no.
 */
function nomeDi(nome: string | null | undefined, email: string | null | undefined): string {
  if (nome) return nome.split(' ')[0]
  const locale = email?.split('@')[0]
  if (!locale) return ''
  return locale.charAt(0).toUpperCase() + locale.slice(1)
}
