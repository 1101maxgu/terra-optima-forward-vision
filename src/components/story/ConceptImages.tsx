import { useState } from 'react'

const IMAGES = [
  { file: 'hero.png', alt: 'Concept: sensor enclosure installed beside a raised vegetable bed' },
  { file: 'cutaway.png', alt: 'Concept: cutaway of the enclosure showing the ESP32 board and probes' },
  { file: 'flow.png', alt: 'Concept: system flow infographic from soil probe to grower' },
]

// Shows /concepts/*.png if present; each image removes itself on load error, and the block disappears if none load.
export default function ConceptImages() {
  const [failed, setFailed] = useState<string[]>([])
  if (failed.length === IMAGES.length) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {IMAGES.filter((img) => !failed.includes(img.file)).map((img) => (
        <figure key={img.file} className="overflow-hidden rounded-lg border border-line bg-surface">
          <img
            src={`${import.meta.env.BASE_URL}concepts/${img.file}`}
            alt={img.alt}
            className="aspect-video w-full object-cover"
            onError={() => setFailed((f) => [...f, img.file])}
          />
          <figcaption className="px-3 py-2 text-xs text-muted">
            AI-generated concept image — not a photo of built hardware
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
