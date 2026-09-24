import { useNavigate } from 'react-router'
import { Button, Card } from '../../ui'
import { numero } from '../../lib/formato'
import { useMioDipendente } from '../anagrafiche/dipendenti'
import { ORE_STANDARD } from '../rapportini/useOreGiornata'
import { useGiornataPersonale } from '../oreproprie/orePersonali'

/* ══════════════════════════════════════════════════════════════════
   Le ore di chi sta compilando.

   Chiesto dall'utente il 2026-09-15, e la ragione e' quella giusta: il
   tecnico che gira i cantieri lavora come tutti, e una giornata in cui
   l'unica persona certa di esserci stata non compare non e' il resoconto
   di quella giornata. Sono ore che vanno in busta paga.

   LE ORE STANNO NEL FOGLIO PERSONALE, NON IN UNA SQUADRA.

   Fino al 2026-09-18 questo riquadro faceva l'opposto: contava da
   `rapportino_ore` e offriva un pulsante per cantiere, «aggiungiti alla
   squadra dove hai lavorato». Era rimasto indietro rispetto alla
   decisione presa con l'utente il 2026-09-17 e gia' scritta nel
   database (`foglio-ore-personale.sql`), e da li' nasceva una
   ridondanza che l'utente ha visto subito: il tecnico aveva due strade
   per dichiarare le stesse ore, e una delle due era sbagliata.

   Con le sue parole: il tecnico «e' come un uccello che vola sui
   cantieri», quindi e' slegato dal cantiere e non deve inserirsi in
   nessuna squadra. Deve dire quante ore ha lavorato quel giorno per
   controllare i cantieri e fare il suo lavoro — «poi dove lo fa non ha
   importanza». E deve dirlo perche' senza, l'invio al titolare non
   parte.

   Quindi il conto viene da `ore_personali` e l'unico pulsante porta a
   «Le mie ore». Un cantiere qui non si nomina nemmeno: nominarlo
   rimetterebbe in testa a chi legge che una scelta ci sia.

   Il ramo «scheda non collegata» non e' un caso di errore: e'
   `dipendenti.user_id` vuoto, un'operazione che fa l'amministrazione una
   volta sola. Finche' manca, le ore non entrano nel conto e nessuno se
   ne accorge — per questo qui si dice, e si dice CHI lo risolve.
   ══════════════════════════════════════════════════════════════════ */

export function MieOre({ giorno }: { giorno: string }) {
  const navigate = useNavigate()
  const { data: mio, isPending: caricoMio } = useMioDipendente()
  const { data: giornata, isPending: caricoOre } = useGiornataPersonale(giorno)

  if (caricoMio) {
    return (
      <Card className="p-5">
        <p className="text-sm font-bold text-gray-600">Carico le tue ore…</p>
      </Card>
    )
  }

  /* Senza collegamento il gestionale non sa che persona sei in
     anagrafica: si dice cosi', e si dice CHI lo risolve. Dare la colpa
     al tecnico di una riga che non puo' scrivere lui sarebbe peggio che
     tacere. */
  if (!mio) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b-2 border-black bg-amber-200 px-5 py-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Le tue ore
          </h2>
        </div>
        <div className="grid gap-2 px-5 py-4">
          <p className="text-sm font-bold text-black">
            La tua scheda in anagrafica non è collegata a questo utente.
          </p>
          <p className="text-xs font-semibold text-gray-700">
            Finché manca, le tue ore non entrano nel conto della giornata e non arrivano in
            busta paga. Il collegamento lo fa l&rsquo;amministrazione, dalla scheda della
            persona: campo «Utente del gestionale».
          </p>
        </div>
      </Card>
    )
  }

  const ordinarie = Number(giornata?.ore_ordinarie ?? 0)
  const straordinarie = Number(giornata?.ore_straordinarie ?? 0)
  const assenza = Number(giornata?.ore_assenza ?? 0)
  const coperte = ordinarie + assenza
  const mancano = Math.max(0, ORE_STANDARD - coperte)

  /* UNA RIGA, dal 2026-09-24, come «Ore della giornata»: titolo e
     stato a sinistra, il numero a destra. Il pulsante per compilarle
     compare sotto solo quando ne mancano, che e' l'unico caso in cui
     il riquadro chiede qualcosa. */
  return (
    <Card className="grid gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">
            Le tue ore
          </h2>
          {/* NON «su tutti i cantieri»: queste ore non stanno su nessun
              cantiere, ed e' tutto il punto. */}
          <p className="text-[11px] font-semibold text-gray-600">
            {caricoOre
              ? 'Carico…'
              : `${assenza > 0 ? `${numero(assenza)} h coperte da un motivo · ` : ''}${
                  mancano > 0 ? `ne mancano ${numero(mancano)} alle ${ORE_STANDARD}` : 'giornata completa'
                }`}
          </p>
        </div>
        {!caricoOre && (
          <p className="shrink-0 text-right text-xl font-extrabold leading-none text-black">
            <span className="numerico">{numero(ordinarie)}</span> ore
            {straordinarie > 0 && (
              <span className="block text-[11px] font-bold text-gray-700">
                + <span className="numerico">{numero(straordinarie)}</span> straord.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Il giorno viaggia nell'indirizzo: chi guarda il 16 e clicca
          qui vuole compilare il 16, non oggi. */}
      {!caricoOre && mancano > 0 && (
        <Button
          dimensione="sm"
          variante="primario"
          className="w-full"
          onClick={() => navigate(`/mie-ore?data=${giorno}`)}
        >
          Compila le tue ore
        </Button>
      )}
    </Card>
  )
}
