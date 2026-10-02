# MEMORY: La Paz Transit SaaS
**Última Actualización:** 25 de mayo de 2026
**Rol:** Senior Full-Stack Architect

## 1. Estado Actual de la Arquitectura (MVP Consolidado)
Hemos consolidado un MVP robusto de telemetría y administración utilizando **Expo (React Native) + Supabase**.

### Logros Técnicos Implementados:
- **Autenticación Real (Phone OTP):** Migrado el sistema de inicio de sesión de un mock a Supabase Auth por número celular (`signInWithOtp` y `verifyOtp`). Sincronización automática de estado reactivo mediante `onAuthStateChange`.
- **Flujo de Choferes Seguro:** Identificación por UUID real de Supabase Auth. Control de estado (Offline/Active). Redirección obligatoria a la pantalla de Onboarding (`driver-setup.tsx`) si `is_profile_complete` es `false`.
- **Ficha Técnica Estructurada:** Inserción robusta mediante `upsert` en la tabla `drivers` capturando Placa, Sindicato, Propietario y Número de Afiliación.
- **Telemetría Optimizada:** Transmisión del GPS del conductor mediante el canal `live_locations` con inyección explícita del timestamp (`last_updated`).
- **Aislamiento SaaS e Integridad de Datos (Triggers):** Configurado un trigger en PostgreSQL que autocompleta automáticamente la columna `organization_id` de `live_locations` buscando la organización asignada al chofer en la tabla `drivers`.
- **Políticas RLS Estrictas:** Habilitado Row Level Security en la base de datos de Supabase, restringiendo la escritura/modificación de `drivers` y `live_locations` únicamente al usuario cuyo `auth.uid()` coincida con el registro (`id` y `driver_id` respectively).
- **Garbage Collector en el Servidor (pg_cron):** Eliminado el Garbage Collector ineficiente en el cliente (hilo principal React en `dashboard.tsx`). Ahora, una tarea de PostgreSQL mediante la extensión `pg_cron` purga del servidor las ubicaciones inactivas (más de 2 minutos sin reportar). Los clientes reciben eventos `DELETE` de manera reactiva mediante Supabase Realtime.
- **Buscadores de Rutas Interactivos:** Implementadas barras de búsqueda (`TextInput`) y filtrados en tiempo real tanto en la vista del Conductor (`driver.tsx`) como del Pasajero (`passenger.tsx`), limitando la visualización a un máximo de 15 coincidencias para optimizar el rendimiento y evitar listas colosales de botones.
- **Paneles Admin CRM Responsive:** Implementado el layout adaptativo para el administrador (Sidebar izquierdo en PC/Web y Bottom Tabs en móvil). Creados los módulos Dashboard, Routes, Drivers (absorbiendo Directorio), Tracking y Reports, con métricas, mapas en vivo satelitales y tablas interactivas.
- **Optimización GPS (Screen Wake Lock):** Integrado el Screen Wake Lock API nativo en el panel del chofer para prevenir que el celular se apague/suspenda mientras está transmitiendo coordenadas en el navegador web móvil.
- **KISS & Strict Type Safety:** Remoción absoluta del tipo `any`. Tipado estricto de retornos en `supabase.ts`, tipado de hooks de autenticación y cero errores en `npx tsc --noEmit`.

---

## 2. Decisiones Arquitectónicas Actuales
- **Autenticación Real:** Supabase Auth Phone OTP (SMS/OTP) nativo. Sincronización automática de estado reactivo mediante `onAuthStateChange`.
- **Garbage Collection en el Servidor:** pg_cron ejecutando `purge_inactive_locations()` cada minuto en PostgreSQL.
- **Triggers de Base de Datos para SaaS:** Delegar el establecimiento de relaciones de aislamiento (`organization_id`) a nivel base de datos para prevenir inyecciones o errores cliente-servidor.
- **Diseño Responsive Híbrido:** Menú de navegación lateral (Sidebar) en pantallas amplias (PC/Web Escritorio >= 768px) y barra de pestañas inferior (Bottom Tabs) en dispositivos móviles táctiles.
- **Optimización de GPS en Navegadores Web Móviles:** Uso de la API Screen Wake Lock para mantener encendida la pantalla del conductor, previniendo que los sistemas operativos suspendan el hilo de envío de telemetría GPS.
- **Gestión de Estado (State Management):** Zustand Store global (`useStore.ts`) unificando la suscripción reactiva y el búfer de posiciones GPS de conductores para evitar renders innecesarios y optimizar el lag gráfico.
- **Aislamiento Multi-Tenant (SaaS CRM):** Aislamiento estricto de inquilinos en base de datos mediante políticas RLS y la tabla `admin_profiles`, limitando el acceso de los administradores a los conductores y rutas de su propio sindicato.
- **PostGIS & Geofencing (Trameaje):** Uso de tipos espaciales `Geography(Point, 4326)` para vehículos y `Geography(LineString, 4326)` para rutas. Activación de un trigger en base de datos que calcula la distancia de desvío con `ST_Distance` y marca automáticamente alertas de trameaje cuando supera la tolerancia de 100 metros.
- **Ciclo de Turno y Logout Seguro:** Centralización del ciclo de vida del conductor en Zustand. El cierre de sesión detiene la geolocalización física, libera el screen wake lock, elimina la telemetría en vivo en Supabase para evitar vehículos fantasmas y actualiza el estado del conductor a `offline` a nivel global.
- **ETA y Distancia Geográfica:** Predicción cliente-side del tiempo de llegada (ETA) y distancia Haversine basada en la velocidad de la unidad, reportando alertas de trameaje visibles en el mapa de pasajeros y paneles administrativos.
- **Mapas Multiplataforma en WebView (Hito 6):** En dispositivos móviles se utiliza un contenedor `WebView` nativo (`react-native-webview`) cargando Leaflet en HTML en línea y comunicándose mediante `postMessage` para renderizar el mapa en vivo en tiempo real sin requerir configuraciones de SDK nativos (Google Maps/Apple Maps).
- **Recarga de Base de Datos Sincronizada (Hito 6):** Propagación de refresco reactivo para todas las pantallas de administración de manera asíncrona a través del contador `refreshTrigger` del almacén de Zustand.
- **Exportación en PDF Profesional (Hito 7):** Integración de `expo-print` y `expo-sharing` para compilar reportes operativos estructurados en HTML y exportarlos en formato PDF de manera cross-platform.
- **CRM Multitenant & Branding (Hito 8):** Implementación del CRM de Sindicatos para SuperAdmins con facturación dinámica ( Bs. 3/día por chofer, es decir, Bs. 21/semanal y Bs. 90/mensual) y personalización visual (logo y banner) por sindicato utilizando carga directa de imágenes con `expo-image-picker` a Supabase Storage.
- **Impersonación y Filtrado Global (Hito 9):** Implementado estado de impersonación global de Sindicato en Zustand (`selectedImpersonatedOrg`). Cuando el SuperAdmin selecciona un sindicato en el CRM, el filtro se aplica automáticamente y de forma coherente en todos los módulos de administración (Dashboard, Gestión de Rutas, Gestión de Choferes, Monitoreo en Vivo y Reportes).
- **Aislamiento Multi-Tenant Estricto (Hito 9):** Reforzada la lógica de visualización del Sindicato Admin. Si el rol es admin pero no posee `organization_id` (o durante la carga), se bloquea y retorna lista vacía de manera inmediata en lugar de recurrir al fallback global.
- **Robustez de Base de Datos y RLS (Hito 9):** Redefinidas las funciones `public.is_superadmin()` y `public.get_my_organization_id()` en PostgreSQL para que verifiquen el teléfono de `auth.users` directamente como fallback en caso de retraso en la sincronización de `admin_profiles`. Añadida la política RLS que permite a los Admins actualizar la información de su propia organización.
- **Suscripción de Layout a Cambios de Auth (Hito 9):** Modificado `_layout.tsx` para escuchar reactivamente los cambios de sesión mediante `supabase.auth.onAuthStateChange()`. Esto soluciona el problema de que el layout del menú lateral no se enteraba del inicio de sesión del Admin, forzando la actualización automática de su banner, nombre y logo del sindicato.
- **Header Genérico para SuperAdmin (Hito 9):** Ajustada la cabecera en `dashboard.tsx` para que el SuperAdministrador visualice siempre "Operaciones Centrales • La Paz Transit" y no el nombre del sindicato impersonado al navegar.
- **Parche de Base de Datos Consolidado (Hito 9):** Se consolidó `database_robustness_patch.sql` para crear el bucket `organizations_branding` y habilitar políticas públicas y de actualización de branding, asegurando que los logos y banners subidos persistan correctamente.
- **Mapas Panorámicos en Escritorio (Hito 10):** Se reestructuró el layout del Dashboard (`dashboard.tsx`) y Gestión de Rutas (`routes.tsx`) en PC/Escritorio (`isDesktop`). Los mapas en vivo de telemetría pasaron a ser tarjetas panorámicas de ancho completo (`w-full`) con una altura de `500px` colocadas arriba de la cuadrícula de información, mejorando drásticamente la visibilidad operativa. La tabla de choferes activos y los paneles laterales de actividades/acciones rápidas se dispusieron en dos columnas debajo del mapa.
- **Filtro Dropdown de Sindicato en Gestión de Rutas (Hito 10):** Se añadió un dropdown selector de Sindicato en `routes.tsx` para el SuperAdmin que carga dinámicamente las organizaciones. Esto previene listados excesivamente largos ("chorizos interminables") permitiendo filtrar las rutas por sindicato seleccionado, sincronizándose de forma de cascada con la impersonación del Dashboard global.
- **Sincronización Real de Choferes (Hito 10):** Remoción de la carga del mock estático `fallbackDrivers` en `drivers.tsx` cuando la base de datos de Supabase retorna un arreglo vacío (0 choferes). Esto soluciona la discrepancia de sincronización, mostrando con precisión la cantidad real de conductores registrados en la base de datos de Supabase.
- **Sincronización de Campo Legado de Sindicato (Hito 10):** Se modificó `driver-setup.tsx` para persistir tanto la columna relacional `organization_id` (UUID) como la columna legada de texto `sindicato` (con el nombre de la organización seleccionada) durante el registro del chofer. Esto evita valores `NULL` y asegura la compatibilidad con visualizaciones antiguas y herramientas directas de la base de datos de Supabase.
- **Historial de Desvíos de Trameaje (Sesión 4):** Registro automático en `route_deviations_history` con triggers de base de datos a partir de cambios en `live_locations.is_off_route`, optimizando el almacenamiento y eliminando lógica redundante en el cliente.
- **Pasarela de Pagos QR (Sesión 4):** Generación dinámica de transacciones en `qr_payments` con estados (`pending`, `completed`, `failed`), aislamiento RLS multi-tenant automático (`set_qr_payment_org()`), suscripción reactiva mediante canales de Supabase Realtime tanto para conductor como para pasajero, y simulación integrada.
- **Controles de Mapa Premium y Escalabilidad en Conductor (Sesión 4 - Tweak):** Refactorizado el mapa Leaflet en `LiveMapWeb.tsx` y la pantalla de `driver.tsx` para permitir que el chofer expanda el mapa dinámicamente de `280px` a `480px` e interactúe con un nivel de zoom inicial de `16` (más detallado para calles). Se implementaron controles HTML de Zoom (+/-) y Recentrado (`🎯`) con lógica de prevención de auto-centrado cuando el conductor arrastra manualmente el mapa, evitando saltos molestos.
- **Migración Session 4 Desplegada en Producción (PostgreSQL):** Ejecutado exitosamente `session4_setup.sql` en Supabase. Tablas `route_deviations_history` y `qr_payments` activas con sus triggers automáticos (`handle_live_location_deviations_trigger` y `set_qr_payment_org_trigger`) y políticas RLS multi-tenant plenamente operativas en la nube.
- **Validación Backend & RLS Fix (Fase 1):** Validado el ciclo de vida de pagos QR en `qr_payments` con auto-asignación multi-tenant vía trigger (`set_qr_payment_org`). Desplegado `fix_validation_rls.sql` para autorizar actualizaciones de cobros y consulta de desvíos en `route_deviations_history`.
- **Validación E2E Interactiva (Fase 2):** Verificada la navegación y flujo en los portales:
  - *Landing Gateway:* Acceso público con selector interactivo de portales.
  - *Portal Pasajero:* Búsqueda y filtrado de rutas, selección en mapa Leaflet y modal de pago QR interactivo.
  - *Portal Administrador:* Carga de métricas reales de flota (Bs. 90 facturación, 1 chofer), mapa panorámico de 500px y menú operacional.
  - *Seguridad de Tipos:* Compilación TypeScript `npx tsc --noEmit` completada con 0 errores.

- **Validación de Reportes PDF & Analíticas (Fase 3):** Validada la pantalla de Reportes (`reports.tsx`), carga de KPIs operativos, resumen de cumplimiento semanal por ruta (Líneas 158, 201, 212, 300) y ejecución de los exportadores PDF (`expo-print`) sin errores de ejecución.
- **Compilación de Producción Web & Despliegue en Vercel:** Desplegado con éxito en Vercel (`https://transporty-lp.vercel.app`) con soporte de rutas estáticas en `vercel.json` y sincronización continua desde GitHub (`ApexDigital-Tech/Transporty-LP`).
- **Resolución de Permisos de Onboarding & Storage (`fix_driver_setup_rls.sql`):** Habilitada la política pública/autenticada para la inserción en `drivers`, actualización de telemetría en `live_locations` y configuración de permisos de subida en el bucket `driver_profiles`, permitiendo el flujo completo de registro y activación de cabina en dispositivos móviles.
- **Configuración de Permisos Nativos y EAS Build Android:**
  - Inyectados en `app.json` los permisos de Android requeridos (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`) y el plugin de configuración de `expo-location`.
  - Inyectadas las variables de entorno de Supabase en los perfiles `preview` y `production` de `eas.json` para empaquetado nativo offline.
  - Proyecto EAS vinculado exitosamente a la cuenta `@moicogut` con Project ID `a478879e-82f2-4bb8-9f42-5cc80dff4325`.
  - Keystore de producción generado y administrado en la nube de Expo.
  - **Fix EAS Gradle Build & Metro Resolution (Hermes & Node 'ws' Fix):** 
    - Se solucionó la incompatibilidad de Gradle alineando `react-native-worklets@0.5.1`.
    - Se resolvió la falla de Hermes (`Invalid expression encountered`) fijando `"@supabase/supabase-js": "2.43.4"`.
    - Se resolvió la falla de resolución de `ws`/`zlib` interceptando las importaciones de `ws` en [`metro.config.js`](file:///c:/Users/Rolando/Desktop/LaPazTransit_Expo/metro.config.js) para retornar un módulo vacío en compilaciones nativas de React Native (aprovechando el `WebSocket` nativo).
    - Se desactivó la opción experimental `reactCompiler` en [`app.json`](file:///c:/Users/Rolando/Desktop/LaPazTransit_Expo/app.json) y se limitó `maxWorkers: 2` en Metro para prevenir errores Out-Of-Memory (OOM) durante la empaquetación de producción.
    - Se verificó exitosamente la compilación completa de la empaquetación JS local con `npx expo export:embed` (1196 módulos empaquetados correctamente con 0 errores).
  - **Optimización de Teclado Móvil y Fallback OTP (Sesión Post-Release):**
    - Ajustado `KeyboardAvoidingView` en `login.tsx` para no aplicar `behavior="height"` en Android (delegándolo al `adjustResize` del SO) y eliminado el `justify-center` del `ScrollView` para evitar que el teclado oculte los inputs.
    - Implementado soporte de autocompletado y fallback de desarrollo en `useAuth.tsx` para permitir autenticación fluida con el código de prueba `123456` sin requerir gateway activo de SMS, con verificación estricta de TypeScript (`npx tsc --noEmit`: 0 errores).
---

## 3. Estado de Certificación & Despliegue en Vivo
1. **Certificación PMV 1.0.0:** Suite de validación de 3 fases completada con éxito (Backend/RLS, UI E2E Interactiva, Reportes PDF).
2. **Aplicación Web / PWA en Producción:** Operativa en **`https://transporty-lp.vercel.app`**.
3. **Repositorio Central:** Sincronizado en **`https://github.com/ApexDigital-Tech/Transporty-LP`**.
4. **Build Móvil APK:** Compilación nativa completada y generada exitosamente en la nube de Expo. APK disponible para descarga e instalación en dispositivos Android en: `https://expo.dev/accounts/moicogut/projects/LaPazTransit_Expo/builds/de225860-9331-43e3-b2bc-c33a65b36cbf`.

---

## 4. Tareas Pendientes (Siguiente Sesión)
- **Evaluación de Resultados en Campo (Piloto La Paz):**
  - Instalar el APK final de Android en dispositivos de choferes reales.
  - Validar la precisión de telemetría y retención de pantalla (Screen Wake Lock) en recorridos físicos.
  - Comprobar la asertividad de las alertas de trameaje (100m de tolerancia) y ETA.
- **Validación de Integridad Financiera:**
  - Pruebas E2E de la pasarela de simulación de pagos QR (estado pendiente a completado).
  - Aislamiento multi-tenant validado mediante los reportes PDF consolidados.
- **Feedback Continuo (Sindicatos):**
  - Ajustes UX en la experiencia administrativa y recolección de feedback de campo.


