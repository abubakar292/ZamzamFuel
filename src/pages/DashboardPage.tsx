import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Fuel, CreditCard, Wallet, Users, BarChart2 } from 'lucide-react';
import { collection, doc, onSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { FuelPrices } from '../types';
import CountUp from '../components/CountUp';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { recalculateDatabase } from '../utils/recalculate';

export default function DashboardPage() {
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [vendorQarz, setVendorQarz] = useState(0);
  const [cashInHand, setCashInHand] = useState(0);
  const [loading, setLoading] = useState(true);

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

    const unsubReadings = onSnapshot(getUserCollection('fuelReadings'), (snapshot) => {
      let totalSales = 0;
      snapshot.forEach(doc => totalSales += (doc.data().subtotal || 0));
      updateCash(totalSales, undefined, undefined);
    });

    const unsubExpenses = onSnapshot(getUserCollection('expenses'), (snapshot) => {
      let totalExp = 0;
      snapshot.forEach(doc => totalExp += (doc.data().amount || 0));
      updateCash(undefined, totalExp, undefined);
    });

    const unsubPayments = onSnapshot(getUserCollection('vendorPayments'), (snapshot) => {
      let totalPay = 0;
      snapshot.forEach(doc => totalPay += (doc.data().amount || 0));
      updateCash(undefined, undefined, totalPay, undefined);
    });

    const unsubPurchases = onSnapshot(getUserCollection('purchases'), (snapshot) => {
      let totalPurchasePaid = 0;
      snapshot.forEach(doc => totalPurchasePaid += (doc.data().amountPaid || 0));
      updateCash(undefined, undefined, undefined, totalPurchasePaid);
    });

    let currentSales = 0, currentExp = 0, currentPay = 0, currentPurchasePaid = 0;
    function updateCash(s?: number, e?: number, p?: number, pp?: number) {
      if (s !== undefined) currentSales = s;
      if (e !== undefined) currentExp = e;
      if (p !== undefined) currentPay = p;
      if (pp !== undefined) currentPurchasePaid = pp;
      setCashInHand(currentSales - currentExp);
      setLoading(false); // mark loaded once we have some data
    }

    return () => {
      unsubFuel();
      unsubVendors();
      unsubReadings();
      unsubExpenses();
      unsubPayments();
      unsubPurchases();
    };
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const cards = [
    {
      title: 'PETROL STOCK',
      icon: Droplets,
      color: 'bg-petrol/10 text-petrol',
      mainVal: fuelPrices?.petrolStock || 0,
      subVal: fuelPrices?.petrolStockValue || 0,
      isLiters: true,
      delay: 0
    },
    {
      title: 'DIESEL STOCK',
      icon: Fuel,
      color: 'bg-diesel/10 text-diesel',
      mainVal: fuelPrices?.dieselStock || 0,
      subVal: fuelPrices?.dieselStockValue || 0,
      isLiters: true,
      delay: 0.1
    },
    {
      title: 'VENDOR QARZ',
      icon: CreditCard,
      color: 'bg-danger/10 text-danger',
      mainVal: vendorQarz,
      subVal: null,
      isLiters: false,
      delay: 0.2
    },
    {
      title: 'CASH IN HAND',
      icon: Wallet,
      color: 'bg-success/10 text-success',
      mainVal: cashInHand,
      subVal: null,
      isLiters: false,
      delay: 0.3
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
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: card.delay }}
            whileHover={{ y: -4 }}
            className="bg-white rounded-2xl p-5 shadow-card hover:shadow-card-lg transition-all"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.title}</h3>
            </div>
            
            <div className="space-y-1 overflow-hidden">
              <div className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight truncate">
                {!card.isLiters && <span className="text-sm text-slate-400 font-medium mr-1">Rs.</span>}
                <CountUp end={card.mainVal} isCurrency={!card.isLiters} />
                {card.isLiters && <span className="text-sm text-slate-400 font-medium ml-1">L</span>}
              </div>
              
              {card.subVal !== null && (
                <div className="text-sm font-medium text-slate-400 truncate">
                  Rs. <CountUp end={card.subVal} isCurrency={true} />
                </div>
              )}
              {card.subVal === null && (
                <div className="text-sm font-medium text-slate-400 opacity-0">Spacer</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

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
