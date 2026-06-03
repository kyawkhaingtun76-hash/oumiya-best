const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const app = express();

// ==========================================
// 🔥 FIREBASE INITIALIZATION (AUTH ONLY)
// ==========================================
console.log('[Firebase Init] Checking environment variables...');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✓ Set' : '✗ MISSING');
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✓ Set' : '✗ MISSING');
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✓ Set' : '✗ MISSING');

let authObj = null;
if (admin.apps.length === 0 && process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    authObj = admin.auth();
    console.log('[Firebase Init] ✓ Successfully initialized for Authentication');
  } catch (error) {
    console.error('[Firebase Init] ✗ Failed to initialize:', error.message);
  }
} else if (!process.env.FIREBASE_PROJECT_ID) {
  console.warn('[Firebase Init] ⚠️  Environment variables not set. Google Auth will not work.');
}

// ==========================================
// 🛠️ LOCAL STORAGE SETUP (NO CLOUD STORAGE)
// ==========================================
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`[Storage] Created uploads directory: ${UPLOADS_DIR}`);
}

console.log(`[Storage] Using local file storage at: ${UPLOADS_DIR}`);

// ==========================================
// ✅ CORS CONFIGURATION
// ==========================================
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost',
      'http://localhost:8080',
      'http://127.0.0.1',
      'http://127.0.0.1:8080',
      'https://oumiya-best.onrender.com',
    ];
    
    if (!origin || allowedOrigins.some(allowed => origin.includes(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
};

app.use(cors(corsOptions));
app.use(express.json());

// ==========================================
// 🛠️ PATH SETUP FOR STATIC FILES
// ==========================================
let staticDir = __dirname;
if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  staticDir = path.join(__dirname, 'public');
} else if (fs.existsSync(path.join(__dirname, '..', 'index.html'))) {
  staticDir = path.join(__dirname, '..');
}

console.log(`[Static Serving] HTML/CSS assets are being served from: ${staticDir}`);
app.use(express.static(staticDir));

// ==========================================
// 💾 LOCAL FILE STORAGE CONFIGURATION (MULTER)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '_' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ==========================================
// 🛰️ API ENDPOINTS
// ==========================================

// 1. Local Image Upload Endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('[Upload] No file provided');
      return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません。' });
    }

    console.log('[Upload] Starting upload for:', req.file.originalname);

    // Generate public URL
    const publicUrl = `/uploads/${req.file.filename}`;
    
    console.log(`[Upload] ✓ Success: ${publicUrl}`);
    return res.json({ success: true, path: publicUrl });

  } catch (error) {
    console.error('[Upload Error]', error.message);
    res.status(500).json({ success: false, message: `アップロードエラー: ${error.message}` });
  }
});

// 2. Load Master Data (from local file)
const DATA_FILE_PATH = path.join(staticDir, 'master-data.json');

app.get('/api/site-data', (req, res) => {
  if (fs.existsSync(DATA_FILE_PATH)) {
    try {
      const rawData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
      return res.json(JSON.parse(rawData));
    } catch (e) {
      console.error("Failed to read master-data.json, falling back.");
    }
  }
  // Return empty fallback structure if file doesn't exist yet
  res.json({
    topBannerText: "いらっしゃいませ！",
    categories: [],
    menuData: [],
    galleryData: [],
    specialRecommendation: { items: [], footer: {} }
  });
});

// 3. Save Master Data
app.post('/api/site-data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    console.log(`[Save Success] Master data saved to ${DATA_FILE_PATH}`);
    res.json({ success: true, message: '設定がローカルファイルに保存されました！' });
  } catch (error) {
    console.error('Save Data Error:', error);
    res.status(500).json({ success: false, message: 'データの保存に失敗しました。' });
  }
});

// 4. Firebase ID Token Verification (optional - for future use)
app.post('/api/verify-token', async (req, res) => {
  if (!authObj) {
    return res.status(500).json({ success: false, message: 'Firebase Auth not initialized' });
  }

  const { idToken } = req.body;
  try {
    const decodedToken = await authObj.verifyIdToken(idToken);
    res.json({ success: true, uid: decodedToken.uid, email: decodedToken.email });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Wildcard fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Start server - BIND TO 0.0.0.0 FOR RENDER
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Oumiya Server running on ${HOST}:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Local file storage enabled (no Cloud Storage costs)`);
  if (authObj) {
    console.log(`🔐 Firebase Authentication enabled`);
  } else {
    console.log(`⚠️  Firebase Authentication NOT available - set environment variables`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
