const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🛠️ SMART PATH AUTO-DETECTION FOR HTML FILES
// ==========================================
// This automatically finds where index.html and admin.html are hidden!
let staticDir = __dirname; // Option 1: inside /oumiya/

if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  staticDir = path.join(__dirname, 'public'); // Option 2: inside /oumiya/public/
} else if (fs.existsSync(path.join(__dirname, '..', 'index.html'))) {
  staticDir = path.join(__dirname, '..'); // Option 3: outside in the main root folder /
}

console.log(`[Static Serving] HTML/CSS assets are being served from: ${staticDir}`);
app.use(express.static(staticDir));

// ==========================================
// 🔥 1. FIREBASE SECURE INITIALIZATION
// ==========================================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const bucket = admin.storage().bucket();
const db = admin.firestore(); // Firestore database for permanent data retention

// Default structural layout if your database is brand new and empty
const DEFAULT_DATA = {
  topBannerText: "いらっしゃいませ！居酒屋 おうみや へようこそ！",
  categories: [
    { key: "cat_recommend", label: "店主イチオシ" },
    { key: "cat_food", label: "お料理" },
    { key: "cat_drink", label: "お酒・ドリンク" }
  ],
  specialRecommendation: { items: [], footer: { open: "17:00 - 24:00", extra: "売切御免" } },
  galleryData: [],
  menuData: []
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ==========================================
// 📥 ENDPOINT: FETCH PERMANENT FIREBASE DATA
// ==========================================
app.get('/api/site-data', async (req, res) => {
  try {
    const doc = await db.collection('site').doc('masterData').get();
    if (!doc.exists) {
      // If Firestore is empty, return defaults so the page loads successfully
      return res.json(DEFAULT_DATA);
    }
    res.json(doc.data());
  } catch (error) {
    console.error("Error fetching from Firestore:", error);
    res.status(500).json({ error: "Failed to read database data" });
  }
});

// ==========================================
// 📤 ENDPOINT: SAVE PERMANENT FIREBASE DATA
// ==========================================
app.post('/api/site-data', async (req, res) => {
  try {
    if (req.body) {
      // Saves menus and Today's Special items safely in the cloud forever
      await db.collection('site').doc('masterData').set(req.body);
      return res.json({ success: true, message: "変更がデータベースに永久保存されました！" });
    }
    res.status(400).json({ success: false, message: "無効なデータ送信です。" });
  } catch (error) {
    console.error("Error saving to Firestore:", error);
    res.status(500).json({ success: false, message: "データベースへの保存に失敗しました。" });
  }
});

// ==========================================
// 📸 ENDPOINT: IMAGE UPLOAD TO FIREBASE
// ==========================================
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ファイルが選択されていません。' });
    }

    const fileName = `uploads/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const file = bucket.file(fileName);

    const stream = file.createWriteStream({
      metadata: { contentType: req.file.mimetype },
    });

    stream.on('error', (error) => {
      console.error('Firebase Upload Error:', error);
      res.status(500).json({ success: false, message: 'アップロードに失敗しました。' });
    });

    stream.on('finish', async () => {
      try {
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        return res.json({ success: true, path: publicUrl });
      } catch (err) {
        const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '01-01-2099' });
        return res.json({ success: true, path: signedUrl });
      }
    });

    stream.end(req.file.buffer);
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
  }
});

// Wildcard fallback to cleanly route users back to your homepage safely
app.get('*', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html could not be located. Please check your repository folders.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Production database server online on port ${PORT}`);
});
