import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { setAuthTokenProvider } from '../data/apiRepo'
import { supabase } from './supabase'

export interface Auth {
  /** False until Supabase is configured: sign-in is hidden and everything works signed out. */
  configured: boolean
  ready: boolean
  userId: string | null
  email: string | null
  /** Emails a sign-in link; resolves when sent. */
  sendLink(email: string): Promise<void>
  signOut(): Promise<void>
}

const Ctx = createContext<Auth | null>(null)

if (supabase) {
  const sb = supabase
  setAuthTokenProvider(async () => (await sb.auth.getSession()).data.session?.access_token ?? null)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email ?? null } : null)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email ?? null } : null)
      if (event === 'SIGNED_IN' && /[?&]code=/.test(window.location.search)) {
        // Back from the email link: tidy the URL and land on the account page.
        history.replaceState(null, '', `${window.location.pathname}#/account`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const auth: Auth = {
    configured: Boolean(supabase),
    ready,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    async sendLink(email) {
      if (!supabase) throw new Error('Accounts are not switched on yet.')
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } })
      if (error) throw new Error(error.message)
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
  }
  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>
}

export function useAuth(): Auth {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
