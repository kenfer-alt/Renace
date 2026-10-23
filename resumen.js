// 📄 resumen.js - "Resumen del archivo": qué tiene adentro y si parece importante
(function () {
  var RN = (window.RN = window.RN || {});
  var U = RN.u;
  var R = (RN.resumen = {});

  var FUERTE = /(contrasena|password|cedula|pasaporte|contrato|testamento|escritura|clave privada|token|frase de recuperacion|diploma|historia clinica|licencia|tarjeta)/g;
  var MEDIA = /(factura|recibo|banco|cuenta|certificado|seguro|nomina|declaracion|impuesto|pago|credencial|matricula|hoja de vida|curriculum|examen|resultado|respaldo|backup)/g;
  var STOP = new Set("de la el los las un una unos unas y o u en con por para que se lo le les su sus mi mis tu tus al del es son fue ser esta este estos estas como mas muy pero si no ya hay the and for with".split(" "));

  function claves(texto) {
    var cont = {};
    U.norm(texto).split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)) cont[w] = (cont[w] || 0) + 1; });
    return Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).slice(0, 6);
  }
  function primerasLineas(texto, n) {
    return texto.split(/\n+/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(function (l) { return l.length > 12; }).slice(0, n);
  }
  function unicos(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // arch: {nombre, ruta, tam, fecha}  ·  info: lo que devuelve el plugin nativo (tipo, texto, extra)
  R.resumir = function (arch, info) {
    var tipo = info.tipo || "otro", x = info.extra || {}, texto = info.texto || "", lineas = [], cl = [];
    if (tipo === "texto" || tipo === "documento") {
      var palabras = texto.split(/\s+/).filter(Boolean).length;
      lineas.push((tipo === "documento" ? "Documento de Office" : "Archivo de texto") + " con unas " + U.num(palabras, 0) + " palabras.");
      var pl = primerasLineas(texto, 3);
      if (pl.length) lineas.push("Empieza así: «" + pl.join(" / ").slice(0, 260) + "»");
      cl = claves(texto);
      if (cl.length) lineas.push("Habla sobre: " + cl.join(", ") + ".");
      if (x.diapositivas) lineas.push("Presentación de " + x.diapositivas + " diapositivas.");
      if (!texto.trim()) lineas.push("No pude leer su contenido: ábrelo con «Ver archivo» para revisarlo.");
    } else if (tipo === "pdf") {
      lineas.push("PDF" + (x.paginas ? " de " + x.paginas + " páginas" : "") + (x.protegido ? " (protegido con contraseña)" : "") + ".");
      lineas.push("Todavía no puedo leer el texto de los PDF. Ábrelo con «Ver archivo» para saber qué es.");
    } else if (tipo === "comprimido") {
      lineas.push("Archivo comprimido con " + (x.entradas || "?") + " archivos adentro.");
      var nombres = primerasLineas(texto || "", 6);
      if (nombres.length) lineas.push("Entre ellos: " + nombres.join(", ") + ".");
    } else if (tipo === "apk") {
      lineas.push("Instalador de la app «" + (x.nombre || x.paquete || "desconocida") + "»" + (x.version ? " (versión " + x.version + ")" : "") + ".");
      lineas.push(x.instalada ? "Esa app ya está instalada en tu teléfono: el instalador sobra." : "Esa app NO está instalada: es un instalador sin usar.");
    } else if (tipo === "imagen") {
      lineas.push("Foto" + (x.ancho ? " de " + x.ancho + "×" + x.alto + " píxeles" : "") + ", pesa " + U.tam(arch.tam) + ".");
      if (x.tomada) lineas.push("Tomada el " + x.tomada + (x.camara ? " con " + x.camara : "") + ".");
      lineas.push("No puedo ver qué sale en la foto: ábrela con «Ver archivo».");
    } else if (tipo === "video" || tipo === "audio") {
      lineas.push((tipo === "video" ? "Video" : "Audio") + (x.duracionMs ? " de " + U.dur(x.duracionMs) : "") + (x.ancho ? ", " + x.ancho + "×" + x.alto : "") + ", pesa " + U.tam(arch.tam) + ".");
      if (x.titulo) lineas.push("Título: " + x.titulo + (x.artista ? " · " + x.artista : "") + ".");
    } else {
      lineas.push("Archivo ." + (U.ext(arch.nombre) || "sin extensión") + " de " + U.tam(arch.tam) + ". No sé abrirlo para resumirlo.");
    }
    lineas.push("Guardado " + U.hace(arch.fecha) + " (" + U.fecha(arch.fecha) + ").");

    // ¿parece importante?
    var base = U.norm(arch.nombre + " " + texto), fuertes = unicos(base.match(FUERTE) || []), medias = unicos(base.match(MEDIA) || []), razones = [];
    if (fuertes.length) razones.push("menciona: " + fuertes.join(", "));
    if (medias.length) razones.push("menciona: " + medias.join(", "));
    var esDoc = U.esDocumentoImportante(arch.nombre);
    if (esDoc) razones.push("es un documento");
    var nivel = fuertes.length || medias.length >= 2 ? "alto" : medias.length || esDoc ? "medio" : "bajo";
    return { lineas: lineas, claves: cl, importante: { nivel: nivel, razones: razones } };
  };
})();
