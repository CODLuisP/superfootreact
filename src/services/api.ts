import { Product, User, UserRole } from '../types';

/** Cliente de las APIs del panel (todas pasan por el BFF en /api). */

async function req(url: string, opts: RequestInit = {}) {
  const method = (opts.method || 'GET').toUpperCase();

  let parsedBody: unknown = null;
  if (opts.body && typeof opts.body === 'string') {
    try {
      const raw = JSON.parse(opts.body);
      if (raw && typeof raw === 'object') {
        const copy = { ...(raw as Record<string, unknown>) };
        if (typeof copy.image === 'string' && copy.image.startsWith('data:')) {
          copy.image = `[Base64 image (~${Math.round(copy.image.length / 1024)} KB)]`;
        }
        parsedBody = copy;
      } else {
        parsedBody = raw;
      }
    } catch {
      parsedBody = opts.body;
    }
  }

  const badgeColor =
    method === 'GET'
      ? '#0284c7'
      : method === 'POST'
      ? '#16a34a'
      : method === 'PUT'
      ? '#d97706'
      : '#dc2626';

  if (parsedBody) {
    console.log(
      `%c[API ${method}]%c ${url}`,
      `background: ${badgeColor}; color: white; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 11px;`,
      'font-weight: bold; color: inherit;',
      '| Datos enviados:',
      parsedBody
    );
  } else {
    console.log(
      `%c[API ${method}]%c ${url}`,
      `background: ${badgeColor}; color: white; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 11px;`,
      'font-weight: bold; color: inherit;'
    );
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const d = await res.json();
      if (d?.error) msg = d.error;
    } catch { /* sin cuerpo */ }
    console.error(
      `%c[API ERROR ${res.status}]%c ${url}`,
      'background: #dc2626; color: white; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 11px;',
      'font-weight: bold;',
      msg
    );
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // ── Auth ──
  async me(): Promise<User | null> {
    try {
      const d = await req('/api/me');
      return d.user as User;
    } catch {
      return null;
    }
  },
  async login(username: string, password: string): Promise<User> {
    const d = await req('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    return d.user as User;
  },
  logout: () => req('/api/logout', { method: 'POST' }),

  // ── Productos (paginado: nunca trae el catálogo completo) ──
  async getProductsPage(params: { status?: 'aprobado' | 'pendiente'; buscar?: string; limit?: number; offset?: number }): Promise<{ items: Product[]; total: number }> {
    const qs = new URLSearchParams();
    qs.set('status', params.status ?? 'aprobado');
    if (params.buscar) qs.set('buscar', params.buscar);
    qs.set('limit', String(params.limit ?? 20));
    qs.set('offset', String(params.offset ?? 0));
    const d = await req(`/api/products?${qs}`);
    return { items: d.items as Product[], total: d.total as number };
  },
  async getCounts(): Promise<{ total: number; pending: number }> {
    return req('/api/products/counts');
  },
  async createProduct(p: { code: string; name: string; image?: string; status: 'aprobado' | 'pendiente' }): Promise<Product> {
    const d = await req('/api/products', { method: 'POST', body: JSON.stringify(p) });
    return d.product as Product;
  },
  async updateProduct(code: string, p: { code?: string; newCode?: string; name: string; image?: string; status: 'aprobado' | 'pendiente' }): Promise<Product> {
    const d = await req(`/api/products/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(p) });
    return d.product as Product;
  },
  deleteProduct: (code: string, status: 'aprobado' | 'pendiente') =>
    req(`/api/products/${encodeURIComponent(code)}?status=${status}`, { method: 'DELETE' }),
  approve: (code: string) => req(`/api/products/${encodeURIComponent(code)}/approve`, { method: 'POST' }),

  /** Importación masiva: crea/actualiza en el maestro en un solo llamado (el BFF trocea internamente). */
  async bulkImport(items: { codigoBarras: string; nombre: string; imagenUrl?: string }[]): Promise<{
    total: number; creados: number; actualizados: number; errores: { fila: number; error: string }[];
  }> {
    return req('/api/products/bulk', { method: 'POST', body: JSON.stringify({ items }) });
  },

  // ── Usuarios (admin) ──
  async getUsers(): Promise<User[]> {
    const d = await req('/api/users');
    return d.items as User[];
  },
  async createUser(u: { username: string; password: string; name?: string; email?: string; role: UserRole; active?: boolean }): Promise<User> {
    const d = await req('/api/users', { method: 'POST', body: JSON.stringify(u) });
    return d.user as User;
  },
  async updateUser(id: string, u: { username?: string; password?: string; name?: string; email?: string; role?: UserRole; active?: boolean }): Promise<User> {
    const d = await req(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(u) });
    return d.user as User;
  },
  deleteUser: (id: string) => req(`/api/users/${id}`, { method: 'DELETE' }),
  async regenerateApiKey(id: string): Promise<User> {
    const d = await req(`/api/users/${id}/regenerate-key`, { method: 'POST' });
    return d.user as User;
  },
};
