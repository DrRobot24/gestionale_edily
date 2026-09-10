import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso, Button, Card } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { FormRapportino } from './FormRapportino'
import { caricaFoto } from './useFoto'
import { oggi, type CampiRapportino } from './campiRapportino'

export function NuovoRapportino() {
  const { org, app } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()

  // Si arriva qui anche dalle card della home, che hanno gia' deciso
  // quale cantiere e quale giorno: ripresentarli vuoti costringerebbe a
  // riselezionare cio' che si e' appena cliccato.
  const cantiereScelto = params.get('cantiere')
  const giornoScelto = params.get('data')
  const ritorno = params.get('ritorno')

  const { data: cantieri, isPending: caricoCantieri } = useCantieri()
  const { data: dipendenti, isPending: caricoDipendenti } = useDipendenti()

  const salva = useMutation({
    mutationFn: async ({ campi, foto }: { campi: CampiRapportino; foto: File[] }) => {
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
          note: campi.note || null,
          annotazioni: campi.annotazioni || null,
          nessuna_attivita: campi.nessuna_attivita,
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

      /**
       * Le foto salgono per ultime, quando il rapportino ha finalmente
       * un id a cui appartenere. Una alla volta di proposito: sulla
       * connessione di un cantiere cinque caricamenti in parallelo si
       * intralciano, e se una fallisce si sa quale.
       *
       * Una foto che non sale NON fa fallire il salvataggio, e non e'
       * indulgenza: a questo punto il rapportino esiste gia'. Se
       * rilanciassimo l'errore, l'utente riproverebbe a salvare e si
       * ritroverebbe due schede per lo stesso cantiere e lo stesso
       * giorno. Quindi si raccoglie cos'e' rimasto a terra e lo si dice
       * dopo, che e' l'unico modo di non perdere ne' la scheda ne' la
       * verita'.
       */
      const fallite: string[] = []
      for (const file of foto) {
        try {
          await caricaFoto({
            file,
            orgId: org!.id,
            cantiereId: campi.cantiere_id,
            rapportinoId: rapportino.id,
          })
        } catch {
          fallite.push(file.name)
        }
      }

      return { id: rapportino.id, fallite }
    },
    onSuccess: ({ id, fallite }) => {
      qc.invalidateQueries({ queryKey: ['rapportini'] })
      qc.invalidateQueries({ queryKey: ['foto'] })
      // Se qualche foto e' rimasta a terra ci si ferma qui a dirlo.
      // Andarsene lasciando credere che sia partito tutto e' peggio di
      // un secondo di attesa in piu'.
      if (fallite.length > 0) return
      // Chi arriva da una card vuole vedere quella card diventare
      // verde, non finire dentro la scheda che ha appena scritto.
      navigate(ritorno ?? `/rapportini/${id}`)
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
   * La squadra parte vuota e la si compone scegliendo chi c'era.
   *
   * Prima partiva al completo con otto ore a testa, e si toglieva chi
   * mancava: aveva senso quando il rapportino era uno solo al giorno.
   * Adesso ogni cantiere attivo ne vuole uno, e lo stesso operaio non
   * puo' essere su sette cantieri contemporaneamente — precompilare
   * tutti significherebbe cancellarne sei su sette, sette volte.
   *
   * Il cantiere invece resta preselezionato quando ce n'e' uno solo:
   * quello e' un default che non puo' essere sbagliato.
   */
  const valoriIniziali: CampiRapportino = {
    cantiere_id: cantiereScelto ?? (cantieri.length === 1 ? cantieri[0].id : ''),
    data: giornoScelto ?? oggi(),
    // Vuoti, non 08:00–17:00: un orario precompilato finiva identico su
    // ogni rapportino, e un dato che c'e' sempre uguale non dice niente
    // il giorno che qualcuno lo va a leggere.
    ora_inizio: '',
    ora_fine: '',
    note: '',
    annotazioni: '',
    nessuna_attivita: false,
    ore: (dipendenti ?? []).map((d) => ({
      rigaId: '',
      dipendente_id: d.id,
      nominativo: `${d.cognome} ${d.nome}`,
      presente: false,
      ore_ordinarie: 0,
      ore_straordinarie: 0,
      ore_trasferta: 0,
      tipo_assenza: '',
    })),
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">Nuovo rapportino</h1>
        <p className="text-sm font-semibold text-gray-600">
          Quando la salvi la scheda risulta compilata. Al titolare parte tutta la giornata
          insieme, dalla home, quando ogni cantiere ha la sua.
        </p>
      </div>

      {/* La scheda c'e', le foto no. Al posto del form si mette la via
          d'uscita: risalvare da qui creerebbe un secondo rapportino
          sullo stesso cantiere e lo stesso giorno. */}
      {salva.isSuccess && salva.data.fallite.length > 0 ? (
        <Card className="grid gap-3 p-5">
          <Avviso tono="errore">
            La scheda è salvata, ma{' '}
            {salva.data.fallite.length === 1
              ? 'una foto non è partita'
              : `${salva.data.fallite.length} foto non sono partite`}
            : {salva.data.fallite.join(', ')}. Aprila e riprova ad aggiungerle da lì.
          </Avviso>
          <div className="flex flex-wrap gap-3">
            <Button
              variante="primario"
              onClick={() => navigate(`/rapportini/${salva.data.id}/modifica`)}
            >
              Apri la scheda e rimetti le foto
            </Button>
            <Button onClick={() => navigate(ritorno ?? `/rapportini/${salva.data.id}`)}>
              Lascia stare, vai avanti
            </Button>
          </div>
        </Card>
      ) : (
      <FormRapportino
        valoriIniziali={valoriIniziali}
        cantieri={cantieri}
        etichettaSalva="Segna come compilata"
        inCorso={salva.isPending}
        errore={salva.isError ? (salva.error as Error).message : undefined}
        onSalva={(campi, foto) => salva.mutate({ campi, foto })}
        onAnnulla={() => navigate(ritorno ?? '/rapportini')}
      />
      )}
    </div>
  )
}
