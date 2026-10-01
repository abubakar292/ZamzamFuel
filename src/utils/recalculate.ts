import { doc, getDoc, getDocs, setDoc, query, where, writeBatch } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { weightedAvgPrice } from './calculations';
import { FuelPrices } from '../types';

export function getMillis(val: any): number {
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

/**
 * Universal extractor for purchase fuel items from any Firestore schema format
 * (e.g. array of items, object map of items, or legacy top-level petrol/diesel stock fields).
 */
export function extractPurchaseItems(data: any): { fuelType: 'petrol' | 'diesel'; quantity: number; unitCost: number; subtotal: number }[] {
  if (!data) return [];
  let rawItems: any[] = [];
  if (Array.isArray(data.items)) {
    rawItems = data.items;
  } else if (data.items && typeof data.items === 'object') {
    rawItems = Object.values(data.items);
  }
  
  const result: { fuelType: 'petrol' | 'diesel'; quantity: number; unitCost: number; subtotal: number }[] = [];
  if (rawItems.length > 0) {
    rawItems.forEach((item: any) => {
      if (!item) return;
      const fType = (item.fuelType || item.type || item.product || '').toString().toLowerCase();
      const qty = Number(item.quantity ?? item.qty ?? item.liters) || 0;
      const cost = Number(item.unitCost ?? item.cost ?? item.price ?? item.rate) || 0;
      if (qty > 0) {
        result.push({
          fuelType: fType.includes('diesel') ? 'diesel' : 'petrol',
          quantity: qty,
          unitCost: cost,
          subtotal: qty * cost
        });
      }
    });
  }
  
  // If items array was empty or missing, check top-level fields
  if (result.length === 0) {
    const pQty = Number(data.petrolQuantity ?? data.petrolStock ?? data.petrolLiters) || 0;
    const pCost = Number(data.petrolPrice ?? data.petrolUnitCost ?? data.petrolRate) || 0;
    if (pQty > 0) {
      result.push({ fuelType: 'petrol', quantity: pQty, unitCost: pCost, subtotal: pQty * pCost });
    }
    const dQty = Number(data.dieselQuantity ?? data.dieselStock ?? data.dieselLiters) || 0;
    const dCost = Number(data.dieselPrice ?? data.dieselUnitCost ?? data.dieselRate) || 0;
    if (dQty > 0) {
      result.push({ fuelType: 'diesel', quantity: dQty, unitCost: dCost, subtotal: dQty * dCost });
    }
  }
  
  return result;
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
  petrolAvgPurchasePrice?: number;
  petrolProfitPerLiter?: number;
  petrolTotalProfit?: number;
  dieselLastReading?: number;
  dieselClosingReading?: number;
  dieselSold?: number;
  dieselSalePrice?: number;
  dieselAvgPurchasePrice?: number;
  dieselProfitPerLiter?: number;
  dieselTotalProfit?: number;
  totalProfit?: number;
  [key: string]: any;
}

function getDayKey(ms: number): string {
  if (!ms) return '1970-01-01';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    
    // Combine and sort chronologically:
    // 1. Compare calendar days (day level)
    // 2. On the same day, purchases occur BEFORE daily sales closing readings
    // 3. Compare creation timestamp
    const events: RecalculateEvent[] = [...purchases, ...readings].sort((a, b) => {
      const dayA = getDayKey(a.dateTime);
      const dayB = getDayKey(b.dateTime);
      if (dayA !== dayB) {
        return dayA.localeCompare(dayB);
      }
      if (a.type !== b.type) {
        return a.type === 'purchase' ? -1 : 1;
      }
      return a.createdTime - b.createdTime;
    });
    
    let pStock = 0;
    let pAvg = Number(currentSettings?.initialPetrolPurchasePrice) || Number(currentSettings?.petrolAvgPurchasePrice) || 0;
    let dStock = 0;
    let dAvg = Number(currentSettings?.initialDieselPurchasePrice) || Number(currentSettings?.dieselAvgPurchasePrice) || 0;
    let baselinePReading = currentSettings?.initialPetrolReading ?? 0;
    let baselineDReading = currentSettings?.initialDieselReading ?? 0;
    let lastPReading = baselinePReading;
    let lastDReading = baselineDReading;
    let lastPSalePrice = currentSettings?.lastPetrolSalePrice;
    let lastDSalePrice = currentSettings?.lastDieselSalePrice;
    let hasReadings = false;

    // Collect reading documents that need Firestore updates to ensure 100% sync
    const readingsToUpdate: { id: string; data: any }[] = [];
    
    for (const ev of events) {
      if (ev.type === 'purchase') {
        const pItems = extractPurchaseItems(ev);
        pItems.forEach(item => {
          if (item.fuelType === 'petrol') {
            if (pStock <= 0) {
              pAvg = item.unitCost;
              pStock = item.quantity;
            } else {
              pAvg = weightedAvgPrice(pStock, pAvg, item.quantity, item.unitCost);
              pStock += item.quantity;
            }
          } else if (item.fuelType === 'diesel') {
            if (dStock <= 0) {
              dAvg = item.unitCost;
              dStock = item.quantity;
            } else {
              dAvg = weightedAvgPrice(dStock, dAvg, item.quantity, item.unitCost);
              dStock += item.quantity;
            }
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

        const pSalePrice = Number(ev.petrolSalePrice) || 0;
        const dSalePrice = Number(ev.dieselSalePrice) || 0;

        // Current cost basis at the exact moment of this reading
        const pCostAtReading = pAvg > 0 ? pAvg : (Number(currentSettings?.petrolAvgPurchasePrice) || 0);
        const dCostAtReading = dAvg > 0 ? dAvg : (Number(currentSettings?.dieselAvgPurchasePrice) || 0);

        // Exact real profit or loss per liter: Sale Price - Weighted Average Cost at that date
        // e.g. Bought at 320, sold at 100 => 100 - 320 = -220
        const pProfitPerLiter = pSalePrice - pCostAtReading;
        const dProfitPerLiter = dSalePrice - dCostAtReading;
        const pTotalProfit = pSold * pProfitPerLiter;
        const dTotalProfit = dSold * dProfitPerLiter;
        const totalProfitVal = pTotalProfit + dTotalProfit;

        // Compare against stored values to detect any calculation or price drift
        const diffPPrice = Math.abs((Number(ev.petrolAvgPurchasePrice) || 0) - pCostAtReading) > 0.001;
        const diffDPrice = Math.abs((Number(ev.dieselAvgPurchasePrice) || 0) - dCostAtReading) > 0.001;
        const diffPPpl = Math.abs((Number(ev.petrolProfitPerLiter) || 0) - pProfitPerLiter) > 0.001;
        const diffDPpl = Math.abs((Number(ev.dieselProfitPerLiter) || 0) - dProfitPerLiter) > 0.001;
        const diffPTotal = Math.abs((Number(ev.petrolTotalProfit) || 0) - pTotalProfit) > 0.01;
        const diffDTotal = Math.abs((Number(ev.dieselTotalProfit) || 0) - dTotalProfit) > 0.01;
        const diffTotal = Math.abs((Number(ev.totalProfit) || 0) - totalProfitVal) > 0.01;

        if (
          ev.petrolAvgPurchasePrice === undefined ||
          ev.dieselAvgPurchasePrice === undefined ||
          diffPPrice || diffDPrice || diffPPpl || diffDPpl || diffPTotal || diffDTotal || diffTotal
        ) {
          readingsToUpdate.push({
            id: ev.id,
            data: {
              petrolAvgPurchasePrice: pCostAtReading,
              petrolProfitPerLiter: pProfitPerLiter,
              petrolTotalProfit: pTotalProfit,
              dieselAvgPurchasePrice: dCostAtReading,
              dieselProfitPerLiter: dProfitPerLiter,
              dieselTotalProfit: dTotalProfit,
              totalProfit: totalProfitVal
            }
          });
        }
        
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

    // Persist all updated readings to Firestore in batch chunks
    if (readingsToUpdate.length > 0) {
      for (let i = 0; i < readingsToUpdate.length; i += 400) {
        const chunk = readingsToUpdate.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(getUserDoc('fuelReadings', item.id), item.data, { merge: true });
        }
        await batch.commit();
      }
    }

    if (!hasReadings) {
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
    
    // Also recalculate all vendor balances automatically
    await recalculateAllVendors();

    console.log('Database recalculated and synchronized successfully! Petrol Stock:', pStock, 'Diesel Stock:', dStock);
  } catch (err) {
    console.error('Failed to recalculate database:', err);
  }
}

export async function recalculateAllVendors() {
  try {
    const vSnap = await getDocs(getUserCollection('vendors'));
    const purSnap = await getDocs(getUserCollection('purchases'));
    const paySnap = await getDocs(getUserCollection('vendorPayments'));

    for (const vDoc of vSnap.docs) {
      const vId = vDoc.id;
      const vName = (vDoc.data()?.name || '').trim().toLowerCase();
      let totalPurchases = 0;
      let totalPaidFromPurchases = 0;

      purSnap.forEach(d => {
        const data = d.data();
        const dVendorId = data.vendorId || data.vendor_id;
        const dVendorName = (data.vendorName || data.vendor || '').trim().toLowerCase();
        const matches = dVendorId === vId || (vName && dVendorName && dVendorName === vName);

        if (matches) {
          totalPurchases += (Number(data.total ?? data.netSubtotal) || 0);
          totalPaidFromPurchases += (Number(data.amountPaid) || 0);
        }
      });

      let manualPayments = 0;
      paySnap.forEach(d => {
        const data = d.data();
        const dVendorId = data.vendorId || data.vendor_id;
        const dVendorName = (data.vendorName || data.vendor || '').trim().toLowerCase();
        const matches = dVendorId === vId || (vName && dVendorName && dVendorName === vName);

        if (matches) {
          manualPayments += (Number(data.amount) || 0);
        }
      });

      const totalPaid = totalPaidFromPurchases + manualPayments;
      const vendorQarz = Math.max(0, totalPurchases - totalPaid);

      await setDoc(getUserDoc('vendors', vId), {
        totalPurchases,
        totalPaid,
        vendorQarz
      }, { merge: true });
    }
  } catch (err) {
    console.error('Failed to recalculate all vendors:', err);
  }
}

export async function recalculateVendor(vendorId: string) {
  if (!vendorId) return;
  try {
    const vDoc = await getDoc(getUserDoc('vendors', vendorId));
    const vName = vDoc.exists() ? (vDoc.data()?.name || '').trim().toLowerCase() : '';

    const purSnap = await getDocs(getUserCollection('purchases'));
    let totalPurchases = 0;
    let totalPaidFromPurchases = 0;
    purSnap.forEach(d => {
      const data = d.data();
      const dVendorId = data.vendorId || data.vendor_id;
      const dVendorName = (data.vendorName || data.vendor || '').trim().toLowerCase();
      const matches = dVendorId === vendorId || (vName && dVendorName && dVendorName === vName);

      if (matches) {
        totalPurchases += (Number(data.total ?? data.netSubtotal) || 0);
        totalPaidFromPurchases += (Number(data.amountPaid) || 0);
      }
    });

    const paySnap = await getDocs(getUserCollection('vendorPayments'));
    let manualPayments = 0;
    paySnap.forEach(d => {
      const data = d.data();
      const dVendorId = data.vendorId || data.vendor_id;
      const dVendorName = (data.vendorName || data.vendor || '').trim().toLowerCase();
      const matches = dVendorId === vendorId || (vName && dVendorName && dVendorName === vName);

      if (matches) {
        manualPayments += (Number(data.amount) || 0);
      }
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

