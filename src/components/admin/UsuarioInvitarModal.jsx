import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import FormError from '../ui/FormError'
import VecinoBuscador, { vecinoLabel } from './VecinoBuscador'

// =============================================================
// Modal "Invitar usuario" — abre desde la lista de usuarios.
// El padre maneja el alta efectiva (INSERT en `usuarios`) y los
// permisos por rol del operador. Acá solo recolectamos los datos
// del formulario.
//
// El email SALE del vecino elegido en VecinoBuscador — no se tipea a
// mano. El vínculo usuarios↔vecinos es únicamente por email
// (current_vecino_id() matchea por ahí); antes este form pedía el
// email tipeado suelto, y un typo partía a la persona en dos: entraba
// al panel admin sin problema pero su lado de vecino (turnos, vales)
// quedaba huérfano, sin ningún error visible en ninguna pantalla.
// "Escribir el email a mano" sigue existiendo como salida de
// emergencia, pero ya no es el camino principal.
// =============================================================

const ROLES_INFO = {
  superadmin: 'Acceso total a todos los municipios. Solo Frey Consulting.',
  admin_comuna: 'Administrador del municipio. Acceso completo a todos los módulos.',
  admin_portal_web: 'Gestiona el portal ciudadano: noticias, trámites, historia.',
  admin_portal: 'Gestiona el portal ciudadano: noticias, trámites, historia.',
  usuario_admin: 'Acceso a operaciones administrativas cross-dependencias.',
  subadmin: 'Administrador de una dependencia específica.',
  usuario_subadmin: 'Operador de una dependencia. Carga turnos y datos.',
  usuario_sub: 'Operador de una dependencia. Carga turnos y datos.',
  reporting: 'Solo lectura. Puede ver reportes y exportar datos.',
  vecino: 'Ciudadano registrado. Acceso al portal y sus turnos.',
}

const ROLES_SUB_DEPENDENCIA = new Set(['subadmin', 'usuario_sub'])

function emptyForm() {
  return {
    vecino:         null,
    emailNuevo:     '',    // email a cargar si el vecino elegido no tiene uno
    modoManual:     false, // salida de emergencia — tipear email a mano
    emailManual:    '',
    nombreManual:   '',
    rol:            '',
    dependencia_id: '',
  }
}

export default function UsuarioInvitarModal({
  open, onClose, onSave, saving = false,
  rolesAsignables = [],
  dependencias = [],
  municipioId,
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const rolesOpts = rolesAsignables.map(r => ({ value: r.value, label: r.label }))
  const depsOpts = (dependencias ?? [])
    .filter(d => d.activa !== false)
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
    .map(d => ({ value: d.id, label: d.nombre }))

  const necesitaDep = ROLES_SUB_DEPENDENCIA.has(form.rol)

  const nombreEfectivo = form.modoManual ? form.nombreManual.trim() : vecinoLabel(form.vecino)
  const emailEfectivo = form.modoManual
    ? form.emailManual.trim().toLowerCase()
    : (form.vecino?.email || form.emailNuevo.trim().toLowerCase())

  const canSubmit =
    !!emailEfectivo &&
    !!nombreEfectivo &&
    !!form.rol &&
    (!necesitaDep || !!form.dependencia_id) &&
    (form.modoManual || !!form.vecino)

  async function handleSave() {
    setError('')
    try {
      await onSave({
        email:          emailEfectivo,
        nombre:         nombreEfectivo,
        rol:            form.rol,
        dependencia_id: necesitaDep ? form.dependencia_id : null,
        // El padre necesita el vecino completo (no solo el email) para
        // poder escribirle el email nuevo en `vecinos` ANTES de invitar,
        // cuando el vecino elegido todavía no tenía uno cargado.
        vecino:         form.modoManual ? null : form.vecino,
      })
      setForm(emptyForm())
    } catch (e) {
      setError(e?.message ?? 'No pudimos crear la invitación.')
    }
  }

  function handleClose() {
    setForm(emptyForm())
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invitar usuario"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>
            Invitar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!form.modoManual ? (
          <>
            <VecinoBuscador
              municipioId={municipioId}
              vecino={form.vecino}
              onSeleccionar={(v) => { set('vecino', v); set('emailNuevo', '') }}
              label="Buscar en el padrón"
              placeholder="DNI o nombre del vecino…"
              selectedLabel="Persona seleccionada"
            />
            {form.vecino && !form.vecino.email && (
              <Input
                label="Este vecino no tiene email cargado — completalo"
                type="email"
                value={form.emailNuevo}
                onChange={e => set('emailNuevo', e.target.value)}
                placeholder="usuario@municipio.gob.ar"
                required
                autoComplete="off"
              />
            )}
            <button
              type="button"
              onClick={() => set('modoManual', true)}
              className="text-xs text-primary-500 hover:text-primary hover:underline"
            >
              ¿No lo encontrás en el padrón? Escribir el email a mano
            </button>
          </>
        ) : (
          <>
            <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-xs text-accent-700">
              Salida de emergencia: esta persona va a poder entrar al panel admin, pero queda{' '}
              <b>sin vínculo a ningún vecino</b> — no va a poder operar como vecino (turnos, vales)
              hasta que alguien la cargue en el padrón con este mismo email.
            </div>
            <Input
              label="Email"
              type="email"
              value={form.emailManual}
              onChange={e => set('emailManual', e.target.value)}
              placeholder="usuario@municipio.gob.ar"
              required
              autoComplete="off"
            />
            <Input
              label="Nombre completo"
              value={form.nombreManual}
              onChange={e => set('nombreManual', e.target.value)}
              placeholder="Apellido, Nombre"
              required
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => set('modoManual', false)}
              className="text-xs text-primary-500 hover:text-primary hover:underline"
            >
              ← Volver a elegir del padrón
            </button>
          </>
        )}

        <div>
          <Select
            label="Rol"
            value={form.rol}
            onChange={v => set('rol', v)}
            placeholder="Seleccionar..."
            options={rolesOpts}
          />
          {form.rol && ROLES_INFO[form.rol] && (
            <p className="mt-1 text-xs text-primary-400">
              {ROLES_INFO[form.rol]}
            </p>
          )}
        </div>
        {necesitaDep && (
          <Select
            label="Dependencia asignada"
            value={form.dependencia_id}
            onChange={v => set('dependencia_id', v)}
            placeholder="Seleccionar dependencia..."
            options={depsOpts}
          />
        )}
        <FormError>{error}</FormError>
        <p className="text-xs text-primary-400">
          El usuario se crea como inactivo. Tiene que aceptar la invitación
          (ver email) antes de poder ingresar.
        </p>
      </div>
    </Modal>
  )
}
