// Firebase Console → Project settings → Your apps → Web app config
const firebaseConfig = {
  apiKey: "AIzaSyCwVC8fSyuQ3YVdoVtSBrw1ThQwYdL3i-s",
  authDomain: "practice-b23d7.firebaseapp.com",
  databaseURL: "https://practice-b23d7-default-rtdb.firebaseio.com",
  projectId: "practice-b23d7",
  storageBucket: "practice-b23d7.firebasestorage.app",
  messagingSenderId: "660147278986",
  appId: "1:660147278986:web:c327131147de6dbdeb8973",
  measurementId: "G-M1R52E0G4N"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
