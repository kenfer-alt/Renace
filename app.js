// 📱 app.js - la pantalla de Renace: chats como los de una IA, tarjetas de archivos y ajustes
(function () {
  var RN = window.RN, U = RN.u, N = RN.nativo, S = RN.asistente;
  var $ = function (id) { return document.getElementById(id); };
  var estado = { chats: [], chatId: null, ajustes: { minGrande: 50, minFoto: 5 }, protegidos: [] };
  var ocupado = false;
  var appsPendientes = [];

  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function boton(txt, cls, fn) { var b = h("button", "btn " + (cls || ""), txt); b.onclick = fn; return b; }
  function md(t) { return U.esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
  function toast(t) { var e = $("toast"); e.textContent = t; e.style.display = "block"; clearTimeout(toast._t); toast._t = setTimeout(function () { e.style.display = "none"; }, 2600); }
  function guardar() { return RN.almacen.set("chats", estado.chats); }
  function chatActual() { return estado.chats.filter(function (c) { return c.id === estado.chatId; })[0]; }
  function nuevoChat() { var c = { id: U.id(), titulo: "Chat nuevo", creado: Date.now(), actualizado: Date.now(), mensajes: [] }; estado.chats.unshift(c); return c; }

  // ---------------- ventanas ----------------
  function modal(o) {
    return new Promise(function (ok) {
      var m = $("modal"); m.innerHTML = "";
      m.appendChild(h("h3", "", o.titulo || ""));
      if (o.texto) m.appendChild(h("p", "", o.texto));
      var inp = null;
      if (o.input != null) { inp = h("input"); inp.value = o.input; m.appendChild(inp); }
      var bs = h("div", "botones");
      (o.botones || [{ t: "OK", v: true }]).forEach(function (b) {
        bs.appendChild(boton(b.t, b.cls || "", function () { $("modalVelo").style.display = "none"; ok(inp ? (b.v ? inp.value : null) : b.v); }));
      });
      m.appendChild(bs);
      $("modalVelo").style.display = "flex";
      if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 50);
    });
  }
  function confirmar(titulo, texto, si, peligro) {
    return modal({ titulo: titulo, texto: texto, botones: [{ t: "Cancelar", v: false, cls: "sec" }, { t: si || "Sí", v: true, cls: peligro ? "peligro" : "" }] });
  }

  // ---------------- cajón de chats ----------------
  function abrirCajon(si) { $("cajon").classList.toggle("abierto", si); $("velo").style.display = si ? "block" : "none"; if (si) pintarChats(); }
  function pintarChats() {
    var lista = $("listaChats"); lista.innerHTML = "";
    var q = U.norm($("buscarChats").value.trim());
    var cs = estado.chats.slice().sort(function (a, b) { return b.actualizado - a.actualizado; });
    var hay = 0;
    cs.forEach(function (c) {
      var snippet = "";
      if (q) {
        var enTitulo = U.norm(c.titulo).indexOf(q) >= 0, m = null;
        c.mensajes.forEach(function (x) { if (!m && x.texto && U.norm(x.texto).indexOf(q) >= 0) m = x; });
        if (!enTitulo && !m) return;
        if (m) snippet = "«" + m.texto.slice(0, 60) + "»";
      } else {
        var ult = c.mensajes.filter(function (x) { return x.texto; }).slice(-1)[0];
        snippet = ult ? ult.texto.replace(/\*\*/g, "").slice(0, 60) : "Sin mensajes";
      }
      hay++;
      var it = h("div", "chat-item" + (c.id === estado.chatId ? " activo" : ""));
      var info = h("button", "info"); info.appendChild(h("div", "t", c.titulo)); info.appendChild(h("div", "s", snippet));
      info.onclick = function () { estado.chatId = c.id; abrirCajon(false); pintarTodo(); };
      var mas = h("button", "mas", "⋯"); mas.onclick = function () { menuChat(c); };
      it.appendChild(info); it.appendChild(mas); lista.appendChild(it);
    });
    if (!hay) lista.appendChild(h("div", "vacio", q ? "No encontré nada con eso." : "Aún no hay chats."));
  }
  async function menuChat(c) {
    var r = await modal({ titulo: c.titulo, botones: [{ t: "✏️ Cambiar nombre", v: "ren" }, { t: "🗑️ Borrar chat", v: "del", cls: "peligro" }, { t: "Cerrar", v: false, cls: "sec" }] });
    if (r === "ren") {
      var n = await modal({ titulo: "Cambiar nombre", input: c.titulo, botones: [{ t: "Cancelar", v: false, cls: "sec" }, { t: "Guardar", v: true }] });
      if (n && n.trim()) { c.titulo = n.trim().slice(0, 60); await guardar(); pintarTodo(); pintarChats(); }
    } else if (r === "del") {
      if (await confirmar("¿Borrar este chat?", "Se borra la conversación «" + c.titulo + "». Tus archivos no se tocan.", "Borrar chat", true)) {
        estado.chats = estado.chats.filter(function (x) { return x.id !== c.id; });
        if (!estado.chats.length) nuevoChat();
        if (estado.chatId === c.id) estado.chatId = estado.chats[0].id;
        await guardar(); pintarTodo(); pintarChats();
      }
    }
  }

  // ---------------- mensajes ----------------
  var ICONOS_VISTA = U.ICONO;
  function miniatura(it) {
    var m = h("div", "mini");
    var cat = it.dir ? "carpeta" : U.categoria(it.nombre);
    if (cat === "imagen" && (RN.esNativo || RN.modo === "termux")) { var im = h("img"); im.loading = "lazy"; im.src = N.miniatura(it.ruta); im.onerror = function () { m.textContent = ICONOS_VISTA.imagen; }; m.appendChild(im); }
    else m.textContent = ICONOS_VISTA[cat] || "📁";
    return m;
  }
  function filaArchivo(it, base, opts) {
    opts = opts || {};
    var f = h("div", "fila-arch"); f.appendChild(miniatura(it));
    var d = h("div", "dat");
    d.appendChild(h("div", "n", (it.protegido ? "🔒 " : "") + it.nombre));
    d.appendChild(h("div", "ruta", "📍 " + U.carpetaDe(U.acortar(it.ruta, base) || "/") ));
    d.appendChild(h("div", "ruta", (it.dir ? "Carpeta" : U.tam(it.tam)) + " · " + U.hace(it.fecha)));
    f.appendChild(d);
    var acc = h("div", "acc");
    if (!it.dir) { var v = boton("👁️ Ver", "sec chico", function () { S.ver(it).catch(function (e) { toast(e.message); }); }); acc.appendChild(v); }
    if (opts.borrar) acc.appendChild(boton("🗑️", "sec chico", function () { opts.borrar(it); }));
    f.appendChild(acc);
    return f;
  }

  function cajaEspacio(m) {
    var c = h("div", "caja"), libre = m.libre, total = m.total, pct = Math.round((1 - libre / total) * 100), pl = libre / total;
    var nivel = pl < 0.1 ? ["#d64545", "Casi lleno 😰"] : pl < 0.2 ? ["#e8872b", "Poco espacio 😕"] : pl < 0.4 ? ["#d9a81a", "Normal 🙂"] : ["#1fa463", "Bien 😀"];
    c.appendChild(h("div", "suave", "Espacio libre en tu teléfono"));
    var g = h("div", "grande", "Te quedan " + U.tam(libre)); c.appendChild(g);
    c.appendChild(h("div", "suave", "de " + U.tam(total) + " en total"));
    var b = h("div", "barra"), r = h("div"); r.style.width = pct + "%"; r.style.background = nivel[0]; b.appendChild(r); c.appendChild(b);
    c.appendChild(h("div", "suave", "Usado: " + pct + " % · Libre: " + (100 - pct) + " %"));
    var s = h("span", "semaforo", nivel[1]); s.style.background = nivel[0]; s.style.marginTop = "8px"; c.appendChild(s);
    if (m.ramTotal) {
      c.appendChild(h("div", "suave", " ")); var rp = Math.round((1 - m.ramLibre / m.ramTotal) * 100);
      c.appendChild(h("div", "suave", "Memoria RAM (la que usa el teléfono para moverse): " + U.tam(m.ramLibre) + " libres de " + U.tam(m.ramTotal) + " · en uso " + rp + " %"));
      var b2 = h("div", "barra"), r2 = h("div"); r2.style.width = rp + "%"; r2.style.background = rp > 85 ? "#e8872b" : "#0f9d8a"; b2.appendChild(r2); c.appendChild(b2);
    }
    return c;
  }
  function cajaPermiso(m, msgObj) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", m.cual === "archivos" ? "🔐 Necesito tu permiso para ver archivos" : "🔐 Necesito el permiso de uso de apps"));
    var p = h("div"); p.innerHTML = md(m.texto); c.appendChild(p);
    c.appendChild(boton("Abrir ajustes de Android", "", async function () { try { await S.accion(m, "permiso", { cual: m.cual }); } catch (e) { toast(e.message); } }));
    c.appendChild(boton("Ya lo activé ✔", "sec", async function () {
      var p2 = await N.permisos(); var ok = m.cual === "archivos" ? p2.archivos : p2.usoApps;
      if (ok) { toast("¡Perfecto! Ya puedo ayudarte."); } else toast("Todavía no está activado. Revisa los ajustes de Android.");
    }));
    return c;
  }
  function cajaLista(m) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "📂 " + m.titulo));
    if (m.filtros && m.filtros.length) { var fl = h("div"); m.filtros.forEach(function (x) { fl.appendChild(h("span", "chip", x)); }); c.appendChild(fl); }
    c.appendChild(h("div", "suave", m.total + " archivos · " + U.tam(m.tam) + (m.truncado ? " (muestro los primeros 500)" : "")));
    if (m.carpetas && m.carpetas.length) c.appendChild(h("div", "suave", "Carpetas adentro: " + m.carpetas.join(", ")));
    m.grupos.forEach(function (g) {
      c.appendChild(h("div", "", "")); var t = h("div", "", ICONOS_VISTA[g.cat] + " " + U.NOMBRE_CAT[g.cat] + " (" + g.items.length + ")"); t.style.cssText = "font-weight:700;margin:12px 0 2px"; c.appendChild(t);
      var cont = h("div"), lim = 12;
      function pintar() {
        cont.innerHTML = "";
        g.items.slice(0, lim).forEach(function (it) { cont.appendChild(filaArchivo(it, m.base, { borrar: function (x) { iniciarUno(x); } })); });
        if (g.items.length > lim) cont.appendChild(boton("Mostrar " + Math.min(20, g.items.length - lim) + " más", "sec chico", function () { lim += 20; pintar(); }));
      }
      pintar(); c.appendChild(cont);
    });
    return c;
  }
  async function iniciarUno(it) {
    var chat = chatActual();
    var r = await S.accion({}, "uno", { item: it }); r.nuevos.forEach(function (n) { chat.mensajes.push(botMsg(n)); });
    await guardar(); pintarMensajes(true);
  }
  function cajaOrganizar(m, objMsg, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "🗂️ Propuesta para organizar " + U.acortar(m.carpeta, S.getBase())));
    if (m.estado === "propuesta") {
      m.plan.forEach(function (p) { c.appendChild(h("div", "", ICONOS_VISTA[p.cat] + " " + p.items.length + " " + U.NOMBRE_CAT[p.cat].toLowerCase() + " → carpeta «" + p.destino.split("/").pop() + "»")); });
      c.appendChild(h("div", "suave", "No se borra nada: solo se mueven a carpetas por tipo. Puedes deshacerlo."));
      c.appendChild(boton("Organizar ahora", "", async function () { var r = await S.accion(m, "organizarAhora", {}); await publicar(r.nuevos, rerender); }));
    } else if (m.estado === "hecho") {
      c.appendChild(h("div", "", "✅ Organizado: " + m.movimientos.length + " archivos movidos."));
      c.appendChild(boton("↩️ Deshacer", "sec", async function () { var r = await S.accion(m, "deshacerOrganizar", {}); await publicar(r.nuevos, rerender); }));
    } else c.appendChild(h("div", "", "↩️ Se deshizo la organización."));
    return c;
  }
  function cajaInforme(m, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "🌱 Así está tu teléfono"));
    c.appendChild(h("div", "suave", "Revisé " + U.num(m.revisados, 0) + " archivos. Podrías liberar hasta:"));
    c.appendChild(h("div", "grande", U.tam(m.potencial)));
    c.appendChild(h("div", "suave", "Nada se borra solo: tú decides archivo por archivo."));
    m.categorias.forEach(function (k) {
      var f = h("div", "fila-arch"); var mi = h("div", "mini", k.icono); f.appendChild(mi);
      var d = h("div", "dat"); d.appendChild(h("div", "n", k.titulo)); d.appendChild(h("div", "ruta", k.n + " encontrados · " + U.tam(k.bytes) + (k.nota ? " (" + k.nota + ")" : ""))); f.appendChild(d);
      if (k.n) f.appendChild(boton("Revisar", "chico", async function () { var r = await S.accion(m, "revisar", { id: k.id }); await publicar(r.nuevos, rerender); }));
      c.appendChild(f);
    });
    return c;
  }
  function cajaTarjetas(m, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "🗑️ " + m.titulo));
    if (m.intro) c.appendChild(h("div", "suave", m.intro));
    if (m.estado === "fin" || m.idx >= m.items.length) {
      c.appendChild(h("div", "", "✅ Revisión terminada: " + m.borrados + " a la papelera (" + U.tam(m.bytes) + "), " + m.conservados + " conservados."));
      return c;
    }
    var it = m.items[m.idx];
    c.appendChild(h("div", "progreso-t", "Archivo " + (m.idx + 1) + " de " + m.items.length));
    var pb = h("div", "barra"), pr = h("div"); pr.style.width = Math.round((m.idx / m.items.length) * 100) + "%"; pr.style.background = "#0f9d8a"; pb.appendChild(pr); pb.style.height = "8px"; c.appendChild(pb);
    var f = filaArchivo(it, S.getBase()); c.appendChild(f);
    var ruta = h("div", "ficha"); ruta.innerHTML = "<b>📍 Dirección completa:</b><br>" + U.esc(it.ruta); c.appendChild(ruta);
    var guia = h("div", "ficha"); guia.innerHTML = "<b>Este es el archivo.</b> Métete a verlo para saber si es algo importante:"; guia.appendChild(h("div")); guia.appendChild(boton("👁️ Ver archivo", "", function () { S.ver(it).catch(function (e) { toast(e.message); }); })); c.appendChild(guia);
    var res = h("div", "ficha"); res.innerHTML = "<b>📄 Resumen del archivo</b><br><span class='suave'>Leyendo el archivo…</span>"; c.appendChild(res);
    var aviso = h("div"); c.appendChild(aviso);
    var acciones = h("div"); c.appendChild(acciones);
    var importante = it.protegido;
    function botones() {
      acciones.innerHTML = "";
      var pedir = importante && m._confirmar !== m.idx;
      var txt = m._confirmar === m.idx ? "⚠️ Sí, estoy seguro: borrar" : "🗑️ Mover a la papelera";
      acciones.appendChild(boton(txt, "peligro", async function () {
        if (importante && m._confirmar !== m.idx) { m._confirmar = m.idx; botones(); return; }
        m._confirmar = null; var r = await S.accion(m, "decidir", { decision: "borrar" }); await publicar(r.nuevos, rerender);
      }));
      acciones.appendChild(boton("✅ Conservar", "sec", async function () { m._confirmar = null; var r = await S.accion(m, "decidir", { decision: "conservar" }); await publicar(r.nuevos, rerender); }));
      acciones.appendChild(boton("🔒 Conservar siempre", "sec", async function () { var r = await S.accion(m, "decidir", { decision: "siempre" }); await publicar(r.nuevos, rerender); }));
    }
    botones();
    S.resumenDe(it).then(function (r) {
      var l = r.lineas.map(function (x) { return "• " + U.esc(x); }).join("<br>");
      res.innerHTML = "<b>📄 Resumen del archivo</b><br>" + l;
      if (r.importante.nivel !== "bajo") {
        importante = true;
        var a = h("div", "aviso-imp"); a.innerHTML = "⚠️ <b>Parece importante</b> (" + U.esc(r.importante.razones.join("; ")) + "). <b>Te recomiendo no borrarlo</b> si al verlo confirmas que lo es.";
        aviso.appendChild(a); botones();
      }
    }).catch(function (e) { res.innerHTML = "<b>📄 Resumen del archivo</b><br>No pude leerlo: " + U.esc(e.message || e) + ". Ábrelo con «Ver archivo»."; });
    return c;
  }
  function cajaDuplicados(m, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "👯 Archivos duplicados"));
    if (!m.grupos.length) { c.appendChild(h("div", "", "¡No encontré duplicados! 🎉 Revisé " + U.num(m.revisados || 0, 0) + " archivos.")); return c; }
    c.appendChild(h("div", "suave", m.total + " grupos de archivos iguales. Quitando las copias podrías liberar " + U.tam(m.recuperable) + ". **Tú eliges cuál conservar:** nada está marcado."));
    if (m.borradoBytes) c.appendChild(h("div", "", "✅ Ya moviste a la papelera " + U.tam(m.borradoBytes) + " en copias."));
    m.grupos.forEach(function (g, gi) {
      var gd = h("div", "grupo-dup"); gd.appendChild(h("div", "n", g.archivos.length + " copias · " + U.tam(g.tam) + " cada una" + (g.parcial ? " (comparación parcial)" : "")));
      var ok = g.archivos.filter(function (x) { return x.estado === "ok"; }).length;
      g.archivos.forEach(function (it, i) {
        var f = filaArchivo(it, S.getBase()); var acc = f.lastChild;
        if (it.estado === "papelera") { acc.innerHTML = ""; acc.appendChild(h("span", "suave", "✅ En papelera")); }
        else if (ok < 2) { acc.appendChild(h("span", "suave", "Última copia: se queda")); }
        else acc.appendChild(boton("🗑️ Borrar esta", "sec chico", async function () {
          if (it.protegido && !(await confirmar("Documento protegido", "«" + it.nombre + "» es un documento importante. ¿Seguro que quieres moverlo a la papelera?", "Sí, moverlo", true))) return;
          var r = await S.accion(m, "borrarCopia", { g: gi, i: i }); await publicar(r.nuevos, rerender);
        }));
        gd.appendChild(f);
      });
      c.appendChild(gd);
    });
    return c;
  }
  function cajaApps(m, objMsg, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "📲 Apps que no usas"));
    if (!m.usoPermitido) {
      c.appendChild(h("div", "ficha", "Todavía no puedo saber cuánto tiempo llevas sin usarlas. Activa el permiso «Acceso de uso» para Renace."));
      c.appendChild(boton("Abrir ajustes de Android", "", function () { S.accion(m, "permiso", { cual: "uso" }); }));
    }
    var sin = m.apps.filter(function (a) { return a.nunca || a.dias == null || a.dias >= m.umbral; });
    var usa = m.apps.filter(function (a) { return sin.indexOf(a) < 0; });
    c.appendChild(h("div", "suave", m.usoPermitido ? sin.length + " apps llevan 30 días o más sin abrirse. Desinstalarlas libera espacio y ayuda a que el teléfono no se trabe." : "Estas son tus apps (sin datos de uso):"));
    function fila(a) {
      var f = h("div", "fila-arch"); var mi = h("div", "mini");
      if (a.icono) { var im = h("img"); im.src = a.icono; mi.appendChild(im); } else mi.textContent = "📲";
      f.appendChild(mi);
      var d = h("div", "dat"); d.appendChild(h("div", "n", a.nombre));
      var tiempo = !m.usoPermitido ? "Sin datos de uso" : a.nunca ? "Nunca la has abierto" + (a.diasInstalada ? " (instalada " + U.hace(a.instaladoEn) + ")" : "") : a.dias < 1 ? "La usaste hoy" : "No la abres " + U.hace(Date.now() - a.dias * 86400000).replace("hace ", "desde hace ");
      d.appendChild(h("div", "ruta", tiempo + " · ocupa " + U.tam(a.tam))); f.appendChild(d);
      f.appendChild(boton("Desinstalar", "peligro chico", async function () {
        if (!(await confirmar("¿Desinstalar " + a.nombre + "?", "Liberarás unos " + U.tam(a.tam) + ". Android te pedirá confirmar otra vez.", "Continuar", true))) return;
        appsPendientes.push({ msg: objMsg, paquete: a.paquete }); await S.accion(m, "desinstalar", { paquete: a.paquete });
        if (!RN.esNativo) { var r = await S.accion(m, "verificarApp", { paquete: a.paquete }); await publicar(r.nuevos, rerender); }
      }));
      return f;
    }
    sin.forEach(function (a) { c.appendChild(fila(a)); });
    if (usa.length) {
      var det = h("div"); det.appendChild(boton("Ver las " + usa.length + " apps que sí usas", "sec chico", function () { det.innerHTML = ""; usa.forEach(function (a) { det.appendChild(fila(a)); }); }));
      c.appendChild(det);
    }
    if (m.liberadoApps) c.appendChild(h("div", "", "✅ Ya liberaste " + U.tam(m.liberadoApps) + " desinstalando apps."));
    return c;
  }
  function cajaPapelera(m, rerender) {
    var c = h("div", "caja"); c.appendChild(h("h3", "", "🗑️ Papelera de Renace"));
    if (!m.items.length) { c.appendChild(h("div", "", "La papelera está vacía. 🎉")); return c; }
    c.appendChild(h("div", "suave", m.items.length + " archivos · " + U.tam(m.bytes) + ". Se borran solos a los 7 días. **Mientras estén aquí siguen ocupando espacio.**"));
    c.appendChild(boton("Vaciar papelera ahora (libera " + U.tam(m.bytes) + ")", "peligro", async function () {
      if (!(await confirmar("¿Vaciar la papelera?", "Se borran DE VERDAD " + m.items.length + " archivos (" + U.tam(m.bytes) + "). Esto no se puede deshacer.", "Vaciar", true))) return;
      var r = await S.accion(m, "vaciar", {}); await publicar(r.nuevos, rerender);
    }));
    m.items.slice(0, 40).forEach(function (p) {
      var f = h("div", "fila-arch"); f.appendChild(h("div", "mini", ICONOS_VISTA[U.categoria(p.nombre)] || "📁"));
      var d = h("div", "dat"); d.appendChild(h("div", "n", p.nombre)); d.appendChild(h("div", "ruta", "Venía de: " + U.carpetaDe(U.acortar(p.original, S.getBase())))); d.appendChild(h("div", "ruta", U.tam(p.tam) + " · en papelera " + U.hace(p.borradoEn))); f.appendChild(d);
      var a = h("div", "acc");
      a.appendChild(boton("↩️ Restaurar", "sec chico", async function () { var r = await S.accion(m, "restaurar", { id: p.id }); await publicar(r.nuevos, rerender); }));
      a.appendChild(boton("Borrar ya", "sec chico", async function () { if (await confirmar("¿Borrar para siempre?", "«" + p.nombre + "» se borra de verdad.", "Borrar", true)) { var r = await S.accion(m, "borrarYa", { id: p.id }); await publicar(r.nuevos, rerender); } }));
      f.appendChild(a); c.appendChild(f);
    });
    return c;
  }
  function cajaAnalisis(an) {
    var d = h("details", "analisis"); d.appendChild(h("summary", "", "🔤 Ver análisis de tu mensaje"));
    an.forEach(function (p, i) {
      var b = h("div"); b.style.marginTop = "8px";
      b.appendChild(h("div", "", "Parte " + (i + 1) + ": «" + p.texto + "» → acción: " + (p.intencion || "no la reconocí") + " · entendí " + p.cobertura + " % de las palabras"));
      var w = h("div"); p.palabras.forEach(function (x) { var s = h("span", "chip"); s.innerHTML = U.esc(x.w) + " <small>" + U.esc(x.t) + "</small>"; w.appendChild(s); }); b.appendChild(w);
      if (p.filtros.length) b.appendChild(h("div", "", "Lo que busco: " + p.filtros.join(" · ")));
      if (p.sinEntender.length) b.appendChild(h("div", "", "No entendí: " + p.sinEntender.join(", ")));
      d.appendChild(b);
    });
    return d;
  }

  function botMsg(m) { return Object.assign({ id: U.id(), rol: "bot", ts: Date.now() }, m); }
  async function publicar(nuevos, rerender) {
    var chat = chatActual();
    (nuevos || []).forEach(function (n) { chat.mensajes.push(botMsg(n)); });
    chat.actualizado = Date.now(); await guardar(); pintarMensajes(true);
  }

  function pintarMensajes(abajo) {
    var cont = $("mensajes"), chat = chatActual(); var pos = cont.scrollTop; cont.innerHTML = "";
    $("tituloChat").textContent = chat.titulo;
    chat.mensajes.forEach(function (m, idx) {
      var fila = h("div", "fila " + (m.rol === "usuario" ? "usuario" : "bot"));
      var rer = function () { pintarMensajes(false); };
      if (m.rol === "usuario") {
        fila.appendChild(h("div", "burbuja", m.texto));
        var ac = h("div", "acciones-msg");
        var ed = h("button", "", "✏️ Editar" + (m.editado ? " (editado)" : "")); ed.onclick = function () { editar(m, fila); }; ac.appendChild(ed);
        fila.appendChild(ac);
      } else if (m.tipo === "texto") { var b = h("div", "burbuja"); b.innerHTML = md(m.texto); fila.appendChild(b); }
      else if (m.tipo === "pensando") fila.appendChild(h("div", "burbuja pensando", m.texto));
      else if (m.tipo === "espacio") fila.appendChild(cajaEspacio(m));
      else if (m.tipo === "permiso") fila.appendChild(cajaPermiso(m, m));
      else if (m.tipo === "lista") fila.appendChild(cajaLista(m));
      else if (m.tipo === "organizar") fila.appendChild(cajaOrganizar(m, m, rer));
      else if (m.tipo === "informe") fila.appendChild(cajaInforme(m, rer));
      else if (m.tipo === "tarjetas") fila.appendChild(cajaTarjetas(m, rer));
      else if (m.tipo === "duplicados") fila.appendChild(cajaDuplicados(m, rer));
      else if (m.tipo === "apps") fila.appendChild(cajaApps(m, m, rer));
      else if (m.tipo === "papelera") fila.appendChild(cajaPapelera(m, rer));
      if (m.analisis) fila.appendChild(cajaAnalisis(m.analisis));
      cont.appendChild(fila);
    });
    if (abajo) cont.scrollTop = cont.scrollHeight; else cont.scrollTop = pos;
  }
  function pintarTodo() { pintarMensajes(true); }

  async function editar(m, fila) {
    if (ocupado) return;
    var chat = chatActual();
    var r = await modal({ titulo: "Editar mensaje", input: m.texto, botones: [{ t: "Cancelar", v: false, cls: "sec" }, { t: "Guardar y responder", v: true }] });
    if (!r || !r.trim()) return;
    var i = chat.mensajes.indexOf(m);
    m.texto = r.trim(); m.editado = true;
    chat.mensajes = chat.mensajes.slice(0, i + 1);   // lo que venía después se descarta y se vuelve a responder
    await guardar(); pintarMensajes(true); await responder(m.texto);
  }

  async function responder(texto) {
    var chat = chatActual(); ocupado = true; $("enviarBtn").disabled = true;
    var pens = botMsg({ tipo: "pensando", texto: "Pensando…" }); chat.mensajes.push(pens); pintarMensajes(true);
    var ctx = { progreso: function (t) { if (t) { pens.texto = t; var e = $("mensajes").querySelector(".pensando:last-child, .fila:last-child .pensando"); if (e) e.textContent = t; } } };
    var r;
    try { r = await S.responder(texto, ctx); } catch (e) { r = { mensajes: [{ tipo: "texto", texto: "Algo salió mal: " + (e.message || e) + ". No se borró nada." }], analisis: null }; }
    chat.mensajes = chat.mensajes.filter(function (x) { return x !== pens; });
    r.mensajes.forEach(function (m, i) { var bm = botMsg(m); if (i === r.mensajes.length - 1 && r.analisis) bm.analisis = r.analisis; chat.mensajes.push(bm); });
    chat.actualizado = Date.now(); ocupado = false; $("enviarBtn").disabled = !$("entrada").value.trim();
    await guardar(); pintarMensajes(true);
  }
  async function enviar(texto) {
    texto = (texto || "").trim(); if (!texto || ocupado) return;
    var chat = chatActual();
    chat.mensajes.push({ id: U.id(), rol: "usuario", tipo: "texto", texto: texto, ts: Date.now() });
    if (chat.titulo === "Chat nuevo") chat.titulo = texto.slice(0, 32);
    $("entrada").value = ""; autoajustar(); await guardar(); pintarMensajes(true); await responder(texto);
  }
  function autoajustar() { var e = $("entrada"); e.style.height = "auto"; e.style.height = Math.min(130, e.scrollHeight) + "px"; $("enviarBtn").disabled = ocupado || !e.value.trim(); }

  // ---------------- ajustes ----------------
  async function abrirAjustes() {
    var cu = $("ajustesCuerpo"); cu.innerHTML = ""; $("ajustes").style.display = "flex"; abrirCajon(false);
    var p = await N.permisos();
    var c1 = h("div", "caja"); c1.appendChild(h("h3", "", "🔐 Permisos"));
    c1.appendChild(h("div", "", (p.archivos ? "✅" : "❌") + " Ver y administrar archivos"));
    if (!p.archivos) c1.appendChild(boton("Activar", "chico", function () { N.pedirPermisoArchivos(); }));
    c1.appendChild(h("div", "", (p.usoApps ? "✅" : "❌") + " Ver el uso de apps"));
    if (!p.usoApps) c1.appendChild(boton("Activar", "chico", function () { N.pedirPermisoUso(); }));
    c1.appendChild(h("div", "suave", "Tu teléfono: " + (p.modelo || "") + " · Android " + (p.android || "")));
    cu.appendChild(c1);
    function slider(titulo, clave, min, max, unidad) {
      var c = h("div", "caja"); c.appendChild(h("h3", "", titulo));
      var val = h("div", "grande", estado.ajustes[clave] + " " + unidad); c.appendChild(val);
      var r = h("input"); r.type = "range"; r.min = min; r.max = max; r.value = estado.ajustes[clave];
      r.oninput = function () { val.textContent = r.value + " " + unidad; }; r.onchange = async function () { estado.ajustes[clave] = parseInt(r.value, 10); S.estado.ajustes = estado.ajustes; await RN.almacen.set("ajustes", estado.ajustes); };
      c.appendChild(r); c.appendChild(h("div", "suave", "Más pequeño = Renace te muestra más archivos.")); cu.appendChild(c);
    }
    slider("¿Qué es un archivo «grande»?", "minGrande", 5, 500, "MB");
    slider("¿Qué es una foto «pesada»?", "minFoto", 1, 30, "MB");
    var c3 = h("div", "caja"); c3.appendChild(h("h3", "", "🔒 Conservar siempre (" + estado.protegidos.length + ")"));
    if (!estado.protegidos.length) c3.appendChild(h("div", "suave", "Aquí aparecen los archivos que marcas con «Conservar siempre». Renace nunca te los sugiere."));
    estado.protegidos.forEach(function (r) {
      var f = h("div", "fila-arch"); var d = h("div", "dat"); d.appendChild(h("div", "ruta", U.acortar(r, S.getBase()))); f.appendChild(d);
      f.appendChild(boton("Quitar", "sec chico", async function () { estado.protegidos = estado.protegidos.filter(function (x) { return x !== r; }); S.estado.protegidos = estado.protegidos; await RN.almacen.set("protegidos", estado.protegidos); abrirAjustes(); }));
      c3.appendChild(f);
    });
    c3.appendChild(h("div", "suave", "Los documentos importantes (PDF, Word, Excel...) están protegidos siempre; solo se borran si tú entras a verlos y confirmas."));
    cu.appendChild(c3);
  }

  // ---------------- arranque ----------------
  var SUGERENCIAS = ["💾 ¿Cuánto espacio me queda?", "🌱 Renace mi teléfono", "👯 Busca archivos duplicados", "📲 Muéstrame las apps que no uso", "🗂️ Organízame la carpeta de Descargas"];
  async function iniciar() {
    estado.chats = await RN.almacen.get("chats", []);
    estado.ajustes = Object.assign(estado.ajustes, await RN.almacen.get("ajustes", {}));
    estado.protegidos = await RN.almacen.get("protegidos", []);
    S.estado.ajustes = estado.ajustes; S.estado.protegidos = estado.protegidos; S.estado.guardarProtegidos = function () { RN.almacen.set("protegidos", estado.protegidos); };
    if (!estado.chats.length) {
      var c = nuevoChat(); c.titulo = "Bienvenida a Renace";
      c.mensajes.push(botMsg({ tipo: "texto", texto: "¡Hola! 🌱 Soy **Renace**. Te ayudo a que tu teléfono vuelva a ir fluido: busco archivos repetidos, grandes o que ya no sirven, y apps que no usas.\n\n**Nunca borro nada sin tu permiso**, archivo por archivo, y lo borrado espera 7 días en una papelera.\n\nToca una de las ideas de abajo o escríbeme lo que necesitas." }));
    }
    estado.chatId = estado.chats[0].id;
    if (!RN.esNativo && RN.modo !== "termux" && !estado.avisoDemo) { estado.avisoDemo = true; chatActual().mensajes.push(botMsg({ tipo: "texto", texto: "ℹ️ Estás viendo la **demostración** con archivos de mentira. Para usar Renace con tus archivos reales, inicia el servidor desde Termux (mira las instrucciones)." })); }
    if (RN.modo === "termux") { var chat0 = estado.chats[estado.chats.length - 1]; if (chat0 && !chat0.avisoTermux) { chat0.avisoTermux = true; chatActual().mensajes.push(botMsg({ tipo: "texto", texto: "🧪 **Modo Termux**: estoy trabajando con tus archivos reales. Lo borrado va a la papelera de Renace (carpeta Renace/Papelera) 7 días. Las apps sin usar solo se ven en la APK." })); } }
    var p = await N.permisos();
    if (!p.archivos) chatActual().mensajes.push(botMsg({ tipo: "permiso", cual: "archivos", texto: "Para revisar tus archivos necesito un permiso de Android. Toca el botón, busca **Renace** y activa «Permitir acceso para administrar todos los archivos». Después vuelve aquí." }));
    try { await N.vaciarPapelera({ soloVencidos: true }); } catch (e) {}
    await guardar(); pintarTodo(); pintarChats();

    var sg = $("sugerencias"); SUGERENCIAS.forEach(function (t) { var b = h("button", "", t); b.onclick = function () { enviar(t.replace(/^\S+\s/, "")); }; sg.appendChild(b); });
    $("menuBtn").onclick = function () { abrirCajon(true); };
    $("velo").onclick = function () { abrirCajon(false); };
    $("nuevoChat").onclick = async function () { var c2 = nuevoChat(); estado.chatId = c2.id; await guardar(); abrirCajon(false); pintarTodo(); $("entrada").focus(); };
    $("buscarChats").oninput = pintarChats;
    $("chatMenuBtn").onclick = function () { menuChat(chatActual()); };
    $("enviarBtn").onclick = function () { enviar($("entrada").value); };
    $("entrada").addEventListener("input", autoajustar);
    $("entrada").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !/Android|iPhone/i.test(navigator.userAgent)) { e.preventDefault(); enviar($("entrada").value); } });
    $("micBtn").onclick = async function () {
      try { var r = await N.dictar(); if (r.texto) { $("entrada").value = r.texto; autoajustar(); $("entrada").focus(); } else toast("No escuché nada. Intenta de nuevo."); }
      catch (e) { toast(e.message || "No pude usar el micrófono."); }
    };
    $("ajustesCerrar").onclick = function () { $("ajustes").style.display = "none"; };
    document.querySelectorAll("[data-atajo]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-atajo"); abrirCajon(false);
        if (a === "ajustes") return abrirAjustes();
        enviar(a === "espacio" ? "¿Cuánto espacio me queda?" : a === "apps" ? "Muéstrame las apps que no uso" : "Muéstrame la papelera");
      };
    });
    // al volver de desinstalar una app, se revisa si de verdad se quitó
    document.addEventListener("visibilitychange", async function () {
      if (document.visibilityState !== "visible" || !appsPendientes.length) return;
      var pend = appsPendientes.slice(); appsPendientes = [];
      for (var i = 0; i < pend.length; i++) { var r = await S.accion(pend[i].msg, "verificarApp", { paquete: pend[i].paquete }); await publicar(r.nuevos); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { abrirCajon(false); $("modalVelo").style.display = "none"; } });
  }
  window.addEventListener("DOMContentLoaded", iniciar);
})();
