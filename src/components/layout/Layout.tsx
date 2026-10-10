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
    <div className="min-h-screen bg-surface-3 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-[260px] shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Drawer */}
      <Sidebar isMobile isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setIsMobileOpen(true)} />
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 overflow-x-hidden pb-24 lg:pb-8">
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
