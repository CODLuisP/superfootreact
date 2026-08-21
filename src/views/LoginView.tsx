import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import { Lock, User as UserIcon, AlertCircle, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const entrar = async (user: string, pass: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const found = await api.login(user, pass);
      await onLoginSuccess(found);
    } catch (err) {
      setError((err as Error).message || 'Usuario o contraseña incorrectos.');
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    entrar(username.trim(), password);
  };

  const handleQuickLogin = (role: 'ADMIN' | 'OPERADOR') => {
    if (role === 'ADMIN') entrar('admin', 'admin');
    else entrar('operador', 'operador');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-gray-100 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Header Logo */}
        <div className="text-center mb-8">
          <img
            src="/food.png"
            alt="Superfood Logo"
            className="inline-block h-16 w-16 object-contain mb-3"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            Superfood
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Sistema de registro y gestión de productos en catálogo
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">Iniciar Sesión</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="username-input"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5"
              >
                Usuario
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <UserIcon className="h-4 w-4" />
                </div>
                <input
                  id="username-input"
                  type="text"
                  required
                  placeholder="ej. admin u operador"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password-input"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
                />
              </div>
            </div>

            <button
              id="login-submit-button"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 focus:outline-hidden active:scale-98 transition"
            >
              {isLoading ? (
                <span>Ingresando...</span>
              ) : (
                <>
                  <span>Entrar al Sistema</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Preset Logins */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-3 text-center">
              Acceso rápido para pruebas (1 clic):
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="quick-login-admin-button"
                onClick={() => handleQuickLogin('ADMIN')}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-900 transition text-left"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Admin</span>
                </div>
                <span className="text-[10px] text-emerald-700 mt-0.5">
                  admin / admin
                </span>
              </button>

              <button
                type="button"
                id="quick-login-operador-button"
                onClick={() => handleQuickLogin('OPERADOR')}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 text-blue-900 transition text-left"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                  <span>Operador</span>
                </div>
                <span className="text-[10px] text-blue-700 mt-0.5">
                  operador / operador
                </span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Superfood v1.0 • Registro de Catálogo y Control de Productos
        </p>
      </div>
    </div>
  );
};
