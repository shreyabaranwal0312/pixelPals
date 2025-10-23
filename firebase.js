// Firebase configuration
// IMPORTANT: Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDwT3bA9YhV2QLxdEfQhzgxwsXzO39qT34",
  authDomain: "pixelpals-d30df.firebaseapp.com",
  databaseURL: "https://pixelpals-d30df-default-rtdb.firebaseio.com",
  projectId: "pixelpals-d30df",
  storageBucket: "pixelpals-d30df.firebasestorage.app",
  messagingSenderId: "516544089791",
  appId: "1:516544089791:web:9f9aeeee9b01699b2d400a",
  measurementId: "G-8Z1C1GEZR1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

console.log('Firebase initialized successfully');
