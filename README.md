# Superfood — Panel (Vite + React) con BFF

Panel web para cargar y gestionar el catálogo Superfood. UI en React + Tailwind
y un pequeño **servidor BFF (Express)** que guarda los secretos del lado del
servidor (Cloudflare / API keys) y hace de proxy al backend `superfood`.

## Arquitectura

```
Navegador ──▶ Vite (3000)  ──/api──▶  BFF Express (8787)  ──▶  backend superfood (4000) ──▶ SQLite
                                          │  guarda .env: CLOUDFLARE_*, CATALOGO_*, SESSION_SECRET
                                          └─ usuarios propios (SQLite) + sesión (cookie HttpOnly)
```

Las credenciales viven **solo** en el `.env` que lee `server.js` (nunca llegan
al navegador). El SPA solo habla con `/api`.

## Requisitos
- Node.js 18+.
- El **backend** `superfood` corriendo (por defecto en `http://localhost:4000`):
  ```bash
  cd ../Desktop/superfood && npm start
  ```

## Puesta en marcha
```bash
npm install
cp .env.example .env    # PowerShell: copy .env.example .env
```
Rellena `.env`:
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` → subir imágenes.
- `CATALOGO_API_URL` / `CATALOGO_API_KEY` / `CATALOGO_ADMIN_KEY` → deben
  coincidir con el `.env` del backend.
- `SESSION_SECRET` → secreto largo y aleatorio.
- `ADMIN_USER` / `ADMIN_PASSWORD` → admin inicial (se crea la primera vez).

Arranca las dos piezas del panel con un solo comando (Vite + BFF juntos):
```bash
npm run dev
```
Abre **http://localhost:3000**. Entra con **admin / admin** (o el ADMIN_PASSWORD
que pongas). También hay un seed `operador / operador`.

> Cambia admin/operador y `SESSION_SECRET` antes de producción.

## Producción
```bash
npm run build     # genera dist/
npm start         # server.js sirve dist/ + /api en un puerto (NODE_ENV=production)
```

## Qué se conectó a la API
- **Login/usuarios**: reales (cookie de sesión firmada, contraseñas scrypt).
  Solo el rol **ADMIN** ve/gestiona usuarios.
- **Cargar**: sube imagen a Cloudflare (id = código de barras) y guarda en el
  catálogo. El estado *Aprobado* → maestro; *Pendiente* → cola de revisión.
- **Gestionar**: búsqueda (FTS5 del backend), editar (nombre/imagen), eliminar.
- **Pendientes**: aprobar / descartar / subir foto rápida.

## Simplificaciones respecto a la maqueta original
- Se quitaron **categoría, precio, stock y descripción** (el backend maneja solo
  código de barras + nombre + imagen).
- El código de barras **no se edita** (es la clave del producto).
- Se quitó el "usar cuenta / cambiar a admin" (con login real no hay
  suplantación); los accesos rápidos hacen login real con las cuentas sembradas.

## Notas
- La BD de usuarios (`data/usuarios.db`) es de este panel, aparte del catálogo.
- Si el build queda raro: borra `dist/` y `npm run build` otra vez.
