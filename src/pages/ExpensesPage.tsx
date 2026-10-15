import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshot, addDoc, updateDoc, serverTimestamp, deleteDoc, query, orderBy } from 'firebase/firestore';
import { getUserCollection, getUserDoc } from '../lib/firebase';
import { Expense } from '../types';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatAmount } from '../utils/calculations';
import { parseDateInput, getTodayDateString, formatDisplayDate, formatDateForInput } from '../utils/dateUtils';
import { Search, Plus, Trash2, Receipt, Filter, Pencil, X, Save } from 'lucide-react';

const CATEGORIES = ['Salary', 'Utilities', 'Maintenance', 'Fuel', 'Miscellaneous', 'Other'];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<'history' | 'add'>('history');
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');

  // Add Form
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [paidTo, setPaidTo] = useState('');
  const [date, setDate] = useState(() => getTodayDateString());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit State & Form
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState(CATEGORIES[0]);
  const [editPaidTo, setEditPaidTo] = useState('');
  const [editDate, setEditDate] = useState(() => getTodayDateString());
  const [editNotes, setEditNotes] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    const q = query(getUserCollection('expenses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return;
    
    setLoading(true);
    try {
      const expDate = parseDateInput(date);

      await addDoc(getUserCollection('expenses'), {
        title: title.trim(),
        amount: parseFloat(amount),
        category,
        paidTo: paidTo.trim(),
        date: expDate,
        notes: notes.trim(),
        createdAt: serverTimestamp()
      });
      showToast('Expense added successfully', 'success');
      setActiveTab('history');
      // Reset
      setTitle(''); setAmount(''); setPaidTo(''); setNotes('');
    } catch (error) {
      showToast('Failed to add expense', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditTitle(exp.title || '');
    setEditAmount(exp.amount !== undefined ? exp.amount.toString() : '');
    setEditCategory(exp.category || CATEGORIES[0]);
    setEditPaidTo(exp.paidTo || '');
    setEditDate(formatDateForInput(exp.date));
    setEditNotes(exp.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense?.id) return;
    if (!editTitle.trim()) return showToast('Please enter an expense title', 'warning');
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return showToast('Please enter a valid amount', 'warning');
    }

    setEditLoading(true);
    try {
      const expDate = parseDateInput(editDate);

      await updateDoc(getUserDoc('expenses', editingExpense.id), {
        title: editTitle.trim(),
        amount: parsedAmount,
        category: editCategory,
        paidTo: editPaidTo.trim(),
        date: expDate,
        notes: editNotes.trim(),
        updatedAt: serverTimestamp()
      });

      showToast('Expense updated successfully', 'success');
      setEditingExpense(null);
    } catch (error) {
      console.error('Failed to update expense:', error);
      showToast('Failed to update expense', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseToDelete?.id) return;
    try {
      await deleteDoc(getUserDoc('expenses', expenseToDelete.id));
      showToast('Expense deleted and Cash in Hand updated', 'success');
    } catch (error) {
      showToast('Failed to delete', 'error');
    }
    setExpenseToDelete(null);
  };

  const currentMonthExpenses = expenses.filter(e => {
    if (!e.date?.toMillis) return false;
    const d = e.date.toDate();
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || 
      (e.paidTo && e.paidTo.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = filterCat === 'All' || e.category === filterCat;
    return matchesSearch && matchesCat;
  });

  const getCatColor = (cat: string) => {
    switch (cat) {
      case 'Salary': return 'bg-blue-100 text-blue-700';
      case 'Utilities': return 'bg-amber-100 text-amber-700';
      case 'Maintenance': return 'bg-orange-100 text-orange-700';
      case 'Fuel': return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Expenses</h2>
        
        <div className="flex bg-white rounded-xl shadow-sm p-1">
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            History
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'add' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Add Expense
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'history' ? (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            
            {/* Stats */}
            <div className="bg-white rounded-2xl p-6 shadow-card border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center">
                  <Receipt className="w-6 h-6 text-danger" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">This Month</p>
                  <p className="text-xl sm:text-2xl font-black text-slate-800 tabular-nums truncate">Rs. {formatAmount(currentMonthExpenses)}</p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Search by title or paid to..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                />
              </div>
              <div className="relative w-full sm:w-48">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm appearance-none"
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="divide-y divide-slate-100">
                {filteredExpenses.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">No expenses found.</div>
                ) : (
                  filteredExpenses.map((exp) => (
                    <div key={exp.id} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getCatColor(exp.category)}`}>
                            {exp.category}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDisplayDate(exp.date)}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-base truncate">{exp.title}</h4>
                        {exp.paidTo && <p className="text-sm text-slate-500 truncate">Paid to: {exp.paidTo}</p>}
                        {exp.notes && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{exp.notes}</p>}
                      </div>
                      
                      <div className="flex items-center justify-between w-full sm:w-auto gap-3 shrink-0 mt-2 sm:mt-0">
                        <p className="font-black text-base sm:text-lg text-slate-800 tabular-nums shrink-0 mr-1">
                          Rs. {formatAmount(exp.amount)}
                        </p>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => handleStartEdit(exp)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit expense"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setExpenseToDelete(exp)}
                            className="p-2 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            title="Delete expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="add" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bg-white rounded-2xl shadow-card max-w-2xl mx-auto overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-800">Add New Expense</h3>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Expense Title *</label>
                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="e.g. Electric Bill"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (Rs.) *</label>
                    <input type="number" step="0.01" min="0" required value={amount} onChange={e => setAmount(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Category *</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Paid To</label>
                    <input type="text" value={paidTo} onChange={e => setPaidTo(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="Person or Company"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                      placeholder="Additional details..."
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end">
                  <button type="submit" disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-light focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-70 flex items-center gap-2 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {loading ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Expense Modal */}
      <AnimatePresence>
        {editingExpense && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingExpense(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
            />
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800">Edit Expense</h3>
                      <p className="text-xs text-slate-400">Update expense record details</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingExpense(null)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEdit} className="p-5 sm:p-6 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Expense Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      placeholder="e.g. Electric Bill"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Amount (Rs.) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold tabular-nums"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Category *
                      </label>
                      <select
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Paid To
                      </label>
                      <input
                        type="text"
                        value={editPaidTo}
                        onChange={e => setEditPaidTo(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Person or Company"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Notes
                    </label>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                      placeholder="Additional notes..."
                    />
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEditingExpense(null)}
                      className="px-4 py-2.5 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                      {editLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!expenseToDelete}
        title="Delete Expense"
        message={`Are you sure you want to delete "${expenseToDelete?.title}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setExpenseToDelete(null)}
        confirmText="Delete"
      />
    </div>
  );
}
