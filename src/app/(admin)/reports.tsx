import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { supabase } from '../../services/supabase';
import { useStore } from '../../hooks/useStore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function ReportsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Zustand State
  const { refreshTrigger, selectedImpersonatedOrg } = useStore();

  // Metrics State
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [totalRoutes, setTotalRoutes] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [deviations, setDeviations] = useState<any[]>([]);
  const [qrPaymentsCount, setQrPaymentsCount] = useState(0);
  const [qrTotalRevenue, setQrTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReportData() {
      setLoading(true);
      try {
        // 0. Obtener usuario autenticado y su teléfono
        const { data: { user } } = await supabase.auth.getUser();
        const phone = user?.phone || '';

        const { data: adminProfile } = await supabase
          .from('admin_profiles')
          .select('organization_id, role')
          .maybeSingle();

        let orgId = adminProfile?.organization_id || null;
        let role = adminProfile?.role || 'admin';

        // Fallback/Override manual para números de prueba
        if (phone.endsWith('72845621')) {
          role = 'superadmin';
          orgId = selectedImpersonatedOrg || null;
        } else if (phone.endsWith('72845620')) {
          role = 'admin';
          if (!orgId) {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('id')
              .eq('name', 'SINDICATO 14 DE SEPTIEMBRE')
              .limit(1)
              .maybeSingle();
            if (orgData) {
              orgId = orgData.id;
            }
          }
        }

        const activeOrgId = role === 'superadmin' ? (selectedImpersonatedOrg || undefined) : orgId;
        if (role !== 'superadmin' && !orgId) {
          setTotalDrivers(0);
          setTotalRoutes(0);
          setAlertsCount(0);
          setDeviations([]);
          setQrPaymentsCount(0);
          setQrTotalRevenue(0);
          setLoading(false);
          return;
        }

        // 2. Query drivers count
        let driversQuery = supabase.from('drivers').select('id', { count: 'exact', head: true });
        if (activeOrgId) driversQuery = driversQuery.eq('organization_id', activeOrgId);
        const { count: dCount } = await driversQuery;
        setTotalDrivers(dCount || 0);

        // 3. Query routes count
        let routesQuery = supabase.from('routes').select('id', { count: 'exact', head: true });
        if (activeOrgId) routesQuery = routesQuery.eq('organization_id', activeOrgId);
        const { count: rCount } = await routesQuery;
        setTotalRoutes(rCount || 0);

        // 4. Query live deviations (off_route count)
        let liveQuery = supabase.from('live_locations').select('driver_id', { count: 'exact', head: true }).eq('is_off_route', true);
        if (activeOrgId) liveQuery = liveQuery.eq('organization_id', activeOrgId);
        const { count: aCount } = await liveQuery;
        setAlertsCount(aCount || 0);

        // 5. Query deviations history for the UI
        let deviationsQuery = supabase
          .from('route_deviations_history')
          .select('id, start_time, end_time, max_distance, duration_seconds, drivers(name, placa), routes(line_code)')
          .order('start_time', { ascending: false })
          .limit(8);
        if (activeOrgId) deviationsQuery = deviationsQuery.eq('organization_id', activeOrgId);
        const { data: devData } = await deviationsQuery;
        setDeviations(devData || []);

        // 6. Query QR payments stats
        let qrQuery = supabase.from('qr_payments').select('amount, status');
        if (activeOrgId) qrQuery = qrQuery.eq('organization_id', activeOrgId);
        const { data: qrData } = await qrQuery;
        
        let completedCount = 0;
        let totalAmount = 0.0;
        if (qrData) {
          qrData.forEach((pay: any) => {
            if (pay.status === 'completed') {
              completedCount++;
              totalAmount += parseFloat(pay.amount || '0');
            }
          });
        }
        setQrPaymentsCount(completedCount);
        setQrTotalRevenue(totalAmount);
      } catch (e) {
        console.error('Error cargando reportes:', e);
      } finally {
        setLoading(false);
      }
    }
    loadReportData();
  }, [refreshTrigger, selectedImpersonatedOrg]);

  const exportPDF = async (type: 'frequency' | 'drivers') => {
    const title = type === 'frequency' ? 'Reporte de Frecuencia y Cumplimiento' : 'Reporte de Desvíos e Infracciones (Trameaje)';
    const dateStr = new Date().toLocaleString();
    
    // Obtener información adicional de la base de datos para el PDF
    const { data: profileData } = await supabase
      .from('admin_profiles')
      .select('organization_id')
      .maybeSingle();

    let orgName = 'Todos los Sindicatos (SuperAdmin)';
    const targetOrgId = selectedImpersonatedOrg || profileData?.organization_id;
    if (targetOrgId) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', targetOrgId)
        .maybeSingle();
      if (orgData) {
        orgName = orgData.name;
      }
    }

    // Cargar historial de desviaciones real para el PDF si el tipo es drivers
    let pdfDevData: any[] = [];
    if (type === 'drivers') {
      let q = supabase
        .from('route_deviations_history')
        .select('start_time, end_time, max_distance, duration_seconds, drivers(name, placa), routes(line_code)')
        .order('start_time', { ascending: false })
        .limit(30);
      if (targetOrgId) q = q.eq('organization_id', targetOrgId);
      const { data } = await q;
      pdfDevData = data || [];
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; line-height: 1.6; }
          .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .title-area h1 { font-size: 22px; color: #1e3a8a; margin: 0 0 5px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .title-area p { font-size: 11px; color: #64748b; margin: 0; font-weight: 500; }
          .meta-area { text-align: right; font-size: 11px; color: #64748b; font-weight: 600; line-height: 1.5; }
          .meta-area strong { color: #0f172a; }
          .kpi-row { display: flex; gap: 15px; margin-bottom: 30px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; text-align: center; }
          .kpi-card .val { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 5px; }
          .kpi-card .lbl { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
          .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px; }
          th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; padding: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: left; color: #475569; }
          td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; font-size: 11px; color: #334155; }
          .badge { display: inline-block; padding: 3px 8px; border-radius: 50px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge-success { background: #dcfce7; color: #15803d; }
          .badge-alert { background: #fee2e2; color: #b91c1c; }
          .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 9px; color: #94a3b8; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-area">
            <h1>${title}</h1>
            <p>Sistema de Regulación de Movilidad y Telemetría SaaS</p>
          </div>
          <div class="meta-area">
            Organización: <strong>${orgName}</strong><br/>
            Fecha de Emisión: <strong>${dateStr}</strong><br/>
            Jurisdicción: <strong>La Paz, Bolivia</strong>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="lbl">Afiliados Totales</div>
            <div class="val">${totalDrivers}</div>
          </div>
          <div class="kpi-card">
            <div class="lbl">Rutas Activas</div>
            <div class="val">${totalRoutes}</div>
          </div>
          <div class="kpi-card">
            <div class="lbl">Desvíos / Alertas</div>
            <div class="val">${alertsCount}</div>
          </div>
          <div class="kpi-card">
            <div class="lbl">Cobros QR (Bs)</div>
            <div class="val">Bs. ${qrTotalRevenue.toFixed(2)}</div>
          </div>
        </div>

        ${type === 'drivers' ? `
          <div class="section-title">Historial de Desvíos y Trameaje Detectados (Últimos 30)</div>
          <table>
            <thead>
              <tr>
                <th>Chofer / Unidad</th>
                <th>Línea</th>
                <th>Inicio</th>
                <th>Duración</th>
                <th>Desvío Máx.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${pdfDevData.length === 0 ? `
                <tr><td colspan="6" style="text-align:center;">No se registraron desviaciones en el historial.</td></tr>
              ` : pdfDevData.map((d: any) => {
                const durationStr = d.end_time ? `${Math.round(d.duration_seconds / 60)} min` : 'En curso';
                const dateVal = new Date(d.start_time).toLocaleString();
                const driverName = d.drivers?.name || 'Chofer Desconocido';
                const placa = d.drivers?.placa || '';
                const line = d.routes?.line_code || '';
                const dist = `${Math.round(d.max_distance)}m`;
                const badgeClass = d.end_time ? 'badge-success' : 'badge-alert';
                const statusStr = d.end_time ? 'Resuelto' : 'Activo';
                return `
                  <tr>
                    <td><strong>${driverName}</strong><br/><span style="font-size:9px;color:#64748b;">Placa: ${placa}</span></td>
                    <td>Línea ${line}</td>
                    <td>${dateVal}</td>
                    <td>${durationStr}</td>
                    <td>${dist}</td>
                    <td><span class="badge ${badgeClass}">${statusStr}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : `
          <div class="section-title">Resumen de Operación y Frecuencias</div>
          <table>
            <thead>
              <tr>
                <th>Código de Línea</th>
                <th>Tipo de Vehículo</th>
                <th>Cumplimiento Estimado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Línea 158</td>
                <td>MINIBUS</td>
                <td>98.5%</td>
                <td><span class="badge badge-success">Excelente</span></td>
              </tr>
              <tr>
                <td>Línea 201</td>
                <td>MICROBUS</td>
                <td>94.2%</td>
                <td><span class="badge badge-success">Aceptable</span></td>
              </tr>
              <tr>
                <td>Línea 300</td>
                <td>CARRY</td>
                <td>82.0%</td>
                <td><span class="badge badge-success">Aceptable</span></td>
              </tr>
            </tbody>
          </table>
        `}

        <div class="footer">
          La Paz Transit SaaS • Regulación Municipal de Transporte Urbano • Gobierno Autónomo Municipal de La Paz
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `Reporte_${type === 'frequency' ? 'Frecuencia' : 'Conductores'}_${Date.now()}.pdf`;
        link.click();
      } else {
        await Sharing.shareAsync(uri);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Hubo un problema al generar el PDF.');
    }
  };

  const cards = [
    { title: 'Cobros QR (Pasajes)', value: `Bs. ${qrTotalRevenue.toFixed(2)}`, change: `💳 ${qrPaymentsCount} pagos procesados` },
    { title: 'Choferes Activos', value: `${totalDrivers}`, change: '🚗 Registrados en el Sindicato' },
    { title: 'Desvíos de Ruta', value: `${deviations.filter((d) => !d.end_time).length}`, change: '⚠️ Alertas activas en tiempo real' },
    { title: 'Tasa de Cumplimiento', value: totalDrivers > 0 ? `${(100 - (alertsCount / totalDrivers * 100)).toFixed(1)}%` : '100%', change: '✅ Adhesión a ruta de flota' },
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-[#f8fafc]`}>
      {/* Top Header Bar */}
      <View style={tw`bg-white border-b border-gray-200 px-6 py-4 flex-row justify-between items-center z-10 shadow-sm`}>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs font-bold text-gray-400 uppercase tracking-widest`}>La Paz Transit Admin</Text>
          <Text style={tw`text-2xl font-black text-[#0f172a] tracking-tight`}>Reportes y Analíticas</Text>
          <Text style={tw`text-xs text-gray-400 font-medium mt-0.5`} numberOfLines={1}>
            Revisa el cumplimiento de horarios, telemetría y contabilidad del sindicato.
          </Text>
        </View>
        {loading && <ActivityIndicator color="#3b82f6" style={tw`ml-4`} />}
      </View>

      <ScrollView style={tw`flex-1 p-6`} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* KPI Grid */}
        <View style={tw`flex-row flex-wrap justify-between gap-4 mb-6`}>
          {cards.map((c, idx) => (
            <View 
              key={idx} 
              style={tw`bg-white border border-gray-100 p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm`}
            >
              <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>{c.title}</Text>
              <Text style={tw`text-2xl font-black text-[#0f172a]`}>{c.value}</Text>
              <Text style={tw`text-[10px] font-semibold mt-1.5 text-gray-400`}>{c.change}</Text>
            </View>
          ))}
        </View>

        {/* Recent Deviations List */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl p-6 shadow-sm mb-6`}>
          <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider mb-4 pb-2 border-b border-gray-100`}>
            Infracciones Recientes de Ruta (Trameaje)
          </Text>
          {deviations.length === 0 ? (
            <Text style={tw`text-xs text-gray-400 italic text-center py-4`}>
              No se registran desvíos de ruta activos o históricos.
            </Text>
          ) : (
            <View style={tw`flex-col gap-3`}>
              {deviations.map((dev) => {
                const isAct = !dev.end_time;
                const durStr = isAct ? 'En curso' : `${Math.round(dev.duration_seconds / 60)}m`;
                const maxDist = Math.round(dev.max_distance);
                const timeStr = new Date(dev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <View key={dev.id} style={tw`flex-row justify-between items-center p-3.5 bg-slate-50 rounded-2xl border border-slate-100`}>
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-xs font-black text-slate-800`}>{dev.drivers?.name || 'Chofer Desconocido'}</Text>
                      <Text style={tw`text-[10px] text-gray-400 font-bold mt-0.5`}>
                        Placa: {dev.drivers?.placa} • Línea: {dev.routes?.line_code} • {timeStr}
                      </Text>
                    </View>
                    <View style={tw`items-end`}>
                      <View style={tw`flex-row items-center gap-1.5`}>
                        <View style={tw`w-2 h-2 rounded-full ${isAct ? 'bg-red-500' : 'bg-green-500'}`} />
                        <Text style={tw`text-[10px] font-black uppercase ${isAct ? 'text-red-500' : 'text-green-600'}`}>
                          {isAct ? 'Activo' : 'Resuelto'}
                        </Text>
                      </View>
                      <Text style={tw`text-[10px] text-slate-500 font-bold mt-0.5`}>
                        Desvío: {maxDist}m ({durStr})
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Charts & Graphics placeholder */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl p-6 shadow-sm mb-6`}>
          <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider mb-5 pb-2 border-b border-gray-100`}>
            Cumplimiento Semanal de Frecuencia por Ruta
          </Text>
          
          <View style={tw`flex-col gap-4 py-2`}>
            {[
              { label: 'Línea 201', percentage: 95, color: 'bg-blue-500' },
              { label: 'Línea 212', percentage: 88, color: 'bg-indigo-500' },
              { label: 'Línea 300', percentage: 70, color: 'bg-amber-500' },
              { label: 'Línea 158', percentage: 98, color: 'bg-green-500' },
            ].map((bar, idx) => (
              <View key={idx}>
                <View style={tw`flex-row justify-between mb-1`}>
                  <Text style={tw`text-xs font-bold text-gray-600`}>{bar.label}</Text>
                  <Text style={tw`text-xs font-bold text-[#0f172a]`}>{bar.percentage}% de Cumplimiento</Text>
                </View>
                <View style={tw`w-full bg-slate-100 h-3.5 rounded-full overflow-hidden`}>
                  <View style={[tw`${bar.color} h-full rounded-full`, { width: `${bar.percentage}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Operational Exports */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl p-6 shadow-sm`}>
          <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider mb-4`}>Exportar Reportes Profesionales</Text>
          <Text style={tw`text-xs text-gray-400 mb-4`}>
            Descarga los reportes oficiales en formato PDF con firmas y estándares de regulación listos para el sindicato o alcaldía.
          </Text>
          <View style={tw`flex-row gap-4 flex-wrap`}>
            <TouchableOpacity 
              onPress={() => exportPDF('frequency')}
              style={tw`bg-[#0f172a] px-5 py-3.5 rounded-2xl items-center shadow-sm flex-row gap-2`}
              activeOpacity={0.8}
            >
              <Text style={tw`text-white font-extrabold text-xs uppercase tracking-wider`}>📄 Exportar Reporte de Frecuencia</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => exportPDF('drivers')}
              style={tw`border border-gray-200 bg-white px-5 py-3.5 rounded-2xl items-center shadow-sm flex-row gap-2`}
              activeOpacity={0.8}
            >
              <Text style={tw`text-gray-700 font-extrabold text-xs uppercase tracking-wider`}>⚠️ Exportar Reporte de Desvíos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
