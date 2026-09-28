import { doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { weightedAvgPrice } from './calculations';
import { FuelPrices } from '../types';

function getMillis(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (val.seconds) return val.seconds * 1000;
  return 0;
}

interface RecalculateEvent {
  id: string;
  type: 'purchase' | 'reading';
  dateTime: number;
  createdTime: number;
  items?: any[];
  petrolLastReading?: number;
  petrolClosingReading?: number;
  petrolSold?: number;
  petrolSalePrice?: number;
  dieselLastReading?: number;
  dieselClosingReading?: number;
  dieselSold?: number;
  dieselSalePrice?: number;
  [key: string]: any;
}

export async function recalculateDatabase() {
  try {
    // 0. Fetch current settings to preserve initial/baseline calibration
    const settingsSnap = await getDoc(getUserDoc('appSettings', 'fuelPrices'));
    const currentSettings = settingsSnap.exists() ? (settingsSnap.data() as FuelPrices) : null;

    // 1. Fetch all historical purchases
    const pSnap = await getDocs(getUserCollection('purchases'));
    const purchases: RecalculateEvent[] = pSnap.docs.map(d => {
      const data = d.data();
      const dateTime = getMillis(data.purchaseDate) || getMillis(data.createdAt);
      const createdTime = getMillis(data.createdAt) || dateTime;
      return {
        ...data,
        id: d.id,
        type: 'purchase',
        dateTime,
        createdTime
      };
    });
    
    // 2. Fetch all historical fuel sales (readings)
    const rSnap = await getDocs(getUserCollection('fuelReadings'));
    const readings: RecalculateEvent[] = rSnap.docs.map(d => {
      const data = d.data();
      const dateTime = getMillis(data.date) || getMillis(data.createdAt);
      const createdTime = getMillis(data.createdAt) || dateTime;
      return {
        ...data,
        id: d.id,
        type: 'reading',
        dateTime,
        createdTime
      };
    });
    
    // Combine and sort chronologically: primary by day/date, secondary by creation time
    const events: RecalculateEvent[] = [...purchases, ...readings].sort((a, b) => {
      if (a.dateTime !== b.dateTime) {
        return a.dateTime - b.dateTime;
      }
      return a.createdTime - b.createdTime;
    });
    
    let pStock = 0, pAvg = 0, dStock = 0, dAvg = 0;
    let baselinePReading = currentSettings?.initialPetrolReading ?? 0;
    let baselineDReading = currentSettings?.initialDieselReading ?? 0;
    let lastPReading = baselinePReading;
    let lastDReading = baselineDReading;
    let lastPSalePrice = currentSettings?.lastPetrolSalePrice;
    let lastDSalePrice = currentSettings?.lastDieselSalePrice;
    let hasReadings = false;
    
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
        if (!hasReadings) {
          // Earliest chronological reading
          if (currentSettings?.initialPetrolReading === undefined && ev.petrolLastReading !== undefined) {
            baselinePReading = Number(ev.petrolLastReading) || 0;
          }
          if (currentSettings?.initialDieselReading === undefined && ev.dieselLastReading !== undefined) {
            baselineDReading = Number(ev.dieselLastReading) || 0;
          }
          hasReadings = true;
        }

        const pSold = Number(ev.petrolSold) || 0;
        const dSold = Number(ev.dieselSold) || 0;
        pStock = Math.max(0, pStock - pSold);
        dStock = Math.max(0, dStock - dSold);
        
        // Track the latest closing reading
        if (ev.petrolClosingReading !== undefined && ev.petrolClosingReading !== null) {
          lastPReading = Number(ev.petrolClosingReading) || 0;
        }
        if (ev.dieselClosingReading !== undefined && ev.dieselClosingReading !== null) {
          lastDReading = Number(ev.dieselClosingReading) || 0;
        }
        if (ev.petrolSalePrice) {
          lastPSalePrice = Number(ev.petrolSalePrice) || 0;
        }
        if (ev.dieselSalePrice) {
          lastDSalePrice = Number(ev.dieselSalePrice) || 0;
        }
      }
    }

    if (!hasReadings) {
      // All readings deleted or none entered yet: revert to baseline/initial meter readings
      lastPReading = currentSettings?.initialPetrolReading ?? baselinePReading ?? 0;
      lastDReading = currentSettings?.initialDieselReading ?? baselineDReading ?? 0;
    }

    // 3. Save the correctly calculated values back to Firestore
    const updateData: any = {
      petrolStock: pStock,
      petrolAvgPurchasePrice: pAvg,
      petrolStockValue: pStock * pAvg,
      dieselStock: dStock,
      dieselAvgPurchasePrice: dAvg,
      dieselStockValue: dStock * dAvg,
      petrolCurrentReading: lastPReading,
      dieselCurrentReading: lastDReading,
    };

    if (currentSettings?.initialPetrolReading !== undefined) {
      updateData.initialPetrolReading = currentSettings.initialPetrolReading;
    } else if (baselinePReading > 0) {
      updateData.initialPetrolReading = baselinePReading;
    }

    if (currentSettings?.initialDieselReading !== undefined) {
      updateData.initialDieselReading = currentSettings.initialDieselReading;
    } else if (baselineDReading > 0) {
      updateData.initialDieselReading = baselineDReading;
    }

    if (lastPSalePrice !== undefined) {
      updateData.lastPetrolSalePrice = lastPSalePrice;
    }
    if (lastDSalePrice !== undefined) {
      updateData.lastDieselSalePrice = lastDSalePrice;
    }

    await setDoc(getUserDoc('appSettings', 'fuelPrices'), updateData, { merge: true });
    console.log('Database recalculated and synchronized successfully!');
  } catch (err) {
    console.error('Failed to recalculate database:', err);
  }
}

export async function recalculateVendor(vendorId: string) {
  if (!vendorId) return;
  try {
    const qPur = query(getUserCollection('purchases'), where('vendorId', '==', vendorId));
    const purSnap = await getDocs(qPur);
    let totalPurchases = 0;
    let totalPaidFromPurchases = 0;
    purSnap.forEach(d => {
      const data = d.data();
      totalPurchases += (Number(data.total) || 0);
      totalPaidFromPurchases += (Number(data.amountPaid) || 0);
    });

    const qPay = query(getUserCollection('vendorPayments'), where('vendorId', '==', vendorId));
    const paySnap = await getDocs(qPay);
    let manualPayments = 0;
    paySnap.forEach(d => {
      const data = d.data();
      manualPayments += (Number(data.amount) || 0);
    });

    const totalPaid = totalPaidFromPurchases + manualPayments;
    const vendorQarz = Math.max(0, totalPurchases - totalPaid);

    await setDoc(getUserDoc('vendors', vendorId), {
      totalPurchases,
      totalPaid,
      vendorQarz
    }, { merge: true });
  } catch (err) {
    console.error('Failed to recalculate vendor balances:', err);
  }
}
