import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'
import { env } from '../../lib/env'
import { useSession } from './SessionProvider'
import { Avviso, Button, Campo, Card } from '../../ui'

/**
 * Lo schema Zod e' l'unica definizione di "form valido". Da qui escono
 * sia la validazione a runtime sia il tipo TypeScript del form: se
 * aggiungi un campo allo schema, TS ti segnala i punti da aggiornare.
 * E' il motivo per cui usiamo Zod e non le regole native di RHF.
 */
const schema = z.object({
  email: z.string().min(1, 'Serve la tua email').email('Email non valida'),
  password: z.string().min(6, 'Almeno 6 caratteri'),
})

type Campi = z.infer<typeof schema>

/** I moduli veri del gestionale, non slogan: ognuno corrisponde a un
 *  permesso che esiste in session.ts. */
const MODULI = [
  ['Cantieri', 'Commesse e squadre'],
  ['Rapportini', 'Giornale di cantiere'],
  ['Economia', 'Preventivo e consuntivo'],
  ['WBS', 'Struttura di progetto'],
  ['Anagrafiche', 'Clienti e fornitori'],
  ['Paghe', 'Ore e costo manodopera'],
] as const

export function LoginPage() {
  const { authSession } = useSession()
  const location = useLocation()
  const [erroreServer, setErroreServer] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Campi>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  if (authSession) {
    const da = (location.state as { da?: string } | null)?.da
    return <Navigate to={da ?? '/'} replace />
  }

  async function onSubmit(campi: Campi) {
    setErroreServer(null)
    const { error } = await supabase.auth.signInWithPassword(campi)
    if (error) {
      // Non distinguiamo "email inesistente" da "password sbagliata":
      // dirlo permetterebbe di scoprire chi ha un account.
      setErroreServer('Email o password non corretti.')
    }
    // Se va bene non facciamo niente: onAuthStateChange aggiorna il
    // contesto e il <Navigate> qui sopra fa il resto.
  }

  return (
    <div className="flex min-h-screen">
      {/* ═══ Pannello di marca — sparisce sotto i 1024px ═══ */}
      <aside className="hidden border-r-2 border-black bg-amber-400 px-16 py-12 lg:flex lg:w-[55%] lg:flex-col lg:justify-center">
        <div className="max-w-lg">
          <Marchio dimensione="lg" />

          <h2 className="mb-6 mt-12 text-4xl font-extrabold leading-tight text-black">
            Il cantiere, dal preventivo
            <br />
            <span className="border-2 border-black bg-white px-2">al consuntivo.</span>
          </h2>

          <p className="mb-10 text-lg font-semibold leading-relaxed text-black/80">
            Cantieri, rapportini e costi in un unico posto. Ogni ruolo vede quello
            che gli serve, e solo i cantieri che gli sono assegnati.
          </p>

          <ul className="flex flex-wrap gap-3">
            {MODULI.map(([nome, descrizione]) => (
              <li
                key={nome}
                className="rounded-xl border-2 border-black bg-white px-4 py-2.5 shadow-neo-xs"
              >
                <p className="text-xs font-bold text-black">{nome}</p>
                <p className="text-[10px] font-semibold text-gray-600">{descrizione}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ═══ Form ═══ */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex justify-center lg:hidden">
            <Marchio dimensione="sm" />
          </div>

          <Card rilievo="lg" className="p-8">
            <div className="mb-8">
              <h1 className="mb-1 text-xl font-extrabold text-black">Bentornato</h1>
              <p className="text-sm font-semibold text-gray-600">
                Accedi per entrare nei tuoi cantieri.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
              <Campo
                etichetta="Email"
                type="email"
                placeholder="nome@esempio.it"
                autoComplete="username"
                autoFocus
                errore={errors.email?.message}
                {...register('email')}
              />

              <Campo
                etichetta="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                errore={errors.password?.message}
                {...register('password')}
              />

              {erroreServer && <Avviso tono="errore">{erroreServer}</Avviso>}

              <Button
                type="submit"
                variante="primario"
                disabled={isSubmitting}
                className="w-full py-3 font-extrabold"
              >
                {isSubmitting ? 'Accedo…' : 'Accedi'}
              </Button>
            </form>
          </Card>

          <p className="mt-6 text-center text-[10px] font-bold uppercase text-gray-600">
            {env.VITE_APP_NAME} © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}

function Marchio({ dimensione }: { dimensione: 'sm' | 'lg' }) {
  const grande = dimensione === 'lg'
  return (
    <div className="flex items-center gap-4">
      <div
        className={
          grande
            ? 'flex h-14 w-14 items-center justify-center rounded-xl border-3 border-black bg-white shadow-neo'
            : 'flex h-11 w-11 items-center justify-center rounded-xl border-2 border-black bg-amber-400 shadow-neo-sm'
        }
      >
        <span className={grande ? 'text-xl font-extrabold' : 'text-sm font-extrabold'}>EG</span>
      </div>
      <div>
        <p
          className={
            grande
              ? 'text-3xl font-extrabold tracking-tight text-black'
              : 'text-xl font-extrabold text-black'
          }
        >
          {env.VITE_APP_NAME}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Gestione cantieri e commesse
        </p>
      </div>
    </div>
  )
}
