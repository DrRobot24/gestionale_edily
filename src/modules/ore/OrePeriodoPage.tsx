import { useState } from 'react'
import { Avviso, Badge, Button, Card, Table, Cifra, RigaTotale, Vuoto, cn } from '../../ui'
import {
  conPasso,
  contieneOggi,
  etichetta,
  funzioneMancante,
  giornoBreve,
  nelFuturo,
  ore,
  oreSenzaCantiere,
  perPersona,
  periodoCorrente,
  sposta,
  totaliDi,
  useGiornateInSospeso,
  useOrePeriodo,
  useOrePeriodoCantieri,
  type OreCantiere,
  type OrePersona,
  type Passo,
} from './useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   LE ORE PER PERSONA — la pagina dell'amministrazione.

   Chiude un buco aperto da noi. Il 2026-09-15 i rapportini sono usciti
   dal menu dell'amministrazione — provato in ufficio, a Stefania non
   interessano — ma il sostituto non c'era, e da allora lei non aveva
   NESSUNA strada per leggere le ore che deve elaborare.

   Non e' l'elenco dei rapportini con un filtro sopra. Il rapportino e'
   il documento della giornata di un cantiere; questa e' la riga di una
   persona su un periodo, che e' cio' su cui si mettono le tariffe e da
   cui esce la busta paga.

   LE DECISIONI DELL'UTENTE (2026-09-21):

     settimana E mese     la settimana e' il ritmo del controllo, il
                          mese quello della firma. Un interruttore, non
                          due pagine.
     solo i validati      e' il senso del flusso: il titolare filtra con
                          la sua esperienza, e se si lavorasse anche
                          sulle bozze il suo giudizio sarebbe decorativo
     dettaglio per        non una colonna in piu': e' il mattone che
     cantiere             regge anche lo storico del cantiere e lo
                          storico delle lavorazioni di ogni risorsa
     le attivita' svolte  «dove sono le descrizioni delle attivita'?» —
                          portate su da `rapportini.note`, una per
                          cantiere e giornata

   NIENTE SOMME NEL BROWSER sui dati grezzi: i totali arrivano gia'
   fatti da funzioni `security definer`, perche' le viste sono
   `security_invoker=on` e a chi non ha cantieri assegnati — Stefania —
   tornerebbero zero senza nessun errore.
   ══════════════════════════════════════════════════════════════════ */

export function OrePeriodoPage() {
  const [periodo, setPeriodo] = useState(() => periodoCorrente('settimana'))
  const [aperte, setAperte] = useState<ReadonlySet<string>>(new Set())

  const persone = useOrePeriodo(periodo)
  const cantieri = useOrePeriodoCantieri(periodo)
  const sospeso = useGiornateInSospeso(periodo)

  const righe = persone.data ?? []
  const dettaglio = perPersona(cantieri.data ?? [])
  const totali = totaliDi(righe)

  /* Mai nel futuro. Un periodo che deve ancora cominciare non ha ore da
     validare, e offrirlo come se avesse un contenuto fa cercare un
     errore dove c'e' solo il calendario. */
  const prossimo = sposta(periodo, 1)

  function apriChiudi(id: string) {
    setAperte((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(id)) dopo.delete(id)
      else dopo.add(id)
      return dopo
    })
  }

  /* Cambiando passo si resta dentro lo stesso momento invece di saltare
     a oggi: chi sta guardando la terza settimana di agosto e passa al
     mese vuole agosto, non settembre. */
  function cambiaPasso(passo: Passo) {
    setPeriodo((p) => conPasso(p, passo))
    setAperte(new Set())
  }

  const errore = persone.error as Error | null
  if (errore && funzioneMancante(errore)) {
    return (
      <div className="space-y-4">
        <Testata />
        <Avviso tono="errore">
          Le funzioni delle ore non sono ancora nel database. Vanno eseguiti
          <code className="mx-1">supabase/schema/ore-settimana.sql</code>e
          <code className="mx-1">supabase/schema/ore-periodo.sql</code>.
        </Avviso>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Testata />

      {/* ── La barra del periodo ──────────────────────────────────
          Le frecce stanno ai lati della data e non in una barra loro:
          e' la stessa scelta fatta in home il 2026-09-15, dove la data
          grande era gia' il titolo della pagina. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-emerald-100">
        <div className="flex items-center gap-3">
          <Button
            variante="secondario"
            onClick={() => setPeriodo(sposta(periodo, -1))}
            aria-label={periodo.passo === 'mese' ? 'Mese precedente' : 'Settimana precedente'}
          >
            ‹
          </Button>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              {periodo.passo === 'mese' ? 'Mese' : 'Settimana'}
            </div>
            <div className="text-xl font-black leading-tight">{etichetta(periodo)}</div>
          </div>
          <Button
            variante="secondario"
            onClick={() => setPeriodo(prossimo)}
            disabled={nelFuturo(prossimo)}
            aria-label={periodo.passo === 'mese' ? 'Mese successivo' : 'Settimana successiva'}
          >
            ›
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* L'interruttore. Due bottoni e non una tendina: le scelte
              sono due, e una tendina da due voci chiede un click in
              piu' per dire una cosa che sta gia' tutta sullo schermo. */}
          <div className="flex overflow-hidden rounded-xl border-2 border-black">
            {(['settimana', 'mese'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => cambiaPasso(p)}
                aria-pressed={periodo.passo === p}
                className={cn(
                  'px-4 py-2 text-xs font-bold uppercase tracking-wide',
                  periodo.passo === p
                    ? 'bg-amber-400 text-black'
                    : 'bg-white text-gray-600 hover:bg-amber-50',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {!contieneOggi(periodo) && (
            <Button
              variante="secondario"
              onClick={() => setPeriodo(periodoCorrente(periodo.passo))}
            >
              {periodo.passo === 'mese' ? 'Questo mese' : 'Questa settimana'}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Cosa non e' ancora arrivato ───────────────────────────
          Il numero piu' importante della pagina, e non sta nei totali.
          Se tre giornate sono ferme da Giuseppe il totale e' parziale e
          SEMBRA completo, e un totale che sembra completo finisce in
          busta paga. */}
      <InSospeso righe={sospeso.data ?? []} />

      {persone.isLoading ? (
        <Card className="p-5 text-sm font-bold text-gray-600">Sto leggendo le ore…</Card>
      ) : errore ? (
        <Avviso tono="errore">{errore.message}</Avviso>
      ) : righe.length === 0 ? (
        <Vuoto>
          Nessuna ora validata in questo periodo. Se il tecnico ha compilato, le
          giornate sono ancora in attesa del titolare.
        </Vuoto>
      ) : (
        <Table>
          {/* Le colonne dei numeri hanno una larghezza FISSA e stretta,
              la persona si prende il resto.

              Senza questo le cinque colonne di numeri si spartivano lo
              spazio in parti uguali: ognuna diventava larghissima, il
              numero restava incollato al suo bordo destro e finiva a
              meta' strada fra due intestazioni. «Non si capisce a chi
              appartengono», ha detto l'utente il 2026-09-21 guardando la
              pagina, e aveva ragione — una cifra sola dentro una cella
              di trecento pixel non appartiene visivamente a niente. */}
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr>
              <th />
              <th>Persona</th>
              <th className="border-l-2 border-black text-right">Ordinarie</th>
              <th className="text-right">Straordinarie</th>
              <th className="text-right">Trasferta</th>
              <th className="text-right">Assenze</th>
              <th className="text-right">Giorni</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((p) => (
              <RigaPersona
                key={p.dipendente_id}
                persona={p}
                suoiCantieri={dettaglio.get(p.dipendente_id) ?? []}
                aperta={aperte.has(p.dipendente_id)}
                caricando={cantieri.isLoading}
                onApri={() => apriChiudi(p.dipendente_id)}
              />
            ))}
            <RigaTotale>
              <td />
              <td className="uppercase">
                Totale {periodo.passo === 'mese' ? 'mese' : 'settimana'}
              </td>
              <Cifra className="border-l-2 border-black">{ore(totali.ordinarie)}</Cifra>
              <Cifra>{ore(totali.straordinarie)}</Cifra>
              <Cifra>{ore(totali.trasferta)}</Cifra>
              <Cifra>{ore(totali.assenza)}</Cifra>
              {/* I giorni NON si sommano: due persone che lavorano lo
                  stesso lunedi' fanno una giornata di cantiere, non
                  due. Sommarli darebbe «giornate/uomo», un'altra
                  grandezza con lo stesso nome. */}
              <td />
            </RigaTotale>
          </tbody>
        </Table>
      )}
    </div>
  )
}

function Testata() {
  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight">Ore per persona</h1>
      <p className="text-xs font-bold text-gray-600">
        Solo le giornate validate dal titolare
      </p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Le giornate ancora per strada.

   Si dice CHE cosa manca e QUANTO, mai di chi: qui non si viene a
   cercare un colpevole, si viene a sapere se ci si puo' fidare del
   totale. Il posto dove si sollecita e' un altro.
   ───────────────────────────────────────────────────────────────── */
function InSospeso({ righe }: { righe: { stato: string; giornate: number }[] }) {
  if (righe.length === 0) return null

  const totale = righe.reduce((s, r) => s + Number(r.giornate), 0)
  const dettagli = righe.map((r) => `${r.giornate} ${r.stato}`).join(' · ')

  return (
    <Avviso tono="errore">
      {totale === 1 ? "C'è 1 giornata" : `Ci sono ${totale} giornate`} non ancora
      validata{totale === 1 ? '' : 'e'} dal titolare in questo periodo ({dettagli}).
      I totali qui sotto sono parziali.
    </Avviso>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Una persona, con il suo dettaglio sotto.

   Chiusa di default: venti righe aperte sono un muro, e la domanda
   della prima occhiata e' «quante ore ha fatto Mario», non «dove».
   ───────────────────────────────────────────────────────────────── */
function RigaPersona({
  persona,
  suoiCantieri,
  aperta,
  caricando,
  onApri,
}: {
  persona: OrePersona
  suoiCantieri: OreCantiere[]
  aperta: boolean
  caricando: boolean
  onApri: () => void
}) {
  const fuori = oreSenzaCantiere(persona, suoiCantieri)

  /* Quanti cantieri e quante giornate raccontate: si dichiara PRIMA di
     aprire. Un «+» non promette niente, e l'informazione piu'
     importante della pagina — dove sono stati e cosa hanno fatto —
     stava dietro un click che nessuno aveva motivo di provare. */
  const conAttivita = suoiCantieri.reduce(
    (s, c) => s + (c.giorni_attivita?.length ?? 0),
    0,
  )

  return (
    <>
      <tr className={cn(aperta && 'bg-amber-50')}>
        <td>
          <button
            type="button"
            onClick={onApri}
            aria-expanded={aperta}
            aria-label={
              aperta
                ? `Chiudi il dettaglio di ${persona.nominativo}`
                : `Apri il dettaglio di ${persona.nominativo}`
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-white font-black hover:bg-amber-200"
          >
            {aperta ? '−' : '+'}
          </button>
        </td>
        <td>
          <button
            type="button"
            onClick={onApri}
            className="block text-left hover:underline"
          >
            <span className="font-bold uppercase">{persona.nominativo}</span>
            {persona.matricola && (
              <span className="ml-2 text-[10px] font-bold text-gray-500">
                matr. {persona.matricola}
              </span>
            )}
            {persona.assenze && (
              <Badge className="ml-2 bg-rose-300">{persona.assenze}</Badge>
            )}
            {!aperta && suoiCantieri.length > 0 && (
              <span className="block text-[11px] font-semibold text-gray-500">
                {suoiCantieri.length}{' '}
                {suoiCantieri.length === 1 ? 'cantiere' : 'cantieri'}
                {conAttivita > 0 &&
                  ` · ${conAttivita} ${conAttivita === 1 ? 'giornata descritta' : 'giornate descritte'}`}
              </span>
            )}
          </button>
        </td>
        <Cifra className="border-l-2 border-black">{ore(persona.ore_ordinarie)}</Cifra>
        <Cifra className={cn(Number(persona.ore_straordinarie) > 0 && 'bg-amber-100')}>
          {ore(persona.ore_straordinarie)}
        </Cifra>
        <Cifra>{ore(persona.ore_trasferta)}</Cifra>
        <Cifra>{ore(persona.ore_assenza)}</Cifra>
        {/* I giorni in grigio: non sono ore, e allo stesso peso si
            leggerebbero come la quinta colonna di un totale. */}
        <Cifra className="font-semibold text-gray-500">{persona.giorni_lavorati}</Cifra>
      </tr>

      {aperta && (
        <tr className="bg-amber-50">
          <td />
          <td colSpan={6} className="pb-3">
            <Dettaglio
              cantieri={suoiCantieri}
              fuori={fuori}
              tipo={persona.tipo}
              caricando={caricando}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function Dettaglio({
  cantieri,
  fuori,
  tipo,
  caricando,
}: {
  cantieri: OreCantiere[]
  fuori: number
  tipo: string
  caricando: boolean
}) {
  if (caricando) {
    return <div className="text-xs font-bold text-gray-600">Sto leggendo i cantieri…</div>
  }

  return (
    <div className="space-y-2">
      {cantieri.map((c) => (
        <div key={c.cantiere_id} className="overflow-hidden rounded-lg border-2 border-black bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black bg-gray-100 px-3 py-2">
            <div>
              {/* Il NOME del cantiere, non il codice. Stessa regola
                  applicata ai lavori extra il 2026-09-15: il codice lo
                  conosce chi lo ha scritto, il nome lo riconoscono
                  tutti. */}
              <span className="text-sm font-black">{c.cantiere}</span>
              <span className="ml-2 text-[10px] font-bold text-gray-500">
                {c.cantiere_codice}
              </span>
            </div>
            <div className="numerico text-xs font-bold">
              {ore(c.ore_ordinarie)} ord
              {Number(c.ore_straordinarie) > 0 && ` · ${ore(c.ore_straordinarie)} str`}
              {Number(c.ore_trasferta) > 0 && ` · ${ore(c.ore_trasferta)} tras`}
              <span className="ml-2 font-semibold text-gray-500">
                {c.giorni} {c.giorni === 1 ? 'giorno' : 'giorni'}
              </span>
            </div>
          </div>

          {/* COSA E' STATO FATTO, giornata per giornata.

              Viene da `rapportini.note`, che nel form si chiama
              «Descrizione attività»: e' UNA per cantiere e giorno, non
              una per persona. Il tecnico scrive «gettato il solaio del
              primo piano», non chi ha fatto cosa — e va bene cosi',
              perche' chiedergli una riga per ognuno sarebbe otto campi
              al giorno con otto in squadra.

              `whitespace-pre-wrap` perche' il campo e' un'area di testo
              dal 2026-09-18: misure e calcoli vanno a capo, e
              schiacciarli butterebbe via il motivo per cui il campo e'
              largo. */}
          {c.giorni_attivita && c.giorni_attivita.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {c.giorni_attivita.map((g) => (
                <li key={g.data} className="flex gap-3 px-3 py-2">
                  <span className="w-16 shrink-0 text-[11px] font-black uppercase text-gray-500">
                    {giornoBreve(g.data)}
                  </span>
                  <span className="whitespace-pre-wrap text-xs font-semibold text-gray-800">
                    {g.descrizione}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            /* Si dice che manca, invece di non mostrare niente: una
               sezione che sparisce fa pensare che la pagina non sappia
               fare quella cosa, quando il fatto e' che nessuno l'ha
               scritta. */
            <p className="px-3 py-2 text-[11px] font-semibold text-gray-500">
              Nessuna descrizione delle attività su questo cantiere.
            </p>
          )}
        </div>
      ))}

      {/* Le ore che non stanno su nessun cantiere: il foglio ore
          personale del tecnico e di chi sta in ufficio. Lo si DICE,
          invece di lasciarlo dedurre da una sottrazione fra il totale
          della riga e la somma dei cantieri. */}
      {fuori > 0 && (
        <div className="rounded-lg border-2 border-black bg-sky-100 px-3 py-2 text-xs font-bold">
          {ore(fuori)} ore non su un cantiere singolo
          {tipo === 'tecnico'
            ? ' — il tecnico gira tutti i cantieri e le segna nel foglio suo.'
            : tipo === 'impiegato'
              ? ' — lavoro in ufficio.'
              : '.'}
        </div>
      )}

      {cantieri.length === 0 && fuori === 0 && (
        <div className="text-xs font-bold text-gray-600">
          Solo assenze in questo periodo.
        </div>
      )}
    </div>
  )
}
