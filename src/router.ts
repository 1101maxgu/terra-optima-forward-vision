// Tiny hash router: #/  #/zones  #/zones/new  #/zones/:id  #/zones/:id/boundary  #/sensors  #/reports  #/about  #/settings
import { useEffect, useState } from 'react'

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`
}

const current = () => window.location.hash.replace(/^#/, '') || '/'

/** Returns the path and its segments, e.g. '/zones/a' -> ['zones', 'a']. */
export function useRoute() {
  const [path, setPath] = useState(current)
  useEffect(() => {
    const on = () => {
      setPath(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return { path, segments: path.split('/').filter(Boolean) }
}
