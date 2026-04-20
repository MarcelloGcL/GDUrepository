import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB-z-kRaeZ8_Rsf1F-kImRD4SCJuZ_qhKA",
  authDomain: "gestao-unidades.firebaseapp.com",
  projectId: "gestao-unidades",
  storageBucket: "gestao-unidades.firebasestorage.app",
  messagingSenderId: "1008977472635",
  appId: "1:1008977472635:web:c7fa574f0828daa53106de"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);