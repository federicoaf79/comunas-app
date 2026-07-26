// deviceId — identificador estable del teléfono/navegador, usado para
// vincular un dispositivo a UN comercio (Vales Electrónicos, Fase 3).
// No es una identidad de seguridad -- vinculo/canje siguen validando
// del lado del server (vincular_dispositivo/canjear_vale). Es solo la
// forma de saber "con qué aparato estoy operando".

const KEY = 'comunas_device_id'

export function getDeviceId() {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
