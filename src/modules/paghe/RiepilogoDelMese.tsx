import { useNavigate } from 'react-router'
import { Button, Card, cn } from '../../ui'
import { daIso } from '../ore/useOrePeriodo'
import { tabellaMancante, useMesePaghe, type MesePaghe } from './riepilogoEconomico'

/* ══════════════════════════════════════════════════════════════════
   A che punto e' il Riepilogo economico — in home a chi lo prepara.
   Dal 2026-09-28, insieme alle frecce nella fascia di Stefania.

   E' il suo appuntamento di fine mese, e fino a oggi la home non ne
   diceva niente: il titolare ha `RiepiloghiDaFirmare`, lei doveva
   ricordarsi di andare a guardare — anche quando Giuseppe glielo
   rimandava indietro col motivo.

   SEGUE IL GIORNO DELLA FASCIA, come tutto il resto della home:
   sfogliando fino ad agosto si legge il riepilogo di agosto. In piu',
   se il mese SCORSO rispetto a oggi non e' ancora firmato, compare
   sopra: e' la cosa da fare, e non deve dipendere da dove sono le
   frecce.
   ══════════════════════════════════════════════════════════════════ */

export function RiepilogoDelMese({ giorno }: { giorno: string }) {
  const d = daIso(giorno)
  const guardato = { anno: d.getFullYear(), mese: d.getMonth() + 1 }

  const adesso = new Date()
  const s = new Date(adesso.getFullYear(), adesso.getMonth() - 1, 1)
  const scorso = { anno: s.getFullYear(), mese: s.getMonth() + 1 }
  const stesso = scorso.anno === guardato.anno && scorso.mese === guardato.mese

  const qGuardato = useMesePaghe(guardato.anno, guardato.mese)
  const qScorso = useMesePaghe(scorso.anno, scorso.mese)

  // Lo SQL non eseguito non sporca la home.
  if (tabellaMancante(qGuardato.error)) return null
  if (qGuardato.isPending) return null

  const scorsoAperto =
    !stesso && !qScorso.isPending && !qScorso.error && qScorso.data?.stato !== 'validato'

  return (
    <Card className="grid divide-y-2 divide-black overflow-hidden">
      {scorsoAperto && <Riga {...scorso} stato={qScorso.data ?? null} inCorso={false} />}
      <Riga
        {...guardato}
        stato={qGuardato.data ?? null}
        inCorso={
          guardato.anno === adesso.getFullYear() && guardato.mese === adesso.getMonth() + 1
        }
      />
    </Card>
  )
}

function Riga({
  anno,
  mese,
  stato,
  inCorso,
}: {
  anno: number
  mese: number
  stato: MesePaghe | null
  inCorso: boolean
}) {
  const navigate = useNavigate()
  const nome = new Date(anno, mese - 1, 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  })
  const primo = `${anno}-${String(mese).padStart(2, '0')}-01`

  /* Quattro situazioni, e solo una chiede qualcosa con urgenza: il
     riepilogo rimandato indietro. Una bozza con un motivo scritto e'
     esattamente quello — il titolare l'ha respinto e ha detto perche'. */
  const respinto = stato?.stato === 'bozza' && Boolean(stato.motivo)
  let frase: string
  let fondo: string
  if (stato?.stato === 'validato') {
    frase = 'Firmato dal titolare: in archivio.'
    fondo = 'bg-white'
  } else if (stato?.stato === 'inviato') {
    frase = 'Inviato: aspetta la firma del titolare.'
    fondo = 'bg-white'
  } else if (respinto) {
    frase = `Rimandato indietro: ${stato!.motivo}`
    fondo = 'bg-rose-100'
  } else if (inCorso) {
    frase = 'Mese in corso: si chiude a fine mese.'
    fondo = 'bg-white'
  } else {
    frase = 'Da preparare e inviare al titolare.'
    fondo = 'bg-yellow-100'
  }

  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-2.5', fondo)}>
      <div className="min-w-0">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">
          Riepilogo economico · <span className="capitalize">{nome}</span>
        </h2>
        <p
          className={cn(
            'text-[11px] font-semibold',
            respinto ? 'font-bold text-rose-800' : 'text-gray-700',
          )}
        >
          {frase}
        </p>
      </div>
      <Button
        dimensione="sm"
        variante={fondo === 'bg-white' ? 'secondario' : 'primario'}
        className="shrink-0"
        onClick={() => navigate(`/riepilogo-economico?mese=${primo}`)}
      >
        Apri
      </Button>
    </div>
  )
}
