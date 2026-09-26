const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cargar variables de entorno manualmente sin dependencias externas
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=');
        if (key && vals.length > 0) {
          process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
  }
} catch (e) {
  // Continuar con valores por defecto
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wwnxwdliysojiqtefuoy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3bnh3ZGxpeXNvamlxdGVmdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Njc5NTYsImV4cCI6MjA5NTA0Mzk1Nn0.qX81MiWsByNhaer_UEEmGoFAEfmYqyJk9gj6slq_c98';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runValidationSuite() {
  console.log('====================================================');
  console.log('  LA PAZ TRANSIT SAAS - FASE 1: VALIDACIÓN BACKEND  ');
  console.log('====================================================\n');
  console.log(`[Config] Supabase URL: ${supabaseUrl}`);
  console.log(`[Config] Timestamp: ${new Date().toISOString()}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, testName, detail = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
      return true;
    } else {
      failedTests++;
      console.error(`❌ [FAIL] ${testName} ${detail ? `- Error: ${detail}` : ''}`);
      return false;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Conectividad y Tablas Base
    // -------------------------------------------------------------
    console.log('\n--- 1. Conectividad e Integridad de Esquema ---');
    
    const { data: orgs, error: orgsErr } = await supabase.from('organizations').select('id, name').limit(5);
    assert(!orgsErr, 'Lectura de tabla `organizations`', orgsErr ? orgsErr.message : `Encontradas: ${orgs?.length || 0}`);

    const { data: routes, error: routesErr } = await supabase.from('routes').select('id, line_code, name').limit(5);
    assert(!routesErr, 'Lectura de tabla `routes`', routesErr ? routesErr.message : `Encontradas: ${routes?.length || 0}`);

    const { data: drivers, error: driversErr } = await supabase.from('drivers').select('id, name, organization_id, placa').limit(5);
    assert(!driversErr, 'Lectura de tabla `drivers`', driversErr ? driversErr.message : `Encontrados: ${drivers?.length || 0}`);

    const targetDriver = (drivers && drivers.length > 0) ? drivers[0] : null;
    const targetRoute = (routes && routes.length > 0) ? routes[0] : null;

    // -------------------------------------------------------------
    // TEST 2: Pasarela Transaccional Pagos QR (qr_payments)
    // -------------------------------------------------------------
    console.log('\n--- 2. Pasarela Transaccional de Pagos QR ---');
    
    if (targetDriver) {
      const testPhone = '+59170012345';
      const testAmount = 2.50;

      // 2.1 Crear orden pendiente
      const { data: paymentInsert, error: payInsertErr } = await supabase
        .from('qr_payments')
        .insert({
          driver_id: targetDriver.id,
          passenger_phone: testPhone,
          amount: testAmount,
          status: 'pending'
        })
        .select()
        .single();

      const created = assert(!payInsertErr && paymentInsert?.id, 'Creación de Cobro QR (status: pending)', payInsertErr?.message || `ID: ${paymentInsert?.id}`);

      if (created && paymentInsert) {
        // 2.2 Validar trigger de auto-asignación de organization_id
        if (targetDriver.organization_id) {
          assert(
            paymentInsert.organization_id === targetDriver.organization_id,
            'Trigger `set_qr_payment_org` auto-asigna organization_id',
            `Org: ${paymentInsert.organization_id}`
          );
        } else {
          console.log('ℹ️ Chofer de prueba sin organización asignada; salto de validación de auto-org.');
        }

        // 2.3 Simulación de Pago por Pasajero (update a completed)
        const { error: payUpdateErr } = await supabase
          .from('qr_payments')
          .update({ status: 'completed' })
          .eq('id', paymentInsert.id);

        assert(!payUpdateErr, 'Actualización de estado a `completed` (Pago Pasajero)', payUpdateErr?.message);

        // 2.4 Verificación de persistencia y consistencia
        const { data: payVerify, error: payVerifyErr } = await supabase
          .from('qr_payments')
          .select('*')
          .eq('id', paymentInsert.id)
          .single();

        assert(
          !payVerifyErr && payVerify?.status === 'completed',
          'Consistencia y Persistencia de Transacción QR',
          `Estado actual: ${payVerify?.status}`
        );

        // 2.5 Limpieza de transacción de prueba
        const { error: payDeleteErr } = await supabase
          .from('qr_payments')
          .delete()
          .eq('id', paymentInsert.id);
          
        assert(!payDeleteErr, 'Limpieza segura de orden QR de prueba');
      }
    } else {
      console.warn('⚠️ No se encontró chofer para prueba QR. Registra al menos un chofer en DB.');
    }

    // -------------------------------------------------------------
    // TEST 3: Telemetría y Detección de Desvíos (Trameaje)
    // -------------------------------------------------------------
    console.log('\n--- 3. Telemetría y Registro de Trameaje PostGIS ---');

    const { data: devHistory, error: devHistErr } = await supabase
      .from('route_deviations_history')
      .select('id, driver_id, max_distance, start_time')
      .limit(5);

    assert(!devHistErr, 'Lectura de tabla `route_deviations_history`', devHistErr ? devHistErr.message : `Historial previo: ${devHistory?.length || 0} registros`);

    if (targetDriver && targetRoute) {
      const testLat = -16.5000;
      const testLng = -68.1500;
      const testDeviationDistance = 245.50; // >100m => trameaje

      // 3.1 Inserción de telemetría con desvío
      const { error: locUpsertErr } = await supabase
        .from('live_locations')
        .upsert({
          driver_id: targetDriver.id,
          route_id: targetRoute.id,
          latitude: testLat,
          longitude: testLng,
          last_updated: new Date().toISOString(),
          is_off_route: true,
          distance_from_path: testDeviationDistance
        }, { onConflict: 'driver_id' });

      assert(!locUpsertErr, 'Emisión de Telemetría GPS con Desvío (is_off_route = true)', locUpsertErr?.message);

      // 3.2 Verificar registro de desvío
      const { data: recentDev, error: recentDevErr } = await supabase
        .from('route_deviations_history')
        .select('*')
        .eq('driver_id', targetDriver.id)
        .order('start_time', { ascending: false })
        .limit(1);

      assert(
        !recentDevErr && recentDev && recentDev.length > 0,
        'Detección y persistencia de Trameaje en `route_deviations_history`',
        recentDev && recentDev[0] ? `Distancia registrada: ${recentDev[0].max_distance}m` : 'Sin registros'
      );

      // 3.3 Normalización de telemetría (volver a ruta normal)
      const { error: restoreErr } = await supabase
        .from('live_locations')
        .upsert({
          driver_id: targetDriver.id,
          route_id: targetRoute.id,
          latitude: testLat,
          longitude: testLng,
          last_updated: new Date().toISOString(),
          is_off_route: false,
          distance_from_path: 12.0
        }, { onConflict: 'driver_id' });

      assert(!restoreErr, 'Restablecimiento de Chofer a Ruta Normal (is_off_route = false)');
    }

    // -------------------------------------------------------------
    // TEST 4: Políticas RLS y Storage Buckets
    // -------------------------------------------------------------
    console.log('\n--- 4. Almacenamiento y Buckets ---');
    const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
    assert(!bucketsErr, 'Acceso a Supabase Storage Buckets', bucketsErr ? bucketsErr.message : `Buckets: ${buckets?.map(b => b.name).join(', ')}`);

  } catch (err) {
    console.error('Error fatal durante la suite de pruebas:', err);
    failedTests++;
  }

  console.log('\n====================================================');
  console.log(`  RESUMEN: Total: ${totalTests} | Exitosos: ${passedTests} | Fallidos: ${failedTests}`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runValidationSuite();
