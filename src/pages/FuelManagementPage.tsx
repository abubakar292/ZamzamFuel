import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, writeBatch, collection, query, orderBy, limit, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { recalculateDatabase } from '../utils/recalculate';
import { Edit3, X, Trash2, AlertTriangle, Droplets, Fuel, Save, Gauge } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { FuelPrices, FuelReading } from '../types';
import { useToast } from '../components/Toast';
import { dailySold, dailyAmount, profitPerLiter, totalProfit, formatAmount, formatLiters } from '../utils/calculations';
import { parseDateInput, getTodayDateString, formatDisplayDate } from '../utils/dateUtils';

export default function FuelManagementPage() {
  const [settings, setSettings] = useState<FuelPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Recent Readings & Editing
  const [recentReadings, setRecentReadings] = useState<FuelReading[]>([]);
  const [editingReading, setEditingReading] = useState<FuelReading | null>(null);
  const [readingToDelete, setReadingToDelete] = useState<FuelReading | null>(null);
  const [editPClosing, setEditPClosing] = useState('');
  const [editDClosing, setEditDClosing] = useState('');
  const [editPSalePrice, setEditPSalePrice] = useState('');
  const [editDSalePrice, setEditDSalePrice] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deletingReading, setDeletingReading] = useState(false);

  // Meter Calibration
  const [calibrating, setCalibrating] = useState<'petrol' | 'diesel' | null>(null);
  const [calibReading, setCalibReading] = useState('');
  const [savingCalib, setSavingCalib] = useState(false);

  const [date, setDate] = useState(() => getTodayDateString());
  
  // Petrol
  const [pClosing, setPClosing] = useState('');
  const [pSalePrice, setPSalePrice] = useState('');
  
  // Diesel
  const [dClosing, setDClosing] = useState('');
  const [dSalePrice, setDSalePrice] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(getUserDoc('appSettings', 'fuelPrices'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as FuelPrices;
        setSettings(data);
        // Set initial sale price if empty
        if (!pSalePrice) {
          setPSalePrice(data.lastPetrolSalePrice ? data.lastPetrolSalePrice.toString() : ((data.petrolAvgPurchasePrice || 0) * 1.05).toFixed(2));
        }
        if (!dSalePrice) {
          setDSalePrice(data.lastDieselSalePrice ? data.lastDieselSalePrice.toString() : ((data.dieselAvgPurchasePrice || 0) * 1.05).toFixed(2));
        }
      } else {
        setSettings({
          petrolStock: 0,
          petrolAvgPurchasePrice: 0,
          dieselStock: 0,
          dieselAvgPurchasePrice: 0,
          petrolStockValue: 0,
          dieselStockValue: 0,
          petrolCurrentReading: 0,
          dieselCurrentReading: 0
        });
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  
  // Real-time listener for Recent Readings: updates instantly upon add, delete, or edit without browser refresh
  useEffect(() => {
    const q = query(getUserCollection('fuelReadings'), orderBy('date', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      const readings = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as FuelReading));
      // Sort in true chronological order descending (newest first)
      readings.sort((a, b) => {
        const timeA = (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0) || (a.date?.toMillis ? a.date.toMillis() : 0);
        const timeB = (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) || (b.date?.toMillis ? b.date.toMillis() : 0);
        return timeB - timeA;
      });
      setRecentReadings(readings);
    });
    return () => unsub();
  }, []);


  const pClosingNum = parseFloat(pClosing) || 0;
  const pSalePriceNum = parseFloat(pSalePrice) || 0;
  const pLastReading = settings?.petrolCurrentReading || 0;
  const pSold = pClosingNum > pLastReading ? dailySold(pClosingNum, pLastReading) : 0;
  const pAmount = dailyAmount(pSold, pSalePriceNum);
  const pProfitPerL = profitPerLiter(pSalePriceNum, settings?.petrolAvgPurchasePrice || 0);
  const pTotalProfit = totalProfit(pSold, pProfitPerL);

  const dClosingNum = parseFloat(dClosing) || 0;
  const dSalePriceNum = parseFloat(dSalePrice) || 0;
  const dLastReading = settings?.dieselCurrentReading || 0;
  const dSold = dClosingNum > dLastReading ? dailySold(dClosingNum, dLastReading) : 0;
  const dAmount = dailyAmount(dSold, dSalePriceNum);
  const dProfitPerL = profitPerLiter(dSalePriceNum, settings?.dieselAvgPurchasePrice || 0);
  const dTotalProfit = totalProfit(dSold, dProfitPerL);

  const pStock = Number(settings?.petrolStock) || 0;
  const dStock = Number(settings?.dieselStock) || 0;

  // Stock Exceeded validation checks
  const isPetrolStockExceeded = pClosingNum > pLastReading && pSold > pStock;
  const isDieselStockExceeded = dClosingNum > dLastReading && dSold > dStock;
  const isStockExceeded = isPetrolStockExceeded || isDieselStockExceeded;

  const subtotalAmount = pAmount + dAmount;

  const handleEditSave = async () => {
    if (!editingReading || !settings) return;
    setEditSaving(true);
    try {
      const newPClosing = parseFloat(editPClosing) || 0;
      const newDClosing = parseFloat(editDClosing) || 0;
      
      const newPSold = Math.max(0, newPClosing - editingReading.petrolLastReading);
      const newDSold = Math.max(0, newDClosing - editingReading.dieselLastReading);
      
      const maxAllowedPSold = pStock + (editingReading.petrolSold || 0);
      const maxAllowedDSold = dStock + (editingReading.dieselSold || 0);

      if (newPSold > maxAllowedPSold) {
        showToast(`Cannot update: Petrol reading implies selling ${formatLiters(newPSold)}, but only ${formatLiters(maxAllowedPSold)} available in stock.`, 'error');
        setEditSaving(false);
        return;
      }
      if (newDSold > maxAllowedDSold) {
        showToast(`Cannot update: Diesel reading implies selling ${formatLiters(newDSold)}, but only ${formatLiters(maxAllowedDSold)} available in stock.`, 'error');
        setEditSaving(false);
        return;
      }

      const newPSalePrice = parseFloat(editPSalePrice) > 0 ? parseFloat(editPSalePrice) : (editingReading.petrolSalePrice || 0);
      const newDSalePrice = parseFloat(editDSalePrice) > 0 ? parseFloat(editDSalePrice) : (editingReading.dieselSalePrice || 0);

      const newPAmount = dailyAmount(newPSold, newPSalePrice);
      const newDAmount = dailyAmount(newDSold, newDSalePrice);
      const newSubtotal = newPAmount + newDAmount;

      const pAvg = Number(editingReading.petrolAvgPurchasePrice) || Number(settings.petrolAvgPurchasePrice) || 0;
      const dAvg = Number(editingReading.dieselAvgPurchasePrice) || Number(settings.dieselAvgPurchasePrice) || 0;
      const newPProfitPerL = newPSalePrice - pAvg;
      const newDProfitPerL = newDSalePrice - dAvg;
      const newPTotalProfit = newPSold * newPProfitPerL;
      const newDTotalProfit = newDSold * newDProfitPerL;

      await updateDoc(getUserDoc('fuelReadings', editingReading.id!), {
        petrolClosingReading: newPClosing,
        petrolSold: newPSold,
        petrolSalePrice: newPSalePrice,
        petrolAmount: newPAmount,
        petrolAvgPurchasePrice: pAvg,
        petrolProfitPerLiter: newPProfitPerL,
        petrolTotalProfit: newPTotalProfit,
        dieselClosingReading: newDClosing,
        dieselSold: newDSold,
        dieselSalePrice: newDSalePrice,
        dieselAmount: newDAmount,
        dieselAvgPurchasePrice: dAvg,
        dieselProfitPerLiter: newDProfitPerL,
        dieselTotalProfit: newDTotalProfit,
        totalProfit: newPTotalProfit + newDTotalProfit,
        subtotal: newSubtotal,
      });

      // Recalculate whole db to fix stock and current reading correctly
      await recalculateDatabase();

      showToast('Reading updated successfully & database synchronized', 'success');
      setEditingReading(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to update reading', 'error');
    } finally {
      setEditSaving(false);
    }
  };


  const handleDeleteReading = async () => {
    if (!readingToDelete?.id) return;
    const toDeleteId = readingToDelete.id;
    setDeletingReading(true);

    // Directly and instantly remove from local recent entries list (no wait, no browser refresh needed)
    setRecentReadings(prev => prev.filter(r => r.id !== toDeleteId));

    try {
      await deleteDoc(getUserDoc('fuelReadings', toDeleteId));
      await recalculateDatabase();
      showToast('Reading entry deleted and calculations updated in real-time', 'success');
      setReadingToDelete(null);
    } catch (err) {
      console.error('Failed to delete reading:', err);
      showToast('Failed to delete reading', 'error');
    } finally {
      setDeletingReading(false);
    }
  };

  const handleSaveCalibration = async () => {
    if (!calibrating) return;
    const val = parseFloat(calibReading);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid meter reading', 'warning');
      return;
    }
    setSavingCalib(true);
    try {
      if (calibrating === 'petrol') {
        await setDoc(getUserDoc('appSettings', 'fuelPrices'), {
          petrolCurrentReading: val,
          initialPetrolReading: val
        }, { merge: true });
      } else {
        await setDoc(getUserDoc('appSettings', 'fuelPrices'), {
          dieselCurrentReading: val,
          initialDieselReading: val
        }, { merge: true });
      }
      await recalculateDatabase();
      showToast(`${calibrating === 'petrol' ? 'Petrol' : 'Diesel'} meter calibrated to ${val} L`, 'success');
      setCalibrating(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to calibrate meter reading', 'error');
    } finally {
      setSavingCalib(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    if (pClosingNum <= 0 || dClosingNum <= 0) {
      showToast('Please enter both closing readings', 'warning');
      return;
    }
    if (pClosingNum < pLastReading || dClosingNum < dLastReading) {
      showToast('Closing reading must be greater than last reading', 'error');
      return;
    }
    if (pSold > pStock) {
      showToast(`Cannot save: Insufficient Petrol stock! Available: ${formatLiters(pStock)}, but closing reading calculates ${formatLiters(pSold)} sold.`, 'error');
      return;
    }
    if (dSold > dStock) {
      showToast(`Cannot save: Insufficient Diesel stock! Available: ${formatLiters(dStock)}, but closing reading calculates ${formatLiters(dSold)} sold.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const readingDate = parseDateInput(date);
      const docRef = doc(getUserCollection('fuelReadings')); 

      const newPStock = Math.max(0, settings.petrolStock - pSold);
      const newDStock = Math.max(0, settings.dieselStock - dSold);

      // Write reading
      const batch = writeBatch(db);
      
      batch.set(docRef, {
        date: readingDate,
        petrolLastReading: pLastReading,
        petrolClosingReading: pClosingNum,
        petrolSold: pSold,
        petrolSalePrice: pSalePriceNum,
        petrolAvgPurchasePrice: settings.petrolAvgPurchasePrice || 0,
        petrolProfitPerLiter: pProfitPerL,
        petrolTotalProfit: pTotalProfit,
        petrolAmount: pAmount,
        dieselLastReading: dLastReading,
        dieselClosingReading: dClosingNum,
        dieselSold: dSold,
        dieselSalePrice: dSalePriceNum,
        dieselAvgPurchasePrice: settings.dieselAvgPurchasePrice || 0,
        dieselProfitPerLiter: dProfitPerL,
        dieselTotalProfit: dTotalProfit,
        totalProfit: pTotalProfit + dTotalProfit,
        subtotal: subtotalAmount,
        createdAt: serverTimestamp()
      });

      // Update settings
      batch.set(getUserDoc('appSettings', 'fuelPrices'), {
        petrolCurrentReading: pClosingNum,
        dieselCurrentReading: dClosingNum,
        petrolStock: newPStock,
        dieselStock: newDStock,
        petrolStockValue: newPStock * settings.petrolAvgPurchasePrice,
        dieselStockValue: newDStock * settings.dieselAvgPurchasePrice,
        lastPetrolSalePrice: pSalePriceNum,
        lastDieselSalePrice: dSalePriceNum,
        ...(settings.initialPetrolReading === undefined ? { initialPetrolReading: pLastReading } : {}),
        ...(settings.initialDieselReading === undefined ? { initialDieselReading: dLastReading } : {})
      }, { merge: true });

      await batch.commit();

      // Recalculate whole db to ensure chronological integrity and profit synchronization
      await recalculateDatabase();

      showToast('Daily closing saved successfully', 'success');
      setPClosing(''); setDClosing('');
      
    } catch (error) {
      console.error(error);
      showToast('Failed to save closing', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-36 lg:pb-24">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Daily Closing Entry</h2>
          <p className="text-xs text-slate-400 mt-0.5">Enter closing meter readings to record daily sales and deduct tank stock</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-sm font-medium text-slate-600">Date:</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="flex-1 sm:w-auto px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Prominent Fuel Purchase Rates & Tank Inventory Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-card border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold">
                <Droplets className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">Petrol Purchase Rate</span>
            </div>
            <span className="text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
              Avg. Cost
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mt-1">
            <div className="min-w-0">
              <p className="text-xl xs:text-2xl sm:text-3xl font-black text-amber-950 tabular-nums truncate">
                Rs. {formatAmount(settings?.petrolAvgPurchasePrice || 0)}
                <span className="text-xs font-bold text-amber-700 ml-1">/ Liter</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Weighted average cost across purchases</p>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available Stock</p>
              <p className="text-sm sm:text-base font-extrabold text-slate-800 tabular-nums">{formatLiters(pStock)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-card border border-blue-200/80 bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold">
                <Fuel className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Diesel Purchase Rate</span>
            </div>
            <span className="text-xs font-bold bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-full">
              Avg. Cost
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mt-1">
            <div className="min-w-0">
              <p className="text-xl xs:text-2xl sm:text-3xl font-black text-blue-950 tabular-nums truncate">
                Rs. {formatAmount(settings?.dieselAvgPurchasePrice || 0)}
                <span className="text-xs font-bold text-blue-700 ml-1">/ Liter</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Weighted average cost across purchases</p>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available Stock</p>
              <p className="text-sm sm:text-base font-extrabold text-slate-800 tabular-nums">{formatLiters(dStock)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Petrol Card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-slate-100">
          <div className="bg-petrol p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-wider uppercase">Petrol Entry</h3>
            </div>
            <span className="text-xs font-bold text-white/90 bg-white/10 px-2.5 py-1 rounded-lg">
              Stock: {formatLiters(pStock)}
            </span>
          </div>
          
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Prominent Average Purchase Price Box */}
            <div className="p-3 sm:p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Avg. Purchase Price</p>
                <p className="text-base font-black text-amber-950 mt-0.5">Rs. {formatAmount(settings?.petrolAvgPurchasePrice || 0)} / L</p>
              </div>
              <span className="text-xs font-bold text-amber-800 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
                Cost Basis
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Starting Meter</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm sm:text-base font-bold text-slate-800 tabular-nums">{formatLiters(pLastReading)}</p>
                  <button 
                    type="button"
                    onClick={() => {
                      setCalibrating('petrol');
                      setCalibReading(pLastReading > 0 ? pLastReading.toString() : '');
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-primary transition-colors"
                    title="Calibrate / Set starting pump meter reading"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tank Stock</p>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${pStock > 500 ? 'bg-emerald-500' : pStock > 0 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <p className={`text-sm sm:text-base font-black tabular-nums ${pStock > 500 ? 'text-slate-800' : pStock > 0 ? 'text-amber-800' : 'text-danger'}`}>
                    {formatLiters(pStock)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3.5 sm:space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700">Closing Reading (L) *</label>
                  {pStock <= 0 ? (
                    <span className="text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-md">
                      ⚠️ Out of Stock
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Stock: {formatLiters(pStock)}</span>
                  )}
                </div>
                <input 
                  type="number" step="0.01" required value={pClosing} onChange={e => setPClosing(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50 border ${
                    (pClosingNum > 0 && pClosingNum < pLastReading) || isPetrolStockExceeded
                      ? 'border-danger focus:ring-danger/20 bg-rose-50/50 text-danger' 
                      : 'border-slate-200 focus:ring-petrol/20'
                  } text-base sm:text-lg font-bold text-slate-900 transition-all`}
                  placeholder="0.00"
                />
                {pClosingNum > 0 && pClosingNum < pLastReading && (
                  <p className="text-xs text-danger mt-1 font-semibold">Closing must be greater than last reading ({formatLiters(pLastReading)})</p>
                )}
                {isPetrolStockExceeded && (
                  <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-rose-800 text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-900 text-sm">Error: Insufficient Petrol Stock!</p>
                      <p className="mt-0.5">
                        Current stock is <strong>{formatLiters(pStock)}</strong>, but closing reading calculates <strong>{formatLiters(pSold)}</strong> sold (Shortage of {formatLiters(pSold - pStock)}).
                      </p>
                      <p className="mt-1 font-semibold text-rose-700">You cannot enter a reading exceeding available fuel stock.</p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">Sale Price (Rs./L) *</label>
                <input 
                  type="number" step="0.01" required value={pSalePrice} onChange={e => setPSalePrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-lg font-bold text-slate-900 focus:ring-2 focus:ring-petrol/20 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            {pClosingNum > pLastReading && (
              <div className="bg-petrol/5 rounded-xl p-3.5 sm:p-4 border border-petrol/10">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Sold Today</p>
                    <p className="text-sm sm:text-base font-bold text-slate-800 tabular-nums">{formatLiters(pSold)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Profit / Liter</p>
                    <p className={`text-xs sm:text-sm font-bold tabular-nums ${pProfitPerL >= 0 ? 'text-success' : 'text-danger'}`}>
                      {pProfitPerL >= 0 ? '+' : ''}Rs. {formatAmount(pProfitPerL)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-petrol/10 flex justify-between items-center">
                  <p className="text-xs sm:text-sm font-bold text-slate-600">Total Amount</p>
                  <p className="text-base sm:text-xl font-bold text-petrol tabular-nums">Rs. {formatAmount(pAmount)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Diesel Card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-slate-100">
          <div className="bg-diesel p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Fuel className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-wider uppercase">Diesel Entry</h3>
            </div>
            <span className="text-xs font-bold text-white/90 bg-white/10 px-2.5 py-1 rounded-lg">
              Stock: {formatLiters(dStock)}
            </span>
          </div>
          
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Prominent Average Purchase Price Box */}
            <div className="p-3 sm:p-3.5 bg-blue-50 border border-blue-200/80 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Avg. Purchase Price</p>
                <p className="text-base font-black text-blue-950 mt-0.5">Rs. {formatAmount(settings?.dieselAvgPurchasePrice || 0)} / L</p>
              </div>
              <span className="text-xs font-bold text-blue-800 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                Cost Basis
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Starting Meter</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm sm:text-base font-bold text-slate-800 tabular-nums">{formatLiters(dLastReading)}</p>
                  <button 
                    type="button"
                    onClick={() => {
                      setCalibrating('diesel');
                      setCalibReading(dLastReading > 0 ? dLastReading.toString() : '');
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-diesel transition-colors"
                    title="Calibrate / Set starting pump meter reading"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tank Stock</p>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${dStock > 500 ? 'bg-emerald-500' : dStock > 0 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <p className={`text-sm sm:text-base font-black tabular-nums ${dStock > 500 ? 'text-slate-800' : dStock > 0 ? 'text-amber-800' : 'text-danger'}`}>
                    {formatLiters(dStock)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3.5 sm:space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700">Closing Reading (L) *</label>
                  {dStock <= 0 ? (
                    <span className="text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-md">
                      ⚠️ Out of Stock
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Stock: {formatLiters(dStock)}</span>
                  )}
                </div>
                <input 
                  type="number" step="0.01" required value={dClosing} onChange={e => setDClosing(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50 border ${
                    (dClosingNum > 0 && dClosingNum < dLastReading) || isDieselStockExceeded
                      ? 'border-danger focus:ring-danger/20 bg-rose-50/50 text-danger' 
                      : 'border-slate-200 focus:ring-diesel/20'
                  } text-base sm:text-lg font-bold text-slate-900 transition-all`}
                  placeholder="0.00"
                />
                {dClosingNum > 0 && dClosingNum < dLastReading && (
                  <p className="text-xs text-danger mt-1 font-semibold">Closing must be greater than last reading ({formatLiters(dLastReading)})</p>
                )}
                {isDieselStockExceeded && (
                  <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-rose-800 text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-900 text-sm">Error: Insufficient Diesel Stock!</p>
                      <p className="mt-0.5">
                        Current stock is <strong>{formatLiters(dStock)}</strong>, but closing reading calculates <strong>{formatLiters(dSold)}</strong> sold (Shortage of {formatLiters(dSold - dStock)}).
                      </p>
                      <p className="mt-1 font-semibold text-rose-700">You cannot enter a reading exceeding available fuel stock.</p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">Sale Price (Rs./L) *</label>
                <input 
                  type="number" step="0.01" required value={dSalePrice} onChange={e => setDSalePrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-lg font-bold text-slate-900 focus:ring-2 focus:ring-diesel/20 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            {dClosingNum > dLastReading && (
              <div className="bg-diesel/5 rounded-xl p-3.5 sm:p-4 border border-diesel/10">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Sold Today</p>
                    <p className="text-sm sm:text-base font-bold text-slate-800 tabular-nums">{formatLiters(dSold)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Profit / Liter</p>
                    <p className={`text-xs sm:text-sm font-bold tabular-nums ${dProfitPerL >= 0 ? 'text-success' : 'text-danger'}`}>
                      {dProfitPerL >= 0 ? '+' : ''}Rs. {formatAmount(dProfitPerL)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-diesel/10 flex justify-between items-center">
                  <p className="text-xs sm:text-sm font-bold text-slate-600">Total Amount</p>
                  <p className="text-base sm:text-xl font-bold text-diesel tabular-nums">Rs. {formatAmount(dAmount)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline Daily Sales Summary & Save Action */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-md">
                Today's Daily Sales
              </span>
              {(pSold > 0 || dSold > 0) && (
                <span className="text-xs font-semibold text-slate-500">
                  {formatLiters(pSold + dSold)} total volume sold
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Amount:</span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                Rs. {formatAmount(subtotalAmount)}
              </span>
            </div>

            {/* Petrol & Diesel quick pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200/80 text-amber-900 px-2.5 py-1 rounded-lg font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                <span>Petrol: <strong>{formatLiters(pSold)}</strong> (Rs. {formatAmount(pAmount)})</span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200/80 text-blue-900 px-2.5 py-1 rounded-lg font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                <span>Diesel: <strong>{formatLiters(dSold)}</strong> (Rs. {formatAmount(dAmount)})</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
            {isStockExceeded && (
              <div className="flex items-center gap-1.5 text-danger bg-danger/10 px-3 py-1.5 rounded-xl text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Reading exceeds available tank stock!</span>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || pClosingNum <= pLastReading || dClosingNum <= dLastReading || isStockExceeded}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-xs sm:text-sm hover:bg-primary-light transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
            
            <p className="text-[10px] text-slate-400 text-center md:text-right">
              {pClosingNum <= pLastReading || dClosingNum <= dLastReading
                ? 'Enter closing readings higher than starting meter to save'
                : 'Saves closing readings and updates tank stock'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Readings List */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800">Recent Entries</h3>
            <p className="text-xs text-slate-400">Past meter closings & recorded fuel sales</p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {recentReadings.length} {recentReadings.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {recentReadings.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center">No recent entries found.</p>
        ) : (
          <>
            {/* Mobile Cards (Spacious, easy to read, not cramped) */}
            <div className="md:hidden space-y-3">
              {recentReadings.map(r => (
                <div key={r.id} className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                    <span className="font-bold text-slate-800 text-sm">{formatDisplayDate(r.date)}</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setEditingReading(r);
                          setEditPClosing(r.petrolClosingReading.toString());
                          setEditDClosing(r.dieselClosingReading.toString());
                          setEditPSalePrice(r.petrolSalePrice ? r.petrolSalePrice.toString() : '');
                          setEditDSalePrice(r.dieselSalePrice ? r.dieselSalePrice.toString() : '');
                        }}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Edit reading"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setReadingToDelete(r)}
                        className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                        title="Delete reading"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Petrol Reading Box */}
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Droplets className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">Petrol Closing</span>
                      </div>
                      <p className="text-sm font-black text-slate-800 tabular-nums">
                        {formatLiters(r.petrolClosingReading)}
                      </p>
                      {r.petrolSold !== undefined && (
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                          Sold: <span className="text-amber-800 font-bold">{formatLiters(r.petrolSold)}</span>
                        </p>
                      )}
                    </div>

                    {/* Diesel Reading Box */}
                    <div className="bg-white p-2.5 rounded-lg border border-blue-200/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Fuel className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[10px] uppercase font-bold text-blue-900 tracking-wider">Diesel Closing</span>
                      </div>
                      <p className="text-sm font-black text-slate-800 tabular-nums">
                        {formatLiters(r.dieselClosingReading)}
                      </p>
                      {r.dieselSold !== undefined && (
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                          Sold: <span className="text-blue-800 font-bold">{formatLiters(r.dieselSold)}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {r.subtotal !== undefined && r.subtotal > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 text-xs">
                      <span className="text-slate-500 font-medium">Daily Sale Total:</span>
                      <span className="font-extrabold text-slate-800 tabular-nums">Rs. {formatAmount(r.subtotal)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop / Tablet Table with generous column spacing */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="pb-3 px-3 font-bold">Date</th>
                    <th className="pb-3 px-4 font-bold text-amber-900">
                      <span className="inline-flex items-center gap-1.5">
                        <Droplets className="w-3.5 h-3.5 text-amber-600" /> Petrol Closing
                      </span>
                    </th>
                    <th className="pb-3 px-4 font-bold text-blue-900">
                      <span className="inline-flex items-center gap-1.5">
                        <Fuel className="w-3.5 h-3.5 text-blue-600" /> Diesel Closing
                      </span>
                    </th>
                    <th className="pb-3 px-4 font-bold text-right">Day Sale</th>
                    <th className="pb-3 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReadings.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-3 font-semibold text-slate-800 whitespace-nowrap">{formatDisplayDate(r.date)}</td>
                      <td className="py-3.5 px-4 font-black text-slate-800 tabular-nums whitespace-nowrap">
                        {formatLiters(r.petrolClosingReading)}
                        {r.petrolSold !== undefined && (
                          <span className="ml-2 text-xs text-amber-700 font-semibold">({formatLiters(r.petrolSold)} sold)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-black text-slate-800 tabular-nums whitespace-nowrap">
                        {formatLiters(r.dieselClosingReading)}
                        {r.dieselSold !== undefined && (
                          <span className="ml-2 text-xs text-blue-700 font-semibold">({formatLiters(r.dieselSold)} sold)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-800 tabular-nums whitespace-nowrap">
                        {r.subtotal ? `Rs. ${formatAmount(r.subtotal)}` : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => {
                              setEditingReading(r);
                              setEditPClosing(r.petrolClosingReading.toString());
                              setEditDClosing(r.dieselClosingReading.toString());
                              setEditPSalePrice(r.petrolSalePrice ? r.petrolSalePrice.toString() : '');
                              setEditDSalePrice(r.dieselSalePrice ? r.dieselSalePrice.toString() : '');
                            }}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit reading"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setReadingToDelete(r)}
                            className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            title="Delete reading"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {readingToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !deletingReading && setReadingToDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-danger" /> Delete Reading Entry
                </h3>
                <button onClick={() => !deletingReading && setReadingToDelete(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete the fuel reading from <strong className="text-slate-900">{formatDisplayDate(readingToDelete.date)}</strong>?
                </p>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>Petrol Sold / Closing:</span>
                    <span className="font-bold">{readingToDelete.petrolSold || 0} L / {readingToDelete.petrolClosingReading} L</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Diesel Sold / Closing:</span>
                    <span className="font-bold">{readingToDelete.dieselSold || 0} L / {readingToDelete.dieselClosingReading} L</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sale Subtotal:</span>
                    <span className="font-bold text-emerald-600">Rs. {formatAmount(readingToDelete.subtotal || 0)}</span>
                  </div>
                </div>
                <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Deleting this entry will automatically revert fuel stock, recalculate current pump meter readings, and update sales totals in Cash in Hand.</span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !deletingReading && setReadingToDelete(null)}
                  disabled={deletingReading}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteReading} disabled={deletingReading}
                  className="flex-1 py-3 px-4 bg-danger text-white font-bold rounded-xl hover:bg-danger-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingReading ? 'Deleting & Recalculating...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingReading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !editSaving && setEditingReading(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" /> Edit Reading
                </h3>
                <button onClick={() => !editSaving && setEditingReading(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm mb-4">
                  Editing this reading will automatically recalculate today's current stock and readings.
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Petrol Closing (L)</label>
                    <input 
                      type="number" step="0.01" value={editPClosing} onChange={e => setEditPClosing(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-petrol/20 text-base font-bold"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Last: {editingReading.petrolLastReading} L</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Petrol Rate (Rs.)</label>
                    <input 
                      type="number" step="0.01" value={editPSalePrice} onChange={e => setEditPSalePrice(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-petrol/20 text-base font-bold"
                      placeholder="Sale price"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Current: Rs. {editingReading.petrolSalePrice}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Diesel Closing (L)</label>
                    <input 
                      type="number" step="0.01" value={editDClosing} onChange={e => setEditDClosing(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-diesel/20 text-base font-bold"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Last: {editingReading.dieselLastReading} L</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Diesel Rate (Rs.)</label>
                    <input 
                      type="number" step="0.01" value={editDSalePrice} onChange={e => setEditDSalePrice(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-diesel/20 text-base font-bold"
                      placeholder="Sale price"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Current: Rs. {editingReading.dieselSalePrice}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !editSaving && setEditingReading(null)}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditSave} disabled={editSaving}
                  className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Update Reading'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Meter Calibration Modal */}
      <AnimatePresence>
        {calibrating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !savingCalib && setCalibrating(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-primary" /> Calibrate {calibrating === 'petrol' ? 'Petrol' : 'Diesel'} Meter
                </h3>
                <button onClick={() => !savingCalib && setCalibrating(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Set or adjust the current physical pump meter reading for <strong className="capitalize text-slate-800">{calibrating}</strong>. Future closing entries will calculate sales from this reading.
                </p>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Starting Meter Reading (Liters)</label>
                  <input 
                    type="number" step="0.01" 
                    value={calibReading} 
                    onChange={e => setCalibReading(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-primary/20 text-lg font-bold"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !savingCalib && setCalibrating(null)}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveCalibration} disabled={savingCalib}
                  className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {savingCalib ? 'Calibrating...' : 'Save Calibration'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Floating Bottom Quick-Save Bar (Docked above MobileBottomNav on mobile, at bottom on desktop) */}
      <div className="fixed bottom-[60px] lg:bottom-0 left-0 right-0 lg:left-[260px] bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-3.5 py-2.5 sm:px-6 sm:py-2.5 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 leading-none">
              Total Daily Sales
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums">
                Rs. {formatAmount(subtotalAmount)}
              </span>
              {(pSold > 0 || dSold > 0) && (
                <span className="hidden sm:inline-block text-[11px] font-medium text-slate-500">
                  ({formatLiters(pSold + dSold)} total)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isStockExceeded && (
              <div className="hidden sm:flex items-center gap-1 text-danger bg-danger/10 px-2.5 py-1 rounded-lg text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Exceeds Stock!</span>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || pClosingNum <= pLastReading || dClosingNum <= dLastReading || isStockExceeded}
              className="px-4 py-2 sm:px-5 sm:py-2 rounded-xl bg-primary text-white font-bold text-xs sm:text-sm hover:bg-primary-light transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm active:scale-95"
              title={
                isStockExceeded 
                  ? 'Reading exceeds available tank stock' 
                  : (pClosingNum <= pLastReading || dClosingNum <= dLastReading)
                    ? 'Enter closing readings higher than starting meter to save'
                    : 'Save closing readings'
              }
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{saving ? 'Saving...' : isStockExceeded ? 'Exceeds Stock' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
