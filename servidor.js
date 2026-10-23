#!/usr/bin/env node
// 🌱 Renace en Termux - servidor local (sin dependencias, Node 18+)
// Sirve la pantalla de Renace y hace lo mismo que la parte nativa de Android, pero sobre tu almacenamiento real.
// Seguridad: solo escucha en 127.0.0.1 y exige una clave secreta que se genera cada vez que lo inicias.
// Regla de oro: nada se borra sin que la persona lo apruebe en la pantalla; lo "borrado" va a la papelera 7 días.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PUERTO = Number(process.env.RENACE_PUERTO) || 8765;
const WWW = path.join(__dirname, "..", "www");
let RAIZ = process.env.RENACE_RAIZ || path.join(os.homedir(), "storage", "shared");
try { RAIZ = fs.realpathSync(RAIZ); } catch { /* se avisa más abajo */ }
const PAPELERA = path.join(RAIZ, "Renace", "Papelera");
const TOKEN = crypto.randomBytes(12).toString("hex");

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ext = (n) => { const i = n.lastIndexOf("."); return i < 0 ? "" : n.slice(i + 1).toLowerCase(); };
const conj = (s) => new Set(s.split(" "));
const EXT_IMG = conj("jpg jpeg png webp gif heic heif bmp"), EXT_TEMP = conj("tmp temp bak crdownload part partial swp old");
const EXT_TEXTO = conj("txt md csv json log html htm xml js java py ini conf srt vcf yml yaml kt css sql rtf");
const EXT_OFFICE = conj("docx xlsx pptx odt ods odp"), EXT_AUDIO = conj("mp3 m4a ogg wav aac opus flac amr"), EXT_VIDEO = conj("mp4 mkv 3gp avi mov webm m4v");

let cancelar = false;
const prog = { archivos: 0, ruta: "", fase: "" };
const yieldLoop = () => new Promise((r) => setImmediate(r));
const sinPermiso = () => { try { fs.readdirSync(RAIZ); return false; } catch { return true; } };

// ---------- seguridad de rutas ----------
function seguro(p) {
  const r = path.resolve(String(p || ""));
  if (r !== RAIZ && !r.startsWith(RAIZ + path.sep)) throw new Error("Esa ruta está fuera del almacenamiento: no la toco.");
  return r;
}
const item = (p, st, nombre) => ({ ruta: p, nombre: nombre || path.basename(p), tam: st.isDirectory() ? 0 : st.size, fecha: st.mtimeMs, dir: st.isDirectory() });

async function caminar(raiz, v) {
  const pila = [raiz]; let n = 0;
  while (pila.length && !cancelar) {
    const d = pila.pop(); let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
    if (v.carpeta) v.carpeta(d, ents.length);
    for (const e of ents) {
      if (cancelar) return;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (p !== PAPELERA && !p.startsWith(PAPELERA + path.sep)) pila.push(p); }
      else if (e.isFile()) {
        let st; try { st = await fs.promises.stat(p); } catch { continue; }
        v.archivo(p, e.name, st);
        if (++n % 400 === 0) { prog.archivos += 400; prog.ruta = d; await yieldLoop(); }
      }
    }
  }
}
const raicesDe = (a) => { const r = (a.raices || []).map(seguro); return r.length ? r : [RAIZ]; };

// ---------- tamaño de imágenes (sin descargar ni abrir nada extra) ----------
function dimensiones(b) {
  try {
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const f = b.toString("ascii", 12, 16);
      if (f === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (f === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* formato raro */ }
  return null;
}
async function leerInicio(p, max) {
  const fh = await fs.promises.open(p, "r");
  try { const b = Buffer.alloc(max); const { bytesRead } = await fh.read(b, 0, max, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); }
}

// ---------- huellas para duplicados ----------
async function hashRapido(p, tam) {
  const h = crypto.createHash("sha256"), fh = await fs.promises.open(p, "r");
  try {
    const b = Buffer.alloc(65536);
    let r = await fh.read(b, 0, 65536, 0); h.update(b.subarray(0, r.bytesRead));
    if (tam > 131072) { r = await fh.read(b, 0, 65536, tam - 65536); h.update(b.subarray(0, r.bytesRead)); }
  } finally { await fh.close(); }
  return h.digest("hex");
}
function hashCompleto(p) {
  return new Promise((ok, no) => {
    const h = crypto.createHash("sha256"), s = fs.createReadStream(p, { highWaterMark: 65536 });
    s.on("data", (c) => { if (cancelar) s.destroy(); else h.update(c); });
    s.on("error", no); s.on("close", () => ok(cancelar ? "" : h.digest("hex"))); s.on("end", () => {});
  });
}

// ---------- papelera ----------
const indiceF = () => path.join(PAPELERA, "_indice.json");
const leerIndice = () => { try { return JSON.parse(fs.readFileSync(indiceF(), "utf8")); } catch { return []; } };
const guardarIndice = (a) => { fs.mkdirSync(PAPELERA, { recursive: true }); fs.writeFileSync(indiceF() + ".tmp", JSON.stringify(a)); fs.renameSync(indiceF() + ".tmp", indiceF()); };
function moverArchivo(de, a) {
  try {
    fs.mkdirSync(path.dirname(a), { recursive: true });
    try { fs.renameSync(de, a); return true; } catch { /* otro volumen */ }
    fs.copyFileSync(de, a);
    if (fs.statSync(a).size === fs.statSync(de).size) { fs.unlinkSync(de); return true; }
    fs.unlinkSync(a);
    return false;
  } catch { return false; }
}
function ejecutarCmd(cmd, args, ms) {
  return new Promise((ok, no) => execFile(cmd, args, { timeout: ms || 15000, maxBuffer: 8 * 1024 * 1024 }, (e, out) => (e ? no(e) : ok(out))));
}
const limpiarXml = (xml, cierre) => xml.split(cierre).join("\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

// ======================= MÉTODOS (los mismos que la parte nativa de Android) =======================
const M = {
  async permisos() { return { archivos: !sinPermiso(), usoApps: false, sdk: 0, modelo: os.hostname(), android: "Termux" }; },
  async pedirPermisoArchivos() { throw new Error("Cierra esto y en Termux escribe: termux-setup-storage  (y acepta el permiso)."); },
  async pedirPermisoUso() { throw new Error("Eso solo está en la app instalada (APK). En Termux no se puede ver el uso de apps."); },
  async espacio() {
    const sf = fs.statfsSync(RAIZ);
    let ramLibre = os.freemem();
    try { const m = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/); if (m) ramLibre = Number(m[1]) * 1024; } catch { /* usa os.freemem */ }
    return { total: sf.blocks * sf.bsize, libre: sf.bavail * sf.bsize, base: RAIZ, ramTotal: os.totalmem(), ramLibre };
  },
  async cancelar() { cancelar = true; return {}; },

  async listar(a) {
    const r = seguro(a.ruta || RAIZ), out = [];
    for (const e of fs.readdirSync(r, { withFileTypes: true }).slice(0, 5000)) { try { out.push(item(path.join(r, e.name), fs.statSync(path.join(r, e.name)))); } catch { /* ilegible */ } }
    return { ruta: r, archivos: out };
  },

  async buscar(a) {
    cancelar = false; prog.archivos = 0; prog.fase = "buscando";
    const terms = norm(a.nombre || "").split(/\s+/).filter(Boolean), exts = new Set(a.extensiones || []), max = a.max || 400, hall = [];
    let coincidencias = 0, revisados = 0;
    for (const raiz of raicesDe(a)) {
      await caminar(raiz, { archivo(p, n, st) {
        revisados++;
        if (exts.size && !exts.has(ext(n))) return;
        if (a.minTam && st.size < a.minTam) return;
        if (a.maxTam && st.size > a.maxTam) return;
        if (a.desde && st.mtimeMs < a.desde) return;
        if (a.hasta && st.mtimeMs > a.hasta) return;
        if (terms.length) { const nn = norm(n); for (const t of terms) if (!nn.includes(t)) return; }
        coincidencias++;
        if (hall.length < max) hall.push(item(p, st, n));
      } });
    }
    hall.sort((x, y) => y.fecha - x.fecha);
    return { archivos: hall, revisados, coincidencias, truncado: coincidencias > max };
  },

  async escanear(a) {
    cancelar = false; prog.archivos = 0; prog.fase = "escaneando";
    const minG = a.minGrande || 50 * 1048576, minF = a.minFoto || 5 * 1048576, max = a.max || 150;
    const grandes = [], fotos = [], apks = [], temporales = [], vacias = [], mini = { cantidad: 0, tam: 0, muestras: [] };
    let total = 0, bytes = 0;
    for (const raiz of raicesDe(a)) {
      await caminar(raiz, {
        archivo(p, n, st) {
          total++; bytes += st.size;
          const e = ext(n), ln = n.toLowerCase();
          if (p.includes(path.sep + ".thumbnails" + path.sep) || ln === "thumbs.db" || ln.startsWith(".thumbdata")) { mini.cantidad++; mini.tam += st.size; if (mini.muestras.length < 300) mini.muestras.push(item(p, st, n)); }
          else if (e === "apk") apks.push(item(p, st, n));
          else if (EXT_TEMP.has(e) || ln.endsWith("~")) temporales.push(item(p, st, n));
          else if (EXT_IMG.has(e) && st.size >= minF) fotos.push(item(p, st, n));
          else if (st.size >= minG) grandes.push(item(p, st, n));
        },
        carpeta(d, hijos) { if (hijos === 0 && d !== raiz) vacias.push({ ruta: d, nombre: path.basename(d), tam: 0, fecha: Date.now(), dir: true }); },
      });
    }
    const top = (l) => l.sort((x, y) => y.tam - x.tam).slice(0, max);
    return { grandes: top(grandes), fotos: top(fotos), apks: top(apks), temporales: top(temporales), carpetasVacias: vacias.slice(0, max), totalVacias: vacias.length, miniaturas: mini, totalArchivos: total, totalBytes: bytes, cancelado: cancelar };
  },

  async duplicados(a) {
    cancelar = false; prog.archivos = 0; prog.fase = "agrupando";
    const minTam = a.minTam || 30 * 1024, porTam = new Map();
    let cont = 0;
    for (const raiz of raicesDe(a)) await caminar(raiz, { archivo(p, n, st) { cont++; if (st.size < minTam) return; const l = porTam.get(st.size) || []; l.push(item(p, st, n)); porTam.set(st.size, l); } });
    const grupos = []; let analizados = 0; prog.fase = "comparando";
    for (const [tam, lista] of porTam) {
      if (cancelar) break;
      if (lista.length < 2) continue;
      const rap = new Map();
      for (const f of lista) { analizados++; if (analizados % 20 === 0) { prog.archivos = analizados; prog.ruta = path.dirname(f.ruta); await yieldLoop(); } try { const h = await hashRapido(f.ruta, tam); (rap.get(h) || rap.set(h, []).get(h)).push(f); } catch { /* ilegible */ } }
      for (const cand of rap.values()) {
        if (cand.length < 2) continue;
        const parcial = tam > 300 * 1048576, fin = new Map();
        for (const f of cand) { try { const h = parcial ? "p" : await hashCompleto(f.ruta); (fin.get(h) || fin.set(h, []).get(h)).push(f); } catch { /* ilegible */ } }
        for (const iguales of fin.values()) if (iguales.length >= 2) { iguales.sort((x, y) => x.fecha - y.fecha); grupos.push({ tam, parcial, archivos: iguales, recuperable: tam * (iguales.length - 1) }); }
      }
    }
    grupos.sort((x, y) => y.recuperable - x.recuperable);
    return { grupos: grupos.slice(0, 80), totalGrupos: grupos.length, recuperable: grupos.reduce((s, g) => s + g.recuperable, 0), revisados: cont, cancelado: cancelar };
  },

  async resumen(a) {
    const p = seguro(a.ruta);
    if (!fs.existsSync(p)) throw new Error("El archivo ya no existe.");
    const st = fs.statSync(p), e = ext(p), r = { tam: st.size, fecha: st.mtimeMs, tipo: "otro", texto: "", extra: {} };
    if (EXT_TEXTO.has(e)) { r.tipo = "texto"; r.texto = (await leerInicio(p, 24000)).toString("utf8"); }
    else if (EXT_OFFICE.has(e)) {
      r.tipo = "documento";
      const entrada = e === "docx" ? ["word/document.xml", "</w:p>"] : e === "xlsx" ? ["xl/sharedStrings.xml", "</si>"] : e === "pptx" ? ["ppt/slides/slide1.xml", "</a:p>"] : ["content.xml", "</text:p>"];
      try { r.texto = limpiarXml(await ejecutarCmd("unzip", ["-p", p, entrada[0]]), entrada[1]).slice(0, 24000); }
      catch { r.extra.sinLector = true; }
    } else if (e === "pdf") { r.tipo = "pdf"; }
    else if (e === "zip" || e === "jar") {
      r.tipo = "comprimido";
      try { const l = (await ejecutarCmd("unzip", ["-Z1", p])).split("\n").filter(Boolean); r.extra.entradas = l.length; r.texto = l.slice(0, 40).join("\n"); } catch { /* sin unzip */ }
    } else if (e === "apk") { r.tipo = "apk"; }
    else if (EXT_IMG.has(e)) { r.tipo = "imagen"; const d = dimensiones(await leerInicio(p, 65536)); if (d) { r.extra.ancho = d.w; r.extra.alto = d.h; } }
    else if (EXT_AUDIO.has(e)) r.tipo = "audio";
    else if (EXT_VIDEO.has(e)) r.tipo = "video";
    else if (st.size > 0) { const m = await leerInicio(p, 512); if (!m.includes(0)) { r.tipo = "texto"; r.texto = (await leerInicio(p, 24000)).toString("utf8"); } }
    return r;
  },

  async abrirArchivo(a) {
    const p = seguro(a.ruta);
    if (!fs.existsSync(p)) throw new Error("El archivo ya no existe.");
    try { await ejecutarCmd("termux-open", [p]); } catch { throw new Error("Para abrir archivos desde Termux instala: pkg install termux-api (y la app Termux:API)."); }
    return {};
  },

  async moverAPapelera(a) {
    fs.mkdirSync(PAPELERA, { recursive: true });
    const indice = leerIndice(), movidos = [], fallos = []; let bytes = 0; const ahora = Date.now();
    (a.rutas || []).forEach((ruta, i) => {
      let src; try { src = seguro(ruta); } catch (e) { fallos.push({ ruta, motivo: e.message }); return; }
      if (!fs.existsSync(src)) { fallos.push({ ruta, motivo: "ya no existe" }); return; }
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        if (fs.readdirSync(src).length === 0) { try { fs.rmdirSync(src); movidos.push(ruta); } catch { fallos.push({ ruta, motivo: "no pude quitar la carpeta" }); } }
        else fallos.push({ ruta, motivo: "la carpeta no está vacía" });
        return;
      }
      const id = ahora + "_" + i, dest = path.join(PAPELERA, id + "_" + path.basename(src));
      if (moverArchivo(src, dest)) { indice.push({ id, nombre: path.basename(src), original: src, destino: dest, tam: st.size, borradoEn: ahora }); movidos.push(ruta); bytes += st.size; }
      else fallos.push({ ruta, motivo: "no me dejó moverlo" });
    });
    guardarIndice(indice);
    return { movidos, fallos, bytes };
  },
  async listarPapelera() {
    const items = leerIndice().filter((x) => fs.existsSync(x.destino));
    return { items, bytes: items.reduce((s, x) => s + (x.tam || 0), 0) };
  },
  async restaurar(a) {
    const quiero = new Set(a.ids || []), resto = []; let ok = 0;
    for (const it of leerIndice()) {
      if (!quiero.has(it.id)) { resto.push(it); continue; }
      let dest = it.original;
      if (fs.existsSync(dest)) dest = path.join(path.dirname(dest), "(recuperado) " + path.basename(dest));
      if (moverArchivo(it.destino, dest)) ok++; else resto.push(it);
    }
    guardarIndice(resto);
    return { restaurados: ok };
  },
  async vaciarPapelera(a) {
    const limite = Date.now() - 7 * 86400000, quiero = a.ids ? new Set(a.ids) : null, resto = []; let bytes = 0, n = 0;
    for (const it of leerIndice()) {
      const borrar = quiero ? quiero.has(it.id) : !a.soloVencidos || it.borradoEn < limite;
      if (!borrar) { resto.push(it); continue; }
      try { if (fs.existsSync(it.destino)) fs.unlinkSync(it.destino); bytes += it.tam || 0; n++; } catch { resto.push(it); }
    }
    guardarIndice(resto);
    return { borrados: n, bytes };
  },
  async mover(a) {
    const movidos = [], fallos = [];
    for (const m of a.movimientos || []) {
      let de, dest;
      try { de = seguro(m.de); dest = seguro(m.a); } catch { fallos.push(m.de); continue; }
      if (!fs.existsSync(de)) { fallos.push(m.de); continue; }
      let k = 1;
      while (fs.existsSync(dest)) { const ex = path.extname(dest); dest = path.join(path.dirname(dest), path.basename(dest, ex) + " (" + k + ")" + ex); k++; }
      if (moverArchivo(de, dest)) movidos.push({ de, a: dest }); else fallos.push(m.de);
    }
    return { movidos, fallos };
  },

  async listarApps() { return { apps: [], usoPermitido: false, noDisponible: true }; },
  async desinstalarApp() { throw new Error("Desinstalar apps solo funciona en la app instalada (APK)."); },
  async existeApp() { return { existe: true }; },
  async dictar() {
    try { const t = (await ejecutarCmd("termux-speech-to-text", [], 40000)).trim(); return { texto: t }; }
    catch { throw new Error("Para dictar desde Termux instala: pkg install termux-api (y la app Termux:API)."); }
  },
};

// ======================= SERVIDOR HTTP =======================
const TIPOS = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", json: "application/json", pdf: "application/pdf", mp4: "video/mp4", mp3: "audio/mpeg", txt: "text/plain; charset=utf-8", ico: "image/x-icon" };
const VISTA_OK = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4", "mp3", "m4a", "ogg", "wav", "pdf", "txt"]);
const json = (res, cod, o) => { res.writeHead(cod, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
const tokenOk = (req, url) => (req.headers["x-renace"] || url.searchParams.get("t")) === TOKEN;

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/ping") return tokenOk(req, url) ? json(res, 200, { ok: "renace-termux" }) : json(res, 401, { error: "falta la clave" });
    if (url.pathname === "/api/progreso") return tokenOk(req, url) ? json(res, 200, prog) : json(res, 401, { error: "falta la clave" });
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      if (!tokenOk(req, url)) return json(res, 401, { error: "falta la clave" });
      const m = url.pathname.slice(5);
      if (!Object.prototype.hasOwnProperty.call(M, m)) return json(res, 404, { error: "no existe " + m });
      let cuerpo = ""; for await (const c of req) { cuerpo += c; if (cuerpo.length > 1e6) return json(res, 413, { error: "muy grande" }); }
      let args = {}; try { args = cuerpo ? JSON.parse(cuerpo) : {}; } catch { /* sin datos */ }
      try { return json(res, 200, await M[m](args)); } catch (e) { return json(res, 500, { error: e.message || String(e) }); }
    }
    if (url.pathname === "/archivo") {
      if (!tokenOk(req, url)) { res.writeHead(401); return res.end("falta la clave"); }
      const p = seguro(url.searchParams.get("ruta")), e = ext(p);
      if (!VISTA_OK.has(e) || !fs.existsSync(p)) { res.writeHead(404); return res.end("no disponible"); }
      res.writeHead(200, { "Content-Type": TIPOS[e] || "application/octet-stream", "Cache-Control": "private, max-age=600", "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" });
      return fs.createReadStream(p).pipe(res);
    }
    // pantalla (archivos de www)
    let rel = decodeURIComponent(url.pathname); if (rel === "/") rel = "/index.html";
    const f = path.normalize(path.join(WWW, rel));
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("no encontrado"); }
    res.writeHead(200, { "Content-Type": TIPOS[ext(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { json(res, 500, { error: e.message }); }
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  const enlace = `http://localhost:${PUERTO}/?t=${TOKEN}`;
  console.log("\n🌱 Renace (modo Termux) listo");
  console.log("📂 Almacenamiento: " + RAIZ);
  if (sinPermiso()) console.log("⚠️  No puedo leer el almacenamiento. En Termux escribe: termux-setup-storage  (acepta el permiso) y vuelve a iniciar.");
  console.log("\n👉 Abre este enlace en el navegador del celular:\n   " + enlace + "\n");
  console.log("(La clave del enlace cambia cada vez que inicias Renace. Para cerrar: Ctrl + C)\n");
  execFile("termux-open-url", [enlace], () => {});
});
