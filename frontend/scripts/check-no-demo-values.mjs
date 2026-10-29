// Fails if the demo password or a demo sign-in phone number is in `dist/` (#236).
//
// Anyone can read a downloaded site's JavaScript, so a demo value in it reads as a real credential. Run after
// `npm run build` in a build without mocks. The values come from `src/mocks/` and are never printed: the output
// names only the kind of value and the file it was found in.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const read = (file) => readFileSync(join(root, 'src/mocks', file), 'utf8')

/** Every demo value, as a [kind, text] pair. */
function demoValues() {
  const values = []
  const password = /export const DEMO_PASSWORD = '([^']+)'/.exec(read('seed.ts'))?.[1]
  if (!password) throw new Error('Cannot find DEMO_PASSWORD in src/mocks/seed.ts: update this script.')
  values.push(['demo password', password])

  // Demo staff, rider and driver phones are 0800 000 0xxx, written in the seeds as +234 8000000xxx.
  const phones = new Set()
  for (const file of ['seed.ts', 'adminSeed.ts', 'partnerSeed.ts']) {
    for (const [, national] of read(file).matchAll(/\+234(800\d{7})/g)) phones.add(national)
  }
  if (phones.size === 0) throw new Error('Cannot find the demo phone numbers in src/mocks: update this script.')
  for (const national of phones) {
    const local = `0${national}`
    values.push(['demo phone number', `+234${national}`], ['demo phone number', local])
    values.push(['demo phone number', `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`])
  }
  return values
}

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

let scanned = 0
try {
  readdirSync(dist)
} catch {
  throw new Error('No dist/ folder: run `npm run build` first.')
}
const values = demoValues()
const found = []
for (const file of files(dist)) {
  const text = readFileSync(file, 'utf8')
  scanned += 1
  for (const [kind, value] of values) if (text.includes(value)) found.push(`${kind} in ${file.slice(root.length)}`)
}

if (found.length > 0) {
  console.error(`Demo values found in the production build (#236):\n${[...new Set(found)].map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`No demo password or demo phone numbers in dist/ (${scanned} files, ${values.length} values checked).`)
