// Writes .br and .gz copies of the built text assets next to the originals. Spring serves them when the browser
// accepts them (EncodedResourceResolver), so bundles are compressed once at build time instead of per request.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TEXT = /\.(js|css|svg|json|txt|xml|ico|webmanifest)$/
let count = 0
let saved = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (TEXT.test(name) && statSync(path).size >= 1024) compress(path)
  }
}

function compress(path) {
  const data = readFileSync(path)
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  const gz = gzipSync(data, { level: 9 })
  writeFileSync(`${path}.br`, br)
  writeFileSync(`${path}.gz`, gz)
  count++
  saved += data.length - br.length
}

walk(DIST)
console.log(`compressed ${count} files (brotli saves ${(saved / 1024).toFixed(0)} KB)`)
