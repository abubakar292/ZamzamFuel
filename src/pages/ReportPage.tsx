import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getDocs, getDoc } from 'firebase/firestore';
import { getUserCollection, getUserDoc } from '../lib/firebase';
import { useToast } from '../components/Toast';
import { formatAmount } from '../utils/calculations';
import { parseDateInput, formatDisplayDate, getTodayDateString } from '../utils/dateUtils';
import { getMillis, recalculateDatabase } from '../utils/recalculate';
import { FileText, Download, Filter, Droplets, Fuel } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportRow = {
  date: string;
  product: 'Petrol' | 'Diesel';
  totalSaleLiters: number;
  avgSalePrice: number;
  profitPerLiter: number;
  totalProfit: number;
};

export default function ReportPage() {
  const [reportType, setReportType] = useState<'All' | 'Petrol' | 'Diesel'>('All');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  const [toDate, setToDate] = useState(() => getTodayDateString());
  
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const { showToast } = useToast();

  // Auto-sync client's historical data on mount to ensure all historical entries have accurate cost & profit calculated
  useEffect(() => {
    recalculateDatabase().catch(err => console.error('Auto-recalculate error:', err));
  }, []);

  const handleSetPreset = (preset: 'today' | 'this_month' | 'last_month') => {
    const today = new Date();
    if (preset === 'today') {
      const todayStr = getTodayDateString();
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'this_month') {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      setFromDate(`${year}-${month}-01`);
      setToDate(getTodayDateString());
    } else if (preset === 'last_month') {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const y = firstOfLastMonth.getFullYear();
      const m = String(firstOfLastMonth.getMonth() + 1).padStart(2, '0');
      const lastDay = String(lastOfLastMonth.getDate()).padStart(2, '0');
      setFromDate(`${y}-${m}-01`);
      setToDate(`${y}-${m}-${lastDay}`);
    }
  };

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      showToast('Select date range', 'warning');
      return;
    }

    setLoading(true);
    try {
      // 1. Recalculate whole database to ensure all readings and averages are synchronized
      await recalculateDatabase();

      const start = parseDateInput(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = parseDateInput(toDate);
      end.setHours(23, 59, 59, 999);
      const startMs = start.getTime();
      const endMs = end.getTime();

      // Fetch baseline settings for fallback purchase costs if needed
      const settingsSnap = await getDoc(getUserDoc('appSettings', 'fuelPrices'));
      const fuelSettings = settingsSnap.exists() ? settingsSnap.data() : null;
      const fallbackPCost = Number(fuelSettings?.petrolAvgPurchasePrice) || 0;
      const fallbackDCost = Number(fuelSettings?.dieselAvgPurchasePrice) || 0;

      // Robust fetch: avoids Firestore query index mismatches across multiple types
      const rSnap = await getDocs(getUserCollection('fuelReadings'));
      const readings = rSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as any))
        .filter(r => {
          const ms = getMillis(r.date) || getMillis(r.createdAt);
          return ms >= startMs && ms <= endMs;
        });

      // Robust fetch for expenses
      const eSnap = await getDocs(getUserCollection('expenses'));
      const expenses = eSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as any))
        .filter(e => {
          const ms = getMillis(e.date) || getMillis(e.createdAt);
          return ms >= startMs && ms <= endMs;
        });
      
      const totalExp = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

      const generatedRows: ReportRow[] = [];

      // Sort chronological ascending
      readings.sort((a, b) => {
        const timeA = getMillis(a.date) || getMillis(a.createdAt);
        const timeB = getMillis(b.date) || getMillis(b.createdAt);
        return timeA - timeB;
      });

      readings.forEach(r => {
        const dStr = formatDisplayDate(r.date);
        const pSold = Number(r.petrolSold) || 0;
        const pPrice = Number(r.petrolSalePrice) || 0;
        const dSold = Number(r.dieselSold) || 0;
        const dPrice = Number(r.dieselSalePrice) || 0;

        // TRUE real profit or loss per liter: Sale Price - Cost Basis
        // e.g. Sold at 100, bought at 320 => Profit per liter = -220
        const pCost = (r.petrolAvgPurchasePrice !== undefined && r.petrolAvgPurchasePrice !== null && !isNaN(Number(r.petrolAvgPurchasePrice)))
          ? Number(r.petrolAvgPurchasePrice)
          : fallbackPCost;
        const pProfitPerL = (pPrice > 0 || pCost > 0) ? (pPrice - pCost) : (Number(r.petrolProfitPerLiter) || 0);
        const pTotalProfit = pSold * pProfitPerL;

        // Diesel true profit or loss per liter
        const dCost = (r.dieselAvgPurchasePrice !== undefined && r.dieselAvgPurchasePrice !== null && !isNaN(Number(r.dieselAvgPurchasePrice)))
          ? Number(r.dieselAvgPurchasePrice)
          : fallbackDCost;
        const dProfitPerL = (dPrice > 0 || dCost > 0) ? (dPrice - dCost) : (Number(r.dieselProfitPerLiter) || 0);
        const dTotalProfit = dSold * dProfitPerL;

        if (reportType === 'All' || reportType === 'Petrol') {
          if (pSold > 0) {
            generatedRows.push({
              date: dStr,
              product: 'Petrol',
              totalSaleLiters: pSold,
              avgSalePrice: pPrice,
              profitPerLiter: pProfitPerL,
              totalProfit: pTotalProfit
            });
          }
        }
        
        if (reportType === 'All' || reportType === 'Diesel') {
          if (dSold > 0) {
            generatedRows.push({
              date: dStr,
              product: 'Diesel',
              totalSaleLiters: dSold,
              avgSalePrice: dPrice,
              profitPerLiter: dProfitPerL,
              totalProfit: dTotalProfit
            });
          }
        }
      });

      setRows(generatedRows);
      setExpensesTotal(totalExp);
      setGenerated(true);
      showToast('Report generated successfully', 'success');

    } catch (error) {
      console.error(error);
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const finalRows = rows;
  const finalSubtotal = finalRows.reduce((acc, r) => acc + r.totalProfit, 0);
  const finalIncome = finalSubtotal - expensesTotal;

  const totalPetrolLiters = finalRows
    .filter(r => r.product === 'Petrol')
    .reduce((acc, r) => acc + (Number(r.totalSaleLiters) || 0), 0);

  const totalDieselLiters = finalRows
    .filter(r => r.product === 'Diesel')
    .reduce((acc, r) => acc + (Number(r.totalSaleLiters) || 0), 0);

  const totalCombinedLiters = totalPetrolLiters + totalDieselLiters;

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('FUEL STATION SALES REPORT', 105, 12, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)} | Type: ${reportType}`, 105, 20, { align: 'center' });

    // Table rows
    const summaryPdfRows: any[] = [];
    if (reportType === 'All' || reportType === 'Petrol') {
      summaryPdfRows.push([
        'TOTAL PETROL SOLD', 'Petrol', `${Number(totalPetrolLiters).toFixed(2)} L`, '-', '-', `Rs. ${formatAmount(finalRows.filter(r => r.product === 'Petrol').reduce((sum, r) => sum + r.totalProfit, 0))}`
      ]);
    }
    if (reportType === 'All' || reportType === 'Diesel') {
      summaryPdfRows.push([
        'TOTAL DIESEL SOLD', 'Diesel', `${Number(totalDieselLiters).toFixed(2)} L`, '-', '-', `Rs. ${formatAmount(finalRows.filter(r => r.product === 'Diesel').reduce((sum, r) => sum + r.totalProfit, 0))}`
      ]);
    }
    if (reportType === 'All') {
      summaryPdfRows.push([
        'TOTAL COMBINED FUEL', 'Combined', `${Number(totalCombinedLiters).toFixed(2)} L`, '-', '-', `Rs. ${formatAmount(finalSubtotal)}`
      ]);
    }

    autoTable(doc, {
      startY: 36,
      head: [['Date', 'Product', 'Sale (L)', 'Sale Price', 'Profit/L', 'Total Profit']],
      body: [
        ...finalRows.map(r => [
          r.date, r.product,
          `${Number(r.totalSaleLiters).toFixed(2)} L`,
          `Rs. ${Number(r.avgSalePrice).toFixed(2)}`,
          `${r.profitPerLiter >= 0 ? '+' : '-'}Rs. ${Math.abs(Number(r.profitPerLiter)).toFixed(2)}`,
          `${r.totalProfit >= 0 ? '' : '-'}Rs. ${formatAmount(Math.abs(r.totalProfit))}`,
        ]),
        ...summaryPdfRows
      ],
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Total Petrol: ${Number(totalPetrolLiters).toFixed(2)} L | Total Diesel: ${Number(totalDieselLiters).toFixed(2)} L`, 14, finalY);
    doc.text(`Gross Profit: Rs. ${Number(finalSubtotal).toFixed(2)} | Expenses: Rs. ${Number(expensesTotal).toFixed(2)}`, 14, finalY + 6);
    
    if (finalIncome >= 0) {
      doc.setTextColor(16, 185, 129);
    } else {
      doc.setTextColor(239, 68, 68);
    }
    doc.text(`Net Income: Rs. ${Number(finalIncome).toFixed(2)}`, 14, finalY + 12);

    doc.save(`Sales_Report_${fromDate}_${toDate}.pdf`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Title & Description */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Sales Report</h2>
          <p className="text-xs text-slate-400">View sales volume, fuel liters totals, expenses, and net profit</p>
        </div>
      </div>

      {/* Minimalist Filter Card */}
      <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 border border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl w-full sm:w-auto">
            {(['All', 'Petrol', 'Diesel'] as const).map(type => (
              <button 
                key={type}
                onClick={() => setReportType(type)} 
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  reportType === type ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-medium hidden md:inline">Quick range:</span>
            <button 
              onClick={() => handleSetPreset('today')} 
              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold border border-slate-200/60 transition-colors"
            >
              Today
            </button>
            <button 
              onClick={() => handleSetPreset('this_month')} 
              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold border border-slate-200/60 transition-colors"
            >
              This Month
            </button>
            <button 
              onClick={() => handleSetPreset('last_month')} 
              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold border border-slate-200/60 transition-colors"
            >
              Last Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">From Date</label>
            <input 
              type="date" 
              value={fromDate} 
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">To Date</label>
            <input 
              type="date" 
              value={toDate} 
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <button 
              onClick={handleGenerate} 
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-light text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm text-sm"
            >
              <Filter className="w-4 h-4" />
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/50 shadow-xs">
              <div className="flex items-center gap-1.5 text-amber-800">
                <Droplets className="w-3.5 h-3.5" />
                <p className="text-[10px] uppercase font-bold tracking-wider">Total Petrol</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-950 mt-1">
                {Number(totalPetrolLiters).toFixed(2)} <span className="text-xs font-semibold text-amber-700">L</span>
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-blue-200/80 bg-gradient-to-br from-white to-blue-50/50 shadow-xs">
              <div className="flex items-center gap-1.5 text-blue-800">
                <Fuel className="w-3.5 h-3.5" />
                <p className="text-[10px] uppercase font-bold tracking-wider">Total Diesel</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-blue-950 mt-1">
                {Number(totalDieselLiters).toFixed(2)} <span className="text-xs font-semibold text-blue-700">L</span>
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gross Profit</p>
              <p className={`text-xl sm:text-2xl font-black mt-1 ${finalSubtotal >= 0 ? 'text-slate-800' : 'text-danger'}`}>
                {finalSubtotal >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(finalSubtotal))}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-rose-200 bg-rose-50/20 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Expenses</p>
              <p className="text-xl sm:text-2xl font-black text-danger mt-1">
                Rs. {formatAmount(expensesTotal)}
              </p>
            </div>

            <div className={`rounded-2xl p-4 border shadow-xs col-span-2 sm:col-span-1 ${
              finalIncome >= 0 ? 'bg-success-bg border-success/30' : 'bg-danger-bg border-danger/30'
            }`}>
              <p className={`text-[10px] uppercase font-bold tracking-wider ${finalIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                Net Income
              </p>
              <p className={`text-xl sm:text-2xl font-black mt-1 ${finalIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                {finalIncome >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(finalIncome))}
              </p>
            </div>
          </div>

          {/* Results Table & Mobile View */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-slate-100">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Daily Breakdown & Month Sum
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing sales from {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Mobile View Toggle */}
                <div className="sm:hidden flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-bold">
                  <button 
                    onClick={() => setViewMode('table')} 
                    className={`px-2.5 py-1 rounded-md ${viewMode === 'table' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                  >
                    Table
                  </button>
                  <button 
                    onClick={() => setViewMode('cards')} 
                    className={`px-2.5 py-1 rounded-md ${viewMode === 'cards' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                  >
                    Cards
                  </button>
                </div>

                <button 
                  onClick={handleExportPDF} 
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Export PDF
                </button>
              </div>
            </div>

            {/* Mobile Cards View (Optional on small screens) */}
            {viewMode === 'cards' && (
              <div className="sm:hidden p-4 space-y-3">
                {finalRows.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 text-sm">No records found for this period.</p>
                ) : (
                  finalRows.map((row, i) => (
                    <div key={i} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">{row.date}</span>
                        <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                          row.product === 'Petrol' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                        }`}>
                          {row.product}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-xs pt-1 border-t border-slate-200/60">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Sale (L)</p>
                          <p className="font-black text-slate-800">{Number(row.totalSaleLiters).toFixed(2)} L</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Rate</p>
                          <p className="font-bold text-slate-700">Rs. {formatAmount(row.avgSalePrice)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Profit/L</p>
                          <p className={`font-bold ${row.profitPerLiter >= 0 ? 'text-success' : 'text-danger'}`}>
                            {row.profitPerLiter >= 0 ? '+' : '-'}Rs. {formatAmount(Math.abs(row.profitPerLiter))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Total Profit</p>
                          <p className={`font-black ${row.totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                            {row.totalProfit >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(row.totalProfit))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Ending summary card on mobile */}
                {finalRows.length > 0 && (
                  <div className="p-4 rounded-xl border-2 border-slate-900 bg-slate-900 text-white space-y-2 mt-4">
                    <p className="text-xs uppercase font-black text-amber-400">Month-End Ending Totals</p>
                    {(reportType === 'All' || reportType === 'Petrol') && (
                      <div className="flex justify-between text-xs pt-1 border-t border-slate-800">
                        <span className="text-slate-300">Total Petrol Sold:</span>
                        <span className="font-black text-amber-300">{Number(totalPetrolLiters).toFixed(2)} Liters</span>
                      </div>
                    )}
                    {(reportType === 'All' || reportType === 'Diesel') && (
                      <div className="flex justify-between text-xs pt-1 border-t border-slate-800">
                        <span className="text-slate-300">Total Diesel Sold:</span>
                        <span className="font-black text-blue-300">{Number(totalDieselLiters).toFixed(2)} Liters</span>
                      </div>
                    )}
                    {reportType === 'All' && (
                      <div className="flex justify-between text-xs pt-1 border-t border-slate-700">
                        <span className="text-slate-200 font-bold">Total Combined Volume:</span>
                        <span className="font-black text-white">{Number(totalCombinedLiters).toFixed(2)} Liters</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Standard Responsive Table */}
            <div className={`overflow-x-auto ${viewMode === 'cards' ? 'hidden sm:block' : ''}`}>
              <table className="w-full min-w-[580px] text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Sale (L)</th>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Sale Price</th>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Profit/L</th>
                    <th className="py-3 px-4 sm:px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {finalRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">No records found for this period.</td>
                    </tr>
                  ) : (
                    finalRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 sm:px-5 text-slate-700 font-medium">{row.date}</td>
                        <td className="py-3 px-4 sm:px-5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            row.product === 'Petrol' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                          }`}>
                            {row.product}
                          </span>
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-slate-800 text-right font-bold">{Number(row.totalSaleLiters).toFixed(2)}</td>
                        <td className="py-3 px-4 sm:px-5 text-slate-600 text-right">Rs. {formatAmount(row.avgSalePrice)}</td>
                        <td className={`py-3 px-4 sm:px-5 text-right font-bold ${row.profitPerLiter >= 0 ? 'text-success' : 'text-danger'}`}>
                          {row.profitPerLiter >= 0 ? '+' : '-'}Rs. {formatAmount(Math.abs(row.profitPerLiter))}
                        </td>
                        <td className={`py-3 px-4 sm:px-5 text-right font-bold ${row.totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {row.totalProfit >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(row.totalProfit))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {finalRows.length > 0 && (
                  <tfoot className="border-t-2 border-slate-300">
                    {/* Petrol Ending Total Row */}
                    {(reportType === 'All' || reportType === 'Petrol') && (
                      <tr className="bg-amber-50/90 border-b border-amber-200/80 font-bold">
                        <td className="py-3 px-4 sm:px-5 text-sm font-black text-amber-900">
                          Total Petrol Sold
                        </td>
                        <td className="py-3 px-4 sm:px-5">
                          <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-200 text-amber-950 uppercase tracking-wider">
                            Petrol Sum
                          </span>
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-base text-right font-black text-amber-950">
                          {Number(totalPetrolLiters).toFixed(2)} Liters
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className="py-3 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className="py-3 px-4 sm:px-5 text-sm text-right font-bold text-amber-950">
                          {finalRows.filter(r => r.product === 'Petrol').reduce((sum, r) => sum + r.totalProfit, 0) >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(finalRows.filter(r => r.product === 'Petrol').reduce((sum, r) => sum + r.totalProfit, 0)))}
                        </td>
                      </tr>
                    )}

                    {/* Diesel Ending Total Row */}
                    {(reportType === 'All' || reportType === 'Diesel') && (
                      <tr className="bg-blue-50/90 border-b border-blue-200/80 font-bold">
                        <td className="py-3 px-4 sm:px-5 text-sm font-black text-blue-900">
                          Total Diesel Sold
                        </td>
                        <td className="py-3 px-4 sm:px-5">
                          <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-200 text-blue-950 uppercase tracking-wider">
                            Diesel Sum
                          </span>
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-base text-right font-black text-blue-950">
                          {Number(totalDieselLiters).toFixed(2)} Liters
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className="py-3 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className="py-3 px-4 sm:px-5 text-sm text-right font-bold text-blue-950">
                          {finalRows.filter(r => r.product === 'Diesel').reduce((sum, r) => sum + r.totalProfit, 0) >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(finalRows.filter(r => r.product === 'Diesel').reduce((sum, r) => sum + r.totalProfit, 0)))}
                        </td>
                      </tr>
                    )}

                    {/* Overall Fuel Sold Summary Row (when All) */}
                    {reportType === 'All' && (
                      <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-950">
                        <td className="py-3.5 px-4 sm:px-5 text-sm uppercase tracking-wider text-slate-100">
                          Total Combined Fuel
                        </td>
                        <td className="py-3.5 px-4 sm:px-5 text-xs text-slate-300 font-normal">
                          {Number(totalPetrolLiters).toFixed(2)}L + {Number(totalDieselLiters).toFixed(2)}L
                        </td>
                        <td className="py-3.5 px-4 sm:px-5 text-base text-right font-black text-white">
                          {Number(totalCombinedLiters).toFixed(2)} Liters
                        </td>
                        <td className="py-3.5 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className="py-3.5 px-4 sm:px-5 text-xs text-right text-slate-400 font-normal">-</td>
                        <td className={`py-3.5 px-4 sm:px-5 text-base text-right font-black ${finalSubtotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {finalSubtotal >= 0 ? '' : '-'}Rs. {formatAmount(Math.abs(finalSubtotal))}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
