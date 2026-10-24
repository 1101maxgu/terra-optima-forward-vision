import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { FarmProvider } from './state/farmStore'

// A different signed-in user means a different farm: remount the store so nothing leaks between them.
function FarmForUser({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  return <FarmProvider key={userId ?? 'signed-out'}>{children}</FarmProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <FarmForUser>
        <App />
      </FarmForUser>
    </AuthProvider>
  </StrictMode>,
)

// Offline shell (public/sw.js). Production only, so dev always serves fresh code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
