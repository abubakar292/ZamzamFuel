import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  User,
  Phone,
  MapPin,
  Save,
  Wallet,
  Smartphone,
  Sparkles,
  CheckCircle2,
  Database,
  Download,
  Upload,
  FileJson,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useStationProfile } from '../hooks/useStationProfile';
import { useToast } from '../components/Toast';
import { PWAInstallButton } from '../components/PWAInstallPrompt';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { generateStationIcon, updateAppBrand } from '../utils/dynamicBrand';
import {
  exportFullDatabaseToJson,
  getDatabaseSummaryCounts,
  restoreFullDatabaseFromJson,
  BackupMetadata,
} from '../utils/backupRestore';

export default function SettingsPage() {
  const { profile, updateProfile, loading } = useStationProfile();
  const { showToast } = useToast();
  const { isInstalled } = usePWAInstall();
  const [formData, setFormData] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);

  // Backup & Restore state
  const [counts, setCounts] = useState<BackupMetadata['counts'] | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastBackupFile, setLastBackupFile] = useState<string | null>(null);
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

  const refreshCounts = async () => {
    setLoadingCounts(true);
    try {
      const c = await getDatabaseSummaryCounts();
      setCounts(c);
    } catch (err) {
      console.error('Failed to fetch record counts:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    refreshCounts();
  }, []);

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

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const { filename, payload } = await exportFullDatabaseToJson();
      setLastBackupFile(filename);
      setCounts(payload.metadata.counts);
      showToast(
        `Backup downloaded: ${filename}. All records saved to your device.`,
        'success'
      );
    } catch (error: any) {
      console.error('Backup export failed:', error);
      showToast(
        error?.message || 'Failed to export database backup. Please try again.',
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
          'Invalid backup file: missing "data" object. Please choose a valid .json backup file.',
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
        summary: `${vCount} Vendors, ${pCount} Purchases, ${payCount} Vendor Payments, ${rCount} Fuel Readings, ${eCount} Expenses`,
      });
    } catch (err) {
      console.error('Error reading JSON backup file:', err);
      showToast(
        'Could not parse JSON file. Make sure you selected a valid .json backup.',
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
      const restoredCounts = await restoreFullDatabaseFromJson(
        pendingRestoreFile.content
      );
      setCounts(restoredCounts);
      setPendingRestoreFile(null);
      showToast(
        'Backup restored and all ledgers recalculated successfully!',
        'success'
      );
    } catch (error: any) {
      console.error('Restore failed:', error);
      showToast(
        error?.message || 'Failed to restore backup file. Please verify the file.',
        'error'
      );
    } finally {
      setIsRestoring(false);
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
          Manage your fuel station profile, database backups (.JSON), loading splash screen, and home screen icon.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Database Backup & Restore (.JSON) Section */}
        <section className="bg-white rounded-2xl shadow-card-lg border border-amber-200/80 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-[#132F57] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Database Backup & Restore (.JSON)
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Export all station data to your device in Supabase-ready &amp; Firebase-ready JSON format.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={refreshCounts}
              disabled={loadingCounts}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 transition-colors"
              aria-label="Refresh record counts"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />
              <span>Refresh counts</span>
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Live Record Counts Grid */}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-3">
                Records included in full backup
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 block">Vendors</span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {counts ? counts.vendors : '...'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 block">Purchases</span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {counts ? counts.purchases : '...'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 block">Vendor payments</span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {counts ? counts.vendorPayments : '...'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 block">Fuel readings</span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {counts ? counts.fuelReadings : '...'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 col-span-2 sm:col-span-1">
                  <span className="text-xs text-slate-500 block">Expenses</span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {counts ? counts.expenses : '...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Supabase Compatibility Notice */}
            <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-950 space-y-1 leading-relaxed">
                <p className="font-bold text-emerald-900">
                  100% Ready for Supabase (PostgreSQL) Restore
                </p>
                <p className="text-emerald-800">
                  The downloaded <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">.json</code> file saves your complete station profile, fuel stock &amp; readings, vendor credit ledgers (Qarz), purchase invoices, vendor payments, and expenses with ISO-8601 timestamps and exact decimal numbers so it can be restored directly into Supabase whenever you are ready to migrate.
                </p>
              </div>
            </div>

            {lastBackupFile && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-950">
                <div className="flex items-center gap-2 font-semibold">
                  <FileJson className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Latest backup saved to device: <strong>{lastBackupFile}</strong></span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                  Saved
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting}
                className="flex-1 min-h-[48px] flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-sm shadow-md active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <div className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                <span>
                  {isExporting ? 'Preparing & Downloading JSON Backup...' : 'Backup All Data to Device (.JSON)'}
                </span>
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
                className="min-h-[48px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Restore from .JSON File</span>
              </button>
            </div>
          </div>
        </section>

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

      {/* Confirmation Dialog for Restoring JSON Backup */}
      {pendingRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Restore Database from Backup?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  File: <strong className="text-slate-800">{pendingRestoreFile.name}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-bold text-slate-800">Records found in backup:</p>
              <p>{pendingRestoreFile.summary}</p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Restoring will merge all records from this backup file into your account and automatically recalculate stock and vendor ledgers.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-sm disabled:opacity-50"
              >
                {isRestoring ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>{isRestoring ? 'Restoring Data...' : 'Confirm & Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

