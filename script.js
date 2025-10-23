// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const authModal = document.getElementById('authModal');
const appContent = document.getElementById('appContent');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authError = document.getElementById('authError');
const userEmail = document.getElementById('userEmail');
const connectionStatus = document.getElementById('connectionStatus');
const lastSaved = document.getElementById('lastSaved');

// Canvas Elements
const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const colorPicker = document.getElementById('colorPicker');
const brushSizeInput = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const eraseBtn = document.getElementById('eraseBtn');

// Canvas State
const cellSize = 8;
const cols = Math.floor(canvas.width / cellSize);
const rows = Math.floor(canvas.height / cellSize);
let grid = Array.from({ length: rows }, () => Array(cols).fill('#081226'));
let drawing = false;
let isErasing = false;
let brushSize = 2;
let currentUser = null;
let unsubscribe = null;

// Firestore reference
const canvasDocRef = doc(db, 'canvases', 'shared');

// Authentication Functions
async function signUp() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    authError.textContent = '';
  } catch (error) {
    showError(error.message);
  }
}

async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authError.textContent = '';
  } catch (error) {
    showError(error.message);
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function showError(message) {
  authError.textContent = message;
  setTimeout(() => {
    authError.textContent = '';
  }, 5000);
}

// Auth state observer
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  
  if (user) {
    authModal.style.display = 'none';
    appContent.style.display = 'block';
    userEmail.textContent = user.email;
    logoutBtn.style.display = 'inline-block';
    initializeCanvas();
    setupRealtimeSync();
    updateConnectionStatus(true);
  } else {
    authModal.style.display = 'flex';
    appContent.style.display = 'none';
    userEmail.textContent = '';
    logoutBtn.style.display = 'none';
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    updateConnectionStatus(false);
  }
});

// Canvas Functions
function renderGrid() {
  ctx.fillStyle = '#081226';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = grid[r][c];
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, rows * cellSize);
    ctx.stroke();
  }
  
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(cols * cellSize, y * cellSize);
    ctx.stroke();
  }
}

function getCellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return {
    r: Math.floor(y / cellSize),
    c: Math.floor(x / cellSize)
  };
}

function paintAt(r, c, color) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;

  const finalColor = isErasing ? '#081226' : color;
  const half = Math.floor(brushSize / 2);

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const rr = r + dy;
      const cc = c + dx;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
        grid[rr][cc] = finalColor;
      }
    }
  }
  
  renderGrid();
  saveToFirebaseDebounced();
}

// Firestore Functions
let saveTimeout;
function saveToFirebaseDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await setDoc(canvasDocRef, { 
        grid,
        lastUpdated: new Date().toISOString(),
        updatedBy: currentUser.email
      });
      updateLastSaved();
    } catch (error) {
      console.error('Save error:', error);
    }
  }, 500);
}

async function saveCanvas() {
  try {
    await setDoc(canvasDocRef, { 
      grid,
      lastUpdated: new Date().toISOString(),
      updatedBy: currentUser.email
    });
    updateLastSaved();
    alert('Canvas saved successfully!');
  } catch (error) {
    console.error('Save error:', error);
    alert('Error saving canvas');
  }
}

async function loadCanvas() {
  try {
    const snap = await getDoc(canvasDocRef);
    if (snap.exists()) {
      grid = snap.data().grid;
      renderGrid();
      alert('Canvas loaded successfully!');
    } else {
      alert('No saved canvas found');
    }
  } catch (error) {
    console.error('Load error:', error);
    alert('Error loading canvas');
  }
}

function setupRealtimeSync() {
  unsubscribe = onSnapshot(canvasDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.updatedBy !== currentUser.email) {
        grid = data.grid;
        renderGrid();
      }
      updateConnectionStatus(true);
    }
  }, (error) => {
    console.error('Sync error:', error);
    updateConnectionStatus(false);
  });
}

async function initializeCanvas() {
  try {
    const snap = await getDoc(canvasDocRef);
    if (snap.exists()) {
      grid = snap.data().grid;
    } else {
      await setDoc(canvasDocRef, { 
        grid,
        lastUpdated: new Date().toISOString(),
        updatedBy: currentUser.email
      });
    }
    renderGrid();
  } catch (error) {
    console.error('Initialization error:', error);
    renderGrid();
  }
}

// UI Functions
function updateConnectionStatus(connected) {
  connectionStatus.textContent = connected ? '🟢 Connected' : '🔴 Offline';
}

function updateLastSaved() {
  const now = new Date();
  lastSaved.textContent = `Last saved: ${now.toLocaleTimeString()}`;
}

// Event Listeners
loginBtn.addEventListener('click', login);
signupBtn.addEventListener('click', signUp);
logoutBtn.addEventListener('click', logout);

emailInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') passwordInput.focus();
});

passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

canvas.addEventListener('mousedown', (e) => {
  drawing = true;
  const { r, c } = getCellFromEvent(e);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  const { r, c } = getCellFromEvent(e);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('mouseup', () => {
  drawing = false;
});

canvas.addEventListener('mouseleave', () => {
  drawing = false;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  drawing = true;
  const touch = e.touches[0];
  const { r, c } = getCellFromEvent(touch);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!drawing) return;
  const touch = e.touches[0];
  const { r, c } = getCellFromEvent(touch);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('touchend', () => {
  drawing = false;
});

brushSizeInput.addEventListener('input', () => {
  brushSize = parseInt(brushSizeInput.value);
  brushSizeValue.textContent = brushSize;
});

eraseBtn.addEventListener('click', () => {
  isErasing = !isErasing;
  eraseBtn.textContent = isErasing ? '✏️ Draw' : '🧹 Erase';
  eraseBtn.classList.toggle('active', isErasing);
});

clearBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear the entire canvas?')) {
    grid = Array.from({ length: rows }, () => Array(cols).fill('#081226'));
    renderGrid();
    await saveCanvas();
  }
});

saveBtn.addEventListener('click', saveCanvas);
loadBtn.addEventListener('click', loadCanvas);

// Initial render
renderGrid();