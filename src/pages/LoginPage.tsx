import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  doc,
  setDoc,
  auth,
  db,
} from '../lib/supabase';
import { useToast } from '../components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  Eye, 
  EyeOff, 
  UserPlus, 
  LogIn, 
  Mail, 
  Lock, 
  AlertCircle, 
  CheckCircle2
} from 'lucide-react';
import { OFFICIAL_LOGO_URL } from '../utils/dynamicBrand';

const errorMessages: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password. Please try again.',
  'auth/user-not-found': 'No account found with this email. Please sign up to create one.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few moments.',
  'auth/network-request-failed': 'Check your internet connection.',
  'auth/email-already-in-use': 'This email is already in use. Please sign in instead.',
  'auth/weak-password': 'Password should be at least 6 characters long.',
  'auth/invalid-email': 'Please enter a valid email address.',
};

interface LoginPageProps {
  initialMode?: 'signin' | 'signup';
}

export default function LoginPage({ initialMode = 'signin' }: LoginPageProps) {
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');
  const [mode, setMode] = useState<'signin' | 'signup'>(
    urlMode === 'signup' ? 'signup' : initialMode
  );

  // Form states - clean and minimal
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleModeChange = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setInlineError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      showToast('Please enter both email and password', 'warning');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      showToast('Welcome back to FuelFlow!', 'success');
      navigate('/');
    } catch (error: any) {
      const code = error?.code || '';
      const msg = errorMessages[code] || error?.message || 'Failed to sign in. Please try again.';
      setInlineError(msg);
      showToast(msg, 'error');
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);

    const cleanEmail = email.trim().toLowerCase();

    // 1. Validation checks
    if (!cleanEmail) {
      showToast('Please enter an email address', 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setInlineError('Please provide a valid email format.');
      showToast('Invalid email address format', 'warning');
      return;
    }

    if (!password) {
      showToast('Please enter a password', 'warning');
      return;
    }

    if (password.length < 6) {
      setInlineError('Password must be at least 6 characters long.');
      showToast('Password too short (min 6 characters)', 'warning');
      return;
    }

    if (password !== confirmPassword) {
      setInlineError('Passwords do not match. Please re-enter.');
      showToast('Passwords do not match', 'warning');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      const defaultStationName = 'FuelFlow';

      try {
        await updateProfile(user, {
          displayName: defaultStationName,
        });
      } catch (profileErr) {
        console.warn('Profile display name update non-fatal:', profileErr);
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'appSettings', 'profile'), {
          stationName: defaultStationName,
          ownerName: 'Admin',
          email: cleanEmail,
          initialInvestment: 0,
          createdAt: new Date().toISOString(),
        }, { merge: true });
      } catch (firestoreErr) {
        console.warn('Initial profile Firestore non-fatal:', firestoreErr);
      }

      showToast('Account created successfully! Welcome to FuelFlow.', 'success');
      navigate('/');
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        const errorMsg = 'An account with this email already exists. Please sign in instead.';
        setInlineError(errorMsg);
        showToast(errorMsg, 'error');
      } else {
        const msg = errorMessages[code] || error?.message || 'Failed to create account. Please try again.';
        setInlineError(msg);
        showToast(msg, 'error');
      }
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-white relative overflow-hidden">
      {/* Subtle decorative Deep Midnight Navy ambient accents on white canvas */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#1B2A4A]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#1B2A4A]/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md my-auto relative z-10"
      >
        <motion.div
          animate={errorShake ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl shadow-[0_12px_40px_rgba(15,23,42,0.14)] p-6 sm:p-8 relative overflow-hidden border border-[#1B2A4A]/20"
        >
          {/* Top Deep Midnight Navy accent bar */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#0F172A] via-[#1B2A4A] to-[#263B66]" />

          {/* Header — Always displays FUELFLOW & Official FuelFlow Logo */}
          <div className="flex flex-col items-center mb-6 pt-1">
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center mb-3 shadow-lg shadow-[#1B2A4A]/25 border border-[#1B2A4A]/20">
              <img
                src={OFFICIAL_LOGO_URL}
                alt="FuelFlow Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-black text-[#0F172A] tracking-wider uppercase text-center">
              FUELFLOW
            </h1>
            <p className="text-xs font-semibold text-[#1B2A4A] tracking-widest uppercase mt-0.5">
              Fuel Management System
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-[#F1F5F9] rounded-xl mb-6 border border-[#1B2A4A]/15">
            <button
              type="button"
              onClick={() => handleModeChange('signin')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-[#1B2A4A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#1B2A4A]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('signup')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-[#1B2A4A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#1B2A4A]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Sign Up
            </button>
          </div>

          {/* Inline Alert / Warning (simple and clean) */}
          <AnimatePresence>
            {inlineError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 overflow-hidden"
              >
                <div className="bg-red-50 border border-red-200/90 rounded-xl p-3.5 text-xs text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1">
                    <p className="font-semibold text-red-900 leading-snug">{inlineError}</p>
                    {inlineError.includes('already exists') && (
                      <button
                        type="button"
                        onClick={() => handleModeChange('signin')}
                        className="inline-flex items-center gap-1 font-bold text-primary underline hover:text-primary-light transition-colors text-xs"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Click here to Sign In
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                    placeholder="admin@fuelflow.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-light active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-md mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-slate-500">
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => handleModeChange('signup')}
                    className="text-primary font-bold hover:underline"
                  >
                    Sign Up now
                  </button>
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                    placeholder="admin@fuelflow.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                    placeholder="Re-type your password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Passwords match
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-light active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-md mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Sign Up</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleModeChange('signin')}
                    className="text-primary font-bold hover:underline"
                  >
                    Sign In here
                  </button>
                </p>
              </div>
            </form>
          )}
        </motion.div>

        {/* Footer info */}
        <p className="text-center text-slate-400 text-xs mt-6 font-medium">
          FUELFLOW Fuel Management &bull; Secure Multi-Tenant Architecture
        </p>
      </motion.div>
    </div>
  );
}
