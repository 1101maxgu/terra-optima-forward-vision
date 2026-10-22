import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { FarmProvider } from './state/farmStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FarmProvider>
      <App />
    </FarmProvider>
  </StrictMode>,
)
