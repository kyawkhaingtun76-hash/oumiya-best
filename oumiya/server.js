const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const app = express();

// ==========================================
// 🔥 FIREBASE INITIALIZATION
// ==========================================
console.log('[Firebase Init] Checking environment variables...');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✓ Set' : '✗ MISSING');
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✓ Set' : '✗ MISSING');
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✓ Set' : '✗ MISSING');
console.log('FIREBASE_STORAGE_BUCKET:', process.env.FIREBASE_STORAGE_BUCKET ? '✓ Set' : '✗ MISSING');

let bucket = null;
if (admin.apps.length === 0 && process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    bucket = admin.storage().bucket();
    console.log('[Firebase Init] ✓ Successfully initialized');
  } catch (error) {
    console.error('[Firebase Init] ✗ Failed to initialize:', error.message);
  }
} else if (!process.env.FIREBASE_PROJECT_ID) {
  console.warn('[Firebase Init] ⚠️  Environment variables not set. Image uploads will fail.');
}

// ==========================================
// ✅ ENHANCED CORS CONFIGURATION
// ==========================================
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from localhost (local dev), Render server, and the admin panel
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
// 💾 FIREBASE STORAGE CONFIGURATION (MULTER)
// ==========================================
const storage = multer.memoryStorage(); // Store in memory temporarily

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

// 1. Firebase Image Upload Endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!bucket) {
      console.error('[Upload] Firebase not initialized - missing env vars');
      return res.status(500).json({ 
        success: false, 
        message: 'Firebaseが初期化されていません。管理者にご連絡ください。' 
      });
    }

    if (!req.file) {
      console.error('[Upload] No file provided');
      return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません。' });
    }

    console.log('[Upload] Starting upload for:', req.file.originalname);

    // Generate unique filename
    const uniqueSuffix = Date.now() + '_' + req.file.originalname.replace(/\s+/g, '_');
    const filePath = `uploads/${uniqueSuffix}`;

    // Upload to Firebase Storage
    const file = bucket.file(filePath);
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    // Make file publicly accessible
    await file.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${process.env.FIREBASE_STORAGE_BUCKET}/${filePath}`;
    
    console.log(`[Upload Success] Image uploaded to Firebase: ${publicUrl}`);
    return res.json({ success: true, path: publicUrl });

  } catch (error) {
    console.error('[Upload Error]', error.message);
    res.status(500).json({ success: false, message: `サーバーエラー: ${error.message}` });
  }
});

// 2. Load Master Data (from local file for now)
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
  if (bucket) {
    console.log(`🔥 Firebase Storage enabled`);
  } else {
    console.log(`⚠️  Firebase Storage NOT available - set environment variables`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
