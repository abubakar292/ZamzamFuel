import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStoredStationName, OFFICIAL_LOGO_URL } from '../utils/dynamicBrand';

export default function AppLoader({ loading, stationName }: { loading: boolean; stationName?: string }) {
  const [currentName, setCurrentName] = useState(() => {
    return (stationName || getStoredStationName() || 'FUELFLOW').trim();
  });

  useEffect(() => {
    if (stationName) {
      setCurrentName(stationName.trim());
    }

    const handleBrandChange = (e: any) => {
      if (e.detail?.stationName) {
        setCurrentName(e.detail.stationName.trim());
      }
    };

    window.addEventListener('station_brand_changed', handleBrandChange);
    return () => window.removeEventListener('station_brand_changed', handleBrandChange);
  }, [stationName]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-white"
        >
          {/* Animated background orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.4, 1], opacity: [0.08, 0.18, 0.08] }}
                transition={{ duration: 4 + i, repeat: Infinity, delay: i * 1.2 }}
                className="absolute rounded-full blur-3xl"
                style={{
                  width: 300 + i * 80,
                  height: 300 + i * 80,
                  background: '#1B2A4A',
                  top: ['20%', '60%', '40%'][i],
                  left: ['10%', '60%', '30%'][i],
                  opacity: 0.12,
                }}
              />
            ))}
          </div>

          {/* Official FuelFlow Logo Badge */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.8 }}
            className="relative mb-8"
          >
            <div className="w-24 h-24 rounded-3xl overflow-hidden flex items-center justify-center shadow-2xl shadow-[#1B2A4A]/35 relative z-10 border border-[#1B2A4A]/20">
              <img
                src={OFFICIAL_LOGO_URL}
                alt="FuelFlow Logo"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Rotating ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-2 rounded-[2rem] border-2 border-dashed border-[#1B2A4A]/45"
            />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-center mb-10 z-10 max-w-sm px-4"
          >
            <h1 className={`font-black text-[#0F172A] tracking-widest mb-1 uppercase truncate ${
              currentName.length > 20 ? 'text-xl' : currentName.length > 12 ? 'text-2xl' : 'text-3xl sm:text-4xl'
            }`}>
              {currentName}
            </h1>
            <p className="text-xs sm:text-sm font-bold tracking-[0.35em] text-[#1B2A4A]">
              FUEL MANAGEMENT
            </p>
          </motion.div>

          {/* Pulsing dots */}
          <div className="flex gap-2 z-10">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                className="w-2.5 h-2.5 rounded-full bg-[#1B2A4A]"
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
