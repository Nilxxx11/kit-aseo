/* ============================================================
   store.js — Capa de datos
   · Firebase Realtime Database + Firebase Authentication
   · Modo local (localStorage) como respaldo cuando no hay
     configuración de Firebase o no hay conexión.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var LOCAL_KEY = "ft-sv-016:registros";
  var LOCAL_CFG_KEY = "ft-sv-016:config";

  var db = null;            // firebase.database.Database
  var auth = null;          // firebase.auth.Auth
  var refInsp = null;       // listener de inspecciones
  var refUsr = null;        // listener de usuarios
  var listeners = [];       // callbacks de datos
  var authListeners = [];   // callbacks de sesión

  function nowISO() { return new Date().toISOString(); }

  /* ---------------- listeners de Firebase ---------------- */
  var dbAttached = false;
  var dbRole = null;   // rol con el que se adjuntaron los listeners

  function currentRole() {
    if (!window.Auth || !Auth.user) return null;
    if (Auth.profile && Auth.profile.rol) return Auth.profile.rol;
    return "operador";   // por defecto, sin privilegios
  }

  function attachDb(rol) {
    if (!db) return;
    var mode = (rol === "admin") ? "admin" : "user";
    if (dbAttached && dbRole === mode) return;
    if (dbAttached) detachDb(false);

    dbAttached = true;
    dbRole = mode;

    if (mode === "admin") {
      // El administrador lee el histórico completo.
      refInsp = db.ref("inspecciones");
      refInsp.on("value", function (snap) {
        var val = snap.val() || {};
        var recs = Object.keys(val).map(function (k) { return norm(val[k], k); });
        recs.sort(function (a, b) { return (a.creadoEn || "") < (b.creadoEn || "") ? 1 : -1; });
        listeners.forEach(function (cb) { try { cb(recs); } catch (e) { console.error(e); } });
      }, function (err) {
        console.error("[RTDB]", err);
      });

      refUsr = db.ref("usuarios");
      refUsr.on("value", function (snap) {
        var val = snap.val() || {};
        var arr = Object.keys(val).map(function (k) { return normUser(val[k], k); });
        // Mantiene sincronizado el perfil/rol de la sesión actual
        if (window.Auth && Auth.user) {
          var mine = arr.filter(function (u) { return u.uid === Auth.user.uid; })[0];
          if (mine && (!Auth.profile || Auth.profile.rol !== mine.rol || Auth.profile.nombre !== mine.nombre)) {
            Auth.profile = mine;
            authListeners.forEach(function (cb) { try { cb(Auth.current()); } catch (e) { console.error(e); } });
            syncAccess();
          }
        }
      });
    } else {
      // Sin sesión de administrador no se adjunta ningún listener de datos.
      refInsp = null;
      refUsr = db.ref("usuarios/" + (Auth.user ? Auth.user.uid : ""));
      refUsr.on("value", function (snap) {
        if (!snap.exists()) return;
        var mine = normUser(snap.val(), Auth.user ? Auth.user.uid : "");
        if (!Auth.profile || Auth.profile.rol !== mine.rol || Auth.profile.nombre !== mine.nombre) {
          Auth.profile = mine;
          authListeners.forEach(function (cb) { try { cb(Auth.current()); } catch (e) { console.error(e); } });
        }
      }, function () { });
    }
  }

  function detachDb(clear) {
    if (!dbAttached) return;
    dbAttached = false;
    dbRole = null;
    try { if (refInsp) refInsp.off("value"); } catch (e) { }
    try { if (refUsr) refUsr.off("value"); } catch (e) { }
    if (clear === false) return;
    listeners.forEach(function (cb) { try { cb([]); } catch (e) { } });

  }

  /* Re-ajusta los listeners cuando cambia el rol de la sesión. */
  function syncAccess() {
    if (!db || !window.Auth || !Auth.user) return;
    attachDb(currentRole());
  }

  /* ---------------- normalización de registros ---------------- */
  function norm(r, id) {
    r = r || {};
    return {
      id: r.id || id,
      fecha: r.fecha || "",
      placa: (r.placa || "").toUpperCase(),
      conductor: r.conductor || "",
      responsable: r.responsable || "",
      items: Array.isArray(r.items) ? r.items : [],
      acciones: Array.isArray(r.acciones) ? r.acciones : [],
      obs: r.obs || "",
      cerrada: !!r.cerrada,
      fechaCierre: r.fechaCierre || "",
      autorUid: r.autorUid || "",
      autorNombre: r.autorNombre || "",
      creadoEn: r.creadoEn || "",
      actualizadoEn: r.actualizadoEn || ""
    };
  }

  function normUser(u, uid) {
    u = u || {};
    return {
      uid: u.uid || uid,
      email: u.email || "",
      nombre: u.nombre || "",
      rol: u.rol === "admin" ? "admin" : "operador",
      creadoEn: u.creadoEn || ""
    };
  }

  /* ============================================================
     MODO LOCAL
     ============================================================ */
  function localRead(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch (e) { return def; }
  }
  function localWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function localRecords() {
    return localRead(LOCAL_KEY, []).map(function (r, i) { return norm(r, r.id || ("L" + i)); });
  }
  function localEmit() {
    var recs = localRecords();
    listeners.forEach(function (cb) { try { cb(recs); } catch (e) { console.error(e); } });
  }

  var emulatorsApplied = false;
  function applyEmulators(authInstance) {
    var em = CFG.emulators;
    if (!em || !em.enabled) return;
    try {
      if (authInstance && em.authPort) {
        authInstance.useEmulator("http://" + (em.host || "127.0.0.1") + ":" + em.authPort);
        emulatorsApplied = true;
      }
    } catch (e) { console.warn(e); }
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */
  var Store = {
    mode: "local",            // "firebase" | "local"
    status: "iniciando",      // texto para el badge superior
    error: null,

    init: function () {
      var self = this;
      var configured = CFG.isFirebaseConfigured && CFG.isFirebaseConfigured();

      if (!configured) {
        this.mode = "local";
        this.status = "Modo local";
        this.error = "El servicio en la nube no está configurado. Los registros se guardan solo en este dispositivo.";
        this._bindLocalSync();
        localEmit();
        return Promise.resolve(this);
      }

      try {
        if (!window.firebase) throw new Error("El SDK de Firebase no se cargó (revisa la conexión a internet).");
        if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
        db = firebase.database();
        auth = firebase.auth();

        // Emuladores locales (desarrollo/pruebas)
        var em = CFG.emulators;
        if (em && em.enabled) {
          if (em.databasePort) db.useEmulator(em.host || "127.0.0.1", em.databasePort);
          applyEmulators(auth);
        }

        // La sesión de Firebase requiere dominio autorizado; en file:// fallará.
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
          .catch(function () { /* algunos navegadores lo bloquean en file:// */ });

        this.mode = "firebase";
        this.status = "Sincronizado";
        this.error = null;

        // Los listeners de la base de datos se activan sólo cuando hay
        // sesión iniciada: las reglas exigen `auth != null`.
        auth.onAuthStateChanged(function (user) {
          if (user) { attachDb(currentRole()); self._afterAuth(user); }
          else { detachDb(); }
          authListeners.forEach(function (cb) {
            try { cb(window.Auth ? Auth.current() : null); } catch (e) { console.error(e); }
          });
        });

        return Promise.resolve(this);
      } catch (err) {
        this.mode = "local";
        this.status = "Modo local (respaldo)";
        this.error = "No se pudo iniciar el servicio en la nube (" + err.message + "). Se usará el modo local.";
        console.error(err);
        this._bindLocalSync();
        localEmit();
        return Promise.resolve(this);
      }
    },

    _bindLocalSync: function () {
      var self = this;
      window.addEventListener("storage", function (e) {
        if (e.key === LOCAL_KEY) localEmit();
      });
      if (!self._localBound) { self._localBound = true; }
    },

    /* ---------- registros ---------- */
    subscribe: function (cb) {
      listeners.push(cb);
      if (this.mode === "local") localEmit();
      return function () { listeners = listeners.filter(function (l) { return l !== cb; }); };
    },

    list: function () {
      if (this.mode === "firebase") {
        // Sólo el administrador puede leer el histórico completo.
        if (!window.Auth || !Auth.isAdmin()) return Promise.resolve([]);
        return db.ref("inspecciones").once("value").then(function (snap) {
          var val = snap.val() || {};
          return Object.keys(val).map(function (k) { return norm(val[k], k); });
        });
      }
      return Promise.resolve(localRecords());
    },

    save: function (rec) {
      rec = norm(rec, rec.id);

      if (this.mode === "firebase") {
        // Formulario público: se puede guardar sin sesión.
        var id = rec.id;
        if (!id) {
          id = db.ref("inspecciones").push().key;
          rec.id = id;
          rec.creadoEn = firebase.database.ServerValue.TIMESTAMP;
        } else if (!rec.creadoEn) {
          rec.creadoEn = firebase.database.ServerValue.TIMESTAMP;
        }
        rec.actualizadoEn = firebase.database.ServerValue.TIMESTAMP;
        return db.ref("inspecciones/" + id).set(rec).then(function () { return rec; });
      }

      rec.creadoEn = rec.creadoEn || nowISO();
      rec.actualizadoEn = nowISO();
      var all = localRead(LOCAL_KEY, []);
      rec.id = rec.id || ("L" + Date.now() + Math.floor(Math.random() * 1000));
      var idx = -1;
      for (var i = 0; i < all.length; i++) { if (all[i].id === rec.id) { idx = i; break; } }
      if (idx >= 0) all[idx] = rec; else all.unshift(rec);
      if (!localWrite(LOCAL_KEY, all)) return Promise.reject(new Error("No se pudo guardar en este navegador"));
      localEmit();
      return Promise.resolve(rec);
    },

    update: function (id, patch) {
      if (this.mode === "firebase") {
        patch.actualizadoEn = firebase.database.ServerValue.TIMESTAMP;
        return db.ref("inspecciones/" + id).update(patch);
      }
      var all = localRead(LOCAL_KEY, []);
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i] = norm(Object.assign({}, all[i], patch), id);
          break;
        }
      }
      localWrite(LOCAL_KEY, all);
      localEmit();
      return Promise.resolve();
    },

    remove: function (id) {
      if (this.mode === "firebase") return db.ref("inspecciones/" + id).remove();
      var all = localRead(LOCAL_KEY, []).filter(function (r) { return r.id !== id; });
      localWrite(LOCAL_KEY, all);
      localEmit();
      return Promise.resolve();
    },

    /* ---------- configuración global ---------- */
    getConfig: function () {
      if (this.mode === "firebase") {
        if (!window.Auth || !Auth.isAdmin()) return Promise.resolve({});
        return db.ref("configuracion").once("value").then(function (s) { return s.val() || {}; });
      }
      return Promise.resolve(localRead(LOCAL_CFG_KEY, {}));
    },
    setConfig: function (obj) {
      if (this.mode === "firebase") return db.ref("configuracion").set(obj);
      localWrite(LOCAL_CFG_KEY, obj);
      return Promise.resolve();
    },

    /* ---------- usuarios ---------- */

    /* ---------- internals ---------- */
    _afterAuth: function (user) {
      var self = this;
      if (!user) return;
      // Garantiza que el usuario tenga perfil. El auto-registro (rol admin)
      // sólo es aceptado por las reglas cuando la base está vacía.
      db.ref("usuarios/" + user.uid).once("value").then(function (snap) {
        var u = snap.val();
        if (u && u.rol) return null;
        return db.ref("usuarios/" + user.uid).set({
          email: user.email || "",
          nombre: (user.displayName || (u && u.nombre) || (user.email || "").split("@")[0]),
          rol: "admin",
          creadoEn: firebase.database.ServerValue.TIMESTAMP
        });
      }).then(function () {
        return Auth.refreshProfile();
      }).catch(function () {
        // Sin permiso de auto-registro (ya hay usuarios): queda como operador.
        return Auth.refreshProfile();
      }).then(function () {
        syncAccess();
      }).catch(function () { });
    }
  };

  /* ============================================================
     AUTENTICACIÓN
     ============================================================ */
  var Auth = {
    user: null,
    profile: null,

    init: function () {
      var self = this;
      if (Store.mode !== "firebase" || !window.firebase) return Promise.resolve(this);
      auth = auth || firebase.auth();
      auth.onAuthStateChanged(function (u) {
        self.user = u;
        if (u) {
          self.refreshProfile();
        } else {
          self.profile = null;
        }
        authListeners.forEach(function (cb) { try { cb(self.current()); } catch (e) { console.error(e); } });
      });
      return Promise.resolve(this);
    },

    current: function () {
      if (Store.mode !== "firebase") {
        return { uid: "local", email: "", nombre: "Sesión local", rol: "admin", local: true };
      }
      if (!this.user) return null;
      return {
        uid: this.user.uid,
        email: this.user.email || "",
        nombre: (this.profile && this.profile.nombre) || (this.user.email || "").split("@")[0],
        rol: (this.profile && this.profile.rol) || "operador",
        local: false
      };
    },

    isAdmin: function () {
      var c = this.current();
      if (!c) return false;
      // En modo local no hay usuarios: el dispositivo actúa como estación de trabajo.
      if (c.local === true) return true;
      return c.rol === "admin";
    },

    refreshProfile: function () {
      var self = this;
      if (!this.user) return Promise.resolve(null);
      return db.ref("usuarios/" + this.user.uid).once("value").then(function (snap) {
        self.profile = snap.exists() ? normUser(snap.val(), self.user.uid) : null;
        authListeners.forEach(function (cb) { try { cb(self.current()); } catch (e) { console.error(e); } });
        syncAccess();
        return self.profile;
      }).catch(function () { return null; });
    },

    onChange: function (cb) { authListeners.push(cb); return cb; },

    signIn: function (email, pass) {
      if (Store.mode !== "firebase") return Promise.reject(new Error("Autenticación no disponible: el servicio en la nube no está configurado."));
      return auth.signInWithEmailAndPassword(email, pass).then(function (cred) {
        return Auth.refreshProfile().then(function () { return cred.user; });
      });
    },

    signOut: function () {
      if (Store.mode !== "firebase") return Promise.resolve();
      return auth.signOut();
    },

    sendReset: function (email) {
      if (Store.mode !== "firebase") return Promise.reject(new Error("Requiere el servicio en la nube configurado."));
      return auth.sendPasswordResetEmail(email);
    }
  };

  window.Store = Store;
  window.Auth = Auth;
})();
