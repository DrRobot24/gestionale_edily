import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso, Percorso } from '../../ui'
import { foglio, strada, type Appartenenza } from './percorso'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { FormRapportino } from './FormRapportino'
import { useRapportino } from './rapportino'
import { modificabile } from './regole'
import { ALTRO_MOTIVO, type CampiRapportino } from './campiRapportino'

export function ModificaRapportino() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { org, app } = useSession()
  const qc = useQueryClient()

  const { data: r, isPending, error } = useRapportino(id)
  const { data: cantieri } = useCantieri()
  // Solo gli operai: tecnico e impiegati le ore le dichiarano nel
  // foglio personale, e il database rifiuta le loro righe qui.
  const { data: dipendenti } = useDipendenti({ soloOperai: true })

  const salva = useMutation({
    mutationFn: async (campi: CampiRapportino) => {
      const { error: eTestata } = await supabase
        .from('rapportini')
        .update({
          data: campi.data,
          ora_inizio: campi.ora_inizio || null,
          ora_fine: campi.ora_fine || null,
          // `meteo` non si tocca piu': il campo e' sparito dal form, e
          // riscriverlo a null qui cancellerebbe quello che c'e' scritto
          // sulle schede vecchie.
          note: campi.note || null,
          annotazioni: campi.annotazioni || null,
          nessuna_attivita: campi.nessuna_attivita,
          /**
           * Una scheda respinta che viene corretta non e' piu'
           * respinta.
           *
           * Finche' l'invio era singolo ci pensava il pulsante "Invia
           * al titolare" a rimetterla in riga. Da quando parte la
           * giornata intera quel pulsante non c'e' piu', e senza questa
           * riga la scheda resterebbe respinta per sempre: gialla nella
           * home, e il foglio bloccato senza una via d'uscita.
           *
           * `respinto -> bozza` e' una transizione ammessa e il trigger
           * la lascia passare all'autore.
           */
          ...(r?.stato === 'respinto'
            ? { stato: 'bozza' as const, motivo_rifiuto: null }
            : {}),
        })
        .eq('id', id!)
        .eq('org_id', org!.id)
      if (eTestata) throw eTestata

      /**
       * Le righe delle ore si sincronizzano per differenza, non
       * cancellando tutto e reinserendo.
       *
       * Cancellare e reinserire e' piu' semplice da scrivere, ma se
       * l'inserimento fallisce a meta' il rapportino resta senza ore e
       * il lavoro dell'utente e' perso. Qui una riga che non cambia non
       * viene toccata affatto.
       */
      for (const riga of campi.ore) {
        const vuole = riga.presente || Boolean(riga.tipo_assenza)
        // Come nella creazione: niente azzeramenti in base a
        // `presente`. Ore lavorate e ore di permesso convivono sulla
        // stessa riga, e la coerenza la garantisce il form.
        const valori = {
          ore_ordinarie: riga.ore_ordinarie,
          ore_straordinarie: riga.ore_straordinarie,
          ore_trasferta: riga.ore_trasferta,
          ore_assenza: riga.ore_assenza,
          tipo_assenza: riga.tipo_assenza || null,
          // La spiegazione si salva solo con il motivo «Altro», e si
          // azzera cambiandolo: una nota rimasta sotto un motivo che
          // non la richiede piu' e' una frase orfana che in busta paga
          // racconta qualcosa che non c'entra.
          note: riga.tipo_assenza === ALTRO_MOTIVO ? riga.note.trim() || null : null,
        }

        if (riga.rigaId && vuole) {
          const { error } = await supabase
            .from('rapportino_ore')
            .update(valori)
            .eq('id', riga.rigaId)
          if (error) throw error
        } else if (riga.rigaId && !vuole) {
          const { error } = await supabase.from('rapportino_ore').delete().eq('id', riga.rigaId)
          if (error) throw error
        } else if (!riga.rigaId && vuole) {
          const { error } = await supabase.from('rapportino_ore').insert({
            org_id: org!.id,
            rapportino_id: id!,
            dipendente_id: riga.dipendente_id,
            ...valori,
          })
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rapportino', id] })
      qc.invalidateQueries({ queryKey: ['rapportini'] })
      // Si torna alla scheda appena corretta, non al posto da cui si
      // era partiti: chi ha appena salvato vuole rileggere quello che
      // ha scritto. Da li' la freccia porta al cantiere.
      navigate(`/rapportini/${id}`)
    },
  })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico il rapportino…</p>
  if (error) return <Avviso tono="errore">Non trovo questo rapportino: {error.message}</Avviso>

  // Doppio cancello, perche' l'URL si digita a mano. Quello vero resta
  // comunque la RLS: senza i requisiti, l'update torna zero righe.
  if (!modificabile(r.stato)) {
    return (
      <Avviso tono="errore">
        Questo rapportino è in stato <strong>{r.stato}</strong> e non si modifica più. Solo le
        bozze e i rapportini respinti si possono correggere.
      </Avviso>
    )
  }
  if (r.compilato_da !== app?.userId) {
    return <Avviso tono="errore">Puoi modificare solo i rapportini che hai scritto tu.</Avviso>
  }

  // Il cantiere del foglio, per il percorso: qui non si cambia, il
  // campo e' bloccato nel form.
  const dove: Appartenenza = {
    cantiereId: r.cantiere_id,
    data: r.data,
    codice: r.cantieri?.codice,
    denominazione: r.cantieri?.denominazione,
  }

  /**
   * Le righe partono da quelle gia' salvate, e in coda si aggiungono i
   * dipendenti che non c'erano — cosi' chi si vede respingere il
   * rapportino con "mancano le ore di Marino" trova Marino nell'elenco,
   * da spuntare.
   *
   * L'ordine conta: prima chi c'era gia' (con i suoi valori), poi gli
   * assenti. Chi era stato archiviato nel frattempo resta comunque in
   * lista, perche' ha lavorato davvero quel giorno.
   */
  const valoriIniziali: CampiRapportino = {
    cantiere_id: r.cantiere_id,
    data: r.data,
    ora_inizio: r.ora_inizio?.slice(0, 5) ?? '',
    ora_fine: r.ora_fine?.slice(0, 5) ?? '',
    note: r.note ?? '',
    annotazioni: r.annotazioni ?? '',
    nessuna_attivita: r.nessuna_attivita ?? false,
    ore: righeUnite(r.rapportino_ore ?? [], dipendenti ?? []),
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      {/* Da un modulo si torna alla scheda che si stava correggendo,
          sempre: e' da li' che si e' entrati, e da li' si risale al
          cantiere con un altro passo. Il percorso intanto racconta
          tutta la strada, cantiere compreso. */}
      <Percorso
        indietro={{ etichetta: 'Scheda', a: `/rapportini/${id}` }}
        qui={strada(
          dove,
          { ...foglio(r.numero, r.anno), a: `/rapportini/${id}` },
          { etichetta: 'Modifica' },
        )}
      />

      <div>
        <h1 className="text-2xl font-extrabold text-black">
          Modifica rapportino {r.numero ? `n. ${r.numero}/${r.anno}` : ''}
        </h1>
        <p className="text-sm font-semibold text-gray-600">
          Le modifiche restano nella scheda: al titolare parte tutta la giornata insieme,
          dalla home.
        </p>
      </div>

      {r.stato === 'respinto' && r.motivo_rifiuto && (
        <Avviso tono="errore">
          <strong>Da correggere:</strong> {r.motivo_rifiuto}
        </Avviso>
      )}

      <FormRapportino
        valoriIniziali={valoriIniziali}
        cantieri={cantieri ?? []}
        bloccaCantiere
        // La scheda esiste: le foto scelte qui partono subito, senza
        // aspettare il salvataggio.
        scheda={{ rapportinoId: id!, orgId: org!.id, cantiereId: r.cantiere_id }}
        etichettaSalva="Salva modifiche"
        inCorso={salva.isPending}
        errore={salva.isError ? (salva.error as Error).message : undefined}
        onSalva={(campi) => salva.mutate(campi)}
        onAnnulla={() => navigate(`/rapportini/${id}`)}
      />
    </div>
  )
}

type RigaSalvata = {
  id: string
  dipendente_id: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_trasferta: number
  ore_assenza: number
  tipo_assenza: string | null
  note: string | null
  dipendenti: { nome: string; cognome: string; matricola: string | null } | null
}

type Attivo = { id: string; nome: string; cognome: string }

/**
 * Unisce le righe gia' salvate con i dipendenti attivi che non ci sono
 * ancora, senza perdere nessuno dei due insiemi.
 *
 * L'abbinamento e' su `dipendente_id`, mai su nome e cognome: due
 * omonimi in azienda non sono un caso di scuola, e sbagliare qui
 * sposterebbe le ore di uno sull'altro.
 *
 * Chi era sul rapportino ma nel frattempo e' stato archiviato resta in
 * elenco: ha lavorato davvero quel giorno, e toglierlo cancellerebbe le
 * sue ore al primo salvataggio.
 */
function righeUnite(salvate: RigaSalvata[], attivi: Attivo[]) {
  const perDipendente = new Map(salvate.map((s) => [s.dipendente_id, s]))
  const visti = new Set<string>()
  const righe = []

  for (const d of attivi) {
    const s = perDipendente.get(d.id)
    if (s) visti.add(d.id)
    righe.push({
      rigaId: s?.id ?? '',
      dipendente_id: d.id,
      nominativo: `${d.cognome} ${d.nome}`,
      presente: s ? !s.tipo_assenza : false,
      ore_ordinarie: s ? Number(s.ore_ordinarie) : 0,
      ore_straordinarie: s ? Number(s.ore_straordinarie) : 0,
      ore_trasferta: s ? Number(s.ore_trasferta) : 0,
      ore_assenza: s ? Number(s.ore_assenza) : 0,
      tipo_assenza: s?.tipo_assenza ?? '',
      note: s?.note ?? '',
      /* Chi arriva dal database nasce CONFERMATO: quelle ore sono gia'
         state scritte e salvate una volta. Chiedere di rispuntarle tutte
         per correggere una virgola nella descrizione sarebbe far
         ricontrollare l'intera squadra a ogni modifica. */
      confermata: Boolean(s),
    })
  }

  for (const s of salvate) {
    if (visti.has(s.dipendente_id)) continue
    righe.push({
      rigaId: s.id,
      dipendente_id: s.dipendente_id,
      nominativo: s.dipendenti
        ? `${s.dipendenti.cognome} ${s.dipendenti.nome} (archiviato)`
        : 'Dipendente rimosso',
      presente: !s.tipo_assenza,
      ore_ordinarie: Number(s.ore_ordinarie),
      ore_straordinarie: Number(s.ore_straordinarie),
      ore_trasferta: Number(s.ore_trasferta),
      ore_assenza: Number(s.ore_assenza),
      tipo_assenza: s.tipo_assenza ?? '',
      note: s.note ?? '',
      confermata: true,
    })
  }

  return righe
}
