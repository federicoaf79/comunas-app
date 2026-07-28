#!/usr/bin/env node
/**
 * audit-schema.mjs — compara lo que el código pide contra el schema REAL de prod.
 *
 * Uso:
 *   node scripts/audit-schema.mjs [schema.json] [src]
 *
 * Detecta la clase de bug que rompió hc_documentos y seguros: código escrito
 * contra migraciones locales que no reflejan producción.
 *
 * NO detecta: RLS que devuelve [] en silencio, buckets mal asumidos,
 * ni errores de lógica. Solo columnas y tablas inexistentes.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SCHEMA_PATH = process.argv[2] || 'schema.json'
const SRC_DIR     = process.argv[3] || 'src'

// Buckets privados confirmados — getPublicUrl sobre estos es siempre un bug.
const BUCKETS_PRIVADOS = ['documentos-hc', 'seguros', 'reclamos']

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
const tablas = new Set(Object.keys(schema))

// ─── recorrer archivos ───────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx)$/.test(name)) out.push(p)
  }
  return out
}

// ─── parsear una lista de columnas de un .select() ───────────────────
function parseSelect(str) {
  const cols = []
  let depth = 0, buf = ''
  for (const ch of str) {
    if (ch === '(') { depth++; buf += ch; continue }
    if (ch === ')') { depth--; buf += ch; continue }
    if (ch === ',' && depth === 0) { cols.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) cols.push(buf)

  const out = []
  for (let raw of cols) {
    raw = raw.trim().replace(/\s+/g, ' ')
    if (!raw || raw === '*') continue
    const parenIdx = raw.indexOf('(')
    if (parenIdx !== -1) {
      // embed: `alias:fk_col(...)` valida fk_col; `tabla(...)` no valida nada
      const head = raw.slice(0, parenIdx).trim()
      if (head.includes(':')) out.push(head.split(':')[1].trim())
      continue
    }
    if (raw.includes(':')) { out.push(raw.split(':')[1].trim()); continue }
    out.push(raw)
  }
  return out.filter(c => /^[a-z_][a-z0-9_]*$/i.test(c))
}

// ─── analizar un archivo ─────────────────────────────────────────────
function analizar(path) {
  const src = readFileSync(path, 'utf8')
  const hallazgos = []

  // constantes con listas de columnas: const X = `...`
  const consts = {}
  for (const m of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*`([^`]*)`/g)) {
    consts[m[1]] = m[2]
  }

  const lineaDe = (idx) => src.slice(0, idx).split('\n').length

  // getPublicUrl sobre bucket privado
  for (const m of src.matchAll(/storage\s*\.?\s*\n?\s*\.from\(\s*['"`]([^'"`]+)['"`]\s*\)[\s\S]{0,120}?getPublicUrl/g)) {
    if (BUCKETS_PRIVADOS.includes(m[1])) {
      hallazgos.push({ linea: lineaDe(m.index), tipo: 'BUCKET',
        msg: `getPublicUrl sobre '${m[1]}', que es privado — devuelve un link muerto` })
    }
  }

  // cada .from('tabla') abre una cadena
  const froms = [...src.matchAll(/\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/g)]
  for (let i = 0; i < froms.length; i++) {
    const m = froms[i]
    const tabla = m[1]
    if (tabla.includes('/') || tabla.includes('-')) continue // bucket, no tabla
    const desde = m.index + m[0].length
    const hasta = i + 1 < froms.length ? froms[i + 1].index : src.length
    const chain = src.slice(desde, Math.min(hasta, desde + 2500))
    const ln = lineaDe(m.index)

    if (!tablas.has(tabla)) {
      hallazgos.push({ linea: ln, tipo: 'TABLA', msg: `tabla '${tabla}' no existe en prod` })
      continue
    }
    const reales = new Set(schema[tabla])
    const chk = (col, ctx) => {
      if (!reales.has(col)) {
        hallazgos.push({ linea: ln, tipo: 'COLUMNA',
          msg: `${tabla}.${col} no existe (en ${ctx})` })
      }
    }

    // .select(...)
    for (const s of chain.matchAll(/\.select\(\s*(`([^`]*)`|'([^']*)'|"([^"]*)"|([A-Z][A-Z0-9_]*))/g)) {
      const lit = s[2] ?? s[3] ?? s[4]
      const txt = lit !== undefined ? lit : consts[s[5]]
      if (txt === undefined) continue
      for (const c of parseSelect(txt)) chk(c, '.select')
    }

    // .eq / .neq / .gt / .gte / .lt / .lte / .like / .ilike / .is / .in / .contains / .order
    for (const s of chain.matchAll(/\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"]([^'"]+)['"]/g)) {
      if (s[2].includes('.') || s[2].includes('(')) continue // filtro sobre embed
      chk(s[2], `.${s[1]}`)
    }

    // .insert({...}) / .update({...})
    for (const s of chain.matchAll(/\.(insert|update)\(\s*\{([\s\S]{0,900}?)\}\s*\)/g)) {
      for (const k of s[2].matchAll(/(?:^|[,{\s])([a-z_][a-z0-9_]*)\s*:/gi)) chk(k[1], `.${s[1]}`)
    }
  }
  return hallazgos
}

// ─── correr ──────────────────────────────────────────────────────────
const archivos = walk(SRC_DIR)
let total = 0
const porTipo = { TABLA: 0, COLUMNA: 0, BUCKET: 0 }

for (const f of archivos) {
  let h
  try { h = analizar(f) } catch (e) { console.error(`  ! error en ${f}: ${e.message}`); continue }
  if (!h.length) continue
  console.log(`\n${f}`)
  for (const x of h.sort((a, b) => a.linea - b.linea)) {
    console.log(`  ${String(x.linea).padStart(4)}  [${x.tipo}] ${x.msg}`)
    porTipo[x.tipo]++
    total++
  }
}

console.log(`\n${'─'.repeat(60)}`)
console.log(`${archivos.length} archivos · ${total} hallazgos`)
console.log(`  tablas inexistentes: ${porTipo.TABLA}`)
console.log(`  columnas inexistentes: ${porTipo.COLUMNA}`)
console.log(`  getPublicUrl en bucket privado: ${porTipo.BUCKET}`)
console.log(`\nOJO: los falsos positivos son posibles (columnas armadas`)
console.log(`dinámicamente, spreads). Verificá cada hallazgo antes de tocar.`)
process.exit(total > 0 ? 1 : 0)
