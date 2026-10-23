package com.renace.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.os.StatFs;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Parte nativa de Renace. Todo lo que toca archivos, apps y el espacio del teléfono pasa por aquí.
 * Regla de oro: nada se borra sin que la persona lo apruebe desde la pantalla. Lo "borrado" va a la papelera.
 */
@CapacitorPlugin(name = "Renace")
public class RenacePlugin extends Plugin {

    private volatile boolean cancelar = false;

    private static final Set<String> EXT_IMG = new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp"));
    private static final Set<String> EXT_TEMP = new HashSet<>(Arrays.asList("tmp", "temp", "bak", "crdownload", "part", "partial", "swp", "old"));
    private static final Set<String> EXT_TEXTO = new HashSet<>(Arrays.asList("txt", "md", "csv", "json", "log", "html", "htm", "xml", "js", "java", "py", "ini", "conf", "srt", "vcf", "yml", "yaml", "kt", "css", "sql", "rtf"));
    private static final Set<String> EXT_OFFICE = new HashSet<>(Arrays.asList("docx", "xlsx", "pptx", "odt", "ods", "odp"));
    private static final Set<String> EXT_ZIP = new HashSet<>(Arrays.asList("zip", "jar"));
    private static final Set<String> EXT_AUDIO = new HashSet<>(Arrays.asList("mp3", "m4a", "ogg", "wav", "aac", "opus", "flac", "amr"));
    private static final Set<String> EXT_VIDEO = new HashSet<>(Arrays.asList("mp4", "mkv", "3gp", "avi", "mov", "webm", "m4v"));

    // ============================== UTILIDADES ==============================

    private File base() {
        return Environment.getExternalStorageDirectory();
    }

    private File papelera() {
        return new File(base(), "Renace/Papelera");
    }

    private static String extension(String nombre) {
        int i = nombre.lastIndexOf('.');
        return (i < 0 || i == nombre.length() - 1) ? "" : nombre.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    private static String sinTildes(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFD);
        return n.replaceAll("\\p{InCombiningDiacriticalMarks}+", "").toLowerCase(Locale.ROOT);
    }

    private JSObject itemJson(File f) {
        JSObject o = new JSObject();
        o.put("ruta", f.getAbsolutePath());
        o.put("nombre", f.getName());
        o.put("tam", f.length());
        o.put("fecha", f.lastModified());
        o.put("dir", f.isDirectory());
        return o;
    }

    private List<File> raicesDe(JSObject d) {
        List<File> r = new ArrayList<>();
        JSONArray arr = d.optJSONArray("raices");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String p = arr.optString(i, "");
                if (!p.isEmpty()) r.add(new File(p));
            }
        }
        if (r.isEmpty()) r.add(base());
        return r;
    }

    private boolean esEnlace(File d) {
        try {
            File canon = d.getCanonicalFile();
            File padre = d.getParentFile();
            if (padre == null) return false;
            File esperado = new File(padre.getCanonicalFile(), d.getName());
            return !canon.equals(esperado);
        } catch (Exception e) {
            return true;
        }
    }

    private boolean saltar(File d) {
        if (d.getAbsolutePath().startsWith(papelera().getAbsolutePath())) return true;
        return esEnlace(d);
    }

    private interface Visitante {
        void archivo(File f);

        void carpeta(File d, int hijos);
    }

    /** Recorre carpetas sin recursión (para no desbordar la memoria en teléfonos lentos). */
    private void caminar(File raiz, Visitante v) {
        ArrayList<File> pila = new ArrayList<>();
        pila.add(raiz);
        while (!pila.isEmpty() && !cancelar) {
            File d = pila.remove(pila.size() - 1);
            File[] hijos;
            try {
                hijos = d.listFiles();
            } catch (SecurityException e) {
                continue;
            }
            if (hijos == null) continue;
            v.carpeta(d, hijos.length);
            for (File f : hijos) {
                if (cancelar) return;
                if (f.isDirectory()) {
                    if (!saltar(f)) pila.add(f);
                } else {
                    v.archivo(f);
                }
            }
        }
    }

    private void progreso(long archivos, String ruta, String fase) {
        JSObject p = new JSObject();
        p.put("archivos", archivos);
        p.put("ruta", ruta);
        p.put("fase", fase);
        notifyListeners("progreso", p);
    }

    private static byte[] leerBytes(File f, int max) throws Exception {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while (out.size() < max && (n = in.read(buf, 0, Math.min(buf.length, max - out.size()))) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static void copiar(File de, File a) throws Exception {
        try (InputStream in = new FileInputStream(de); OutputStream out = new FileOutputStream(a)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    /** Mueve un archivo: renombra (rápido) y, si no se puede, copia y borra el original. */
    private static boolean moverArchivo(File de, File a) {
        try {
            File padre = a.getParentFile();
            if (padre != null && !padre.exists()) padre.mkdirs();
            if (de.renameTo(a)) return true;
            copiar(de, a);
            if (a.length() == de.length() && de.delete()) return true;
            a.delete();
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    // ============================== PERMISOS Y ESTADO ==============================

    private boolean tieneAccesoArchivos() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean tieneAccesoUso() {
        try {
            AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int modo = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
            return modo == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void permisos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("archivos", tieneAccesoArchivos());
        r.put("usoApps", tieneAccesoUso());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("modelo", Build.MODEL);
        r.put("android", Build.VERSION.RELEASE);
        call.resolve(r);
    }

    @PluginMethod
    public void pedirPermisoArchivos(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 30) {
                i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                call.resolve();
            } catch (Exception e2) {
                call.reject("No pude abrir los ajustes. Ábrelos a mano: Ajustes > Apps > Renace > Permisos.");
            }
        }
    }

    @PluginMethod
    public void pedirPermisoUso(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No pude abrir los ajustes. Ábrelos a mano: Ajustes > Apps > Acceso especial > Acceso de uso.");
        }
    }

    @PluginMethod
    public void espacio(PluginCall call) {
        try {
            StatFs sf = new StatFs(base().getPath());
            JSObject r = new JSObject();
            r.put("total", sf.getTotalBytes());
            r.put("libre", sf.getAvailableBytes());
            r.put("base", base().getAbsolutePath());
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            r.put("ramTotal", mi.totalMem);
            r.put("ramLibre", mi.availMem);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No pude leer el espacio: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelar(PluginCall call) {
        cancelar = true;
        call.resolve();
    }

    // ============================== ARCHIVOS: LISTAR Y BUSCAR ==============================

    @PluginMethod
    public void listar(final PluginCall call) {
        final String ruta = call.getString("ruta", base().getAbsolutePath());
        new Thread(() -> {
            try {
                File[] hijos = new File(ruta).listFiles();
                if (hijos == null) {
                    call.reject("No puedo abrir esa carpeta (Android la bloquea o falta el permiso).");
                    return;
                }
                JSArray arr = new JSArray();
                int n = 0;
                for (File f : hijos) {
                    if (n++ >= 5000) break;
                    arr.put(itemJson(f));
                }
                JSObject r = new JSObject();
                r.put("ruta", ruta);
                r.put("archivos", arr);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude listar la carpeta: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void buscar(final PluginCall call) {
        final JSObject d = call.getData();
        final List<File> raices = raicesDe(d);
        final String nombre = sinTildes(d.optString("nombre", "")).trim();
        final String[] terminos = nombre.isEmpty() ? new String[0] : nombre.split("\\s+");
        final Set<String> exts = new HashSet<>();
        JSONArray ea = d.optJSONArray("extensiones");
        if (ea != null) for (int i = 0; i < ea.length(); i++) exts.add(ea.optString(i, "").toLowerCase(Locale.ROOT));
        final long minTam = d.optLong("minTam", 0);
        final long maxTam = d.optLong("maxTam", 0);
        final long desde = d.optLong("desde", 0);
        final long hasta = d.optLong("hasta", 0);
        final int max = d.optInt("max", 400);
        cancelar = false;
        new Thread(() -> {
            try {
                final List<File> hallados = new ArrayList<>();
                final long[] total = {0, 0};
                for (File raiz : raices) {
                    caminar(raiz, new Visitante() {
                        @Override
                        public void archivo(File f) {
                            total[0]++;
                            if (total[0] % 800 == 0) progreso(total[0], f.getParent(), "buscando");
                            String nm = f.getName();
                            long len = f.length();
                            if (!exts.isEmpty() && !exts.contains(extension(nm))) return;
                            if (minTam > 0 && len < minTam) return;
                            if (maxTam > 0 && len > maxTam) return;
                            long fe = f.lastModified();
                            if (desde > 0 && fe < desde) return;
                            if (hasta > 0 && fe > hasta) return;
                            if (terminos.length > 0) {
                                String ns = sinTildes(nm);
                                for (String t : terminos) if (!ns.contains(t)) return;
                            }
                            total[1]++;
                            if (hallados.size() < max) hallados.add(f);
                        }

                        @Override
                        public void carpeta(File dir, int hijos) {
                        }
                    });
                }
                Collections.sort(hallados, new Comparator<File>() {
                    @Override
                    public int compare(File a, File b) {
                        return Long.compare(b.lastModified(), a.lastModified());
                    }
                });
                JSArray arr = new JSArray();
                for (File f : hallados) arr.put(itemJson(f));
                JSObject r = new JSObject();
                r.put("archivos", arr);
                r.put("revisados", total[0]);
                r.put("coincidencias", total[1]);
                r.put("truncado", total[1] > max);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude buscar: " + e.getMessage());
            }
        }).start();
    }

    /** Un solo recorrido que junta: archivos grandes, fotos pesadas, APK, temporales, miniaturas y carpetas vacías. */
    @PluginMethod
    public void escanear(final PluginCall call) {
        final JSObject d = call.getData();
        final List<File> raices = raicesDe(d);
        final long minGrande = d.optLong("minGrande", 50L * 1024 * 1024);
        final long minFoto = d.optLong("minFoto", 5L * 1024 * 1024);
        final int max = d.optInt("max", 150);
        cancelar = false;
        new Thread(() -> {
            try {
                final List<File> grandes = new ArrayList<>(), fotos = new ArrayList<>(), apks = new ArrayList<>(), temporales = new ArrayList<>(), vacias = new ArrayList<>();
                final long[] c = {0, 0, 0, 0}; // archivos, bytes, miniaturas (cantidad), miniaturas (bytes)
                final List<File> muestrasMini = new ArrayList<>();
                for (final File raiz : raices) {
                    caminar(raiz, new Visitante() {
                        @Override
                        public void archivo(File f) {
                            c[0]++;
                            if (c[0] % 800 == 0) progreso(c[0], f.getParent(), "escaneando");
                            long len = f.length();
                            c[1] += len;
                            String n = f.getName().toLowerCase(Locale.ROOT);
                            String ext = extension(n);
                            String p = f.getAbsolutePath();
                            if (p.contains("/.thumbnails/") || n.equals("thumbs.db") || n.startsWith(".thumbdata")) {
                                c[2]++;
                                c[3] += len;
                                if (muestrasMini.size() < 300) muestrasMini.add(f);
                            } else if (ext.equals("apk")) {
                                apks.add(f);
                            } else if (EXT_TEMP.contains(ext) || n.endsWith("~")) {
                                temporales.add(f);
                            } else if (EXT_IMG.contains(ext) && len >= minFoto) {
                                fotos.add(f);
                            } else if (len >= minGrande) {
                                grandes.add(f);
                            }
                        }

                        @Override
                        public void carpeta(File dir, int hijos) {
                            if (hijos == 0 && !dir.equals(raiz)) vacias.add(dir);
                        }
                    });
                }
                JSObject r = new JSObject();
                r.put("grandes", topPorTamano(grandes, max));
                r.put("fotos", topPorTamano(fotos, max));
                r.put("apks", topPorTamano(apks, max));
                r.put("temporales", topPorTamano(temporales, max));
                JSArray vac = new JSArray();
                for (int i = 0; i < Math.min(vacias.size(), max); i++) vac.put(itemJson(vacias.get(i)));
                r.put("carpetasVacias", vac);
                r.put("totalVacias", vacias.size());
                JSObject mini = new JSObject();
                mini.put("cantidad", c[2]);
                mini.put("tam", c[3]);
                JSArray ms = new JSArray();
                for (File f : muestrasMini) ms.put(itemJson(f));
                mini.put("muestras", ms);
                r.put("miniaturas", mini);
                r.put("totalArchivos", c[0]);
                r.put("totalBytes", c[1]);
                r.put("cancelado", cancelar);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude escanear: " + e.getMessage());
            }
        }).start();
    }

    private JSArray topPorTamano(List<File> lista, int max) {
        Collections.sort(lista, new Comparator<File>() {
            @Override
            public int compare(File a, File b) {
                return Long.compare(b.length(), a.length());
            }
        });
        JSArray arr = new JSArray();
        for (int i = 0; i < Math.min(lista.size(), max); i++) arr.put(itemJson(lista.get(i)));
        return arr;
    }

    // ============================== DUPLICADOS ==============================

    private String hashDe(File f, boolean completo) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[65536];
        try (InputStream in = new FileInputStream(f)) {
            if (completo) {
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelar) return "";
                    md.update(buf, 0, n);
                }
            } else {
                int n = in.read(buf);
                if (n > 0) md.update(buf, 0, n);
                long len = f.length();
                if (len > 131072) {
                    in.skip(len - 65536 - n > 0 ? len - 65536 - n : 0);
                    n = in.read(buf);
                    if (n > 0) md.update(buf, 0, n);
                }
            }
        }
        return hex(md.digest());
    }

    @PluginMethod
    public void duplicados(final PluginCall call) {
        final JSObject d = call.getData();
        final List<File> raices = raicesDe(d);
        final long minTam = d.optLong("minTam", 30 * 1024);
        cancelar = false;
        new Thread(() -> {
            try {
                // 1) agrupar por tamaño (los de tamaño único no pueden ser duplicados)
                final Map<Long, List<File>> porTam = new HashMap<>();
                final long[] cont = {0};
                for (File raiz : raices) {
                    caminar(raiz, new Visitante() {
                        @Override
                        public void archivo(File f) {
                            cont[0]++;
                            if (cont[0] % 800 == 0) progreso(cont[0], f.getParent(), "agrupando");
                            long len = f.length();
                            if (len < minTam) return;
                            List<File> l = porTam.get(len);
                            if (l == null) {
                                l = new ArrayList<>(2);
                                porTam.put(len, l);
                            }
                            l.add(f);
                        }

                        @Override
                        public void carpeta(File dir, int hijos) {
                        }
                    });
                }
                // 2) comparar el contenido: primero una huella rápida y luego la completa
                List<JSObject> grupos = new ArrayList<>();
                long analizados = 0;
                for (Map.Entry<Long, List<File>> e : porTam.entrySet()) {
                    if (cancelar) break;
                    if (e.getValue().size() < 2) continue;
                    long tam = e.getKey();
                    Map<String, List<File>> rapidos = new HashMap<>();
                    for (File f : e.getValue()) {
                        analizados++;
                        if (analizados % 40 == 0) progreso(analizados, f.getParent(), "comparando");
                        try {
                            String h = hashDe(f, false);
                            List<File> l = rapidos.get(h);
                            if (l == null) {
                                l = new ArrayList<>(2);
                                rapidos.put(h, l);
                            }
                            l.add(f);
                        } catch (Exception ex) {
                            // archivo ilegible: se ignora
                        }
                    }
                    for (List<File> cand : rapidos.values()) {
                        if (cand.size() < 2) continue;
                        boolean parcial = tam > 300L * 1024 * 1024;
                        Map<String, List<File>> fin = new HashMap<>();
                        for (File f : cand) {
                            try {
                                String h = parcial ? "p" : hashDe(f, true);
                                List<File> l = fin.get(h);
                                if (l == null) {
                                    l = new ArrayList<>(2);
                                    fin.put(h, l);
                                }
                                l.add(f);
                            } catch (Exception ex) {
                                // se ignora
                            }
                        }
                        for (List<File> iguales : fin.values()) {
                            if (iguales.size() < 2) continue;
                            Collections.sort(iguales, new Comparator<File>() {
                                @Override
                                public int compare(File a, File b) {
                                    return Long.compare(a.lastModified(), b.lastModified());
                                }
                            });
                            JSObject g = new JSObject();
                            g.put("tam", tam);
                            g.put("parcial", parcial);
                            JSArray arr = new JSArray();
                            for (File f : iguales) arr.put(itemJson(f));
                            g.put("archivos", arr);
                            g.put("recuperable", tam * (iguales.size() - 1));
                            grupos.add(g);
                        }
                    }
                }
                Collections.sort(grupos, new Comparator<JSObject>() {
                    @Override
                    public int compare(JSObject a, JSObject b) {
                        return Long.compare(b.optLong("recuperable"), a.optLong("recuperable"));
                    }
                });
                JSArray out = new JSArray();
                long total = 0;
                for (int i = 0; i < grupos.size(); i++) {
                    total += grupos.get(i).optLong("recuperable");
                    if (i < 80) out.put(grupos.get(i));
                }
                JSObject r = new JSObject();
                r.put("grupos", out);
                r.put("totalGrupos", grupos.size());
                r.put("recuperable", total);
                r.put("revisados", cont[0]);
                r.put("cancelado", cancelar);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude buscar duplicados: " + e.getMessage());
            }
        }).start();
    }

    // ============================== RESUMEN DE UN ARCHIVO ==============================

    private static String limpiarXml(String xml, String cierreParrafo) {
        String t = xml.replace(cierreParrafo, "\n").replaceAll("<[^>]+>", " ");
        t = t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'");
        return t.replaceAll("[ \\t]+", " ").replaceAll("\\n\\s*\\n+", "\n").trim();
    }

    private static String leerEntrada(ZipFile z, ZipEntry e, int max) throws Exception {
        try (InputStream in = z.getInputStream(e)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while (out.size() < max && (n = in.read(buf, 0, Math.min(buf.length, max - out.size()))) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    @PluginMethod
    public void resumen(final PluginCall call) {
        final String ruta = call.getString("ruta", "");
        new Thread(() -> {
            try {
                File f = new File(ruta);
                if (!f.exists()) {
                    call.reject("El archivo ya no existe.");
                    return;
                }
                String ext = extension(f.getName());
                JSObject r = new JSObject();
                JSObject extra = new JSObject();
                String texto = "";
                String tipo = "otro";
                r.put("tam", f.length());
                r.put("fecha", f.lastModified());

                if (EXT_TEXTO.contains(ext)) {
                    tipo = "texto";
                    texto = new String(leerBytes(f, 24000), "UTF-8");
                } else if (EXT_OFFICE.contains(ext)) {
                    tipo = "documento";
                    try (ZipFile z = new ZipFile(f)) {
                        StringBuilder sb = new StringBuilder();
                        if (ext.equals("docx")) {
                            ZipEntry e = z.getEntry("word/document.xml");
                            if (e != null) sb.append(limpiarXml(leerEntrada(z, e, 400000), "</w:p>"));
                        } else if (ext.equals("xlsx")) {
                            ZipEntry e = z.getEntry("xl/sharedStrings.xml");
                            if (e != null) sb.append(limpiarXml(leerEntrada(z, e, 400000), "</si>"));
                        } else if (ext.equals("pptx")) {
                            List<String> nombres = new ArrayList<>();
                            Enumeration<? extends ZipEntry> en = z.entries();
                            while (en.hasMoreElements()) {
                                String nm = en.nextElement().getName();
                                if (nm.startsWith("ppt/slides/slide") && nm.endsWith(".xml")) nombres.add(nm);
                            }
                            Collections.sort(nombres);
                            extra.put("diapositivas", nombres.size());
                            for (int i = 0; i < Math.min(nombres.size(), 15) && sb.length() < 24000; i++)
                                sb.append(limpiarXml(leerEntrada(z, z.getEntry(nombres.get(i)), 100000), "</a:p>")).append("\n");
                        } else {
                            ZipEntry e = z.getEntry("content.xml");
                            if (e != null) sb.append(limpiarXml(leerEntrada(z, e, 400000), "</text:p>"));
                        }
                        texto = sb.length() > 24000 ? sb.substring(0, 24000) : sb.toString();
                    }
                } else if (ext.equals("pdf")) {
                    tipo = "pdf";
                    try {
                        PdfRenderer pr = new PdfRenderer(ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY));
                        extra.put("paginas", pr.getPageCount());
                        pr.close();
                    } catch (Exception e) {
                        extra.put("protegido", true);
                    }
                } else if (EXT_ZIP.contains(ext)) {
                    tipo = "comprimido";
                    try (ZipFile z = new ZipFile(f)) {
                        StringBuilder sb = new StringBuilder();
                        int n = 0;
                        Enumeration<? extends ZipEntry> en = z.entries();
                        while (en.hasMoreElements()) {
                            ZipEntry e = en.nextElement();
                            n++;
                            if (n <= 40) sb.append(e.getName()).append("\n");
                        }
                        extra.put("entradas", n);
                        texto = sb.toString();
                    }
                } else if (ext.equals("apk")) {
                    tipo = "apk";
                    PackageManager pm = getContext().getPackageManager();
                    PackageInfo pi = pm.getPackageArchiveInfo(f.getAbsolutePath(), 0);
                    if (pi != null) {
                        extra.put("paquete", pi.packageName);
                        extra.put("version", pi.versionName == null ? "" : pi.versionName);
                        try {
                            ApplicationInfo ai = pi.applicationInfo;
                            ai.sourceDir = f.getAbsolutePath();
                            ai.publicSourceDir = f.getAbsolutePath();
                            extra.put("nombre", String.valueOf(pm.getApplicationLabel(ai)));
                        } catch (Exception e) {
                            // sin nombre
                        }
                        try {
                            extra.put("instalada", pm.getPackageInfo(pi.packageName, 0) != null);
                        } catch (Exception e) {
                            extra.put("instalada", false);
                        }
                    }
                } else if (EXT_IMG.contains(ext)) {
                    tipo = "imagen";
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                    extra.put("ancho", o.outWidth);
                    extra.put("alto", o.outHeight);
                    try {
                        ExifInterface ex = new ExifInterface(f.getAbsolutePath());
                        String dt = ex.getAttribute(ExifInterface.TAG_DATETIME);
                        String mod = ex.getAttribute(ExifInterface.TAG_MODEL);
                        if (dt != null) extra.put("tomada", dt);
                        if (mod != null) extra.put("camara", mod);
                    } catch (Exception e) {
                        // sin datos EXIF
                    }
                } else if (EXT_AUDIO.contains(ext) || EXT_VIDEO.contains(ext)) {
                    tipo = EXT_AUDIO.contains(ext) ? "audio" : "video";
                    MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                    try {
                        mmr.setDataSource(f.getAbsolutePath());
                        String dur = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                        if (dur != null) extra.put("duracionMs", Long.parseLong(dur));
                        String tit = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
                        String art = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                        if (tit != null) extra.put("titulo", tit);
                        if (art != null) extra.put("artista", art);
                        if (tipo.equals("video")) {
                            String w = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                            String h = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                            if (w != null) extra.put("ancho", Integer.parseInt(w));
                            if (h != null) extra.put("alto", Integer.parseInt(h));
                        }
                    } catch (Exception e) {
                        // sin metadatos
                    } finally {
                        try {
                            mmr.release();
                        } catch (Exception e) {
                            // nada
                        }
                    }
                } else if (f.length() > 0) {
                    // desconocido: si parece texto, se lee un poco
                    byte[] muestra = leerBytes(f, 512);
                    boolean binario = false;
                    for (byte b : muestra) if (b == 0) binario = true;
                    if (!binario && muestra.length > 0) {
                        tipo = "texto";
                        texto = new String(leerBytes(f, 24000), "UTF-8");
                    }
                }
                r.put("tipo", tipo);
                r.put("texto", texto);
                r.put("extra", extra);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude leer el archivo: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void abrirArchivo(final PluginCall call) {
        final String ruta = call.getString("ruta", "");
        try {
            final File f = new File(ruta);
            if (!f.exists()) {
                call.reject("El archivo ya no existe.");
                return;
            }
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension(f.getName()));
            if (mime == null) mime = "*/*";
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            final Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(i);
                    call.resolve();
                } catch (ActivityNotFoundException e) {
                    call.reject("Tu teléfono no tiene una app para abrir este tipo de archivo.");
                } catch (Exception e) {
                    call.reject("No pude abrir el archivo: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            call.reject("No pude abrir el archivo: " + e.getMessage());
        }
    }

    // ============================== PAPELERA (7 días) ==============================

    private File indiceFile() {
        return new File(papelera(), "_indice.json");
    }

    private JSONArray leerIndice() {
        try {
            File f = indiceFile();
            if (!f.exists()) return new JSONArray();
            return new JSONArray(new String(leerBytes(f, 5 * 1024 * 1024), "UTF-8"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private void guardarIndice(JSONArray arr) throws Exception {
        papelera().mkdirs();
        File tmp = new File(papelera(), "_indice.tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(arr.toString().getBytes("UTF-8"));
        }
        File fin = indiceFile();
        if (fin.exists()) fin.delete();
        tmp.renameTo(fin);
    }

    @PluginMethod
    public void moverAPapelera(final PluginCall call) {
        final JSObject d = call.getData();
        new Thread(() -> {
            try {
                JSONArray rutas = d.optJSONArray("rutas");
                JSONArray indice = leerIndice();
                papelera().mkdirs();
                JSArray movidos = new JSArray();
                JSArray fallos = new JSArray();
                long bytes = 0;
                long ahora = System.currentTimeMillis();
                for (int i = 0; rutas != null && i < rutas.length(); i++) {
                    String ruta = rutas.optString(i, "");
                    File src = new File(ruta);
                    if (!src.exists()) {
                        JSObject fl = new JSObject();
                        fl.put("ruta", ruta);
                        fl.put("motivo", "ya no existe");
                        fallos.put(fl);
                        continue;
                    }
                    if (src.isDirectory()) {
                        String[] hijos = src.list();
                        if (hijos != null && hijos.length == 0 && src.delete()) {
                            movidos.put(ruta);
                        } else {
                            JSObject fl = new JSObject();
                            fl.put("ruta", ruta);
                            fl.put("motivo", "la carpeta no está vacía");
                            fallos.put(fl);
                        }
                        continue;
                    }
                    String id = ahora + "_" + i;
                    File dest = new File(papelera(), id + "_" + src.getName());
                    long tam = src.length();
                    if (moverArchivo(src, dest)) {
                        JSONObject it = new JSONObject();
                        it.put("id", id);
                        it.put("nombre", src.getName());
                        it.put("original", ruta);
                        it.put("destino", dest.getAbsolutePath());
                        it.put("tam", tam);
                        it.put("borradoEn", ahora);
                        indice.put(it);
                        movidos.put(ruta);
                        bytes += tam;
                    } else {
                        JSObject fl = new JSObject();
                        fl.put("ruta", ruta);
                        fl.put("motivo", "Android no me dejó moverlo");
                        fallos.put(fl);
                    }
                }
                guardarIndice(indice);
                JSObject r = new JSObject();
                r.put("movidos", movidos);
                r.put("fallos", fallos);
                r.put("bytes", bytes);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude mover a la papelera: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void listarPapelera(PluginCall call) {
        try {
            JSONArray indice = leerIndice();
            JSArray items = new JSArray();
            long total = 0;
            for (int i = 0; i < indice.length(); i++) {
                JSONObject it = indice.getJSONObject(i);
                if (!new File(it.optString("destino")).exists()) continue;
                items.put(it);
                total += it.optLong("tam");
            }
            JSObject r = new JSObject();
            r.put("items", items);
            r.put("bytes", total);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No pude leer la papelera: " + e.getMessage());
        }
    }

    @PluginMethod
    public void restaurar(final PluginCall call) {
        final JSObject d = call.getData();
        new Thread(() -> {
            try {
                JSONArray ids = d.optJSONArray("ids");
                Set<String> quiero = new HashSet<>();
                for (int i = 0; ids != null && i < ids.length(); i++) quiero.add(ids.optString(i));
                JSONArray indice = leerIndice();
                JSONArray resto = new JSONArray();
                int ok = 0;
                for (int i = 0; i < indice.length(); i++) {
                    JSONObject it = indice.getJSONObject(i);
                    if (!quiero.contains(it.optString("id"))) {
                        resto.put(it);
                        continue;
                    }
                    File dest = new File(it.optString("original"));
                    if (dest.exists()) dest = new File(dest.getParentFile(), "(recuperado) " + dest.getName());
                    if (moverArchivo(new File(it.optString("destino")), dest)) ok++;
                    else resto.put(it);
                }
                guardarIndice(resto);
                JSObject r = new JSObject();
                r.put("restaurados", ok);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude restaurar: " + e.getMessage());
            }
        }).start();
    }

    /** Borra DE VERDAD lo que está en la papelera (todo, lo elegido, o solo lo que ya cumplió 7 días). */
    @PluginMethod
    public void vaciarPapelera(final PluginCall call) {
        final JSObject d = call.getData();
        new Thread(() -> {
            try {
                JSONArray ids = d.optJSONArray("ids");
                boolean soloVencidos = d.optBoolean("soloVencidos", false);
                Set<String> quiero = null;
                if (ids != null) {
                    quiero = new HashSet<>();
                    for (int i = 0; i < ids.length(); i++) quiero.add(ids.optString(i));
                }
                long limite = System.currentTimeMillis() - 7L * 24 * 3600 * 1000;
                JSONArray indice = leerIndice();
                JSONArray resto = new JSONArray();
                long bytes = 0;
                int n = 0;
                for (int i = 0; i < indice.length(); i++) {
                    JSONObject it = indice.getJSONObject(i);
                    boolean borrar = quiero != null ? quiero.contains(it.optString("id")) : (!soloVencidos || it.optLong("borradoEn") < limite);
                    if (!borrar) {
                        resto.put(it);
                        continue;
                    }
                    File f = new File(it.optString("destino"));
                    long tam = f.exists() ? f.length() : 0;
                    if (!f.exists() || f.delete()) {
                        bytes += tam;
                        n++;
                    } else {
                        resto.put(it);
                    }
                }
                guardarIndice(resto);
                JSObject r = new JSObject();
                r.put("borrados", n);
                r.put("bytes", bytes);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude vaciar la papelera: " + e.getMessage());
            }
        }).start();
    }

    // ============================== MOVER (ORGANIZAR) ==============================

    @PluginMethod
    public void mover(final PluginCall call) {
        final JSObject d = call.getData();
        new Thread(() -> {
            try {
                JSONArray movs = d.optJSONArray("movimientos");
                JSArray hechos = new JSArray();
                JSArray fallos = new JSArray();
                for (int i = 0; movs != null && i < movs.length(); i++) {
                    JSONObject m = movs.getJSONObject(i);
                    File de = new File(m.optString("de"));
                    File a = new File(m.optString("a"));
                    if (!de.exists()) {
                        fallos.put(m.optString("de"));
                        continue;
                    }
                    int k = 1;
                    while (a.exists()) {
                        String nm = a.getName();
                        int p = nm.lastIndexOf('.');
                        String nuevo = p > 0 ? nm.substring(0, p) + " (" + k + ")" + nm.substring(p) : nm + " (" + k + ")";
                        a = new File(a.getParentFile(), nuevo);
                        k++;
                    }
                    if (moverArchivo(de, a)) {
                        JSObject h = new JSObject();
                        h.put("de", de.getAbsolutePath());
                        h.put("a", a.getAbsolutePath());
                        hechos.put(h);
                    } else {
                        fallos.put(m.optString("de"));
                    }
                }
                JSObject r = new JSObject();
                r.put("movidos", hechos);
                r.put("fallos", fallos);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude mover los archivos: " + e.getMessage());
            }
        }).start();
    }

    // ============================== APPS ==============================

    @PluginMethod
    public void listarApps(final PluginCall call) {
        new Thread(() -> {
            try {
                Context ctx = getContext();
                PackageManager pm = ctx.getPackageManager();
                boolean uso = tieneAccesoUso();
                Map<String, UsageStats> mapa = new HashMap<>();
                if (uso) {
                    UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
                    long ahora = System.currentTimeMillis();
                    Map<String, UsageStats> m = usm.queryAndAggregateUsageStats(ahora - 365L * 24 * 3600 * 1000, ahora);
                    if (m != null) mapa = m;
                }
                StorageStatsManager ssm = null;
                if (Build.VERSION.SDK_INT >= 26 && uso) ssm = (StorageStatsManager) ctx.getSystemService(Context.STORAGE_STATS_SERVICE);
                List<ApplicationInfo> apps = pm.getInstalledApplications(0);
                JSArray out = new JSArray();
                int conIcono = 0;
                for (ApplicationInfo ai : apps) {
                    if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                    if (ai.packageName.equals(ctx.getPackageName())) continue;
                    if (pm.getLaunchIntentForPackage(ai.packageName) == null) continue;
                    JSObject o = new JSObject();
                    o.put("paquete", ai.packageName);
                    o.put("nombre", String.valueOf(pm.getApplicationLabel(ai)));
                    try {
                        PackageInfo pi = pm.getPackageInfo(ai.packageName, 0);
                        o.put("instaladoEn", pi.firstInstallTime);
                        o.put("actualizadoEn", pi.lastUpdateTime);
                    } catch (Exception e) {
                        o.put("instaladoEn", 0);
                    }
                    UsageStats us = mapa.get(ai.packageName);
                    o.put("ultimoUso", uso ? (us == null ? 0 : us.getLastTimeUsed()) : -1);
                    long tam = 0;
                    try {
                        if (ssm != null) {
                            StorageStats st = ssm.queryStatsForPackage(java.util.UUID.fromString("41217664-9172-527a-b3d5-edabb50a7d69"), ai.packageName, Process.myUserHandle());
                            tam = st.getAppBytes() + st.getDataBytes() + st.getCacheBytes();
                        }
                    } catch (Exception e) {
                        tam = 0;
                    }
                    if (tam == 0) {
                        try {
                            tam = new File(ai.sourceDir).length();
                        } catch (Exception e) {
                            tam = 0;
                        }
                    }
                    o.put("tam", tam);
                    if (conIcono < 150) {
                        try {
                            Drawable dr = pm.getApplicationIcon(ai.packageName);
                            Bitmap bmp = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
                            Canvas cv = new Canvas(bmp);
                            dr.setBounds(0, 0, 48, 48);
                            dr.draw(cv);
                            ByteArrayOutputStream bo = new ByteArrayOutputStream();
                            bmp.compress(Bitmap.CompressFormat.PNG, 90, bo);
                            o.put("icono", "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                            conIcono++;
                        } catch (Exception e) {
                            // sin icono
                        }
                    }
                    out.put(o);
                }
                JSObject r = new JSObject();
                r.put("apps", out);
                r.put("usoPermitido", uso);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No pude leer las apps: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void desinstalarApp(final PluginCall call) {
        final String paquete = call.getString("paquete", "");
        try {
            final Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + paquete));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(i);
                    call.resolve();
                } catch (Exception e) {
                    call.reject("No pude abrir el desinstalador: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            call.reject("No pude abrir el desinstalador: " + e.getMessage());
        }
    }

    @PluginMethod
    public void existeApp(PluginCall call) {
        JSObject r = new JSObject();
        try {
            getContext().getPackageManager().getPackageInfo(call.getString("paquete", ""), 0);
            r.put("existe", true);
        } catch (Exception e) {
            r.put("existe", false);
        }
        call.resolve(r);
    }

    // ============================== VOZ ==============================

    @PluginMethod
    public void dictar(PluginCall call) {
        try {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es");
            i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Habla ahora");
            startActivityForResult(call, i, "dictadoResultado");
        } catch (ActivityNotFoundException e) {
            call.reject("Tu teléfono no tiene reconocimiento de voz instalado.");
        } catch (Exception e) {
            call.reject("No pude iniciar el dictado: " + e.getMessage());
        }
    }

    @ActivityCallback
    public void dictadoResultado(PluginCall call, ActivityResult result) {
        JSObject r = new JSObject();
        String texto = "";
        if (call != null && result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> lista = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (lista != null && !lista.isEmpty()) texto = lista.get(0);
        }
        r.put("texto", texto);
        if (call != null) call.resolve(r);
    }
}
