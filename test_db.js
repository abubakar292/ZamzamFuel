import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCjnWrtrP7m1ChTFCZxpdT5CsOUvQMJ_Uc",
  authDomain: "zamzam-fuel.firebaseapp.com",
  projectId: "zamzam-fuel",
  storageBucket: "zamzam-fuel.firebasestorage.app",
  messagingSenderId: "843215717924",
  appId: "1:843215717924:web:6894ee0d520d785ecfbab1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  try {
     console.log('Testing write access...');
     await setDoc(doc(db, 'appSettings', 'testWrite'), { timestamp: Date.now() });
     console.log('Write successful');
     process.exit(0);
  } catch (err) {
     console.error(err);
     process.exit(1);
  }
}
check();
