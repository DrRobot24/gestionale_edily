import { Link } from 'react-router'
import { useSession } from '../auth/SessionProvider'
import { env } from '../../lib/env'
import { Button, Card } from '../../ui'
import logoEdily from '../../assets/logo-edily.png'

/**
 * Il cartello che i clienti trovano al posto dell'applicazione.
 *
 * Non dice mai COSA stiamo costruendo — e' tutto il suo scopo: gli
 * indirizzi girano, e chi ha l'URL in cronologia non deve scoprire le
 * novita' dalla schermata di attesa. Niente elenco di moduli in arrivo,
 * niente date.
 *
 * Il link al login in fondo resta pero' necessario: il muro riconosce
 * chi entra dall'email, e l'email si sa solo dopo l'accesso. E' volutamente
 * discreto e non promette nulla a chi lo clicca senza credenziali.
 */
export function LavoriInCorso() {
  const { authSession, logout } = useSession()

  return (
    <div className="grid min-h-screen place-items-center bg-gray-900 p-6">
      <Card rilievo="lg" className="w-full max-w-lg p-8 text-center">
        {/* Lo stesso logo della pagina di login: chi arriva qui deve
            riconoscere subito di essere nel posto giusto, e non pensare
            a un indirizzo sbagliato o a un sito finito. */}
        <img
          src={logoEdily}
          alt="Edily - Your Building Solutions"
          className="mx-auto mb-6 w-56 rounded-xl border-2 border-black bg-white p-3 shadow-neo-sm"
        />

        <h1 className="mb-3 text-2xl font-extrabold text-black">Lavori in corso</h1>

        <p className="text-sm font-semibold leading-relaxed text-gray-600">
          Stiamo aggiornando {env.VITE_APP_NAME}. Il servizio torna disponibile a breve:
          i dati non si toccano, e' solo l'accesso a essere sospeso.
        </p>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-600">
          Per qualsiasi urgenza nel frattempo, contattaci come al solito.
        </p>

        <div className="mt-8 border-t-2 border-black pt-5">
          {authSession ? (
            <>
              {/* Sei entrato, ma con un'utenza che il muro non conosce.
                  Il pulsante serve a uscire e riprovare con quella
                  giusta, senza dover svuotare i cookie a mano. */}
              <p className="mb-3 text-xs font-bold text-gray-500">
                Sei collegato come {authSession.user.email}.
              </p>
              <Button dimensione="sm" onClick={logout}>
                Esci
              </Button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-xs font-bold text-gray-400 underline underline-offset-4 hover:text-black"
            >
              Accesso riservato
            </Link>
          )}
        </div>
      </Card>
    </div>
  )
}
