const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve HTML, CSS, JS, Images
app.use(express.static("public"));

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return {
                topBannerText: "本日も元気に営業中！",
                categories: [],
                galleryData: [],
                menuData: [],
                specialRecommendation: {
                    badge: "",
                    subtitle: "",
                    title: "",
                    footer: {},
                    items: []
                }
            };
        }

        return JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

    } catch (err) {
        console.error(err);

        return {
            topBannerText: "",
            categories: [],
            galleryData: [],
            menuData: [],
            specialRecommendation: {
                items: [],
                footer: {}
            }
        };
    }
}

function saveData(data) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

// ====================================
// GET SITE DATA
// ====================================

app.get("/api/site-data", (req, res) => {

    try {

        const data = loadData();

        res.json(data);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// ====================================
// SAVE SITE DATA
// ====================================

app.post("/api/site-data", (req, res) => {

    try {

        saveData(req.body);

        res.json({
            success: true,
            message: "Data saved successfully"
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// ====================================
// HEALTH CHECK
// ====================================

app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        server: "Oumiya Backend",
        time: new Date()
    });

});

// ====================================

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});