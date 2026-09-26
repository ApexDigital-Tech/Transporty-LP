-- =====================================================================
-- FIX RLS: PERMISOS PARA PAGOS QR Y CONSULTA DE DESVÍOS
-- =====================================================================
-- Este script ajusta las políticas RLS para permitir que los pasajeros
-- puedan actualizar el estado de sus pagos QR ('completed') y que los
-- reportes puedan consultar las desviaciones registradas.

-- 1. Permitir actualización de pagos QR (Pasajeros y Choferes)
DROP POLICY IF EXISTS "Drivers and admins can update payments" ON public.qr_payments;
DROP POLICY IF EXISTS "Allow update on qr_payments" ON public.qr_payments;

CREATE POLICY "Allow update on qr_payments" ON public.qr_payments
    FOR UPDATE USING (true) WITH CHECK (true);

-- 2. Permitir lectura de desviaciones en reportes y dashboard
DROP POLICY IF EXISTS "Admins can view deviations" ON public.route_deviations_history;
DROP POLICY IF EXISTS "Allow select deviations" ON public.route_deviations_history;

CREATE POLICY "Allow select deviations" ON public.route_deviations_history
    FOR SELECT USING (true);
