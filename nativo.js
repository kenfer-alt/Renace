// 🔌 nativo.js - conecta la app con Android (plugin "Renace"). Fuera de Android usa un teléfono de mentira (demo).
(function () {
  var RN = (window.RN = window.RN || {});
  var U = RN.u;
  var esNativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  RN.esNativo = esNativo;
  var N = (RN.nativo = {});

  var METODOS = ["permisos", "pedirPermisoArchivos", "pedirPermisoUso", "espacio", "cancelar", "listar", "buscar", "escanear", "duplicados",
    "resumen", "abrirArchivo", "moverAPapelera", "listarPapelera", "restaurar", "vaciarPapelera", "mover", "listarApps", "desinstalarApp", "existeApp", "dictar"];

  if (esNativo) {
    var P = window.Capacitor.Plugins.Renace;
    METODOS.forEach(function (m) { N[m] = function (args) { return P[m](args || {}); }; });
    N.alProgreso = function (cb) { P.addListener("progreso", cb); };
    N.miniatura = function (ruta) { return window.Capacitor.convertFileSrc("file://" + ruta); };
    return;
  }


  // ======================= MODO TERMUX (servidor local con tus archivos reales) =======================
  var token = null;
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get("t")) sessionStorage.setItem("renace_t", qs.get("t"));
    token = sessionStorage.getItem("renace_t");
  } catch (e) { token = null; }
  var esTermux = false;
  if (token) {
    try { var xp = new XMLHttpRequest(); xp.open("GET", "/api/ping", false); xp.setRequestHeader("x-renace", token); xp.send(); esTermux = xp.status === 200; } catch (e) { esTermux = false; }
  }
  if (esTermux) {
    RN.modo = "termux";
    var cbP = function () {}, activos = 0, reloj = null;
    var llamar = function (m, args) {
      var largo = ["escanear", "duplicados", "buscar"].indexOf(m) >= 0;
      if (largo) {
        activos++;
        if (!reloj) reloj = setInterval(function () { fetch("/api/progreso", { headers: { "x-renace": token } }).then(function (r) { return r.json(); }).then(function (p) { cbP(p); }).catch(function () {}); }, 600);
      }
      return fetch("/api/" + m, { method: "POST", headers: { "x-renace": token, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error"); return j; }); })
        .finally(function () { if (largo) { activos--; if (!activos && reloj) { clearInterval(reloj); reloj = null; } } });
    };
    METODOS.forEach(function (m) { N[m] = function (a) { return llamar(m, a); }; });
    N.alProgreso = function (cb) { cbP = cb; };
    N.miniatura = function (ruta) { return "/archivo?ruta=" + encodeURIComponent(ruta) + "&t=" + token; };
    return;
  }

  // ======================= MODO DEMOSTRACIÓN =======================
  var DIA = 86400000, MB = 1048576, GB = 1073741824;
  var BASE = "/storage/emulated/0";
  var demo = (RN.demo = { permisos: { archivos: true, usoApps: true }, dictado: "", abiertos: [], desinstaladas: [], liberado: 0 });

  function F(rel, tam, dias, extra) {
    return Object.assign({ ruta: BASE + "/" + rel, nombre: rel.split("/").pop(), tam: tam, fecha: Date.now() - dias * DIA }, extra || {});
  }
  var fsd = [
    F("Download/informe_final.pdf", 2.1 * MB, 120, { extra: { paginas: 12 } }),
    F("Download/contrato_alquiler.pdf", 410 * 1024, 300, { extra: { paginas: 4 } }),
    F("Download/foto_familia.jpg", 4.2 * MB, 200, { hash: "fam", extra: { ancho: 3000, alto: 4000 } }),
    F("Download/foto_familia (1).jpg", 4.2 * MB, 190, { hash: "fam", extra: { ancho: 3000, alto: 4000 } }),
    F("Download/video_whatsapp.mp4", 212 * MB, 80, { extra: { duracionMs: 95000, ancho: 1280, alto: 720 } }),
    F("Download/pelicula.mkv", 1.4 * GB, 400, { extra: { duracionMs: 6300000, ancho: 1920, alto: 1080 } }),
    F("Download/instalador_juego.apk", 45 * MB, 500, { extra: { nombre: "Juego Viejo", paquete: "com.juego.viejo", version: "1.2", instalada: false } }),
    F("Download/notas.txt", 2048, 15, { texto: "Lista de mercado: arroz, huevos, leche, pan.\nRecordar pagar la factura de la luz antes del viernes.\nLlamar a la tía Marta el domingo.\n" }),
    F("Download/tarea_ciencias.docx", 80 * 1024, 60, { texto: "La fotosíntesis es el proceso mediante el cual las plantas convierten la luz del sol en energía.\nLas plantas necesitan agua, luz y dióxido de carbono.\nEl resultado es glucosa y oxígeno.\n" }),
    F("Download/temporal.tmp", 3 * MB, 30),
    F("Download/descarga.crdownload", 12 * MB, 10),
    F("DCIM/Camera/IMG_0001.jpg", 6.1 * MB, 100, { hash: "img1", extra: { ancho: 4000, alto: 3000, tomada: "2025:06:01 10:20:00", camara: "Redmi" } }),
    F("DCIM/Camera/IMG_0002.jpg", 7.4 * MB, 90, { extra: { ancho: 4000, alto: 3000 } }),
    F("DCIM/Camera/IMG_0003.jpg", 2.2 * MB, 40, { extra: { ancho: 2000, alto: 1500 } }),
    F("DCIM/Camera/IMG_0004.jpg", 8.8 * MB, 20, { extra: { ancho: 4000, alto: 3000 } }),
    F("DCIM/Camera/VID_0001.mp4", 520 * MB, 70, { extra: { duracionMs: 200000, ancho: 1920, alto: 1080 } }),
    F("DCIM/.thumbnails/.thumbdata3--1967290299", 80 * MB, 300),
    F("Pictures/IMG_0001.jpg", 6.1 * MB, 100, { hash: "img1", extra: { ancho: 4000, alto: 3000 } }),
    F("Pictures/Screenshots/captura_1.png", 1.1 * MB, 12, { extra: { ancho: 720, alto: 1560 } }),
    F("Music/cancion.mp3", 8.3 * MB, 600, { hash: "mus", extra: { duracionMs: 210000, titulo: "Mi canción" } }),
    F("Music/cancion copia.mp3", 8.3 * MB, 590, { hash: "mus", extra: { duracionMs: 210000, titulo: "Mi canción" } }),
    F("Movies/clase_grabada.mp4", 305 * MB, 150, { extra: { duracionMs: 3400000, ancho: 1280, alto: 720 } }),
    F("Documents/cuentas_hogar.xlsx", 64 * 1024, 20, { texto: "Mes\nIngresos\nGastos\nEnero\nFebrero\nArriendo\nMercado\nServicios públicos\n" }),
    F("Documents/cedula_scan.jpg", 1.9 * MB, 700, { extra: { ancho: 1600, alto: 1000 } }),
    F("WhatsApp/Media/WhatsApp Video/VID-2024-video1.mp4", 120 * MB, 45, { extra: { duracionMs: 60000, ancho: 640, alto: 360 } }),
    F("WhatsApp/Media/WhatsApp Video/VID-2023-video2.mp4", 96 * MB, 500, { extra: { duracionMs: 50000, ancho: 640, alto: 360 } }),
    F("WhatsApp/Media/WhatsApp Images/IMG-2023-foto.jpg", 5.5 * MB, 450, { extra: { ancho: 3000, alto: 2000 } }),
  ];
  var vacias = [BASE + "/Download/vacia", BASE + "/Pictures/Viejas"];
  var papelera = [];
  var apps = [
    { paquete: "com.juego.pesado", nombre: "Super Juego 3D", instaladoEn: Date.now() - 400 * DIA, ultimoUso: Date.now() - 200 * DIA, tam: 1.2 * GB },
    { paquete: "com.whatsapp", nombre: "WhatsApp", instaladoEn: Date.now() - 900 * DIA, ultimoUso: Date.now() - 0.1 * DIA, tam: 350 * MB },
    { paquete: "com.editor.video", nombre: "Editor de Video", instaladoEn: Date.now() - 300 * DIA, ultimoUso: Date.now() - 95 * DIA, tam: 410 * MB },
    { paquete: "com.tienda.x", nombre: "Tienda X", instaladoEn: Date.now() - 250 * DIA, ultimoUso: 0, tam: 120 * MB },
    { paquete: "com.linterna", nombre: "Linterna", instaladoEn: Date.now() - 800 * DIA, ultimoUso: Date.now() - 30 * DIA, tam: 8 * MB },
    { paquete: "com.banco", nombre: "Mi Banco", instaladoEn: Date.now() - 500 * DIA, ultimoUso: Date.now() - 5 * DIA, tam: 90 * MB },
    { paquete: "com.radio.fm", nombre: "Radio FM", instaladoEn: Date.now() - 700 * DIA, ultimoUso: Date.now() - 310 * DIA, tam: 40 * MB },
    { paquete: "com.red.social", nombre: "Red Social", instaladoEn: Date.now() - 600 * DIA, ultimoUso: Date.now() - 3 * DIA, tam: 420 * MB },
  ];
  var cbProgreso = function () {};
  var T = function (v, ms) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, ms == null ? 30 : ms); }); };
  var copia = function (o) { return JSON.parse(JSON.stringify(o)); };
  var item = function (x) { return { ruta: x.ruta, nombre: x.nombre, tam: x.tam, fecha: x.fecha, dir: false }; };
  var dentro = function (x, raices) { return !raices || !raices.length || raices.some(function (r) { return x.ruta.indexOf(r.replace(/\/$/, "") + "/") === 0; }); };
  var top = function (l, n) { return l.sort(function (a, b) { return b.tam - a.tam; }).slice(0, n || 150).map(item); };

  N.alProgreso = function (cb) { cbProgreso = cb; };
  N.miniatura = function () { return ""; };
  N.permisos = function () { return T({ archivos: demo.permisos.archivos, usoApps: demo.permisos.usoApps, sdk: 34, modelo: "Demo", android: "14" }); };
  N.pedirPermisoArchivos = function () { demo.permisos.archivos = true; return T({}); };
  N.pedirPermisoUso = function () { demo.permisos.usoApps = true; return T({}); };
  N.cancelar = function () { return T({}); };
  N.espacio = function () { return T({ total: 32 * GB, libre: 2.1 * GB + demo.liberado, base: BASE, ramTotal: 3 * GB, ramLibre: 0.7 * GB }); };
  N.listar = function (a) {
    var ruta = String(a.ruta || BASE).replace(/\/$/, ""), vistos = {}, out = [];
    fsd.forEach(function (x) {
      if (x.ruta.indexOf(ruta + "/") !== 0) return;
      var resto = x.ruta.slice(ruta.length + 1);
      if (resto.indexOf("/") < 0) out.push(item(x));
      else { var d = resto.split("/")[0]; if (!vistos[d]) { vistos[d] = 1; out.push({ ruta: ruta + "/" + d, nombre: d, tam: 0, fecha: Date.now(), dir: true }); } }
    });
    return T({ ruta: ruta, archivos: out });
  };
  N.buscar = function (a) {
    var terms = U.norm(a.nombre || "").split(/\s+/).filter(Boolean), exts = a.extensiones || [], res = [];
    fsd.forEach(function (x) {
      if (!dentro(x, a.raices)) return;
      if (exts.length && exts.indexOf(U.ext(x.nombre)) < 0) return;
      if (a.minTam && x.tam < a.minTam) return;
      if (a.maxTam && x.tam > a.maxTam) return;
      if (a.desde && x.fecha < a.desde) return;
      if (a.hasta && x.fecha > a.hasta) return;
      var n = U.norm(x.nombre);
      for (var i = 0; i < terms.length; i++) if (n.indexOf(terms[i]) < 0) return;
      res.push(x);
    });
    res.sort(function (p, q) { return q.fecha - p.fecha; });
    var max = a.max || 400;
    return T({ archivos: res.slice(0, max).map(item), revisados: fsd.length, coincidencias: res.length, truncado: res.length > max });
  };
  N.escanear = function (a) {
    var minG = a.minGrande || 50 * MB, minF = a.minFoto || 5 * MB;
    var g = [], f = [], ap = [], tmp = [], mini = { cantidad: 0, tam: 0, muestras: [] };
    fsd.forEach(function (x) {
      if (!dentro(x, a.raices)) return;
      var e = U.ext(x.nombre);
      if (x.ruta.indexOf("/.thumbnails/") >= 0) { mini.cantidad++; mini.tam += x.tam; mini.muestras.push(item(x)); }
      else if (e === "apk") ap.push(x);
      else if (["tmp", "temp", "bak", "crdownload", "part"].indexOf(e) >= 0) tmp.push(x);
      else if (U.CAT.imagen.indexOf(e) >= 0 && x.tam >= minF) f.push(x);
      else if (x.tam >= minG) g.push(x);
    });
    cbProgreso({ archivos: fsd.length, ruta: BASE, fase: "escaneando" });
    return T({ grandes: top(g), fotos: top(f), apks: top(ap), temporales: top(tmp), carpetasVacias: vacias.map(function (r) { return { ruta: r, nombre: r.split("/").pop(), tam: 0, fecha: Date.now(), dir: true }; }), totalVacias: vacias.length, miniaturas: mini, totalArchivos: fsd.length, totalBytes: fsd.reduce(function (s, x) { return s + x.tam; }, 0), cancelado: false }, 200);
  };
  N.duplicados = function (a) {
    var por = {};
    fsd.forEach(function (x) { if (x.hash && dentro(x, a.raices) && x.tam >= (a.minTam || 0)) (por[x.hash] = por[x.hash] || []).push(x); });
    var grupos = [], total = 0;
    Object.keys(por).forEach(function (h) {
      var l = por[h]; if (l.length < 2) return;
      l.sort(function (p, q) { return p.fecha - q.fecha; });
      var rec = l[0].tam * (l.length - 1); total += rec;
      grupos.push({ tam: l[0].tam, parcial: false, archivos: l.map(item), recuperable: rec });
    });
    grupos.sort(function (p, q) { return q.recuperable - p.recuperable; });
    cbProgreso({ archivos: fsd.length, ruta: BASE, fase: "comparando" });
    return T({ grupos: grupos, totalGrupos: grupos.length, recuperable: total, revisados: fsd.length, cancelado: false }, 200);
  };
  N.resumen = function (a) {
    var x = fsd.filter(function (y) { return y.ruta === a.ruta; })[0];
    if (!x) return Promise.reject(new Error("El archivo ya no existe."));
    var cat = U.categoria(x.nombre), e = U.ext(x.nombre);
    var tipo = x.texto ? (["docx", "xlsx", "pptx"].indexOf(e) >= 0 ? "documento" : "texto") : e === "pdf" ? "pdf" : cat === "imagen" ? "imagen" : cat === "video" ? "video" : cat === "audio" ? "audio" : e === "apk" ? "apk" : "otro";
    return T({ tam: x.tam, fecha: x.fecha, tipo: tipo, texto: x.texto || "", extra: copia(x.extra || {}) });
  };
  N.abrirArchivo = function (a) { demo.abiertos.push(a.ruta); return T({}); };
  N.moverAPapelera = function (a) {
    var movidos = [], fallos = [], bytes = 0;
    (a.rutas || []).forEach(function (r, i) {
      var k = -1;
      fsd.forEach(function (x, j) { if (x.ruta === r) k = j; });
      if (k < 0) { var v = vacias.indexOf(r); if (v >= 0) { vacias.splice(v, 1); movidos.push(r); } else fallos.push({ ruta: r, motivo: "ya no existe" }); return; }
      var x = fsd.splice(k, 1)[0];
      papelera.push({ id: Date.now() + "_" + i + "_" + papelera.length, nombre: x.nombre, original: x.ruta, destino: BASE + "/Renace/Papelera/" + x.nombre, tam: x.tam, borradoEn: Date.now(), _x: x });
      movidos.push(r); bytes += x.tam;
    });
    return T({ movidos: movidos, fallos: fallos, bytes: bytes });
  };
  N.listarPapelera = function () {
    return T({ items: papelera.map(function (p) { return { id: p.id, nombre: p.nombre, original: p.original, destino: p.destino, tam: p.tam, borradoEn: p.borradoEn }; }), bytes: papelera.reduce(function (s, p) { return s + p.tam; }, 0) });
  };
  N.restaurar = function (a) {
    var n = 0;
    papelera = papelera.filter(function (p) { if (a.ids.indexOf(p.id) >= 0) { fsd.push(p._x); n++; return false; } return true; });
    return T({ restaurados: n });
  };
  N.vaciarPapelera = function (a) {
    var limite = Date.now() - 7 * DIA, bytes = 0, n = 0;
    papelera = papelera.filter(function (p) {
      var borrar = a.ids ? a.ids.indexOf(p.id) >= 0 : (!a.soloVencidos || p.borradoEn < limite);
      if (borrar) { bytes += p.tam; n++; }
      return !borrar;
    });
    demo.liberado += bytes;
    return T({ borrados: n, bytes: bytes });
  };
  N.mover = function (a) {
    var hechos = [];
    (a.movimientos || []).forEach(function (m) { fsd.forEach(function (x) { if (x.ruta === m.de) { x.ruta = m.a; hechos.push({ de: m.de, a: m.a }); } }); });
    return T({ movidos: hechos, fallos: [] });
  };
  N.listarApps = function () {
    var uso = demo.permisos.usoApps;
    return T({ usoPermitido: uso, apps: apps.map(function (x) { var o = copia(x); if (!uso) o.ultimoUso = -1; return o; }) });
  };
  N.desinstalarApp = function (a) { demo.desinstaladas.push(a.paquete); apps = apps.filter(function (x) { return x.paquete !== a.paquete; }); return T({}); };
  N.existeApp = function (a) { return T({ existe: apps.some(function (x) { return x.paquete === a.paquete; }) }); };
  N.dictar = function () { return T({ texto: demo.dictado }); };
})();
