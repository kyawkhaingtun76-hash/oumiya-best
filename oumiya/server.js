const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ===============================
// FIREBASE ADMIN
// ===============================

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    })
});

const db = admin.firestore();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// ===============================
// AUTH MIDDLEWARE
// ===============================

async function verifyAdmin(req, res, next) {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No token"
            });
        }

        const token = authHeader.split("Bearer ")[1];

        const decoded = await admin
            .auth()
            .verifyIdToken(token);

        if (decoded.email !== ADMIN_EMAIL) {
            return res.status(403).json({
                success: false,
                message: "Not admin"
            });
        }

        req.user = decoded;

        next();

    } catch (err) {

        console.error(err);

        res.status(401).json({
            success: false,
            message: "Unauthorized"
        });

    }

}

// ===============================
// GET SITE DATA
// ===============================

app.get("/api/site-data", async (req, res) => {

    try {

        const doc = await db
            .collection("siteData")
            .doc("main")
            .get();

        if (!doc.exists) {

            return res.json({
                topBannerText: "",
                categories: [],
                galleryData: [],
                menuData: [],
                specialRecommendation: {
                    items: [],
                    footer: {}
                }
            });

        }

        res.json(doc.data());

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// ===============================
// SAVE SITE DATA
// ===============================

app.post(
    "/api/site-data",
    verifyAdmin,
    async (req, res) => {

        try {

            await db
                .collection("siteData")
                .doc("main")
                .set(req.body);

            res.json({
                success: true,
                message: "Saved successfully"
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        service: "Oumiya Restaurant API",
        timestamp: new Date()
    });

});

// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});
