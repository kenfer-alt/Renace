#!/usr/bin/env python3
"""Agrega la parte nativa de Renace al proyecto Android que crea Capacitor.
Se ejecuta después de `npx cap add android` (lo hace el compilador automático de GitHub)."""
import os, re, shutil, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AND = os.path.join(RAIZ, "android", "app", "src", "main")
OVER = os.path.join(RAIZ, "android-overlay")

def fallo(msg):
    print("ERROR:", msg); sys.exit(1)

if not os.path.isdir(AND):
    fallo("No encuentro android/app/src/main. ¿Se ejecutó `npx cap add android`?")

# 1) código Java: el plugin de Renace y la actividad que lo registra
destino_java = os.path.join(AND, "java", "com", "renace", "app")
os.makedirs(destino_java, exist_ok=True)
for nombre in os.listdir(os.path.join(OVER, "java", "com", "renace", "app")):
    shutil.copy(os.path.join(OVER, "java", "com", "renace", "app", nombre), os.path.join(destino_java, nombre))
    print("copiado:", nombre)

# 2) iconos y colores
res_over = os.path.join(OVER, "res")
for carpeta, _, archivos in os.walk(res_over):
    rel = os.path.relpath(carpeta, res_over)
    d = os.path.join(AND, "res", rel)
    os.makedirs(d, exist_ok=True)
    for a in archivos:
        shutil.copy(os.path.join(carpeta, a), os.path.join(d, a))
print("iconos copiados")

# 3) FileProvider: para poder abrir archivos con otras apps
xml = os.path.join(AND, "res", "xml")
os.makedirs(xml, exist_ok=True)
with open(os.path.join(xml, "file_paths.xml"), "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <external-path name="almacenamiento" path="." />\n    <cache-path name="cache" path="." />\n</paths>\n')

# 4) AndroidManifest: permisos y proveedor de archivos
ruta_m = os.path.join(AND, "AndroidManifest.xml")
m = open(ruta_m, encoding="utf-8").read()

permisos = [
    "android.permission.MANAGE_EXTERNAL_STORAGE",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.QUERY_ALL_PACKAGES",
    "android.permission.PACKAGE_USAGE_STATS",
    "android.permission.REQUEST_DELETE_PACKAGES",
    "android.permission.INTERNET",
]
nuevos = "".join('    <uses-permission android:name="%s" />\n' % p for p in permisos if p not in m)
if nuevos:
    m = m.replace("<application", nuevos + "\n    <application", 1)

if "requestLegacyExternalStorage" not in m:
    m = m.replace("<application", '<application\n        android:requestLegacyExternalStorage="true"', 1)

if "FileProvider" not in m:
    proveedor = ('        <provider\n            android:name="androidx.core.content.FileProvider"\n'
                 '            android:authorities="${applicationId}.fileprovider"\n            android:exported="false"\n'
                 '            android:grantUriPermissions="true">\n'
                 '            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />\n'
                 '        </provider>\n')
    m = m.replace("</application>", proveedor + "    </application>", 1)

open(ruta_m, "w", encoding="utf-8").write(m)
print("AndroidManifest.xml listo")
print("Parte nativa de Renace agregada.")
