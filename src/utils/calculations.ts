// 1. Weighted average purchase price
export function weightedAvgPrice(
  existingStock: number, oldAvg: number,
  newQty: number, newPrice: number
): number {
  const eStock = Number(existingStock) || 0;
  const oAvg = Number(oldAvg) || 0;
  const nQty = Number(newQty) || 0;
  const nPrice = Number(newPrice) || 0;

  const total = eStock + nQty;
  if (total === 0) return 0;
  return ((eStock * oAvg) + (nQty * nPrice)) / total;
}

// 2. Daily sold
export const dailySold = (closing: number, last: number): number =>
  Math.max(0, closing - last);

// 3. Daily amount
export const dailyAmount = (sold: number, price: number): number => sold * price;

// 4. Profit per liter
export const profitPerLiter = (salePrice: number, avgPurchase: number): number =>
  salePrice - avgPurchase;

// 5. Total profit
export const totalProfit = (sold: number, ppl: number): number => sold * ppl;

// 6. Stock value
export const stockValue = (stock: number, avgPrice: number): number => stock * avgPrice;

// 7. Cash in hand
export const cashInHand = (
  initialInvestment: number,
  totalFuelSales: number,
  totalExpenses: number,
  totalPurchasesPaid: number,
  totalVendorPayments: number
): number => (Number(initialInvestment) || 0) + totalFuelSales - totalExpenses - totalPurchasesPaid - totalVendorPayments;

// 8. Vendor qarz
export const vendorQarz = (purchases: number, paid: number): number =>
  Math.max(0, purchases - paid);

// Formatters
export const formatAmount = (n: number): string =>
  new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const formatLiters = (n: number): string =>
  new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' L';
