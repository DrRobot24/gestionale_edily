import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   LE ORE DEL TECNICO IN ATTESA DI FIRMA.

   Chiuse un buco trovato dall'utente il 2026-09-22: «ma Stefania non
   vede le ore che si segna il tecnico?».

   NO, e il motivo non stava nella griglia. `ore_griglia` le legge da
   sempre, insieme ai rapportini. Il problema era a monte: il ciclo
   delle ore personali e' `bozza → inviato → validato`, ma il gradino
   finale non lo faceva NESSUNO. Lo stato `validato` esisteva, aveva
   perfino etichetta e colore in `MieOrePage` — «Validata», verde — e
   nessun pulsante in tutto il programma lo assegnava.

   Le ore del tecnico restavano quindi «inviato» per sempre, e siccome
   la griglia mostra solo `validato` e `contabilizzato` — per coerenza
   col «Foglio presenze» e col riquadro in home — Zito compariva a zero.
   Le sue ore c'erano, semplicemente non erano mai diventate buone.

   IL DATABASE ERA GIA' PRONTO. La policy `ore_personali_update` di
   `ore-personali-invio.sql` lascia gia' agire chi ha
   `rapportini.validate`, e le colonne `validato_at` / `validato_da` /
   `motivo_rifiuto` esistono dal primo giorno. Mancava solo il gesto.

   PERCHE' NELLA STESSA CODA DEI RAPPORTINI. Scelta dell'utente fra
   tre: un posto solo per tutto cio' che chiede la firma. Una seconda
   voce di menu sarebbe un secondo posto da ricordarsi di visitare, e
   una firma che si da' insieme alla giornata farebbe passare le ore del
   tecnico senza guardarle — che e' proprio il contrario di validare.
   ══════════════════════════════════════════════════════════════════ */

/** Una giornata di ore proprie in attesa del titolare. */
export type OrePersonaliDaValidare = {
  id: string
  data: string
  dipendente_id: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
  tipo_assenza: string | null
  descrizione: string | null
  dipendenti: { nome: string; cognome: string } | null
}

export function useOrePersonaliDaValidare() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-personali-da-validare', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<OrePersonaliDaValidare[]> => {
      const { data, error } = await supabase
        .from('ore_personali')
        .select(
          'id, data, dipendente_id, ore_ordinarie, ore_straordinarie, ore_assenza, tipo_assenza, descrizione, dipendenti ( nome, cognome )',
        )
        .eq('org_id', org!.id)
        // Solo l'inviato, come per i rapportini: una giornata gia'
        // firmata non torna in coda, e una ancora in bozza non ci e'
        // mai entrata.
        .eq('stato', 'inviato')
        .order('data', { ascending: false })
        .limit(200)

      if (error) throw error
      return (data ?? []) as unknown as OrePersonaliDaValidare[]
    },
  })
}

/** Le ore lavorate di una giornata: ordinarie piu' straordinarie. Le
 *  assenze restano fuori — sono tempo non lavorato, e sommarle
 *  direbbe una giornata piu' piena di quella che e' stata. */
export function oreLavorate(r: OrePersonaliDaValidare): number {
  return Number(r.ore_ordinarie ?? 0) + Number(r.ore_straordinarie ?? 0)
}

/**
 * La firma del titolare sulle ore che il tecnico si e' segnato.
 *
 * Stessa transizione dei rapportini, stesse colonne: `validato_at` e
 * `validato_da` dicono quando e chi, e sono cio' che rende la riga
 * buona per le paghe.
 *
 * Il respingimento porta a `respinto` con il motivo, e da li' il
 * tecnico puo' correggere e rimandare — la policy glielo permette su
 * `bozza` e `respinto`.
 */
export function useValidaOrePersonali() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      valida,
      motivo,
    }: {
      id: string
      valida: boolean
      motivo?: string
    }) => {
      const { error } = await supabase
        .from('ore_personali')
        .update(
          valida
            ? {
                stato: 'validato',
                validato_at: new Date().toISOString(),
                validato_da: app!.userId,
                // Si azzera: una giornata rifiutata e poi corretta e
                // approvata non deve conservare il motivo del primo no.
                motivo_rifiuto: null,
              }
            : {
                stato: 'respinto',
                motivo_rifiuto: motivo ?? null,
                validato_at: null,
                validato_da: null,
              },
        )
        .eq('id', id)
        .eq('org_id', org!.id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ore-personali-da-validare'] })
      // La coda in home, i totali delle ore e la griglia di Stefania
      // cambiano tutti con questa firma.
      qc.invalidateQueries({ queryKey: ['ore-periodo'] })
      qc.invalidateQueries({ queryKey: ['ore-personali'] })
      qc.invalidateQueries({ queryKey: ['mie-ore'] })
    },
  })
}
