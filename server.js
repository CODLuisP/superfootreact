/**
 * Servidor BFF (backend-for-frontend) del panel Superfood.
 *
 * - Sirve las APIs bajo /api (login/sesión, usuarios, productos, subida de imagen).
 * - Guarda las CREDENCIALES del .env del lado del SERVIDOR (nunca llegan al navegador):
 *     CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CATALOGO_ADMIN_KEY, etc.
 * - Hace de proxy al backend de catálogo (superfood) usando siempre la ADMIN_API_KEY
 *   (el BFF actúa como el panel, no en nombre de un usuario externo).
 * - En producción sirve el build estático de Vite (dist/).
 *
 * En desarrollo, Vite (puerto 3000) hace proxy de /api → este server (8787),
 * así el navegador ve un mismo origen y la cookie de sesión funciona.
 */
import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const BACKEND = (process.env.CATALOGO_API_URL || 'https://sr.velsat.pe:2053/superfood').replace(/\/+$/, '');
const ADMIN_KEY = process.env.CATALOGO_ADMIN_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-cambiame';

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1`;

// ─────────────── BD de usuarios (propia del panel) ───────────────
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'usuarios.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    email         TEXT,
    role          TEXT NOT NULL DEFAULT 'OPERADOR',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
// Migración suave: columnas para la API key personal de cada usuario (se
// generan en el backend de catálogo y se guardan aquí junto al usuario).
for (const [col, tipo] of [['api_key', 'TEXT'], ['api_key_id', 'INTEGER']]) {
  const existe = db.prepare('PRAGMA table_info(usuarios)').all().some((c) => c.name === col);
  if (!existe) db.exec(`ALTER TABLE usuarios ADD COLUMN ${col} ${tipo}`);
}

// ─────────────── Contraseñas (scrypt) ───────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const dk = crypto.scryptSync(pw, salt, expected.length);
  return expected.length === dk.length && crypto.timingSafeEqual(expected, dk);
}

// Siembra: el usuario de ADMIN_USER nace como SUPERADMIN (cuenta permanente,
// indestructible) y operador/operador como OPERADOR normal, si la tabla está vacía.
try {
  const n = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (n === 0) {
    const seed = db.prepare('INSERT INTO usuarios (username, password_hash, name, email, role, active) VALUES (?,?,?,?,?,1)');
    seed.run(process.env.ADMIN_USER || 'admin', hashPassword(process.env.ADMIN_PASSWORD || 'admin'), 'Administrador Principal', 'admin@superfood.com', 'SUPERADMIN');
    seed.run('operador', hashPassword('operador'), 'Operador', 'operador@superfood.com', 'OPERADOR');
    console.log('[usuarios] Sembrados admin (SUPERADMIN) y operador/operador. Cámbialos en producción.');
  }
} catch (e) { /* carrera al sembrar: ignorar */ }

const usuarios = {
  byUsername: (u) => db.prepare('SELECT * FROM usuarios WHERE username = ?').get(u),
  byId: (id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id),
  list: () => db.prepare('SELECT id, username, name, email, role, active, created_at, api_key, api_key_id FROM usuarios ORDER BY created_at ASC').all(),
  create: (u) => db.prepare('INSERT INTO usuarios (username, password_hash, name, email, role, active) VALUES (@username,@password_hash,@name,@email,@role,@active)').run(u),
  update: (id, u) => db.prepare('UPDATE usuarios SET username=@username, name=@name, email=@email, role=@role, active=@active WHERE id=@id').run({ ...u, id }),
  setPassword: (id, hash) => db.prepare('UPDATE usuarios SET password_hash=? WHERE id=?').run(hash, id),
  setApiKey: (id, apiKeyId, apiKey) => db.prepare('UPDATE usuarios SET api_key_id=?, api_key=? WHERE id=?').run(apiKeyId, apiKey, id),
  remove: (id) => db.prepare('DELETE FROM usuarios WHERE id=?').run(id),
};

// Promueve al usuario configurado en ADMIN_USER a SUPERADMIN (una sola vez,
// idempotente). Cubre instalaciones que ya existían antes de este rol —
// como la tuya, con "owen" ya creado como ADMIN normal.
try {
  const nombreSuperadmin = process.env.ADMIN_USER || 'admin';
  const filaSuperadmin = usuarios.byUsername(nombreSuperadmin);
  if (filaSuperadmin && filaSuperadmin.role !== 'SUPERADMIN') {
    db.prepare("UPDATE usuarios SET role = 'SUPERADMIN' WHERE id = ?").run(filaSuperadmin.id);
    console.log(`[usuarios] "${nombreSuperadmin}" promovido a SUPERADMIN (cuenta permanente).`);
  }
} catch (e) { /* noop */ }

/** ¿Este rol tiene permisos de administrador (gestionar usuarios, etc.)? */
function esRolAdmin(role) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

// ─────────────── API key personal (una por usuario, vive en el backend) ───────────────
async function crearApiKeyEnBackend(etiqueta) {
  const r = await fetch(`${BACKEND}/admin/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY },
    body: JSON.stringify({ etiqueta }),
  });
  if (!r.ok) throw new Error('No se pudo generar la API key en el backend.');
  return r.json(); // { id, clave, etiqueta }
}
async function revocarApiKeyEnBackend(id) {
  if (!id) return;
  await fetch(`${BACKEND}/admin/api-keys/${id}`, { method: 'DELETE', headers: { 'x-api-key': ADMIN_KEY } }).catch(() => {});
}

// Migración retroactiva: usuarios que ya existían antes de esta función (o que
// por algún motivo se quedaron sin key) reciben una al arrancar el servidor.
(async () => {
  const sinKey = db.prepare('SELECT id, username FROM usuarios WHERE api_key IS NULL').all();
  for (const u of sinKey) {
    try {
      const { id, clave } = await crearApiKeyEnBackend(u.username);
      usuarios.setApiKey(u.id, id, clave);
      console.log(`[api-keys] Generada para "${u.username}".`);
    } catch (e) {
      console.warn(`[api-keys] No se pudo generar para "${u.username}" (¿backend caído?):`, e.message);
    }
  }
})();

/** Cuántos administradores activos quedan (protege contra quedarse sin forma de entrar). */
function contarAdminsActivos() {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE role IN ('ADMIN','SUPERADMIN') AND active = 1").get().n;
}

function publicUser(row) {
  return { id: String(row.id), username: row.username, name: row.name || row.username, email: row.email || '', role: row.role, active: row.active !== 0, createdAt: row.created_at || new Date().toISOString(), apiKey: row.api_key || null };
}

// ─────────────── Sesión (cookie firmada HMAC) ───────────────
const COOKIE = 'sf_session';
const MAX_AGE = 60 * 60 * 8;
function sign(data) { return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url'); }
function makeToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = sign(body);
  if (exp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); if (p.exp && Date.now() > p.exp) return null; return p; } catch { return null; }
}
function parseCookies(req) {
  const h = req.headers.cookie;
  const out = {};
  if (h) h.split(';').forEach((c) => { const i = c.indexOf('='); if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}

const app = express();
app.use(express.json({ limit: '12mb' })); // imágenes en base64

// Sesión en req.session
app.use((req, _res, next) => { req.session = readToken(parseCookies(req)[COOKIE]); next(); });
function setCookie(res, payload) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`);
}
function clearCookie(res) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`); }
function requireAuth(req, res, next) { if (!req.session) return res.status(401).json({ error: 'No autenticado.' }); next(); }
function requireAdmin(req, res, next) { if (!req.session) return res.status(401).json({ error: 'No autenticado.' }); if (!esRolAdmin(req.session.role)) return res.status(403).json({ error: 'Requiere rol ADMIN.' }); next(); }

// ─────────────── Backend proxy helper ───────────────
// El BFF siempre actúa como el panel (nunca en nombre de un usuario externo),
// así que toda llamada al backend usa la ADMIN_API_KEY. Las API keys por
// usuario son para que sistemas EXTERNOS (POS, etc.) consuman /productos/*
// directo, sin pasar por este panel.
async function backend(pathname, { method = 'GET', body } = {}) {
  return fetch(`${BACKEND}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─────────────── Cloudflare Images ───────────────
async function subirImagenBase64(code, dataUrl) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error('Faltan credenciales de Cloudflare en el .env del servidor.');
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('Imagen inválida.');
  const buf = Buffer.from(m[2], 'base64');
  // Reemplazo: borrar id previo (si existe) y volver a subir.
  await fetch(`${CF_BASE}/${encodeURIComponent(code)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } }).catch(() => {});
  const form = new FormData();
  form.append('file', new Blob([buf], { type: m[1] }), `${code}`);
  form.append('id', String(code));
  const res = await fetch(CF_BASE, { method: 'POST', headers: { Authorization: `Bearer ${CF_TOKEN}` }, body: form });
  const data = await res.json();
  if (!data.success) throw new Error('Cloudflare rechazó la imagen: ' + JSON.stringify(data.errors));
  return data.result.variants[0];
}
async function borrarImagen(code) {
  if (!CF_ACCOUNT || !CF_TOKEN) return;
  await fetch(`${CF_BASE}/${encodeURIComponent(code)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } }).catch(() => {});
}

// Resuelve el campo image del cliente a una URL final (o null).
async function resolverImagen(code, image) {
  if (!image) return null;
  if (image.startsWith('data:')) return await subirImagenBase64(code, image);
  if (image.startsWith('http')) return image; // ya era una URL (sin cambios)
  return null;
}

// Mapea filas del backend al modelo Product del frontend.
function masterToProduct(r) {
  return { id: r.codigoBarras, code: r.codigoBarras, name: r.nombre, image: r.imagenUrl || '', status: 'aprobado', createdAt: r.actualizadoEn || '', updatedAt: r.actualizadoEn || '', createdBy: '' };
}
function pendienteToProduct(r) {
  return { id: r.codigoBarras, code: r.codigoBarras, name: r.nombre, image: r.imagenUrl || '', status: 'pendiente', pendingReason: r.imagenUrl ? undefined : 'sin_imagen', createdAt: r.creadoEn || '', updatedAt: r.creadoEn || '', createdBy: r.origen || '' };
}

// ─────────────── Rutas de auth ───────────────
app.get('/api/me', (req, res) => {
  if (!req.session) return res.status(401).json({ user: null });
  const row = usuarios.byUsername(req.session.username);
  if (!row || row.active === 0) return res.status(401).json({ user: null });
  res.json({ user: publicUser(row) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales.' });
  const row = usuarios.byUsername(String(username).trim());
  if (!row || row.active === 0 || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos, o cuenta inactiva.' });
  }
  setCookie(res, { username: row.username, role: row.role, name: row.name, id: row.id });
  res.json({ user: publicUser(row) });
});

app.post('/api/logout', (_req, res) => { clearCookie(res); res.json({ ok: true }); });

// ─────────────── Rutas de productos ───────────────
/**
 * GET /api/products?status=aprobado|pendiente&buscar=&limit=&offset=
 * Pagina de verdad contra el backend (que ya resuelve la búsqueda con FTS5 en
 * el maestro y LIKE indexado en pendientes) — nunca carga el catálogo entero
 * en memoria, así funciona igual de bien con 100 productos que con 10,000.
 */
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const status = req.query.status === 'pendiente' ? 'pendiente' : 'aprobado';
    const qs = new URLSearchParams();
    if (req.query.buscar) qs.set('buscar', String(req.query.buscar));
    if (req.query.limit) qs.set('limit', String(req.query.limit));
    if (req.query.offset) qs.set('offset', String(req.query.offset));

    const path = status === 'pendiente' ? `/admin/pendientes?${qs}` : `/admin/productos?${qs}`;
    const r = await backend(path, {});
    const data = await r.json();
    const mapper = status === 'pendiente' ? pendienteToProduct : masterToProduct;
    res.json({
      items: (data.items || []).map(mapper),
      total: data.total ?? 0,
      limit: data.limit,
      offset: data.offset,
    });
  } catch (e) { res.status(502).json({ error: 'No se pudo leer el catálogo: ' + e.message }); }
});

/**
 * GET /api/products/counts → totales livianos para los badges del navbar
 * (usa limit=1 en cada endpoint: el backend igual calcula el COUNT(*) real,
 * pero no transfiere filas de más).
 */
app.get('/api/products/counts', requireAuth, async (_req, res) => {
  try {
    const [mRes, pRes] = await Promise.all([
      backend('/admin/productos?limit=1', {}),
      backend('/admin/pendientes?limit=1', {}),
    ]);
    const m = await mRes.json();
    const p = await pRes.json();
    res.json({ total: m.total ?? 0, pending: p.total ?? 0 });
  } catch (e) { res.status(502).json({ error: 'No se pudo leer los totales: ' + e.message }); }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { code, name, image, status } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'Código y nombre son obligatorios.' });
    const imagenUrl = await resolverImagen(code, image);
    if (status === 'pendiente') {
      const r = await backend('/admin/pendientes', { method: 'POST', body: { codigoBarras: code, nombre: name, imagenUrl, origen: req.session.username } });
      if (r.status === 409) return res.status(409).json({ error: 'Ese código ya existe en el catálogo maestro.' });
      if (!r.ok) return res.status(502).json({ error: 'Error del backend.' });
      return res.status(201).json({ product: { id: code, code, name, image: imagenUrl || '', status: 'pendiente', createdBy: req.session.username, createdAt: new Date().toISOString() } });
    }
    const r = await backend('/admin/productos', { method: 'POST', body: { codigoBarras: code, nombre: name, imagenUrl } });
    if (!r.ok) return res.status(502).json({ error: 'Error del backend.' });
    res.status(201).json({ product: { id: code, code, name, image: imagenUrl || '', status: 'aprobado', createdAt: new Date().toISOString() } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/products/:code', requireAuth, async (req, res) => {
  try {
    const code = req.params.code;
    const { name, image, status } = req.body || {};
    const imagenUrl = await resolverImagen(code, image);
    if (status === 'pendiente') {
      // Upsert en pendientes (el backend hace ON CONFLICT UPDATE).
      const r = await backend('/admin/pendientes', { method: 'POST', body: { codigoBarras: code, nombre: name, imagenUrl, origen: req.session.username } });
      if (!r.ok && r.status !== 409) return res.status(502).json({ error: 'Error del backend.' });
      return res.json({ product: { id: code, code, name, image: imagenUrl || '', status: 'pendiente' } });
    }
    const r = await backend(`/admin/productos/${encodeURIComponent(code)}`, { method: 'PUT', body: { nombre: name, imagenUrl } });
    if (r.status === 404) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (!r.ok) return res.status(502).json({ error: 'Error del backend.' });
    res.json({ product: { id: code, code, name, image: imagenUrl || '', status: 'aprobado' } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/products/:code', requireAuth, async (req, res) => {
  const code = req.params.code;
  const status = req.query.status;
  const route = status === 'pendiente' ? `/admin/pendientes/${encodeURIComponent(code)}` : `/admin/productos/${encodeURIComponent(code)}`;
  const r = await backend(route, { method: 'DELETE' });
  await borrarImagen(code); // limpia la imagen en Cloudflare
  if (!r.ok && r.status !== 404) return res.status(502).json({ error: 'Error del backend.' });
  res.json({ ok: true });
});

app.post('/api/products/:code/approve', requireAuth, async (req, res) => {
  const r = await backend(`/admin/pendientes/${encodeURIComponent(req.params.code)}/aprobar`, { method: 'POST' });
  if (!r.ok) return res.status(502).json({ error: 'No se pudo aprobar.' });
  res.json({ ok: true });
});

/**
 * POST /api/products/bulk
 * Importación masiva (el Excel ya se parseó en el navegador; aquí solo llegan
 * filas { codigoBarras, nombre, imagenUrl? }). Se reenvía al backend en lotes
 * de 1000 — cada lote es una sola transacción SQLite, así que sigue siendo
 * rapidísimo aunque sean miles de filas.
 */
app.post('/api/products/bulk', requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'No hay filas para importar.' });

  const LOTE = 1000;
  let creados = 0;
  let actualizados = 0;
  const errores = [];

  for (let i = 0; i < items.length; i += LOTE) {
    const bloque = items.slice(i, i + LOTE);
    try {
      const r = await backend('/admin/productos/bulk', { method: 'POST', body: { items: bloque } });
      const data = await r.json();
      if (!r.ok) {
        errores.push({ fila: i, error: data.error || 'Error del backend.' });
        continue;
      }
      creados += data.creados || 0;
      actualizados += data.actualizados || 0;
      (data.errores || []).forEach((e) => errores.push({ fila: i + e.fila, error: e.error }));
    } catch (e) {
      errores.push({ fila: i, error: e.message });
    }
  }

  res.json({ ok: true, total: items.length, creados, actualizados, errores });
});

// ─────────────── Rutas de usuarios (admin) ───────────────
app.get('/api/users', requireAdmin, (_req, res) => res.json({ items: usuarios.list().map(publicUser) }));

app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, name, email, role, active } = req.body || {};
  const user = String(username || '').trim();
  if (user.length < 3) return res.status(400).json({ error: 'Usuario: mínimo 3 caracteres.' });
  if (String(password || '').length < 4) return res.status(400).json({ error: 'Contraseña: mínimo 4 caracteres.' });
  if (usuarios.byUsername(user)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
  usuarios.create({ username: user, password_hash: hashPassword(String(password)), name: name || user, email: email || null, role: role === 'ADMIN' ? 'ADMIN' : 'OPERADOR', active: active === false ? 0 : 1 });
  const row = usuarios.byUsername(user);
  try {
    const { id: apiKeyId, clave } = await crearApiKeyEnBackend(user);
    usuarios.setApiKey(row.id, apiKeyId, clave);
  } catch (e) {
    console.warn(`[api-keys] No se pudo generar para "${user}" al crearlo:`, e.message);
  }
  res.status(201).json({ user: publicUser(usuarios.byId(row.id)) });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = usuarios.byId(id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { username, password, name, email, role, active } = req.body || {};
  const newUser = String(username || row.username).trim();
  const dup = usuarios.byUsername(newUser);
  if (dup && dup.id !== id) return res.status(409).json({ error: 'Ese usuario ya existe.' });

  const esSuperadmin = row.role === 'SUPERADMIN';
  // El superadmin es intocable en rol/estado: siempre queda SUPERADMIN y activo,
  // sin importar qué se haya enviado (puede seguir cambiando usuario/nombre/contraseña).
  const nuevoRole = esSuperadmin ? 'SUPERADMIN' : (role === 'ADMIN' ? 'ADMIN' : 'OPERADOR');
  const nuevoActive = esSuperadmin ? 1 : (active === false ? 0 : 1);

  const dejaDeSerAdminActivo = row.role === 'ADMIN' && row.active === 1 && (nuevoRole !== 'ADMIN' || nuevoActive === 0);
  if (dejaDeSerAdminActivo && contarAdminsActivos() <= 1) {
    return res.status(400).json({ error: 'Es el último administrador activo: no puedes quitarle el rol admin ni desactivarlo. Crea otro admin primero.' });
  }

  usuarios.update(id, { username: newUser, name: name ?? row.name, email: email ?? row.email, role: nuevoRole, active: nuevoActive });
  if (password) usuarios.setPassword(id, hashPassword(String(password)));
  res.json({ user: publicUser(usuarios.byId(id)) });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = usuarios.byId(id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (row.role === 'SUPERADMIN') {
    return res.status(400).json({ error: 'El superadministrador no se puede eliminar.' });
  }
  if (row.username === req.session.username) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  if (row.role === 'ADMIN' && row.active === 1 && contarAdminsActivos() <= 1) {
    return res.status(400).json({ error: 'Es el último administrador activo: no se puede eliminar. Crea otro admin primero.' });
  }
  await revocarApiKeyEnBackend(row.api_key_id);
  usuarios.remove(id);
  res.json({ ok: true });
});

/** POST /api/users/:id/regenerate-key → revoca la key vieja (si había) y crea una nueva. */
app.post('/api/users/:id/regenerate-key', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = usuarios.byId(id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
  try {
    await revocarApiKeyEnBackend(row.api_key_id);
    const { id: apiKeyId, clave } = await crearApiKeyEnBackend(row.username);
    usuarios.setApiKey(id, apiKeyId, clave);
    res.json({ user: publicUser(usuarios.byId(id)) });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo regenerar la API key: ' + e.message });
  }
});

// ─────────────── Estáticos en producción ───────────────
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`✔ BFF Superfood en http://localhost:${PORT}  → backend ${BACKEND}`);
  if (!CF_TOKEN) console.warn('  ⚠ Falta CLOUDFLARE_API_TOKEN: no se podrán subir imágenes.');
});
