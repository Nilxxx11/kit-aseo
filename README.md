# App de Inspección de Kits de Aseo — FT-SV-016

Aplicación web corporativa para registrar, analizar y auditar las inspecciones de los
kits de aseo de vehículos del **Plan Estratégico de Seguridad Vial**.

- **Interfaz corporativa** con la identidad visual del logo institucional (azul `#0060B0` / verde).
- **Firebase Realtime Database** para almacenar los registros en tiempo real.
- **Usuarios con autenticación** (Firebase Authentication) y un **usuario administrador**
  para ver, filtrar y descargar **todos los registros en Excel (.xlsx)**.
- **Dashboard analítico** con indicadores y gráficos (Chart.js) para seguimiento del cumplimiento.

---

## 1. Estructura del proyecto

```
kit_aseo_app/
├── index.html                     ← Aplicación (abre este archivo)
├── assets/
│   ├── logo.png                   ← Logo institucional
│   ├── css/app.css                ← Sistema de diseño corporativo
│   └── js/
│       ├── config.js              ← ⬅ EMPRESA + CONFIGURACIÓN DE FIREBASE (edítalo)
│       ├── store.js               ← Firebase RTDB + Auth (con respaldo en localStorage)
│       ├── xlsx-export.js         ← Generación del libro de Excel
│       ├── dashboard.js           ← Indicadores y gráficos
│       └── app.js                 ← Lógica de la interfaz
├── scripts/create-admin.mjs       ← Crea el usuario administrador (Firebase Admin SDK)
├── database.rules.json            ← Reglas de seguridad de Realtime Database
├── firebase.json                  ← Configuración de Hosting / Database
└── README.md
```

> La carpeta `assets/logo.png` es una copia del logo original de la aplicación; el archivo
> `logo.png` de la raíz se conserva.

---

## 2. Puesta en marcha rápida (modo local)

La app **funciona de inmediato sin configurar nada**: si Firebase no está configurado
entra en *modo local* y guarda los registros en `localStorage` del navegador.

Para probarla con un servidor local (recomendado):

```bash
cd kit_aseo_app
python3 -m http.server 8080
# abre http://localhost:8080
```

---

## 3. Configurar Firebase (Realtime Database + Authentication)

### 3.1 Crear el proyecto

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto**.
2. En el menú lateral: **Compilación → Realtime Database → Crear base de datos**.
   - Ubicación: la más cercana a tus usuarios.
   - Modo de seguridad: **Modo bloqueado** (las reglas se publican en el paso 3.5).
3. En **Compilación → Authentication → Empezar**:
   - Ve a **Proveedores → Correo electrónico/Contraseña → Habilitar**.
   - *(Opcional)* En **Configuración → Proveedores de correo**, añade un dominio de correo
     propio para producción.

### 3.2 Copiar la configuración del proyecto

1. **Configuración del proyecto → Tus apps → Web (`</>`) → Registra una app**.
2. Copia el bloque `firebaseConfig` y pégalo en **`assets/js/config.js`**:

```js
firebase: {
  apiKey: "AIza...",
  authDomain: "mi-proyecto.firebaseapp.com",
  databaseURL: "https://mi-proyecto-default-rtdb.firebaseio.com",
  projectId: "mi-proyecto",
  storageBucket: "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

> ⚠️ Si `databaseURL` no aparece, es que creaste la base en modo *Firestore*: crea una
> **Realtime Database** o copia la URL que aparece en la pestaña *Datos* de la base.

### 3.3 Publicar las reglas de seguridad

En la raíz del proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # selecciona el proyecto
firebase deploy --only database
```

O copia manualmente el contenido de **`database.rules.json`** en
*Realtime Database → Reglas → Publicar*.

### 3.4 Autorizar el dominio (si publicas en Firebase Hosting)

**Authentication → Configuración → Dominios autorizados → Añadir dominio**:
`localhost`, `127.0.1`, el dominio de Hosting (`tu-proyecto.web.app`) y cualquier
dominio propio.

### 3.5 Publicar la app

```bash
firebase deploy --only hosting
```

---

## 4. Crear el usuario administrador (única cuenta)

El sistema tiene **una sola cuenta**: el administrador. El formulario de inspección es
**público**, por lo que no se crean usuarios para los inspectores.

### Opción A — Script (recomendado)

1. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**
   → descarga el JSON y guárdalo en la raíz como **`service-account.json`**.
2. Instala las dependencias y crea el usuario:

```bash
npm install
node scripts/create-admin.mjs admin@tuempresa.com "TuClaveSegura123" "Nombre Admin" admin
```

El script:
- crea (o actualiza) el usuario en **Firebase Authentication**;
- le asigna el **custom claim** `rol: "admin"`;
- escribe el perfil en **`/usuarios/{uid}`** con `rol: "admin"`.

### Opción B — Registro del propio administrador

Si la base de datos está vacía, la **primera cuenta** que inicia sesión recibe
automáticamente el rol `admin` (mecanismo anti-bloqueo). En cuanto el perfil existe,
nadie más puede auto-registrarse: las reglas de `database.rules.json` bloquean la
auto-registro y el cambio de roles.

---

## 5. Funcionalidades

> Las secciones 5.2, 5.3 y 5.4 son **exclusivas del administrador** (la única cuenta
> del sistema). El formulario de inspección (5.1) es **público**: lo puede llenar
> cualquier persona, con o sin sesión. Ver §7.

### 5.1 Nueva inspección (público)
- Datos generales: fecha, placa, responsable y conductor.
- 4 elementos del kit (escoba, trapero, recogedor, balde) con estado **Cumple / No cumple / No aplica**.
- Barra de progreso en vivo con el avance de la inspección.
- **Acciones correctivas** automáticas por cada elemento marcado «No cumple»
  (acción, fecha de cierre y responsable).
- Validación de campos obligatorios y guardado en la base de datos.

### 5.2 Registros (administrador)
- Indicadores: total de inspecciones, acciones abiertas, conformes y acciones cerradas.
- Filtros por texto, estado, rango de fechas y responsable.
- Detalle expandible por registro con el estado de cada elemento y sus acciones.
- Marcar acciones como cerradas, eliminar (solo administradores) e imprimir.
- Exportación a **CSV**.

### 5.3 Dashboard (análisis · administrador)
- **KPIs**: inspecciones, % de cumplimiento, hallazgos, acciones abiertas, % de cierre,
  días promedio de cierre, vehículos y conductores.
- **Gráficos**:
  1. Inspecciones y hallazgos por mes + % de cumplimiento.
  2. Distribución del estado de los elementos (dona).
  3. Hallazgos por elemento del kit.
  4. % de cumplimiento por responsable.
  5. Vehículos con más hallazgos.
  6. Acciones correctivas abiertas vs. cerradas por mes.
- Tablas: detalle por elemento, ranking de responsables y últimas inspecciones.
- Filtro por periodo (30 días / 90 días / 12 meses / histórico).

### 5.4 Panel de administración (administrador)
- KPIs globales de la base de datos.
- Tabla completa de registros con filtros y eliminación.
- **Descarga en Excel (.xlsx)** con 6 hojas:
  `Inspecciones` · `Elementos` · `Acciones` · `Indicadores` · `Por elemento` · `Por responsable` · `Mensual`.
- Configuración de la identidad de la empresa (nombre, eslogan, código de la forma).

---

## 6. Modelo de datos (Realtime Database)

```
/inspecciones/{id}
  fecha: "2026-10-21"
  placa: "ABC123"
  conductor: "..."
  responsable: "..."
  items: [ { elemento, estado, obs }, ... ]
  acciones: [ { elemento, accion, cierre, responsable }, ... ]
  obs: "..."
  cerrada: false
  fechaCierre: ""
  autorUid: "uid"
  autorNombre: "..."
  creadoEn: 1790000000000

/usuarios/{uid}
  email: "admin@tuempresa.com"
  nombre: "Nombre Admin"
  rol: "admin" | "operador"
  creadoEn: 1790000000000

/configuracion
  empresa: { nombre, nombreCompleto, eslogan, logo }
  forma: { codigo, version, fecha, titulo, subtitulo }
```

---

## 7. Seguridad y permisos

El modelo es de **formulario público con acceso privado a los datos**:

- **Cualquier persona** puede llenar y guardar la inspección (sin cuenta, sin sesión).
- **Nadie** puede leer el historial, los reportes o la exportación: el **administrador**
  es la única cuenta del sistema y es el único autorizado.

### Qué ve cada quien

| Funcionalidad | Público (sin sesión) | Administrador |
|---|:---:|:---:|
| Llenar y guardar el formulario de inspección | ✅ | ✅ |
| Historial / Registros (búsqueda, filtros, cerrar acciones) | ❌ | ✅ |
| Dashboard con KPIs y gráficos | ❌ | ✅ |
| Panel de administración (XLSX, configuración) | ❌ | ✅ |

La restricción se aplica **por partida doble**:

1. **Interfaz**: el menú lateral y la barra inferior sólo muestran «Nueva inspección»
   si no hay sesión de administrador; las vistas `registros`, `dashboard` y `admin` se
   redirigen al formulario.
2. **Base de datos** (`database.rules.json`): el histórico **no se puede leer** sin ser
   administrador, aunque alguien lo pida por consola o API.

### Reglas incluidas

- **Lectura**: `inspecciones`, `usuarios` y `configuracion` sólo son legibles por el
  `admin`.
- **Escritura pública de inspecciones**: cualquiera puede **crear** una inspección
  (`autorUid` = `publico`), pero **no puede modificar ni borrar** registros existentes.
- **Escritura del administrador**: puede leer, editar y eliminar cualquier registro.
- **Usuarios**: sólo el `admin` puede escribir perfiles. El auto-registro está permitido
  únicamente para la **primera cuenta** de una base vacía (mecanismo anti-bloqueo);
  después, nadie puede crear cuentas ni auto-promoverse.
- **Configuración**: sólo el `admin` puede leerla o modificarla.

> En **modo local** (sin Firebase) no hay ni servidor ni cuentas: el dispositivo guarda
> todo en el navegador y funciona como una app de captura completa. Los permisos se
> aplican en cuanto se configura Firebase.

- **No subas** `service-account.json` a Git ni a Firebase Hosting (ya está excluido en
  `firebase.json` y `.gitignore`).

---

## 8. Preguntas frecuentes

| Problema | Solución |
|---|---|
| La app dice «Modo local» | Falta completar `assets/js/config.js` con la configuración del proyecto. |
| `auth/operation-not-allowed` | Activa el proveedor **Correo electrónico/Contraseña** en Firebase Authentication. |
| `auth/network-request-failed` | La app abierta con `file://` no puede usar Authentication; publícala en Hosting o sírvela por HTTP. |
| `PERMISSION_DENIED` al guardar | Publica las reglas (`firebase deploy --only database`). El formulario público sólo necesita las reglas nuevas; el admin además debe tener perfil en `/usuarios`. |
| Los gráficos no cargan | Chart.js se descarga desde CDN: revisa la conexión a internet. |
| El Excel no se genera | SheetJS se descarga desde CDN: revisa la conexión a internet. |

---

## 9. Personalización rápida

- **Colores y estilos**: `assets/css/app.css` (variables CSS en `:root`).
- **Elementos del kit a inspeccionar**: `ITEMS` en `assets/js/app.js`.
- **Logo, nombre y eslogan**: `assets/js/config.js` o *Panel de administración → Configuración*.
- **Código y versión de la forma**: `assets/js/config.js` (`forma`).
