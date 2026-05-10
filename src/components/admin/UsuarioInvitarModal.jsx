import { useMemo, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

// =============================================================
// Modal "Invitar usuario" — abre desde la lista de usuarios.
// El padre maneja el alta efectiva (INSERT en `usuarios`) y los
// permisos por rol del operador. Acá solo recolectamos los datos
// del formulario.
// =============================================================

const ROLES_SUB_DEPENDENCIA = new Set(['subadmin', 'usuario_sub'])

function emptyForm() {
  return {
    email:           '',
    nombre:          '',
    rol:             '',
    dependencia_id:  '',
  }
}

export default function UsuarioInvitarModal({
  open, onClose, onSave, saving = false,
  rolesAsignables = [],
  dependencias = [],
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const rolesOpts = useMemo(
    () => rolesAsignables.map(r => ({ value: r.value, label: r.label })),
    [rolesAsignables],
  )
  const depsOpts = useMemo(
    () => (dependencias ?? [])
      .filter(d => d.activa !== false)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
      .map(d => ({ value: d.id, label: d.nombre })),
    [dependencias],
  )

  const necesitaDep = ROLES_SUB_DEPENDENCIA.has(form.rol)
  const canSubmit =
    !!form.email.trim() &&
    !!form.nombre.trim() &&
    !!form.rol &&
    (!necesitaDep || !!form.dependencia_id)

  async function handleSave() {
    setError('')
    try {
      await onSave({
        email:           form.email.trim().toLowerCase(),
        nombre:          form.nombre.trim(),
        rol:             form.rol,
        dependencia_id:  necesitaDep ? form.dependencia_id : null,
      })
      setForm(emptyForm())
    } catch (e) {
      setError(e?.message ?? 'No pudimos crear la invitación.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar usuario"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>
            Invitar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          placeholder="usuario@municipio.gob.ar"
          required
          autoComplete="off"
        />
        <Input
          label="Nombre completo"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          placeholder="Apellido, Nombre"
          required
          autoComplete="off"
        />
        <Select
          label="Rol"
          value={form.rol}
          onChange={v => set('rol', v)}
          placeholder="Seleccionar..."
          options={rolesOpts}
        />
        {necesitaDep && (
          <Select
            label="Dependencia asignada"
            value={form.dependencia_id}
            onChange={v => set('dependencia_id', v)}
            placeholder="Seleccionar dependencia..."
            options={depsOpts}
          />
        )}
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
        <p className="text-xs text-primary-400">
          El usuario se crea como inactivo. Tiene que aceptar la invitación
          (ver email) antes de poder ingresar.
        </p>
      </div>
    </Modal>
  )
}
