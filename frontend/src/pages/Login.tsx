import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { supabase } from '../lib/supabase'

export function Login() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate, user])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 text-slate-100">
      <Card className="w-full max-w-md" padding="lg">
        <p className="text-center text-sm text-gray-500 tracking-wider">ELEMETAL</p>
        <h1 className="mt-2 text-xl font-semibold text-white mb-1">Login</h1>
        <p className="text-sm text-gray-500 mb-6">Access your trading workspace</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            error={error && error.toLowerCase().includes('email') ? error : undefined}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            error={error && error.toLowerCase().includes('password') ? error : undefined}
          />

          {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('password') ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : null}

          <Button type="submit" className="w-full" loading={submitting}>
            Log in
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-500">
          Need an account?{' '}
          <Link to="/signup" className="text-indigo-300 hover:text-indigo-200">
            Sign up
          </Link>
        </p>
      </Card>
    </main>
  )
}
