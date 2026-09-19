const fs = require('fs');
let content = fs.readFileSync('src/pages/FuelManagementPage.tsx', 'utf-8');

// Imports
content = content.replace(
  "import { doc, onSnapshot, serverTimestamp, writeBatch, collection } from 'firebase/firestore';",
  "import { doc, onSnapshot, serverTimestamp, writeBatch, collection, query, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';\nimport { recalculateDatabase } from '../utils/recalculate';\nimport { Edit3, X } from 'lucide-react';\nimport { AnimatePresence, motion } from 'framer-motion';"
);

// State variables
const stateHookPos = content.indexOf("const [saving, setSaving] = useState(false);");
const stateVars = `const [saving, setSaving] = useState(false);
  
  // Recent Readings & Editing
  const [recentReadings, setRecentReadings] = useState<FuelReading[]>([]);
  const [editingReading, setEditingReading] = useState<FuelReading | null>(null);
  const [editPClosing, setEditPClosing] = useState('');
  const [editDClosing, setEditDClosing] = useState('');
  const [editSaving, setEditSaving] = useState(false);
`;
content = content.replace("const [saving, setSaving] = useState(false);", stateVars);

// Fetch recent readings
const useEffectContent = `
  useEffect(() => {
    const fetchRecent = async () => {
      const q = query(collection(db, 'fuelReadings'), orderBy('date', 'desc'), limit(5));
      const snap = await getDocs(q);
      const readings = snap.docs.map(d => ({ ...d.data(), id: d.id } as FuelReading));
      setRecentReadings(readings);
    };
    fetchRecent();
    
    // Also re-fetch when saving happens, we can hook it into the onSnapshot or do it manually
  }, [saving, editSaving]);
`;

// Insert the new useEffect right before `const pClosingNum = parseFloat(pClosing) || 0;`
content = content.replace("const pClosingNum = parseFloat(pClosing) || 0;", `${useEffectContent}\n\n  const pClosingNum = parseFloat(pClosing) || 0;`);

// Edit Logic
const editLogic = `
  const handleEditSave = async () => {
    if (!editingReading || !settings) return;
    setEditSaving(true);
    try {
      const newPClosing = parseFloat(editPClosing) || 0;
      const newDClosing = parseFloat(editDClosing) || 0;
      
      const newPSold = Math.max(0, newPClosing - editingReading.petrolLastReading);
      const newDSold = Math.max(0, newDClosing - editingReading.dieselLastReading);
      
      const newPAmount = dailyAmount(newPSold, editingReading.petrolSalePrice);
      const newDAmount = dailyAmount(newDSold, editingReading.dieselSalePrice);
      const newSubtotal = newPAmount + newDAmount;

      await updateDoc(doc(db, 'fuelReadings', editingReading.id!), {
        petrolClosingReading: newPClosing,
        petrolSold: newPSold,
        petrolAmount: newPAmount,
        dieselClosingReading: newDClosing,
        dieselSold: newDSold,
        dieselAmount: newDAmount,
        subtotal: newSubtotal,
      });

      // Recalculate whole db to fix stock and current reading correctly
      await recalculateDatabase();

      showToast('Reading updated successfully', 'success');
      setEditingReading(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to update reading', 'error');
    } finally {
      setEditSaving(false);
    }
  };
`;

content = content.replace("const handleSave = async () => {", `${editLogic}\n\n  const handleSave = async () => {`);

// UI - recent list & edit modal
const recentListUI = `
      {/* Recent Readings List */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Entries</h3>
        {recentReadings.length === 0 ? (
          <p className="text-slate-500 text-sm">No recent entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Petrol Closing</th>
                  <th className="pb-3 font-semibold">Diesel Closing</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentReadings.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 font-medium text-slate-700">{format(r.date.toMillis(), 'dd MMM yyyy')}</td>
                    <td className="py-3 text-slate-600">{r.petrolClosingReading} L</td>
                    <td className="py-3 text-slate-600">{r.dieselClosingReading} L</td>
                    <td className="py-3 text-right">
                      <button 
                        onClick={() => {
                          setEditingReading(r);
                          setEditPClosing(r.petrolClosingReading.toString());
                          setEditDClosing(r.dieselClosingReading.toString());
                        }}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingReading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
              onClick={() => !editSaving && setEditingReading(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" /> Edit Reading
                </h3>
                <button onClick={() => !editSaving && setEditingReading(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm mb-4">
                  Editing this reading will automatically recalculate today's current stock and readings.
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Petrol Closing Reading (L)</label>
                  <input 
                    type="number" step="0.01" value={editPClosing} onChange={e => setEditPClosing(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-petrol/20 text-lg font-bold"
                  />
                  <p className="text-xs text-slate-500 mt-1">Last Reading: {editingReading.petrolLastReading} L</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Diesel Closing Reading (L)</label>
                  <input 
                    type="number" step="0.01" value={editDClosing} onChange={e => setEditDClosing(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-diesel/20 text-lg font-bold"
                  />
                  <p className="text-xs text-slate-500 mt-1">Last Reading: {editingReading.dieselLastReading} L</p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => !editSaving && setEditingReading(null)}
                  className="flex-1 py-3 px-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditSave} disabled={editSaving}
                  className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Update Reading'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
`;

const splitTarget = "{/* Footer Subtotal */}";
content = content.replace(splitTarget, `${recentListUI}\n\n      ${splitTarget}`);

fs.writeFileSync('src/pages/FuelManagementPage.tsx', content);
