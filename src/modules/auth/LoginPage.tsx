import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useSession } from './SessionProvider'

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
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ width: 320, display: 'grid', gap: 12 }} noValidate>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Gestionale</h1>

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13 }}>Email</span>
          <input type="email" autoComplete="username" {...register('email')} />
          {errors.email && <small style={{ color: '#b00020' }}>{errors.email.message}</small>}
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13 }}>Password</span>
          <input type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <small style={{ color: '#b00020' }}>{errors.password.message}</small>}
        </label>

        {erroreServer && <small style={{ color: '#b00020' }}>{erroreServer}</small>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Accedo…' : 'Accedi'}
        </button>
      </form>
    </div>
  )
}
