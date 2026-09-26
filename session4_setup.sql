-- =====================================================================
-- SQL MIGRATION: SESSION 4 - DEVIATIONS HISTORY & QR PAYMENTS
-- =====================================================================
-- INSTRUCCIONES: Ejecuta este script en el Editor SQL de Supabase.

-- ---------------------------------------------------------------------
-- 1. HISTORIAL DE TRAMEAJE Y DESVÍOS (PostGIS)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.route_deviations_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    max_distance DOUBLE PRECISION DEFAULT 0.0,
    duration_seconds INT
);

-- Habilitar RLS en route_deviations_history
ALTER TABLE public.route_deviations_history ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas de desviaciones
DROP POLICY IF EXISTS "Admins can view deviations" ON public.route_deviations_history;
DROP POLICY IF EXISTS "Drivers can view own deviations" ON public.route_deviations_history;

-- Crear políticas
CREATE POLICY "Admins can view deviations" ON public.route_deviations_history
    FOR SELECT USING (
        public.is_superadmin() 
        OR organization_id = public.get_my_organization_id()
    );

CREATE POLICY "Drivers can view own deviations" ON public.route_deviations_history
    FOR SELECT USING (auth.uid() = driver_id);

-- ---------------------------------------------------------------------
-- 2. TRIGGER AUTOMÁTICO DE HISTORIAL DE TRAMEAJE
-- ---------------------------------------------------------------------
-- Este trigger en live_locations detecta transiciones de desvío y abre/cierra
-- registros de forma automática y consolidada en el servidor.

CREATE OR REPLACE FUNCTION public.handle_live_location_deviations()
RETURNS TRIGGER AS $$
DECLARE
  var_org_id UUID;
  var_existing_deviation_id UUID;
BEGIN
  -- Obtener la organización del chofer
  SELECT organization_id INTO var_org_id FROM public.drivers WHERE id = NEW.driver_id;

  -- Buscar si el chofer ya tiene un desvío activo (sin end_time)
  SELECT id INTO var_existing_deviation_id 
  FROM public.route_deviations_history 
  WHERE driver_id = NEW.driver_id AND end_time IS NULL 
  LIMIT 1;

  IF NEW.is_off_route THEN
    -- Si está fuera de ruta y NO tiene un desvío activo registrado, crear uno nuevo
    IF var_existing_deviation_id IS NULL THEN
      INSERT INTO public.route_deviations_history (driver_id, route_id, organization_id, start_time, max_distance)
      VALUES (NEW.driver_id, NEW.route_id, var_org_id, NOW(), NEW.distance_from_path);
    ELSE
      -- Si ya está fuera de ruta, actualizar la distancia máxima si es mayor
      UPDATE public.route_deviations_history
      SET max_distance = GREATEST(max_distance, NEW.distance_from_path)
      WHERE id = var_existing_deviation_id;
    END IF;
  ELSE
    -- Si NO está fuera de ruta pero tiene un desvío activo abierto, cerrarlo
    IF var_existing_deviation_id IS NOT NULL THEN
      UPDATE public.route_deviations_history
      SET 
        end_time = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_time))::INT
      WHERE id = var_existing_deviation_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger en live_locations (después de insertar o actualizar)
DROP TRIGGER IF EXISTS handle_live_location_deviations_trigger ON public.live_locations;
CREATE TRIGGER handle_live_location_deviations_trigger
AFTER INSERT OR UPDATE ON public.live_locations
FOR EACH ROW
EXECUTE FUNCTION public.handle_live_location_deviations();

-- ---------------------------------------------------------------------
-- 3. COBROS Y PASARELA DE PAGOS DIGITALES (QR)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.qr_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    passenger_phone TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Habilitar RLS en qr_payments
ALTER TABLE public.qr_payments ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas de qr_payments
DROP POLICY IF EXISTS "Public select payments" ON public.qr_payments;
DROP POLICY IF EXISTS "Anyone can insert payments" ON public.qr_payments;
DROP POLICY IF EXISTS "Drivers and admins can update payments" ON public.qr_payments;

-- Crear políticas
CREATE POLICY "Public select payments" ON public.qr_payments
    FOR SELECT USING (true); -- Permitir a cualquier pasajero/conductor verificar el estado de su pago

CREATE POLICY "Anyone can insert payments" ON public.qr_payments
    FOR INSERT WITH CHECK (true); -- Permitir que cualquier pasajero cree un registro de pago

CREATE POLICY "Drivers and admins can update payments" ON public.qr_payments
    FOR UPDATE USING (
        auth.uid() = driver_id 
        OR public.is_superadmin() 
        OR organization_id = public.get_my_organization_id()
    );

-- Trigger para automatizar organization_id en qr_payments
CREATE OR REPLACE FUNCTION public.set_qr_payment_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.drivers WHERE id = NEW.driver_id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_qr_payment_org_trigger ON public.qr_payments;
CREATE TRIGGER set_qr_payment_org_trigger
BEFORE INSERT OR UPDATE ON public.qr_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_qr_payment_org();
