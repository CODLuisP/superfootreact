// SUPERADMIN: mismos permisos que ADMIN, pero nunca se puede eliminar, desactivar
// ni degradar (garantiza que siempre exista al menos una cuenta con acceso).
// No es seleccionable al crear/editar usuarios; el backend lo asigna solo al
// usuario configurado como ADMIN_USER.
export type UserRole = 'ADMIN' | 'OPERADOR' | 'SUPERADMIN';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  email?: string;
  createdAt: string;
  active: boolean;
  apiKey?: string | null; // clave personal para consumir la API pública del backend
}

export type ProductStatus = 'aprobado' | 'pendiente';

export interface Product {
  id: string;
  code: string; // Barcode (required)
  name: string; // Product name (required)
  image?: string; // Data URL or Image URL
  category?: string;
  price?: number;
  stock?: number;
  description?: string;
  status: ProductStatus;
  pendingReason?: 'sin_imagen' | 'sin_verificar_codigo' | 'datos_incompletos';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ActiveTab = 'cargar' | 'gestionar' | 'pendientes' | 'usuarios';
