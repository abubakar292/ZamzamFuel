import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, ShoppingCart, Fuel, 
  Receipt, Users, BarChart2, X, Settings
} from 'lucide-react';
import { useStationProfile } from '../../hooks/useStationProfile';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { OFFICIAL_LOGO_URL } from '../../utils/dynamicBrand';

const navItems = [
  { path: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/purchases',  icon: ShoppingCart,    label: 'Purchases' },
  { path: '/fuel',       icon: Fuel,            label: 'Fuel Management' },
  { path: '/expenses',   icon: Receipt,         label: 'Expenses' },
  { path: '/vendors',    icon: Users,           label: 'Vendors' },
  { path: '/reports',    icon: BarChart2,       label: 'Sales Report' },
  { path: '/settings',   icon: Settings,        label: 'Settings' },
];

interface SidebarProps {
  isMobile?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isMobile, isOpen, onClose }: SidebarProps) {
  const { profile } = useStationProfile();
  
  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#1B2A4A]" style={{ background: 'linear-gradient(180deg, #1B2A4A 0%, #0F172A 100%)' }}>
      {/* Header */}
      <div className="h-20 flex items-center px-6 gap-3 border-b border-white/15 shrink-0">
        <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center border border-white/30 shadow-lg shrink-0">
          <img
            src={OFFICIAL_LOGO_URL}
            alt="FuelFlow Logo"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-white font-bold text-lg tracking-wider leading-tight truncate uppercase">
            {profile.stationName || 'FUELFLOW'}
          </span>
          <span className="text-white/80 text-[10px] font-semibold tracking-widest truncate">FUEL MANAGEMENT</span>
        </div>
        {isMobile && (
          <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-white/15 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1.5">
        <div className="px-3 mb-2">
          <span className="text-[10px] font-bold text-white/65 uppercase tracking-widest">Main Menu</span>
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) => `
              relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group
              ${isActive 
                ? 'bg-white text-[#0F172A] shadow-md' 
                : 'text-white/90 hover:bg-white/15 hover:text-white'}
            `}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-[#1B2A4A] rounded-r-full"
                  />
                )}
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#1B2A4A]' : 'text-white/85 group-hover:text-white'}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      
      {/* Footer Info & Install App Shortcut */}
      <div className="p-4 border-t border-white/15 shrink-0 flex flex-col gap-2">
        <PWAInstallButton className="w-full justify-center !text-xs !py-2.5" />
        <p className="text-[10px] text-white/75 text-center font-medium mt-1">© {new Date().getFullYear()} {profile.stationName || 'FuelFlow'}</p>
      </div>
    </div>
  );

  if (!isMobile) {
    return (
      <div className="fixed inset-y-0 left-0 w-[260px] shadow-sidebar z-30">
        {sidebarContent}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-[280px] z-50 lg:hidden shadow-2xl"
          >
            {sidebarContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
