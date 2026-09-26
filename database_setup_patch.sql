-- ==========================================
-- 3b. SEED DE DATOS: SINDICATOS Y RUTAS FALTANTES (PARCHE)
-- ==========================================

-- 1. Aseguramos que existan las nuevas organizaciones
WITH inserted_orgs AS (
  INSERT INTO public.organizations (name) VALUES
    ('COOPERATIVA DE TRANSPORTES KUPINI'),
    ('SINDICATO TRANS MIRAFLORES'),
    ('SINDICATO UNIÓN Y PROGRESO'),
    ('SINDICATO 27 DE ABRIL'),
    ('SINDICATO 1º DE MAYO'),
    ('SINDICATO LITORAL'),
    ('SINDICATO EL PROGRESO (TRUFI-1)'),
    ('SINDICATO PEDRO DOMINGO MURILLO'),
    ('SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('SINDICATO EDUARDO AVAROA'),
    ('ASOCIACIÓN DE TRANSPORTE LIBRE LA PAZ LOS PINOS'),
    ('ASOCIACIÓN 24 DE JUNIO')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, name
)
-- 2. Insertamos las rutas faltantes
INSERT INTO public.routes (line_code, name, start_point, end_point, vehicle_type, organization_id)
SELECT 
  d.line_code, 
  d.name, 
  'La Paz', 
  'Destino', 
  d.vtype,
  o.id
FROM (
  VALUES 
    ('395', 'Ruta 395', 'MINIBUS', 'COOPERATIVA DE TRANSPORTES KUPINI'),
    ('396', 'Ruta 396', 'MINIBUS', 'SINDICATO TRANS MIRAFLORES'),
    ('397', 'Ruta 397', 'MINIBUS', 'SINDICATO UNIÓN Y PROGRESO'),
    ('398', 'Ruta 398', 'MINIBUS', 'SINDICATO 27 DE ABRIL'),
    ('399', 'Ruta 399', 'MINIBUS', 'SINDICATO 1º DE MAYO'),
    ('400', 'Ruta 400', 'TRUFI', 'SINDICATO LITORAL'),
    ('401', 'Ruta 401', 'TRUFI', 'SINDICATO LITORAL'),
    ('402', 'Ruta 402', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('403', 'Ruta 403', 'TRUFI', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('404', 'Ruta 404', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('405', 'Ruta 405', 'TRUFI', 'SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('406', 'Ruta 406', 'TRUFI', 'SINDICATO EDUARDO AVAROA'),
    ('407', 'Ruta 407', 'TRUFI', 'SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('408', 'Ruta 408', 'TRUFI', 'ASOCIACIÓN DE TRANSPORTE LIBRE LA PAZ LOS PINOS'),
    ('409', 'Ruta 409', 'TRUFI', 'ASOCIACIÓN 24 DE JUNIO'),
    ('410', 'Ruta 410', 'TRUFI', 'ASOCIACIÓN 24 DE JUNIO'),
    ('411', 'Ruta 411', 'TRUFI', 'ASOCIACIÓN DE TRANSPORTE LIBRE LA PAZ LOS PINOS'),
    ('412', 'Ruta 412', 'TRUFI', 'ASOCIACIÓN DE TRANSPORTE LIBRE LA PAZ LOS PINOS'),
    ('413', 'Ruta 413', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('414', 'Ruta 414', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('415', 'Ruta 415', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('416', 'Ruta 416', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('417', 'Ruta 417', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('418', 'Ruta 418', 'TRUFI', 'SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('419', 'Ruta 419', 'TRUFI', 'SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('420', 'Ruta 420', 'TRUFI', 'SINDICATO SIMÓN BOLÍVAR TRUFI-5'),
    ('421', 'Ruta 421', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('422', 'Ruta 422', 'TRUFI', 'SINDICATO EL PROGRESO (TRUFI-1)'),
    ('423', 'Ruta 423', 'TRUFI', 'ASOCIACIÓN 24 DE JUNIO'),
    ('424', 'Ruta 424', 'TRUFI', 'SINDICATO EDUARDO AVAROA'),
    ('425', 'Ruta 425', 'TRUFI', 'SINDICATO LITORAL'),
    ('426', 'Ruta 426', 'TRUFI', 'SINDICATO LITORAL')
) AS d(line_code, name, vtype, org_name)
JOIN inserted_orgs o ON o.name = d.org_name;
