import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { createAuditLog } from '../../hooks/useAuditLog'
import Spinner from '../../components/ui/Spinner'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[ImportadorVecinos] audit log:', e.message))
}

// ─── Schema fields ────────────────────────────────────────────────────────────
const SCHEMA_FIELDS = [
  'dni', 'nombre', 'apellido', 'nombre_completo', 'email', 'telefono',
  'direccion', 'barrio', 'localidad', 'zona',
  'fecha_nac', 'sexo', 'grupo_sanguineo',
  'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
]

// ─── Fallback sin IA ──────────────────────────────────────────────────────────
const AUTO_MAP = {
  'dni': 'dni', 'documento': 'dni', 'nro documento': 'dni', 'numero documento': 'dni',
  'nombre': 'nombre', 'first name': 'nombre', 'primer nombre': 'nombre',
  'apellido': 'apellido', 'last name': 'apellido', 'surname': 'apellido',
  'nombre completo': 'nombre_completo', 'full name': 'nombre_completo',
  'email': 'email', 'correo': 'email', 'mail': 'email',
  'telefono': 'telefono', 'teléfono': 'telefono', 'celular': 'telefono', 'tel': 'telefono',
  'direccion': 'direccion', 'dirección': 'direccion', 'domicilio': 'direccion',
  'barrio': 'barrio', 'neighborhood': 'barrio',
  'localidad': 'localidad', 'ciudad': 'localidad',
  'zona': 'zona', 'sector': 'zona',
  'fecha nac': 'fecha_nac', 'fecha nacimiento': 'fecha_nac', 'nacimiento': 'fecha_nac',
  'sexo': 'sexo', 'genero': 'sexo', 'género': 'sexo',
  'grupo sanguineo': 'grupo_sanguineo', 'grupo sanguíneo': 'grupo_sanguineo', 'sangre': 'grupo_sanguineo',
  'contacto emergencia': 'contacto_emergencia_nombre',
  'tel emergencia': 'contacto_emergencia_telefono',
}

function normalize(str) {
  return String(str ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ─── Fuzzy duplicate detection ────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  const maxLen = Math.max(na.length, nb.length)
  return (maxLen - levenshtein(na, nb)) / maxLen
}

// Detecta pares con similitud >80% y sin DNI compartido
export function detectFuzzyDuplicates(vecinos) {
  const pairs = []
  const seen  = new Set()
  for (let i = 0; i < vecinos.length; i++) {
    for (let j = i + 1; j < vecinos.length; j++) {
      const a = vecinos[i], b = vecinos[j]
      const key = [a.id, b.id].sort().join('|')
      if (seen.has(key)) continue
      // Saltar si comparten DNI (ya los manejamos como update)
      if (a.dni && a.dni === b.dni) continue
      const nameA = a.nombre_completo || `${a.apellido} ${a.nombre}`
      const nameB = b.nombre_completo || `${b.apellido} ${b.nombre}`
      const score = similarity(nameA, nameB)
      if (score >= 0.8) {
        seen.add(key)
        pairs.push({ a, b, score: Math.round(score * 100) })
      }
    }
  }
  // Máximo 10 pares para no abrumar
  return pairs.slice(0, 10)
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
async function loadWorkbook(file) {
  const XLSXmod = await import('xlsx')
  const XLSX = XLSXmod.default ?? XLSXmod
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return { wb, XLSX }
}

function parseSheet(wb, XLSX, sheetName) {
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })
  if (!raw.length) return []

  // Encontrar fila de headers: primera con al menos 2 celdas no vacías
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(raw.length, 6); i++) {
    if (raw[i].filter(v => v !== '' && v != null).length >= 2) {
      headerRowIdx = i; break
    }
  }

  const headers = raw[headerRowIdx].map((h, i) =>
    String(h ?? '').trim() || `Col_${i + 1}`
  )

  return raw.slice(headerRowIdx + 1)
    .filter(row => row.some(v => v !== '' && v != null))
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
}

async function parseFile(file, sheetName = null) {
  const name = file.name.toLowerCase()

  if (/\.(xlsx|xls|csv|ods)$/.test(name)) {
    const { wb, XLSX } = await loadWorkbook(file)
    const sheetNames = wb.SheetNames
    const targetSheet = sheetName ?? sheetNames[0]
    const rows = parseSheet(wb, XLSX, targetSheet)
    return { sheetNames, rows }
  }

  throw new Error('Formato no soportado. Usá .xlsx, .xls, .csv o .ods')
}

// ─── AI mapping ───────────────────────────────────────────────────────────────
async function aiMapColumns(columns, sampleRows) {
  const samples = columns.slice(0, 30).map(col => {
    const vals = sampleRows.map(r => String(r[col] ?? '')).filter(Boolean).slice(0, 3)
    return `"${col}": [${vals.map(v => `"${v.slice(0, 40)}"`).join(', ')}]`
  }).join('\n')

  const prompt = `Mapeá estas columnas de un padrón de vecinos al schema.

Schema válido: ${SCHEMA_FIELDS.join(', ')}, __ignore__

Reglas:
- Si la columna tiene DNI → "dni"
- Si tiene nombre + apellido en columnas separadas → "nombre" y "apellido"
- Si tiene nombre completo → "nombre_completo"
- Si todos los valores son iguales o genéricos → "__ignore__"
- Si no corresponde a ningún campo → "__ignore__"

Columnas con muestras:
${samples}

Respondé SOLO con JSON: {"columna": "campo"}. Sin markdown.`

  try {
    const res = await supabase.functions.invoke('ai-map-columns', {
      body: { prompt, max_tokens: 500 }
    })
    if (res.error) throw new Error(res.error.message)
    const text = res.data?.text ?? ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    const validIds = new Set([...SCHEMA_FIELDS, '__ignore__'])
    const safe = {}
    columns.forEach(col => {
      const entry = parsed[col]
      const fieldId = typeof entry === 'object' && entry !== null ? entry.field : entry
      safe[col] = validIds.has(fieldId) ? fieldId : (AUTO_MAP[normalize(col)] ?? '__ignore__')
    })
    return safe
  } catch (err) {
    console.warn('aiMapColumns fallback:', err?.message ?? err)
    const safe = {}
    columns.forEach(col => { safe[col] = AUTO_MAP[normalize(col)] ?? '__ignore__' })
    return safe
  }
}

function applyMapping(rows, mapping) {
  return rows.map(row => {
    const vecino = {}
    Object.entries(mapping).forEach(([col, field]) => {
      if (field === '__ignore__') return
      const val = String(row[col] ?? '').trim()
      if (val) vecino[field] = val
    })
    // Auto-completar nombre_completo si no viene
    if (!vecino.nombre_completo && vecino.apellido && vecino.nombre) {
      vecino.nombre_completo = `${vecino.apellido}, ${vecino.nombre}`
    }
    vecino.__key__ = vecino.dni || null
    return vecino
  }).filter(v => v.dni || v.nombre || v.apellido)
}

// ─── Helper exportado ─────────────────────────────────────────────────────────
export function vecinoNeedsReview(vecino) {
  return !vecino.telefono && !vecino.email
}

// ─── STEP 0: Upload ───────────────────────────────────────────────────────────
function StepUpload({ onFileLoaded }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const inputRef = useRef()

  async function handleFile(file) {
    if (!file) return
    if (!/\.(xlsx|xls|csv|ods)$/i.test(file.name)) {
      setError('Formato no soportado. Usá .xlsx, .xls, .csv o .ods')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const result = await parseFile(file)
      onFileLoaded({ file, ...result })
    } catch (e) {
      setError(e.message ?? 'Error al procesar el archivo.')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-primary">Importar vecinos</h2>
        <p className="mt-1 text-sm text-primary-500">
          Subí tu padrón. El sistema detecta las columnas automáticamente.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => !loading && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors ${
          loading   ? 'border-[#1D4ED8]/50 bg-[#1D4ED8]/5 cursor-default' :
          dragging  ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 cursor-copy' :
          'border-border hover:border-primary-300 bg-primary-50/50 cursor-pointer'
        }`}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.ods"
          className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {loading ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1D4ED8]/10">
              <Spinner size="lg" />
            </div>
            <div className="text-center">
              <p className="font-medium text-primary">Leyendo archivo…</p>
              <p className="mt-1 text-xs text-primary-400">Detectando estructura</p>
            </div>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-10 w-10 text-primary-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-center">
              <p className="font-medium text-primary">Arrastrá tu archivo acá</p>
              <p className="mt-1 text-xs text-primary-500">o hacé clic para seleccionar</p>
              <p className="mt-2 text-xs text-primary-400">.xlsx · .xls · .csv · .ods</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex gap-2 rounded-lg border border-border bg-primary-50 p-3 text-xs text-primary-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-primary-400 mt-0.5">
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          <span className="font-medium text-primary">Columnas mínimas:</span>{' '}
          DNI, Nombre, Apellido o Nombre Completo. El resto se auto-completa.
        </span>
      </div>
    </div>
  )
}

// ─── STEP 1: Selector de pestaña (solo si hay más de 1) ───────────────────────
function StepSheetSelector({ sheetNames, file, onSheetSelected, onBack }) {
  const [selected, setSelected] = useState(sheetNames[0])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function confirm() {
    setLoading(true)
    setError(null)
    try {
      const result = await parseFile(file, selected)
      onSheetSelected(result.rows, selected)
    } catch (e) {
      setError(e.message ?? 'Error al leer la pestaña.')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-primary">Elegir pestaña</h2>
        <p className="mt-1 text-sm text-primary-500">
          Tu archivo tiene {sheetNames.length} pestañas. ¿Cuál contiene el padrón?
        </p>
      </div>

      <div className="space-y-2">
        {sheetNames.map((name, i) => (
          <button
            key={name}
            onClick={() => setSelected(name)}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              selected === name
                ? 'border-[#1D4ED8] bg-[#1D4ED8]/5 text-primary'
                : 'border-border bg-white text-primary-500 hover:border-primary-300'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 shrink-0 ${selected === name ? 'text-[#1D4ED8]' : 'text-primary-400'}`}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{name}</p>
              <p className="text-xs text-primary-400">Pestaña {i + 1}</p>
            </div>
            {selected === name && (
              <div className="h-2 w-2 rounded-full bg-[#1D4ED8] shrink-0" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </button>
        <button onClick={confirm} disabled={loading}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading
            ? <><Spinner size="sm" /> Analizando…</>
            : <>Usar esta pestaña</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── STEP 2: Analizar + Confirmar ─────────────────────────────────────────────
function StepConfirm({ mapped, existingVecinos, onImport, importing, importResult, onBack, municipioId }) {
  const withContact   = mapped.filter(v => v.email || v.telefono).length
  const incomplete    = mapped.length - withContact
  const conflictCount = mapped.filter(v =>
    v.__key__ && existingVecinos.some(e => e.dni === v.__key__)
  ).length

  if (importResult) {
    return (
      <div className="space-y-6 py-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1D4ED8]/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-8 w-8 text-[#1D4ED8]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-primary">¡Importación completada!</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm">
            <span className="text-primary-500">
              <span className="text-[#1D4ED8] font-semibold text-base">{importResult.inserted}</span> nuevos
            </span>
            {importResult.updated > 0 && (
              <span className="text-primary-500">
                <span className="text-primary font-semibold text-base">{importResult.updated}</span> actualizados
              </span>
            )}
            {importResult.skipped > 0 && (
              <span className="text-primary-500">
                <span className="text-primary-400 font-semibold text-base">{importResult.skipped}</span> salteados
              </span>
            )}
          </div>
          {importResult.needsReview > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-accent-50 border border-accent-100 px-4 py-3 text-sm text-accent-700 max-w-sm mx-auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                <strong>{importResult.needsReview}</strong> vecinos sin datos de contacto —
                aparecen en el CRM para completar después.
              </span>
            </div>
          )}

          {/* Posibles duplicados fuzzy */}
          {importResult.fuzzyPairs?.length > 0 && (
            <div className="mt-4 rounded-xl border border-border overflow-hidden text-left max-w-sm mx-auto">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-primary-50 border-b border-border">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-accent shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs font-medium text-accent-700">
                  {importResult.fuzzyPairs.length} posibles duplicados detectados
                </p>
              </div>
              <div className="divide-y divide-border bg-white">
                {importResult.fuzzyPairs.map((pair, i) => {
                  const nameA = pair.a.nombre_completo || `${pair.a.apellido} ${pair.a.nombre}`
                  const nameB = pair.b.nombre_completo || `${pair.b.apellido} ${pair.b.nombre}`
                  return (
                    <div key={i} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-primary font-medium truncate max-w-[120px]">{nameA}</span>
                        <span className="text-primary-400 shrink-0">≈</span>
                        <span className="text-primary font-medium truncate max-w-[120px]">{nameB}</span>
                        <span className="ml-auto shrink-0 text-primary-400">{pair.score}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2.5 bg-primary-50 border-t border-border">
                <p className="text-xs text-primary-500">
                  Revisalos en el CRM y fusionalos manualmente si son la misma persona.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-primary">Listo para importar</h2>
        <p className="mt-1 text-sm text-primary-500">Revisá el resumen y confirmá.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-primary-50 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-primary">{mapped.length}</p>
          <p className="text-xs text-primary-500 mt-1">Vecinos detectados</p>
        </div>
        <div className="rounded-xl bg-primary-50 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-primary">{withContact}</p>
          <p className="text-xs text-primary-500 mt-1">Con datos de contacto</p>
        </div>
        {incomplete > 0 && (
          <div className="rounded-xl bg-accent-50 border border-accent-100 p-4 text-center">
            <p className="text-2xl font-bold text-accent-700">{incomplete}</p>
            <p className="text-xs text-accent-600 mt-1">Sin email ni teléfono</p>
          </div>
        )}
        {conflictCount > 0 && (
          <div className="rounded-xl bg-primary-50 border border-border p-4 text-center">
            <p className="text-2xl font-bold text-primary-500">{conflictCount}</p>
            <p className="text-xs text-primary-400 mt-1">Ya existen (se actualizan)</p>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2 bg-primary-50 border-b border-border">
          <p className="text-xs text-primary-500 font-medium">
            Vista previa · primeros {Math.min(mapped.length, 5)} de {mapped.length}
          </p>
        </div>
        <div className="divide-y divide-border">
          {mapped.slice(0, 5).map((v, i) => {
            const nombre = v.nombre_completo || `${v.apellido || ''} ${v.nombre || ''}`.trim()
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{nombre}</p>
                  <p className="text-xs text-primary-500 truncate">
                    {v.dni ? `DNI ${v.dni}` : ''} {v.email || v.telefono || ''}
                  </p>
                </div>
                {!v.email && !v.telefono && (
                  <span className="text-xs text-accent-700 shrink-0">Sin contacto</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {incomplete > 0 && (
        <p className="text-xs text-primary-500">
          Los vecinos sin datos se importan igual y quedan marcados para completar después.
        </p>
      )}

      <button onClick={onImport} disabled={importing}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3">
        {importing
          ? <><Spinner size="sm" /> Importando…</>
          : <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar {mapped.length} vecinos
            </>
        }
      </button>

      <button onClick={onBack}
        className="w-full text-center text-xs text-primary-500 hover:text-primary transition-colors">
        ← Subir otro archivo
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ImportadorVecinos({ existingVecinos = [], onDone }) {
  const { municipioId } = useEffectiveMunicipioId()

  // step: 'upload' | 'sheet' | 'confirm'
  const [step, setStep]           = useState('upload')
  const [fileData, setFileData]   = useState(null)
  const [rows, setRows]           = useState([])
  const [mapped, setMapped]       = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  async function analyzeAndConfirm(rawRows) {
    setAnalyzing(true)
    const columns = rawRows.length ? Object.keys(rawRows[0]) : []
    const mapping = await aiMapColumns(columns, rawRows.slice(0, 8))
    const result  = applyMapping(rawRows, mapping)
    setMapped(result)
    setAnalyzing(false)
    setStep('confirm')
  }

  async function handleFileLoaded(data) {
    setFileData(data)
    setRows(data.rows)

    // Si hay más de una pestaña → mostrar selector
    if (data.sheetNames.length > 1) {
      setStep('sheet')
    } else {
      // Pestaña única → analizar directo
      await analyzeAndConfirm(data.rows)
    }
  }

  async function handleSheetSelected(sheetRows) {
    setRows(sheetRows)
    await analyzeAndConfirm(sheetRows)
  }

  async function handleImport() {
    setImporting(true)
    let inserted = 0, updated = 0, skipped = 0, errors = 0, needsReview = 0
    const newVecinos = []

    const existingDNIs = new Set(existingVecinos.map(v => v.dni).filter(Boolean))

    for (const row of mapped) {
      const { __key__, ...vecino } = row
      vecino.municipio_id = municipioId

      try {
        const isConflict = __key__ && existingDNIs.has(__key__)

        if (isConflict) {
          const existing = existingVecinos.find(v => v.dni === __key__)
          if (existing) {
            const { data, error } = await supabase
              .from('vecinos').update(vecino).eq('id', existing.id).select().single()
            if (error) { errors++; continue }
            newVecinos.push(data); updated++
            if (vecinoNeedsReview(data)) needsReview++
            continue
          }
        }

        const { data, error } = await supabase
          .from('vecinos').insert(vecino).select().single()
        if (error) { errors++; continue }
        newVecinos.push(data); inserted++
        if (vecinoNeedsReview(data)) needsReview++
      } catch { errors++ }
    }

    setImportResult({ inserted, updated, skipped, errors, needsReview })
    setImporting(false)
    if (inserted + updated > 0) {
      // Detección fuzzy sobre todos los vecinos (existentes + nuevos)
      const allVecinos = [...existingVecinos, ...newVecinos]
      const fuzzyPairs  = detectFuzzyDuplicates(allVecinos)
      setImportResult({ inserted, updated, skipped, errors, needsReview, fuzzyPairs })
      // Resumen agregado — loguear fila por fila sería impráctico
      // para importaciones de cientos de vecinos.
      logAudit({
        accion: inserted > 0 ? 'create' : 'update',
        entidad: 'vecinos',
        descripcion: `Importación masiva: ${inserted} alta${inserted === 1 ? '' : 's'}, ${updated} actualizaci${updated === 1 ? 'ón' : 'ones'}`,
        metadata: { inserted, updated, skipped, errors, needsReview },
      })
      onDone?.(newVecinos)
    }
  }

  const STEP_LABELS = {
    upload:  'Subir archivo',
    sheet:   'Elegir pestaña',
    confirm: 'Importar',
  }
  const STEP_ORDER = ['upload', 'sheet', 'confirm']
  const visibleSteps = fileData?.sheetNames?.length > 1
    ? STEP_ORDER
    : ['upload', 'confirm']

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Importador de datos</h1>
        <p className="mt-1 text-sm text-primary-500">
          Importá vecinos al padrón desde Excel o CSV. La IA mapea las columnas automáticamente.
        </p>
      </header>
      <div className="card p-6">

        {/* Progress tabs */}
        <div className="flex border-b border-border">
          {visibleSteps.map((s, i) => (
            <div key={s} className={`flex-1 py-2 text-center text-xs font-medium transition-colors ${
              s === step         ? 'text-[#1D4ED8] border-b-2 border-[#1D4ED8]' :
              i < visibleSteps.indexOf(step) ? 'text-primary-500' : 'text-primary-400'
            }`}>{STEP_LABELS[s]}</div>
          ))}
        </div>

        {/* Loader overlay cuando analiza IA */}
        {analyzing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-white/95">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1D4ED8]/10">
              <Spinner size="lg" />
            </div>
            <div className="text-center">
              <p className="font-medium text-primary">La IA está analizando…</p>
              <p className="mt-1 text-xs text-primary-500">Detectando y mapeando columnas</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {step === 'upload' && (
            <StepUpload onFileLoaded={handleFileLoaded} />
          )}

          {step === 'sheet' && fileData && (
            <StepSheetSelector
              sheetNames={fileData.sheetNames}
              file={fileData.file}
              onSheetSelected={handleSheetSelected}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'confirm' && (
            <>
              <StepConfirm
                mapped={mapped}
                existingVecinos={existingVecinos}
                onImport={handleImport}
                importing={importing}
                importResult={importResult}
                onBack={() => setStep('upload')}
                municipioId={municipioId}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
