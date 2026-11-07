import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  User,
  Phone,
  MapPin,
  Save,
  Wallet,
  Smartphone,
  CheckCircle2,
  Database,
  Download,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { useStationProfile } from '../hooks/useStationProfile';
import { useToast } from '../components/Toast';
import { PWAInstallButton } from '../components/PWAInstallPrompt';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { generateStationIcon, updateAppBrand } from '../utils/dynamicBrand';
import {
  exportFullDatabaseToJson,
  restoreFullDatabaseFromJson,
} from '../utils/backupRestore';

export default function SettingsPage() {
  const { profile, updateProfile, loading } = useStationProfile();
  const { showToast } = useToast();
  const { isInstalled } = usePWAInstall();
  const [formData, setFormData] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);

  // Backup & Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{
    name: string;
    content: string;
    summary: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const liveIcon = useMemo(() => {
    return generateStationIcon(formData.stationName || 'ZAMZAM', 192);
  }, [formData.stationName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const name = formData.stationName?.trim() || 'ZAMZAM';
      updateAppBrand(name);

      await updateProfile({
        ...formData,
        stationName: name,
        initialInvestment: Number(formData.initialInvestment) || 0,
      });
      showToast('Settings saved successfully', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const { filename } = await exportFullDatabaseToJson();
      showToast(`Backup downloaded: ${filename}`, 'success');
    } catch (error: any) {
      console.error('Backup export failed:', error);
      showToast(
        error?.message || 'Failed to export backup. Please try again.',
        'error'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        showToast(
          'Invalid backup file. Please choose a valid .json backup file.',
          'error'
        );
        return;
      }

      const d = parsed.data;
      const vCount = Array.isArray(d.vendors) ? d.vendors.length : 0;
      const pCount = Array.isArray(d.purchases) ? d.purchases.length : 0;
      const payCount = Array.isArray(d.vendorPayments) ? d.vendorPayments.length : 0;
      const rCount = Array.isArray(d.fuelReadings) ? d.fuelReadings.length : 0;
      const eCount = Array.isArray(d.expenses) ? d.expenses.length : 0;

      setPendingRestoreFile({
        name: file.name,
        content: text,
        summary: `${vCount} Vendors, ${pCount} Purchases, ${payCount} Payments, ${rCount} Readings, ${eCount} Expenses`,
      });
    } catch (err) {
      console.error('Error reading JSON backup file:', err);
      showToast(
        'Could not read JSON file. Please select a valid .json backup.',
        'error'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return;
    setIsRestoring(true);
    try {
      await restoreFullDatabaseFromJson(pendingRestoreFile.content);
      setPendingRestoreFile(null);
      showToast('Backup restored successfully!', 'success');
    } catch (error: any) {
      console.error('Restore failed:', error);
      showToast(
        error?.message || 'Failed to restore backup file.',
        'error'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'initialInvestment'
          ? value === ''
            ? ''
            : Number(value)
          : value,
    }));
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Settings</h1>

      <div className="grid grid-cols-1 gap-5">
        {/* Station Profile Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Station Profile
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Station Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Station Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Building2 className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="stationName"
                    value={formData.stationName}
                    onChange={handleChange}
                    className="pl-10 pr-3 w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-2.5 text-sm font-semibold"
                    placeholder="Station Name"
                    required
                  />
                </div>
              </div>

              {/* Owner Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Owner Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="ownerName"
                    value={formData.ownerName}
                    onChange={handleChange}
                    className="pl-10 pr-3 w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-2.5 text-sm"
                    placeholder="Owner Name"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Phone Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="pl-10 pr-3 w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-2.5 text-sm"
                    placeholder="Phone Number"
                  />
                </div>
              </div>

              {/* Starting Investment / Capital */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Starting Investment (Rs.)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Wallet className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="number"
                    name="initialInvestment"
                    min="0"
                    step="any"
                    value={
                      formData.initialInvestment !== undefined
                        ? formData.initialInvestment
                        : ''
                    }
                    onChange={handleChange}
                    className="pl-10 pr-3 w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-2.5 text-sm tabular-nums"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Station Address
                </label>
                <div className="relative group">
                  <div className="absolute top-3 left-3.5 pointer-events-none">
                    <MapPin className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={2}
                    className="pl-10 pr-3 w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all py-2.5 text-sm"
                    placeholder="Station Address"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-light active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Data Backup & Restore Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-amber-500" />
              Data Backup &amp; Restore
            </h2>
          </div>

          <div className="p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="flex-1 min-h-[46px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isExporting ? 'Backing up...' : 'Backup Data (.JSON)'}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
              className="flex-1 min-h-[46px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>Restore Data (.JSON)</span>
            </button>
          </div>
        </section>

        {/* App Shortcut Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-slate-100 overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src={liveIcon}
                alt="App Icon"
                className="w-12 h-12 rounded-2xl shadow-sm border border-amber-500/30 shrink-0 object-cover bg-slate-900"
              />
              <div>
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-500" />
                  Home Screen App
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isInstalled
                    ? 'Installed on this device'
                    : `Install ${formData.stationName || 'Station'} shortcut`}
                </p>
              </div>
            </div>
            {!isInstalled ? (
              <PWAInstallButton className="w-full sm:w-auto justify-center shrink-0" />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Installed
              </span>
            )}
          </div>
        </section>
      </div>

      {/* Confirmation Dialog for Restoring JSON Backup */}
      {pendingRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Restore Backup?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {pendingRestoreFile.name}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              {pendingRestoreFile.summary}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingRestoreFile(null)}
                disabled={isRestoring}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm disabled:opacity-50"
              >
                {isRestoring ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
