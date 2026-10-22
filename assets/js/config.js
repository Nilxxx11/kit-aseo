/* ============================================================
   config.js — Identidad de la empresa y configuración de Firebase
   Edita este archivo con los datos de tu proyecto de Firebase.
   ============================================================ */
window.APP_CONFIG = {
  empresa: {
    nombre: "HB",                 // Texto corto que se muestra junto al logo
    nombreCompleto: "HB",         // Razón social
    eslogan: "Avanzamos contigo", // Eslogan (visible en el logo)
    logo: "assets/logo.png"
  },

  forma: {
    codigo: "FT-SV-016",
    version: "1",
    fecha: "19/10/2026",
    titulo: "Inspección de kit de aseo de vehículos",
    subtitulo: "Plan Estratégico de Seguridad Vial"
  },

  firebase: {
    apiKey: "AIzaSyCfJiBkzwaLdoSpQDHU3rCgfC4nMr58hUk",

  authDomain: "paginaweb-d1886.firebaseapp.com",

  databaseURL: "https://paginaweb-d1886-default-rtdb.firebaseio.com",

  projectId: "paginaweb-d1886",

  storageBucket: "paginaweb-d1886.firebasestorage.app",

  messagingSenderId: "430619803153",

  appId: "1:430619803153:web:1fbada3c7fb6ca45a07bb0",

  measurementId: "G-BYJ5RVSZ92"

  },

  // Emuladores locales de Firebase (solo para pruebas en desarrollo).
  // Pon "enabled": true y los puertos indicados para trabajar sin conexión.
  emulators: {
    enabled: false,
    databasePort: 9000,
    authPort: 9099,
    host: "127.0.0.1"
  }
};

window.APP_CONFIG.isFirebaseConfigured = function () {
  const f = this.firebase || {};
  const keys = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return keys.every(function (k) {
    const v = f[k];
    return typeof v === "string" && v.length > 8 && v.indexOf("PEG_AQUI") !== 0;
  });
};
