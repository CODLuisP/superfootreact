import React, { useEffect, useState } from 'react';
import { User, UserRole } from '../types';
import { api } from '../services/api';
import {
  UserPlus, ShieldCheck, UserCheck, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, ShieldAlert, Shield, Key, Copy, Check, RefreshCw, Crown, Lock,
} from 'lucide-react';

function badgeClasses(role: UserRole) {
  if (role === 'SUPERADMIN') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (role === 'ADMIN') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  return 'bg-blue-100 text-blue-800 border border-blue-200';
}
function avatarClasses(role: UserRole) {
  if (role === 'SUPERADMIN') return 'bg-amber-100 text-amber-800';
  if (role === 'ADMIN') return 'bg-emerald-100 text-emerald-800';
  return 'bg-blue-100 text-blue-800';
}

interface UsuariosViewProps {
  currentUser: User;
}

export const UsuariosView: React.FC<UsuariosViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{ username: string; name: string; email: string; password: string; role: UserRole; active: boolean }>({
    username: '', name: '', email: '', password: '', role: 'OPERADOR', active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN';

  const refreshUsers = async () => {
    try { setUsers(await api.getUsers()); } catch { setUsers([]); }
  };
  useEffect(() => { if (isAdmin) refreshUsers(); }, [isAdmin]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({ username: '', name: '', email: '', password: '', role: 'OPERADOR', active: true });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({ username: user.username, name: user.name, email: user.email || '', password: '', role: user.role, active: user.active !== false });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.username.trim() || !formData.name.trim()) {
      setFormError('El usuario y el nombre completo son obligatorios.');
      return;
    }
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          username: formData.username.trim(),
          name: formData.name.trim(),
          email: formData.email.trim() || undefined,
          password: formData.password || undefined,
          role: formData.role,
          active: formData.active,
        });
      } else {
        if (formData.password.length < 4) { setFormError('La contraseña debe tener al menos 4 caracteres.'); return; }
        await api.createUser({
          username: formData.username.trim(),
          name: formData.name.trim(),
          email: formData.email.trim() || undefined,
          password: formData.password,
          role: formData.role,
          active: formData.active,
        });
      }
      await refreshUsers();
      setIsCreateModalOpen(false);
    } catch (err) {
      setFormError((err as Error).message || 'No se pudo guardar el usuario.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    try {
      await api.deleteUser(user.id);
      setUserToDelete(null);
      await refreshUsers();
    } catch (err) {
      alert((err as Error).message || 'No se pudo eliminar.');
    }
  };

  const handleCopyKey = async (user: User) => {
    if (!user.apiKey) return;
    try {
      await navigator.clipboard.writeText(user.apiKey);
      setCopiedId(user.id);
      setTimeout(() => setCopiedId((prev) => (prev === user.id ? null : prev)), 2000);
    } catch {
      alert('No se pudo copiar. Selecciona y copia la clave manualmente.');
    }
  };

  const handleRegenerateKey = async (user: User) => {
    if (!confirm(`¿Regenerar la API key de "${user.username}"? La clave anterior dejará de funcionar de inmediato.`)) return;
    setRegenerandoId(user.id);
    try {
      await api.regenerateApiKey(user.id);
      await refreshUsers();
    } catch (err) {
      alert((err as Error).message || 'No se pudo regenerar la clave.');
    } finally {
      setRegenerandoId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0"><ShieldAlert className="h-5 w-5" /></div>
          <div>
            <h4 className="text-sm font-bold text-blue-900">Acceso restringido (rol Operador)</h4>
            <p className="text-xs text-blue-700">Has iniciado sesión como <strong>{currentUser.name}</strong> ({currentUser.role}). Solo un Administrador puede gestionar usuarios.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[10px] uppercase tracking-wider mb-0.5">
            <Shield className="h-3.5 w-3.5" />
            <span>Control de Accesos & Roles</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Gestión de Usuarios</h1>
          <p className="text-xs text-gray-500 mt-0.5">Administra los operadores y administradores del sistema.</p>
        </div>
        <button type="button" onClick={handleOpenCreate} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition">
          <UserPlus className="h-3.5 w-3.5" />
          <span>Crear nuevo usuario</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50/80 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-200 tracking-wider">
              <tr>
                <th className="px-3.5 py-2.5">Usuario</th>
                <th className="px-3.5 py-2.5">Nombre Completo</th>
                <th className="px-3.5 py-2.5">Correo</th>
                <th className="px-3.5 py-2.5">Rol</th>
                <th className="px-3.5 py-2.5">Estado</th>
                <th className="px-3.5 py-2.5">API Key</th>
                <th className="px-3.5 py-2.5">Registro</th>
                <th className="px-3.5 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isCurrent = u.username === currentUser.username;
                return (
                  <tr key={u.id} className={`hover:bg-gray-50/80 transition ${isCurrent ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-[11px] ${avatarClasses(u.role)}`}>{u.username.slice(0, 2).toUpperCase()}</div>
                        <div className="font-bold text-gray-900 flex items-center gap-1">
                          <span>{u.username}</span>
                          {isCurrent && <span className="px-1 py-0.2 rounded text-[9px] bg-emerald-600 text-white font-normal">Tú</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2 font-medium text-gray-900">{u.name}</td>
                    <td className="px-3.5 py-2 text-gray-500">{u.email || '—'}</td>
                    <td className="px-3.5 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${badgeClasses(u.role)}`}>
                        {u.role === 'SUPERADMIN' ? <Crown className="h-3 w-3 text-amber-700" /> : u.role === 'ADMIN' ? <ShieldCheck className="h-3 w-3 text-emerald-700" /> : <UserCheck className="h-3 w-3 text-blue-700" />}
                        <span>{u.role}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2">
                      {u.active !== false ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /><span>Activo</span></span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400"><XCircle className="h-3 w-3" /><span>Inactivo</span></span>
                      )}
                    </td>
                    <td className="px-3.5 py-2">
                      {u.apiKey ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[130px]" title={u.apiKey}>
                            {u.apiKey.slice(0, 8)}…{u.apiKey.slice(-4)}
                          </span>
                          <button type="button" onClick={() => handleCopyKey(u)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition" title="Copiar API key completa">
                            {copiedId === u.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                          <button type="button" onClick={() => handleRegenerateKey(u)} disabled={regenerandoId === u.id} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-40" title="Regenerar API key">
                            <RefreshCw className={`h-3 w-3 ${regenerandoId === u.id ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => handleRegenerateKey(u)} disabled={regenerandoId === u.id} className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-emerald-700 transition">
                          <Key className="h-3 w-3" /> {regenerandoId === u.id ? 'Generando…' : 'Generar'}
                        </button>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-[11px] text-gray-500">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-ES') : '—'}</td>
                    <td className="px-3.5 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => handleOpenEdit(u)} className="p-1 rounded-lg text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition" title="Editar usuario"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button
                          type="button"
                          onClick={() => setUserToDelete(u)}
                          disabled={isCurrent || u.role === 'SUPERADMIN'}
                          className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          title={u.role === 'SUPERADMIN' ? 'El superadministrador no se puede eliminar' : isCurrent ? 'No puedes borrar tu usuario' : 'Eliminar usuario'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Matrix */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-0.5 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /><span>Matriz de Permisos por Rol</span></h3>
        <p className="text-xs text-gray-500 mb-3">Autorizaciones de cada perfil dentro del sistema Superfood.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1.5">
            <span className="font-bold text-xs text-emerald-900 uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Rol ADMIN (Control Total)</span>
            <ul className="text-xs text-gray-700 space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /><span>Cargar, editar y eliminar productos</span></li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /><span>Revisar y aprobar pendientes</span></li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /><span>Crear, editar y dar de baja usuarios</span></li>
            </ul>
          </div>
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 space-y-1.5">
            <span className="font-bold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-blue-600" /> Rol OPERADOR (Operaciones)</span>
            <ul className="text-xs text-gray-700 space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /><span>Cargar productos con cámara o lector USB</span></li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /><span>Consultar, editar y aprobar pendientes</span></li>
              <li className="flex items-center gap-1.5 text-gray-400"><XCircle className="h-3 w-3 text-gray-400 shrink-0" /><span>Restringido: administrar usuarios</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50/60 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Crown className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span><strong>SUPERADMIN:</strong> cuenta permanente que garantiza el acceso al panel — nunca se puede eliminar ni desactivar.</span>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><UserPlus className="h-5 w-5" /></div>
                <h3 className="font-bold text-gray-900 text-base leading-none">{editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</h3>
              </div>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition">✕</button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" /><span>{formError}</span></div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Usuario (Login) <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder="ej. marta.op" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-hidden" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Nombre Completo <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder="ej. Marta González" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-hidden" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Electrónico</label>
                  <input type="email" placeholder="ej. marta@superfood.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-hidden" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Contraseña {editingUser && <span className="text-gray-400 font-normal normal-case">(dejar vacío = sin cambio)</span>}</label>
                  <input type="text" placeholder={editingUser ? '••••••' : 'mín. 4 caracteres'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-hidden" />
                </div>
              </div>
              {editingUser?.role === 'SUPERADMIN' ? (
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50/60">
                  <Lock className="h-4 w-4 text-amber-700 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <strong>Superadministrador:</strong> rol y estado no se pueden cambiar (cuenta permanente). Puedes editar usuario, nombre, correo y contraseña.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">Rol y Nivel de Acceso</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.role === 'OPERADOR' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="userRole" value="OPERADOR" checked={formData.role === 'OPERADOR'} onChange={() => setFormData({ ...formData, role: 'OPERADOR' })} className="text-blue-600" />
                        <div><span className="font-bold text-xs text-gray-900 block">OPERADOR</span><span className="text-[11px] text-gray-500 block">Cargar y editar catálogo</span></div>
                      </label>
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.role === 'ADMIN' ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="userRole" value="ADMIN" checked={formData.role === 'ADMIN'} onChange={() => setFormData({ ...formData, role: 'ADMIN' })} className="text-emerald-600" />
                        <div><span className="font-bold text-xs text-gray-900 block">ADMIN</span><span className="text-[11px] text-gray-500 block">Permisos totales</span></div>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input id="user-active-checkbox" type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="rounded text-emerald-600 focus:ring-emerald-500" />
                    <label htmlFor="user-active-checkbox" className="text-xs text-gray-700 font-medium">Cuenta activa para iniciar sesión</label>
                  </div>
                </>
              )}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition">Cancelar</button>
                <button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition">{editingUser ? 'Guardar Cambios' : 'Crear Usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><Trash2 className="h-5 w-5" /></div>
              <div><h3 className="font-bold text-gray-900 text-base">¿Eliminar usuario?</h3><p className="text-xs text-gray-500">El usuario perderá el acceso al sistema.</p></div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
              <p className="font-bold text-gray-800">{userToDelete.name}</p>
              <p className="text-gray-500">Usuario: @{userToDelete.username} ({userToDelete.role})</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUserToDelete(null)} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => handleDeleteUser(userToDelete)} className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-600/20 transition">Confirmar Eliminación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
