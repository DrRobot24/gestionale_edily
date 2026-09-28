import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Avviso, Button, CampoArea, Card } from '../../ui'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   GLI APPUNTI — i post-it della scheda di una risorsa. Dal 2026-09-28.

   «Un campo note generico per ogni singola risorsa, dove si possono
   inserire come dei post-it, delle note o degli appunti su quella
   persona, senza vincoli di argomento» (utente). Prima c'era un campo
   «Note» dentro Sicurezza e abilitazioni, che invitava a scriverci solo
   patologie e allergie; e un campo solo diventa un muro di testo.

   Un appunto non si corregge: si stacca e se ne attacca un altro, come
   un post-it. Ognuno porta la sua data, e i piu' recenti stanno sopra.
   Tabella e permessi in `supabase/schema/appunti-risorse.sql`: li
   leggono solo Stefania e il titolare.
   ══════════════════════════════════════════════════════════════════ */

type Appunto = { id: string; testo: string; created_at: string; da_note_vecchie: boolean }

function mancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

function useAppunti(dipendenteId: string) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['appunti', dipendenteId],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Appunto[]> => {
      const { data, error } = await supabase
        .from('dipendente_appunti')
        .select('id, testo, created_at, da_note_vecchie')
        .eq('dipendente_id', dipendenteId)
        .eq('org_id', org!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function RiquadroAppunti({
  dipendenteId,
  puoScrivere,
}: {
  dipendenteId: string
  puoScrivere: boolean
}) {
  const { org } = useSession()
  const qc = useQueryClient()
  const { data: appunti, isPending, error } = useAppunti(dipendenteId)
  const [testo, setTesto] = useState('')

  const aggiungi = useMutation({
    mutationFn: async (t: string) => {
      const { error } = await supabase
        .from('dipendente_appunti')
        .insert({ org_id: org!.id, dipendente_id: dipendenteId, testo: t })
      if (error) {
        if (mancante(error))
          throw new Error('Manca la tabella: va eseguito supabase/schema/appunti-risorse.sql.')
        throw error
      }
    },
    onSuccess: () => {
      setTesto('')
      qc.invalidateQueries({ queryKey: ['appunti', dipendenteId] })
    },
  })

  const stacca = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dipendente_appunti').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appunti', dipendenteId] }),
  })

  return (
    <Card className="grid gap-3 p-5">
      <div>
        <h2 className="text-lg font-extrabold text-black">Appunti</h2>
        <p className="text-xs font-semibold text-gray-600">
          Post-it su questa persona, di qualunque argomento. Li leggono solo l&rsquo;amministrazione
          e il titolare.
        </p>
      </div>

      {puoScrivere && (
        <div className="grid gap-2">
          <CampoArea
            rows={2}
            placeholder="Ha chiesto le ferie di agosto, allergico al lattice, preferisce il cantiere di Catania…"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
          />
          {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}
          <div>
            <Button
              dimensione="sm"
              variante="primario"
              disabled={!testo.trim() || aggiungi.isPending}
              onClick={() => aggiungi.mutate(testo.trim())}
            >
              {aggiungi.isPending ? 'Attacco…' : '+ Attacca il post-it'}
            </Button>
          </div>
        </div>
      )}

      {error && !mancante(error) && (
        <Avviso tono="errore">Non riesco a leggere gli appunti: {error.message}</Avviso>
      )}
      {stacca.isError && <Avviso tono="errore">{(stacca.error as Error).message}</Avviso>}

      {!isPending && (appunti ?? []).length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {appunti!.map((a, i) => (
            <li
              key={a.id}
              className={
                'relative rounded-lg border-2 border-black bg-yellow-200 p-3 shadow-neo-sm ' +
                (i % 2 === 0 ? '-rotate-[0.6deg]' : 'rotate-[0.6deg]')
              }
            >
              <p className="whitespace-pre-wrap pr-6 text-sm font-semibold text-black">{a.testo}</p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-black/60">
                {new Date(a.created_at).toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {a.da_note_vecchie && ' · dalle note di prima'}
              </p>
              {puoScrivere && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Staccare questo post-it?')) stacca.mutate(a.id)
                  }}
                  aria-label="Stacca questo post-it"
                  title="Stacca"
                  className="absolute top-1.5 right-1.5 h-6 w-6 cursor-pointer rounded-md border-2 border-black bg-white text-xs font-extrabold leading-none hover:bg-rose-200"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
