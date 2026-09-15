import { useNavigate } from 'react-router'
import { Button, Card } from '../../ui'
import { numero } from '../../lib/formato'
import { useMioDipendente } from '../anagrafiche/dipendenti'
import { useCantieri } from '../cantieri/useCantieri'
import { ORE_STANDARD, useOreGiornata } from '../rapportini/useOreGiornata'

/* ══════════════════════════════════════════════════════════════════
   Le ore di chi sta compilando.

   Chiesto dall'utente il 2026-09-15, e la ragione e' quella giusta: il
   tecnico che passa in cantiere lavora come tutti, e una giornata in cui
   l'unica persona certa di esserci stata non compare non e' il resoconto
   di quella giornata. Sono ore che vanno in busta paga e sul costo del
   cantiere come quelle degli operai.

   NON APRE UNA SEZIONE NUOVA, ed e' una decisione non un ripiego. Le ore
   del tecnico si segnano DENTRO il rapportino del cantiere, aggiungendosi
   alla squadra: e' l'unico posto dove hanno una data e un cantiere, e con
   piu' cantieri in un giorno vanno spezzate fra quelli. Una pagina «le
   mie ore» che scrivesse dovrebbe comunque chiedere su quale cantiere —
   cioe' rifare il rapportino con un nome diverso, e con due strade per
   scrivere la stessa riga prima o poi le due divergono.

   Quindi questo riquadro RACCONTA e INDIRIZZA: dice quante ore risultano
   segnate, quante ne mancano alle otto, e porta al cantiere dove
   aggiungersi. Un pulsante per cantiere, perche' quale sia lo sa solo
   chi c'e' stato.

   Il ramo «scheda non collegata» non e' un caso di errore: e'
   `dipendenti.user_id` vuoto, un'operazione che fa l'amministrazione una
   volta sola. Finche' manca, le ore del tecnico non entrano nel conto e
   nessuno se ne accorge — per questo qui si dice, invece di restare
   spenti come faceva il vecchio avviso, che senza collegamento non
   compariva affatto.
   ══════════════════════════════════════════════════════════════════ */

export function MieOre({ giorno }: { giorno: string }) {
  const navigate = useNavigate()
  const { data: mio, isPending: caricoMio } = useMioDipendente()
  const { data: ore, isPending: caricoOre } = useOreGiornata(giorno)
  const { data: cantieri } = useCantieri()

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
            La tua scheda operaio non è collegata a questo utente.
          </p>
          <p className="text-xs font-semibold text-gray-700">
            Finché manca, le tue ore non entrano nel conto della giornata e non arrivano in
            busta paga. Il collegamento lo fa l&rsquo;amministrazione, dalla scheda operaio:
            campo «Utente del gestionale».
          </p>
        </div>
      </Card>
    )
  }

  const mia = (ore ?? []).find((p) => p.dipendente_id === mio.id)
  const ordinarie = Number(mia?.ore_ordinarie ?? 0)
  const straordinarie = Number(mia?.ore_straordinarie ?? 0)
  const assenza = Number(mia?.ore_assenza ?? 0)
  const coperte = ordinarie + assenza
  const mancano = Math.max(0, ORE_STANDARD - coperte)

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo')

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-white px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Le tue ore
        </h2>
        <p className="text-xs font-semibold text-gray-600">
          {mio.cognome} {mio.nome} · su tutti i cantieri della giornata
        </p>
      </div>

      <div className="grid gap-3 px-5 py-4">
        {caricoOre ? (
          <p className="text-sm font-bold text-gray-600">Carico…</p>
        ) : (
          <>
            <div>
              <p className="text-2xl font-extrabold leading-none text-black">
                <span className="numerico">{numero(ordinarie)}</span> ore
                {straordinarie > 0 && (
                  <span className="text-base font-bold text-gray-700">
                    {' '}
                    + <span className="numerico">{numero(straordinarie)}</span> straord.
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-600">
                {assenza > 0 && <>{numero(assenza)} ore coperte da un motivo · </>}
                {mancano > 0
                  ? `ne mancano ${numero(mancano)} alle ${ORE_STANDARD}`
                  : `la tua giornata è completa`}
              </p>
            </div>

            {/* I cantieri come pulsanti, uno per uno: quale sia quello
                dove ha lavorato lo sa solo lui, e sceglierlo noi
                sarebbe un'ipotesi travestita da comodita'. */}
            {mancano > 0 && attivi.length > 0 && (
              <div className="grid gap-2 border-t-2 border-dashed border-gray-300 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
                  Aggiungiti alla squadra dove hai lavorato
                </p>
                {attivi.map((c) => (
                  <Button
                    key={c.id}
                    dimensione="sm"
                    className="w-full justify-start text-left"
                    onClick={() => navigate(`/cantieri/${c.id}?data=${giorno}`)}
                  >
                    {c.codice} — {c.denominazione}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
