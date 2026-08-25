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

function getTabFromPath(pathname: string): ActiveTab {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (clean === 'gestionar') return 'gestionar';
  if (clean === 'pendientes') return 'pendientes';
  if (clean === 'usuarios') return 'usuarios';
  return 'cargar';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => getTabFromPath(window.location.pathname));

  // Solo contadores livianos para los badges (nunca el catálogo completo:
  // con miles de productos eso saturaría memoria/red). Cada vista pagina
  // sus propios datos por su cuenta.
  const [counts, setCounts] = useState({ total: 0, pending: 0 });

  const navigateToTab = useCallback((tab: ActiveTab, replace = false) => {
    setActiveTabState(tab);
    const targetPath = `/${tab}`;
    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState(null, '', targetPath);
      } else {
        window.history.pushState(null, '', targetPath);
      }
    }
  }, []);

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
      if (u) {
        await refreshCounts();
        const initialTab = getTabFromPath(window.location.pathname);
        navigateToTab(initialTab, true);
      }
      setBooting(false);
    })();
  }, [refreshCounts, navigateToTab]);

  // Escuchar botones Atrás / Adelante del navegador
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setActiveTabState(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setCurrentUser(null);
    setCounts({ total: 0, pending: 0 });
    window.history.replaceState(null, '', '/');
  };

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    const initialTab = getTabFromPath(window.location.pathname);
    navigateToTab(initialTab, true);
    await refreshCounts();
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500">
        <div className="flex items-center gap-3 text-sm">
          <img
            src="/food.png"
            alt="Superfood Logo"
            className="h-10 w-10 object-contain animate-pulse"
          />
          <span className="font-medium text-gray-700">Cargando…</span>
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
        setActiveTab={(tab) => navigateToTab(tab)}
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
            onNavigateToCatalog={() => navigateToTab('gestionar')}
          />
        )}

        {activeTab === 'gestionar' && (
          <GestionarView
            currentUser={currentUser}
            onCountsChange={refreshCounts}
            onNavigateToCargar={() => navigateToTab('cargar')}
          />
        )}

        {activeTab === 'pendientes' && (
          <PendientesView
            currentUser={currentUser}
            onCountsChange={refreshCounts}
            onNavigateToCargar={() => navigateToTab('cargar')}
          />
        )}

        {activeTab === 'usuarios' && <UsuariosView currentUser={currentUser} />}
      </main>
    </div>
  );
}
