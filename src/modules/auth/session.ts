import { supabase } from '../../lib/supabase'

/* -------------------------------------------------------------------------
 * I tipi rispecchiano gli enum e la tabella permissions del database.
 * Sono scritti a mano di proposito: se domani aggiungi un permesso in SQL
 * e non lo aggiungi qui, TypeScript ti fa notare che una `Permission`
 * usata nella UI non esiste nell'unione. E' un controllo che i tipi
 * generati da `supabase gen types` non ti danno, perche' i codici dei
 * permessi sono RIGHE, non colonne.
 * ---------------------------------------------------------------------- */

export type OrgRole =
  | 'owner'
  | 'admin'
  | 'amministrazione'
  | 'capocantiere'
  | 'tecnico'
  | 'lettore'

export type Permission =
  | 'org.manage'
  | 'anagrafiche.read'
  | 'anagrafiche.write'
  | 'cantieri.read_all'
  | 'cantieri.write'
  | 'cantieri.assign'
  | 'rapportini.create'
  | 'rapportini.read_all'
  | 'rapportini.validate'
  | 'rapportini.reopen'
  | 'economics.read'
  | 'economics.write'
  | 'paghe.read'
  | 'paghe.export'
  | 'wbs.read'
  | 'wbs.write'

export type Organizzazione = {
  id: string
  slug: string
  ragioneSociale: string
  ruolo: OrgRole
  permessi: ReadonlySet<Permission>
}

export type AppSession = {
  userId: string
  email: string | null
  isPlatformAdmin: boolean
  orgs: Organizzazione[]
}

/** supabase-js tipizza le relazioni to-one a volte come oggetto, a volte
 *  come array di uno. Normalizziamo invece di fidarci. */
function primo<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Una sola funzione, tre query in parallelo, e da qui in poi il frontend
 * sa esattamente cosa puo' fare l'utente.
 *
 * Nota su role_permissions: la policy la rende leggibile a chiunque sia
 * autenticato, proprio perche' serve al frontend per costruire i menu.
 * Non e' un buco: sapere che un `owner` puo' validare non ti rende owner.
 * La UI nasconde i bottoni, la RLS nega i dati.
 */
export async function fetchAppSession(userId: string, email: string | null): Promise<AppSession> {
  const [profiloRes, matriceRes] = await Promise.all([
    supabase.from('profiles').select('is_platform_admin').eq('id', userId).maybeSingle(),
    supabase.from('role_permissions').select('ruolo, permission'),
  ])

  if (matriceRes.error) throw matriceRes.error

  const isPlatformAdmin = Boolean(profiloRes.data?.is_platform_admin)

  const permessiPerRuolo = new Map<OrgRole, Set<Permission>>()
  for (const riga of matriceRes.data ?? []) {
    const ruolo = riga.ruolo as OrgRole
    if (!permessiPerRuolo.has(ruolo)) permessiPerRuolo.set(ruolo, new Set())
    permessiPerRuolo.get(ruolo)!.add(riga.permission as Permission)
  }

  // Lo staff di piattaforma non ha membership: nel database passa da
  // app.is_platform_admin(), che fa passare tutto. Qui gli costruiamo la
  // stessa vista: tutte le organizzazioni, tutti i permessi. Se non lo
  // facessimo, un admin ENCREADE entrerebbe e vedrebbe zero aziende pur
  // avendo accesso completo ai dati.
  if (isPlatformAdmin) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, slug, ragione_sociale')
      .order('ragione_sociale')
    if (error) throw error

    const tutti = new Set<Permission>(
      [...permessiPerRuolo.values()].flatMap((s) => [...s]),
    )

    return {
      userId,
      email,
      isPlatformAdmin,
      orgs: (data ?? []).map((o) => ({
        id: o.id as string,
        slug: o.slug as string,
        ragioneSociale: o.ragione_sociale as string,
        ruolo: 'owner' as OrgRole,
        permessi: tutti,
      })),
    }
  }

  // memberships_select mostra anche i colleghi: filtriamo sul nostro id.
  const { data, error } = await supabase
    .from('memberships')
    .select('org_id, ruolo, organizations ( id, slug, ragione_sociale )')
    .eq('user_id', userId)
    .eq('attivo', true)
  if (error) throw error

  const orgs: Organizzazione[] = []
  for (const m of data ?? []) {
    const org = primo(m.organizations as any)
    if (!org) continue
    const ruolo = m.ruolo as OrgRole
    orgs.push({
      id: org.id,
      slug: org.slug,
      ragioneSociale: org.ragione_sociale,
      ruolo,
      permessi: permessiPerRuolo.get(ruolo) ?? new Set<Permission>(),
    })
  }
  orgs.sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale))

  return { userId, email, isPlatformAdmin, orgs }
}
