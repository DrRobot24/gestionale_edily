import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { FormRapportino } from './FormRapportino'
import { useRapportino } from './rapportino'
import { modificabile } from './regole'
import type { CampiRapportino } from './campiRapportino'

export function ModificaRapportino() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { org, app } = useSession()
  const qc = useQueryClient()

  const { data: r, isPending, error } = useRapportino(id)
  const { data: cantieri } = useCantieri()
  const { data: dipendenti } = useDipendenti()

  const salva = useMutation({
    mutationFn: async (campi: CampiRapportino) => {
      const { error: eTestata } = await supabase
        .from('rapportini')
        .update({
          data: campi.data,
          ora_inizio: campi.ora_inizio || null,
          ora_fine: campi.ora_fine || null,
          meteo: campi.meteo || null,
          note: campi.note || null,
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
        const valori = {
          ore_ordinarie: riga.presente ? riga.ore_ordinarie : 0,
          ore_straordinarie: riga.presente ? riga.ore_straordinarie : 0,
          ore_trasferta: riga.presente ? riga.ore_trasferta : 0,
          tipo_assenza: riga.presente ? null : riga.tipo_assenza || null,
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
    meteo: r.meteo ?? '',
    note: r.note ?? '',
    ore: righeUnite(r.rapportino_ore ?? [], dipendenti ?? []),
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">
          Modifica rapportino {r.numero ? `n. ${r.numero}/${r.anno}` : ''}
        </h1>
        <p className="text-sm font-semibold text-gray-600">
          Resta una bozza finché non la reinvii.
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
        etichettaSalva="Salva modifiche"
        inCorso={salva.isPending}
        errore={salva.isError ? (salva.error as Error).message : undefined}
        onSalva={(c) => salva.mutate(c)}
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
  tipo_assenza: string | null
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
      tipo_assenza: s?.tipo_assenza ?? '',
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
      tipo_assenza: s.tipo_assenza ?? '',
    })
  }

  return righe
}
