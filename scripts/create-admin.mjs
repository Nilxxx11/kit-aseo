#!/usr/bin/env node
/* ============================================================
   create-admin.mjs — Crea un usuario administrador y le asigna
   el rol en Realtime Database (además de un custom claim).

   Uso:
     npm install
     node scripts/create-admin.mjs admin@empresa.com "MiClave123"

   Requisitos:
     · Archivo de credenciales del servicio descargado desde
       Firebase Console → Configuración del proyecto → Cuentas
       de servicio → Generar nueva clave privada (JSON).
       Guárdalo como "service-account.json" en la raíz del proyecto.
     · La API de Authentication debe tener habilitado el proveedor
       "Correo electrónico/Contraseña".
   ============================================================ */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const NOMBRE = process.argv[4] || "Administrador";
const ROL = process.argv[5] || "admin";

const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolve(ROOT, "service-account.json");

function die(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

if (!EMAIL || !PASSWORD) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Crear usuario en Firebase Authentication + Realtime Database ║
╚══════════════════════════════════════════════════════════════════════╝

  Uso:
    node scripts/create-admin.mjs <correo> <contraseña> [nombre] [rol]

  Ejemplos:
    node scripts/create-admin.mjs admin@empresa.com "ClaveSegura123" "Juan Pérez" admin
    node scripts/create-admin.mjs inspector@empresa.com "ClaveSegura123" "Ana Gómez" operador

  Credenciales: ${CRED_PATH}
`);
  process.exit(0);
}

if (PASSWORD.length < 8) die("La contraseña debe tener al menos 8 caracteres.");
if (!existsSync(CRED_PATH)) {
  die(`No se encontró el archivo de credenciales en:\n  ${CRED_PATH}\nDescárgalo desde Firebase Console y guárdalo con ese nombre.`);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(CRED_PATH, "utf8"));
} catch (e) {
  die("El archivo de credenciales no es un JSON válido: " + e.message);
}

const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  serviceAccount.databaseURL ||
  (process.env.FIREBASE_PROJECT_ID
    ? `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    : null);

if (!databaseURL) {
  die("No se pudo determinar la URL de Realtime Database. Define FIREBASE_DATABASE_URL.");
}

const app = initializeApp({ credential: serviceAccount, databaseURL });
const auth = getAuth(app);
const db = getDatabase(app);

(async () => {
  console.log("\n▶ Proyecto:", serviceAccount.project_id);
  console.log("▶ Base de datos:", databaseURL);
  console.log("▶ Usuario:", EMAIL, "· rol:", ROL, "\n");

  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
    console.log("• El usuario ya existía; se actualizará.");
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
      displayName: NOMBRE,
      disabled: false
    });
    console.log("• Usuario creado en Authentication.");
  }

  await auth.updateUser(user.uid, { password: PASSWORD, displayName: NOMBRE });
  await auth.setCustomUserClaims(user.uid, { rol: ROL });

  await db.ref(`usuarios/${user.uid}`).set({
    email: EMAIL,
    nombre: NOMBRE,
    rol: ROL,
    creadoEn: Date.now()
  });

  console.log("• Rol '" + ROL + "' guardado en /usuarios/" + user.uid);
  console.log("• Custom claim aplicado.\n");
  console.log("✔ Listo. Ya puedes iniciar sesión en la aplicación con:");
  console.log("   " + EMAIL + " / " + PASSWORD + "\n");
  process.exit(0);
})().catch((err) => {
  console.error("\n✖ Error:", err.message || err);
  console.error("\nRevisa que:");
  console.error("  1. El JSON de credenciales pertenezca al proyecto correcto.");
  console.error("  2. La API 'Authentication' esté habilitada.");
  console.error("  3. La base de datos 'Realtime Database' esté creada.\n");
  process.exit(1);
});
