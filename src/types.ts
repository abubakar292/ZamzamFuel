import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Timestamp;
}

export interface PurchaseItem {
  fuelType: 'petrol' | 'diesel';
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface Purchase {
  id?: string;
  invoiceNumber: number;
  vendorId: string;
  vendorName: string;
  paymentType: 'Cash' | 'Credit';
  purchaseDate: Timestamp;
  items: PurchaseItem[];
  netSubtotal: number;
  total: number;
  amountPaid: number;
  remainingBalance: number;
  createdAt: Timestamp;
}

export interface Vendor {
  id?: string;
  name: string;
  phone: string;
  address: string;
  totalPurchases: number;
  totalPaid: number;
  vendorQarz: number;
  createdAt: Timestamp;
}

export interface VendorPayment {
  id?: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  paymentDate: Timestamp;
  notes: string;
  createdAt: Timestamp;
}

export interface FuelReading {
  id?: string;
  date: Timestamp;
  petrolLastReading: number;
  petrolClosingReading: number;
  petrolSold: number;
  petrolSalePrice: number;
  petrolAmount: number;
  dieselLastReading: number;
  dieselClosingReading: number;
  dieselSold: number;
  dieselSalePrice: number;
  dieselAmount: number;
  subtotal: number;
  createdAt: Timestamp;
}

export interface Expense {
  id?: string;
  title: string;
  amount: number;
  category: string;
  paidTo: string;
  date: Timestamp;
  notes: string;
  createdAt: Timestamp;
}

export interface Counters {
  lastInvoiceNumber: number;
}

export interface StationProfile {
  stationName: string;
  ownerName: string;
  phone: string;
  address: string;
}

export interface FuelPrices {
  petrolAvgPurchasePrice: number;
  dieselAvgPurchasePrice: number;
  petrolCurrentReading: number;
  dieselCurrentReading: number;
  petrolStock: number;
  dieselStock: number;
  petrolStockValue: number;
  dieselStockValue: number;
  lastPetrolSalePrice?: number;
  lastDieselSalePrice?: number;
}
