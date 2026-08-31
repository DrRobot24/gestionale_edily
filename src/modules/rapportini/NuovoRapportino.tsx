import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { FormRapportino } from './FormRapportino'
import { oggi, type CampiRapportino } from './campiRapportino'

export function NuovoRapportino() {
  const { org, app } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cantieri, isPending: caricoCantieri } = useCantieri()
  const { data: dipendenti, isPending: caricoDipendenti } = useDipendenti()

  const salva = useMutation({
    mutationFn: async (campi: CampiRapportino) => {
      // Numero e anno NON si passano: li assegna il database con
      // document_counters. Verificato: il primo inserimento e' uscito
      // numerato 1/2026 senza che nessuno glielo chiedesse.
      const { data: rapportino, error } = await supabase
        .from('rapportini')
        .insert({
          org_id: org!.id,
          cantiere_id: campi.cantiere_id,
          compilato_da: app!.userId,
          data: campi.data,
          ora_inizio: campi.ora_inizio || null,
          ora_fine: campi.ora_fine || null,
          meteo: campi.meteo || null,
          note: campi.note || null,
        })
        .select('id')
        .single()

      if (error) throw error

      const ore = campi.ore
        .filter((r) => r.presente || r.tipo_assenza)
        .map((r) => ({
          org_id: org!.id,
          rapportino_id: rapportino.id,
          dipendente_id: r.dipendente_id,
          ore_ordinarie: r.presente ? r.ore_ordinarie : 0,
          ore_straordinarie: r.presente ? r.ore_straordinarie : 0,
          ore_trasferta: r.presente ? r.ore_trasferta : 0,
          tipo_assenza: r.presente ? null : r.tipo_assenza || null,
        }))

      if (ore.length > 0) {
        const { error: erroreOre } = await supabase.from('rapportino_ore').insert(ore)
        // Se le ore falliscono resta un rapportino in bozza senza righe.
        // Non e' grave — una bozza si riapre e si completa — ma va detto
        // all'utente, altrimenti crede di aver salvato tutto.
        if (erroreOre) throw new Error(`Rapportino creato, ma le ore no: ${erroreOre.message}`)
      }

      return rapportino.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['rapportini'] })
      navigate(`/rapportini/${id}`)
    },
  })

  if (caricoCantieri || caricoDipendenti) {
    return <p className="text-sm font-bold text-gray-600">Preparo il rapportino…</p>
  }

  if (!cantieri?.length) {
    return (
      <Avviso tono="errore">
        Non sei assegnato a nessun cantiere, quindi non puoi compilare un rapportino.
      </Avviso>
    )
  }

  /**
   * Il rapportino piu' veloce e' quello dove tocchi solo cio' che e'
   * diverso dal solito. Quindi: squadra al completo, otto ore a testa,
   * e il compilatore toglie chi non c'era invece di aggiungere chi c'era.
   * E se il cantiere e' uno solo — il caso di quasi ogni tecnico — e'
   * gia' scelto.
   */
  const valoriIniziali: CampiRapportino = {
    cantiere_id: cantieri.length === 1 ? cantieri[0].id : '',
    data: oggi(),
    ora_inizio: '08:00',
    ora_fine: '17:00',
    meteo: '',
    note: '',
    ore: (dipendenti ?? []).map((d) => ({
      rigaId: '',
      dipendente_id: d.id,
      nominativo: `${d.cognome} ${d.nome}`,
      presente: true,
      ore_ordinarie: 8,
      ore_straordinarie: 0,
      ore_trasferta: 0,
      tipo_assenza: '',
    })),
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">Nuovo rapportino</h1>
        <p className="text-sm font-semibold text-gray-600">
          Si salva come bozza. L&rsquo;invio al titolare è un secondo passaggio.
        </p>
      </div>

      <FormRapportino
        valoriIniziali={valoriIniziali}
        cantieri={cantieri}
        etichettaSalva="Salva bozza"
        inCorso={salva.isPending}
        errore={salva.isError ? (salva.error as Error).message : undefined}
        onSalva={(c) => salva.mutate(c)}
        onAnnulla={() => navigate('/rapportini')}
      />
    </div>
  )
}
