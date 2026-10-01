# 🚀 Guía de Despliegue en la Nube de CitaFlow (Render & Railway)

Esta guía detalla paso a paso cómo publicar **CitaFlow** en internet con base de datos **PostgreSQL en la nube** y obtener tu enlace público seguro con certificado **HTTPS** (`.onrender.com` o `.up.railway.app`), ya sea utilizando el despliegue automático mediante código (Infrastructure as Code) o mediante la consola web paso a paso.

---

## 📋 Requisitos Previos

1. Una cuenta gratuita en [GitHub](https://github.com) o [GitLab](https://gitlab.com).
2. Una cuenta gratuita en [Render](https://render.com) o [Railway](https://railway.app).
3. Subir el código de CitaFlow a tu repositorio de GitHub:
   ```bash
   cd C:\Users\Admin\.gemini\antigravity\scratch\citaflow
   git init
   git add .
   git commit -m "feat: initial commit CitaFlow MVP cloud-ready"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/citaflow.git
   git push -u origin main
   ```

---

## 🅰️ OPCIÓN 1: Despliegue en Render (Recomendado con `render.yaml`)

El repositorio incluye un archivo [`render.yaml`](file:///C:/Users/Admin/.gemini/antigravity/scratch/citaflow/render.yaml) preconfigurado que aprovisiona automáticamente la base de datos PostgreSQL 16 y el servicio Web Node.js en 1 solo clic.

### Método Rápido (1-Click Blueprint):
1. Inicia sesión en tu cuenta de [Render Dashboard](https://dashboard.render.com).
2. Haz clic en el botón superior **"New +"** y selecciona **"Blueprint"**.
3. Conecta tu repositorio de GitHub `citaflow`.
4. Render detectará automáticamente el archivo `render.yaml` y mostrará los dos recursos que creará:
   - 🐘 **Base de Datos:** `citaflow-postgres` (PostgreSQL 16)
   - 🌐 **Web Service:** `citaflow` (Node.js)
5. Haz clic en **"Apply"**.
6. Render aprovisionará la base de datos, conectará la variable `DATABASE_URL`, compilará el proyecto con `npm run build` y ejecutará la sincronización y el seeding inicial con `npm run start:prod`.
7. En 2 a 3 minutos, obtendrás tu enlace público HTTPS oficial en la parte superior del servicio:
   ```text
   https://citaflow.onrender.com
   ```

---

### Método Manual en Render (Si no usas Blueprint):

#### Paso 1: Crear la Base de Datos PostgreSQL
1. En Render Dashboard, haz clic en **"New +"** > **"PostgreSQL"**.
2. Completa los campos:
   - **Name:** `citaflow-db`
   - **Database:** `citaflow`
   - **User:** `citaflow`
   - **Region:** Selecciona la más cercana (ej. *Frankfurt* o *Oregon*).
   - **Plan:** *Free* (o *Starter*).
3. Haz clic en **"Create Database"**.
4. Una vez creada, ve a la sección **Connections** y copia la **"Internal Database URL"** (o *"External Database URL"* si despliegas el web service en otra plataforma).

#### Paso 2: Crear el Web Service Node.js
1. En Render Dashboard, haz clic en **"New +"** > **"Web Service"**.
2. Conecta tu repositorio de GitHub `citaflow`.
3. Configura los parámetros:
   - **Name:** `citaflow`
   - **Region:** La misma elegida para la base de datos.
   - **Runtime:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start:prod`
   - **Plan:** *Free*
4. En la sección **Advanced / Environment Variables**, añade:
   | Variable | Valor |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Pega la URL de PostgreSQL copiada en el Paso 1 |
   | `JWT_SECRET` | Genera una cadena aleatoria de 32+ caracteres |
   | `SEED_ON_STARTUP` | `true` (crea el negocio demo Barbería Imperio) |
   | `PAYMENT_PROVIDER` | `mock` (o `stripe`) |
   | `WHATSAPP_PROVIDER` | `mock` (o `cloud_api`) |
5. Haz clic en **"Create Web Service"**.
6. Render construirá la app y te asignará la URL pública: `https://citaflow.onrender.com`.

---

## 🅱️ OPCIÓN 2: Despliegue en Railway

Railway detectará automáticamente los archivos [`railway.json`](file:///C:/Users/Admin/.gemini/antigravity/scratch/citaflow/railway.json) y [`Procfile`](file:///C:/Users/Admin/.gemini/antigravity/scratch/citaflow/Procfile).

### Paso 1: Crear el Proyecto y PostgreSQL
1. Inicia sesión en [Railway Dashboard](https://railway.app).
2. Haz clic en **"New Project"**.
3. Selecciona **"Provision PostgreSQL"**. Railway creará una instancia PostgreSQL gestionada al instante.

### Paso 2: Desplegar el Repositorio de CitaFlow
1. En el mismo proyecto de Railway, haz clic en **"+ New"** > **"GitHub Repo"** y selecciona tu repositorio `citaflow`.
2. Haz clic en la tarjeta del servicio web recién añadido y ve a la pestaña **Variables**:
   - Añade una referencia a la base de datos: haz clic en **"Add Reference"** y selecciona `DATABASE_URL` del servicio PostgreSQL (Railway autocompletará `${{Postgres.DATABASE_URL}}`).
   - Añade las demás variables requeridas:
     - `NODE_ENV`: `production`
     - `JWT_SECRET`: (clave secreta aleatoria de 32 caracteres)
     - `SEED_ON_STARTUP`: `true`
     - `PAYMENT_PROVIDER`: `mock`
     - `WHATSAPP_PROVIDER`: `mock`
3. Ve a la pestaña **Settings** > **Networking**:
   - Haz clic en **"Generate Domain"**.
   - Railway te generará de inmediato un enlace público HTTPS con certificado SSL automático, por ejemplo:
     ```text
     https://citaflow.up.railway.app
     ```
4. El despliegue arrancará automáticamente. Los scripts `npm run build` y `npm run start:prod` migrarán la base de datos PostgreSQL y poblarán los datos iniciales.

---

## ⚙️ Variables de Entorno de Producción (`.env`)

Usa como referencia [`file:///.env.production.example`](file:///C:/Users/Admin/.gemini/antigravity/scratch/citaflow/.env.production.example):

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=super_secreto_criptografico_de_produccion_2026_x
DATABASE_URL=postgresql://user:password@host:5432/citaflow?sslmode=require
SEED_ON_STARTUP=true

# Pasarelas de Pago (Opcional)
PAYMENT_PROVIDER=mock
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Mensajería WhatsApp (Opcional)
WHATSAPP_PROVIDER=mock
META_WA_PHONE_NUMBER_ID=
META_WA_ACCESS_TOKEN=
META_WA_VERIFY_TOKEN=citaflow_meta_verify_token_2026
```

---

## 🔍 Verificación Post-Despliegue

Una vez que el servicio esté en estado **Active / Live**, prueba las siguientes rutas en tu navegador con tu nuevo dominio HTTPS (ejemplo con `https://citaflow.onrender.com`):

1. **Comprobación de Salud del Servidor:**
   ```text
   GET https://citaflow.onrender.com/api/health
   ```
   *Debe responder `{"status":"online","app":"CitaFlow Micro-SaaS"}`.*

2. **Landing Page Pública:**
   ```text
   https://citaflow.onrender.com/
   ```

3. **Página de Reserva del Negocio Demo:**
   ```text
   https://citaflow.onrender.com/b/barberia-imperio
   ```

4. **Acceso al Panel de Administración:**
   ```text
   https://citaflow.onrender.com/admin
   ```
   *Credenciales de prueba:*
   - **Email:** `admin@barberiaimperio.com`
   - **Contraseña:** `Password123!`

5. **Prueba del Feed en Vivo con SSE:**
   - Entra al Dashboard y pulsa en la pestaña **"🔴 Feed en Vivo"**.
   - Pulsa en **"⚡ Simular Reserva Entrante"** para ver la tarjeta ingresar en tiempo real por el canal SSE seguro sobre HTTPS.

---

## 🌐 Configurar Dominio Personalizado (Opcional)

Si deseas utilizar tu propio dominio (ej: `app.citaflow.com`):
1. En Render o Railway, ve a la configuración de tu servicio web > **Custom Domains**.
2. Escribe tu dominio o subdominio.
3. En tu proveedor DNS (Cloudflare, GoDaddy, Namecheap), añade un registro:
   - **Tipo:** `CNAME`
   - **Nombre:** `app`
   - **Destino:** El dominio asignado por Render/Railway (ej. `citaflow.onrender.com`).
4. El certificado SSL Let's Encrypt se emitirá y renovará de forma completamente automática.
