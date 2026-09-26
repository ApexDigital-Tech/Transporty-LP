# LAUNCH OVERVIEW: La Paz Transit SaaS (PMV)

**Versión:** 1.0.0 (Release Candidate / PMV)  
**Fecha:** Mayo 2026  
**Responsable:** Director de Proyecto & Orquestador General  

---

## 1. Resumen Ejecutivo
**La Paz Transit SaaS** es una plataforma digital integral de telemetría en tiempo real, gestión de flotas multi-tenant y pasarela de cobro diseñada específicamente para la topografía y dinámicas sindicales del transporte público en La Paz, Bolivia.

```
                  ┌──────────────────────────────────────────────┐
                  │          La Paz Transit SaaS Core            │
                  └──────────────────────┬───────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────┐              ┌───────────────────┐             ┌───────────────────┐
│ Sindicatos    │              │ Choferes          │             │ Pasajeros         │
│ (Admin CRM)   │              │ (Driver Portal)   │             │ (Passenger App)   │
├───────────────┤              ├───────────────────┤             ├───────────────────┤
│ • Telemetría  │              │ • GPS Continuo    │             │ • ETA en vivo     │
│ • Desvíos     │              │ • Wake Lock       │             │ • Radar 5km       │
│ • Reportes PDF│              │ • Cobros QR       │             │ • Pagos QR        │
└───────────────┘              └───────────────────┘             └───────────────────┘
```

---

## 2. Pila Tecnológica Validada
- **Frontend / Móvil:** React Native (Expo SDK 54) + Expo Router + TypeScript + Tailwind CSS (`twrnc`).
- **Mapas:** Leaflet en WebView/Web (`LiveMapWeb.tsx`) con soporte multi-plataforma.
- **Backend & Base de Datos:** Supabase (PostgreSQL 15, PostGIS, Auth OTP Phone `+591`, Row Level Security y Storage).
- **Estado Global:** Zustand con reactividad en tiempo real vía canales Supabase WebSocket.

---

## 3. Matriz de Módulos y Funcionalidades Listas

| Módulo | Ruta | Estado | Capacidades Clave |
| :--- | :--- | :---: | :--- |
| **Inicio / Gateway** | `src/app/index.tsx` | ✅ Listo | Selector interactivo de portales con micro-animaciones. |
| **Autenticación** | `src/app/(auth)/login.tsx` | ✅ Listo | Login seguro por SMS/OTP (`+591`) con control de roles. |
| **Onboarding Chofer** | `src/app/(app)/driver-setup.tsx` | ✅ Listo | Carga documental (SOAT, Licencia, Placa) a Supabase Storage. |
| **Cabina del Chofer** | `src/app/(app)/driver.tsx` | ✅ Listo | Telemetría, Screen Wake Lock, mapa expandible y cobro QR. |
| **Radar Pasajero** | `src/app/(app)/passenger.tsx` | ✅ Listo | Radio 5km PostGIS, cálculo ETA, filtrado de líneas y pago QR. |
| **CRM Sindicatos** | `src/app/(admin)/dashboard.tsx` | ✅ Listo | Impersonación global, cálculo de ingresos y KPIs de flota. |
| **Gestión de Rutas** | `src/app/(admin)/routes.tsx` | ✅ Listo | CRUD de líneas y filtrado jerárquico por sindicato. |
| **Directorio Flota** | `src/app/(admin)/drivers.tsx` | ✅ Listo | Sincronización real de choferes sin fallbacks estáticos. |
| **Auditoría & Desvíos**| `src/app/(admin)/tracking.tsx` | ✅ Listo | Detección de trameaje con tolerancia de 100m en ruta. |
| **Reportes Ejecutivos**| `src/app/(admin)/reports.tsx` | ✅ Listo | Generación y exportación de PDFs nativos con `expo-print`. |

---

## 4. Guía de Puesta en Producción (Checklist Operativa)

### Paso 1: Ejecución del Parche de Base de Datos
Ejecutar el script [`session4_setup.sql`](file:///c:/Users/Rolando/Desktop/LaPazTransit_Expo/session4_setup.sql) en el SQL Editor de la consola de Supabase.
- Crea `route_deviations_history` con triggers de cálculo de tiempo y distancia máxima.
- Crea `qr_payments` con aislamiento multi-tenant y estado reactivo.

### Paso 2: Configuración de Variables de Entorno
Verificar el archivo `.env` en la raíz del proyecto:
```env
EXPO_PUBLIC_SUPABASE_URL=https://wwnxwdliysojiqtefuoy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<TU_ANON_KEY>
```

### Paso 3: Despliegue y Distribución
- **Web / PWA:**
  ```bash
  npx expo export -p web
  ```
- **Android APK (Piloto para Choferes):**
  ```bash
  npx eas-cli build -p android --profile preview
  ```

---

## 5. Próximos Pasos con Subagentes de Growth
1. **`partner-enablement`:** Generar el manual de usuario en PDF para choferes y directivas sindicales.
2. **`branding`:** Personalizar logotipos y banners de los primeros sindicatos en el CRM.
3. **`community-ops`:** Diseñar la estrategia de difusión en grupos de choferes y juntas vecinales.
