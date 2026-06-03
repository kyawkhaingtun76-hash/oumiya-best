const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve all static files (like admin.html) from the current directory
app.use(express.static(__dirname));

// 1. Initialize Firebase Admin SDK using Render Environment Variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Fixes potential newline formatting issues in Render
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const bucket = admin.storage().bucket();
const db = admin.firestore(); // Ready if you use Firestore later

// Temporary in-memory fallback database for your site-data configuration
let siteMasterData = {
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

// 2. Configure Multer to use Memory Storage (Crucial for Cloud Services!)
// This holds the file temporarily in RAM instead of creating local files on Render
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per image
  },
});

// ==========================================
// ENDPOINT: IMAGE UPLOAD TO FIREBASE STORAGE
// ==========================================
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません。' });
    }

    // Generate a unique filename to avoid duplicates overwriting each other
    const fileName = `uploads/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const file = bucket.file(fileName);

    // Stream the file directly from memory into Firebase Storage
    const stream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    stream.on('error', (error) => {
      console.error('Firebase Upload Error:', error);
      res.status(500).json({ success: false, message: 'Firebaseへのアップロードに失敗しました。' });
    });

    stream.on('finish', async () => {
      try {
        // Make the file publicly accessible so anyone visiting your website can see it
        await file.makePublic();
        
        // Construct the standard public access URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        
        // Return exact structure expected by your admin.html
        return res.json({
          success: true,
          path: publicUrl
        });
      } catch (err) {
        console.warn('Could not make file public via ACL, attempting Signed URL fallback:', err);
        
        // Fallback: Generate a long-lasting signed URL if your bucket prohibits public ACLs
        try {
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '01-01-2099', 
          });
          return res.json({ success: true, path: signedUrl });
        } catch (signedErr) {
          return res.status(500).json({ success: false, message: '公開URLの生成に失敗しました。' });
        }
      }
    });

    stream.end(req.file.buffer);

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ success: false, message: 'サーバー内部エラーが発生しました。' });
  }
});

// ==========================================
// ENDPOINTS: DATA FETCH & RECOVERY
// ==========================================
app.get('/api/site-data', (req, res) => {
  res.json(siteMasterData);
});

app.post('/api/site-data', (req, res) => {
  if (req.body) {
    siteMasterData = req.body;
    return res.json({ success: true, message: "変更がサーバーに安全に同期されました！" });
  }
  res.status(400).json({ success: false, message: "無効なデータ送信です。" });
});

// Fallback to route any direct hits back to your admin page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Secure Server executing natively on port ${PORT}`);
});
