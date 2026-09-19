import React, { useState, useEffect } from 'react';
import { Building2, User, Phone, MapPin, Save, Wallet } from 'lucide-react';
import { useStationProfile } from '../hooks/useStationProfile';
import { useToast } from '../components/Toast';

export default function SettingsPage() {
  const { profile, updateProfile, loading } = useStationProfile();
  const { showToast } = useToast();
  const [formData, setFormData] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile({
        ...formData,
        initialInvestment: Number(formData.initialInvestment) || 0
      });
      showToast('Settings saved successfully', 'success');
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 transition-colors">Settings & Preferences</h1>
        <p className="text-slate-500 text-sm mt-1 transition-colors">Manage your station profile and customize your application experience.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Station Profile Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden transition-colors">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 transition-colors">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 transition-colors">
              <Building2 className="w-5 h-5 text-primary transition-colors" />
              Station Profile
            </h2>
            <p className="text-sm text-slate-500 mt-1 transition-colors">This information will be displayed in the app and on receipts.</p>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Station Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">Station Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="stationName"
                    value={formData.stationName}
                    onChange={handleChange}
                    className="pl-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-3 shadow-sm"
                    placeholder="e.g. ZAMZAM FUEL"
                    required
                  />
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
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2 transition-colors">Station Address</label>
                <div className="relative group">
                  <div className="absolute top-3.5 left-3.5 pointer-events-none">
                    <MapPin className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={3}
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
                {isSaving ? 'Saving Changes...' : 'Save Profile Details'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
