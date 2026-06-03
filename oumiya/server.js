const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves your index.html and admin.html

// ==========================================
// 1. FIREBASE SECURE INITIALIZATION
// ==========================================
// These values come from Render Environment Variables. NEVER hardcode them here.
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace string literal \n with actual newlines
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "oumiya-a1fc6.appspot.com" // Your exact bucket name
});

const bucket = admin.storage().bucket();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "kd1427178@st.kobedenshi.ac.jp";

// Multer config: keep file in memory so we can send it to Firebase directly
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ==========================================
// 2. SECURITY MIDDLEWARE
// ==========================================
// This protects your POST routes. It checks if the user has a valid Firebase token.
async function verifyAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        // Double-check: Is the token owner the whitelisted admin?
        if (decodedToken.email !== ADMIN_EMAIL) {
            return res.status(403).json({ success: false, message: 'Forbidden: Not an admin account' });
        }
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
}

// ==========================================
// 3. API ROUTES
// ==========================================

// GET: Read data (Public)
app.get('/api/site-data', async (req, res) => {
    try {
        // You can easily upgrade this to fetch from Firestore later.
        // For now, reading from local JSON is fine if Render has persistent disk, 
        // OR you can keep using Firestore. Here is the local JSON fallback:
        const dataPath = path.join(__dirname, 'data.json');
        if (fs.existsSync(dataPath)) {
            const data = fs.readFileSync(dataPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({}); 
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// POST: Save data (PROTECTED)
app.post('/api/site-data', verifyAdminAuth, async (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true, message: 'データを安全に保存しました' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to save data' });
    }
});

// POST: Upload Image to Firebase Storage (PROTECTED)
app.post('/api/upload-image', verifyAdminAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '画像が選択されていません' });
        }

        const fileName = `uploads/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const fileUpload = bucket.file(fileName);

        // Define stream to upload to Firebase
        const blobStream = fileUpload.createWriteStream({
            metadata: {
                contentType: req.file.mimetype
            }
        });

        blobStream.on('error', (error) => {
            console.error("Firebase Storage Upload Error:", error);
            res.status(500).json({ success: false, message: '画像のアップロードに失敗しました' });
        });

        blobStream.on('finish', async () => {
            // Make the file public so the website can see it
            await fileUpload.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            res.json({ success: true, path: publicUrl });
        });

        // Start upload
        blobStream.end(req.file.buffer);

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

app.listen(PORT, () => {
    console.log(`Secure server running on port ${PORT}`);
});
