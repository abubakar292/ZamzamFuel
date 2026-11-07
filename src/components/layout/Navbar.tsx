import { useState, useEffect, useRef } from 'react';
import { Menu, LogOut, Bell, User as UserIcon, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { auth, db, getUserDoc, signOut, doc, onSnapshot } from '../../lib/supabase';
import { FuelPrices } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useStationProfile } from '../../hooks/useStationProfile';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { formatLiters } from '../../utils/calculations';

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const { user } = useAuth();
  const { profile } = useStationProfile();
  const [showNotifications, setShowNotifications] = useState(false);
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(getUserDoc('appSettings', 'fuelPrices'), (doc) => {
      if (doc.exists()) {
        setFuelPrices(doc.data() as FuelPrices);
      } else {
        setFuelPrices({
          petrolStock: 0,
          petrolAvgPurchasePrice: 0,
          dieselStock: 0,
          dieselAvgPurchasePrice: 0,
          petrolStockValue: 0,
          dieselStockValue: 0,
          petrolCurrentReading: 0,
          dieselCurrentReading: 0
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    signOut(auth);
  };

  const notifications = [];
  if (fuelPrices) {
    if (Number(fuelPrices.petrolStock) < 1000) {
      notifications.push({ id: 'p_low', text: `Low Petrol Stock: ${formatLiters(fuelPrices.petrolStock)} remaining` });
    }
    if (Number(fuelPrices.dieselStock) < 1000) {
      notifications.push({ id: 'd_low', text: `Low Diesel Stock: ${formatLiters(fuelPrices.dieselStock)} remaining` });
    }
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-4 lg:px-8 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-800 hidden sm:block truncate">
          Welcome back, {profile.ownerName || 'Admin'}
        </h1>
        <div className="sm:hidden flex flex-col min-w-0">
          <span className="text-xs font-black text-primary leading-tight uppercase truncate">
            {profile.stationName || 'Zamzam Fuel'}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold truncate leading-none">
            {profile.ownerName || 'Admin'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
        {/* PWA Install / Shortcut button */}
        <PWAInstallButton compact className="text-[11px] py-1 px-2.5 sm:text-xs sm:py-1.5 sm:px-3" />

        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-danger rounded-full border-2 border-white"></span>
            )}
          </button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="fixed top-[4.25rem] left-3 right-3 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[100]"
              >
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-800">Notifications</h3>
                  {notifications.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                      {notifications.length} Alert{notifications.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-3">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <p className="text-sm font-medium text-slate-700 leading-snug pt-0.5">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-700">{profile.ownerName || user?.displayName || 'Admin'}</span>
            <span className="text-[11px] text-slate-500">{user?.email}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <UserIcon className="w-5 h-5" />
          </div>
          <button 
            onClick={handleSignOut}
            className="p-2 ml-1 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
