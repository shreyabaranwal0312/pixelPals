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
const canvasDocRef = db.collection('canvases').doc('shared');

// Authentication Functions
async function signUp() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }

  if (password.length < 6) {
    showError('Password should be at least 6 characters');
    return;
  }
  
  try {
    showError('Creating account...');
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    console.log('User created:', userCredential.user.email);
    authError.textContent = '';
  } catch (error) {
    console.error('Signup error:', error);
    showError(getErrorMessage(error.code));
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
    showError('Logging in...');
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    console.log('User logged in:', userCredential.user.email);
    authError.textContent = '';
  } catch (error) {
    console.error('Login error:', error);
    showError(getErrorMessage(error.code));
  }
}

async function logout() {
  try {
    await auth.signOut();
    console.log('User logged out');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function getErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'Email is already registered';
    case 'auth/weak-password':
      return 'Password is too weak (min 6 characters)';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/user-not-found':
      return 'No user found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/network-request-failed':
      return 'Network error - check your connection';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Try again later';
    case 'auth/operation-not-allowed':
      return 'Email/password auth not enabled in Firebase';
    default:
      return errorCode || 'Authentication error';
  }
}

function showError(message) {
  authError.textContent = message;
  if (message !== 'Creating account...' && message !== 'Logging in...') {
    setTimeout(() => {
      authError.textContent = '';
    }, 5000);
  }
}

// Auth state observer
auth.onAuthStateChanged((user) => {
  currentUser = user;
  
  if (user) {
    console.log('User authenticated:', user.email);
    authModal.style.display = 'none';
    appContent.style.display = 'block';
    userEmail.textContent = user.email;
    logoutBtn.style.display = 'inline-block';
    initializeCanvas();
    setupRealtimeSync();
    updateConnectionStatus(true);
  } else {
    console.log('User not authenticated');
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
    if (!currentUser) return;
    try {
      await canvasDocRef.set({ 
        grid,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.email
      });
      updateLastSaved();
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, 500);
}

async function saveCanvas() {
  if (!currentUser) {
    alert('Please login first');
    return;
  }
  
  try {
    await canvasDocRef.set({ 
      grid,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email
    });
    updateLastSaved();
    alert('Canvas saved successfully!');
  } catch (error) {
    console.error('Save error:', error);
    alert('Error saving canvas: ' + error.message);
  }
}

async function loadCanvas() {
  if (!currentUser) {
    alert('Please login first');
    return;
  }
  
  try {
    const doc = await canvasDocRef.get();
    if (doc.exists) {
      grid = doc.data().grid;
      renderGrid();
      alert('Canvas loaded successfully!');
    } else {
      alert('No saved canvas found');
    }
  } catch (error) {
    console.error('Load error:', error);
    alert('Error loading canvas: ' + error.message);
  }
}

function setupRealtimeSync() {
  if (!currentUser) return;
  
  unsubscribe = canvasDocRef.onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.updatedBy && data.updatedBy !== currentUser.email) {
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
  if (!currentUser) return;
  
  try {
    const doc = await canvasDocRef.get();
    if (doc.exists) {
      grid = doc.data().grid;
    } else {
      await canvasDocRef.set({ 
        grid,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
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
  if (!currentUser) return;
  drawing = true;
  const { r, c } = getCellFromEvent(e);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('mousemove', (e) => {
  if (!drawing || !currentUser) return;
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
  if (!currentUser) return;
  e.preventDefault();
  drawing = true;
  const touch = e.touches[0];
  const { r, c } = getCellFromEvent(touch);
  paintAt(r, c, colorPicker.value);
});

canvas.addEventListener('touchmove', (e) => {
  if (!drawing || !currentUser) return;
  e.preventDefault();
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
  if (!currentUser) {
    alert('Please login first');
    return;
  }
  
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

// Log Firebase status
console.log('App initialized. Waiting for authentication...');
