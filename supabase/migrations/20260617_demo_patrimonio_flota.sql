-- =============================================================
-- 20260617_demo_patrimonio_flota
--
-- Datos demo de Patrimonio y Flota para Real Sayana.
-- Estructura genérica aplicable a cualquier municipio.
-- =============================================================

DO $$
DECLARE
  v_mid uuid := (SELECT id FROM municipios WHERE slug = 'real-sayana');
  v_usr uuid := (SELECT id FROM usuarios WHERE municipio_id = v_mid LIMIT 1);
  v_dep_adm uuid := (SELECT id FROM dependencias WHERE nombre ILIKE '%administra%' AND municipio_id = v_mid LIMIT 1);
  v_dep_op uuid := (SELECT id FROM dependencias WHERE nombre ILIKE '%obras%' AND municipio_id = v_mid LIMIT 1);
BEGIN

  -- Solo insertar si existe Real Sayana
  IF v_mid IS NULL THEN
    RAISE NOTICE 'Municipio Real Sayana no encontrado. Saltando demo data.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- BIENES PATRIMONIO
  -- ═══════════════════════════════════════════════════════════

  INSERT INTO bienes_patrimonio
    (municipio_id, dependencia_id, tipo, nombre, descripcion,
     estado, valor_fiscal, fecha_adquisicion, ubicacion, activo)
  VALUES
    (v_mid, v_dep_adm, 'inmueble', 'Edificio Municipal Principal',
     'Sede administrativa de la Comisión Municipal',
     'bueno', 45000000, '1985-03-15', 'Av. Principal s/n', true),

    (v_mid, v_dep_adm, 'inmueble', 'Sala de Primeros Auxilios',
     'Edificio de atención médica municipal',
     'bueno', 12000000, '2003-06-01', 'Calle Salud 150', true),

    (v_mid, v_dep_adm, 'inmueble', 'Salón de Usos Múltiples',
     'Salón comunitario para eventos y reuniones',
     'regular', 8500000, '1998-11-20', 'Plaza Central s/n', true),

    (v_mid, v_dep_op, 'equipamiento', 'Motoniveladora CAT 120K',
     'Equipo vial para mantenimiento de caminos rurales',
     'bueno', 85000000, '2019-04-10', 'Depósito Municipal', true),

    (v_mid, v_dep_op, 'equipamiento', 'Retroexcavadora JCB 3CX',
     'Para obras de infraestructura y zanjas',
     'regular', 42000000, '2015-08-22', 'Depósito Municipal', true),

    (v_mid, v_dep_adm, 'inmueble', 'Cementerio Municipal',
     'Predio cementerio local',
     'bueno', 5000000, '1920-01-01', 'Calle 9 s/n', true),

    (v_mid, v_dep_adm, 'equipamiento', 'Generador Eléctrico 50KVA',
     'Grupo electrógeno de emergencia edificio municipal',
     'bueno', 3500000, '2021-12-15', 'Edificio Municipal', true);

  -- ═══════════════════════════════════════════════════════════
  -- FLOTA MUNICIPAL (tabla: vehiculos)
  -- ═══════════════════════════════════════════════════════════

  INSERT INTO vehiculos
    (municipio_id, dependencia_id, tipo, marca, modelo, anio,
     patente, estado, km_actuales, observaciones)
  VALUES
    (v_mid, v_dep_op, 'camion', 'Mercedes Benz', 'Atego 1718',
     2018, 'AB123CD', 'activo', 145000, 'Camión volcador para obras'),

    (v_mid, v_dep_adm, 'camioneta', 'Toyota', 'Hilux 4x4',
     2021, 'EF456GH', 'activo', 48000, 'Vehículo de uso general'),

    (v_mid, v_dep_adm, 'auto', 'Renault', 'Duster',
     2020, 'IJ789KL', 'activo', 62000, 'Vehículo del Jefe Comunal'),

    (v_mid, v_dep_op, 'tractor', 'New Holland', 'TL75',
     2016, 'MN012OP', 'mantenimiento', 289000, 'En service general'),

    (v_mid, v_dep_adm, 'moto', 'Honda', 'CG 150',
     2022, 'QR345ST', 'activo', 18000, 'Mensajería y trámites'),

    (v_mid, v_dep_op, 'camioneta', 'Ford', 'Ranger 4x4',
     2019, 'UV678WX', 'activo', 87000, 'Inspecciones de obras'),

    (v_mid, v_dep_adm, 'utilitario', 'Fiat', 'Fiorino',
     2017, 'YZ901AB', 'activo', 125000, 'Reparto y logística');

  RAISE NOTICE 'Demo data cargada: % bienes patrimonio, % vehículos',
    (SELECT COUNT(*) FROM bienes_patrimonio WHERE municipio_id = v_mid),
    (SELECT COUNT(*) FROM vehiculos WHERE municipio_id = v_mid);

END $$;
