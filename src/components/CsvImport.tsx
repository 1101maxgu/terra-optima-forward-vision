import { useState } from 'react'
import { parseReadingsCsv } from '../services/csv'
import { useFarm } from '../state/farmStore'

export default function CsvImport() {
  const { zones, importReadings } = useFarm()
  const [result, setResult] = useState<{ file: string; count: number; errors: string[] } | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    try {
      const { readings, errors } = parseReadingsCsv(await file.text(), zones.map((z) => z.id))
      if (readings.length) importReadings(readings)
      setResult({ file: file.name, count: readings.length, errors })
    } catch (err) {
      setResult({ file: file.name, count: 0, errors: [`Could not read file: ${String(err)}`] })
    }
  }

  return (
    <section aria-labelledby="csv-h" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="csv-h" className="text-xl font-bold">
        Import sensor or manual readings
      </h2>
      <p className="text-muted">
        CSV columns: <code className="rounded bg-paper px-1 font-mono text-sm">date,zone,moisture[,soil_temp_c]</code>. The newest reading per zone
        drives the dashboard.{' '}
        <a href="/sample-readings.csv" download className="font-medium text-water underline underline-offset-4">
          Download example CSV
        </a>
      </p>
      <label className="btn-secondary w-fit cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-water">
        Choose CSV file…
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
      </label>
      {result && (
        <div role="status" className="text-sm">
          <p className={result.count ? 'text-leaf' : 'text-muted'}>
            {result.file}: {result.count} reading{result.count === 1 ? '' : 's'} imported.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc overflow-auto rounded-md bg-alert-soft py-2 pr-2 pl-6 text-alert">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
