import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
const auth = getAuth(app);

async function check() {
  try {
     console.log('Authenticating...');
     // we don't have the password, we can't do this easily.
     process.exit(1);
  } catch (err) {
     console.error(err);
     process.exit(1);
  }
}
check();
