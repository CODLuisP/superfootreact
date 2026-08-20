/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, ActiveTab } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { LoginView } from './views/LoginView';
import { CargarView } from './views/CargarView';
import { GestionarView } from './views/GestionarView';
import { PendientesView } from './views/PendientesView';
import { UsuariosView } from './views/UsuariosView';
import { Leaf } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('cargar');

  // Solo contadores livianos para los badges (nunca el catálogo completo:
  // con miles de productos eso saturaría memoria/red). Cada vista pagina
  // sus propios datos por su cuenta.
  const [counts, setCounts] = useState({ total: 0, pending: 0 });

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await api.getCounts());
    } catch {
      setCounts({ total: 0, pending: 0 });
    }
  }, []);

  // Restaura la sesión al cargar.
  useEffect(() => {
    (async () => {
      const u = await api.me();
      setCurrentUser(u);
      if (u) await refreshCounts();
      setBooting(false);
    })();
  }, [refreshCounts]);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setCurrentUser(null);
    setCounts({ total: 0, pending: 0 });
  };

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    setActiveTab('cargar');
    await refreshCounts();
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-9 w-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white animate-pulse">
            <Leaf className="h-5 w-5" />
          </div>
          <span>Cargando…</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-800 selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        pendingCount={counts.pending}
        totalProductsCount={counts.total}
      />

      <main className="flex-1">
        {activeTab === 'cargar' && (
          <CargarView
            currentUser={currentUser}
            onProductSaved={() => refreshCounts()}
            onNavigateToCatalog={() => setActiveTab('gestionar')}
          />
        )}

        {activeTab === 'gestionar' && (
          <GestionarView
            currentUser={currentUser}
            onCountsChange={refreshCounts}
            onNavigateToCargar={() => setActiveTab('cargar')}
          />
        )}

        {activeTab === 'pendientes' && (
          <PendientesView
            currentUser={currentUser}
            onCountsChange={refreshCounts}
            onNavigateToCargar={() => setActiveTab('cargar')}
          />
        )}

        {activeTab === 'usuarios' && <UsuariosView currentUser={currentUser} />}
      </main>
    </div>
  );
}
