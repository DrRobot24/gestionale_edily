import { Button, Card } from '../../ui'
import { dataEstesa, giornoPiu } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'

/* ══════════════════════════════════════════════════════════════════
   Le frecce per muoversi fra i giorni.

   Chiesto dall'utente il 2026-09-15. Prima la home era inchiodata a
   oggi: una giornata dimenticata ieri si recuperava solo passando dal
   cantiere e cambiando la data nell'indirizzo, che e' una strada che
   conosce chi ha scritto il programma.

   UN GIORNO PER VOLTA, e niente salto di mese. Il tecnico compila ieri,
   oggi, al massimo l'altro ieri: e' la finestra in cui il foglio di
   giornata ha ancora senso di partire. Per sfogliare piu' lontano c'e'
   il calendario qui sotto, che salta di mese e mostra tutto il quadro —
   due gesti diversi per due domande diverse, invece di un pulsante che
   fa entrambe male.

   NON SI VA NEL FUTURO. Una giornata che non e' ancora stata lavorata
   non si compila: la freccia avanti si spegne su oggi. E' l'unico
   limite, perche' indietro non c'e' una data oltre la quale recuperare
   sia vietato — se una giornata di tre settimane fa e' rimasta aperta,
   quella e' proprio la cosa da chiudere.
   ══════════════════════════════════════════════════════════════════ */

export function BarraGiorno({
  giorno,
  onCambia,
}: {
  giorno: string
  onCambia: (g: string) => void
}) {
  const adesso = oggi()
  const eOggi = giorno === adesso

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button
          dimensione="sm"
          aria-label="Giorno precedente"
          onClick={() => onCambia(giornoPiu(giorno, -1))}
        >
          ← Giorno prima
        </Button>

        <Button
          dimensione="sm"
          aria-label="Giorno successivo"
          disabled={eOggi}
          onClick={() => onCambia(giornoPiu(giorno, 1))}
        >
          Giorno dopo →
        </Button>
      </div>

      {/* Il ritorno a oggi compare solo quando serve. Un pulsante
          «Oggi» sempre acceso, mentre sei su oggi, e' un pulsante che
          non fa niente: si impara a ignorarlo e non lo si trova piu'
          il giorno che servirebbe. */}
      {!eOggi && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold capitalize text-gray-700">{dataEstesa(giorno)}</p>
          <Button variante="primario" dimensione="sm" onClick={() => onCambia(adesso)}>
            Torna a oggi
          </Button>
        </div>
      )}
    </Card>
  )
}
