import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';

export default function AppLoader({ loading }: { loading: boolean }) {
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #1A3C6E 0%, #0F2548 100%)' }}
        >
          {/* Animated background orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 4 + i, repeat: Infinity, delay: i * 1.2 }}
                className="absolute rounded-full blur-3xl"
                style={{
                  width: 300 + i * 80,
                  height: 300 + i * 80,
                  background: i === 2 ? '#E8A020' : '#2557A7',
                  top: ['20%', '60%', '40%'][i],
                  left: ['10%', '60%', '30%'][i],
                  opacity: 0.15,
                }}
              />
            ))}
          </div>

          {/* Logo badge */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.8 }}
            className="relative mb-8"
          >
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl relative z-10"
              style={{ background: 'linear-gradient(135deg, #E8A020, #D97706)' }}
            >
              <Flame className="w-12 h-12 text-white" strokeWidth={1.5} />
            </div>
            {/* Rotating ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-2 rounded-[2rem] border-2 border-dashed border-amber-400/40"
            />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-center mb-10 z-10"
          >
            <h1 className="text-3xl font-extrabold text-white tracking-widest mb-1">ZAMZAM</h1>
            <p className="text-sm font-medium tracking-[0.4em] text-amber-400">FUEL MANAGEMENT</p>
          </motion.div>

          {/* Pulsing dots */}
          <div className="flex gap-2 z-10">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                className="w-2.5 h-2.5 rounded-full bg-amber-400"
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
