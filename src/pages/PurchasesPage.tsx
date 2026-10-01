import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, onSnapshot, query, orderBy, doc, runTransaction, serverTimestamp, writeBatch, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { Purchase, Vendor, PurchaseItem, FuelPrices } from '../types';
import { useToast } from '../components/Toast';
import { formatAmount, weightedAvgPrice } from '../utils/calculations';
import { recalculateDatabase, recalculateVendor, extractPurchaseItems } from '../utils/recalculate';
import { parseDateInput, getTodayDateString, formatDisplayDate, formatDateForInput } from '../utils/dateUtils';
import { Plus, Trash2, Save, History, Search, AlertTriangle, X, Edit2 } from 'lucide-react';

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [search, setSearch] = useState('');
  
  // Delete purchase state
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState(false);

  // Edit purchase state
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editVendorId, setEditVendorId] = useState('');
  const [editPaymentType, setEditPaymentType] = useState<'Cash' | 'Credit'>('Credit');
  const [editPurchaseDate, setEditPurchaseDate] = useState('');
  const [editItems, setEditItems] = useState<PurchaseItem[]>([]);
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  
  // New Purchase Form
  const [vendorId, setVendorId] = useState('');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Credit');
  const [purchaseDate, setPurchaseDate] = useState(() => getTodayDateString());
  const [items, setItems] = useState<PurchaseItem[]>([{ fuelType: 'petrol', quantity: 0, unitCost: 0, subtotal: 0 }]);
  const [amountPaid, setAmountPaid] = useState('');
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const unsubV = onSnapshot(getUserCollection('vendors'), snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
    });
    
    const unsubP = onSnapshot(getUserCollection('purchases'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase));
      list.sort((a, b) => {
        const timeA = (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0) || (a.purchaseDate?.toMillis ? a.purchaseDate.toMillis() : 0);
        const timeB = (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) || (b.purchaseDate?.toMillis ? b.purchaseDate.toMillis() : 0);
        return timeB - timeA;
      });
      setPurchases(list);
    });

    const unsubF = onSnapshot(getUserDoc('appSettings', 'fuelPrices'), snap => {
      if (snap.exists()) {
        setFuelPrices(snap.data() as FuelPrices);
      } else {
        setFuelPrices({
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
    });

    return () => { unsubV(); unsubP(); unsubF(); };
  }, []);

  const handleAddItem = () => {
    setItems([...items, { fuelType: 'petrol', quantity: 0, unitCost: 0, subtotal: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      const newItems = [...items];
      newItems.splice(index, 1);
      setItems(newItems);
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...items];
    let parsedValue = value;
    if (field === 'quantity' || field === 'unitCost') {
      parsedValue = value === '' ? '' : Number(value);
    }
    
    newItems[index] = { ...newItems[index], [field]: parsedValue };
    
    if (field === 'quantity' || field === 'unitCost') {
      newItems[index].subtotal = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitCost) || 0);
    }
    setItems(newItems);
  };

  const netSubtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
  const total = netSubtotal;
  const paid = paymentType === 'Cash' && (!amountPaid || amountPaid === '') ? total : (parseFloat(amountPaid) || 0);
  const remainingBalance = Math.max(0, total - paid);

  const handleSave = async () => {
    if (!vendorId) return showToast('Please select a vendor', 'warning');
    if (!fuelPrices) return showToast('Fuel settings not loaded', 'error');
    
    const validItems = items.filter(i => i.quantity > 0 && i.unitCost > 0);
    if (validItems.length === 0) return showToast('Add at least one valid item', 'warning');

    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) return;

    setSaving(true);
    try {
      // 1. Get next invoice number
      const nextInv = await runTransaction(db, async (t) => {
        const ref = getUserDoc('appSettings', 'counters');
        const snap = await t.get(ref);
        const next = (snap.data()?.lastInvoiceNumber || 0) + 1;
        t.set(ref, { lastInvoiceNumber: next }, { merge: true });
        return next;
      });

      // 2. Prepare date
      const pDate = parseDateInput(purchaseDate);

      const batch = writeBatch(db);

      // 3. Save purchase
      const purchaseRef = doc(getUserCollection('purchases'));
      batch.set(purchaseRef, {
        invoiceNumber: nextInv,
        vendorId: vendor.id,
        vendorName: vendor.name,
        paymentType,
        purchaseDate: pDate,
        items: validItems,
        netSubtotal: total,
        total,
        amountPaid: paid,
        remainingBalance,
        createdAt: serverTimestamp()
      });

      // 4. Update vendor
      const vendorRef = getUserDoc('vendors', vendor.id!);
      batch.set(vendorRef, {
        totalPurchases: (vendor.totalPurchases || 0) + total,
        totalPaid: (vendor.totalPaid || 0) + paid,
        vendorQarz: (vendor.vendorQarz || 0) + remainingBalance
      }, { merge: true });

      // 5. Update fuel prices (weighted avg + stock)
      let newPStock = Number(fuelPrices.petrolStock) || 0;
      let newPAvg = Number(fuelPrices.petrolAvgPurchasePrice) || 0;
      let newDStock = Number(fuelPrices.dieselStock) || 0;
      let newDAvg = Number(fuelPrices.dieselAvgPurchasePrice) || 0;

      validItems.forEach(item => {
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unitCost) || 0;
        
        if (item.fuelType === 'petrol') {
          newPAvg = weightedAvgPrice(newPStock, newPAvg, qty, cost);
          newPStock += qty;
        } else {
          newDAvg = weightedAvgPrice(newDStock, newDAvg, qty, cost);
          newDStock += qty;
        }
      });

      batch.set(getUserDoc('appSettings', 'fuelPrices'), {
        petrolStock: newPStock,
        petrolAvgPurchasePrice: newPAvg,
        petrolStockValue: newPStock * newPAvg,
        dieselStock: newDStock,
        dieselAvgPurchasePrice: newDAvg,
        dieselStockValue: newDStock * newDAvg,
      }, { merge: true });

      await batch.commit();

      // Synchronize database, inventory averages, and vendor balances across all sections
      await recalculateDatabase();
      if (vendor?.id) {
        await recalculateVendor(vendor.id);
      }
      
      showToast('Purchase recorded successfully', 'success');
      
      // Reset form
      setVendorId('');
      setItems([{ fuelType: 'petrol', quantity: 0, unitCost: 0, subtotal: 0 }]);
      setAmountPaid('');
      
    } catch (error) {
      showToast('Failed to record purchase', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePurchase = async () => {
    if (!purchaseToDelete?.id) return;
    setDeletingPurchase(true);
    try {
      const vId = purchaseToDelete.vendorId;

      // 1. Delete purchase document
      await deleteDoc(getUserDoc('purchases', purchaseToDelete.id));

      // 2. Re-calculate entire fuel inventory & weighted avg purchase prices
      await recalculateDatabase();

      // 3. Re-calculate the vendor's totalPurchases, totalPaid, and vendorQarz
      if (vId) {
        await recalculateVendor(vId);
      }

      showToast(`Purchase INV-${purchaseToDelete.invoiceNumber.toString().padStart(3, '0')} deleted & calculations updated`, 'success');
      setPurchaseToDelete(null);
    } catch (error) {
      console.error('Failed to delete purchase:', error);
      showToast('Failed to delete purchase', 'error');
    } finally {
      setDeletingPurchase(false);
    }
  };

  const filteredHistory = purchases.filter(p => 
    p.vendorName.toLowerCase().includes(search.toLowerCase()) || 
    p.invoiceNumber.toString().includes(search)
  );

  const handleStartEditPurchase = (p: Purchase) => {
    setEditingPurchase(p);
    setEditVendorId(p.vendorId || '');
    setEditPaymentType(p.paymentType || 'Credit');
    setEditPurchaseDate(formatDateForInput(p.purchaseDate));

    const loadedItems = extractPurchaseItems(p);
    if (loadedItems.length > 0) {
      setEditItems(loadedItems.map(item => ({
        fuelType: item.fuelType,
        quantity: item.quantity,
        unitCost: item.unitCost,
        subtotal: item.subtotal
      })));
    } else {
      setEditItems([{ fuelType: 'petrol', quantity: 0, unitCost: 0, subtotal: 0 }]);
    }
    setEditAmountPaid(p.amountPaid !== undefined && p.amountPaid !== null ? p.amountPaid.toString() : '');
  };

  const handleAddEditItem = () => {
    setEditItems([...editItems, { fuelType: 'diesel', quantity: 0, unitCost: 0, subtotal: 0 }]);
  };

  const handleRemoveEditItem = (index: number) => {
    if (editItems.length > 1) {
      const newItems = [...editItems];
      newItems.splice(index, 1);
      setEditItems(newItems);
    }
  };

  const updateEditItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...editItems];
    let parsedValue = value;
    if (field === 'quantity' || field === 'unitCost') {
      parsedValue = value === '' ? '' : Number(value);
    }
    
    newItems[index] = { ...newItems[index], [field]: parsedValue };
    
    if (field === 'quantity' || field === 'unitCost') {
      const q = Number(newItems[index].quantity) || 0;
      const c = Number(newItems[index].unitCost) || 0;
      newItems[index].subtotal = q * c;
    }
    setEditItems(newItems);
  };

  const editTotal = editItems.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
  const editPaid = editPaymentType === 'Cash' && (!editAmountPaid || editAmountPaid === '') 
    ? editTotal 
    : (parseFloat(editAmountPaid) || 0);
  const editRemainingBalance = Math.max(0, editTotal - editPaid);

  const handleSaveEditPurchase = async () => {
    if (!editingPurchase?.id) return;
    if (!editVendorId) return showToast('Please select a vendor', 'warning');

    const validItems = editItems.filter(i => (Number(i.quantity) || 0) > 0);
    if (validItems.length === 0) return showToast('Please enter fuel stock liters for at least one fuel type', 'warning');

    const vendor = vendors.find(v => v.id === editVendorId);
    if (!vendor) return showToast('Vendor not found', 'error');

    setEditSaving(true);
    try {
      const oldVendorId = editingPurchase.vendorId;
      const pDate = parseDateInput(editPurchaseDate);

      const formattedItems = validItems.map(item => {
        const isDiesel = (item.fuelType || '').toLowerCase().includes('diesel');
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unitCost) || 0;
        return {
          fuelType: (isDiesel ? 'diesel' : 'petrol') as 'petrol' | 'diesel',
          quantity: qty,
          unitCost: cost,
          subtotal: qty * cost
        };
      });

      const finalTotal = formattedItems.reduce((acc, item) => acc + item.subtotal, 0);
      const finalPaid = editPaymentType === 'Cash' && (!editAmountPaid || editAmountPaid === '') 
        ? finalTotal 
        : (parseFloat(editAmountPaid) || 0);
      const finalRemaining = Math.max(0, finalTotal - finalPaid);

      const pItem = formattedItems.find(i => i.fuelType === 'petrol');
      const dItem = formattedItems.find(i => i.fuelType === 'diesel');
      const newPetrolLiters = pItem ? pItem.quantity : 0;
      const newPetrolCost = pItem ? pItem.unitCost : 0;
      const newDieselLiters = dItem ? dItem.quantity : 0;
      const newDieselCost = dItem ? dItem.unitCost : 0;

      // 1. Save directly with setDoc (both items array & legacy fields for universal compatibility)
      await setDoc(getUserDoc('purchases', editingPurchase.id), {
        invoiceNumber: editingPurchase.invoiceNumber,
        vendorId: vendor.id,
        vendorName: vendor.name,
        paymentType: editPaymentType,
        purchaseDate: pDate,
        items: formattedItems,
        petrolStock: newPetrolLiters,
        petrolQuantity: newPetrolLiters,
        petrolLiters: newPetrolLiters,
        petrolPrice: newPetrolCost,
        petrolUnitCost: newPetrolCost,
        dieselStock: newDieselLiters,
        dieselQuantity: newDieselLiters,
        dieselLiters: newDieselLiters,
        dieselPrice: newDieselCost,
        dieselUnitCost: newDieselCost,
        netSubtotal: finalTotal,
        total: finalTotal,
        amountPaid: finalPaid,
        remainingBalance: finalRemaining,
        createdAt: editingPurchase.createdAt || serverTimestamp()
      }, { merge: true });

      // 2. Synchronize entire database: tank stocks, weighted averages, and all vendor ledgers
      await recalculateDatabase();
      await recalculateVendor(vendor.id!);
      if (oldVendorId && oldVendorId !== vendor.id) {
        await recalculateVendor(oldVendorId);
      }

      showToast(`Purchase INV-${editingPurchase.invoiceNumber.toString().padStart(3, '0')} updated & calculations refreshed`, 'success');
      setEditingPurchase(null);
    } catch (error) {
      console.error('Failed to update purchase:', error);
      showToast('Failed to update purchase', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Purchases</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage stock purchases, fuel costs, and vendor invoices</p>
        </div>
        <div className="flex bg-white rounded-xl shadow-sm p-1 border border-slate-100">
          <button 
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'new' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            New Purchase
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            History
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'new' ? (
          <motion.div key="new" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Purchase Details</h3>
                <span className="px-3 py-1 bg-accent/20 text-accent-dark font-bold rounded-lg text-sm tracking-wider">
                  INV-AUTO
                </span>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Vendor *</label>
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Payment Type</label>
                    <div className="flex bg-slate-100 rounded-xl p-1">
                      <button onClick={() => setPaymentType('Cash')} className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all ${paymentType === 'Cash' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Cash</button>
                      <button onClick={() => setPaymentType('Credit')} className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all ${paymentType === 'Credit' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Credit</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
                    <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] mb-4">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">Product</th>
                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider w-32">Qty (L)</th>
                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider w-40">Unit Cost (Rs)</th>
                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider w-40 text-right">Subtotal</th>
                        <th className="pb-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {items.map((item, idx) => (
                          <motion.tr 
                            key={idx}
                            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-3 pr-4">
                              <select value={item.fuelType} onChange={e => updateItem(idx, 'fuelType', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              >
                                <option value="petrol">Petrol</option>
                                <option value="diesel">Diesel</option>
                              </select>
                            </td>
                            <td className="py-3 pr-4">
                              <input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 font-medium" placeholder="0"
                              />
                            </td>
                            <td className="py-3 pr-4">
                              <input type="number" min="0" step="0.01" value={item.unitCost || ''} onChange={e => updateItem(idx, 'unitCost', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 font-medium" placeholder="0.00"
                              />
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <span className="font-bold text-slate-800">Rs. {formatAmount(item.subtotal)}</span>
                            </td>
                            <td className="py-3 text-right">
                              {items.length > 1 && (
                                <button onClick={() => handleRemoveItem(idx)} className="p-2 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  
                  <button onClick={handleAddItem} className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-dark transition-colors py-2 px-4 rounded-lg bg-primary/5 hover:bg-primary/10">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                </div>

                <div className="mt-8 border-t border-slate-200 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="order-2 md:order-1 flex flex-col justify-end">
                    <button onClick={handleSave} disabled={saving} className="w-full py-4 rounded-xl bg-primary text-white font-bold text-lg hover:bg-primary-light transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
                      <Save className="w-5 h-5" />
                      {saving ? 'Saving...' : 'Save Purchase Entry'}
                    </button>
                  </div>
                  
                  <div className="order-1 md:order-2 bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                    <div className="flex justify-between items-center text-sm font-bold text-slate-600">
                      <span>Net Subtotal</span>
                      <span>Rs. {formatAmount(netSubtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-extrabold text-slate-800 border-b border-slate-200 pb-4">
                      <span>Total</span>
                      <span>Rs. {formatAmount(total)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-slate-600">Amount Paid</label>
                      <input type="number" min="0" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                        className="w-32 px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-bold text-right focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm font-bold text-slate-600">Remaining Balance</span>
                      <span className={`text-lg font-extrabold ${remainingBalance > 0 ? 'text-danger' : 'text-success'}`}>
                        Rs. {formatAmount(remainingBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center gap-4">
                <h3 className="font-bold text-slate-800 hidden sm:block">Purchase History</h3>
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search invoice or vendor..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              
              <div className="divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>No purchases found.</p>
                  </div>
                ) : (
                  filteredHistory.map(p => (
                    <div key={p.id} className="p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md tracking-wider">
                              INV-{p.invoiceNumber.toString().padStart(3, '0')}
                            </span>
                            <span className="text-xs text-slate-400">{formatDisplayDate(p.purchaseDate)}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-lg mb-3">{p.vendorName}</h4>
                          
                          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 w-full max-w-lg shadow-sm">
                            {extractPurchaseItems(p).map((i, idx) => (
                              <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                <div>
                                  <span className="font-bold text-slate-700 capitalize inline-block w-16">{i.fuelType}</span>
                                  <span className="text-slate-500 text-xs">({i.quantity}L @ Rs. {formatAmount(i.unitCost)}/L)</span>
                                </div>
                                <span className="font-bold text-slate-700">Rs. {formatAmount(i.subtotal)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-2 mt-4 md:mt-0 pt-4 md:pt-0 border-t border-slate-100 md:border-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 hidden md:block">Grand Total</p>
                          <p className="font-extrabold text-xl text-slate-800">Rs. {formatAmount(p.total)}</p>
                          {p.remainingBalance > 0 ? (
                            <span className="text-xs font-bold bg-danger-bg text-danger-dark px-2 py-1 rounded-md mt-1">
                              Credit: Rs. {formatAmount(p.remainingBalance)} rem.
                            </span>
                          ) : (
                            <span className="text-xs font-bold bg-success-bg text-success-dark px-2 py-1 rounded-md flex items-center gap-1 mt-1">
                              ✓ Fully Paid
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-2.5">
                            <button
                              onClick={() => handleStartEditPurchase(p)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 border border-primary/20 transition-colors"
                              title="Edit petrol/diesel stock, prices, or payment"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setPurchaseToDelete(p)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 border border-danger/20 transition-colors"
                              title="Delete this purchase invoice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Purchase Modal */}
      <AnimatePresence>
        {editingPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !editSaving && setEditingPurchase(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 z-10"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Edit Purchase Invoice</h3>
                    <p className="text-xs text-slate-400">
                      INV-{editingPurchase.invoiceNumber.toString().padStart(3, '0')} &bull; Update stock liters & purchase prices
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => !editSaving && setEditingPurchase(null)} 
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Vendor *</label>
                    <select 
                      value={editVendorId} 
                      onChange={e => setEditVendorId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Purchase Date *</label>
                    <input 
                      type="date" 
                      value={editPurchaseDate} 
                      onChange={e => setEditPurchaseDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Purchase Items Editor (Petrol / Diesel Stock & Prices) */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-slate-700">Fuel Stock Items (Liters & Purchase Price)</label>
                    <button
                      type="button"
                      onClick={handleAddEditItem}
                      className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Fuel Type
                    </button>
                  </div>

                  <div className="space-y-3">
                    {editItems.map((item, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Item #{idx + 1}</span>
                          {editItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEditItem(idx)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors text-xs flex items-center gap-1 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Fuel Product</label>
                            <select
                              value={item.fuelType}
                              onChange={e => updateEditItem(idx, 'fuelType', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold capitalize focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="petrol">Petrol</option>
                              <option value="diesel">Diesel</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Purchase Stock (L)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={item.quantity === 0 && item.subtotal === 0 ? '' : item.quantity}
                              onChange={e => updateEditItem(idx, 'quantity', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Purchase Price (Rs./L)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={item.unitCost === 0 && item.subtotal === 0 ? '' : item.unitCost}
                              onChange={e => updateEditItem(idx, 'unitCost', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 text-xs">
                          <span className="text-slate-500">Item Subtotal:</span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            Rs. {formatAmount((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Options */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Payment Type</label>
                      <div className="flex bg-slate-200/80 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setEditPaymentType('Cash')}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${editPaymentType === 'Cash' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                        >
                          Cash (Full Payment)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditPaymentType('Credit')}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${editPaymentType === 'Credit' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                        >
                          Credit (Pay Later / Partial)
                        </button>
                      </div>
                    </div>

                    <div className="w-full sm:w-48">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Amount Paid (Rs.)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={editPaymentType === 'Cash' ? editTotal.toString() : '0.00'}
                        value={editAmountPaid}
                        onChange={e => setEditAmountPaid(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/60 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <p className="text-slate-400 font-bold uppercase text-[10px]">Total Bill</p>
                      <p className="font-extrabold text-slate-900 text-sm mt-0.5">Rs. {formatAmount(editTotal)}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <p className="text-emerald-600 font-bold uppercase text-[10px]">Amount Paid</p>
                      <p className="font-extrabold text-emerald-600 text-sm mt-0.5">Rs. {formatAmount(editPaid)}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <p className={`${editRemainingBalance > 0 ? 'text-rose-600' : 'text-slate-400'} font-bold uppercase text-[10px]`}>Credit Balance</p>
                      <p className={`font-extrabold text-sm mt-0.5 ${editRemainingBalance > 0 ? 'text-danger' : 'text-slate-500'}`}>
                        Rs. {formatAmount(editRemainingBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 text-blue-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Saving edits will automatically update tank stock levels, re-calculate the weighted average purchase prices, adjust vendor credit balances, and update cash calculations in Firebase.
                  </span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !editSaving && setEditingPurchase(null)}
                  disabled={editSaving}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveEditPurchase} disabled={editSaving}
                  className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {editSaving ? 'Updating & Recalculating...' : 'Save Changes & Recalculate'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Purchase Confirmation Modal */}
      <AnimatePresence>
        {purchaseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !deletingPurchase && setPurchaseToDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-danger" /> Delete Purchase
                </h3>
                <button onClick={() => !deletingPurchase && setPurchaseToDelete(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete purchase invoice <strong className="text-slate-900">INV-{purchaseToDelete.invoiceNumber.toString().padStart(3, '0')}</strong> from <strong className="text-slate-900">{purchaseToDelete.vendorName}</strong>?
                </p>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span className="font-semibold">{formatDisplayDate(purchaseToDelete.purchaseDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Bill:</span>
                    <span className="font-bold text-slate-900">Rs. {formatAmount(purchaseToDelete.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Paid:</span>
                    <span className="font-semibold text-emerald-600">Rs. {formatAmount(purchaseToDelete.amountPaid)}</span>
                  </div>
                  {purchaseToDelete.remainingBalance > 0 && (
                    <div className="flex justify-between">
                      <span>Remaining Credit:</span>
                      <span className="font-semibold text-danger">Rs. {formatAmount(purchaseToDelete.remainingBalance)}</span>
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Deleting this invoice will automatically revert purchased fuel stock, recompute weighted average purchase prices, adjust vendor credit balances, and recalculate Cash in Hand.</span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !deletingPurchase && setPurchaseToDelete(null)}
                  disabled={deletingPurchase}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeletePurchase} disabled={deletingPurchase}
                  className="flex-1 py-3 px-4 bg-danger text-white font-bold rounded-xl hover:bg-danger-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingPurchase ? 'Deleting & Recalculating...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
