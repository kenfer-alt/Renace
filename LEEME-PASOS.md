# 🌱 Renace

Renace ayuda a que un teléfono lento y lleno vuelva a ir fluido: busca archivos duplicados, grandes y basura,
te dice cuánto espacio te queda con palabras sencillas y **nunca borra nada sin tu permiso, archivo por archivo**
(lo borrado va a una papelera durante 7 días).

# PARTE 1 — Probarla primero en Termux (con tus archivos reales)

```
termux-setup-storage          # solo la primera vez: acepta el permiso
pkg install nodejs unzip -y
cd ~
unzip -o ~/storage/downloads/renace.zip -d ~/renace
cd ~/renace
node termux/servidor.js
```

Termux imprime un enlace así: `http://localhost:8765/?t=abc123…`
Ábrelo en el navegador del celular (Chrome). La clave del enlace cambia cada vez; así ninguna otra app del teléfono puede tocar tus archivos.

Opcional (para "Ver archivo" y dictar por voz desde Termux): `pkg install termux-api` y tener instalada la app **Termux:API**.

En este modo:
- ✅ Funciona: espacio, mostrar/buscar/organizar archivos, duplicados, grandes, basura, papelera, chats, ajustes.
- ❌ No funciona (solo en la APK): apps sin usar y desinstalar (Android no se lo permite a Termux).

Para cerrar: vuelve a Termux y presiona Ctrl + C.

# PARTE 2 — Convertirla en una app (APK) con GitHub

## Lo que necesitas
- Una cuenta gratis en https://github.com
- Termux (ya lo tienes) o el navegador del celular

## Paso 1 — Crear el repositorio
1. En GitHub: **New repository** → nombre: `renace` → **Create repository** (déjalo público o privado, da igual).
2. Anota tu usuario de GitHub (por ejemplo `juan123`).

## Paso 2 — Crear un "token" (la clave para subir archivos desde Termux)
1. GitHub → tu foto → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.
2. Marca solo **repo**. Elige duración 30 días. **Generate token**.
3. **Copia el token** (empieza con `ghp_`). No se lo muestres a nadie.

## Paso 3 — Subir el proyecto desde Termux
Pon `renace.zip` en la carpeta Descargas y escribe, cambiando USUARIO y TOKEN:

```
pkg install git unzip -y
cd ~
unzip -o ~/storage/downloads/renace.zip -d ~/renace
cd ~/renace
git init
git add .
git commit -m "Renace"
git branch -M main
git remote add origin https://USUARIO:TOKEN@github.com/USUARIO/renace.git
git push -u origin main
```

## Paso 4 — GitHub construye la APK solo
1. En GitHub abre tu repositorio → pestaña **Actions**.
2. Verás **Construir APK de Renace** trabajando (tarda unos 8–15 minutos). Si no arrancó, entra y toca **Run workflow**.
3. Cuando salga con ✅ verde, abre esa ejecución y baja hasta **Artifacts** → descarga **Renace-APK**.
4. Descomprime lo que bajó: dentro está **app-debug.apk**.

## Paso 5 — Instalar
1. Abre **app-debug.apk**. Android pedirá permitir instalar apps de esta fuente: acepta.
2. Si sale un aviso de seguridad, es normal en apps que no vienen de la tienda.
3. Abre **Renace** y toca los botones que te pide para activar dos permisos:
   - **Acceso para administrar todos los archivos** (para ver tus archivos)
   - **Acceso de uso** (para saber cuánto llevas sin usar cada app)

## Si GitHub marca ❌ (error)
Entra a la ejecución, toca el paso en rojo, copia el mensaje de error y pégamelo en el chat. Lo arreglamos.

## Probar la pantalla sin instalar nada (opcional)
Dentro de la carpeta `www` está la app web. En un computador, `python3 -m http.server` y abre
`http://localhost:8000` para ver la app con un teléfono de demostración.

## Qué trae esta primera versión (Fase 1)
Chats (crear, renombrar, borrar, buscar, editar mensajes) · voz · espacio en pantalla sencilla ·
mostrar/organizar/buscar archivos con su dirección · duplicados · archivos y fotos grandes · basura ·
apps sin usar y desinstalar · papelera de 7 días · ajustes.
**Fase 2:** búsqueda web, imágenes de la web, charla, Verificador, ADE, Súper Inteligencia y escaneo automático cada 2 días.
