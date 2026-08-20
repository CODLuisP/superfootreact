import React, { useState } from 'react';
import { ActiveTab, User } from '../types';
import {
  Upload,
  Layers,
  AlertTriangle,
  Users,
  LogOut,
  Menu,
  X,
  Leaf,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User;
  onLogout: () => void;
  pendingCount: number;
  totalProductsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  pendingCount,
  totalProductsCount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: number; adminOnly?: boolean }[] = [
    { id: 'cargar', label: 'Cargar', icon: Upload },
    { id: 'gestionar', label: 'Gestionar', icon: Layers, badge: totalProductsCount },
    { id: 'pendientes', label: 'Pendientes', icon: AlertTriangle, badge: pendingCount },
    { id: 'usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
  ];

  const handleTabClick = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo */}
          <div className="flex items-center gap-8">
            <button
              id="superfood-logo-button"
              onClick={() => setActiveTab('cargar')}
              className="flex items-center gap-2.5 group focus:outline-hidden"
            >
              <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform duration-200">
                <Leaf className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div className="text-left">
                <span className="text-xl font-extrabold tracking-tight text-gray-900 leading-none block">
                  Superfood
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-600 block">
                  Catálogo & Registro
                </span>
              </div>
            </button>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1.5" aria-label="Navegación principal">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isRestricted = item.adminOnly && currentUser.role !== 'ADMIN';

                return (
                  <button
                    key={item.id}
                    id={`nav-tab-${item.id}`}
                    onClick={() => handleTabClick(item.id)}
                    className={`relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 font-semibold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span>{item.label}</span>

                    {/* Notification/Count Badge */}
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        className={`ml-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold rounded-full ${
                          item.id === 'pendientes'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Role locked indicator */}
                    {isRestricted && (
                      <span className="text-[10px] text-gray-400 ml-0.5 font-normal">
                        (Admin)
                      </span>
                    )}

                    {/* Active pill indicator */}
                    {isActive && (
                      <span className="absolute -bottom-[17px] left-3 right-3 h-0.5 bg-emerald-600 rounded-full" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: User Status & Logout */}
          <div className="hidden sm:flex items-center gap-3">
            {/* User Pill */}
            <div
              id="user-profile-badge"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200/80 text-xs text-gray-700"
            >
              <div className="flex items-center gap-1.5 font-medium">
                {currentUser.role === 'ADMIN' ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <UserCheck className="h-4 w-4 text-blue-600" />
                )}
                <span className="text-gray-900 font-semibold">{currentUser.username}</span>
              </div>

              {/* Role badge */}
              <span
                className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md uppercase ${
                  currentUser.role === 'ADMIN'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {currentUser.role}
              </span>
            </div>

            {/* Logout Button */}
            <button
              id="logout-header-button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors shadow-2xs"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Salir</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              id="mobile-menu-toggle-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 pt-2 pb-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {currentUser.username}
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                  currentUser.role === 'ADMIN'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {currentUser.role}
              </span>
            </div>
            <button
              id="mobile-logout-button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Salir
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`ml-auto px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
