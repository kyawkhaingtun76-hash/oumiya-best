const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

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
// 🛠️ PATH SETUP FOR STATIC FILES & UPLOADS
// ==========================================
let staticDir = __dirname;
if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  staticDir = path.join(__dirname, 'public');
} else if (fs.existsSync(path.join(__dirname, '..', 'index.html'))) {
  staticDir = path.join(__dirname, '..');
}

console.log(`[Static Serving] HTML/CSS assets are being served from: ${staticDir}`);
app.use(express.static(staticDir));

// Ensure an 'uploads' directory exists inside the static directory
const uploadDir = path.join(staticDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Serve the uploads folder so images can be viewed in the browser
app.use('/uploads', express.static(uploadDir));

// ==========================================
// 💾 LOCAL STORAGE CONFIGURATION (MULTER)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generates a unique filename: timestamp_filename.jpg
    const uniqueSuffix = Date.now() + '_' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueSuffix);
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
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません。' });
    }

    // Build the relative web path for the image
    const publicUrl = `/uploads/${req.file.filename}`;
    console.log(`[Upload Success] Image uploaded: ${publicUrl}`);
    return res.json({ success: true, path: publicUrl });

  } catch (error) {
    console.error('Server Upload Error:', error);
    res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
  }
});

// 2. Load Master Data (Mock JSON or dynamic fallback)
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

// Wildcard fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Oumiya Local Server running cleanly on port ${PORT}`);
  console.log(`📁 Uploads stored in: ${uploadDir}`);
});
