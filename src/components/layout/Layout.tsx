import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { MobileBottomNav } from './MobileBottomNav';
import { PWAInstallBanner } from '../PWAInstallPrompt';
import { OfflineIndicator } from '../OfflineIndicator';

export default function Layout() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-[260px] shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Drawer */}
      <Sidebar isMobile isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <Navbar onMenuClick={() => setIsMobileOpen(true)} />
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 overflow-x-hidden pb-28 lg:pb-8 bg-white">
          <Outlet />
        </main>
      </div>

      {/* Mobile Ergonomic Bottom Navigation Bar */}
      <MobileBottomNav onMenuClick={() => setIsMobileOpen(true)} />

      {/* PWA Install & Shortcut Banner */}
      <PWAInstallBanner />

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}
