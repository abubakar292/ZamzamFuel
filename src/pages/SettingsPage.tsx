import React, { useState, useEffect, useMemo } from 'react';
import { Building2, User, Phone, MapPin, Save, Wallet, Smartphone, Sparkles, CheckCircle2, Eye } from 'lucide-react';
import { useStationProfile } from '../hooks/useStationProfile';
import { useToast } from '../components/Toast';
import { PWAInstallButton } from '../components/PWAInstallPrompt';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { generateStationIcon, updateAppBrand } from '../utils/dynamicBrand';

export default function SettingsPage() {
  const { profile, updateProfile, loading } = useStationProfile();
  const { showToast } = useToast();
  const { isInstalled } = usePWAInstall();
  const [formData, setFormData] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  // Generate live dynamic preview icon as user edits station name
  const liveIcon = useMemo(() => {
    return generateStationIcon(formData.stationName || 'ZAMZAM', 192);
  }, [formData.stationName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const name = formData.stationName?.trim() || 'ZAMZAM';
      // Immediate update
      updateAppBrand(name);
      
      await updateProfile({
        ...formData,
        stationName: name,
        initialInvestment: Number(formData.initialInvestment) || 0
      });
      showToast('Station profile and branding updated successfully!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'initialInvestment' ? (value === '' ? '' : Number(value)) : value
    }));
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  const currentStationDisplay = (formData.stationName || 'ZAMZAM').trim().toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 transition-colors">Settings & Station Branding</h1>
        <p className="text-slate-500 text-sm mt-1 transition-colors">
          Manage your fuel station profile, live branding, loading splash screen, and home screen icon.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Station Profile Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden transition-colors">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 transition-colors">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 transition-colors">
              <Building2 className="w-5 h-5 text-primary transition-colors" />
              Station Profile & Identity
            </h2>
            <p className="text-sm text-slate-500 mt-1 transition-colors">
              Changing the station name automatically updates your Loading Screen, Home Screen Shortcut Icon, Browser Tab, and Receipt Reports.
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Station Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">
                  Station Name <span className="text-xs text-amber-600 font-bold">(Updates loading, homescreen icon & all displays)</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="stationName"
                    value={formData.stationName}
                    onChange={handleChange}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm font-bold text-base"
                    placeholder="e.g. ZAMZAM FUEL or AL-NOOR PETROLEUM"
                    required
                  />
                </div>
              </div>

              {/* Real-time Visual Preview of Home Screen Icon and Loading Screen */}
              <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-[#0F2548] rounded-2xl p-5 text-white border border-amber-500/20 shadow-md">
                <div className="flex items-center gap-2 mb-3.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Live Station Brand & Icon Preview
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Home Screen Icon Card */}
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-amber-400/30 shrink-0 bg-slate-950">
                      <img 
                        src={liveIcon} 
                        alt="Home Screen App Icon" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Home Screen Shortcut Icon
                      </span>
                      <p className="text-sm font-black text-white truncate mt-0.5">
                        {currentStationDisplay}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                        Generated automatically with your station name
                      </p>
                    </div>
                  </div>

                  {/* Loading Screen Preview */}
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1A3C6E] to-[#0B1A32] flex flex-col items-center justify-center border border-amber-400/30 shrink-0 text-center p-1">
                      <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider truncate w-full text-center">
                        {currentStationDisplay}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping mt-1" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Loading Splash Screen
                      </span>
                      <p className="text-sm font-black text-white truncate mt-0.5">
                        {currentStationDisplay}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                        Displays while opening and syncing the app
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Owner Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">Owner Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="ownerName"
                    value={formData.ownerName}
                    onChange={handleChange}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm"
                    placeholder="e.g. John Doe"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">Phone Number</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm"
                    placeholder="e.g. +1 234 567 890"
                  />
                </div>
              </div>

              {/* Starting Investment / Capital */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">
                  Starting Investment / Capital (Rs.)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Wallet className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="number"
                    name="initialInvestment"
                    min="0"
                    step="any"
                    value={formData.initialInvestment !== undefined ? formData.initialInvestment : ''}
                    onChange={handleChange}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm"
                    placeholder="e.g. 2000000"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Starting cash introduced to open the station. Used to calculate Cash in Hand.</p>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">Station Address</label>
                <div className="relative group">
                  <div className="absolute top-3.5 left-3.5 pointer-events-none">
                    <MapPin className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={1}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm"
                    placeholder="Full address of the station..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-100 mt-6 transition-colors">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-light active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {isSaving ? 'Saving Changes...' : 'Save Profile & Update Brand'}
              </button>
            </div>
          </form>
        </section>

        {/* PWA & Mobile Shortcut Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-amber-500" />
              App Installation & Mobile Shortcut
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Install {formData.stationName || 'the station app'} directly onto your phone or computer home screen. No APK download or app store needed!
            </p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img 
                src={liveIcon} 
                alt={`${formData.stationName || 'Station'} Shortcut Icon`} 
                className="w-14 h-14 rounded-2xl shadow-md border border-amber-500/30 shrink-0 object-cover bg-slate-900" 
              />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  {isInstalled ? 'App is installed on this device' : `Create Home Screen Shortcut for ${formData.stationName || 'Station'}`}
                </p>
                <p className="text-xs text-slate-500 max-w-md">
                  {isInstalled 
                    ? `You are running ${formData.stationName || 'the app'} as an installed standalone app with full offline support.` 
                    : `Add a 1-tap shortcut icon to your phone home screen with your custom "${formData.stationName || 'Station'}" brand that runs full-screen just like a native app.`}
                </p>
              </div>
            </div>
            {!isInstalled && (
              <PWAInstallButton className="shrink-0" />
            )}
            {isInstalled && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Installed & Active
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
