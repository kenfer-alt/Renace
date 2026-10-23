// 🌱 asistente.js - lo que hace Renace con cada pedido. Nada se borra sin permiso, archivo por archivo.
(function () {
  var RN = (window.RN = window.RN || {});
  var U = RN.u, N = RN.nativo, A = RN.analisis, R = RN.resumen;
  var S = (RN.asistente = {});
  var DIA = 86400000;
  var base = "/storage/emulated/0";
  var progresoCb = function () {};
  N.alProgreso(function (p) { progresoCb(p); });
  S.estado = { ajustes: { minGrande: 50, minFoto: 5 }, protegidos: [], guardarProtegidos: function () {} };
  var cacheResumen = {};

  function texto(t) { return { tipo: "texto", texto: t }; }
  function marcar(items) {
    return (items || []).map(function (it) {
      it.protegido = U.esDocumentoImportante(it.nombre) || S.estado.protegidos.some(function (p) { return it.ruta === p || it.ruta.indexOf(p.replace(/\/$/, "") + "/") === 0; });
      return it;
    });
  }
  function ruta(c) { return base + "/" + c; }
  function raicesDe(q) { return q.carpetas.length ? q.carpetas.map(ruta) : [base]; }
  function excluido(it, ex) {
    if (!ex) return false;
    if (ex.carpetas.some(function (c) { return it.ruta.indexOf("/" + c + "/") >= 0; })) return true;
    if (ex.exts.length && ex.exts.indexOf(U.ext(it.nombre)) >= 0) return true;
    if (ex.desde && it.fecha >= ex.desde && (!ex.hasta || it.fecha <= ex.hasta)) return true;
    if (!ex.desde && ex.hasta && it.fecha <= ex.hasta) return true;
    return false;
  }
  function suma(items) { return items.reduce(function (s, x) { return s + (x.tam || 0); }, 0); }
  function conProgreso(ctx, etiqueta) {
    progresoCb = function (p) { if (ctx && ctx.progreso) ctx.progreso(etiqueta + " " + U.num(p.archivos, 0) + " archivos revisados…"); };
  }
  function sinProgreso(ctx) { progresoCb = function () {}; if (ctx && ctx.progreso) ctx.progreso(null); }

  async function permisoArchivos() {
    var p = await N.permisos();
    if (p.archivos) return null;
    return { tipo: "permiso", cual: "archivos", texto: "Para revisar tus archivos necesito un permiso de Android. Toca el botón, busca **Renace** y activa «Permitir acceso para administrar todos los archivos». Después vuelve aquí." };
  }
  async function infoEspacio() {
    var e = await N.espacio();
    if (e.base) base = e.base;
    return e;
  }

  // ===================== respuestas =====================
  var AYUDA = "Soy **Renace** 🌱 y te ayudo a que tu teléfono vuelva a ir fluido, **sin borrar nada sin tu permiso**.\n\nPuedes decirme, por ejemplo:\n• «¿Cuánto espacio me queda?»\n• «Renace mi teléfono» (reviso todo y te muestro qué sobra)\n• «Busca archivos duplicados»\n• «Muéstrame mis videos más pesados»\n• «Organízame la carpeta de Descargas y muéstramela»\n• «Búscame las fotos de la cámara de este mes»\n• «Muéstrame las apps que no uso»\n• «Borra los videos de más de 100 MB excepto los de este mes»\n\nLo que borres va a la **papelera** 7 días, por si te arrepientes.";

  async function ejecutar(q, ctx) {
    var i = q.intencion;
    if (i === "saludo") return [texto("¡Hola! 👋 Soy Renace. Dime qué quieres: ver tu espacio, buscar archivos, quitar duplicados o desinstalar apps que ya no usas. Escribe «ayuda» si quieres ejemplos.")];
    if (i === "ayuda") return [texto(AYUDA)];
    if (i === "espacio") return [await mensajeEspacio(), texto("Para que el teléfono vaya fluido conviene tener libre al menos el **15 %**. Si quieres, escribe «Renace mi teléfono» y te muestro qué puedes quitar.")];
    if (i === "papelera") return [await mensajePapelera()];
    if (i === "apps") return [await mensajeApps()];
    var falta = await permisoArchivos();
    if (falta) return [falta];
    if (i === "duplicados") return [await mensajeDuplicados(q, ctx)];
    if (i === "limpiar") return await informeLimpieza(q, ctx);
    if (i === "grandes") return await revisarGrandes(q, ctx);
    if (i === "basura") return await revisarBasura(q, ctx);
    if (i === "organizar") return await organizar(q, ctx);
    if (i === "buscar" || i === "mostrar") return await buscarMostrar(q, ctx, i);
    if (i === "borrar") return await borrarConFiltros(q, ctx);
    var raros = q.sinEntender.length ? " No entendí: «" + q.sinEntender.join(", ") + "»." : "";
    return [texto("No estoy seguro de lo que quieres hacer." + raros + " Prueba con «ayuda» para ver lo que sé hacer.")];
  }

  async function mensajeEspacio() {
    var e = await infoEspacio();
    return { tipo: "espacio", total: e.total, libre: e.libre, ramTotal: e.ramTotal, ramLibre: e.ramLibre };
  }

  // ---------- buscar / mostrar ----------
  async function buscarNativo(q, extra) {
    await infoEspacio();
    var a = { raices: raicesDe(q), extensiones: q.exts, nombre: q.nombre, minTam: q.minTam, maxTam: q.maxTam, desde: q.desde, hasta: q.hasta, max: 500 };
    var r = await N.buscar(Object.assign(a, extra || {}));
    r.archivos = marcar(r.archivos.filter(function (it) { return !excluido(it, q.excluir); }));
    return r;
  }
  async function buscarMostrar(q, ctx, modo) {
    conProgreso(ctx, "Buscando…");
    var r = await buscarNativo(q);
    sinProgreso(ctx);
    if (!r.archivos.length) return [texto("No encontré archivos con eso 🤷. Revisé " + U.num(r.revisados, 0) + " archivos. Prueba con otras palabras o dime en qué carpeta crees que están.")];
    var grupos = {};
    r.archivos.forEach(function (it) { (grupos[U.categoria(it.nombre)] = grupos[U.categoria(it.nombre)] || []).push(it); });
    var orden = Object.keys(grupos).sort(function (a, b) { return grupos[b].length - grupos[a].length; });
    return [{ tipo: "lista", titulo: modo === "mostrar" ? "Esto es lo que hay" : "Esto es lo que encontré", filtros: A.describir(q), grupos: orden.map(function (c) { return { cat: c, items: grupos[c] }; }), total: r.archivos.length, tam: suma(r.archivos), base: base, truncado: !!r.truncado }];
  }

  // ---------- organizar ----------
  var DESTINO = { imagen: "Fotos", video: "Videos", audio: "Audios", documento: "Documentos", instalador: "Instaladores", comprimido: "Comprimidos", otro: "Otros" };
  async function organizar(q, ctx) {
    await infoEspacio();
    var carpeta = q.carpetas.length ? ruta(q.carpetas[0]) : ruta("Download");
    var r;
    try { r = await N.listar({ ruta: carpeta }); } catch (e) { return [texto("No pude abrir esa carpeta: " + e.message)]; }
    var archivos = marcar(r.archivos.filter(function (x) { return !x.dir; }));
    var carpetas = r.archivos.filter(function (x) { return x.dir; });
    if (!archivos.length && !carpetas.length) return [texto("La carpeta **" + U.acortar(carpeta, base) + "** está vacía.")];
    var por = {};
    archivos.forEach(function (it) { (por[U.categoria(it.nombre)] = por[U.categoria(it.nombre)] || []).push(it); });
    var plan = Object.keys(por).map(function (c) { return { cat: c, destino: carpeta + "/" + DESTINO[c], items: por[c] }; });
    var lista = { tipo: "lista", titulo: "Esto hay en " + U.acortar(carpeta, base), filtros: [], grupos: Object.keys(por).map(function (c) { return { cat: c, items: por[c] }; }), total: archivos.length, tam: suma(archivos), base: base, carpetas: carpetas.map(function (c) { return c.nombre; }) };
    var out = [lista];
    if (archivos.length > 1) out.push({ tipo: "organizar", carpeta: carpeta, plan: plan, estado: "propuesta", movimientos: [], total: archivos.length });
    return out;
  }

  // ---------- duplicados ----------
  async function mensajeDuplicados(q, ctx) {
    conProgreso(ctx, "Comparando archivos…");
    var r = await N.duplicados({ raices: raicesDe(q), minTam: 30 * 1024 });
    sinProgreso(ctx);
    var grupos = r.grupos.map(function (g) { return { tam: g.tam, parcial: g.parcial, archivos: marcar(g.archivos).map(function (a) { a.estado = "ok"; return a; }) }; });
    return { tipo: "duplicados", grupos: grupos, recuperable: r.recuperable, total: r.totalGrupos, revisados: r.revisados };
  }

  // ---------- escaneo completo y tarjetas ----------
  async function escanear(q, ctx) {
    await infoEspacio();
    conProgreso(ctx, "Revisando tu teléfono…");
    var r = await N.escanear({ raices: raicesDe(q), minGrande: S.estado.ajustes.minGrande * 1048576, minFoto: S.estado.ajustes.minFoto * 1048576, max: 150 });
    sinProgreso(ctx);
    ["grandes", "fotos", "apks", "temporales", "carpetasVacias"].forEach(function (k) { r[k] = marcar((r[k] || []).filter(function (it) { return !excluido(it, q.excluir); })); });
    if (r.miniaturas) r.miniaturas.muestras = marcar(r.miniaturas.muestras || []);
    return r;
  }
  function tarjetas(titulo, items, intro) {
    var libres = items.filter(function (x) { return !x.protegido; });
    return { tipo: "tarjetas", titulo: titulo, intro: intro || "", items: libres, omitidos: items.length - libres.length, idx: 0, estado: libres.length ? "activo" : "fin", borrados: 0, bytes: 0, conservados: 0, siempre: 0 };
  }
  async function revisarGrandes(q, ctx) {
    var r = await escanear(q, ctx);
    var imagenes = q.cats.indexOf("imagen") >= 0 && q.cats.length === 1;
    var items = imagenes ? r.fotos : r.grandes.concat(r.fotos).sort(function (a, b) { return b.tam - a.tam; });
    if (!items.length) return [texto("No encontré archivos grandes con el límite actual (" + S.estado.ajustes.minGrande + " MB). Puedes bajarlo en ⚙️ Ajustes.")];
    return [texto("Encontré **" + items.length + "** archivos grandes que suman **" + U.tam(suma(items)) + "**. Te los muestro uno por uno, del más pesado al más liviano. **Tú decides cuáles se van a la papelera.**"), tarjetas("Archivos grandes", items)];
  }
  async function revisarBasura(q, ctx) {
    var r = await escanear(q, ctx);
    var items = r.apks.concat(r.temporales, r.carpetasVacias, r.miniaturas ? r.miniaturas.muestras : []);
    if (!items.length) return [texto("¡Tu teléfono está limpio de basura! ✨ No encontré instaladores viejos, temporales ni carpetas vacías.")];
    return [texto("Encontré **" + items.length + "** cosas que suelen sobrar (instaladores, temporales, miniaturas y carpetas vacías). Te las muestro una por una."), tarjetas("Basura que suele sobrar", items)];
  }
  async function borrarConFiltros(q, ctx) {
    conProgreso(ctx, "Buscando lo que pediste…");
    var r = await buscarNativo(q);
    sinProgreso(ctx);
    if (!q.carpetas.length && !q.cats.length && !q.nombre && !q.minTam && !q.maxTam && !q.desde && !q.hasta) {
      return [texto("Dime qué quieres borrar: por ejemplo «borra los videos de más de 100 MB» o «elimina los APK». Así no toco nada por error.")];
    }
    var items = r.archivos.sort(function (a, b) { return b.tam - a.tam; });
    if (!items.length) return [texto("No hay archivos que cumplan lo que pediste 🤷. No borré nada.")];
    var t = tarjetas("Lo que pediste borrar", items, "Cumplen lo que pediste: " + A.describir(q).join(" · "));
    var prot = t.omitidos ? "\n🔒 Dejé fuera **" + t.omitidos + "** documentos importantes protegidos." : "";
    return [texto("Encontré **" + items.length + "** archivos (" + U.tam(suma(items)) + "). **No borré nada todavía:** te los muestro uno por uno para que tú decidas." + prot), t];
  }

  // ---------- informe: "Renace mi teléfono" ----------
  async function informeLimpieza(q, ctx) {
    var r = await escanear(q, ctx);
    conProgreso(ctx, "Comparando archivos…");
    var d = await N.duplicados({ raices: raicesDe(q), minTam: 30 * 1024 });
    sinProgreso(ctx);
    var apps = null;
    try { apps = await mensajeApps(true); } catch (e) { apps = null; }
    var dupGrupos = d.grupos.map(function (g) { return { tam: g.tam, parcial: g.parcial, archivos: marcar(g.archivos).map(function (a) { a.estado = "ok"; return a; }) }; });
    var basura = r.apks.concat(r.temporales, r.carpetasVacias, r.miniaturas ? r.miniaturas.muestras : []);
    var cats = [
      { id: "duplicados", icono: "👯", titulo: "Archivos duplicados", n: d.totalGrupos, bytes: d.recuperable, nota: "ahorras al quitar las copias" },
      { id: "grandes", icono: "📦", titulo: "Archivos grandes", n: r.grandes.length, bytes: suma(r.grandes) },
      { id: "fotos", icono: "🖼️", titulo: "Fotos pesadas", n: r.fotos.length, bytes: suma(r.fotos) },
      { id: "basura", icono: "🧹", titulo: "Basura (instaladores, temporales, miniaturas)", n: basura.length, bytes: suma(basura) + (r.miniaturas ? Math.max(0, r.miniaturas.tam - suma(r.miniaturas.muestras)) : 0) },
    ];
    if (apps && apps.usoPermitido) {
      var sin = apps.apps.filter(function (a) { return a.dias == null || a.dias >= 30; });
      cats.push({ id: "apps", icono: "📲", titulo: "Apps sin usar", n: sin.length, bytes: sin.reduce(function (s, a) { return s + a.tam; }, 0) });
    }
    var potencial = cats.reduce(function (s, c) { return s + c.bytes; }, 0);
    return [{ tipo: "informe", categorias: cats, potencial: potencial, revisados: r.totalArchivos, datos: { grandes: r.grandes, fotos: r.fotos, basura: basura, duplicados: dupGrupos } }];
  }

  // ---------- apps ----------
  async function mensajeApps(silencioso) {
    if (RN.modo === "termux") return { tipo: "texto", texto: "📲 Ver y desinstalar las apps que no usas **solo funciona en la app instalada (APK)**: Termux no tiene el permiso de Android para eso. Cuando instales la APK, aquí te mostraré cuánto tiempo llevas sin abrir cada app." };
    var p = await N.permisos();
    if (!p.usoApps && !silencioso) return { tipo: "permiso", cual: "uso", texto: "Para saber cuánto tiempo llevas sin usar cada app necesito el permiso **Acceso de uso**. Toca el botón, busca **Renace** y actívalo. Después vuelve aquí." };
    var r = await N.listarApps();
    var apps = r.apps.map(function (a) {
      var ref = a.ultimoUso > 0 ? a.ultimoUso : null;
      a.dias = !r.usoPermitido ? null : ref ? Math.floor(U.dias(ref)) : null;
      a.nunca = r.usoPermitido && a.ultimoUso === 0;
      a.diasInstalada = a.instaladoEn ? Math.floor(U.dias(a.instaladoEn)) : null;
      return a;
    });
    apps.sort(function (a, b) { var da = a.nunca ? 99999 : a.dias == null ? -1 : a.dias, db = b.nunca ? 99999 : b.dias == null ? -1 : b.dias; return db - da; });
    return { tipo: "apps", apps: apps, usoPermitido: r.usoPermitido, umbral: 30, estadoUso: r.usoPermitido ? "ok" : "falta" };
  }

  // ---------- papelera ----------
  async function mensajePapelera() {
    var r = await N.listarPapelera();
    r.items.sort(function (a, b) { return b.borradoEn - a.borradoEn; });
    return { tipo: "papelera", items: r.items, bytes: r.bytes };
  }

  // ===================== entrada principal =====================
  S.responder = async function (textoUsuario, ctx) {
    var partes = A.analizar(textoUsuario), salida = [];
    for (var i = 0; i < partes.length; i++) {
      try {
        var msgs = await ejecutar(partes[i], ctx);
        if (partes.length > 1) msgs.unshift({ tipo: "texto", texto: "**" + (i + 1) + ".** " + partes[i].texto, parte: true });
        salida = salida.concat(msgs);
      } catch (e) {
        salida.push(texto("Algo salió mal con eso: " + (e && e.message ? e.message : e) + ". No se borró nada."));
      }
    }
    sinProgreso(ctx);
    return { mensajes: salida, analisis: partes.map(function (p) { return { texto: p.texto, intencion: p.intencion, palabras: p.palabras, filtros: A.describir(p), cobertura: p.cobertura, sinEntender: p.sinEntender }; }) };
  };

  // ===================== acciones desde los botones =====================
  S.resumenDe = async function (it) {
    if (cacheResumen[it.ruta]) return cacheResumen[it.ruta];
    var info;
    if (it.dir) info = { tipo: "otro", texto: "", extra: {} };
    else info = await N.resumen({ ruta: it.ruta });
    var res = R.resumir(it, info);
    if (it.dir) res.lineas = ["Carpeta vacía: no tiene nada adentro."];
    cacheResumen[it.ruta] = res;
    return res;
  };
  S.ver = function (it) { return N.abrirArchivo({ ruta: it.ruta }); };

  S.accion = async function (msg, nombre, a, ctx) {
    var nuevos = [];
    if (nombre === "decidir") {
      var it = msg.items[msg.idx];
      if (!it) return { nuevos: [] };
      if (a.decision === "borrar") {
        var r = await N.moverAPapelera({ rutas: [it.ruta] });
        if (r.movidos.length) { msg.borrados++; msg.bytes += it.tam || 0; it.estado = "papelera"; }
        else { it.estado = "fallo"; it.motivo = r.fallos[0] ? r.fallos[0].motivo : ""; }
      } else if (a.decision === "siempre") {
        S.estado.protegidos.push(it.ruta); S.estado.guardarProtegidos(); msg.siempre++; it.estado = "conservado";
      } else { msg.conservados++; it.estado = "conservado"; }
      msg.idx++;
      if (msg.idx >= msg.items.length) {
        msg.estado = "fin";
        var e = await infoEspacio();
        nuevos.push(texto(resumenFinal(msg, e)));
      }
    } else if (nombre === "borrarCopia") {
      var g = msg.grupos[a.g], c = g.archivos[a.i];
      var quedan = g.archivos.filter(function (x) { return x.estado === "ok"; }).length;
      if (quedan < 2) return { nuevos: [texto("Esa es la **última copia**: la dejo para que no pierdas el archivo.")] };
      var rr = await N.moverAPapelera({ rutas: [c.ruta] });
      if (rr.movidos.length) { c.estado = "papelera"; msg.borradoBytes = (msg.borradoBytes || 0) + g.tam; }
      else { c.estado = "fallo"; }
    } else if (nombre === "revisar") {
      var d = msg.datos, t;
      if (a.id === "duplicados") nuevos.push({ tipo: "duplicados", grupos: d.duplicados, recuperable: msg.categorias[0].bytes, total: d.duplicados.length });
      else if (a.id === "grandes") { t = tarjetas("Archivos grandes", d.grandes); nuevos.push(t); }
      else if (a.id === "fotos") { t = tarjetas("Fotos pesadas", d.fotos); nuevos.push(t); }
      else if (a.id === "basura") { t = tarjetas("Basura que suele sobrar", d.basura); nuevos.push(t); }
      else if (a.id === "apps") nuevos.push(await mensajeApps());
      if (t && !t.items.length) nuevos = [texto("No hay nada para revisar ahí (los documentos importantes están protegidos).")];
    } else if (nombre === "uno") {
      var info = a.item;
      var tt = tarjetas("Borrar este archivo", [Object.assign({}, info, { protegido: false })]);
      if (info.protegido) { tt.items = [info]; tt.estado = "activo"; tt.omitidos = 0; }
      nuevos.push(tt);
    } else if (nombre === "organizarAhora") {
      var movs = [];
      msg.plan.forEach(function (p) { p.items.forEach(function (x) { movs.push({ de: x.ruta, a: p.destino + "/" + x.nombre }); }); });
      var res = await N.mover({ movimientos: movs });
      msg.movimientos = res.movidos; msg.estado = "hecho";
      nuevos.push(texto("Listo ✅ Moví **" + res.movidos.length + "** archivos a sus carpetas" + (res.fallos.length ? " (" + res.fallos.length + " no se pudieron mover)" : "") + ". Si no te gusta, toca «Deshacer»."));
    } else if (nombre === "deshacerOrganizar") {
      var inv = msg.movimientos.map(function (m) { return { de: m.a, a: m.de }; });
      await N.mover({ movimientos: inv });
      msg.estado = "deshecho";
      nuevos.push(texto("Deshecho ↩️ Todo volvió a su lugar."));
    } else if (nombre === "desinstalar") {
      await N.desinstalarApp({ paquete: a.paquete });
    } else if (nombre === "verificarApp") {
      var ex = await N.existeApp({ paquete: a.paquete });
      if (!ex.existe) {
        var ap = msg.apps.filter(function (x) { return x.paquete === a.paquete; })[0];
        msg.apps = msg.apps.filter(function (x) { return x.paquete !== a.paquete; });
        msg.liberadoApps = (msg.liberadoApps || 0) + (ap ? ap.tam : 0);
        var e2 = await infoEspacio();
        nuevos.push(texto("**" + (ap ? ap.nombre : "La app") + "** se desinstaló ✅ Liberaste unos " + U.tam(ap ? ap.tam : 0) + ". Ahora te quedan **" + U.tam(e2.libre) + "** libres."));
      }
    } else if (nombre === "restaurar") {
      await N.restaurar({ ids: [a.id] });
      var pp = await N.listarPapelera(); msg.items = pp.items; msg.bytes = pp.bytes;
      nuevos.push(texto("Restaurado ↩️ El archivo volvió a su lugar."));
    } else if (nombre === "borrarYa" || nombre === "vaciar") {
      var rv = await N.vaciarPapelera(nombre === "borrarYa" ? { ids: [a.id] } : {});
      var p2 = await N.listarPapelera(); msg.items = p2.items; msg.bytes = p2.bytes;
      var e3 = await infoEspacio();
      nuevos.push(texto("Papelera vaciada 🗑️ Liberaste **" + U.tam(rv.bytes) + "**. Ahora te quedan **" + U.tam(e3.libre) + "** libres de " + U.tam(e3.total) + "."));
    } else if (nombre === "permiso") {
      if (a.cual === "archivos") await N.pedirPermisoArchivos(); else await N.pedirPermisoUso();
    }
    return { nuevos: nuevos };
  };

  function resumenFinal(m, e) {
    var l = ["Terminé de revisar **" + m.titulo.toLowerCase() + "** 🎉"];
    l.push("• Moví a la papelera: **" + m.borrados + "** archivos (" + U.tam(m.bytes) + ")");
    l.push("• Conservé: **" + m.conservados + "**" + (m.siempre ? " · Marqué «conservar siempre»: **" + m.siempre + "**" : ""));
    if (m.bytes) l.push("\nOjo: esos " + U.tam(m.bytes) + " **siguen en el teléfono hasta que vacíes la papelera**. Escribe «papelera» para vaciarla y liberar el espacio ahora.");
    l.push("\nTe quedan **" + U.tam(e.libre) + "** libres de " + U.tam(e.total) + ".");
    return l.join("\n");
  }

  S.limpiarCache = function () { cacheResumen = {}; };
  S.getBase = function () { return base; };
})();
