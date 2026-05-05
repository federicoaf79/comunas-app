function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-primary-400">{label}</p>
      <p className="mt-1 text-sm text-primary-700">{value || '—'}</p>
    </div>
  )
}

const SEXO_LABEL = { F: 'Femenino', M: 'Masculino', X: 'Otro' }

export default function VecinoDatos({ vecino }) {
  return (
    <div className="card p-6">
      <h3 className="mb-4 text-sm font-semibold text-primary-700">Datos personales</h3>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nombre"     value={vecino.nombre} />
        <Field label="Apellido"   value={vecino.apellido} />
        <Field label="DNI"        value={vecino.dni} />
        <Field label="Sexo"       value={SEXO_LABEL[vecino.sexo]} />
        <Field label="Fecha de nacimiento" value={vecino.fecha_nac} />
        <Field label="Teléfono"   value={vecino.telefono} />
        <Field label="Email"      value={vecino.email} />
        <Field label="Barrio"     value={vecino.barrio} />
        <Field label="Dirección"  value={vecino.direccion} />
      </div>
    </div>
  )
}
