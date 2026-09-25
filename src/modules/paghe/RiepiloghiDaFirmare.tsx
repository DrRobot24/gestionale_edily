import { useNavigate } from 'react-router'
import { Button, Card } from '../../ui'
import { useRiepiloghiDaFirmare } from './riepilogoEconomico'

/* ══════════════════════════════════════════════════════════════════
   Nella home del titolare, sopra le giornate: il Riepilogo economico
   che l'amministrazione gli ha mandato da firmare (2026-09-25).

   E' la sua seconda firma, e la piu' pesante — da li' partono i
   bonifici. Senza questo riquadro dovrebbe ricordarsi di andare a
   guardare la pagina ogni fine mese.

   Sparisce quando non c'e' niente: la home mostra cose da fare. E
   sparisce anche se la tabella non c'e' ancora (SQL non eseguito): un
   errore qui non deve sporcare la home.
   ══════════════════════════════════════════════════════════════════ */

export function RiepiloghiDaFirmare() {
  const navigate = useNavigate()
  const { data } = useRiepiloghiDaFirmare(true)
  if (!data?.length) return null

  return (
    <Card className="grid gap-2 border-black bg-yellow-100 p-4">
      {data.map(({ anno, mese }) => {
        const nome = new Date(anno, mese - 1, 1).toLocaleDateString('it-IT', {
          month: 'long',
          year: 'numeric',
        })
        const primo = `${anno}-${String(mese).padStart(2, '0')}-01`
        return (
          <div key={primo} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-black">
              Il Riepilogo economico di <span className="capitalize">{nome}</span> aspetta la tua
              firma.
            </p>
            <Button
              variante="primario"
              dimensione="sm"
              onClick={() => navigate(`/riepilogo-economico?mese=${primo}`)}
            >
              Apri
            </Button>
          </div>
        )
      })}
    </Card>
  )
}
