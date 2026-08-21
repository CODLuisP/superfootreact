# Superfood — Panel (Vite + React + BFF)

Panel web para cargar, buscar, editar e importar el catálogo Superfood.
UI en React + Tailwind, con un servidor **BFF (Backend-For-Frontend, Express)**
que guarda todos los secretos del lado del servidor (nunca llegan al
navegador) y hace de proxy al backend `superfood`.

## Arquitectura
```
Navegador ──▶ Vite (3000) ──/api──▶ BFF Express (8787) ──▶ backend superfood (4000) ──▶ SQLite
                                        │ .env: CLOUDFLARE_*, CATALOGO_*, SESSION_SECRET
                                        └ usuarios propios (SQLite, data/usuarios.db) + sesión (cookie HttpOnly)
```
El navegador solo habla con `/api` usando la **cookie de sesión** (login). El
BFF es el único que conoce las API keys del backend y el token de Cloudflare.

## Puesta en marcha
```bash
npm install
cp .env.example .env    # rellena CLOUDFLARE_*, CATALOGO_*, SESSION_SECRET, ADMIN_USER/PASSWORD
npm run dev             # levanta Vite + BFF juntos → http://localhost:3000
```
El **backend** `superfood` debe estar corriendo en paralelo (`http://localhost:4000`
por defecto). Entra con el `ADMIN_USER`/`ADMIN_PASSWORD` que hayas puesto (se
crea solo la primera vez que arranca, si la tabla de usuarios está vacía).

**Producción:** `npm run build` (genera `dist/`) y luego `npm start`
(`NODE_ENV=production node server.js`, sirve la app + `/api` en un solo proceso).

## Qué incluye cada sección

**Cargar** — sube foto (archivo, arrastrar o `Ctrl+V`), código por cámara
(escáner web) o **lector USB físico** (funciona escribiendo desde cualquier
campo del formulario, detecta el tecleo ultra-rápido del lector y lo dirige
solo al campo de código, aunque el foco esté en "Nombre"). Guarda directo en
el catálogo (o como "pendiente" si se marca así).

**Gestionar** — búsqueda instantánea (FTS5 del backend) con **paginación real**
(24 productos por página, salto directo a cualquier página — nunca carga el
catálogo completo en memoria, funciona igual con 100 o con 100,000 productos).
Editar, eliminar, y:
- **Exportar** a CSV / Excel (.xlsx con estilo corporativo) / PDF (tablas
  paginadas con encabezado de marca) — respeta la búsqueda activa, trae los
  datos en bloques para no saturar memoria, y las librerías pesadas (ExcelJS,
  jsPDF) se cargan solo al usarlas (no inflan la carga inicial del panel).
- **Importar Excel**: plantilla descargable (Código de Barras / Nombre /
  URL de Imagen), detecta las columnas por su encabezado (no por posición ni
  orden), valida fila por fila con vista previa de errores, e importa en lotes
  (1 transacción por cada 1000 filas en el backend — miles de productos en
  menos de un segundo).

**Pendientes** — cola de revisión de lo que registran otros sistemas: aprobar,
descartar, completar imagen, todo paginado y con búsqueda.

**Usuarios** *(solo rol ADMIN)* — crear/editar/eliminar cuentas (roles ADMIN /
OPERADOR). Cada usuario tiene su propia **API key** (generada automáticamente
al crearlo) visible ahí mismo con botón de copiar y de regenerar — es la clave
que ese usuario (o el sistema que integre a nombre suyo) usa para consumir la
API pública del backend directamente. Protección incorporada: **no se puede
eliminar ni degradar al último administrador activo** (para no quedar sin
acceso al panel).

## Seguridad
- Contraseñas con **scrypt**; sesión en cookie **HttpOnly** firmada (HMAC).
- Las API keys personales se generan en el backend y se guardan también en la
  base de usuarios del panel para mostrarlas; se revocan automáticamente al
  eliminar la cuenta.
- Nada de esto (contraseñas, API keys, tokens de Cloudflare) es accesible
  desde el navegador: todo vive y se procesa en `server.js`.

## Notas
- La BD de usuarios (`data/usuarios.db`) es propia de este panel, separada del catálogo.
- Si el build se comporta raro: borra `dist/` y corre `npm run build` de nuevo.
