import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshot, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getUserCollection, getUserDoc } from '../lib/firebase';
import { Vendor, Purchase, VendorPayment } from '../types';
import { useToast } from '../components/Toast';
import { formatAmount } from '../utils/calculations';
import { parseDateInput, getTodayDateString, formatDisplayDate } from '../utils/dateUtils';
import { recalculateVendor, getMillis } from '../utils/recalculate';
import { ArrowLeft, CreditCard, ArrowDownRight, ArrowUpRight, Plus, X, Trash2, Fuel } from 'lucide-react';

type LedgerItem = {
  id: string;
  originalId?: string;
  type: 'purchase' | 'payment';
  date: any;
  amount: number;
  label: string;
  runningBalance?: number;
};

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [rawPurchases, setRawPurchases] = useState<Purchase[]>([]);
  const [rawPayments, setRawPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pay Modal
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => getTodayDateString());
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;

    // Recalculate vendor on mount to guarantee fresh numbers
    recalculateVendor(id).catch(err => console.error('Failed to sync vendor on mount:', err));

    // Vendor listener
    const unsubVendor = onSnapshot(getUserDoc('vendors', id), (docSnap) => {
      if (docSnap.exists()) {
        const vData = { id: docSnap.id, ...docSnap.data() } as Vendor;
        setVendor(vData);
      } else {
        showToast('Vendor not found', 'error');
        navigate('/vendors');
      }
    });

    // Purchases listener
    const unsubPurchases = onSnapshot(getUserCollection('purchases'), (snapshot) => {
      setRawPurchases(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Purchase)));
    });

    // Payments listener
    const unsubPayments = onSnapshot(getUserCollection('vendorPayments'), (snapshot) => {
      setRawPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VendorPayment)));
      setLoading(false);
    });

    return () => {
      unsubVendor();
      unsubPurchases();
      unsubPayments();
    };
  }, [id, navigate, showToast]);

  // Reactive matching by ID or Name
  const purchases = useMemo(() => {
    if (!id) return [];
    const vName = (vendor?.name || '').trim().toLowerCase();
    return rawPurchases.filter(p => {
      const pVendorId = (p as any).vendorId || (p as any).vendor_id;
      const pVendorName = ((p as any).vendorName || (p as any).vendor || '').trim().toLowerCase();
      return pVendorId === id || (vName && pVendorName && pVendorName === vName);
    });
  }, [rawPurchases, id, vendor]);

  const payments = useMemo(() => {
    if (!id) return [];
    const vName = (vendor?.name || '').trim().toLowerCase();
    return rawPayments.filter(p => {
      const pVendorId = (p as any).vendorId || (p as any).vendor_id;
      const pVendorName = ((p as any).vendorName || (p as any).vendor || '').trim().toLowerCase();
      return pVendorId === id || (vName && pVendorName && pVendorName === vName);
    });
  }, [rawPayments, id, vendor]);

  // Compute real-time totals from transactions to guarantee 100% accuracy
  const liveTotalPurchases = useMemo(() => {
    return purchases.reduce((acc, p) => acc + (Number(p.total ?? p.netSubtotal) || 0), 0);
  }, [purchases]);

  const liveTotalPaid = useMemo(() => {
    const fromPurchases = purchases.reduce((acc, p) => {
      const pTotal = Number(p.total ?? p.netSubtotal) || 0;
      const pType = (p.paymentType || '').toString().toLowerCase();
      const isCredit = pType.includes('credit');

      if (isCredit) {
        // CREDIT: Check if there was an actual partial down payment strictly less than pTotal
        const storedRem = Number(p.remainingBalance);
        const storedPaid = Number(p.amountPaid);
        if (!isNaN(storedRem) && storedRem > 0 && storedRem < pTotal) {
          return acc + Math.max(0, pTotal - storedRem);
        } else if (!isNaN(storedPaid) && storedPaid > 0 && storedPaid < pTotal) {
          return acc + storedPaid;
        }
        return acc; // 100% full credit -> 0 paid down
      } else {
        // CASH:
        if (p.amountPaid !== undefined && p.amountPaid !== null && p.amountPaid !== '') {
          return acc + (Number(p.amountPaid) || 0);
        }
        return acc + pTotal;
      }
    }, 0);
    const fromPayments = payments.reduce((acc, pay) => acc + (Number(pay.amount) || 0), 0);
    return fromPurchases + fromPayments;
  }, [purchases, payments]);

  const liveVendorQarz = Math.max(0, liveTotalPurchases - liveTotalPaid);

  const ledgerItems = useMemo(() => {
    const items: LedgerItem[] = [];
    
    purchases.forEach(p => {
      const pTotal = Number(p.total ?? p.netSubtotal) || 0;
      const pType = (p.paymentType || '').toString().toLowerCase();
      const isCredit = pType.includes('credit');
      
      let pPaid = 0;
      if (isCredit) {
        const storedRem = Number(p.remainingBalance);
        const storedPaid = Number(p.amountPaid);
        if (!isNaN(storedRem) && storedRem > 0 && storedRem < pTotal) {
          pPaid = Math.max(0, pTotal - storedRem);
        } else if (!isNaN(storedPaid) && storedPaid > 0 && storedPaid < pTotal) {
          pPaid = storedPaid;
        } else {
          pPaid = 0;
        }
      } else {
        if (p.amountPaid !== undefined && p.amountPaid !== null && p.amountPaid !== '') {
          pPaid = Number(p.amountPaid) || 0;
        } else {
          pPaid = pTotal;
        }
      }

      items.push({
        id: `pur_${p.id}`,
        originalId: p.id,
        type: 'purchase',
        date: p.purchaseDate || p.createdAt,
        amount: pTotal,
        label: `Purchase INV-${(p.invoiceNumber ?? 0).toString().padStart(3, '0')} (${isCredit ? 'Credit' : 'Cash'})`
      });

      // Only add initial payment entry if an actual partial down payment was made
      if (pPaid > 0) {
        items.push({
          id: `pur_pay_${p.id}`,
          originalId: p.id,
          type: 'payment',
          date: p.purchaseDate || p.createdAt,
          amount: pPaid,
          label: isCredit 
            ? `Partial advance for INV-${(p.invoiceNumber ?? 0).toString().padStart(3, '0')}`
            : `Cash payment for INV-${(p.invoiceNumber ?? 0).toString().padStart(3, '0')}`
        });
      }
    });
    
    payments.forEach(p => {
      items.push({
        id: `pay_${p.id}`,
        originalId: p.id,
        type: 'payment',
        date: p.paymentDate || p.createdAt,
        amount: Number(p.amount) || 0,
        label: p.notes ? `Payment: ${p.notes}` : 'Payment made'
      });
    });

    // Sort oldest first using getMillis to correctly compute running balance
    items.sort((a, b) => {
      return getMillis(a.date) - getMillis(b.date);
    });

    let balance = 0;
    items.forEach(item => {
      if (item.type === 'purchase') balance += item.amount;
      else balance -= item.amount;
      item.runningBalance = balance;
    });

    // Return newest first for display
    return items.reverse();
  }, [purchases, payments]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor || !payAmount) return;
    
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter valid amount', 'warning');
      return;
    }

    setPaying(true);
    try {
      const paymentDate = parseDateInput(payDate);
      const now = new Date();
      paymentDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      await addDoc(getUserCollection('vendorPayments'), {
        vendorId: vendor.id,
        vendorName: vendor.name,
        amount,
        paymentDate: paymentDate,
        notes: payNotes,
        createdAt: serverTimestamp()
      });

      // Recalculate vendor balances accurately
      await recalculateVendor(vendor.id!);

      showToast('Payment recorded successfully', 'success');
      setIsPayOpen(false);
      setPayAmount(''); setPayNotes('');
    } catch (error) {
      showToast('Failed to record payment', 'error');
    } finally {
      setPaying(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!vendor?.id || !paymentId) return;
    try {
      await deleteDoc(getUserDoc('vendorPayments', paymentId));
      await recalculateVendor(vendor.id);
      showToast('Payment deleted & vendor balance recalculated', 'success');
    } catch (err) {
      console.error('Failed to delete payment:', err);
      showToast('Failed to delete payment', 'error');
    }
  };

  if (loading || !vendor) {
    return <div className="p-8 text-center text-slate-500">Loading vendor data...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/vendors" className="p-2 bg-white rounded-xl shadow-sm text-slate-500 hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{vendor.name}</h2>
            <p className="text-sm text-slate-500">{vendor.phone || 'No phone'}</p>
          </div>
        </div>

        <Link
          to="/purchases"
          className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:text-primary rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
        >
          <Fuel className="w-4 h-4 text-primary" />
          <span>New Fuel Purchase</span>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-card border border-slate-100 min-w-0" title={`Rs. ${formatAmount(liveTotalPurchases)}`}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 truncate">Total Purchases</p>
          <p className="text-lg sm:text-xl font-black text-slate-800 tabular-nums truncate">Rs. {formatAmount(liveTotalPurchases)}</p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-card border border-slate-100 min-w-0" title={`Rs. ${formatAmount(liveTotalPaid)}`}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 truncate">Total Paid</p>
          <p className="text-lg sm:text-xl font-black text-success tabular-nums truncate">Rs. {formatAmount(liveTotalPaid)}</p>
        </div>
        <div className={`p-4 sm:p-5 rounded-2xl shadow-card border min-w-0 ${liveVendorQarz > 0 ? 'bg-danger-bg border-danger/20' : 'bg-success-bg border-success/20'}`} title={`Rs. ${formatAmount(liveVendorQarz)}`}>
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 truncate ${liveVendorQarz > 0 ? 'text-danger/70' : 'text-success/70'}`}>
                Balance (Qarz)
              </p>
              <p className={`text-lg sm:text-xl font-black tabular-nums truncate ${liveVendorQarz > 0 ? 'text-danger' : 'text-success'}`}>
                {liveVendorQarz > 0 ? `Rs. ${formatAmount(liveVendorQarz)}` : 'Cleared ✓'}
              </p>
            </div>
            {liveVendorQarz > 0 && (
              <button 
                onClick={() => setIsPayOpen(true)}
                className="bg-danger text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold hover:bg-danger/90 transition-colors shadow-sm shrink-0"
              >
                Pay Now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Vendor Ledger / Transaction History</h3>
            <p className="text-xs text-slate-400">All credit purchases, down payments, and repayments</p>
          </div>
          {liveVendorQarz > 0 && (
            <button
              onClick={() => setIsPayOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {ledgerItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No transactions yet.</div>
          ) : (
            ledgerItems.map(item => (
              <div key={item.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50 transition-colors gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className={`w-9 sm:w-10 h-9 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.type === 'purchase' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                  }`}>
                    {item.type === 'purchase' ? <ArrowUpRight className="w-4 sm:w-5 h-4 sm:h-5" /> : <ArrowDownRight className="w-4 sm:w-5 h-4 sm:h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm sm:text-base truncate">{item.label}</p>
                    <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                      {formatDisplayDate(item.date, 'dd MMM yyyy, hh:mm a')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`font-black text-sm sm:text-base tabular-nums ${item.type === 'purchase' ? 'text-danger' : 'text-success'}`}>
                      {item.type === 'purchase' ? '+' : '-'}Rs. {formatAmount(item.amount)}
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold tabular-nums">Bal: Rs. {formatAmount(item.runningBalance || 0)}</p>
                  </div>
                  {item.type === 'payment' && item.originalId && !item.id.startsWith('pur_pay_') && (
                    <button
                      onClick={() => item.originalId && handleDeletePayment(item.originalId)}
                      className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="Delete payment entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pay Modal */}
      <AnimatePresence>
        {isPayOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsPayOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
            />
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl shadow-card-lg w-full max-w-sm pointer-events-auto overflow-hidden"
              >
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-slate-800">Pay Vendor (Repayment)</h3>
                  </div>
                  <button onClick={() => setIsPayOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <form onSubmit={handlePayment} className="p-4 space-y-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                    <p className="text-slate-500 font-medium">Current Payable Qarz:</p>
                    <p className="text-base font-black text-danger tabular-nums mt-0.5">Rs. {formatAmount(liveVendorQarz)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Payment Amount (Rs.) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      max={liveVendorQarz}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold tabular-nums focus:ring-2 focus:ring-primary/20"
                      placeholder={`Max: ${liveVendorQarz}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Payment Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={payDate}
                      onChange={e => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Notes / Reference (Optional)
                    </label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20"
                      placeholder="e.g. Bank transfer, Cash by Ali"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={paying}
                      className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
                    >
                      {paying ? 'Recording...' : 'Confirm Repayment'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
