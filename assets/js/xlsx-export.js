/* ============================================================
   xlsx-export.js — Generación del libro de Excel (.xlsx)
   Hojas: Inspecciones · Elementos · Acciones · Resumen
   ============================================================ */
(function () {
  "use strict";

  function d2date(s) {
    if (!s) return "";
    var p = String(s).split("-");
    if (p.length !== 3) return "";
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? "" : d;
  }
  function iso2txt(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleString("es-CO");
  }
  function estadoTxt(s) {
    return { ok: "Conforme", open: "Acciones abiertas", done: "Acciones cerradas" }[s] || s || "";
  }
  function estadoRec(r) {
    if (!r.acciones || !r.acciones.length) return "ok";
    return r.cerrada ? "done" : "open";
  }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

  var ITEMS = ["Escoba", "Trapero", "Recogedor", "Balde"];

  function resumenRows(records) {
    var total = records.length;
    var elem = 0, cumple = 0, noCumple = 0, noAplica = 0;
    var abiertas = 0, cerradas = 0, accTotal = 0, accVencidas = 0;
    var porMes = {}, porResp = {}, porElem = {}, porPlaca = {}, placas = {};
    var today = new Date();

    records.forEach(function (r) {
      var mes = (r.fecha || "").slice(0, 7);
      porMes[mes] = (porMes[mes] || 0) + 1;
      placas[r.placa] = 1;

      var c = 0, nc = 0;
      (r.items || []).forEach(function (it) {
        elem++;
        porElem[it.elemento] = porElem[it.elemento] || { cumple: 0, noCumple: 0, noAplica: 0 };
        if (it.estado === "Cumple") { cumple++; c++; porElem[it.elemento].cumple++; }
        else if (it.estado === "No cumple") { noCumple++; nc++; porElem[it.elemento].noCumple++; }
        else { noAplica++; porElem[it.elemento].noAplica++; }
      });

      var resp = r.responsable || "(sin responsable)";
      porResp[resp] = porResp[resp] || { insp: 0, cumple: 0, total: 0, hallazgos: 0, acciones: 0 };
      porResp[resp].insp++;
      porResp[resp].cumple += c;
      porResp[resp].total += (c + nc);
      porResp[resp].hallazgos += nc;

      porPlaca[r.placa] = porPlaca[r.placa] || { inspecciones: 0, hallazgos: 0 };
      porPlaca[r.placa].inspecciones++;
      porPlaca[r.placa].hallazgos += nc;

      (r.acciones || []).forEach(function (a) {
        accTotal++;
        if (r.cerrada) { cerradas++; }
        else {
          abiertas++;
          if (a.cierre && d2date(a.cierre) && d2date(a.cierre) < today) accVencidas++;
        }
      });
    });

    var out = [];
    out.push({ Indicador: "Inspecciones registradas", Valor: total });
    out.push({ Indicador: "Vehículos (placas) inspeccionados", Valor: Object.keys(placas).length });
    out.push({ Indicador: "Elementos evaluados", Valor: elem });
    out.push({ Indicador: "Elementos conformes", Valor: cumple });
    out.push({ Indicador: "Hallazgos (No cumple)", Valor: noCumple });
    out.push({ Indicador: "Elementos no aplicables", Valor: noAplica });
    out.push({ Indicador: "Tasa de cumplimiento (%)", Valor: pct(cumple, cumple + noCumple) });
    out.push({ Indicador: "Acciones correctivas generadas", Valor: accTotal });
    out.push({ Indicador: "Acciones abiertas", Valor: abiertas });
    out.push({ Indicador: "Acciones cerradas", Valor: cerradas });
    out.push({ Indicador: "Cierre de acciones (%)", Valor: pct(cerradas, accTotal) });
    out.push({ Indicador: "Acciones abiertas y vencidas", Valor: accVencidas });
    out.push({ Indicador: "Generado el", Valor: new Date().toLocaleString("es-CO") });
    return out;
  }

  function tablaElementos(records) {
    var map = {};
    records.forEach(function (r) {
      (r.items || []).forEach(function (it) {
        map[it.elemento] = map[it.elemento] || { elem: 0, cumple: 0, noCumple: 0, noAplica: 0 };
        map[it.elemento].elem++;
        if (it.estado === "Cumple") map[it.elemento].cumple++;
        else if (it.estado === "No cumple") map[it.elemento].noCumple++;
        else map[it.elemento].noAplica++;
      });
    });
    var keys = Object.keys(map).length ? Object.keys(map) : ITEMS;
    return keys.map(function (k) {
      var v = map[k];
      var evaluables = v.cumple + v.noCumple;
      return {
        Elemento: k,
        Evaluaciones: v.elem,
        Cumple: v.cumple,
        "No cumple": v.noCumple,
        "No aplica": v.noAplica,
        "Cumplimiento (%)": pct(v.cumple, evaluables)
      };
    });
  }

  function tablaResponsables(records) {
    var map = {};
    records.forEach(function (r) {
      var k = r.responsable || "(sin responsable)";
      map[k] = map[k] || { insp: 0, cumple: 0, evaluables: 0, hallazgos: 0, abiertas: 0 };
      map[k].insp++;
      (r.items || []).forEach(function (it) {
        if (it.estado === "Cumple") { map[k].cumple++; map[k].evaluables++; }
        else if (it.estado === "No cumple") { map[k].hallazgos++; map[k].evaluables++; }
      });
      if (estadoRec(r) === "open") map[k].abiertas++;
    });
    return Object.keys(map).map(function (k) {
      var v = map[k];
      return {
        Responsable: k,
        Inspecciones: v.insp,
        "Hallazgos": v.hallazgos,
        "Cumplimiento (%)": pct(v.cumple, v.evaluables),
        "Acciones abiertas": v.abiertas
      };
    }).sort(function (a, b) { return b.Inspecciones - a.Inspecciones; });
  }

  function tablaMensual(records) {
    var map = {};
    records.forEach(function (r) {
      var m = (r.fecha || "").slice(0, 7);
      if (!m) return;
      map[m] = map[m] || { mes: m, insp: 0, hallazgos: 0, abiertas: 0, cerradas: 0, cumple: 0, evaluables: 0 };
      map[m].insp++;
      var c = 0, nc = 0;
      (r.items || []).forEach(function (it) {
        if (it.estado === "Cumple") { c++; map[m].evaluables++; }
        else if (it.estado === "No cumple") { nc++; map[m].evaluables++; }
      });
      map[m].hallazgos += nc;
      map[m].cumple += c;
      if (estadoRec(r) === "open") map[m].abiertas++;
      if (estadoRec(r) === "done") map[m].cerradas++;
    });
    return Object.keys(map).sort().map(function (k) {
      var v = map[k];
      return {
        Mes: v.mes,
        Inspecciones: v.insp,
        "Cumplimiento (%)": pct(v.cumple, v.evaluables),
        Hallazgos: v.hallazgos,
        "Acciones abiertas": v.abiertas,
        "Acciones cerradas": v.cerradas
      };
    });
  }

  var XlsxExport = {
    build: function (records) {
      if (!window.XLSX) throw new Error("La librería de Excel no está cargada (revisa la conexión).");

      var wb = XLSX.utils.book_new();
      var hoy = new Date().toISOString().slice(0, 10);

      /* --- 1. Inspecciones --- */
      var rowsInsp = records.map(function (r) {
        var c = 0, nc = 0, na = 0;
        (r.items || []).forEach(function (it) {
          if (it.estado === "Cumple") c++; else if (it.estado === "No cumple") nc++; else na++;
        });
        var evaluables = c + nc;
        var resumen = (r.items || []).map(function (it) { return it.elemento + ": " + it.estado; }).join(" | ");
        return {
          ID: r.id,
          Fecha: d2date(r.fecha),
          Placa: r.placa,
          Conductor: r.conductor,
          Responsable: r.responsable,
          "Estado": estadoTxt(estadoRec(r)),
          "Cumplimiento (%)": pct(c, evaluables),
          "Elementos conformes": c,
          Hallazgos: nc,
          "No aplica": na,
          "Acciones correctivas": (r.acciones || []).map(function (a) {
            return a.elemento + ": " + a.accion + (a.cierre ? " (cierre " + a.cierre + ")" : "");
          }).join(" | "),
          "Acciones abiertas": (r.acciones || []).filter(function (a) { return !r.cerrada; }).length,
          "Acciones cerradas": r.cerrada ? (r.acciones || []).length : 0,
          "Fecha de cierre": d2date(r.fechaCierre),
          Observaciones: r.obs,
          "Detalle por elemento": resumen,
          "Registrado por": r.autorNombre || "",
          "Creado en": iso2txt(r.creadoEn)
        };
      });
      if (!rowsInsp.length) rowsInsp = [{ ID: "Sin registros", Fecha: "", Placa: "" }];
      var ws1 = XLSX.utils.json_to_sheet(rowsInsp);
      ws1["!cols"] = [
        { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 14 },
        { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 40 }, { wch: 70 }, { wch: 22 }, { wch: 20 }
      ];
      if (ws1["!ref"]) ws1["!autofilter"] = { ref: ws1["!ref"] };
      XLSX.utils.book_append_sheet(wb, ws1, "Inspecciones");

      /* --- 2. Elementos evaluados --- */
      var rowsElem = [];
      records.forEach(function (r) {
        (r.items || []).forEach(function (it) {
          rowsElem.push({
            ID: r.id, Fecha: d2date(r.fecha), Placa: r.placa,
            Conductor: r.conductor, Responsable: r.responsable,
            Elemento: it.elemento, Estado: it.estado, Observaciones: it.obs || ""
          });
        });
      });
      if (!rowsElem.length) rowsElem = [{ ID: "Sin datos" }];
      var ws2 = XLSX.utils.json_to_sheet(rowsElem);
      ws2["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Elementos");

      /* --- 3. Acciones correctivas --- */
      var rowsAcc = [];
      var hoyD = new Date();
      records.forEach(function (r) {
        (r.acciones || []).forEach(function (a) {
          var vencida = (!r.cerrada && a.cierre && d2date(a.cierre) && d2date(a.cierre) < hoyD);
          rowsAcc.push({
            ID: r.id, Fecha: d2date(r.fecha), Placa: r.placa,
            Conductor: r.conductor, Responsable: r.responsable,
            Elemento: a.elemento, "Acción correctiva": a.accion,
            "Fecha de cierre": d2date(a.cierre), "Responsable de la acción": a.responsable || "",
            "Estado de la acción": r.cerrada ? "Cerrada" : "Abierta",
            "Vencida": vencida ? "Sí" : "No"
          });
        });
      });
      if (!rowsAcc.length) rowsAcc = [{ ID: "Sin acciones correctivas" }];
      var ws3 = XLSX.utils.json_to_sheet(rowsAcc);
      ws3["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 50 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Acciones");

      /* --- 4. Resumen analítico --- */
      var wsR = XLSX.utils.json_to_sheet(resumenRows(records));
      wsR["!cols"] = [{ wch: 42 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsR, "Indicadores");

      var wsE = XLSX.utils.json_to_sheet(tablaElementos(records));
      wsE["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsE, "Por elemento");

      var wsP = XLSX.utils.json_to_sheet(tablaResponsables(records));
      wsP["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsP, "Por responsable");

      var wsM = XLSX.utils.json_to_sheet(tablaMensual(records));
      wsM["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsM, "Mensual");

      return { wb: wb, filename: "inspecciones_kit_aseo_" + hoy + ".xlsx" };
    },

    download: function (records) {
      var res = this.build(records);
      XLSX.writeFile(res.wb, res.filename, {
        bookType: "xlsx",
        cellDates: true,
        dateNF: "dd/mm/yyyy"
      });
      return res.filename;
    }
  };

  window.XlsxExport = XlsxExport;
})();
