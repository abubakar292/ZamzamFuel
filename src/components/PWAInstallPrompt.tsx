import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, CheckCircle, ExternalLink, Share2, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string; compact?: boolean }> = ({ 
  className = '', 
  compact = false 
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running standalone, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-2 font-semibold transition-all active:scale-95 shadow-sm ${
          compact
            ? 'px-2.5 py-1.5 rounded-lg text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
            : 'px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black shadow-md'
        } ${className}`}
        title="Install / Add Shortcut to Home Screen"
      >
        <Download className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0`} />
        <span>{compact ? 'Install' : 'Install App / Shortcut'}</span>
      </button>

      <PWAInstallModal isOpen={showGuide} onClose={() => setShowGuide(false)} isIOS={isIOS} />
    </>
  );
};

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('zamzam_pwa_dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('zamzam_pwa_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  // If already running standalone or dismissed, do not show banner
  if (isInstalled || dismissed) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="fixed bottom-16 sm:bottom-4 inset-x-3 sm:left-auto sm:right-4 sm:max-w-md z-40"
        >
          <div className="bg-slate-900/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-4 shadow-2xl text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-md shrink-0 overflow-hidden">
                <img src="/pwa-192x192.png" alt="Shortcut Icon" className="w-full h-full object-cover rounded-2xl" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white truncate flex items-center gap-1.5">
                  Install App Shortcut
                  <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded uppercase">Fast</span>
                </p>
                <p className="text-[11px] text-slate-300 line-clamp-1">
                  Add rounded shortcut icon to phone Home Screen
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <PWAInstallModal isOpen={showGuide} onClose={() => setShowGuide(false)} isIOS={isIOS} />
    </>
  );
};

export const PWAInstallModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isIOS?: boolean;
}> = ({ isOpen, onClose, isIOS = false }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950">
              <Smartphone className="w-4 h-4 font-bold" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">Install App to Home Screen</h3>
              <p className="text-[11px] text-slate-300">Creates a direct shortcut icon on your phone</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Rounded Home Screen Icon Preview */}
          <div className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-slate-50 to-amber-50/50 rounded-2xl border border-slate-200/80">
            <img 
              src="/pwa-192x192.png" 
              alt="Zamzam Fuel Shortcut Icon" 
              className="w-14 h-14 rounded-2xl shadow-md border border-amber-500/30 shrink-0 bg-slate-900 object-cover" 
            />
            <div className="min-w-0">
              <h4 className="text-sm font-black text-slate-800 truncate">Zamzam Fuel Shortcut</h4>
              <p className="text-[11px] text-slate-500">Official rounded app icon for your home screen</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full mt-1">
                ✓ Ready for 1-Tap Launch
              </span>
            </div>
          </div>

          {isIOS ? (
            /* iOS Safari Instructions */
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium leading-relaxed">
                On iPhone & iPad, Apple Safari allows adding any web app directly to your home screen in 2 simple steps:
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    Tap the Safari Share button <Share2 className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Located in the bottom toolbar of Safari (box with an upward arrow).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    Tap "Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Scroll down in the share menu and select <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Android / Chrome / Edge Instructions */
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 font-medium leading-relaxed flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>No APK download needed! This installs the official shortcut app right onto your home screen.</span>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Tap the 3 dots menu (⋮) in your mobile browser
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Top right corner in Google Chrome, Brave, Samsung Internet, or Edge.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Select "Install App" or "Add to Home screen"
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Confirm by tapping <strong>Install</strong>. The Zamzam Fuel shortcut icon will appear instantly on your device screen!
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition-colors shadow-sm"
            >
              Got it, close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
