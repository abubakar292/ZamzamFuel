import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, onSnapshot, query, orderBy, doc, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { Purchase, Vendor, PurchaseItem, FuelPrices } from '../types';
import { useToast } from '../components/Toast';
import { formatAmount, weightedAvgPrice } from '../utils/calculations';
import { Plus, Trash2, Save, History, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [search, setSearch] = useState('');
  
  // New Purchase Form
  const [vendorId, setVendorId] = useState('');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Credit');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<PurchaseItem[]>([{ fuelType: 'petrol', quantity: 0, unitCost: 0, subtotal: 0 }]);
  const [amountPaid, setAmountPaid] = useState('');
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const unsubV = onSnapshot(getUserCollection('vendors'), snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
    });
    
    const q = query(getUserCollection('purchases'), orderBy('createdAt', 'desc'));
    const unsubP = onSnapshot(q, snap => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase)));
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
      const pDate = new Date(purchaseDate);
      pDate.setHours(12, 0, 0);

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

  const filteredHistory = purchases.filter(p => 
    p.vendorName.toLowerCase().includes(search.toLowerCase()) || 
    p.invoiceNumber.toString().includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Purchases</h2>
        <div className="flex bg-white rounded-xl shadow-sm p-1">
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
                            <span className="text-xs text-slate-400">{p.purchaseDate?.toMillis ? format(p.purchaseDate.toDate(), 'dd MMM yyyy') : ''}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-lg mb-3">{p.vendorName}</h4>
                          
                          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 w-full max-w-lg shadow-sm">
                            {p.items.map((i, idx) => (
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
    </div>
  );
}
