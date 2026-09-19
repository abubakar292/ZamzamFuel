import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import AppLoader from '../components/AppLoader';
import { Flame, AlertTriangle } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900" style={{ background: 'linear-gradient(135deg, #1A3C6E 0%, #0F2548 100%)' }}>
         <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl p-8 text-center relative overflow-hidden">
           <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-6 shadow-inner">
             <AlertTriangle className="w-10 h-10 text-amber-500" />
           </div>
           <h1 className="text-2xl font-bold text-slate-800 mb-3 tracking-tight">Firebase Configuration Required</h1>
           <p className="text-slate-600 mb-8 text-sm leading-relaxed">
             Zamzam Fuel Management requires a connection to your Firebase project. Please add the following secrets in the AI Studio Settings menu and restart the app.
           </p>
           
           <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left text-xs font-mono text-slate-600 space-y-2 shadow-sm">
             <p className="font-bold text-slate-800 mb-3 text-sm">Required Environment Variables:</p>
             <div className="grid gap-2">
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_API_KEY</div>
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_AUTH_DOMAIN</div>
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_PROJECT_ID</div>
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_STORAGE_BUCKET</div>
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_MESSAGING_SENDER_ID</div>
               <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-danger"></div>VITE_FIREBASE_APP_ID</div>
             </div>
           </div>
         </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <AppLoader loading={loading} />
      {!loading && children}
    </AuthContext.Provider>
  );
};
