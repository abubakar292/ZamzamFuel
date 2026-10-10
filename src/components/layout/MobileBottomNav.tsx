import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Fuel, ShoppingCart, Receipt, BarChart2, Menu } from 'lucide-react';

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onMenuClick }) => {
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/fuel', icon: Fuel, label: 'Fuel' },
    { path: '/purchases', icon: ShoppingCart, label: 'Purchases' },
    { path: '/expenses', icon: Receipt, label: 'Expenses' },
    { path: '/reports', icon: BarChart2, label: 'Reports' },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6 h-15 items-center px-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `
              flex flex-col items-center justify-center py-1 px-0.5 transition-colors relative
              ${isActive ? 'text-primary font-bold' : 'text-slate-500 hover:text-slate-800'}
            `}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 w-8 h-1 bg-amber-500 rounded-b-full shadow-sm" />
                )}
                <item.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-primary' : 'text-slate-400'}`} />
                <span className={`text-[10px] mt-0.5 truncate tracking-tight ${isActive ? 'font-black text-primary' : 'font-medium'}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* More / Menu Drawer trigger */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center py-1 px-0.5 text-slate-500 hover:text-slate-800 transition-colors"
          title="More menu"
        >
          <Menu className="w-5 h-5 text-slate-400" />
          <span className="text-[10px] mt-0.5 font-medium text-slate-500">More</span>
        </button>
      </div>
    </nav>
  );
};
