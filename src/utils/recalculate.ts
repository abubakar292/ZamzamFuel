import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { weightedAvgPrice } from './calculations';

export async function recalculateDatabase() {
  try {
    // 1. Fetch all historical purchases
    const pSnap = await getDocs(getUserCollection('purchases'));
    const purchases = pSnap.docs.map(d => ({ ...d.data(), type: 'purchase', time: d.data().createdAt?.toMillis() || 0 }));
    
    // 2. Fetch all historical fuel sales (readings)
    const rSnap = await getDocs(getUserCollection('fuelReadings'));
    const readings = rSnap.docs.map(d => ({ ...d.data(), type: 'reading', time: d.data().date?.toMillis() || 0 }));
    
    // Combine and sort chronologically
    const events: any[] = [...purchases, ...readings].sort((a, b) => a.time - b.time);
    
    let pStock = 0, pAvg = 0, dStock = 0, dAvg = 0;
    let lastPReading = 0, lastDReading = 0;
    
    for (const ev of events) {
      if (ev.type === 'purchase') {
         (ev.items || []).forEach((item: any) => {
            const qty = Number(item.quantity) || 0;
            const cost = Number(item.unitCost) || 0;
            if (item.fuelType === 'petrol') {
               pAvg = weightedAvgPrice(pStock, pAvg, qty, cost);
               pStock += qty;
            } else {
               dAvg = weightedAvgPrice(dStock, dAvg, qty, cost);
               dStock += qty;
            }
         });
      } else if (ev.type === 'reading') {
         const pSold = Number(ev.petrolSold) || 0;
         const dSold = Number(ev.dieselSold) || 0;
         pStock = Math.max(0, pStock - pSold);
         dStock = Math.max(0, dStock - dSold);
         
         // track the latest reading
         if (Number(ev.petrolClosingReading)) lastPReading = Number(ev.petrolClosingReading);
         if (Number(ev.dieselClosingReading)) lastDReading = Number(ev.dieselClosingReading);
      }
    }

    // 3. Save the correctly calculated values back to Firestore
    const updateData: any = {
       petrolStock: pStock,
       petrolAvgPurchasePrice: pAvg,
       petrolStockValue: pStock * pAvg,
       dieselStock: dStock,
       dieselAvgPurchasePrice: dAvg,
       dieselStockValue: dStock * dAvg
    };
    if (lastPReading > 0) updateData.petrolCurrentReading = lastPReading;
    if (lastDReading > 0) updateData.dieselCurrentReading = lastDReading;

    await setDoc(getUserDoc('appSettings', 'fuelPrices'), updateData, { merge: true });
    console.log('Database auto-fixed successfully!');
  } catch (err) {
    console.error('Failed to auto-fix database:', err);
  }
}
