import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useMunicipios, useProvinciasConfig, useCreateMunicipio,
  slugify,
  DEPENDENCIAS_DEFAULT_COMISION, DEPENDENCIAS_DEFAULT_MUNICIPIO,
} from '../../hooks/useMunicipios'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'

// =============================================================
// Página SuperAdmin — Gestión de Municipios y Comisiones
//
// Tabla de municipios + wizard de 3 pasos para alta:
//   1) Selección de provincia (cards)
//   2) Datos del municipio (form)
//   3) Confirmación + ejecución de los 5 INSERTs
//
// El wizard vive dentro de un Modal grande para no perder el
// contexto del listado al volver. La animación entre pasos es un
// fade simple via Tailwind animate-fade-in al re-mount del slide.
// =============================================================

// Ícono SVG simple del mapa de Argentina — silueta estilizada que
// se usa como símbolo en las cards de provincia. No es un mapa
// preciso: alcanza con que comunique "país" en el contexto.
function ArgentinaIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M30 4c-3 4-3 8-1 12-4 2-6 6-5 10 2 4 6 5 6 9-1 4-5 6-5 10 0 4 4 6 5 10 1 4-2 7-1 11 1 3 4 4 4 4 0-3 2-5 4-7 1-2 1-5-1-7-2-3-1-7 1-9 3-2 5-5 4-9-1-3-4-5-4-8 0-3 2-5 4-8 2-3 1-7-2-9-3-2-7-2-9-9z" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal — listado + botón "Nuevo"
// ─────────────────────────────────────────────────────────────────

export default function Municipios() {
  const { data: municipios = [], isLoading, error } = useMunicipios()
  const [openWizard, setOpenWizard] = useState(false)

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">
            Gestión de Municipios y Comisiones
          </h1>
          <p className="text-sm text-primary-400">
            Administrá todos los clientes del sistema.
          </p>
        </div>
        <Button onClick={() => setOpenWizard(true)}>
          + Nuevo municipio/comisión
        </Button>
      </header>

      <Card className="p-0">
        {isLoading ? (
          <div className="flex justify-center p-12"><Spinner /></div>
        ) : error ? (
          <div className="p-5 text-sm text-danger">
            No se pudo cargar el listado: {error.message}
          </div>
        ) : municipios.length === 0 ? (
          <div className="p-12 text-center text-sm text-primary-400">
            Todavía no hay municipios cargados. Apretá <b>+ Nuevo municipio/comisión</b> para crear el primero.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-primary-50/50 text-xs uppercase tracking-wider text-primary-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Provincia</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Usuarios</th>
                  <th className="px-4 py-3 text-right">Deps</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {municipios.map(m => (
                  <tr key={m.id} className="transition-colors hover:bg-primary-50/30">
                    <td className="px-4 py-3 font-medium text-primary">{m.nombre}</td>
                    <td className="px-4 py-3 text-primary-700">{m.provincia_nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-500">{m.slug}</td>
                    <td className="px-4 py-3">
                      <Badge variant={m.activo ? 'ok' : 'neutral'}>
                        {m.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.usuarios_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.dependencias_count}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin?municipio=${m.slug}`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openWizard && (
        <WizardModal
          onClose={() => setOpenWizard(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Wizard — 3 pasos
// ─────────────────────────────────────────────────────────────────

function emptyWizardState() {
  return {
    paso: 1,
    provincia: null,           // objeto provincias_config seleccionado
    tipo_gobierno: 'comision', // 'comision' | 'municipio'
    nombre: '',
    slug: '',
    slugTouched: false,
    localidad: '',
    departamento: '',
    poblacion: '',
    direccion: '',
    telefono: '',
    email: '',
    // step 4: resultado tras crear
    creado: null,              // { id, nombre, slug } cuando termina ok
    creando: false,
    errorCreacion: '',
    progress: {},              // { a:'done', b:'done', ... }
  }
}

function WizardModal({ onClose }) {
  const [s, setS] = useState(emptyWizardState)
  const set = (patch) => setS(prev => ({ ...prev, ...patch }))

  const dependenciasDefault = s.tipo_gobierno === 'municipio'
    ? DEPENDENCIAS_DEFAULT_MUNICIPIO
    : DEPENDENCIAS_DEFAULT_COMISION

  const titulo = s.creado
    ? 'Municipio creado'
    : `Nuevo municipio · Paso ${s.paso} de 3`

  return (
    <Modal
      open
      onClose={s.creando ? () => {} : onClose}
      title={titulo}
      size="xl"
      footer={
        <WizardFooter
          state={s}
          set={set}
          onClose={onClose}
          onResetForOther={() => setS(emptyWizardState())}
          dependenciasDefault={dependenciasDefault}
        />
      }
    >
      {/* Stepper visual */}
      {!s.creado && (
        <div className="mb-5 flex items-center gap-2">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex flex-1 items-center gap-2">
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                  (n === s.paso
                    ? 'bg-primary text-white'
                    : n < s.paso
                      ? 'bg-accent text-white'
                      : 'bg-primary-100 text-primary-500')
                }
              >
                {n < s.paso ? '✓' : n}
              </span>
              {n < 3 && (
                <span className={'h-0.5 flex-1 ' + (n < s.paso ? 'bg-accent' : 'bg-primary-100')} />
              )}
            </div>
          ))}
        </div>
      )}

      <div key={s.paso} className="animate-fade-in">
        {s.creado ? (
          <PasoExito creado={s.creado} />
        ) : s.paso === 1 ? (
          <Paso1Provincia state={s} set={set} />
        ) : s.paso === 2 ? (
          <Paso2Datos state={s} set={set} />
        ) : (
          <Paso3Confirmacion state={s} set={set} dependenciasDefault={dependenciasDefault} />
        )}
      </div>
    </Modal>
  )
}

function WizardFooter({ state, set, onClose, onResetForOther, dependenciasDefault }) {
  const create = useCreateMunicipio()

  if (state.creado) {
    return (
      <>
        <Button variant="secondary" onClick={onResetForOther}>Crear otro</Button>
        <Link to={`/admin?municipio=${state.creado.slug}`} className="btn-primary">
          Ver municipio
        </Link>
      </>
    )
  }

  const puedeAvanzar1 = !!state.provincia
  const puedeAvanzar2 = !!state.nombre.trim() && !!state.slug.trim() && !!state.localidad.trim()

  if (state.paso === 1) {
    return (
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => set({ paso: 2 })} disabled={!puedeAvanzar1}>
          Siguiente →
        </Button>
      </>
    )
  }
  if (state.paso === 2) {
    return (
      <>
        <Button variant="secondary" onClick={() => set({ paso: 1 })}>← Anterior</Button>
        <Button onClick={() => set({ paso: 3 })} disabled={!puedeAvanzar2}>
          Siguiente →
        </Button>
      </>
    )
  }
  // paso 3 — botón crear
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => set({ paso: 2, errorCreacion: '' })}
        disabled={state.creando}
      >
        ← Anterior
      </Button>
      <Button
        loading={state.creando}
        disabled={state.creando}
        onClick={async () => {
          set({ creando: true, errorCreacion: '', progress: {} })
          try {
            const onProgress = (event) => {
              const [step, status] = event.split(':')
              set({ progress: { ...state.progress, [step]: status } })
            }
            const res = await create.mutateAsync({
              payload: {
                nombre:           state.nombre.trim(),
                slug:             state.slug.trim(),
                provincia_id:     state.provincia.id,
                provincia_nombre: state.provincia.nombre,
                tipo_gobierno:    state.tipo_gobierno,
                localidad:        state.localidad.trim(),
                departamento:     state.departamento.trim(),
                poblacion:        state.poblacion.trim(),
                direccion:        state.direccion.trim(),
                telefono:         state.telefono.trim(),
                email:            state.email.trim(),
                ley_marco:        state.provincia.ley_marco ?? null,
                organo_control:   state.provincia.organo_control ?? null,
                dependenciasNombres: dependenciasDefault,
              },
              onProgress,
            })
            set({ creado: res, creando: false })
          } catch (e) {
            set({ creando: false, errorCreacion: e.message ?? 'Error desconocido' })
          }
        }}
      >
        Crear municipio
      </Button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Paso 1 — Provincia
// ─────────────────────────────────────────────────────────────────

function Paso1Provincia({ state, set }) {
  const { data: provincias = [], isLoading, error } = useProvinciasConfig()

  if (isLoading) return <div className="flex justify-center p-12"><Spinner /></div>
  if (error) return (
    <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
      No se pudieron cargar las provincias: {error.message}
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sora text-lg font-bold text-primary">¿En qué provincia está?</h3>
        <p className="text-sm text-primary-400">
          Esto define el marco legal y el órgano de control que se aplicará al municipio.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {provincias.map(p => {
          const selected = state.provincia?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => set({ provincia: p })}
              className={
                'flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ' +
                (selected
                  ? 'border-accent bg-primary-50 shadow-card'
                  : 'border-border bg-white hover:border-primary-200 hover:bg-primary-50/30')
              }
            >
              <ArgentinaIcon className={'h-7 w-7 ' + (selected ? 'text-accent' : 'text-primary-400')} />
              <div className="font-sora text-base font-bold text-primary">{p.nombre}</div>
              {p.ley_marco && (
                <div className="text-xs text-primary-500">
                  <span className="text-primary-400">Ley marco: </span>
                  {p.ley_marco}
                </div>
              )}
              {p.organo_control && (
                <div className="text-xs text-primary-500">
                  <span className="text-primary-400">Control: </span>
                  {p.organo_control}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Paso 2 — Datos del municipio
// ─────────────────────────────────────────────────────────────────

function Paso2Datos({ state, set }) {
  // Auto-slug: si el usuario no tocó manualmente el slug, lo
  // regeneramos cada vez que cambia el nombre. Una vez tocado,
  // queda fijo (el campo es editable).
  useEffect(() => {
    if (!state.slugTouched) {
      const next = slugify(state.nombre)
      if (next !== state.slug) set({ slug: next })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nombre])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sora text-lg font-bold text-primary">Datos del municipio</h3>
        <p className="text-sm text-primary-400">
          Provincia seleccionada: <b>{state.provincia?.nombre}</b>
        </p>
      </div>

      {/* Tipo de gobierno */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-primary-700">Tipo de gobierno</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { v: 'comision',  label: 'Comisión Municipal',     hint: 'Localidades chicas — Ley 6706' },
            { v: 'municipio', label: 'Municipio / Municipalidad', hint: 'Categoría 1ª, 2ª o 3ª' },
          ].map(opt => {
            const selected = state.tipo_gobierno === opt.v
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => set({ tipo_gobierno: opt.v })}
                className={
                  'flex flex-col items-start rounded-lg border-2 p-3 text-left transition-all ' +
                  (selected
                    ? 'border-accent bg-primary-50'
                    : 'border-border bg-white hover:border-primary-200')
                }
              >
                <span className="font-sora text-sm font-bold text-primary">{opt.label}</span>
                <span className="text-xs text-primary-500">{opt.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Input
        label="Nombre completo oficial"
        required
        value={state.nombre}
        onChange={e => set({ nombre: e.target.value })}
        placeholder="Comisión Municipal de Real Sayana"
      />

      <Input
        label="Slug (URL del municipio)"
        required
        value={state.slug}
        onChange={e => set({ slug: e.target.value, slugTouched: true })}
        placeholder="real-sayana"
      />

      <Input
        label="Localidad / Nombre corto"
        required
        value={state.localidad}
        onChange={e => set({ localidad: e.target.value })}
        placeholder="Real Sayana"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Departamento"
          value={state.departamento}
          onChange={e => set({ departamento: e.target.value })}
          placeholder="Opcional"
        />
        <Input
          label="Población estimada"
          type="number"
          value={state.poblacion}
          onChange={e => set({ poblacion: e.target.value })}
          placeholder="Opcional"
        />
      </div>

      <Input
        label="Dirección sede"
        value={state.direccion}
        onChange={e => set({ direccion: e.target.value })}
        placeholder="Opcional"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Teléfono"
          value={state.telefono}
          onChange={e => set({ telefono: e.target.value })}
          placeholder="Opcional"
        />
        <Input
          label="Email institucional"
          type="email"
          value={state.email}
          onChange={e => set({ email: e.target.value })}
          placeholder="Opcional"
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Paso 3 — Confirmación
// ─────────────────────────────────────────────────────────────────

const PASOS_LABEL = {
  a: 'Crear municipio',
  b: 'Crear dependencias',
  c: 'Aplicar normativa provincial',
  d: 'Guardar datos institucionales',
  e: 'Inicializar partidas presupuestarias',
}

function Paso3Confirmacion({ state, dependenciasDefault }) {
  const tipoLabel = state.tipo_gobierno === 'municipio'
    ? 'Municipio / Municipalidad'
    : 'Comisión Municipal'

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sora text-lg font-bold text-primary">Confirmá la creación</h3>
        <p className="text-sm text-primary-400">
          Repasá los datos. Una vez creado, podés editarlos desde Configuración general del propio municipio.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ResumenItem label="Municipio"          value={state.nombre} />
        <ResumenItem label="Tipo"               value={tipoLabel} />
        <ResumenItem label="Provincia"          value={state.provincia?.nombre} />
        <ResumenItem label="Ley marco"          value={state.provincia?.ley_marco ?? '—'} />
        <ResumenItem label="Órgano de control"  value={state.provincia?.organo_control ?? '—'} />
        <ResumenItem label="Slug"               value={state.slug} mono />
      </div>

      <div className="rounded-lg border border-border bg-primary-50/40 p-4">
        <h4 className="font-sora text-sm font-bold text-primary">Dependencias que se crearán</h4>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {dependenciasDefault.map(n => (
            <li key={n} className="flex items-center gap-2 text-sm text-primary-700">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {n}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-primary-50/40 p-4">
        <h4 className="font-sora text-sm font-bold text-primary">
          Configuración normativa que se aplicará
        </h4>
        <p className="mt-1 text-sm text-primary-700">
          Se cargará la normativa de <b>{state.provincia?.nombre}</b> en el módulo de
          Administración (clave <code className="font-mono text-xs">normativa_provincial</code>),
          junto con los datos institucionales (clave{' '}
          <code className="font-mono text-xs">datos_municipio</code>) y las partidas
          presupuestarias 02, 03 y 04 inicializadas en cero por dependencia.
        </p>
      </div>

      {(state.creando || Object.keys(state.progress ?? {}).length > 0) && (
        <div className="rounded-lg border border-border bg-white p-4">
          <h4 className="font-sora text-sm font-bold text-primary">Progreso</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {Object.entries(PASOS_LABEL).map(([k, label]) => {
              const st = state.progress[k]
              return (
                <li key={k} className="flex items-center gap-2">
                  <ProgressDot status={st} />
                  <span className={st === 'done' ? 'text-primary-700' : 'text-primary-500'}>{label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {state.errorCreacion && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {state.errorCreacion}
        </div>
      )}
    </div>
  )
}

function ProgressDot({ status }) {
  if (status === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white" aria-label="completado">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  if (status === 'start') {
    return <span className="h-5 w-5"><Spinner size="sm" /></span>
  }
  if (status === 'warn') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold" aria-label="con advertencia">!</span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold" aria-label="error">×</span>
    )
  }
  return <span className="h-5 w-5 rounded-full border-2 border-primary-200" />
}

function ResumenItem({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-primary-400">{label}</div>
      <div className={'mt-0.5 text-sm font-semibold text-primary ' + (mono ? 'font-mono' : '')}>
        {value || '—'}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Paso final — éxito
// ─────────────────────────────────────────────────────────────────

function PasoExito({ creado }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ok text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-7 w-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <h3 className="font-sora text-xl font-bold text-primary">Municipio creado exitosamente</h3>
      <p className="text-sm text-primary-500">
        <b>{creado.nombre}</b> ya está disponible en el sistema.
      </p>
      <p className="max-w-md text-xs text-primary-400">
        Las dependencias y la normativa se aplicaron correctamente. El próximo paso es
        invitar al primer admin del municipio desde la pantalla de Usuarios.
      </p>
    </div>
  )
}
