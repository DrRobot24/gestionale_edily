import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { data as fmtData } from '../../lib/formato'
import { Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { patentiDi, useDipendenti } from '../anagrafiche/dipendenti'
import { useContratti } from '../anagrafiche/contratti'
import { giorniA, statoScadenza } from '../anagrafiche/documentiPersonali'
import { PARCO, useParco } from '../anagrafiche/parco'

/* ══════════════════════════════════════════════════════════════════
   IN SCADENZA — il promemoria delle date, in home. Dal 2026-09-28.

   «Abbiamo un sistema che ci avvisa quando sta per scadere qualcosa
   negli operai? Una visita medica, un attestato…» (utente). Le date
   c'erano gia' tutte e si coloravano, ma ognuna nella sua pagina: per
   saperlo bisognava andare a guardare, e una scadenza si ricorda proprio
   quando nessuno ci pensa.

   Qui si raccoglie in un posto solo tutto cio' che e' SCADUTO o scade
   nei prossimi TRENTA giorni (lo stesso metro di `statoScadenza`):

     documenti della persona   visita medica, attestati, patentini
     patenti e abilitazioni    B, CQC, muletto…
     permesso di soggiorno
     contratti a termine       dal 2026-09-29
     mezzi                     revisione, assicurazione
     attrezzature              verifica periodica
     documenti del parco       dal 2026-09-29: quelli caricati su un
                               mezzo o un'attrezzatura con una scadenza

   Una riga per scadenza, dalla piu' urgente, col link per aprirla.
   SPARISCE quando non c'e' niente: la home mostra cose da fare.

   Lo vede chi tiene le anagrafiche (`anagrafiche.write`): Stefania, che
   le rinnova, e il titolare, che deve saperlo.
   ══════════════════════════════════════════════════════════════════ */

type Scadenza = {
  chiave: string
  chi: string
  cosa: string
  data: string
  a: string
}

/** Tutti i documenti delle persone che hanno una scadenza. */
function useDocumentiInScadenza(abilitato: boolean) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['documenti-personali', 'scadenze', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dipendente_documenti')
        .select('id, dipendente_id, titolo, scadenza')
        .eq('org_id', org!.id)
        .not('scadenza', 'is', null)
      if (error) throw error
      return data ?? []
    },
  })
}

/** I documenti caricati su mezzi e attrezzature che hanno una scadenza
 *  (vedi `documenti-parco.sql`). Senza lo SQL l'ambito non esiste e la
 *  query torna un errore: si tace, come se non ce ne fossero. */
function useDocumentiParcoInScadenza(abilitato: boolean) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['documenti', 'parco', 'scadenze', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documenti')
        .select('id, ambito, riferimento_id, titolo, scadenza')
        .eq('org_id', org!.id)
        .in('ambito', ['mezzo', 'attrezzatura'])
        .not('scadenza', 'is', null)
      if (error) return []
      return data ?? []
    },
  })
}

const MOSTRATE = 6

export function InScadenza() {
  const navigate = useNavigate()
  const { can } = useSession()
  const abilitato = can('anagrafiche.write')
  const [tutte, setTutte] = useState(false)

  const { data: persone } = useDipendenti()
  const { data: documenti } = useDocumentiInScadenza(abilitato)
  const { data: mezzi } = useParco('mezzi')
  const { data: attrezzi } = useParco('attrezzature')
  const { data: documentiParco } = useDocumentiParcoInScadenza(abilitato)
  const { data: contratti } = useContratti({ abilitato })

  if (!abilitato) return null

  const lista: Scadenza[] = []
  const urgente = (d: string | null | undefined): d is string => {
    const s = statoScadenza(d ?? null)
    return s === 'scaduto' || s === 'in-scadenza'
  }
  const nomi = new Map((persone ?? []).map((p) => [p.id, `${p.cognome} ${p.nome}`]))

  for (const p of persone ?? []) {
    const nome = `${p.cognome} ${p.nome}`
    const scheda = `/anagrafiche/operai/${p.id}`
    if (p.permesso_soggiorno && urgente(p.permesso_scadenza))
      lista.push({ chiave: `perm-${p.id}`, chi: nome, cosa: 'Permesso di soggiorno', data: p.permesso_scadenza, a: scheda })
    patentiDi(p.patenti).forEach((pt, i) => {
      if (urgente(pt.scade_il))
        lista.push({ chiave: `pat-${p.id}-${i}`, chi: nome, cosa: pt.tipo || 'Patente', data: pt.scade_il, a: scheda })
    })
  }
  /* IL CONTRATTO A TERMINE CHE SCADE, e dopo cui non c'e' ancora niente:
     ne' un contratto nuovo, ne' la fine del servizio a quella data. Va
     deciso — rinnovo, altro contratto, o la persona se ne va. Scaduto,
     resta in lista trenta giorni e poi tace: si puo' restare in servizio
     senza contratto (utente, 2026-09-29), e dopo un mese non e' piu' un
     promemoria ma una scelta. */
  const persona = new Map((persone ?? []).map((p) => [p.id, p]))
  const ultimoDi = new Map<string, NonNullable<typeof contratti>[number]>()
  for (const c of contratti ?? []) if (!ultimoDi.has(c.dipendente_id)) ultimoDi.set(c.dipendente_id, c)
  for (const c of ultimoDi.values()) {
    const p = persona.get(c.dipendente_id)
    if (!p || !c.al || c.motivo_fine !== 'scadenza_termine' || !urgente(c.al)) continue
    if (giorniA(c.al) < -30) continue
    if (p.data_cessazione && p.data_cessazione <= c.al) continue
    lista.push({
      chiave: `ctr-${c.id}`,
      chi: `${p.cognome} ${p.nome}`,
      cosa: `Contratto${c.tipo_contratto ? ` (${c.tipo_contratto.toLowerCase()})` : ''} con ${c.azienda}`,
      data: c.al,
      a: `/anagrafiche/operai/${p.id}`,
    })
  }
  for (const d of documenti ?? []) {
    // Solo le persone in elenco: un archiviato non chiede rinnovi.
    const nome = nomi.get(d.dipendente_id)
    if (nome && urgente(d.scadenza))
      lista.push({ chiave: `doc-${d.id}`, chi: nome, cosa: d.titolo, data: d.scadenza, a: `/anagrafiche/operai/${d.dipendente_id}` })
  }
  for (const m of mezzi ?? []) {
    const a = `${PARCO.mezzi.percorso}/${m.id}`
    if (urgente(m.scadenza_revisione as string | null))
      lista.push({ chiave: `rev-${m.id}`, chi: m.descrizione, cosa: 'Revisione', data: m.scadenza_revisione as string, a })
    if (urgente(m.scadenza_assicurazione as string | null))
      lista.push({ chiave: `ass-${m.id}`, chi: m.descrizione, cosa: 'Assicurazione', data: m.scadenza_assicurazione as string, a })
  }
  for (const t of attrezzi ?? []) {
    if (urgente(t.scadenza_verifica as string | null))
      lista.push({
        chiave: `ver-${t.id}`,
        chi: t.descrizione,
        cosa: 'Verifica periodica',
        data: t.scadenza_verifica as string,
        a: `${PARCO.attrezzature.percorso}/${t.id}`,
      })
  }

  /* Solo quelli di un mezzo o un'attrezzatura ancora in elenco: un
     mezzo venduto non chiede rinnovi. */
  const nomiParco = new Map<string, { nome: string; a: string }>([
    ...(mezzi ?? []).map(
      (m) => [m.id, { nome: m.descrizione, a: `${PARCO.mezzi.percorso}/${m.id}` }] as const,
    ),
    ...(attrezzi ?? []).map(
      (t) => [t.id, { nome: t.descrizione, a: `${PARCO.attrezzature.percorso}/${t.id}` }] as const,
    ),
  ])
  for (const d of documentiParco ?? []) {
    const cosa = nomiParco.get(d.riferimento_id)
    if (cosa && urgente(d.scadenza))
      lista.push({ chiave: `docp-${d.id}`, chi: cosa.nome, cosa: d.titolo, data: d.scadenza, a: cosa.a })
  }

  if (lista.length === 0) return null
  lista.sort((x, y) => x.data.localeCompare(y.data))
  const scadute = lista.filter((s) => giorniA(s.data) < 0).length
  const visibili = tutte ? lista : lista.slice(0, MOSTRATE)

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black px-4 py-2',
          scadute > 0 ? 'bg-rose-200' : 'bg-yellow-200',
        )}
      >
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">In scadenza</h2>
        <p className="text-[11px] font-bold text-black/70">
          {scadute > 0 && `${scadute} ${scadute === 1 ? 'scaduta' : 'scadute'} · `}
          {lista.length - scadute} nei prossimi 30 giorni
        </p>
      </div>
      <ul className="divide-y divide-black/10">
        {visibili.map((s) => {
          const g = giorniA(s.data)
          return (
            <li key={s.chiave}>
              <button
                type="button"
                onClick={() => navigate(s.a)}
                className="flex w-full cursor-pointer items-baseline gap-3 px-4 py-1.5 text-left hover:bg-amber-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-extrabold text-black">{s.chi}</span>
                  <span className="font-semibold text-gray-600"> · {s.cosa}</span>
                </span>
                <span
                  className={cn(
                    'numerico shrink-0 text-xs font-extrabold',
                    g < 0 ? 'text-rose-700' : 'text-amber-800',
                  )}
                >
                  {g < 0 ? `scaduta il ${fmtData(s.data)}` : g === 0 ? 'scade oggi' : `fra ${g} gg`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {lista.length > MOSTRATE && (
        <button
          type="button"
          onClick={() => setTutte((v) => !v)}
          className="w-full cursor-pointer border-t-2 border-black px-4 py-1.5 text-xs font-bold text-black hover:bg-amber-50"
        >
          {tutte ? 'Mostra meno' : `Mostra tutte (${lista.length})`}
        </button>
      )}
    </Card>
  )
}
