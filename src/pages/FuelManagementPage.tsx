import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, writeBatch, collection, query, orderBy, limit, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { recalculateDatabase } from '../utils/recalculate';
import { Edit3, X, Trash2, AlertTriangle, Droplets, Fuel, Save } from 'lucide-react';
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
  const [editSaving, setEditSaving] = useState(false);
  const [deletingReading, setDeletingReading] = useState(false);

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

  
  useEffect(() => {
    const fetchRecent = async () => {
      const q = query(getUserCollection('fuelReadings'), orderBy('date', 'desc'), limit(5));
      const snap = await getDocs(q);
      const readings = snap.docs.map(d => ({ ...d.data(), id: d.id } as FuelReading));
      setRecentReadings(readings);
    };
    fetchRecent();
    
    // Also re-fetch when saving happens, we can hook it into the onSnapshot or do it manually
  }, [saving, editSaving]);


  const pClosingNum = parseFloat(pClosing) || 0;
  const pSalePriceNum = parseFloat(pSalePrice) || 0;
  const pLastReading = settings?.petrolCurrentReading || 0;
  const pSold = pClosingNum > 0 ? dailySold(pClosingNum, pLastReading) : 0;
  const pAmount = dailyAmount(pSold, pSalePriceNum);
  const pProfitPerL = profitPerLiter(pSalePriceNum, settings?.petrolAvgPurchasePrice || 0);
  const pTotalProfit = totalProfit(pSold, pProfitPerL);

  const dClosingNum = parseFloat(dClosing) || 0;
  const dSalePriceNum = parseFloat(dSalePrice) || 0;
  const dLastReading = settings?.dieselCurrentReading || 0;
  const dSold = dClosingNum > 0 ? dailySold(dClosingNum, dLastReading) : 0;
  const dAmount = dailyAmount(dSold, dSalePriceNum);
  const dProfitPerL = profitPerLiter(dSalePriceNum, settings?.dieselAvgPurchasePrice || 0);
  const dTotalProfit = totalProfit(dSold, dProfitPerL);

  const subtotalAmount = pAmount + dAmount;

  
  const handleEditSave = async () => {
    if (!editingReading || !settings) return;
    setEditSaving(true);
    try {
      const newPClosing = parseFloat(editPClosing) || 0;
      const newDClosing = parseFloat(editDClosing) || 0;
      
      const newPSold = Math.max(0, newPClosing - editingReading.petrolLastReading);
      const newDSold = Math.max(0, newDClosing - editingReading.dieselLastReading);
      
      const newPAmount = dailyAmount(newPSold, editingReading.petrolSalePrice);
      const newDAmount = dailyAmount(newDSold, editingReading.dieselSalePrice);
      const newSubtotal = newPAmount + newDAmount;

      await updateDoc(getUserDoc('fuelReadings', editingReading.id!), {
        petrolClosingReading: newPClosing,
        petrolSold: newPSold,
        petrolAmount: newPAmount,
        dieselClosingReading: newDClosing,
        dieselSold: newDSold,
        dieselAmount: newDAmount,
        subtotal: newSubtotal,
      });

      // Recalculate whole db to fix stock and current reading correctly
      await recalculateDatabase();

      showToast('Reading updated successfully', 'success');
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
    setDeletingReading(true);
    try {
      await deleteDoc(getUserDoc('fuelReadings', readingToDelete.id));
      await recalculateDatabase();
      showToast('Reading deleted and database recalculated successfully', 'success');
      setReadingToDelete(null);
    } catch (err) {
      console.error('Failed to delete reading:', err);
      showToast('Failed to delete reading', 'error');
    } finally {
      setDeletingReading(false);
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

    setSaving(true);
    try {
      const readingDate = parseDateInput(date);

      const readingId = `reading_${date}`; // simple deterministic ID per day, or use auto ID.
      // Actually requirement says "Saves ONE document to /fuelReadings"
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
        petrolAmount: pAmount,
        dieselLastReading: dLastReading,
        dieselClosingReading: dClosingNum,
        dieselSold: dSold,
        dieselSalePrice: dSalePriceNum,
        dieselAmount: dAmount,
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
      }, { merge: true });

      await batch.commit();

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
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800">Daily Closing Entry</h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-sm font-medium text-slate-600">Closing for:</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="flex-1 sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Petrol Card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-slate-100">
          <div className="bg-petrol p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-wider uppercase">Petrol</h3>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="flex justify-between items-end pb-4 border-b border-slate-100">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Last Reading</p>
                <p className="text-lg font-bold text-slate-800">{formatLiters(pLastReading)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Avg Purchase</p>
                <p className="text-sm font-bold text-slate-600">Rs. {formatAmount(settings?.petrolAvgPurchasePrice || 0)}/L</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Closing Reading (L) *</label>
                <input 
                  type="number" step="0.01" required value={pClosing} onChange={e => setPClosing(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50 border ${pClosingNum > 0 && pClosingNum < pLastReading ? 'border-danger focus:ring-danger/20' : 'border-slate-200 focus:ring-petrol/20'} text-lg font-bold text-slate-900 transition-all`}
                  placeholder="0.00"
                />
                {pClosingNum > 0 && pClosingNum < pLastReading && (
                  <p className="text-xs text-danger mt-1">Closing must be greater than last reading</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Sale Price (Rs./L) *</label>
                <input 
                  type="number" step="0.01" required value={pSalePrice} onChange={e => setPSalePrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-petrol/20 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            {pClosingNum > pLastReading && (
              <div className="bg-petrol/5 rounded-xl p-4 border border-petrol/10">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Sold Today</p>
                    <p className="text-base font-bold text-slate-800">{formatLiters(pSold)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Profit / Liter</p>
                    <p className={`text-sm font-bold ${pProfitPerL >= 0 ? 'text-success' : 'text-danger'}`}>
                      {pProfitPerL >= 0 ? '+' : ''}Rs. {formatAmount(pProfitPerL)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-petrol/10 flex justify-between items-center">
                  <p className="text-sm font-bold text-slate-600">Total Amount</p>
                  <p className="text-xl font-bold text-petrol">Rs. {formatAmount(pAmount)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Diesel Card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-slate-100">
          <div className="bg-diesel p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-wider uppercase">Diesel</h3>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="flex justify-between items-end pb-4 border-b border-slate-100">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Last Reading</p>
                <p className="text-lg font-bold text-slate-800">{formatLiters(dLastReading)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Avg Purchase</p>
                <p className="text-sm font-bold text-slate-600">Rs. {formatAmount(settings?.dieselAvgPurchasePrice || 0)}/L</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Closing Reading (L) *</label>
                <input 
                  type="number" step="0.01" required value={dClosing} onChange={e => setDClosing(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50 border ${dClosingNum > 0 && dClosingNum < dLastReading ? 'border-danger focus:ring-danger/20' : 'border-slate-200 focus:ring-diesel/20'} text-lg font-bold text-slate-900 transition-all`}
                  placeholder="0.00"
                />
                {dClosingNum > 0 && dClosingNum < dLastReading && (
                  <p className="text-xs text-danger mt-1">Closing must be greater than last reading</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Sale Price (Rs./L) *</label>
                <input 
                  type="number" step="0.01" required value={dSalePrice} onChange={e => setDSalePrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-diesel/20 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            {dClosingNum > dLastReading && (
              <div className="bg-diesel/5 rounded-xl p-4 border border-diesel/10">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Sold Today</p>
                    <p className="text-base font-bold text-slate-800">{formatLiters(dSold)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Profit / Liter</p>
                    <p className={`text-sm font-bold ${dProfitPerL >= 0 ? 'text-success' : 'text-danger'}`}>
                      {dProfitPerL >= 0 ? '+' : ''}Rs. {formatAmount(dProfitPerL)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-diesel/10 flex justify-between items-center">
                  <p className="text-sm font-bold text-slate-600">Total Amount</p>
                  <p className="text-xl font-bold text-diesel">Rs. {formatAmount(dAmount)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      
      {/* Recent Readings List */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Entries</h3>
        {recentReadings.length === 0 ? (
          <p className="text-slate-500 text-sm">No recent entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Petrol Closing</th>
                  <th className="pb-3 font-semibold">Diesel Closing</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentReadings.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 font-medium text-slate-700">{formatDisplayDate(r.date)}</td>
                    <td className="py-3 text-slate-600">{r.petrolClosingReading} L</td>
                    <td className="py-3 text-slate-600">{r.dieselClosingReading} L</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => {
                            setEditingReading(r);
                            setEditPClosing(r.petrolClosingReading.toString());
                            setEditDClosing(r.dieselClosingReading.toString());
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
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Petrol Closing Reading (L)</label>
                  <input 
                    type="number" step="0.01" value={editPClosing} onChange={e => setEditPClosing(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-petrol/20 text-lg font-bold"
                  />
                  <p className="text-xs text-slate-500 mt-1">Last Reading: {editingReading.petrolLastReading} L</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Diesel Closing Reading (L)</label>
                  <input 
                    type="number" step="0.01" value={editDClosing} onChange={e => setEditDClosing(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-diesel/20 text-lg font-bold"
                  />
                  <p className="text-xs text-slate-500 mt-1">Last Reading: {editingReading.dieselLastReading} L</p>
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


      {/* Footer Subtotal */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[260px] bg-white border-t border-slate-200 shadow-[0_-4px_24px_rgba(0,0,0,0.05)] p-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Total Daily Sales</p>
          <p className="text-2xl font-extrabold text-slate-800">Rs. {formatAmount(subtotalAmount)}</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving || pClosingNum <= pLastReading || dClosingNum <= dLastReading}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-light transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Closing Entry'}
        </button>
      </div>
    </div>
  );
}
