const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/pages/FuelManagementPage.tsx',
  'src/pages/VendorsPage.tsx',
  'src/pages/ReportPage.tsx',
  'src/pages/PurchasesPage.tsx',
  'src/pages/ExpensesPage.tsx',
  'src/pages/VendorDetailPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/components/layout/Navbar.tsx',
  'src/utils/recalculate.ts'
];

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Add getUserCollection and getUserDoc to imports from firebase
  if (!content.includes('getUserCollection')) {
    content = content.replace(/import \{ db \} from '\.\.\/lib\/firebase';/g, "import { db, getUserCollection, getUserDoc } from '../lib/firebase';");
    content = content.replace(/import \{ db \} from '\.\/lib\/firebase';/g, "import { db, getUserCollection, getUserDoc } from './lib/firebase';");
  }

  // Replace collection(db, 'name') -> getUserCollection('name')
  content = content.replace(/collection\(\s*db\s*,\s*'([^']+)'\s*\)/g, "getUserCollection('$1')");
  
  // Replace doc(db, 'col', 'id') -> getUserDoc('col', 'id')
  // We need to be careful not to replace doc(collection(db, ...))
  content = content.replace(/doc\(\s*db\s*,\s*'([^']+)'\s*,\s*([^)]+)\s*\)/g, "getUserDoc('$1', $2)");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

filesToUpdate.forEach(replaceInFile);
