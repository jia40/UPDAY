import { build } from 'vite'
import { gzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
const label = process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? 'current'
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a lowercase snapshot label.')
let report
let allFiles
await build({ plugins: [{ name: 'upday-bundle-report', generateBundle(_options, bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
  allFiles = chunks.map(chunk => chunk.fileName)
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]))
  const entry = chunks.find(chunk => chunk.isEntry)
  if (!entry) throw new Error('Missing entry chunk')
  function graph(roots) {
    const seen = new Set()
    function visit(name) { if (seen.has(name)) return; seen.add(name); for (const dependency of byName.get(name)?.imports ?? []) if (byName.has(dependency)) visit(dependency) }
    for (const root of roots) visit(root)
    const files = [...seen].sort()
    return { files, requests: files.length, bytes: files.reduce((n, file) => n + Buffer.byteLength(byName.get(file).code), 0), gzipBytes: files.reduce((n, file) => n + gzipSync(byName.get(file).code).length, 0), firestore: files.some(file => Object.keys(byName.get(file).modules).some(id => id.includes('@firebase/firestore'))) }
  }
  const routes = {}
  for (const [route, page] of [['/login','LoginPage'],['/signup','SignupPage'],['/reset-password','ResetPasswordPage'],['/dashboard','DashboardPage']]) {
    const chunk = chunks.find(chunk => Object.keys(chunk.modules).some(id => id.replaceAll('\\', '/').endsWith(`/src/pages/${page}.tsx`)))
    if (!chunk) throw new Error(`Missing ${page}`)
    routes[route] = graph([entry.fileName, chunk.fileName])
  }
  report = { label, node: process.version, entry: graph([entry.fileName]), routes, total: { bytes: chunks.reduce((n,c) => n + Buffer.byteLength(c.code),0), gzipBytes: chunks.reduce((n,c) => n + gzipSync(c.code).length,0), chunks: chunks.length }, largestModules: chunks.flatMap(c => Object.entries(c.modules).map(([id, module]) => ({ module: id.replaceAll('\\','/').replace(resolve('.').replaceAll('\\','/')+'/', ''), renderedBytes: module.renderedLength }))).sort((a,b) => b.renderedBytes-a.renderedBytes).slice(0,12) }
} }] })
const directory = 'node_modules/.cache/upday-bundle'
// Vite may add preload helpers after generateBundle; measure the final files.
const sizes = new Map(await Promise.all(allFiles.filter(file => existsSync(resolve('dist', file))).map(async file => {
  const contents = await readFile(resolve('dist', file))
  return [file, { bytes: contents.length, gzipBytes: gzipSync(contents).length }]
})))
for (const graph of [report.entry, ...Object.values(report.routes)]) {
  graph.files = graph.files.filter(file => sizes.has(file))
  graph.requests = graph.files.length
  graph.bytes = graph.files.reduce((sum, file) => sum + sizes.get(file).bytes, 0)
  graph.gzipBytes = graph.files.reduce((sum, file) => sum + sizes.get(file).gzipBytes, 0)
}
report.total.bytes = [...sizes.values()].reduce((sum, size) => sum + size.bytes, 0)
report.total.gzipBytes = [...sizes.values()].reduce((sum, size) => sum + size.gzipBytes, 0)
report.total.chunks = sizes.size
if (process.argv.includes('--check')) {
  for (const route of ['/login', '/signup', '/reset-password']) {
    if (report.routes[route].firestore) throw new Error(`Firestore leaked into ${route}`)
  }
}
await mkdir(directory, { recursive: true })
await writeFile(`${directory}/${label}.json`, JSON.stringify(report, null, 2)+'\n')
console.log(JSON.stringify({ label, entry: report.entry, routes: report.routes, total: report.total }, null, 2))
