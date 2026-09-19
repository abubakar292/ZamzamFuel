import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, Fuel, CreditCard, Wallet, Users, BarChart2, Plus, Edit3, X, Check, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { collection, doc, onSnapshot, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { FuelPrices } from '../types';
import CountUp from '../components/CountUp';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { recalculateDatabase } from '../utils/recalculate';
import { useToast } from '../components/Toast';
import { formatAmount } from '../utils/calculations';

export default function DashboardPage() {
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [vendorQarz, setVendorQarz] = useState(0);
  const [initialInvestment, setInitialInvestment] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalPurchasesPaid, setTotalPurchasesPaid] = useState(0);
  const [totalVendorPayments, setTotalVendorPayments] = useState(0);
  const [cashInHand, setCashInHand] = useState(0);
  const [loading, setLoading] = useState(true);

  // Investment Modal State
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [investmentInput, setInvestmentInput] = useState('');
  const [savingInvestment, setSavingInvestment] = useState(false);

  const { showToast } = useToast();

  // Auto-Fix Database Logic
  useEffect(() => {
    if (!fuelPrices) return;
    
    // Detect if data was corrupted by string concatenation (e.g. 95002500 Liters)
    const pStock = Number(fuelPrices.petrolStock) || 0;
    const dStock = Number(fuelPrices.dieselStock) || 0;
    
    if (pStock > 1000000 || dStock > 1000000) {
      console.log('Detected corrupted stock values, initiating auto-recalculation...');
      recalculateDatabase();
    }
  }, [fuelPrices]);

  useEffect(() => {
    const unsubFuel = onSnapshot(getUserDoc('appSettings', 'fuelPrices'), (doc) => {
      if (doc.exists()) {
        setFuelPrices(doc.data() as FuelPrices);
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

    const unsubVendors = onSnapshot(getUserCollection('vendors'), (snapshot) => {
      const qarz = snapshot.docs.reduce((acc, doc) => acc + (doc.data().vendorQarz || 0), 0);
      setVendorQarz(qarz);
    });

    const unsubProfile = onSnapshot(getUserDoc('appSettings', 'profile'), (doc) => {
      const inv = Number(doc.data()?.initialInvestment) || 0;
      setInitialInvestment(inv);
      updateCash(undefined, undefined, undefined, undefined, inv);
    });

    const unsubReadings = onSnapshot(getUserCollection('fuelReadings'), (snapshot) => {
      let sales = 0;
      snapshot.forEach(doc => sales += (doc.data().subtotal || 0));
      setTotalSales(sales);
      updateCash(sales, undefined, undefined, undefined, undefined);
    });

    const unsubExpenses = onSnapshot(getUserCollection('expenses'), (snapshot) => {
      let exp = 0;
      snapshot.forEach(doc => exp += (doc.data().amount || 0));
      setTotalExpenses(exp);
      updateCash(undefined, exp, undefined, undefined, undefined);
    });

    const unsubPayments = onSnapshot(getUserCollection('vendorPayments'), (snapshot) => {
      let pay = 0;
      snapshot.forEach(doc => pay += (doc.data().amount || 0));
      setTotalVendorPayments(pay);
      updateCash(undefined, undefined, pay, undefined, undefined);
    });

    const unsubPurchases = onSnapshot(getUserCollection('purchases'), (snapshot) => {
      let purchasePaid = 0;
      snapshot.forEach(doc => purchasePaid += (doc.data().amountPaid || 0));
      setTotalPurchasesPaid(purchasePaid);
      updateCash(undefined, undefined, undefined, purchasePaid, undefined);
    });

    let curSales = 0, curExp = 0, curPay = 0, curPurchasePaid = 0, curInv = 0;
    function updateCash(s?: number, e?: number, p?: number, pp?: number, inv?: number) {
      if (s !== undefined) curSales = s;
      if (e !== undefined) curExp = e;
      if (p !== undefined) curPay = p;
      if (pp !== undefined) curPurchasePaid = pp;
      if (inv !== undefined) curInv = inv;
      // Formula: Initial Investment + Total Sales - Expenses - Fuel Purchases Paid - Vendor Payments Paid
      setCashInHand(curInv + curSales - curExp - curPurchasePaid - curPay);
      setLoading(false);
    }

    return () => {
      unsubFuel();
      unsubVendors();
      unsubProfile();
      unsubReadings();
      unsubExpenses();
      unsubPayments();
      unsubPurchases();
    };
  }, []);

  const openInvestmentModal = () => {
    setInvestmentInput(initialInvestment > 0 ? initialInvestment.toString() : '');
    setIsCashModalOpen(true);
  };

  const handleSaveInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(investmentInput);
    if (isNaN(amount) || amount < 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    setSavingInvestment(true);
    try {
      await setDoc(getUserDoc('appSettings', 'profile'), {
        initialInvestment: amount
      }, { merge: true });

      showToast('Starting investment updated successfully!', 'success');
      setIsCashModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to save investment', 'error');
    } finally {
      setSavingInvestment(false);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const cards = [
    {
      id: 'petrol',
      title: 'PETROL STOCK',
      icon: Droplets,
      color: 'bg-petrol/10 text-petrol',
      mainVal: fuelPrices?.petrolStock || 0,
      subVal: fuelPrices?.petrolStockValue || 0,
      subValLabel: 'Rs.',
      isLiters: true,
      delay: 0,
      isActionable: false
    },
    {
      id: 'diesel',
      title: 'DIESEL STOCK',
      icon: Fuel,
      color: 'bg-diesel/10 text-diesel',
      mainVal: fuelPrices?.dieselStock || 0,
      subVal: fuelPrices?.dieselStockValue || 0,
      subValLabel: 'Rs.',
      isLiters: true,
      delay: 0.1,
      isActionable: false
    },
    {
      id: 'qarz',
      title: 'VENDOR QARZ',
      icon: CreditCard,
      color: 'bg-danger/10 text-danger',
      mainVal: vendorQarz,
      subVal: null,
      subValLabel: '',
      isLiters: false,
      delay: 0.2,
      isActionable: false
    },
    {
      id: 'cash',
      title: 'CASH IN HAND',
      icon: Wallet,
      color: 'bg-success/10 text-success',
      mainVal: cashInHand,
      subVal: initialInvestment,
      subValLabel: initialInvestment > 0 ? 'Invest: Rs.' : '+ Set Investment',
      isLiters: false,
      delay: 0.3,
      isActionable: true,
      action: openInvestmentModal
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{greeting()}</h2>
          <p className="text-slate-500">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
        </div>
      </motion.div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {cards.map((card) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: card.delay }}
            whileHover={{ y: -4 }}
            onClick={card.isActionable ? card.action : undefined}
            className={`bg-white rounded-2xl p-5 shadow-card hover:shadow-card-lg transition-all relative ${
              card.isActionable ? 'cursor-pointer ring-1 ring-slate-100 hover:ring-success/30 group' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.title}</h3>
              </div>

              {card.isActionable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    card.action?.();
                  }}
                  title="Add or Edit Initial Investment"
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-success/10 text-slate-400 hover:text-success transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            <div className="space-y-1 overflow-hidden">
              <div className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight truncate">
                {!card.isLiters && <span className="text-sm text-slate-400 font-medium mr-1">Rs.</span>}
                <CountUp end={card.mainVal} isCurrency={!card.isLiters} />
                {card.isLiters && <span className="text-sm text-slate-400 font-medium ml-1">L</span>}
              </div>
              
              {card.id === 'cash' ? (
                <div className="text-xs font-semibold text-slate-500 group-hover:text-success transition-colors flex items-center gap-1 truncate pt-0.5">
                  {initialInvestment > 0 ? (
                    <>
                      <span className="text-slate-400">Capital:</span>
                      <span className="font-bold text-slate-700">Rs. {formatAmount(initialInvestment)}</span>
                    </>
                  ) : (
                    <span className="text-primary font-medium flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> Add Starting Capital
                    </span>
                  )}
                </div>
              ) : card.subVal !== null ? (
                <div className="text-sm font-medium text-slate-400 truncate">
                  Rs. <CountUp end={card.subVal} isCurrency={true} />
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-400 opacity-0">Spacer</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Investment / Cash in Hand Modal */}
      <AnimatePresence>
        {isCashModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Cash in Hand & Investment</h3>
                    <p className="text-xs text-slate-500">Manage your starting capital & track cash flow</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCashModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSaveInvestment} className="p-6 space-y-6">
                {/* Starting Capital Input */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Starting Investment / Capital (Rs.)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <span className="text-slate-400 font-semibold text-sm">Rs.</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={investmentInput}
                      onChange={(e) => setInvestmentInput(e.target.value)}
                      placeholder="e.g. 2000000"
                      className="pl-11 w-full text-lg font-bold rounded-xl border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-success focus:ring-2 focus:ring-success/20 transition-all py-3 shadow-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Initial money invested into the station. For example, if you start with Rs. 2,000,000 and purchase Rs. 1,000,000 petrol/diesel, remaining Cash in Hand will be Rs. 1,000,000.
                  </p>
                </div>

                {/* Real-time Accounting Breakdown */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-500 pb-1 border-b border-slate-200">
                    <span>Cash Flow Summary</span>
                    <span>Amount (Rs.)</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Starting Investment:
                    </span>
                    <span className="font-semibold text-emerald-600">
                      + Rs. {formatAmount(parseFloat(investmentInput) || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Total Fuel Sales:
                    </span>
                    <span className="font-semibold text-emerald-600">
                      + Rs. {formatAmount(totalSales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Fuel Purchases Paid (Cash):
                    </span>
                    <span className="font-semibold text-rose-600">
                      - Rs. {formatAmount(totalPurchasesPaid)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Vendor Credit Payments:
                    </span>
                    <span className="font-semibold text-rose-600">
                      - Rs. {formatAmount(totalVendorPayments)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Station Expenses:
                    </span>
                    <span className="font-semibold text-rose-600">
                      - Rs. {formatAmount(totalExpenses)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-sm text-slate-800">
                    <span>Calculated Cash in Hand:</span>
                    <span className="text-success text-base">
                      Rs. {formatAmount(
                        (parseFloat(investmentInput) || 0) + totalSales - totalExpenses - totalPurchasesPaid - totalVendorPayments
                      )}
                    </span>
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCashModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingInvestment}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-success text-white font-bold text-sm hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                  >
                    {savingInvestment ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {savingInvestment ? 'Saving...' : 'Save Investment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shortcuts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Link to="/vendors" className="bg-white p-6 rounded-2xl shadow-card hover:shadow-card-lg transition-all flex items-center gap-4 group">
          <div className="w-14 h-14 rounded-2xl bg-primary/5 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Vendors List</h3>
            <p className="text-sm text-slate-500">Manage accounts & payments</p>
          </div>
        </Link>
        <Link to="/reports" className="bg-white p-6 rounded-2xl shadow-card hover:shadow-card-lg transition-all flex items-center gap-4 group">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors flex items-center justify-center">
            <BarChart2 className="w-7 h-7 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Sales Report</h3>
            <p className="text-sm text-slate-500">Generate PDF statements</p>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
