import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUserCollection, getUserDoc } from '../lib/firebase';
import { Vendor } from '../types';
import { useToast } from '../components/Toast';
import { Search, Plus, User, ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatAmount } from '../utils/calculations';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Add Vendor Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(getUserCollection('vendors'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
      setVendors(data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis() || 0));
    });
    return () => unsub();
  }, []);

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setLoading(true);
    try {
      await addDoc(getUserCollection('vendors'), {
        name,
        phone,
        address,
        totalPurchases: 0,
        totalPaid: 0,
        vendorQarz: 0,
        createdAt: serverTimestamp()
      });
      showToast('Vendor added successfully', 'success');
      setIsAddModalOpen(false);
      setName(''); setPhone(''); setAddress('');
    } catch (error) {
      showToast('Failed to add vendor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Vendors</h2>
        
        <div className="flex w-full sm:w-auto gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-light transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Vendor</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVendors.map((vendor, i) => (
          <motion.div
            key={vendor.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-5 shadow-card hover:shadow-card-lg transition-all group border border-slate-100"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg uppercase">
                  {vendor.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 line-clamp-1">{vendor.name}</h3>
                  <p className="text-xs text-slate-500">{vendor.phone || 'No phone'}</p>
                </div>
              </div>
              <Link to={`/vendors/${vendor.id}`} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors">
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Current Balance</p>
                {vendor.vendorQarz > 0 ? (
                  <p className="font-bold text-danger">Rs. {formatAmount(vendor.vendorQarz)}</p>
                ) : (
                  <p className="font-bold text-success flex items-center gap-1">Cleared <span className="text-sm">✓</span></p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {vendors.length === 0 && search === '' && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">No vendors yet</h3>
          <p className="text-sm text-slate-500 mb-4">Add your first vendor to start tracking purchases.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-light transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Vendor
          </button>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
            />
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl shadow-card-lg w-full max-w-md pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800">Add New Vendor</h3>
                  <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleAddVendor} className="p-6 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Vendor Name *</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="e.g. Shell Petroleum"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone Number</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="03XX XXXXXXX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Address (Optional)</label>
                    <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                      placeholder="Vendor address..."
                    />
                  </div>
                  
                  <div className="pt-2">
                    <button type="submit" disabled={loading}
                      className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-light focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-70"
                    >
                      {loading ? 'Saving...' : 'Save Vendor'}
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
