/* ============================================================
   dashboard.js — Análisis y gráficos
   ============================================================ */
(function () {
  "use strict";

  var charts = {};
  var nf = new Intl.NumberFormat("es-CO");

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function mesLabel(m) {
    var p = String(m || "").split("-");
    if (p.length < 2) return m || "";
    var nom = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return nom[+p[1] - 1] + " " + p[0].slice(2);
  }
  function estadoRec(r) {
    if (!r.acciones || !r.acciones.length) return "ok";
    return r.cerrada ? "done" : "open";
  }
  function estadoTxt(s) {
    return { ok: "Conforme", open: "Acciones abiertas", done: "Acciones cerradas" }[s] || s;
  }

  /* ============================================================
     Cálculos analíticos
     ============================================================ */
  var Analytics = {
    estadoRec: estadoRec,
    estadoTxt: estadoTxt,
    pct: pct,

    compute: function (records) {
      var out = {
        total: records.length,
        elementos: 0, cumple: 0, noCumple: 0, noAplica: 0,
        accionesTotal: 0, accionesAbiertas: 0, accionesCerradas: 0, vencidas: 0,
        placas: {}, responsables: {}, conductores: {},
        porMes: {}, porElemento: {}, porPlaca: {},
        estados: { ok: 0, open: 0, done: 0 },
        diasCierre: []
      };
      var hoy = new Date();

      records.forEach(function (r) {
        out.estados[estadoRec(r)]++;
        out.placas[r.placa] = 1;
        out.responsables[r.responsable] = 1;
        out.conductores[r.conductor] = 1;

        var m = (r.fecha || "").slice(0, 7);
        if (m) {
          out.porMes[m] = out.porMes[m] || { mes: m, total: 0, hallazgos: 0, abiertas: 0, cerradas: 0, cumple: 0, evaluables: 0 };
          out.porMes[m].total++;
        }

        var c = 0, nc = 0;
        (r.items || []).forEach(function (it) {
          out.elementos++;
          var e = out.porElemento[it.elemento] = out.porElemento[it.elemento] || { elemento: it.elemento, cumple: 0, noCumple: 0, noAplica: 0, total: 0 };
          e.total++;
          if (it.estado === "Cumple") { out.cumple++; c++; e.cumple++; }
          else if (it.estado === "No cumple") { out.noCumple++; nc++; e.noCumple++; }
          else { out.noAplica++; e.noAplica++; }
        });

        if (m) {
          out.porMes[m].cumple += c;
          out.porMes[m].evaluables += c + nc;
          out.porMes[m].hallazgos += nc;
        }

        var resp = r.responsable || "(sin responsable)";
        var pr = out.porResponsable = out.porResponsable || {};
        pr[resp] = pr[resp] || { responsable: resp, inspecciones: 0, cumple: 0, evaluables: 0, hallazgos: 0, abiertas: 0 };
        pr[resp].inspecciones++;
        pr[resp].cumple += c;
        pr[resp].evaluables += c + nc;
        pr[resp].hallazgos += nc;

        var pl = out.porPlaca[r.placa] = out.porPlaca[r.placa] || { placa: r.placa, inspecciones: 0, hallazgos: 0 };
        pl.inspecciones++;
        pl.hallazgos += nc;

        (r.acciones || []).forEach(function (a) {
          out.accionesTotal++;
          if (r.cerrada) {
            out.accionesCerradas++;
            if (r.fechaCierre && r.fecha) {
              var d1 = new Date(r.fecha), d2 = new Date(r.fechaCierre);
              if (!isNaN(d1) && !isNaN(d2)) out.diasCierre.push(Math.round((d2 - d1) / 86400000));
            }
          } else {
            out.accionesAbiertas++;
            if (a.cierre && new Date(a.cierre) < hoy) out.vencidas++;
          }
          if (m) {
            if (r.cerrada) out.porMes[m].cerradas++; else out.porMes[m].abiertas++;
          }
        });
      });

      out.tasaCumplimiento = pct(out.cumple, out.cumple + out.noCumple);
      out.tasaCierre = pct(out.accionesCerradas, out.accionesTotal);
      out.nPlacas = Object.keys(out.placas).length;
      out.nResponsables = Object.keys(out.responsables).length;
      out.nConductores = Object.keys(out.conductores).length;
      out.diasCierreProm = out.diasCierre.length
        ? Math.round(out.diasCierre.reduce(function (a, b) { return a + b; }, 0) / out.diasCierre.length) : null;

      out.meses = Object.keys(out.porMes).sort().map(function (k) { return out.porMes[k]; });
      out.elementosArr = Object.keys(out.porElemento).map(function (k) { return out.porElemento[k]; });
      out.responsablesArr = Object.keys(out.porResponsable || {}).map(function (k) { return out.porResponsable[k]; })
        .sort(function (a, b) { return b.inspecciones - a.inspecciones; });
      out.placasArr = Object.keys(out.porPlaca).map(function (k) { return out.porPlaca[k]; })
        .sort(function (a, b) { return b.hallazgos - a.hallazgos || b.inspecciones - a.inspecciones; })
        .slice(0, 10);
      return out;
    }
  };

  /* ============================================================
     Gráficos
     ============================================================ */
  function baseOptions(extra) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 14, font: { family: "Archivo", size: 12 }, color: css("--ink-600") } },
        tooltip: {
          backgroundColor: css("--ink-900"),
          titleFont: { family: "Archivo", weight: "700" },
          bodyFont: { family: "Archivo" },
          padding: 10,
          cornerRadius: 8,
          displayColors: true
        }
      }
    }, extra || {});
  }

  function mount(id, cfg) {
    var canvas = document.getElementById(id);
    if (!canvas) return;
    if (!window.Chart) {
      var box = canvas.parentElement;
      box.innerHTML = '<div class="empty"><strong>Gráfico no disponible</strong>Se requiere conexión a internet para cargar la librería de gráficos.</div>';
      return;
    }
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    charts[id] = new Chart(canvas.getContext("2d"), cfg);
  }

  function renderCharts(a) {
    var brand = css("--brand-600"), brandL = css("--brand-300"), green = css("--green-600");
    var bad = css("--bad"), warn = css("--warn"), na = css("--na"), ink = css("--ink-500");

    /* 1. Tendencia mensual */
    var meses = a.meses.map(function (m) { return mesLabel(m.mes); });
    mount("chTrend", {
      type: "line",
      data: {
        labels: meses,
        datasets: [
          {
            label: "Inspecciones", data: a.meses.map(function (m) { return m.total; }),
            borderColor: brand, backgroundColor: hexA(brand, .12), fill: true, tension: .35,
            borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: brand, yAxisID: "y"
          },
          {
            label: "Hallazgos", data: a.meses.map(function (m) { return m.hallazgos; }),
            borderColor: bad, backgroundColor: "transparent", tension: .35,
            borderWidth: 2, borderDash: [5, 4], pointRadius: 2.5, pointBackgroundColor: bad, yAxisID: "y"
          },
          {
            label: "% cumplimiento", type: "bar", yAxisID: "y1",
            data: a.meses.map(function (m) { return pct(m.cumple, m.evaluables); }),
            backgroundColor: hexA(green, .25), borderRadius: 5, barPercentage: .55, categoryPercentage: .7
          }
        ]
      },
      options: baseOptions({
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, font: { family: "Archivo", size: 11 } } },
          y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { precision: 0, color: ink }, title: { display: true, text: "Inspecciones", color: ink, font: { family: "Archivo", size: 11 } } },
          y1: { position: "right", beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: ink, callback: function (v) { return v + "%"; } }, title: { display: true, text: "Cumplimiento", color: ink, font: { family: "Archivo", size: 11 } } }
        }
      })
    });

    /* 2. Estado de los elementos */
    mount("chEstados", {
      type: "doughnut",
      data: {
        labels: ["Cumple", "No cumple", "No aplica"],
        datasets: [{
          data: [a.cumple, a.noCumple, a.noAplica],
          backgroundColor: [green, bad, na],
          borderColor: css("--card"), borderWidth: 3, hoverOffset: 8
        }]
      },
      options: baseOptions({
        cutout: "62%",
        plugins: Object.assign(baseOptions().plugins, {
          legend: { position: "right", labels: { boxWidth: 12, boxHeight: 12, padding: 14, font: { family: "Archivo", size: 12 }, color: css("--ink-600"), usePointStyle: true } },
          tooltip: { callbacks: { label: function (c) {
            var tot = a.cumple + a.noCumple + a.noAplica;
            return " " + c.label + ": " + nf.format(c.parsed) + " (" + pct(c.parsed, tot) + "%)";
          } } }
        })
      })
    });

    /* 3. Hallazgos por elemento */
    var elems = a.elementosArr.slice().sort(function (x, y) { return y.noCumple - x.noCumple; });
    mount("chElementos", {
      type: "bar",
      data: {
        labels: elems.map(function (e) { return e.elemento; }),
        datasets: [{
          label: "Veces «No cumple»",
          data: elems.map(function (e) { return e.noCumple; }),
          backgroundColor: hexA(bad, .8), borderRadius: 6, barPercentage: .68
        }]
      },
      options: baseOptions({
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: css("--line") }, ticks: { precision: 0, color: ink } },
          y: { grid: { display: false }, ticks: { color: css("--ink-800"), font: { family: "Archivo", size: 12, weight: "600" } } }
        }
      })
    });

    /* 4. Cumplimiento por responsable */
    var resp = a.responsablesArr.slice(0, 10);
    mount("chResponsables", {
      type: "bar",
      data: {
        labels: resp.map(function (r) { return r.responsable; }),
        datasets: [{
          label: "% de cumplimiento",
          data: resp.map(function (r) { return pct(r.cumple, r.evaluables); }),
          backgroundColor: resp.map(function (r) { return pct(r.cumple, r.evaluables) >= 80 ? hexA(green, .85) : hexA(warn, .85); }),
          borderRadius: 6, barPercentage: .68
        }]
      },
      options: baseOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, maxRotation: 40, minRotation: 0, font: { family: "Archivo", size: 11 } } },
          y: { beginAtZero: true, max: 100, grid: { color: css("--line") }, ticks: { color: ink, callback: function (v) { return v + "%"; } } }
        }
      })
    });

    /* 5. Placas con más hallazgos */
    var placas = a.placasArr.filter(function (p) { return p.hallazgos > 0; }).slice(0, 8);
    mount("chPlacas", {
      type: "bar",
      data: {
        labels: placas.map(function (p) { return p.placa; }),
        datasets: [{
          label: "Hallazgos",
          data: placas.map(function (p) { return p.hallazgos; }),
          backgroundColor: hexA(brand, .8), borderRadius: 6, barPercentage: .68
        }]
      },
      options: baseOptions({
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: css("--line") }, ticks: { precision: 0, color: ink } },
          y: { grid: { display: false }, ticks: { color: css("--ink-800"), font: { family: "Archivo", size: 12, weight: "600" } } }
        }
      })
    });

    /* 6. Acciones correctivas por mes */
    mount("chAcciones", {
      type: "bar",
      data: {
        labels: meses,
        datasets: [
          { label: "Abiertas", data: a.meses.map(function (m) { return m.abiertas; }), backgroundColor: hexA(bad, .8), borderRadius: 5, stack: "s" },
          { label: "Cerradas", data: a.meses.map(function (m) { return m.cerradas; }), backgroundColor: hexA(green, .8), borderRadius: 5, stack: "s" }
        ]
      },
      options: baseOptions({
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: ink, font: { family: "Archivo", size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: css("--line") }, ticks: { precision: 0, color: ink } }
        }
      })
    });
  }

  function hexA(hex, alpha) {
    hex = (hex || "#000").trim();
    if (hex.charAt(0) !== "#") hex = "#" + hex;
    if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  /* ============================================================
     Render del dashboard
     ============================================================ */
  var Dashboard = {
    render: function (records, label) {
      var a = Analytics.compute(records);
      var k = document.getElementById("dashKpis");
      var range = document.getElementById("dashRange");
      if (range) range.textContent = label || "Todo el histórico";

      if (!records.length) {
        k.innerHTML = "";
        k.innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>Sin datos en el periodo</strong>Registra inspecciones o amplía el rango de fechas para ver los indicadores.</div>';
        renderCharts(Analytics.compute([]));
        ["tblElementos", "tblResponsables", "tblRecientes"].forEach(function (id) {
          var t = document.getElementById(id); if (t) t.innerHTML = "";
        });
        return a;
      }

      k.innerHTML = [
        kpi("Inspecciones", nf.format(a.total), a.nPlacas + " vehículos · " + a.nResponsables + " responsables", ""),
        kpi("Cumplimiento", a.tasaCumplimiento + "<small>%</small>", nf.format(a.cumple) + " conformes de " + nf.format(a.cumple + a.noCumple), a.tasaCumplimiento >= 90 ? "ok" : a.tasaCumplimiento >= 75 ? "warn" : "bad"),
        kpi("Hallazgos", nf.format(a.noCumple), "Elementos «No cumple»", a.noCumple ? "bad" : "ok"),
        kpi("Acciones abiertas", nf.format(a.accionesAbiertas), a.vencidas ? nf.format(a.vencidas) + " vencidas" : "Sin acciones vencidas", a.accionesAbiertas ? "bad" : "ok"),
        kpi("Cierre de acciones", a.tasaCierre + "<small>%</small>", nf.format(a.accionesCerradas) + " de " + nf.format(a.accionesTotal) + " cerradas", a.tasaCierre >= 80 ? "ok" : "warn"),
        kpi("Días promedio de cierre", a.diasCierreProm === null ? "—" : nf.format(a.diasCierreProm), "Desde la inspección hasta el cierre", "na"),
        kpi("Vehículos inspeccionados", nf.format(a.nPlacas), nf.format(a.nConductores) + " conductores", ""),
        kpi("Conformes / Abiertas", nf.format(a.estados.ok) + " / " + nf.format(a.estados.open), nf.format(a.estados.done) + " con acciones cerradas", "na")
      ].join("");

      renderCharts(a);

      /* tabla por elemento */
      var t1 = document.getElementById("tblElementos");
      if (t1) {
        var rows = a.elementosArr.slice().sort(function (x, y) { return (y.noCumple - x.noCumple) || (y.total - x.total); });
        t1.innerHTML = "<thead><tr><th>Elemento</th><th>Eval.</th><th>Cumple</th><th>No cumple</th><th>Cumplimiento</th></tr></thead><tbody>" +
          rows.map(function (e) {
            var p = pct(e.cumple, e.cumple + e.noCumple);
            return "<tr><td><b>" + esc(e.elemento) + "</b></td><td class='num'>" + e.total + "</td><td class='num'>" + e.cumple +
              "</td><td class='num' style='color:var(--bad)'>" + e.noCumple + "</td><td class='num'>" + p + "%" +
              "<div class='mini-bar'><i class='" + (p < 80 ? "bad" : "") + "' style='width:" + p + "%'></i></div></td></tr>";
          }).join("") + "</tbody>";
      }

      /* tabla por responsable */
      var t2 = document.getElementById("tblResponsables");
      if (t2) {
        t2.innerHTML = "<thead><tr><th>Responsable</th><th>Insp.</th><th>Hallazgos</th><th>Cumplim.</th><th>Abiertas</th></tr></thead><tbody>" +
          a.responsablesArr.map(function (r) {
            var p = pct(r.cumple, r.evaluables);
            return "<tr><td><b>" + esc(r.responsable) + "</b></td><td class='num'>" + r.inspecciones + "</td><td class='num' style='color:var(--bad)'>" + r.hallazgos +
              "</td><td class='num'>" + p + "%</td><td class='num'>" + r.abiertas + "</td></tr>";
          }).join("") + "</tbody>";
      }

      /* últimas inspecciones */
      var t3 = document.getElementById("tblRecientes");
      if (t3) {
        var ult = records.slice(0, 10);
        t3.innerHTML = "<thead><tr><th>Fecha</th><th>Placa</th><th>Conductor</th><th>Responsable</th><th>Cumplimiento</th><th>Estado</th></tr></thead><tbody>" +
          ult.map(function (r) {
            var c = 0, nc = 0;
            (r.items || []).forEach(function (it) {
              if (it.estado === "Cumple") c++; else if (it.estado === "No cumple") nc++;
            });
            var p = pct(c, c + nc);
            var st = estadoRec(r);
            var cls = st === "ok" ? "ok" : st === "open" ? "open" : "done";
            return "<tr><td class='nowrap'>" + esc(r.fecha) + "</td><td><b>" + esc(r.placa) + "</b></td><td>" + esc(r.conductor) +
              "</td><td>" + esc(r.responsable) + "</td><td class='num'>" + p + "%</td><td><span class='pill " + cls + "'>" + estadoTxt(st) + "</span></td></tr>";
          }).join("") + "</tbody>";
      }

      return a;
    },

    destroy: function () {
      Object.keys(charts).forEach(function (k) { charts[k].destroy(); delete charts[k]; });
    }
  };

  function kpi(label, val, sub, tone) {
    return '<div class="kpi ' + (tone || "") + '"><div class="k-label">' + esc(label) + "</div>" +
      '<div class="k-val">' + val + "</div><div class='k-sub'>" + esc(sub) + "</div></div>";
  }

  window.Analytics = Analytics;
  window.Dashboard = Dashboard;
})();
