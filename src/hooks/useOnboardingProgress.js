import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const CHECKLIST_ITEMS = [
  // Identidad
  { id: 'municipio_nombre',  group: 'Identidad',    label: 'Nombre oficial cargado',       action_url: '/admin/config-general',              action_label: 'Configurar' },
  { id: 'municipio_logo',    group: 'Identidad',    label: 'Logo del municipio subido',    action_url: '/admin/config-general',              action_label: 'Subir logo' },
  // Dependencias
  { id: 'dep_activa',        group: 'Dependencias', label: 'Al menos 1 dependencia activa', action_url: '/admin/dependencias',               action_label: 'Configurar' },
  { id: 'dep_info',          group: 'Dependencias', label: 'Info completa en dependencia', action_url: '/admin/dependencias',                action_label: 'Completar' },
  { id: 'dep_landing',       group: 'Dependencias', label: 'Landing pública configurada',  action_url: '/admin/dependencias',                action_label: 'Configurar' },
  // Portal
  { id: 'portal_noticia',    group: 'Portal',       label: 'Primera noticia publicada',    action_url: '/admin/noticias',                    action_label: 'Publicar' },
  { id: 'portal_autoridad',  group: 'Portal',       label: 'Autoridades cargadas',         action_url: '/admin/config?tab=autoridades',      action_label: 'Agregar' },
  // Usuarios
  { id: 'usuario_operador',  group: 'Usuarios',     label: 'Al menos 1 operador creado',   action_url: '/admin/usuarios',                    action_label: 'Agregar' },
  // WhatsApp
  { id: 'wa_conectado',      group: 'WhatsApp',     label: 'WhatsApp Business conectado',  action_url: '/admin/config-general',              action_label: 'Conectar' },
  { id: 'wa_bot',            group: 'WhatsApp',     label: 'Bot IA configurado',           action_url: '/admin/config-general',              action_label: 'Configurar' },
]

export function useOnboardingProgress(municipioId) {
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchProgress = useCallback(async () => {
    if (!municipioId) return
    setLoading(true)
    try {
      const [
        { data: configData },
        { count: depsActivas },
        { count: depsConInfo },
        { count: depsConLanding },
        { count: noticias },
        { count: autoridades },
        { count: operadores },
        { data: botConfig },
      ] = await Promise.all([
        supabase.from('configuracion_portal')
          .select('clave, valor')
          .eq('municipio_id', municipioId)
          .in('clave', ['datos_municipio', 'plan_b_org_id']),
        supabase.from('dependencias')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId)
          .eq('activa', true),
        supabase.from('dependencias')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId)
          .eq('activa', true)
          .not('telefono', 'is', null),
        supabase.from('dependencias')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId)
          .eq('activa', true)
          .not('landing_hero_descripcion', 'is', null),
        supabase.from('noticias_municipio')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId),
        supabase.from('autoridades')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId),
        supabase.from('usuarios')
          .select('id', { count: 'exact', head: true })
          .eq('municipio_id', municipioId)
          .eq('rol', 'operador'),
        supabase.from('configuracion_portal')
          .select('valor')
          .eq('municipio_id', municipioId)
          .eq('clave', 'plan_b_org_id')
          .maybeSingle(),
      ])

      const cfg = Object.fromEntries(
        (configData ?? []).map(r => [r.clave, r.valor])
      )

      let nombreOficial = ''
      let logoUrl = ''
      try {
        const datos = JSON.parse(cfg.datos_municipio ?? '{}')
        nombreOficial = datos.nombre_oficial ?? ''
        logoUrl = datos.logo_url ?? ''
      } catch {}

      setProgress({
        municipio_nombre:  !!nombreOficial,
        municipio_logo:    !!logoUrl,
        dep_activa:        (depsActivas ?? 0) > 0,
        dep_info:          (depsConInfo ?? 0) > 0,
        dep_landing:       (depsConLanding ?? 0) > 0,
        portal_noticia:    (noticias ?? 0) > 0,
        portal_autoridad:  (autoridades ?? 0) > 0,
        usuario_operador:  (operadores ?? 0) > 0,
        wa_conectado:      !!(botConfig?.valor),
        wa_bot:            !!(botConfig?.valor),
      })
    } catch (err) {
      console.warn('[onboarding] error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [municipioId])

  useEffect(() => { fetchProgress() }, [fetchProgress])

  const completedCount = CHECKLIST_ITEMS.filter(i => progress[i.id]).length
  const totalCount = CHECKLIST_ITEMS.length
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return { progress, loading, completedCount, totalCount, pct, refetch: fetchProgress }
}
