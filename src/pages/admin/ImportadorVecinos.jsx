import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { createAuditLog } from '../../hooks/useAuditLog'
import { vecinoSinContacto } from '../../lib/vecinoHelpers'
import Spinner from '../../components/ui/Spinner'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[ImportadorVecinos] audit log:', e.message))
}

// =============================================================
// Importador parametrizado por entidad — vecinos y proveedores
// comparten TODO el motor (parseo de archivo, mapeo IA, batching,
// dedup real, reporte de errores por fila con CSV, guard de
// municipio_id): lo único que cambia entre uno y otro vive en
// ENTITY_CONFIGS, más abajo. No hay un segundo importador — es el
// mismo componente con un selector de entidad arriba.
// =============================================================

// ─── Schema fields — VECINOS ──────────────────────────────────────────────────
const VECINO_SCHEMA_FIELDS = [
  'dni', 'nombre', 'apellido', 'nombre_completo', 'email', 'telefono',
  'direccion', 'barrio', 'localidad', 'zona',
  'fecha_nac', 'sexo', 'grupo_sanguineo',
  'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
]

const VECINO_AUTO_MAP = {
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

// ─── Schema fields — PROVEEDORES ──────────────────────────────────────────────
// Columnas reales de `proveedores` (verificado en prod): id, municipio_id,
// nombre, categoria, telefono, direccion, activo, created_at. `nombre` es
// el único campo NOT NULL además de municipio_id (que siempre lo inyecta
// el importador, nunca viene del archivo).
const PROVEEDOR_SCHEMA_FIELDS = ['nombre', 'categoria', 'telefono', 'direccion']

const PROVEEDOR_AUTO_MAP = {
  'nombre': 'nombre', 'proveedor': 'nombre', 'comercio': 'nombre',
  'razon social': 'nombre', 'razón social': 'nombre', 'negocio': 'nombre',
  'categoria': 'categoria', 'categoría': 'categoria', 'rubro': 'categoria', 'tipo': 'categoria',
  'telefono': 'telefono', 'teléfono': 'telefono', 'celular': 'telefono', 'tel': 'telefono',
  'direccion': 'direccion', 'dirección': 'direccion', 'domicilio': 'direccion',
}

function normalize(str) {
  return String(str ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ─── Fuzzy duplicate detection (solo VECINOS) ─────────────────────────────────
// Two-row: en vez de una matriz (m+1)×(n+1) completa (m+1 arrays nuevos
// por llamada), reusa dos arrays de una fila. Mismo resultado exacto,
// mismo O(m·n) en tiempo, pero sin la asignación repetida de arrays chicos
// que dominaba el costo real (confirmado en vivo: agrupar por apellido
// bajó los pares un 90% sin bajar el tiempo un centavo -- el cuello de
// botella era la matriz, no la cantidad de pares).
//
// Proveedores NO usa esto — su dedup es exacto por nombre normalizado
// (mismo mecanismo que DNI en vecinos, ver ENTITY_CONFIGS.getKey), no
// hace falta aproximar similitud.
function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    const tmp = prev; prev = curr; curr = tmp
  }
  return prev[n]
}

// Recibe los nombres YA normalizados -- normalizar una vez por vecino
// afuera del bucle de pares es más barato que normalizar de nuevo en
// cada comparación (un vecino participa de varios pares dentro de su
// grupo).
//
// Salida temprana: levenshtein(a,b) nunca es menor que |len(a)-len(b)|
// (hacen falta al menos esas inserciones/borrados). Si esa diferencia ya
// supera el 20% del largo mayor, similarity no puede llegar a 0.8 --
// evita calcular la distancia completa para pares que ya se sabe que
// no van a calificar.
function similarity(normA, normB) {
  if (!normA || !normB) return 0
  const maxLen = Math.max(normA.length, normB.length)
  if (Math.abs(normA.length - normB.length) > maxLen * 0.2) return 0
  return (maxLen - levenshtein(normA, normB)) / maxLen
}

// Detecta pares con similitud >80% y sin DNI compartido.
//
// Se agrupa primero por primera letra normalizada del apellido antes de
// comparar -- dos apellidos que empiezan distinto rara vez son la misma
// persona mal tipeada, y esto baja los pares a comparar de O(n²) sobre
// TODOS a O(n²) solo DENTRO de cada grupo (~27 grupos en la práctica).
// Con 2.000 vecinos eso son decenas de miles de comparaciones en vez de
// ~2 millones. Se llama a pedido del staff (ver botón "Buscar posibles
// duplicados" en el resultado), nunca automáticamente durante el import
// -- ver nota en handleImport().
export function detectFuzzyDuplicates(vecinos) {
  // Nombre normalizado UNA vez por vecino -- antes se normalizaba
  // adentro de similarity() en cada comparación, repitiendo el mismo
  // trabajo tantas veces como pares participara ese vecino.
  const conNombre = vecinos.map(v => {
    const apellido = v.apellido || v.nombre_completo?.split(',')[0]?.trim() || ''
    const nombreCompleto = v.nombre_completo || `${v.apellido} ${v.nombre}`
    return { v, letra: normalize(apellido).charAt(0) || '_', nombreNorm: normalize(nombreCompleto) }
  })

  const grupos = new Map()
  for (const item of conNombre) {
    if (!grupos.has(item.letra)) grupos.set(item.letra, [])
    grupos.get(item.letra).push(item)
  }

  const pairs = []
  const seen  = new Set()
  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const { v: a, nombreNorm: normA } = grupo[i]
        const { v: b, nombreNorm: normB } = grupo[j]
        const key = [a.id, b.id].sort().join('|')
        if (seen.has(key)) continue
        // Saltar si comparten DNI (ya los manejamos como update)
        if (a.dni && a.dni === b.dni) continue
        const score = similarity(normA, normB)
        if (score >= 0.8) {
          seen.add(key)
          pairs.push({ a, b, score: Math.round(score * 100) })
        }
      }
    }
  }
  // Máximo 10 pares para no abrumar
  return pairs.slice(0, 10)
}

// ─── Parsers (entidad-agnósticos) ──────────────────────────────────────────────
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

  // __fileRow__ se calcula ANTES de filtrar filas en blanco, para que
  // apunte a la fila real del archivo (1-based, como la ve un humano en
  // Excel) — necesario para poder reportar errores por fila más abajo.
  return raw.slice(headerRowIdx + 1)
    .map((row, idx) => ({ row, fileRow: headerRowIdx + idx + 2 }))
    .filter(({ row }) => row.some(v => v !== '' && v != null))
    .map(({ row, fileRow }) => {
      const obj = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
      obj.__fileRow__ = fileRow
      return obj
    })
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

// ─── Claves existentes (para dedup real) ──────────────────────────────────────
// Generalización de lo que antes era fetchExistingDnis(): un solo fetch
// paginado (id + la columna clave de la entidad) devuelve directamente
// un Map<clave, id> — antes vecinos hacía esto en DOS pasos (un Set solo
// de DNIs al analizar el archivo, y una resolución de ids aparte, en
// lotes .in('dni', chunk), solo para las filas que terminaban en
// "actualizar"). Con el Map ya no hace falta ese segundo paso: la
// existencia y el id salen de la misma consulta. Selecciona un poco más
// de payload que antes (una columna UUID extra por fila existente) pero
// es la misma cantidad de queries, y evita todo el bloque de resolución
// posterior.
const KEY_PAGE_SIZE = 1000

// Tamaño de lote para inserts masivos. 200 balancea payload por
// request contra cantidad de round-trips — con 2.000 filas son ~10
// requests en vez de 2.000.
const BATCH_SIZE = 200

async function fetchExistingKeyMap(config, municipioId) {
  const map = new Map()
  if (!municipioId) return map
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(config.table)
      .select(`id, ${config.keyColumn}`)
      .eq('municipio_id', municipioId)
      .not(config.keyColumn, 'is', null)
      .range(from, from + KEY_PAGE_SIZE - 1)
    if (error) throw error
    ;(data ?? []).forEach(r => {
      const raw = r[config.keyColumn]
      if (raw == null || raw === '') return
      const key = config.keyTransform(raw)
      if (key) map.set(key, r.id)
    })
    if (!data || data.length < KEY_PAGE_SIZE) break
    from += KEY_PAGE_SIZE
  }
  return map
}

// ─── AI mapping (parametrizado) ────────────────────────────────────────────────
async function aiMapColumns(columns, sampleRows, config) {
  const samples = columns.slice(0, 30).map(col => {
    const vals = sampleRows.map(r => String(r[col] ?? '')).filter(Boolean).slice(0, 3)
    return `"${col}": [${vals.map(v => `"${v.slice(0, 40)}"`).join(', ')}]`
  }).join('\n')

  const prompt = `Mapeá estas columnas de un archivo de ${config.entidad} al schema.

Schema válido: ${config.schemaFields.join(', ')}, __ignore__

Reglas:
${config.promptRules}

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
    const validIds = new Set([...config.schemaFields, '__ignore__'])
    const safe = {}
    columns.forEach(col => {
      const entry = parsed[col]
      const fieldId = typeof entry === 'object' && entry !== null ? entry.field : entry
      safe[col] = validIds.has(fieldId) ? fieldId : (config.autoMap[normalize(col)] ?? '__ignore__')
    })
    return safe
  } catch (err) {
    console.warn('aiMapColumns fallback:', err?.message ?? err)
    const safe = {}
    columns.forEach(col => { safe[col] = config.autoMap[normalize(col)] ?? '__ignore__' })
    return safe
  }
}

// Devuelve { rows, skipped } — skipped son filas del archivo que, después
// de mapear columnas, no tienen ningún dato de identidad según
// config.hasIdentity (antes esto era hardcoded a "ni DNI, ni nombre, ni
// apellido" — ahora cada entidad define qué cuenta como identidad).
function applyMapping(rows, mapping, config) {
  let skipped = 0
  const mappedRows = []
  rows.forEach(row => {
    const entity = {}
    Object.entries(mapping).forEach(([col, field]) => {
      if (field === '__ignore__') return
      const val = String(row[col] ?? '').trim()
      if (val) entity[field] = val
    })
    config.postProcess?.(entity)
    entity.__key__ = config.getKey(entity)
    entity.__row__ = row.__fileRow__ ?? null
    if (config.hasIdentity(entity)) {
      mappedRows.push(entity)
    } else {
      skipped++
    }
  })
  return { rows: mappedRows, skipped }
}

function nombreDe(vecino) {
  return vecino.nombre_completo
    || [vecino.apellido, vecino.nombre].filter(Boolean).join(', ')
    || vecino.nombre || vecino.apellido || '(sin nombre)'
}

// ─── Exportar errores de importación a CSV (parametrizado) ────────────────────
// Mismo patrón (BOM UTF-8 + campos entre comillas) que Auditoria.jsx. La
// columna de clave (DNI) solo aparece para entidades que la declaran —
// proveedores no tiene un identificador propio en el archivo, así que
// esa columna directamente no se agrega en vez de ir siempre vacía.
function exportarErroresCSV(rowErrors, config) {
  const cols = ['Fila']
  if (config.errorKeyLabel) cols.push(config.errorKeyLabel)
  cols.push('Nombre', 'Error')
  const headers = cols.join(',')
  const filas = rowErrors.map(e => {
    const vals = [e.row ?? '']
    if (config.errorKeyLabel) vals.push(e.key ?? '')
    vals.push(e.nombre ?? '', e.message ?? '')
    return vals.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
  })
  const csv = [headers, ...filas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `errores-importacion-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Configuración por entidad ─────────────────────────────────────────────────
// Todo lo que distingue vecinos de proveedores vive acá. Agregar una
// tercera entidad en el futuro es sumar una entrada acá + un tab en
// ENTITY_TABS, sin tocar el motor de arriba.
const ENTITY_CONFIGS = {
  vecinos: {
    table: 'vecinos',
    entidad: 'vecinos',
    entidadLabelPlural: 'vecinos',
    titulo: 'Importar vecinos',
    descripcion: 'Importá vecinos al padrón desde Excel o CSV. La IA mapea las columnas automáticamente.',
    minColumnsHint: 'DNI, Nombre, Apellido o Nombre Completo. El resto se auto-completa.',
    schemaFields: VECINO_SCHEMA_FIELDS,
    autoMap: VECINO_AUTO_MAP,
    promptRules:
`- Si la columna tiene DNI → "dni"
- Si tiene nombre + apellido en columnas separadas → "nombre" y "apellido"
- Si tiene nombre completo → "nombre_completo"
- Si todos los valores son iguales o genéricos → "__ignore__"
- Si no corresponde a ningún campo → "__ignore__"`,
    keyColumn: 'dni',
    keyTransform: (v) => v,
    getKey: (row) => row.dni || null,
    hasIdentity: (row) => !!(row.dni || row.nombre || row.apellido),
    // Auto-completar nombre_completo si no viene en el archivo.
    postProcess: (vecino) => {
      if (!vecino.nombre_completo && vecino.apellido && vecino.nombre) {
        vecino.nombre_completo = `${vecino.apellido}, ${vecino.nombre}`
      }
    },
    returnCols: 'id, dni, nombre, apellido, nombre_completo, telefono, email',
    defaults: {},
    // vecinoSinContacto (lib/vecinoHelpers.js): ni teléfono ni email —
    // distinto de "sin email" (que sí puede tener teléfono), esa otra
    // señal se usa en el filtro del CRM, no acá.
    needsReview: vecinoSinContacto,
    fuzzyEnabled: true,
    showContactStats: true,
    hasContact: (v) => !!(v.email || v.telefono),
    errorKeyLabel: 'DNI',
    errorKey: (v) => v.dni ?? null,
    getLabel: nombreDe,
    renderPreview: (v) => ({
      titulo: v.nombre_completo || `${v.apellido || ''} ${v.nombre || ''}`.trim(),
      subtitulo: [v.dni ? `DNI ${v.dni}` : '', v.email || v.telefono || ''].filter(Boolean).join(' '),
      sinDatos: !v.email && !v.telefono,
      sinDatosLabel: 'Sin contacto',
    }),
  },
  proveedores: {
    table: 'proveedores',
    entidad: 'proveedores',
    entidadLabelPlural: 'proveedores',
    titulo: 'Importar proveedores',
    descripcion: 'Importá el catálogo de comercios adheridos a Vales Electrónicos desde Excel o CSV.',
    minColumnsHint: 'Nombre (obligatorio). Categoría, teléfono y dirección son opcionales.',
    schemaFields: PROVEEDOR_SCHEMA_FIELDS,
    autoMap: PROVEEDOR_AUTO_MAP,
    promptRules:
`- Si la columna es el nombre del comercio/proveedor → "nombre"
- Si es un rubro o tipo de negocio → "categoria"
- Si todos los valores son iguales o genéricos → "__ignore__"
- Si no corresponde a ningún campo → "__ignore__"`,
    // Dedup EXACTO por nombre normalizado (no hay CUIT ni identificador
    // único en el schema real de proveedores) — mismo criterio que el
    // DNI en vecinos: si ya existe, se actualiza en vez de duplicar.
    // keyTransform normaliza tanto lo que ya está en la base como lo que
    // viene del archivo, así "Almacén Don Ramón" y "almacen don ramon"
    // matchean como el mismo proveedor.
    keyColumn: 'nombre',
    keyTransform: normalize,
    getKey: (row) => normalize(row.nombre) || null,
    hasIdentity: (row) => !!row.nombre,
    postProcess: null,
    returnCols: 'id, nombre, categoria, telefono, direccion, activo',
    // Solo se aplica a ALTAS nuevas (ver handleImport) — nunca a un
    // update, para no reactivar en silencio un proveedor que el
    // municipio desactivó a propósito.
    defaults: { activo: true },
    needsReview: null,
    fuzzyEnabled: false,
    showContactStats: false,
    hasContact: null,
    errorKeyLabel: null,
    errorKey: null,
    getLabel: (p) => p.nombre || '(sin nombre)',
    renderPreview: (p) => ({
      titulo: p.nombre || '(sin nombre)',
      subtitulo: [p.categoria, p.telefono, p.direccion].filter(Boolean).join(' · '),
      sinDatos: false,
      sinDatosLabel: '',
    }),
  },
}

const ENTITY_TABS = [
  { value: 'vecinos',     label: 'Vecinos' },
  { value: 'proveedores', label: 'Proveedores' },
]

// ─── STEP 0: Upload ───────────────────────────────────────────────────────────
function StepUpload({ config, onFileLoaded }) {
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
        <h2 className="text-lg font-semibold text-primary">{config.titulo}</h2>
        <p className="mt-1 text-sm text-primary-500">{config.descripcion}</p>
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
          {config.minColumnsHint}
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
function StepConfirm({
  config, mapped, existingKeyMap, onImport, importing, importResult, onBack, progress,
  fuzzyState, fuzzyPairs, newItemsCount, onCheckFuzzy, onConfirmFuzzy, onCancelFuzzy,
}) {
  const withContact   = config.showContactStats ? mapped.filter(r => config.hasContact(r)).length : 0
  const incomplete    = config.showContactStats ? mapped.length - withContact : 0
  const conflictCount = mapped.filter(r => r.__key__ && existingKeyMap.has(r.__key__)).length

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
            {importResult.errors > 0 && (
              <span className="text-primary-500">
                <span className="text-danger font-semibold text-base">{importResult.errors}</span> con error
              </span>
            )}
          </div>

          {importResult.rowErrors?.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 max-w-sm mx-auto text-left">
              <p className="text-sm text-danger">
                <strong>{importResult.rowErrors.length}</strong> fila{importResult.rowErrors.length === 1 ? '' : 's'} del
                archivo no se pudo{importResult.rowErrors.length === 1 ? '' : 'ieron'} importar.
                Descargá el detalle, corregí esas filas en el archivo original y volvé a intentar
                solo con esas.
              </p>
              <button
                onClick={() => exportarErroresCSV(importResult.rowErrors, config)}
                className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-danger hover:bg-red-50 transition-colors"
              >
                Descargar errores (CSV)
              </button>
            </div>
          )}

          {config.needsReview && importResult.needsReview > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-accent-50 border border-accent-100 px-4 py-3 text-sm text-accent-700 max-w-sm mx-auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                <strong>{importResult.needsReview}</strong> {config.entidadLabelPlural} sin datos de contacto —
                aparecen en el CRM para completar después.
              </span>
            </div>
          )}

          {/* Posibles duplicados fuzzy — solo vecinos, a demanda, no
              automático. Es información útil pero no urgente; correrla
              sola acá bloquearía la pantalla justo cuando el usuario está
              esperando el resultado del import (ver handleImport). */}
          {config.fuzzyEnabled && (importResult.inserted + importResult.updated) > 0 && (
            <div className="mt-4">
              {fuzzyState === 'idle' && (
                <button
                  onClick={onCheckFuzzy}
                  className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium text-primary hover:bg-primary-50 transition-colors"
                >
                  Buscar posibles duplicados
                </button>
              )}

              {fuzzyState === 'confirmar' && (
                <div className="mx-auto max-w-sm rounded-xl border border-accent-100 bg-accent-50 p-4 text-left">
                  <p className="text-sm text-accent-700">
                    Son <strong>{newItemsCount}</strong> vecinos — la búsqueda puede tardar un rato
                    y la pantalla no va a responder mientras tanto. ¿Buscar igual?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={onCancelFuzzy}
                      className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-primary hover:bg-primary-50 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={onConfirmFuzzy}
                      className="flex-1 rounded-lg bg-[#1D4ED8] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e40af] transition-colors">
                      Buscar igual
                    </button>
                  </div>
                </div>
              )}

              {fuzzyState === 'buscando' && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary-500">
                  <Spinner size="sm" /> Buscando posibles duplicados…
                </div>
              )}

              {fuzzyState === 'listo' && (
                fuzzyPairs.length === 0 ? (
                  <p className="text-xs text-primary-500">No se encontraron posibles duplicados.</p>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden text-left max-w-sm mx-auto">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-primary-50 border-b border-border">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-accent shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-xs font-medium text-accent-700">
                        {fuzzyPairs.length} posibles duplicados detectados
                      </p>
                    </div>
                    <div className="divide-y divide-border bg-white">
                      {fuzzyPairs.map((pair, i) => {
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
                )
              )}
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
          <p className="text-xs text-primary-500 mt-1 capitalize">{config.entidadLabelPlural} detectados</p>
        </div>
        {config.showContactStats && (
          <div className="rounded-xl bg-primary-50 border border-border p-4 text-center">
            <p className="text-2xl font-bold text-primary">{withContact}</p>
            <p className="text-xs text-primary-500 mt-1">Con datos de contacto</p>
          </div>
        )}
        {config.showContactStats && incomplete > 0 && (
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
          {mapped.slice(0, 5).map((row, i) => {
            const { titulo, subtitulo, sinDatos, sinDatosLabel } = config.renderPreview(row)
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{titulo}</p>
                  <p className="text-xs text-primary-500 truncate">{subtitulo}</p>
                </div>
                {sinDatos && (
                  <span className="text-xs text-accent-700 shrink-0">{sinDatosLabel}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {config.showContactStats && incomplete > 0 && (
        <p className="text-xs text-primary-500">
          Los {config.entidadLabelPlural} sin datos se importan igual y quedan marcados para completar después.
        </p>
      )}

      <button onClick={onImport} disabled={importing}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3">
        {importing
          ? <><Spinner size="sm" /> Importando… {progress.total > 0 ? `${progress.done} de ${progress.total}` : ''}</>
          : <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar {mapped.length} {config.entidadLabelPlural}
            </>
        }
      </button>
      {importing && progress.total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-100">
          <div
            className="h-full rounded-full bg-[#1D4ED8] transition-all"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      )}

      <button onClick={onBack}
        className="w-full text-center text-xs text-primary-500 hover:text-primary transition-colors">
        ← Subir otro archivo
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ImportadorVecinos({ onDone }) {
  const { municipioId } = useEffectiveMunicipioId()
  const [searchParams] = useSearchParams()

  // `?entidad=proveedores` permite deep-link desde Proveedores.jsx ("+
  // Importar"). Default vecinos — es el camino que entra desde el
  // sidebar (Importador, sin querystring).
  const [entidad, setEntidad] = useState(() => {
    const fromUrl = searchParams.get('entidad')
    return ENTITY_CONFIGS[fromUrl] ? fromUrl : 'vecinos'
  })
  const config = ENTITY_CONFIGS[entidad]

  // step: 'upload' | 'sheet' | 'confirm'
  const [step, setStep]           = useState('upload')
  const [fileData, setFileData]   = useState(null)
  const [rows, setRows]           = useState([])
  const [mapped, setMapped]       = useState([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [existingKeyMap, setExistingKeyMap] = useState(() => new Map())
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState({ done: 0, total: 0 })
  const [importResult, setImportResult] = useState(null)
  const [newItemsImported, setNewItemsImported] = useState([])
  // fuzzyState: 'idle' | 'confirmar' | 'buscando' | 'listo' (solo vecinos)
  const [fuzzyState, setFuzzyState] = useState('idle')
  const [fuzzyPairs, setFuzzyPairs] = useState([])

  // Cambiar de entidad reinicia todo el wizard — un mapeo de columnas a
  // medio hacer para vecinos no tiene ningún sentido si se cambia a
  // proveedores. Bloqueado desde el render mientras step !== 'upload'
  // (ver selector de entidad más abajo), así que en la práctica esto
  // solo corre con el wizard recién arrancado, pero igual limpia por si acaso.
  function handleEntidadChange(next) {
    if (next === entidad) return
    setEntidad(next)
    setStep('upload')
    setFileData(null)
    setRows([])
    setMapped([])
    setSkippedCount(0)
    setExistingKeyMap(new Map())
    setImportResult(null)
    setNewItemsImported([])
    setFuzzyState('idle')
    setFuzzyPairs([])
  }

  async function analyzeAndConfirm(rawRows) {
    setAnalyzing(true)
    // Limpiar el resultado de una importación anterior -- si no, "Subir
    // otro archivo" podía mostrar de entrada el resultado (y los
    // duplicados) de la corrida previa en vez de la pantalla de
    // confirmación del archivo nuevo.
    setImportResult(null)
    setNewItemsImported([])
    setFuzzyState('idle')
    setFuzzyPairs([])
    // __fileRow__ es un campo propio que agregamos en parseSheet, no una
    // columna real del archivo — no se lo pasamos a la IA ni al mapeo.
    const columns = rawRows.length
      ? Object.keys(rawRows[0]).filter(c => c !== '__fileRow__')
      : []
    // En paralelo: el mapeo de columnas (IA) y las claves ya existentes
    // del municipio (para que el dedup no dependa de nada más). Si la
    // query de claves existentes falla, seguimos con un Map vacío --
    // peor caso: se trata todo como alta nueva, mismo fallback que ya
    // tenía vecinos antes de este cambio.
    const [mapping, keyMap] = await Promise.all([
      aiMapColumns(columns, rawRows.slice(0, 8), config),
      fetchExistingKeyMap(config, municipioId).catch(e => {
        console.warn('[ImportadorVecinos] fetchExistingKeyMap:', e.message)
        return new Map()
      }),
    ])
    const result = applyMapping(rawRows, mapping, config)
    setMapped(result.rows)
    setSkippedCount(result.skipped)
    setExistingKeyMap(keyMap)
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
    let inserted = 0, updated = 0, errors = 0, needsReview = 0
    const rowErrors = []
    const newItems = []
    setProgress({ done: 0, total: mapped.length })

    // La existencia Y el id salen del mismo Map (existingKeyMap) — no
    // hace falta una query aparte para resolver ids de las filas a
    // actualizar, a diferencia de la versión anterior (ver comentario
    // en fetchExistingKeyMap).
    const toInsert = []
    const toUpdate = []
    for (const row of mapped) {
      const { __key__, __row__, ...entity } = row
      entity.municipio_id = municipioId
      const existingId = __key__ ? existingKeyMap.get(__key__) : undefined
      if (existingId) {
        toUpdate.push({ entity, __row__, id: existingId })
      } else {
        // defaults (ej. activo:true en proveedores) SOLO para altas
        // nuevas — aplicarlo también en updates reactivaría en
        // silencio algo que el municipio desactivó a propósito.
        Object.assign(entity, config.defaults ?? {})
        toInsert.push({ entity, __row__ })
      }
    }

    function markDone(n = 1) {
      setProgress(p => ({ ...p, done: Math.min(p.total, p.done + n) }))
    }
    function recordError(entity, __row__, message) {
      errors++
      rowErrors.push({
        row: __row__,
        key: config.errorKey ? (config.errorKey(entity) ?? null) : null,
        nombre: config.getLabel(entity),
        message,
      })
    }

    // ── Updates ──────────────────────────────────────────────────────
    for (const { entity, __row__, id } of toUpdate) {
      try {
        const { error } = await supabase.from(config.table).update(entity).eq('id', id)
        if (error) throw error
        updated++
        if (config.needsReview?.(entity)) needsReview++
        newItems.push({ id, ...entity })
      } catch (e) {
        recordError(entity, __row__, e.message ?? 'Error desconocido al actualizar.')
      }
      markDone()
    }

    // ── Inserts en lotes de BATCH_SIZE ──────────────────────────────────
    // Si el lote entero falla, reintentamos sus filas de a una para
    // aislar cuál dato específico rompe, en vez de tirar abajo el lote
    // completo por una sola fila mala.
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE)
      const payload = chunk.map(c => c.entity)
      const { data, error } = await supabase.from(config.table).insert(payload).select(config.returnCols)

      if (!error) {
        inserted += data.length
        data.forEach(d => { if (config.needsReview?.(d)) needsReview++ })
        newItems.push(...data)
        markDone(chunk.length)
        continue
      }

      // Lote roto — reintentar fila por fila
      for (const { entity, __row__ } of chunk) {
        try {
          const { data: row, error: rowErr } = await supabase
            .from(config.table).insert(entity).select(config.returnCols).single()
          if (rowErr) throw rowErr
          inserted++
          if (config.needsReview?.(row)) needsReview++
          newItems.push(row)
        } catch (e) {
          recordError(entity, __row__, e.message ?? 'Error desconocido al insertar.')
        }
        markDone()
      }
    }

    setImportResult({ inserted, updated, skipped: skippedCount, errors, needsReview, rowErrors })
    setNewItemsImported(newItems)
    setImporting(false)
    // La detección fuzzy NO corre acá (y para proveedores no corre
    // nunca, ver config.fuzzyEnabled). Es información útil pero no
    // urgente (avisa que dos vecinos podrían ser la misma persona), y
    // es un cálculo O(n²) síncrono con Levenshtein -- correrla acá
    // congelaba la pestaña justo cuando el usuario está esperando el
    // resultado de cargar todo su padrón (confirmado en vivo: ~48s sin
    // responder con 2.000 filas). Se movió a un botón a demanda en el
    // resultado ("Buscar posibles duplicados"), donde el usuario ya
    // sabe que va a esperar. Ver runFuzzyCheck().
    if (inserted + updated > 0) {
      // Resumen agregado — loguear fila por fila sería impráctico
      // para importaciones de cientos de filas. Los errores por fila
      // ya quedan en el CSV descargable, no hace falta duplicarlos acá.
      logAudit({
        accion: inserted > 0 ? 'create' : 'update',
        entidad: config.entidad,
        descripcion: `Importación masiva de ${config.entidadLabelPlural}: ${inserted} alta${inserted === 1 ? '' : 's'}, ${updated} actualizaci${updated === 1 ? 'ón' : 'ones'}, ${errors} error${errors === 1 ? '' : 'es'}`,
        metadata: { entidad: config.entidad, inserted, updated, skipped: skippedCount, errors, needsReview },
      })
      onDone?.(newItems)
    }
  }

  // Umbral a partir del cual avisamos que la búsqueda de duplicados
  // puede tardar, antes de arrancarla.
  const FUZZY_CONFIRM_THRESHOLD = 500

  function handleCheckFuzzy() {
    if (newItemsImported.length > FUZZY_CONFIRM_THRESHOLD) {
      setFuzzyState('confirmar')
      return
    }
    runFuzzyCheck()
  }

  function runFuzzyCheck() {
    setFuzzyState('buscando')
    // Deferido un tick para que el spinner llegue a pintarse antes de
    // que el cálculo síncrono bloquee el hilo -- si no, el "honesto"
    // del spinner es mentira: nunca se vería.
    setTimeout(() => {
      const pairs = detectFuzzyDuplicates(newItemsImported)
      setFuzzyPairs(pairs)
      setFuzzyState('listo')
    }, 50)
  }

  function handleCancelFuzzy() {
    setFuzzyState('idle')
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
          Importá {config.entidadLabelPlural} desde Excel o CSV. La IA mapea las columnas automáticamente.
        </p>
      </header>

      {/* Selector de entidad — deshabilitado una vez que se arrancó un
          archivo, para no mezclar un mapeo a mitad de camino con otra
          entidad (ver handleEntidadChange). */}
      <div className="flex gap-2">
        {ENTITY_TABS.map(t => (
          <button
            key={t.value}
            type="button"
            disabled={step !== 'upload'}
            onClick={() => handleEntidadChange(t.value)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              entidad === t.value
                ? 'border-[#1D4ED8] bg-[#1D4ED8]/5 text-[#1D4ED8]'
                : 'border-border bg-white text-primary-500 hover:border-primary-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
            <StepUpload config={config} onFileLoaded={handleFileLoaded} />
          )}

          {step === 'sheet' && fileData && (
            <StepSheetSelector
              sheetNames={fileData.sheetNames}
              file={fileData.file}
              onSheetSelected={handleSheetSelected}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'confirm' && !municipioId && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              No pudimos determinar tu municipio — recargá la página antes de importar.
              Sin eso, la importación va a fallar fila por fila ({config.table}.municipio_id es obligatorio).
            </div>
          )}

          {step === 'confirm' && municipioId && (
            <StepConfirm
              config={config}
              mapped={mapped}
              existingKeyMap={existingKeyMap}
              onImport={handleImport}
              importing={importing}
              importResult={importResult}
              onBack={() => setStep('upload')}
              progress={progress}
              fuzzyState={fuzzyState}
              fuzzyPairs={fuzzyPairs}
              newItemsCount={newItemsImported.length}
              onCheckFuzzy={handleCheckFuzzy}
              onConfirmFuzzy={runFuzzyCheck}
              onCancelFuzzy={handleCancelFuzzy}
            />
          )}
        </div>
      </div>
    </div>
  )
}
