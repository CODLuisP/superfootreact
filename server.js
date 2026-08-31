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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const BACKEND = (process.env.CATALOGO_API_URL || 'https://sr.velsat.pe:2053/superfood').replace(/\/+$/, '');
const ADMIN_KEY = process.env.CATALOGO_ADMIN_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-cambiame';

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1`;

// ─────────────── Almacenamiento de usuarios (JSON puro, 100% compatible con Vercel) ───────────────
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* noop */ }
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');

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

function loadUsersFromDisk() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[usuarios] Error al leer archivo de usuarios:', e);
  }
  return [];
}

function saveUsersToDisk(usersList) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2), 'utf8');
  } catch (e) {
    console.error('[usuarios] Error al guardar archivo de usuarios:', e);
  }
}

let _usuariosMem = loadUsersFromDisk();

function initUsuarios() {
  const adminUser = (process.env.ADMIN_USER || 'owen').trim();
  const adminPass = process.env.ADMIN_PASSWORD || 'owen852';

  if (_usuariosMem.length === 0) {
    _usuariosMem = [
      {
        id: 1,
        username: adminUser,
        password_hash: hashPassword(adminPass),
        name: 'Administrador Principal',
        email: 'admin@superfood.com',
        role: 'SUPERADMIN',
        active: 1,
        created_at: new Date().toISOString(),
        api_key: null,
        api_key_id: null
      }
    ];
    saveUsersToDisk(_usuariosMem);
  } else {
    // Si ya existen usuarios, nos aseguramos de que el admin de ADMIN_USER exista y tenga su rol
    const uAdmin = _usuariosMem.find(u => u.username.toLowerCase() === adminUser.toLowerCase());
    if (uAdmin) {
      if (uAdmin.role !== 'SUPERADMIN') {
        uAdmin.role = 'SUPERADMIN';
        saveUsersToDisk(_usuariosMem);
      }
    } else {
      const maxId = _usuariosMem.reduce((max, u) => Math.max(max, u.id || 0), 0);
      _usuariosMem.push({
        id: maxId + 1,
        username: adminUser,
        password_hash: hashPassword(adminPass),
        name: 'Administrador Principal',
        email: 'admin@superfood.com',
        role: 'SUPERADMIN',
        active: 1,
        created_at: new Date().toISOString(),
        api_key: null,
        api_key_id: null
      });
      saveUsersToDisk(_usuariosMem);
    }
  }
}

initUsuarios();

const usuarios = {
  byUsername: (u) => {
    if (!u) return null;
    const target = String(u).trim().toLowerCase();
    return _usuariosMem.find(x => x.username.toLowerCase() === target) || null;
  },
  byId: (id) => {
    const numId = parseInt(id, 10);
    return _usuariosMem.find(x => x.id === numId) || null;
  },
  list: () => {
    return [..._usuariosMem].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  },
  create: (u) => {
    const maxId = _usuariosMem.reduce((max, x) => Math.max(max, x.id || 0), 0);
    const nuevo = {
      id: maxId + 1,
      username: u.username,
      password_hash: u.password_hash,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      created_at: new Date().toISOString(),
      api_key: null,
      api_key_id: null
    };
    _usuariosMem.push(nuevo);
    saveUsersToDisk(_usuariosMem);
    return nuevo;
  },
  update: (id, u) => {
    const numId = parseInt(id, 10);
    const index = _usuariosMem.findIndex(x => x.id === numId);
    if (index === -1) return;
    _usuariosMem[index] = {
      ..._usuariosMem[index],
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active
    };
    saveUsersToDisk(_usuariosMem);
  },
  setPassword: (id, hash) => {
    const numId = parseInt(id, 10);
    const user = _usuariosMem.find(x => x.id === numId);
    if (user) {
      user.password_hash = hash;
      saveUsersToDisk(_usuariosMem);
    }
  },
  setApiKey: (id, apiKeyId, apiKey) => {
    const numId = parseInt(id, 10);
    const user = _usuariosMem.find(x => x.id === numId);
    if (user) {
      user.api_key_id = apiKeyId;
      user.api_key = apiKey;
      saveUsersToDisk(_usuariosMem);
    }
  },
  remove: (id) => {
    const numId = parseInt(id, 10);
    _usuariosMem = _usuariosMem.filter(x => x.id !== numId);
    saveUsersToDisk(_usuariosMem);
  }
};

/** ¿Este rol tiene permisos de administrador (gestionar usuarios, etc.)? */
function esRolAdmin(role) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

// ─────────────── API key personal (una por usuario, vive en el backend) ───────────────
async function crearApiKeyEnBackend(etiqueta) {
  if (!ADMIN_KEY) return { id: null, clave: null, etiqueta };
  try {
    const r = await fetch(`${BACKEND}/admin/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY },
      body: JSON.stringify({ etiqueta }),
    });
    if (!r.ok) return { id: null, clave: null, etiqueta };
    return r.json();
  } catch {
    return { id: null, clave: null, etiqueta };
  }
}
async function revocarApiKeyEnBackend(id) {
  if (!id || !ADMIN_KEY) return;
  await fetch(`${BACKEND}/admin/api-keys/${id}`, { method: 'DELETE', headers: { 'x-api-key': ADMIN_KEY } }).catch(() => {});
}

/** Cuántos administradores activos quedan (protege contra quedarse sin forma de entrar). */
function contarAdminsActivos() {
  return _usuariosMem.filter(u => (u.role === 'ADMIN' || u.role === 'SUPERADMIN') && u.active === 1).length;
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
app.disable('x-powered-by');

// ─────────────── Keep-Alive Middleware ───────────────
app.use((_req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=65, max=1000');
  next();
});

app.use(express.json({ limit: '12mb' })); // imágenes en base64

// Logger de APIs en consola del servidor
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      let payloadLog = '';
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        const copy = { ...req.body };
        if (typeof copy.image === 'string' && copy.image.startsWith('data:')) {
          copy.image = `[Base64 image (~${Math.round(copy.image.length / 1024)} KB)]`;
        }
        payloadLog = ' | Datos: ' + JSON.stringify(copy);
      }
      console.log(`[API ${req.method}] ${req.originalUrl} -> ${res.statusCode} (${ms}ms)${payloadLog}`);
    });
  }
  next();
});

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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ADMIN_KEY,
      'Connection': 'keep-alive',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─────────────── Cloudflare Images ───────────────
function extraerIdCloudflare(url) {
  if (!url || typeof url !== 'string') return null;
  const m = /imagedelivery\.net\/[^/]+\/([^/?#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

async function borrarImagenCloudflare(idOrUrl) {
  if (!CF_ACCOUNT || !CF_TOKEN || !idOrUrl) return;
  const id = extraerIdCloudflare(idOrUrl) || idOrUrl;
  try {
    await fetch(`${CF_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${CF_TOKEN}` },
    });
  } catch (e) {
    console.warn(`[cf-delete] No se pudo borrar ${id}:`, e.message);
  }
}

async function subirImagenBase64(code, dataUrl, oldImageUrl) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error('Faltan credenciales de Cloudflare en el .env del servidor.');
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('Imagen inválida.');
  const buf = Buffer.from(m[2], 'base64');

  // ID único con timestamp: evita conflictos 409 de Cloudflare y garantiza actualización inmediata en navegador
  const newId = `${code}_${Date.now()}`;
  const form = new FormData();
  form.append('file', new Blob([buf], { type: m[1] }), `${newId}`);
  form.append('id', String(newId));

  const res = await fetch(CF_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
    body: form,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error('Cloudflare rechazó la imagen: ' + JSON.stringify(data.errors));
  }

  // Eliminar la imagen anterior de Cloudflare si existía
  if (oldImageUrl) {
    borrarImagenCloudflare(oldImageUrl).catch(() => {});
  }
  borrarImagenCloudflare(code).catch(() => {});

  return data.result.variants[0];
}

// Resuelve el campo image del cliente a una URL final (o null).
async function resolverImagen(code, image, oldImageUrl) {
  if (!image) return null;
  if (image.startsWith('data:')) return await subirImagenBase64(code, image, oldImageUrl);
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

// ─────────────── Cache en memoria de productos y Prefijo de Código ───────────────
const _catalogCache = {
  aprobado: { items: [], timestamp: 0, fetching: null },
  pendiente: { items: [], timestamp: 0, fetching: null },
};

function invalidateCatalogCache(status) {
  if (status && _catalogCache[status]) {
    _catalogCache[status] = { items: [], timestamp: 0, fetching: null };
  } else {
    _catalogCache.aprobado = { items: [], timestamp: 0, fetching: null };
    _catalogCache.pendiente = { items: [], timestamp: 0, fetching: null };
  }
}

async function fetchAllProductsFromBackend(status) {
  const cacheKey = status === 'pendiente' ? 'pendiente' : 'aprobado';
  const now = Date.now();
  if (_catalogCache[cacheKey].items.length > 0 && (now - _catalogCache[cacheKey].timestamp) < 60000) {
    return _catalogCache[cacheKey].items;
  }
  if (_catalogCache[cacheKey].fetching) {
    return _catalogCache[cacheKey].fetching;
  }

  const endpoint = status === 'pendiente' ? '/admin/pendientes' : '/admin/productos';
  const mapper = status === 'pendiente' ? pendienteToProduct : masterToProduct;

  _catalogCache[cacheKey].fetching = (async () => {
    try {
      const firstRes = await backend(`${endpoint}?limit=100&offset=0`, {});
      const firstData = await firstRes.json().catch(() => ({}));
      if (!firstRes.ok) throw new Error(firstData.error || 'Error al obtener productos');
      const total = firstData.total || 0;
      let rawItems = firstData.items || [];
      if (total > 100) {
        const pageOffsets = [];
        for (let off = 100; off < total; off += 100) {
          pageOffsets.push(off);
        }
        const pages = await Promise.all(
          pageOffsets.map(async (off) => {
            const r = await backend(`${endpoint}?limit=100&offset=${off}`, {});
            const d = await r.json().catch(() => ({ items: [] }));
            return d.items || [];
          })
        );
        for (const pg of pages) {
          rawItems.push(...pg);
        }
      }
      const mapped = rawItems.map(mapper);
      _catalogCache[cacheKey] = { items: mapped, timestamp: Date.now(), fetching: null };
      return mapped;
    } catch (err) {
      _catalogCache[cacheKey].fetching = null;
      throw err;
    }
  })();

  return _catalogCache[cacheKey].fetching;
}

// ─────────────── Rutas de productos ───────────────
/**
 * GET /api/products?status=aprobado|pendiente&buscar=&codigoPrefix=&limit=&offset=
 * Soporta filtrado por prefijo de código de barras (ej. que empiecen por 1, 7, 775 o cualquier número),
 * además de búsqueda por texto y paginación rápida.
 */
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const status = req.query.status === 'pendiente' ? 'pendiente' : 'aprobado';
    const codigoPrefix = req.query.codigoPrefix ? String(req.query.codigoPrefix).trim() : '';
    const buscar = req.query.buscar ? String(req.query.buscar).trim() : '';
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    if (codigoPrefix) {
      let items = await fetchAllProductsFromBackend(status);
      // Filtrar estrictamente por inicio de código de barras
      items = items.filter((p) => String(p.code || '').startsWith(codigoPrefix));
      if (buscar) {
        const qLower = buscar.toLowerCase();
        items = items.filter(
          (p) =>
            (p.name || '').toLowerCase().includes(qLower) ||
            (p.code || '').toLowerCase().includes(qLower)
        );
      }
      const total = items.length;
      const sliced = items.slice(offset, offset + limit);
      return res.json({
        items: sliced,
        total,
        limit,
        offset,
      });
    }

    const qs = new URLSearchParams();
    if (buscar) qs.set('buscar', buscar);
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));

    const path = status === 'pendiente' ? `/admin/pendientes?${qs}` : `/admin/productos?${qs}`;
    const r = await backend(path, {});
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });
    }
    const mapper = status === 'pendiente' ? pendienteToProduct : masterToProduct;
    res.json({
      items: (data.items || []).map(mapper),
      total: data.total ?? 0,
      limit: data.limit,
      offset: data.offset,
    });
  } catch (e) { res.status(502).json({ error: 'No se pudo leer el catálogo: ' + e.message }); }
});

app.get('/api/products/counts', requireAuth, async (_req, res) => {
  try {
    const [mRes, pRes] = await Promise.all([
      backend('/admin/productos?limit=1', {}),
      backend('/admin/pendientes?limit=1', {}),
    ]);
    const m = await mRes.json().catch(() => ({}));
    const p = await pRes.json().catch(() => ({}));
    if (!mRes.ok || !pRes.ok) {
      return res.json({ total: 0, pending: 0 });
    }
    res.json({ total: m.total ?? 0, pending: p.total ?? 0 });
  } catch (e) { res.status(502).json({ error: 'No se pudo leer los totales: ' + e.message }); }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { code, name, image, status } = req.body || {};
    const cleanCode = String(code || '').trim();
    const cleanName = String(name || '').trim();

    if (!cleanCode || !cleanName) {
      return res.status(400).json({ error: 'Código de barras y nombre son obligatorios.' });
    }

    // 1. Verificación previa de existencia para evitar sobreescribir productos existentes
    const rCheck = await backend(`/admin/productos?q=${encodeURIComponent(cleanCode)}&limit=1`, {});
    if (rCheck.ok) {
      const dataCheck = await rCheck.json().catch(() => ({}));
      const existing = (dataCheck.items || []).find(
        (p) => String(p.codigoBarras || p.codigo_barras).trim() === cleanCode
      );
      if (existing) {
        return res.status(409).json({
          error: `Ya existe un producto registrado con el código de barras "${cleanCode}" ("${existing.nombre}"). No es posible duplicarlo.`,
        });
      }
    }

    const imagenUrl = await resolverImagen(cleanCode, image, null);

    if (status === 'pendiente') {
      const r = await backend('/admin/pendientes', {
        method: 'POST',
        body: { codigoBarras: cleanCode, nombre: cleanName, imagenUrl, origen: req.session.username },
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) return res.status(409).json({ error: data.error || `Ya existe un producto con el código "${cleanCode}".` });
      if (!r.ok) return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });
      invalidateCatalogCache('pendiente');
      return res.status(201).json({
        product: { id: cleanCode, code: cleanCode, name: cleanName, image: imagenUrl || '', status: 'pendiente', createdBy: req.session.username, createdAt: new Date().toISOString() },
      });
    }

    const r = await backend('/admin/productos', {
      method: 'POST',
      body: { codigoBarras: cleanCode, nombre: cleanName, imagenUrl },
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 409) return res.status(409).json({ error: data.error || `Ya existe un producto con el código "${cleanCode}".` });
    if (!r.ok) return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });
    invalidateCatalogCache('aprobado');
    res.status(201).json({
      product: { id: cleanCode, code: cleanCode, name: cleanName, image: imagenUrl || '', status: 'aprobado', createdAt: new Date().toISOString() },
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/products/:code', requireAuth, async (req, res) => {
  try {
    const oldCode = String(req.params.code).trim();
    const { code: rawNewCode, newCode, name, image, status } = req.body || {};
    const targetCode = String(rawNewCode || newCode || oldCode).trim();
    const cleanName = String(name || '').trim();

    if (!targetCode) return res.status(400).json({ error: 'El código de barras es obligatorio.' });
    if (!cleanName) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    // Si el usuario está cambiando el código de barras, verificar que el nuevo código no pertenezca a otro producto
    if (targetCode !== oldCode) {
      const rCheck = await backend(`/admin/productos?q=${encodeURIComponent(targetCode)}&limit=1`, {});
      if (rCheck.ok) {
        const dataCheck = await rCheck.json().catch(() => ({}));
        const existing = (dataCheck.items || []).find(
          (p) => String(p.codigoBarras || p.codigo_barras).trim() === targetCode
        );
        if (existing) {
          return res.status(409).json({
            error: `El código de barras "${targetCode}" ya está registrado para otro producto ("${existing.nombre}").`,
          });
        }
      }
    }

    // Buscar imagen anterior del producto para saber cuál borrar en Cloudflare
    let oldImageUrl = null;
    try {
      const checkPath = status === 'pendiente' ? `/admin/pendientes?buscar=${encodeURIComponent(oldCode)}&limit=1` : `/admin/productos?q=${encodeURIComponent(oldCode)}&limit=1`;
      const rCurrent = await backend(checkPath, {});
      if (rCurrent.ok) {
        const dataCurrent = await rCurrent.json().catch(() => ({}));
        const found = (dataCurrent.items || []).find((p) => String(p.codigoBarras || p.codigo_barras).trim() === oldCode);
        if (found) oldImageUrl = found.imagenUrl || found.imagen_url || null;
      }
    } catch { /* noop */ }

    // Limpieza en Cloudflare SOLO si el usuario quitó la foto explícitamente
    if (!image) {
      if (oldImageUrl) await borrarImagenCloudflare(oldImageUrl);
      await borrarImagenCloudflare(oldCode);
    }

    const imagenUrl = await resolverImagen(targetCode, image, oldImageUrl);

    if (status === 'pendiente') {
      // Upsert en pendientes con el targetCode
      const r = await backend('/admin/pendientes', {
        method: 'POST',
        body: { codigoBarras: targetCode, nombre: cleanName, imagenUrl, origen: req.session.username },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 409) return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });

      if (targetCode !== oldCode) {
        await backend(`/admin/pendientes/${encodeURIComponent(oldCode)}`, { method: 'DELETE' }).catch(() => {});
      }
      invalidateCatalogCache('pendiente');
      return res.json({ product: { id: targetCode, code: targetCode, name: cleanName, image: imagenUrl || '', status: 'pendiente' } });
    }

    // Catálogo maestro ('aprobado'):
    if (targetCode !== oldCode) {
      // 1. Creamos con el nuevo código
      const rCreate = await backend('/admin/productos', {
        method: 'POST',
        body: { codigoBarras: targetCode, nombre: cleanName, imagenUrl },
      });
      const dataCreate = await rCreate.json().catch(() => ({}));
      if (!rCreate.ok) return res.status(rCreate.status || 502).json({ error: dataCreate.error || `Error al actualizar producto (${rCreate.status}).` });

      // 2. Eliminamos el código anterior
      await backend(`/admin/productos/${encodeURIComponent(oldCode)}`, { method: 'DELETE' }).catch(() => {});
    } else {
      const r = await backend(`/admin/productos/${encodeURIComponent(oldCode)}`, {
        method: 'PUT',
        body: { nombre: cleanName, imagenUrl },
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 404) return res.status(404).json({ error: 'Producto no encontrado.' });
      if (!r.ok) return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });
    }

    invalidateCatalogCache('aprobado');
    res.json({ product: { id: targetCode, code: targetCode, name: cleanName, image: imagenUrl || '', status: 'aprobado' } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/products/:code', requireAuth, async (req, res) => {
  const code = req.params.code;
  const status = req.query.status;

  let oldImageUrl = null;
  try {
    const checkPath = status === 'pendiente' ? `/admin/pendientes?buscar=${encodeURIComponent(code)}&limit=1` : `/admin/productos?q=${encodeURIComponent(code)}&limit=1`;
    const rCurrent = await backend(checkPath, {});
    if (rCurrent.ok) {
      const dataCurrent = await rCurrent.json().catch(() => ({}));
      const found = (dataCurrent.items || []).find((p) => String(p.codigoBarras || p.codigo_barras).trim() === code);
      if (found) oldImageUrl = found.imagenUrl || found.imagen_url || null;
    }
  } catch { /* noop */ }

  const route = status === 'pendiente' ? `/admin/pendientes/${encodeURIComponent(code)}` : `/admin/productos/${encodeURIComponent(code)}`;
  const r = await backend(route, { method: 'DELETE' });

  if (oldImageUrl) await borrarImagenCloudflare(oldImageUrl);
  await borrarImagenCloudflare(code);

  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 404) return res.status(r.status || 502).json({ error: data.error || `Error del backend (${r.status}).` });
  invalidateCatalogCache(status === 'pendiente' ? 'pendiente' : 'aprobado');
  res.json({ ok: true });
});

/**
 * POST /api/products/delete-many
 * Eliminación múltiple de productos en lote.
 */
app.post('/api/products/delete-many', requireAuth, async (req, res) => {
  try {
    const { codes, status } = req.body || {};
    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ error: 'Se requiere una lista de códigos a eliminar.' });
    }

    const st = status === 'pendiente' ? 'pendiente' : 'aprobado';
    const deleted = [];
    const errors = [];

    // Procesar en lotes concurrentes de 20
    const BATCH = 20;
    for (let i = 0; i < codes.length; i += BATCH) {
      const chunk = codes.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (code) => {
          const cleanCode = String(code).trim();
          if (!cleanCode) return;
          try {
            const route = st === 'pendiente' ? `/admin/pendientes/${encodeURIComponent(cleanCode)}` : `/admin/productos/${encodeURIComponent(cleanCode)}`;
            const r = await backend(route, { method: 'DELETE' });
            if (r.ok || r.status === 404) {
              deleted.push(cleanCode);
              borrarImagenCloudflare(cleanCode).catch(() => {});
            } else {
              const d = await r.json().catch(() => ({}));
              errors.push({ code: cleanCode, error: d.error || `Error (${r.status})` });
            }
          } catch (err) {
            errors.push({ code: cleanCode, error: err.message });
          }
        })
      );
    }

    invalidateCatalogCache(st);
    res.json({ ok: true, count: deleted.length, deleted, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products/:code/approve', requireAuth, async (req, res) => {
  const r = await backend(`/admin/pendientes/${encodeURIComponent(req.params.code)}/aprobar`, { method: 'POST' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(r.status || 502).json({ error: data.error || 'No se pudo aprobar.' });
  invalidateCatalogCache();
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

  invalidateCatalogCache('aprobado');
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

// ─────────────── Estáticos en producción (solo fuera de Vercel) ───────────────
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`✔ BFF Superfood en http://localhost:${PORT}  → backend ${BACKEND}`);
    if (!CF_TOKEN) console.warn('  ⚠ Falta CLOUDFLARE_API_TOKEN: no se podrán subir imágenes.');
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

export default app;
