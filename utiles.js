// 🧰 utiles.js - formatos sencillos para personas que no entienden de números
(function () {
  var RN = (window.RN = window.RN || {});
  var U = (RN.u = {});

  U.num = function (n, dec) {
    return Number(n).toLocaleString("es", { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 1 : dec });
  };
  U.tam = function (b) {
    b = Number(b) || 0;
    if (b >= 1073741824) return U.num(b / 1073741824, 1) + " GB";
    if (b >= 1048576) return U.num(b / 1048576, b >= 104857600 ? 0 : 1) + " MB";
    if (b >= 1024) return U.num(b / 1024, 0) + " KB";
    return b + " bytes";
  };
  U.hace = function (ts) {
    if (!ts || ts < 0) return "";
    var d = (Date.now() - ts) / 86400000;
    if (d < 1) return "hoy";
    if (d < 2) return "ayer";
    if (d < 14) return "hace " + Math.floor(d) + " días";
    if (d < 60) return "hace " + Math.floor(d / 7) + " semanas";
    if (d < 700) return "hace " + Math.floor(d / 30) + " meses";
    return "hace " + Math.floor(d / 365) + " años";
  };
  U.dias = function (ts) { return (Date.now() - ts) / 86400000; };
  U.fecha = function (ts) {
    if (!ts) return "";
    var f = new Date(ts);
    return f.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  };
  U.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  U.norm = function (s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };
  U.id = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  U.ext = function (nombre) {
    var i = String(nombre).lastIndexOf(".");
    return i < 0 ? "" : String(nombre).slice(i + 1).toLowerCase();
  };
  U.carpetaDe = function (ruta) { return ruta.slice(0, ruta.lastIndexOf("/")); };
  U.acortar = function (ruta, base) {
    var r = String(ruta);
    if (base && r.indexOf(base) === 0) r = r.slice(base.length).replace(/^\//, "");
    return r;
  };
  U.dur = function (ms) {
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m > 0 ? m + " min " + (s % 60) + " s" : s + " s";
  };

  // categorías de archivos (por extensión)
  var CAT = {
    imagen: "jpg jpeg png webp gif heic heif bmp".split(" "),
    video: "mp4 mkv 3gp avi mov webm m4v".split(" "),
    audio: "mp3 m4a ogg wav aac opus flac amr".split(" "),
    documento: "pdf doc docx xls xlsx ppt pptx txt odt ods odp csv rtf vcf".split(" "),
    instalador: ["apk"],
    comprimido: "zip rar 7z tar gz".split(" "),
  };
  U.CAT = CAT;
  U.categoria = function (nombre) {
    var e = U.ext(nombre);
    for (var k in CAT) if (CAT[k].indexOf(e) >= 0) return k;
    return "otro";
  };
  U.ICONO = { imagen: "🖼️", video: "🎬", audio: "🎵", documento: "📄", instalador: "📦", comprimido: "🗜️", otro: "📁", carpeta: "📂" };
  U.NOMBRE_CAT = { imagen: "Fotos e imágenes", video: "Videos", audio: "Audios y música", documento: "Documentos", instalador: "Instaladores (APK)", comprimido: "Comprimidos", otro: "Otros" };

  // documentos importantes: protegidos de entrada (solo se borran con doble confirmación)
  var PROTEGIDAS = "pdf doc docx xls xlsx ppt pptx odt ods odp vcf key pem kdbx p12 pfx".split(" ");
  U.esDocumentoImportante = function (nombre) { return PROTEGIDAS.indexOf(U.ext(nombre)) >= 0; };
})();
