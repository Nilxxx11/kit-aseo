/* ============================================================
   app.js — Controlador principal de la aplicación
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var ITEMS = [
    { n: "Escoba", c: "En buen estado, limpia, con cerdas completas y mango firme" },
    { n: "Trapero", c: "Limpio, en buen estado, con fibras completas y mango firme" },
    { n: "Recogedor", c: "Íntegro, limpio, sin fisuras ni fugas, con asa en buen estado (si aplica)" },
    { n: "Balde", c: "En buen estado, limpio, manija de agarre en buen estado" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var today = function () {
    var d = new Date();
    return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  };
  var fmtDate = function (d) { return d ? String(d).split("-").reverse().join("/") : "—"; };
  var nf = new Intl.NumberFormat("es-CO");
  var stTxt = { ok: "Conforme", open: "Acciones abiertas", done: "Acciones cerradas" };

  var records = [];
  var currentView = "inspeccion";

  /* ============================================================
     Utilidades UI
     ============================================================ */
  var toastT;
  function toast(msg, isErr) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("err", !!isErr);
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, isErr ? 3600 : 2400);
  }

  function applyBrand(cfg) {
    var emp = (cfg && cfg.empresa) || CFG.empresa || {};
    $("brandName").textContent = emp.nombre || "HB";
    $("brandSlogan").textContent = emp.eslogan || "";
    $("brandTag").textContent = emp.nombreCompleto && emp.nombreCompleto !== emp.nombre ? emp.nombreCompleto : (CFG.forma.subtitulo || "");
    $("pageSub").textContent = CFG.forma.titulo || "Inspección del kit de aseo de vehículos";
    var logo = $("brandLogo");
    if (emp.logo) logo.src = emp.logo;
    if (emp.nombre) document.title = emp.nombre + " · Inspección de kit de aseo";
  }

  /* ============================================================
     Tema claro / oscuro
     ============================================================ */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("ft-sv-016:tema", t); } catch (e) { }
    if (currentView === "dashboard" && records.length) renderDashboard();
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("ft-sv-016:tema"); } catch (e) { }
    if (!saved) saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", saved);
  }

  /* ============================================================
     Navegación
     ============================================================ */
  var VIEW_META = {
    inspeccion: { title: "Nueva inspección", sub: "Diligencia la verificación del kit de aseo" },
    registros: { title: "Registros", sub: "Historial de inspecciones realizadas" },
    dashboard: { title: "Dashboard", sub: "Indicadores y análisis de cumplimiento" },
    admin: { title: "Administración", sub: "Gestión de registros, usuarios y exportación" }
  };

  function show(view) {
    if (VIEW_META[view] === undefined) view = "inspeccion";
    // Restricción de vistas: sólo el administrador accede a reportes y administración.
    if (view !== "inspeccion" && !Auth.isAdmin()) view = "inspeccion";
    currentView = view;
    document.querySelectorAll(".view").forEach(function (s) { s.classList.toggle("on", s.id === "view-" + view); });
    document.querySelectorAll("#nav button, #bottomnav button").forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
    });
    $("pageTitle").textContent = VIEW_META[view].title;
    $("pageSub").textContent = VIEW_META[view].sub;
    try { history.replaceState(null, "", "#" + view); } catch (e) { }

    if (view === "registros") renderRecords();
    if (view === "dashboard") renderDashboard();
    if (view === "admin") renderAdmin();

    if (window.innerWidth <= 1000) closeSidebar();
  }

  function openSidebar() {
    $("sidebar").classList.add("open");
    $("scrim").classList.add("on");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("scrim").classList.remove("on");
  }

  /* ============================================================
     Formulario de inspección
     ============================================================ */
  function buildItems() {
    $("items").innerHTML = ITEMS.map(function (it, i) {
      return '<div class="item">' +
        '<div class="item-head"><h3>' + esc(it.n) + "</h3></div>" +
        '<p class="crit">' + esc(it.c) + "</p>" +
        '<div class="seg" role="radiogroup" aria-label="Estado de ' + esc(it.n) + '">' +
        '<label><input type="radio" name="e' + i + '" value="Cumple"><span class="s-c"><i class="dot"></i>Cumple</span></label>' +
        '<label><input type="radio" name="e' + i + '" value="No cumple"><span class="s-n"><i class="dot"></i>No cumple</span></label>' +
        '<label><input type="radio" name="e' + i + '" value="No aplica"><span class="s-a"><i class="dot"></i>No aplica</span></label>' +
        "</div>" +
        '<input type="text" id="o' + i + '" placeholder="Observaciones (opcional)" aria-label="Observaciones de ' + esc(it.n) + '">' +
        "</div>";
    }).join("");
    document.querySelectorAll("#items input[type=radio]").forEach(function (r) { r.onchange = syncAcc; });
    updateProgress();
  }

  var estado = function (i) {
    var el = document.querySelector('input[name=e' + i + "]:checked");
    return el ? el.value : "";
  };

  function updateProgress() {
    var c = 0, n = 0, a = 0, eval_ = 0;
    ITEMS.forEach(function (_, i) {
      var e = estado(i);
      if (e === "Cumple") c++;
      else if (e === "No cumple") n++;
      else if (e === "No aplica") a++;
      if (e) eval_++;
    });
    var total = ITEMS.length;
    var bar = $("progBar");
    bar.innerHTML =
      '<i class="ok" style="width:' + (c / total * 100) + '%"></i>' +
      '<i class="bad" style="width:' + (n / total * 100) + '%"></i>' +
      '<i class="na" style="width:' + (a / total * 100) + '%"></i>';
    $("progTxt").textContent = eval_ + " de " + total + " elementos evaluados";
    $("pgOk").textContent = "Cumple " + c;
    $("pgBad").textContent = "No cumple " + n;
    $("pgNa").textContent = "No aplica " + a;
    $("progPct").textContent = Math.round(eval_ / total * 100) + "% evaluado";
    var listo = eval_ === total;
    $("btnSave").disabled = false;
    $("saveHint").textContent = listo ? "Listo para guardar" : "Faltan " + (total - eval_) + " elementos por evaluar";
  }

  function syncAcc() {
    var keep = {};
    document.querySelectorAll("#acc .fix").forEach(function (f) {
      keep[f.dataset.i] = {
        a: f.querySelector(".a").value,
        d: f.querySelector(".d").value,
        r: f.querySelector(".r").value
      };
    });
    var bad = [];
    ITEMS.forEach(function (_, i) { if (estado(i) === "No cumple") bad.push(i); });
    $("accWrap").hidden = bad.length === 0;
    $("acc").innerHTML = bad.map(function (i) {
      var k = keep[i] || {};
      return '<div class="fix" data-i="' + i + '"><h4>' + esc(ITEMS[i].n) + '<span class="tag">NO CUMPLE</span></h4>' +
        '<label class="f">Acción correctiva<input type="text" class="a" value="' + esc(k.a) + '" placeholder="Qué se debe corregir"></label>' +
        '<div class="grid-2">' +
        '<label class="f">Fecha de cierre<input type="date" class="d" value="' + esc(k.d) + '"></label>' +
        '<label class="f">Responsable<input type="text" class="r" value="' + esc(k.r) + '" placeholder="Quién ejecuta la acción"></label>' +
        "</div></div>";
    }).join("");
    updateProgress();
  }

  function resetForm() {
    $("frm").reset();
    $("fecha").value = today();
    $("err").textContent = "";
    syncAcc();
  }

  function onSubmit(e) {
    e.preventDefault();
    var err = function (m) { $("err").textContent = m; toast("Revisa el formulario", true); };
    var v = function (id) { return $(id).value.trim(); };

    if (!$("fecha").value || !v("placa") || !v("resp") || !v("cond")) return err("Completa fecha, placa, responsable y conductor.");
    var falta = null;
    ITEMS.forEach(function (_, i) { if (!estado(i) && !falta) falta = ITEMS[i].n; });
    if (falta) return err("Marca el estado de: " + falta + ".");

    var acciones = [].map.call(document.querySelectorAll("#acc .fix"), function (f) {
      return {
        elemento: ITEMS[+f.dataset.i].n,
        accion: f.querySelector(".a").value.trim(),
        cierre: f.querySelector(".d").value,
        responsable: f.querySelector(".r").value.trim()
      };
    });
    var sin = acciones.filter(function (a) { return !a.accion; })[0];
    if (sin) return err("Describe la acción correctiva de: " + sin.elemento + ".");

    // El formulario es público: si hay sesión se registra el autor,
    // si no, la inspección queda como anónimo (sólo el admin la puede leer).
    var user = Auth.current();
    var rec = {
      fecha: $("fecha").value,
      placa: v("placa").toUpperCase(),
      responsable: v("resp"),
      conductor: v("cond"),
      items: ITEMS.map(function (it, i) {
        return { elemento: it.n, estado: estado(i), obs: v("o" + i) };
      }),
      acciones: acciones,
      obs: v("obs"),
      cerrada: false,
      fechaCierre: "",
      autorUid: (user && !user.local) ? user.uid : "publico",
      autorNombre: (user && !user.local) ? user.nombre : "Público"
    };

    var btn = $("btnSave");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    Store.save(rec).then(function () {
      resetForm();
      toast("Inspección guardada");
      if (Auth.isAdmin()) show("registros");
    }).catch(function (ex) {
      err("No se pudo guardar: " + (ex && ex.message ? ex.message : ex));
    }).then(function () {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Guardar inspección';
    });
  }

  /* ============================================================
     Registros
     ============================================================ */
  function filteredRecords() {
    var q = $("q").value.trim().toLowerCase();
    var f = $("fs").value;
    var fd = $("fd").value, fh = $("fh").value;
    var fr = $("fr").value.trim().toLowerCase();
    return records.filter(function (r) {
      if (f && Analytics.estadoRec(r) !== f) return false;
      if (fd && (r.fecha || "") < fd) return false;
      if (fh && (r.fecha || "") > fh) return false;
      if (fr && (r.responsable || "").toLowerCase().indexOf(fr) === -1) return false;
      if (q && [r.placa, r.conductor, r.responsable, r.obs].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderRecords() {
    var st = { ok: 0, open: 0, done: 0 };
    records.forEach(function (r) { st[Analytics.estadoRec(r)]++; });
    $("s-t").textContent = nf.format(records.length);
    $("s-o").textContent = nf.format(st.open);
    $("s-c").textContent = nf.format(st.ok);
    $("s-d").textContent = nf.format(st.done);
    $("navCount").textContent = records.length;
    $("navCount").hidden = !records.length;

    var rows = filteredRecords();
    $("filterCount").textContent = rows.length + " de " + records.length + " inspecciones";

    // datalist de responsables
    var resps = [];
    records.forEach(function (r) { if (r.responsable && resps.indexOf(r.responsable) === -1) resps.push(r.responsable); });
    $("dlResp").innerHTML = resps.map(function (r) { return '<option value="' + esc(r) + '">'; }).join("");

    if (!rows.length) {
      $("list").innerHTML = '<div class="empty"><strong>' +
        (records.length ? "Ninguna inspección coincide con el filtro" : "Aún no hay inspecciones registradas") +
        "</strong>" + (records.length ? "Ajusta los filtros o limpia la búsqueda." : "Registra la primera en la pestaña “Nueva inspección”.") + "</div>";
      return;
    }

    $("list").innerHTML = rows.map(function (r) {
      var s = Analytics.estadoRec(r);
      var c = 0, nc = 0;
      (r.items || []).forEach(function (it) {
        if (it.estado === "Cumple") c++; else if (it.estado === "No cumple") nc++;
      });
      var p = Analytics.pct(c, c + nc);
      var canEdit = Auth.isAdmin();
      return '<details class="rec ' + s + '">' +
        "<summary><span class='pl'>" + esc(r.placa) + "</span><span class='pill " + s + "'>" + stTxt[s] + "</span>" +
        "<span class='meta'>" + fmtDate(r.fecha) + " · Conductor: " + esc(r.conductor) + " · Cumplimiento " + p + "%</span></summary>" +
        "<div class='body'>" +
        "<p style='margin:12px 0 4px'><b>Responsable:</b> " + esc(r.responsable) + "</p>" +
        "<table><tr><th>Elemento</th><th>Estado</th><th>Observaciones</th></tr>" +
        (r.items || []).map(function (i) {
          var cls = i.estado === "Cumple" ? "ok" : i.estado === "No cumple" ? "open" : "na";
          return "<tr><td><b>" + esc(i.elemento) + "</b></td><td><span class='pill " + cls + "'>" + esc(i.estado) + "</span></td><td>" + (esc(i.obs) || "—") + "</td></tr>";
        }).join("") + "</table>" +
        ((r.acciones || []).length ? "<p style='margin:14px 0 4px'><b>Acciones correctivas</b></p><table><tr><th>Elemento</th><th>Acción</th><th>Cierre</th><th>Responsable</th></tr>" +
          (r.acciones || []).map(function (a) {
            return "<tr><td>" + esc(a.elemento) + "</td><td>" + esc(a.accion) + "</td><td>" + fmtDate(a.cierre) + "</td><td>" + (esc(a.responsable) || "—") + "</td></tr>";
          }).join("") + "</table>" : "") +
        (r.obs ? "<p style='margin:12px 0 0'><b>Observaciones:</b> " + esc(r.obs) + "</p>" : "") +
        (r.cerrada ? "<p style='margin:8px 0 0'>Acciones cerradas el " + fmtDate(r.fechaCierre) + ".</p>" : "") +
        "<div class='row noprint' style='margin-top:14px'>" +
        (s === "open" ? '<button class="btn sm" data-a="close" data-id="' + esc(r.id) + '">Marcar acciones como cerradas</button>' : "") +
        (canEdit ? '<button class="btn danger sm" data-a="del" data-id="' + esc(r.id) + '">Eliminar</button>' : "") +
        "</div></div></details>";
    }).join("");
  }

  function onListClick(e) {
    var b = e.target.closest("button[data-a]");
    if (!b) return;
    var id = b.dataset.id;
    var r = records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;

    if (b.dataset.a === "close") {
      Store.update(id, { cerrada: true, fechaCierre: today() }).then(function () {
        toast("Acciones marcadas como cerradas");
      }).catch(function (ex) { toast("No se pudo actualizar: " + ex.message, true); });
      return;
    }
    if (b.dataset.a === "del") {
      if (b.dataset.c !== "1") {
        b.dataset.c = "1";
        b.textContent = "Confirma para eliminar";
        setTimeout(function () { if (b.dataset.c === "1") { b.dataset.c = ""; b.textContent = "Eliminar"; } }, 4000);
        return;
      }
      Store.remove(id).then(function () { toast("Inspección eliminada"); })
        .catch(function (ex) { toast("No se pudo eliminar: " + ex.message, true); });
    }
  }

  function csvOf(rows) {
    var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var head = ["Fecha", "Placa", "Conductor", "Responsable", "Escoba", "Trapero", "Recogedor", "Balde",
      "Estado seguimiento", "Acciones correctivas", "Observaciones"];
    var lines = rows.map(function (r) {
      var st = {};
      (r.items || []).forEach(function (i) { st[i.elemento] = i.estado; });
      return [fmtDate(r.fecha), r.placa, r.conductor, r.responsable,
        st.Escoba, st.Trapero, st.Recogedor, st.Balde,
        stTxt[Analytics.estadoRec(r)],
        (r.acciones || []).map(function (a) { return a.elemento + ": " + a.accion; }).join(" | "),
        r.obs].map(q).join(",");
    });
    return [head.map(q).join(","), lines].join("\n");
  }

  function downloadCSV(rows) {
    var csv = csvOf(rows);
    try {
      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "inspecciones_" + today() + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast("CSV descargado");
    } catch (err) {
      toast("No se pudo generar el CSV", true);
    }
  }

  /* ============================================================
     Dashboard
     ============================================================ */
  function dashboardFiltered() {
    var from = $("dFrom").value, to = $("dTo").value;
    return records.filter(function (r) {
      if (from && (r.fecha || "") < from) return false;
      if (to && (r.fecha || "") > to) return false;
      return true;
    });
  }

  function renderDashboard() {
    var rows = dashboardFiltered();
    var label = "Todo el histórico";
    if ($("dFrom").value || $("dTo").value) {
      label = ($("dFrom").value ? fmtDate($("dFrom").value) : "inicio") + " — " + ($("dTo").value ? fmtDate($("dTo").value) : "hoy");
    }
    Dashboard.render(rows, label + " · " + rows.length + " inspecciones");
  }

  /* ============================================================
     Administración
     ============================================================ */
  function renderAdmin() {
    var isAdmin = Auth.isAdmin();
    $("adminLock").hidden = isAdmin;
    $("adminContent").hidden = !isAdmin;
    $("navAdmin").hidden = !isAdmin;
    $("navAdminLabel").hidden = !isAdmin;
    $("bottomAdmin").hidden = !isAdmin;
    if (!isAdmin) return;

    var st = { ok: 0, open: 0, done: 0 }, hallazgos = 0;
    records.forEach(function (r) {
      st[Analytics.estadoRec(r)]++;
      (r.items || []).forEach(function (i) { if (i.estado === "No cumple") hallazgos++; });
    });
    $("a-t").textContent = nf.format(records.length);
    $("a-o").textContent = nf.format(st.open);
    var placas = {};
    records.forEach(function (r) { if (r.placa) placas[r.placa] = 1; });
    $("a-u").textContent = nf.format(Object.keys(placas).length);
    $("a-h").textContent = nf.format(hallazgos);

    // tabla de registros
    var q = $("aq").value.trim().toLowerCase();
    var f = $("afs").value, fd = $("afd").value, fh = $("afh").value;
    var rows = records.filter(function (r) {
      if (f && Analytics.estadoRec(r) !== f) return false;
      if (fd && (r.fecha || "") < fd) return false;
      if (fh && (r.fecha || "") > fh) return false;
      if (q && [r.placa, r.conductor, r.responsable].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    $("adminCount").textContent = rows.length + " registros";
    var tb = $("adminTable").querySelector("tbody");
    tb.innerHTML = rows.length ? rows.map(function (r) {
      var c = 0, nc = 0;
      (r.items || []).forEach(function (it) {
        if (it.estado === "Cumple") c++; else if (it.estado === "No cumple") nc++;
      });
      var p = Analytics.pct(c, c + nc);
      var s = Analytics.estadoRec(r);
      return "<tr><td class='nowrap'>" + fmtDate(r.fecha) + "</td><td><b>" + esc(r.placa) + "</b></td><td>" + esc(r.conductor) +
        "</td><td>" + esc(r.responsable) + "</td><td class='num'>" + p + "%</td><td class='num' style='color:var(--bad)'>" + nc +
        "</td><td><span class='pill " + s + "'>" + stTxt[s] + "</span></td><td class='num'>" +
        '<button class="btn danger sm" data-a="adel" data-id="' + esc(r.id) + '">Eliminar</button></td></tr>';
    }).join("") : "<tr><td colspan='8' class='center muted' style='padding:24px'>Sin registros para mostrar</td></tr>";

    // acceso del administrador
    var me = Auth.current();
    $("adminInfo").innerHTML = me
      ? "Sesión activa: <b>" + esc(me.nombre || me.email) + "</b>"
      : "Sin sesión: sólo el administrador puede ver el historial y los reportes.";

    // configuración
    $("cfgName").value = (CFG.empresa && CFG.empresa.nombre) || "";
    $("cfgFull").value = (CFG.empresa && CFG.empresa.nombreCompleto) || "";
    $("cfgSlogan").value = (CFG.empresa && CFG.empresa.eslogan) || "";
    $("cfgStatus").innerHTML =
      "<b>Almacenamiento:</b> " + (Store.mode === "firebase" ? "Nube (sincronizado)" : "Este dispositivo") + "<br>" +
      "<b>Autenticación:</b> " + (Store.mode === "firebase" ? "Correo y contraseña" : "No configurada");
  }

  function onAdminTableClick(e) {
    var b = e.target.closest("button[data-a='adel']");
    if (!b) return;
    var id = b.dataset.id;
    if (b.dataset.c !== "1") {
      b.dataset.c = "1"; b.textContent = "Confirma";
      setTimeout(function () { if (b.dataset.c === "1") { b.dataset.c = ""; b.textContent = "Eliminar"; } }, 4000);
      return;
    }
    Store.remove(id).then(function () { toast("Registro eliminado"); })
      .catch(function (ex) { toast("No se pudo eliminar: " + ex.message, true); });
  }

  function friendlyAuthError(ex) {
    var code = ex && ex.code ? ex.code : "";
    var map = {
      "auth/invalid-email": "El correo no tiene un formato válido.",
      "auth/user-not-found": "No existe un usuario con ese correo.",
      "auth/wrong-password": "La contraseña es incorrecta.",
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
      "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
      "auth/weak-password": "La contraseña es demasiado débil (mínimo 6 caracteres).",
      "auth/email-already-in-use": "Ese correo ya está registrado.",
      "auth/network-request-failed": "Error de red. Revisa la conexión.",
      "auth/operation-not-allowed": "Activa el inicio de sesión con correo y contraseña."
    };
    return map[code] || (ex && ex.message ? ex.message : "Error inesperado");
  }

  function saveConfig() {
    var cfg = {
      empresa: {
        nombre: $("cfgName").value.trim() || "HB",
        nombreCompleto: $("cfgFull").value.trim(),
        eslogan: $("cfgSlogan").value.trim(),
        logo: CFG.empresa.logo
      },
      forma: CFG.forma
    };
    Store.setConfig(cfg).then(function () {
      CFG.empresa = cfg.empresa;
      CFG.forma = cfg.forma;
      applyBrand(cfg);
      $("cfgMsg").textContent = "Guardado" + (Store.mode === "local" ? " (solo en este dispositivo)" : "");
      toast("Configuración guardada");
    }).catch(function (ex) {
      $("cfgMsg").textContent = "Error: " + ex.message;
    });
  }

  function exportXLSX(rows) {
    if (!window.XLSX) { toast("La librería de Excel no está cargada (revisa la conexión)", true); return; }
    try {
      var name = XlsxExport.download(rows && rows.length ? rows : records);
      toast("Excel descargado: " + name);
    } catch (ex) {
      toast("No se pudo generar el Excel: " + ex.message, true);
    }
  }

  /* ============================================================
     Sesión
     ============================================================ */
  function openLogin() {
    $("liErr").textContent = "";
    $("loginModal").classList.add("on");
    setTimeout(function () { $("liEmail").focus(); }, 60);
  }
  function closeLogin() { $("loginModal").classList.remove("on"); }

  function doLogin() {
    var email = $("liEmail").value.trim();
    var pass = $("liPass").value;
    var err = $("liErr");
    err.textContent = "";
    if (!email || !pass) { err.textContent = "Completa correo y contraseña."; return; }
    $("liSubmit").disabled = true;
    $("liSubmit").textContent = "Entrando…";
    Auth.signIn(email, pass).then(function () {
      closeLogin();
      toast("Sesión iniciada");
      afterAuthChange();
    }).catch(function (ex) {
      err.textContent = friendlyAuthError(ex);
    }).then(function () {
      $("liSubmit").disabled = false;
      $("liSubmit").textContent = "Entrar";
    });
  }

  function setSessionLabel(txt) {
    ["btnSession", "btnSessionTop"].forEach(function (id) {
      var el = $(id); if (el) el.textContent = txt;
    });
  }

  function afterAuthChange() {
    var v = Auth.current();
    var admin = Auth.isAdmin();
    var isLocal = !!(v && v.local);

    if (v) {
      $("userName").textContent = v.nombre || v.email || "Usuario";
      $("userRole").textContent = isLocal ? "Modo local" : (v.rol === "admin" ? "Administrador" : "Operador");
      $("userAvatar").textContent = (v.nombre || v.email || "?").charAt(0).toUpperCase();
      setSessionLabel(isLocal ? "Configurar" : "Salir");
    } else {
      $("userName").textContent = "Sin sesión";
      $("userRole").textContent = "Acceso público";
      $("userAvatar").textContent = "?";
      setSessionLabel("Entrar");
    }

    // Sólo el administrador accede a Registros, Dashboard y Administración.
    $("navAdmin").hidden = !admin;
    $("navAdminLabel").hidden = !admin;
    $("bottomAdmin").hidden = !admin;

    var restricted = document.querySelectorAll(
      '#nav button[data-view="registros"], #nav button[data-view="dashboard"], #nav button[data-view="admin"],' +
      '#navAdminLabel, #bottomnav button[data-view="registros"], #bottomnav button[data-view="dashboard"],' +
      '#bottomnav button[data-view="admin"]');

    if (admin) {
      restricted.forEach(function (b) { b.style.display = ""; });
      $("navAnalysisLabel").style.display = "";
    } else {
      restricted.forEach(function (b) { b.style.display = "none"; });
      $("navAnalysisLabel").style.display = "none";
      if (currentView === "registros" || currentView === "dashboard" || currentView === "admin") {
        show("inspeccion");
      }
    }

    renderBanners();
    if (currentView === "admin") renderAdmin();
  }

  /* ============================================================
     Banners / estado
     ============================================================ */
  function renderBanners() {
    var html = (Store.mode === "firebase" && Store.error)
      ? '<div class="banner bad"><span class="ico">⛔</span><div><b>Error de conexión con el servidor.</b> ' + esc(Store.error) + "</div></div>"
      : "";
    ["bannerZone", "bannerZone2", "bannerZone3", "bannerZone4"].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = html;
    });

    var mp = $("modePill");
    if (mp) {
      mp.textContent = Store.mode === "firebase" ? "En línea" : "Local";
      mp.className = "pill " + (Store.mode === "firebase" ? "ok" : "na");
    }
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    initTheme();
    buildItems();
    resetForm();
    updateMenuBtn();

    Store.init().then(function () {
      return Auth.init();
    }).then(function () {
      renderBanners();
      afterAuthChange();

      Store.getConfig().then(function (cfg) {
        if (cfg && cfg.empresa) {
          CFG.empresa = Object.assign({}, CFG.empresa, cfg.empresa);
          CFG.forma = Object.assign({}, CFG.forma, cfg.forma || {});
        }
        applyBrand(CFG);
      }).catch(function () { applyBrand(CFG); });

      Store.subscribe(function (recs) {
        records = recs;
        renderRecords();
        if (currentView === "dashboard") renderDashboard();
        if (currentView === "admin") renderAdmin();
      });

      Auth.onChange(afterAuthChange);

      var hash = (location.hash || "").replace("#", "");
      show(VIEW_META[hash] ? hash : "inspeccion");
    }).catch(function (err) {
      console.error(err);
      toast("Error al iniciar: " + err.message, true);
    });

    /* eventos generales */
    document.querySelectorAll("#nav button, #bottomnav button").forEach(function (b) {
      b.addEventListener("click", function () { show(b.dataset.view); });
    });
    $("btnMenu").onclick = openSidebar;
    $("scrim").onclick = closeSidebar;
    $("btnTheme").onclick = function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    };
    var toggleSession = function () {
      var u = Auth.current();
      if (u && !u.local) {
        Auth.signOut().then(function () { toast("Sesión cerrada"); afterAuthChange(); });
      } else if (u && u.local) {
        window.open("README.md", "_blank");
      } else {
        openLogin();
      }
    };
    $("btnLoginAdmin").onclick = openLogin;
    $("btnSessionTop").onclick = toggleSession;
    $("btnSession").onclick = toggleSession;
    document.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a='openLogin']");
      if (b) openLogin();
    });
    $("liSubmit").onclick = doLogin;
    $("liPass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("liEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") $("liPass").focus(); });
    document.querySelectorAll("#loginModal [data-close]").forEach(function (b) {
      b.onclick = closeLogin;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeLogin(); closeSidebar(); }
    });

    /* formulario */
    $("frm").addEventListener("submit", onSubmit);
    $("btnReset").onclick = function () { resetForm(); toast("Formulario limpio"); };

    /* registros */
    $("list").addEventListener("click", onListClick);
    ["q", "fs", "fd", "fh", "fr"].forEach(function (id) {
      var el = $(id);
      el.addEventListener("input", renderRecords);
      el.addEventListener("change", renderRecords);
    });
    $("btnClearFilters").onclick = function () {
      ["q", "fs", "fd", "fh", "fr"].forEach(function (id) { $(id).value = ""; });
      renderRecords();
    };
    $("btnPrint").onclick = function () {
      document.querySelectorAll(".rec").forEach(function (d) { d.open = true; });
      window.print();
    };
    $("btnCsv").onclick = function () { downloadCSV(filteredRecords()); };

    /* dashboard */
    ["dFrom", "dTo"].forEach(function (id) {
      $(id).addEventListener("change", renderDashboard);
    });
    document.querySelectorAll("[data-range]").forEach(function (b) {
      b.onclick = function () {
        var d = new Date();
        d.setDate(d.getDate() - parseInt(b.dataset.range, 10));
        $("dFrom").value = d.toISOString().slice(0, 10);
        $("dTo").value = today();
        renderDashboard();
      };
    });
    $("dAll").onclick = function () { $("dFrom").value = ""; $("dTo").value = ""; renderDashboard(); };

    /* administración */
    $("adminTable").addEventListener("click", onAdminTableClick);
    $("btnLoginAdmin2").onclick = openLogin;
    $("btnSaveCfg").onclick = saveConfig;
    $("btnXlsx").onclick = function () { exportXLSX(adminFiltered()); };
    $("btnCsvAdmin").onclick = function () { downloadCSV(adminFiltered()); };
    ["aq", "afs", "afd", "afh"].forEach(function (id) {
      var el = $(id);
      el.addEventListener("input", renderAdmin);
      el.addEventListener("change", renderAdmin);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1000) closeSidebar();
      updateMenuBtn();
    });
  }

  function updateMenuBtn() {
    var b = $("btnMenu");
    if (b) b.style.display = window.innerWidth <= 1000 ? "inline-flex" : "none";
  }

  function adminFiltered() {
    var q = $("aq").value.trim().toLowerCase();
    var f = $("afs").value, fd = $("afd").value, fh = $("afh").value;
    return records.filter(function (r) {
      if (f && Analytics.estadoRec(r) !== f) return false;
      if (fd && (r.fecha || "") < fd) return false;
      if (fh && (r.fecha || "") > fh) return false;
      if (q && [r.placa, r.conductor, r.responsable].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
