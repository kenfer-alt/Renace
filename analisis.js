// 🔤 analisis.js - Analización de pedidos
// Lee el mensaje COMPLETO, palabra por palabra: qué acción pide, en qué carpetas, de qué tipo, de qué tamaño, de qué fecha,
// qué debe EXCLUIR, y si trae varias peticiones juntas las separa.
(function () {
  var RN = (window.RN = window.RN || {});
  var U = RN.u;
  var A = (RN.analisis = {});
  var DIA = 86400000;

  var CARPETAS = {
    descargas: ["Download"], download: ["Download"], downloads: ["Download"], descargados: ["Download"],
    camara: ["DCIM/Camera"], camera: ["DCIM/Camera"], dcim: ["DCIM"], galeria: ["DCIM", "Pictures"],
    capturas: ["Pictures/Screenshots", "DCIM/Screenshots"], pantallazos: ["Pictures/Screenshots", "DCIM/Screenshots"], screenshots: ["Pictures/Screenshots", "DCIM/Screenshots"],
    whatsapp: ["WhatsApp", "Android/media/com.whatsapp/WhatsApp"], telegram: ["Telegram", "Android/media/org.telegram.messenger"],
    pictures: ["Pictures"], movies: ["Movies"], music: ["Music"], documents: ["Documents"],
  };
  var TODO = ["todo", "telefono", "celular", "memoria", "almacenamiento", "movil"];
  var TIPOS = {
    foto: "imagen", fotos: "imagen", imagen: "imagen", imagenes: "imagen", fotografia: "imagen", fotografias: "imagen",
    video: "video", videos: "video", pelicula: "video", peliculas: "video", clips: "video",
    audio: "audio", audios: "audio", musica: "audio", cancion: "audio", canciones: "audio",
    documento: "documento", documentos: "documento", apk: "instalador", apks: "instalador", instalador: "instalador", instaladores: "instalador",
    comprimido: "comprimido", comprimidos: "comprimido",
  };
  var EXTS = { pdf: ["pdf"], pdfs: ["pdf"], word: ["doc", "docx"], excel: ["xls", "xlsx"], zip: ["zip"], rar: ["rar"], txt: ["txt"], mp3: ["mp3"], mp4: ["mp4"], jpg: ["jpg", "jpeg"], png: ["png"] };
  var EXCEPCIONES = ["excepto", "salvo", "exceptuando", "menos", "aparte"];
  var RELLENO = new Set(("el la los las un una unos unas de del al a en con por para sobre mi mis tu tus me te se lo le les que y o u ni este esta estos estas ese esa esos esas " +
    "todo toda todos todas mas muy tambien quiero quisiera puedes podrias favor porfa hola oye ahora aqui alli donde cual cuales como cuando quien es son hay tengo tiene " +
    "estan esta estoy dame damela muestrame ensename necesito que quedan quedo guarde deje").split(" "));
  var ACCIONES = /^(busca\w*|encuentra\w*|encuentrame|borra\w*|elimina\w*|quita\w*|suprime\w*|organiza\w*|ordena\w*|clasifica\w*|acomoda\w*|agrupa\w*|muestra\w*|ensena\w*|lista\w*|limpi\w*|libera\w*|liberar|optimiza\w*|localiza\w*|ver|abre|deshazte|renace|renacer)$/;

  var INTENCIONES = [
    ["saludo", /^(hola|holi|buenas|buenos dias|buen dia|hey|ey|que tal|saludos|gracias)\b/],
    ["ayuda", /\b(ayuda|ayudame|que puedes hacer|que sabes hacer|como funciona|como te uso|instrucciones)\b/],
    ["papelera", /\b(papelera|restaurar|recuperar|vaciar)\b/],
    ["duplicados", /\b(duplicad\w*|repetid\w*|copias|iguales)\b/],
    ["apps", /\b(app|apps|aplicacion|aplicaciones|programas)\b/],
    ["espacio", /\b(espacio|cuanto me queda|cuanto queda|llena|lleno|capacidad|memoria libre)\b/],
  ];
  var UNIDAD = { dia: DIA, dias: DIA, semana: 7 * DIA, semanas: 7 * DIA, mes: 30 * DIA, meses: 30 * DIA, ano: 365 * DIA, anos: 365 * DIA };

  function inicioDia() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function inicioMes() { var d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function inicioAnio(a) { return new Date(a, 0, 1).getTime(); }

  // lee lo que dice una frase sobre carpetas, tipos, tamaño y fecha
  function leerFiltros(n, original) {
    var f = { carpetas: [], todo: false, exts: [], cats: [], minTam: 0, maxTam: 0, desde: 0, hasta: 0, nombres: [] };
    var palabras = n.split(/\s+/).filter(Boolean);
    palabras.forEach(function (w) {
      if (CARPETAS[w]) CARPETAS[w].forEach(function (c) { if (f.carpetas.indexOf(c) < 0) f.carpetas.push(c); });
      if (TODO.indexOf(w) >= 0) f.todo = true;
      if (TIPOS[w] && f.cats.indexOf(TIPOS[w]) < 0) f.cats.push(TIPOS[w]);
      if (EXTS[w]) EXTS[w].forEach(function (e) { if (f.exts.indexOf(e) < 0) f.exts.push(e); });
    });
    f.cats.forEach(function (c) { U.CAT[c].forEach(function (e) { if (f.exts.indexOf(e) < 0) f.exts.push(e); }); });

    // tamaño: "más de 100 MB", "menos de 2 gigas"
    var m = n.match(/(\d+(?:[.,]\d+)?)\s*(gb|gigas?|giga|mb|megas?|mega|kb)\b/);
    if (m) {
      var v = parseFloat(m[1].replace(",", ".")), u = m[2];
      var bytes = /^(g)/.test(u) ? v * 1073741824 : /^(m)/.test(u) ? v * 1048576 : v * 1024;
      var antes = n.slice(Math.max(0, m.index - 22), m.index);
      if (/(menos de|menor(es)? (de|a|que)|pesen menos|inferior(es)? a)/.test(antes)) f.maxTam = bytes; else f.minTam = bytes;
    }
    // fechas
    var t;
    if (/de este mes|del mes actual/.test(n)) f.desde = inicioMes();
    else if (/de esta semana/.test(n)) f.desde = Date.now() - 7 * DIA;
    else if (/\bde hoy\b/.test(n)) f.desde = inicioDia();
    else if (/del ano pasado/.test(n)) { var a = new Date().getFullYear(); f.desde = inicioAnio(a - 1); f.hasta = inicioAnio(a); }
    else if (/de este ano/.test(n)) f.desde = inicioAnio(new Date().getFullYear());
    if ((t = n.match(/ultimos? (\d+) (dias|semanas|meses|anos)/))) f.desde = Date.now() - parseInt(t[1], 10) * UNIDAD[t[2]];
    if ((t = n.match(/mas de (\d+) (dias|semanas|meses|anos)/))) f.hasta = Date.now() - parseInt(t[1], 10) * UNIDAD[t[2]];
    if ((t = n.match(/antes de (?:el )?(\d{4})/))) f.hasta = inicioAnio(parseInt(t[1], 10));
    if ((t = n.match(/despues de (?:el )?(\d{4})/))) f.desde = inicioAnio(parseInt(t[1], 10) + 1);
    if ((t = n.match(/\b(?:en|del?|durante) (?:el )?(?:ano )?(20\d{2}|19\d{2})\b/)) && !f.desde && !f.hasta) { f.desde = inicioAnio(parseInt(t[1], 10)); f.hasta = inicioAnio(parseInt(t[1], 10) + 1); }
    if (/\b(antiguos|viejos|viejas|antiguas|de hace tiempo)\b/.test(n) && !f.hasta) f.hasta = Date.now() - 180 * DIA;
    if (/\b(recientes|nuevos|nuevas)\b/.test(n) && !f.desde) f.desde = Date.now() - 30 * DIA;
    // nombres entre comillas
    var q, re = /["“«]([^"”»]+)["”»]/g;
    while ((q = re.exec(original))) f.nombres.push(q[1].trim());
    return f;
  }

  function analizarParte(texto) {
    var original = texto.trim();
    var n = U.norm(original).replace(/[¿?¡!.,;:()]/g, " ").replace(/\s+/g, " ").trim();

    // 1) lo que se EXCLUYE ("excepto los de este mes")
    var excluir = null, principal = n, corte = -1, palabraExc = "";
    var palabras0 = n.split(" ");
    for (var i = 0; i < palabras0.length; i++) {
      var w = palabras0[i];
      var esExc = EXCEPCIONES.indexOf(w) >= 0 && i > 0 || (w === "sin" && palabras0[i + 1] === "contar") || (w === "pero" && palabras0[i + 1] === "no");
      if (esExc) { corte = i; palabraExc = w; break; }
    }
    if (corte >= 0) {
      principal = palabras0.slice(0, corte).join(" ");
      var resto = palabras0.slice(corte + 1).join(" ");
      var fe = leerFiltros(resto, "");
      excluir = { carpetas: fe.carpetas, exts: fe.exts, cats: fe.cats, desde: fe.desde, hasta: fe.hasta, texto: palabraExc + " " + resto };
    }
    var f = leerFiltros(principal, original);

    // 2) acción
    var intencion = null;
    for (var k = 0; k < INTENCIONES.length; k++) if (INTENCIONES[k][1].test(principal)) { intencion = INTENCIONES[k][0]; break; }
    if (intencion === "saludo" && principal.split(" ").length > 4) intencion = null;
    var hayFiltros = f.carpetas.length || f.cats.length || f.exts.length || f.minTam || f.maxTam || f.desde || f.hasta;
    if (intencion === "espacio" && /\b(ocupan?|pesan?)\b/.test(principal) && hayFiltros) intencion = null;
    if (!intencion) {
      var verbBorrar = /\b(borra\w*|elimina\w*|quita\w*|suprime\w*|deshazte)\b/.test(principal);
      var verbLimpiar = /\b(limpi\w*|libera\w*|liberar)\b/.test(principal);
      if (verbBorrar || (verbLimpiar && hayFiltros)) intencion = "borrar";
      else if (/\b(organiza\w*|ordena\w*|clasifica\w*|acomoda\w*|agrupa\w*)\b/.test(principal)) intencion = "organizar";
      else if (/\b(busca\w*|encuentra\w*|encuentrame|localiza\w*|perdi|no encuentro)\b/.test(principal) || /\bdonde (esta|estan|guarde|deje|quedo|quedaron)\b/.test(principal)) intencion = "buscar";
      else if (/\b(muestra\w*|ensena\w*|lista\w*|ver|que hay|que tengo|enumera|abre|dame)\b/.test(principal) && hayFiltros) intencion = "mostrar";
      else if (/\b(basura|temporal\w*|miniatura\w*|chatarra|cache|carpetas vacias|inutiles)\b/.test(principal)) intencion = "basura";
      else if (/\b(grande|grandes|pesad\w*|pesan|ocupan?|gigante\w*)\b/.test(principal)) intencion = "grandes";
      else if (/\b(limpi\w*|libera\w*|liberar|renace|renacer|acelera\w*|fluido|lento|lenta|trabad\w*|optimiza\w*|mejora\w*)\b/.test(principal)) intencion = "limpiar";
      else if (hayFiltros) intencion = "mostrar";
    }

    // 3) clasificación de CADA palabra (para "Ver análisis")
    var clas = [], nombresSueltos = [];
    original.split(/\s+/).forEach(function (raw) {
      var w = U.norm(raw).replace(/[¿?¡!.,;:()"«»“”]/g, "");
      if (!w) return;
      var t = "otra";
      if (EXCEPCIONES.indexOf(w) >= 0 && corte >= 0) t = "excepción";
      else if (CARPETAS[w]) t = "carpeta";
      else if (TODO.indexOf(w) >= 0) t = "todo el teléfono";
      else if (TIPOS[w] || EXTS[w]) t = "tipo de archivo";
      else if (/^\d+([.,]\d+)?$/.test(w) || /^(gb|mb|kb|gigas?|megas?)$/.test(w)) t = "tamaño/número";
      else if (/^(dias?|semanas?|meses|mes|anos?|ano|hoy|ayer|antes|despues|ultimos?|recientes|viejos|viejas|antiguos|antiguas)$/.test(w)) t = "fecha";
      else if (ACCIONES.test(w)) t = "acción";
      else if (/^(duplicad\w*|repetid\w*|apps?|aplicaciones?|papelera|espacio|grandes?|pesad\w*|basura|temporal\w*)$/.test(w)) t = "tema";
      else if (RELLENO.has(w) || w.length <= 2 || /^(mas|menos|de|que)$/.test(w)) t = "enlace";
      else { t = "nombre"; nombresSueltos.push(raw.replace(/[¿?¡!.,;:()"«»“”]/g, "")); }
      clas.push({ w: raw.replace(/[¿?¡!.,;:()]/g, ""), t: t });
    });
    var nombre = f.nombres.length ? f.nombres.join(" ") : "";
    if (!nombre && (intencion === "buscar" || intencion === "borrar" || intencion === "mostrar")) {
      nombre = nombresSueltos.filter(function (w) { return !/^(archivos?|cosas|todo|cualquier|llamad\w*|nombre)$/i.test(U.norm(w)); }).join(" ");
    }
    var sinEntender = [];
    if (!intencion) sinEntender = nombresSueltos.slice();
    var total = clas.length || 1, ok = clas.filter(function (c) { return c.t !== "nombre" || !!nombre || intencion; }).length;

    return {
      texto: original, intencion: intencion, carpetas: f.carpetas, todo: f.todo || (!f.carpetas.length), exts: f.exts, cats: f.cats,
      nombre: nombre, minTam: f.minTam, maxTam: f.maxTam, desde: f.desde, hasta: f.hasta, excluir: excluir,
      palabras: clas, sinEntender: sinEntender, cobertura: Math.round((100 * ok) / total),
    };
  }

  // separa varias peticiones: "Organízame Descargas y búscame mis fotos. ¿Cuánto espacio me queda?"
  var CORTE = /\s+y\s+(?=(?:busca|encuentra|borra|elimina|organiza|ordena|muestra|ensena|dame|dime|abre|limpia|libera|renace|cuanto|que|donde)\w*)/i;
  A.partes = function (texto) {
    var trozos = String(texto).replace(/\s*\n+\s*/g, ". ").split(/(?<=[.?!])\s+/).filter(Boolean);
    var out = [];
    trozos.forEach(function (t) {
      var sinAcentos = U.norm(t);
      var trozo = t;
      if (CORTE.test(sinAcentos)) {
        // se corta sobre el texto original en la misma posición
        var m = sinAcentos.match(CORTE);
        out.push(t.slice(0, m.index), t.slice(m.index + m[0].length));
      } else out.push(trozo);
    });
    var partes = out.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 1; });
    return partes.length ? partes : [String(texto).trim()];
  };
  A.analizar = function (texto) {
    return A.partes(texto).map(analizarParte);
  };
  A.una = analizarParte;

  // lo que la persona entiende: "Descargas · videos · más de 100 MB · de este mes · excepto ..."
  A.describir = function (q) {
    var l = [];
    if (q.carpetas.length) l.push("Carpeta: " + q.carpetas.join(", "));
    if (q.cats.length) l.push("Tipo: " + q.cats.map(function (c) { return U.NOMBRE_CAT[c] || c; }).join(", "));
    if (q.nombre) l.push("Nombre: «" + q.nombre + "»");
    if (q.minTam) l.push("Pesan más de " + U.tam(q.minTam));
    if (q.maxTam) l.push("Pesan menos de " + U.tam(q.maxTam));
    if (q.desde) l.push("Desde " + U.fecha(q.desde));
    if (q.hasta) l.push("Hasta " + U.fecha(q.hasta));
    if (q.excluir) l.push("Excepto: " + q.excluir.texto.replace(/^\S+\s*/, ""));
    return l;
  };
})();
