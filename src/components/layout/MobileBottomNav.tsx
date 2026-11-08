import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Fuel, ShoppingCart, Receipt, BarChart2, Menu } from 'lucide-react';

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/fuel', icon: Fuel, label: 'Fuel' },
    { path: '/purchases', icon: ShoppingCart, label: 'Purchases' },
    { path: '/expenses', icon: Receipt, label: 'Expenses' },
    { path: '/reports', icon: BarChart2, label: 'Reports' },
    { path: '#more', icon: Menu, label: 'More', isDrawerTrigger: true },
  ];

  // Determine which tab is currently active
  const getActiveIndex = () => {
    const pathname = location.pathname;
    if (pathname === '/') return 0;
    if (pathname.startsWith('/fuel')) return 1;
    if (pathname.startsWith('/purchases')) return 2;
    if (pathname.startsWith('/expenses')) return 3;
    if (pathname.startsWith('/reports')) return 4;
    // Vendors, Settings, or other routes highlight the "More" tab
    return 5;
  };

  const activeIndex = getActiveIndex();

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 pointer-events-none px-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-7"
    >
      <div className="relative mx-auto max-w-md pointer-events-auto">
        {/* Main White Floating Pill Bar */}
        <div className="relative bg-white rounded-[24px] h-[66px] shadow-[0_8px_30px_rgba(15,23,42,0.16),0_2px_10px_rgba(0,0,0,0.06)] border border-[#1B2A4A]/15 grid grid-cols-6 items-center px-1.5">
          {navItems.map((item, idx) => {
            const isActive = idx === activeIndex;
            const Icon = item.icon;

            const handlePress = () => {
              if (item.isDrawerTrigger) {
                onMenuClick();
              } else {
                navigate(item.path);
              }
            };

            return (
              <button
                key={item.label}
                type="button"
                onClick={handlePress}
                className="relative flex flex-col items-center justify-end h-full pb-2.5 pt-1 select-none focus:outline-none group"
              >
                {/* Animated Curved Notch + Floating Circular Orb for Active Item */}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavActiveContainer"
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 28,
                      mass: 0.8,
                    }}
                    className="absolute -top-6 inset-x-0 flex flex-col items-center pointer-events-none"
                  >
                    {/* Smooth Concave Cradle / Cutout Ring */}
                    <div className="relative flex items-center justify-center">
                      {/* Soft outer concave curve SVG on top edge of bar */}
                      <svg
                        width="76"
                        height="26"
                        viewBox="0 0 76 26"
                        fill="none"
                        className="absolute top-[22px] text-[#F1F5F9] drop-shadow-[0_2px_3px_rgba(15,23,42,0.12)]"
                      >
                        <path
                          d="M0 0 C16 0 20 25 38 25 C56 25 60 0 76 0 Z"
                          fill="currentColor"
                        />
                      </svg>

                      {/* Floating White Circle Orb */}
                      <div className="relative z-10 w-[52px] h-[52px] rounded-full bg-white shadow-[0_6px_18px_rgba(27,42,74,0.28)] border-[3px] border-[#F1F5F9] flex items-center justify-center">
                        {/* Inner Deep Midnight Navy Gradient Icon Pill */}
                        <motion.div
                          key={item.label}
                          initial={{ scale: 0.6, y: 6 }}
                          animate={{ scale: 1, y: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 450,
                            damping: 20,
                          }}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md shadow-[#1B2A4A]/35"
                          style={{
                            background: 'linear-gradient(135deg, #263B66 0%, #1B2A4A 65%, #0F172A 100%)',
                          }}
                        >
                          <Icon className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Inactive Icon */}
                <div
                  className={`flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'opacity-0 -translate-y-4 pointer-events-none h-5'
                      : 'opacity-100 translate-y-0 h-5 mb-1 group-active:scale-90'
                  }`}
                >
                  <Icon
                    className="w-[20px] h-[20px] text-slate-600 group-hover:text-[#1B2A4A] transition-colors"
                    strokeWidth={1.9}
                  />
                </div>

                {/* Label */}
                <motion.span
                  animate={{
                    scale: isActive ? 1.04 : 1,
                    y: isActive ? 1 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                  className={`text-[10px] leading-none tracking-tight truncate max-w-full px-0.5 transition-colors ${
                    isActive
                      ? 'font-extrabold text-[#0F172A]'
                      : 'font-medium text-slate-500 group-hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </motion.span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
