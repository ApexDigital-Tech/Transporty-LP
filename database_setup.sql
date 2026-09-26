-- ==========================================
-- SCRIPT DE MIGRACIÓN: ARQUITECTURA SAAS MULTI-TENANT
-- 1. LIMPIEZA DE DATOS Y NUEVO ESQUEMA
-- ==========================================

-- A. Limpiar las tablas existentes para evitar conflictos
DELETE FROM public.live_locations;
DELETE FROM public.routes;
DELETE FROM public.drivers;

-- B. Crear la tabla de Sindicatos / Organizations (Tenant)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- C. Modificar la tabla Drivers para añadir organization_id y foto
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- D. Modificar la tabla Routes para añadir organization_id y vehicle_type
ALTER TABLE public.routes 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'MINIBUS';

-- E. Modificar la tabla Live_Locations (Opcional, para queries ultrarápidos por sindicato)
ALTER TABLE public.live_locations
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ==========================================
-- 2. CONFIGURACIÓN DE SUPABASE STORAGE
-- ==========================================
-- (Requiere que ejecutes esto o lo habilites visualmente en el panel)
-- Creamos el bucket para las fotos de perfil si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver_profiles', 'driver_profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir acceso de lectura público
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'driver_profiles');
-- Política para permitir subida a usuarios (en MVP lo dejamos abierto, idealmente se restringe)
CREATE POLICY "Allow Uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'driver_profiles');


-- ==========================================
-- 3. SEED DE DATOS: LOS 34 SINDICATOS Y SUS 288 RUTAS (Basado en el Documento)
-- ==========================================

-- Insertar Sindicatos Principales y obtener sus IDs usando WITH
WITH inserted_orgs AS (
  INSERT INTO public.organizations (name) VALUES
    ('SINDICATO EDUARDO AVAROA'),
    ('SINDICATO VILLA VICTORIA'),
    ('SINDICATO SIMÓN BOLÍVAR'),
    ('SINDICATO PEDRO DOMINGO MURILLO'),
    ('SINDICATO SAN CRISTÓBAL'),
    ('SINDICATO LITORAL'),
    ('COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('SINDICATO 8 DE DICIEMBRE'),
    ('SINDICATO 14 DE SEPTIEMBRE'),
    ('SINDICATO SAGRADO CORAZÓN DE JESÚS'),
    ('SINDICATO 21 DE SEPTIEMBRE'),
    ('ASOCIACIÓN MINISUR'),
    ('SINDICATO ARCO IRIS'),
    ('ASOCIACIÓN DE TRANSPORTES LA PAZ'),
    ('SINDICATO COTRANSTUR'),
    ('SINDICATO 1º DE MAYO'),
    ('SINDICATO 18 DE DICIEMBRE'),
    ('SINDICATO UNIÓN Y PROGRESO'),
    ('SINDICATO CIUDAD SATÉLITE'),
    ('SINDICATO VIRGEN DE COPACABANA'),
    ('COOPERATIVA DE TRANSPORTES KUPINI'),
    ('ASOCIACIÓN SEÑOR DE MAYO'),
    ('SINDICATO SAN JUAN'),
    ('SINDICATO VIRGEN DE FÁTIMA'),
    ('SINDICATO 27 DE ABRIL'),
    ('SINDICATO 16 DE JULIO'),
    ('SINDICATO RÍO ABAJO - PALCA'),
    ('SINDICATO TRANS COPACABANA'),
    ('SINDICATO 23 DE MARZO'),
    ('SINDICATO SEÑOR DE LAGUNAS'),
    ('SINDICATO PORVENIR'),
    ('SINDICATO SEÑOR DE EXALTACIÓN'),
    ('SINDICATO VIACHA'),
    ('SINDICATO TRANS MIRAFLORES')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, name
)
-- Ahora insertamos un set representativo de rutas vinculadas a los sindicatos usando el CTE anterior.
-- Nota: La consulta inserta la línea, y vincula dinámicamente con el Sindicato.
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
    -- Eduardo Avaroa
    ('CH', 'Ruta CH', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('J', 'Ruta J', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('M', 'Ruta M', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('2', 'Ruta 2', 'BUS', 'SINDICATO EDUARDO AVAROA'),
    ('9', 'Ruta 9', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('15', 'Ruta 15', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('27', 'Ruta 27', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('29', 'Ruta 29', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('30', 'Ruta 30', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('31', 'Ruta 31', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('132', 'Ruta 132', 'MICROBUS', 'SINDICATO EDUARDO AVAROA'),
    ('144', 'Ruta 144', 'BUS', 'SINDICATO EDUARDO AVAROA'),
    ('157', 'Ruta 157', 'MICRO', 'SINDICATO EDUARDO AVAROA'),
    ('158', 'Ruta 158', 'BUS', 'SINDICATO EDUARDO AVAROA'),
    ('205', 'Ruta 205', 'MINIBUS', 'SINDICATO EDUARDO AVAROA'),
    ('274', 'Ruta 274', 'MINIBUS', 'SINDICATO EDUARDO AVAROA'),
    ('280', 'Ruta 280', 'MINIBUS', 'SINDICATO EDUARDO AVAROA'),

    -- Villa Victoria
    ('O', 'Ruta O', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('P', 'Ruta P', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('X', 'Ruta X', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('7', 'Ruta 7', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('10', 'Ruta 10', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('14', 'Ruta 14', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('34', 'Ruta 34', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('131', 'Ruta 131', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('135', 'Ruta 135', 'MICROBUS', 'SINDICATO VILLA VICTORIA'),
    ('160', 'Ruta 160', 'MICRO', 'SINDICATO VILLA VICTORIA'),
    ('221', 'Ruta 221', 'CARRY', 'SINDICATO VILLA VICTORIA'),
    ('247', 'Ruta 247', 'MINIBUS', 'SINDICATO VILLA VICTORIA'),
    ('269', 'Ruta 269', 'MINIBUS', 'SINDICATO VILLA VICTORIA'),

    -- Simón Bolívar
    ('Q', 'Ruta Q', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('T', 'Ruta T', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('V', 'Ruta V', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('12', 'Ruta 12', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('18', 'Ruta 18', 'BUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('23', 'Ruta 23', 'BUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('40', 'Ruta 40', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('41', 'Ruta 41', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('54', 'Ruta 54', 'BUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('133', 'Ruta 133', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('149', 'Ruta 149', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('150', 'Ruta 150', 'MICROBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('267', 'Ruta 267', 'MINIBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('296', 'Ruta 296', 'MINIBUS', 'SINDICATO SIMÓN BOLÍVAR'),
    ('304', 'Ruta 304', 'MINIBUS', 'SINDICATO SIMÓN BOLÍVAR'),

    -- San Cristóbal
    ('Y', 'Ruta Y', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('3', 'Ruta 3', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('5', 'Ruta 5', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('13', 'Ruta 13', 'BUS', 'SINDICATO SAN CRISTÓBAL'),
    ('16', 'Ruta 16', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('52', 'Ruta 52', 'BUS', 'SINDICATO SAN CRISTÓBAL'),
    ('53', 'Ruta 53', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('138', 'Ruta 138', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('141', 'Ruta 141', 'MICROBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('210', 'Ruta 210', 'MINIBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('211', 'Ruta 211', 'MINIBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('279', 'Ruta 279', 'MINIBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('289', 'Ruta 289', 'MINIBUS', 'SINDICATO SAN CRISTÓBAL'),
    ('299', 'Ruta 299', 'MINIBUS', 'SINDICATO SAN CRISTÓBAL'),

    -- Litoral
    ('1', 'Ruta 1', 'MICROBUS', 'SINDICATO LITORAL'),
    ('42', 'Ruta 42', 'BUS', 'SINDICATO LITORAL'),
    ('43', 'Ruta 43', 'MICROBUS', 'SINDICATO LITORAL'),
    ('44', 'Ruta 44', 'BUS', 'SINDICATO LITORAL'),
    ('51', 'Ruta 51', 'MICROBUS', 'SINDICATO LITORAL'),
    ('130', 'Ruta 130', 'MICROBUS', 'SINDICATO LITORAL'),
    ('155', 'Ruta 155', 'MICROBUS', 'SINDICATO LITORAL'),
    ('156', 'Ruta 156', 'MICRO', 'SINDICATO LITORAL'),
    ('231', 'Ruta 231', 'MINIBUS', 'SINDICATO LITORAL'),
    ('238', 'Ruta 238', 'MINIBUS', 'SINDICATO LITORAL'),
    ('246', 'Ruta 246', 'MINIBUS', 'SINDICATO LITORAL'),
    ('248', 'Ruta 248', 'MINIBUS', 'SINDICATO LITORAL'),
    ('258', 'Ruta 258', 'MINIBUS', 'SINDICATO LITORAL'),
    ('263', 'Ruta 263', 'MINIBUS', 'SINDICATO LITORAL'),
    ('273', 'Ruta 273', 'MINIBUS', 'SINDICATO LITORAL'),
    ('292', 'Ruta 292', 'MINIBUS', 'SINDICATO LITORAL'),
    ('340', 'Ruta 340', 'MINIBUS', 'SINDICATO LITORAL'),
    ('344', 'Ruta 344', 'CARRY', 'SINDICATO LITORAL'),
    ('345', 'Ruta 345', 'CARRY', 'SINDICATO LITORAL'),
    ('346', 'Ruta 346', 'CARRY', 'SINDICATO LITORAL'),

    -- Pedro Domingo Murillo
    ('W', 'Ruta W', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('Z', 'Ruta Z', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('36', 'Ruta 36', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('37', 'Ruta 37', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('38', 'Ruta 38', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('63', 'Ruta 63', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('134', 'Ruta 134', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('137', 'Ruta 137', 'MICROBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('159', 'Ruta 159', 'MICRO', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('204', 'Ruta 204', 'MINIBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('215', 'Ruta 215', 'MINIBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),
    ('250', 'Ruta 250', 'MINIBUS', 'SINDICATO PEDRO DOMINGO MURILLO'),

    -- Cooperativa Viacha
    ('90', 'Ruta 90', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('91', 'Ruta 91', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('92', 'Ruta 92', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('93', 'Ruta 93', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('95', 'Ruta 95', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('96', 'Ruta 96', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    ('99', 'Ruta 99', 'BUS', 'COOPERATIVA DE TRANSPORTES MARISCAL JOSÉ BALLIVIÁN, VIACHA LTDA'),
    
    -- Asociación Minisur
    ('207', 'Ruta 207', 'MINIBUS', 'ASOCIACIÓN MINISUR'),
    ('213', 'Ruta 213', 'MINIBUS', 'ASOCIACIÓN MINISUR'),
    ('260', 'Ruta 260', 'MINIBUS', 'ASOCIACIÓN MINISUR'),
    ('275', 'Ruta 275', 'MINIBUS', 'ASOCIACIÓN MINISUR'),
    ('288', 'Ruta 288', 'MINIBUS', 'ASOCIACIÓN MINISUR'),
    ('308', 'Ruta 308', 'MINIBUS', 'ASOCIACIÓN MINISUR'),

    -- Trans Miraflores
    ('300', 'Ruta 300', 'CARRY', 'SINDICATO TRANS MIRAFLORES'),
    ('331', 'Ruta 331', 'CARRY', 'SINDICATO TRANS MIRAFLORES'),
    ('332', 'Ruta 332', 'MINIBUS', 'SINDICATO TRANS MIRAFLORES'),
    ('333', 'Ruta 333', 'MINIBUS', 'SINDICATO TRANS MIRAFLORES'),
    ('342', 'Ruta 342', 'MINIBUS', 'SINDICATO TRANS MIRAFLORES'),

    -- Virgen de Fátima
    ('241', 'Ruta 241', 'MINIBUS', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('322', 'Ruta 322', 'CARRY', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('323', 'Ruta 323', 'MINIBUS', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('326', 'Ruta 326', 'MINIBUS', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('328', 'Ruta 328', 'CARRY', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('335', 'Ruta 335', 'CARRY', 'SINDICATO VIRGEN DE FÁTIMA'),
    ('341', 'Ruta 341', 'MINIBUS', 'SINDICATO VIRGEN DE FÁTIMA')

) AS d(line_code, name, vtype, org_name)
JOIN inserted_orgs o ON o.name = d.org_name;

