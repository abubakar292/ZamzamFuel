import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, collection, onSnapshot, query, where, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { Vendor, Purchase, VendorPayment } from '../types';
import { useToast } from '../components/Toast';
import { formatAmount } from '../utils/calculations';
import { format } from 'date-fns';
import { ArrowLeft, CreditCard, ArrowDownRight, ArrowUpRight, Plus, X } from 'lucide-react';

type LedgerItem = {
  id: string;
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
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pay Modal
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    // Vendor listener
    const unsubVendor = onSnapshot(getUserDoc('vendors', id), (docSnap) => {
      if (docSnap.exists()) {
        setVendor({ id: docSnap.id, ...docSnap.data() } as Vendor);
      } else {
        showToast('Vendor not found', 'error');
        navigate('/vendors');
      }
    });

    // Purchases listener
    const qPurchases = query(getUserCollection('purchases'), where('vendorId', '==', id));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchases(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Purchase)));
    });

    // Payments listener
    const qPayments = query(getUserCollection('vendorPayments'), where('vendorId', '==', id));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      setPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VendorPayment)));
      setLoading(false);
    });

    return () => {
      unsubVendor();
      unsubPurchases();
      unsubPayments();
    };
  }, [id, navigate, showToast]);

  const ledgerItems = useMemo(() => {
    const items: LedgerItem[] = [];
    
    purchases.forEach(p => {
      items.push({
        id: `pur_${p.id}`,
        type: 'purchase',
        date: p.purchaseDate,
        amount: p.total,
        label: `Purchase INV-${p.invoiceNumber.toString().padStart(3, '0')}`
      });
      // Also add initial payment if any
      if (p.amountPaid > 0) {
        items.push({
          id: `pur_pay_${p.id}`,
          type: 'payment',
          date: p.purchaseDate,
          amount: p.amountPaid,
          label: `Down payment for INV-${p.invoiceNumber.toString().padStart(3, '0')}`
        });
      }
    });
    
    payments.forEach(p => {
      items.push({
        id: `pay_${p.id}`,
        type: 'payment',
        date: p.paymentDate,
        amount: p.amount,
        label: p.notes || 'Payment made'
      });
    });

    // Sort oldest first to calculate running balance
    items.sort((a, b) => {
      const timeA = a.date?.toMillis ? a.date.toMillis() : 0;
      const timeB = b.date?.toMillis ? b.date.toMillis() : 0;
      return timeA - timeB;
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
      const paymentDate = new Date(payDate);
      paymentDate.setHours(new Date().getHours(), new Date().getMinutes());

      await addDoc(getUserCollection('vendorPayments'), {
        vendorId: vendor.id,
        vendorName: vendor.name,
        amount,
        paymentDate: paymentDate, // Using native Date, firebase will convert
        notes: payNotes,
        createdAt: serverTimestamp()
      });

      // Update vendor totals
      const vendorRef = getUserDoc('vendors', vendor.id!);
      await updateDoc(vendorRef, {
        totalPaid: vendor.totalPaid + amount,
        vendorQarz: Math.max(0, vendor.vendorQarz - amount)
      });

      showToast('Payment recorded successfully', 'success');
      setIsPayOpen(false);
      setPayAmount(''); setPayNotes('');
    } catch (error) {
      showToast('Failed to record payment', 'error');
    } finally {
      setPaying(false);
    }
  };

  if (loading || !vendor) {
    return <div className="p-8 text-center text-slate-500">Loading vendor data...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/vendors" className="p-2 bg-white rounded-xl shadow-sm text-slate-500 hover:text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{vendor.name}</h2>
          <p className="text-sm text-slate-500">{vendor.phone || 'No phone'}</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-card border border-slate-100">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Total Purchases</p>
          <p className="text-xl font-bold text-slate-800">Rs. {formatAmount(vendor.totalPurchases)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-card border border-slate-100">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Total Paid</p>
          <p className="text-xl font-bold text-success">Rs. {formatAmount(vendor.totalPaid)}</p>
        </div>
        <div className={`p-5 rounded-2xl shadow-card border ${vendor.vendorQarz > 0 ? 'bg-danger-bg border-danger/20' : 'bg-success-bg border-success/20'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${vendor.vendorQarz > 0 ? 'text-danger/70' : 'text-success/70'}`}>
                Balance (Qarz)
              </p>
              <p className={`text-xl font-bold ${vendor.vendorQarz > 0 ? 'text-danger' : 'text-success'}`}>
                Rs. {formatAmount(vendor.vendorQarz)}
              </p>
            </div>
            {vendor.vendorQarz > 0 && (
              <button 
                onClick={() => setIsPayOpen(true)}
                className="bg-danger text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-danger/90 transition-colors shadow-sm"
              >
                Pay Now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Transaction History</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {ledgerItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No transactions yet.</div>
          ) : (
            ledgerItems.map(item => (
              <div key={item.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.type === 'purchase' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                  }`}>
                    {item.type === 'purchase' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm sm:text-base">{item.label}</p>
                    <p className="text-xs text-slate-400">
                      {item.date?.toMillis ? format(item.date.toDate(), 'dd MMM yyyy, hh:mm a') : 'Unknown date'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${item.type === 'purchase' ? 'text-danger' : 'text-success'}`}>
                    {item.type === 'purchase' ? '+' : '-'}Rs. {formatAmount(item.amount)}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">Bal: Rs. {formatAmount(item.runningBalance || 0)}</p>
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
                  <h3 className="text-lg font-bold text-slate-800">Record Payment</h3>
                  <button onClick={() => setIsPayOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handlePayment} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (Rs.) *</label>
                    <input type="number" step="0.01" required value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      max={vendor.vendorQarz}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-success/20 focus:border-success transition-all"
                      placeholder={`Max: ${vendor.vendorQarz}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                    <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-success/20 focus:border-success transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
                    <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-success/20 focus:border-success transition-all"
                      placeholder="e.g. Bank transfer, Cash"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <button type="submit" disabled={paying}
                      className="w-full py-3 rounded-xl bg-success text-white font-medium hover:bg-success-dark focus:ring-2 focus:ring-success/50 transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-sm"
                    >
                      <CreditCard className="w-4 h-4" />
                      {paying ? 'Recording...' : 'Record Payment'}
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
