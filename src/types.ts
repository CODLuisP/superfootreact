export type UserRole = 'ADMIN' | 'OPERADOR';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  email?: string;
  createdAt: string;
  active: boolean;
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
