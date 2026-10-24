// Supabase Auth client (email magic link). Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are
// set, so the app keeps working signed out with the sample farm and "My farm" on this device.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// PKCE puts the sign-in code in ?code=… rather than the URL hash, which the app's hash router owns.
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true } }) : null
