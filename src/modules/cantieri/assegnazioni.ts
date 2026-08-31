import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import type { OrgRole } from '../auth/session'

/* ══════════════════════════════════════════════════════════════════
   Le persone dell'azienda, e chi e' assegnato a un cantiere.

   `memberships` e `cantiere_assegnazioni` puntano ad `auth.users`, non a
   `profiles`: fra loro non esiste una chiave esterna, quindi PostgREST
   non sa annidarli e i nomi vanno uniti qui, lato client. E' il motivo
   per cui si fanno due query invece di una select annidata.
   ══════════════════════════════════════════════════════════════════ */

export type Membro = {
  userId: string
  nome: string
  email: string | null
  ruolo: OrgRole
  attivo: boolean
}

export function useMembri() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['membri', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<Membro[]> => {
      const [mem, prof] = await Promise.all([
        supabase.from('memberships').select('user_id, ruolo, attivo').eq('org_id', org!.id),
        supabase.from('profiles').select('id, full_name, email'),
      ])
      if (mem.error) throw mem.error
      if (prof.error) throw prof.error

      const perId = new Map((prof.data ?? []).map((p) => [p.id, p]))

      return (mem.data ?? [])
        .map((m) => {
          const p = perId.get(m.user_id)
          // full_name puo' essere stringa vuota, non solo null: chi si
          // registra senza compilarlo lascia ''. L'email e' l'ultima
          // spiaggia, ma e' sempre qualcosa di riconoscibile.
          const nome = p?.full_name?.trim() || p?.email || 'Utente senza nome'
          return { userId: m.user_id, nome, email: p?.email ?? null, ruolo: m.ruolo, attivo: m.attivo }
        })
        .sort((a, b) => a.nome.localeCompare(b.nome))
    },
  })
}

export type Assegnazione = {
  id: string
  user_id: string
  ruolo_cantiere: string
  dal: string
  al: string | null
}

export function useAssegnazioni(cantiereId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['assegnazioni', cantiereId],
    enabled: Boolean(cantiereId && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cantiere_assegnazioni')
        .select('id, user_id, ruolo_cantiere, dal, al')
        .eq('cantiere_id', cantiereId!)
        .eq('org_id', org!.id)
        .order('dal', { ascending: false })
      if (error) throw error
      return data as Assegnazione[]
    },
  })
}

/** Vera oggi: cominciata, e non ancora chiusa (o chiusa in avanti).
 *  E' la stessa condizione che applica `app.puo_vedere_cantiere()` —
 *  verificato: con `al` a ieri il cantiere sparisce, con `al` nel futuro
 *  resta visibile. */
export function assegnazioneInCorso(a: Assegnazione, oggi = new Date().toLocaleDateString('sv-SE')) {
  return a.dal <= oggi && (a.al === null || a.al >= oggi)
}

export function useAssegna() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (a: {
      cantiere_id: string
      user_id: string
      ruolo_cantiere: string
      dal: string
    }) => {
      const { error } = await supabase
        .from('cantiere_assegnazioni')
        .insert({ ...a, org_id: org!.id })
      if (error) {
        if (error.code === '23505') {
          throw new Error('Questa persona risulta già assegnata a questo cantiere.')
        }
        throw error
      }
    },
    onSuccess: (_, a) => {
      qc.invalidateQueries({ queryKey: ['assegnazioni', a.cantiere_id] })
      qc.invalidateQueries({ queryKey: ['cantieri'] })
    },
  })
}

/**
 * Revocare NON e' cancellare la riga.
 *
 * Si scrive una data in `al` e l'assegnazione resta agli atti: fra sei
 * mesi si potra' ancora rispondere a "chi era su quel cantiere a
 * marzo?". Cancellare la riga renderebbe quella domanda senza risposta.
 *
 * Attenzione alla semantica della data: l'accesso dura FINO AL giorno
 * scritto, compreso. Con `al` = oggi la persona vede ancora il cantiere
 * per tutta la giornata — che e' giusto, se ci ha lavorato oggi deve
 * poter compilare il rapportino di oggi. Per togliere l'accesso subito
 * si mette ieri.
 */
export function useChiudiAssegnazione() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, al }: { id: string; al: string | null; cantiereId: string }) => {
      const { error } = await supabase.from('cantiere_assegnazioni').update({ al }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['assegnazioni', v.cantiereId] })
      qc.invalidateQueries({ queryKey: ['cantieri'] })
    },
  })
}
