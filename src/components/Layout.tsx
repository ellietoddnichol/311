
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Settings as SettingsIcon, Calculator } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/catalog', label: 'Catalog', icon: BookOpen },
    { path: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-blue-600">Brighten/CWA Install</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                location.pathname === item.path
                  ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center space-x-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
              EN
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Ellie Nichol</p>
              <p className="text-xs text-gray-500 truncate">Estimator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
