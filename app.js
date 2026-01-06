
require("dotenv").config();
const express = require("express");
const path = require("path");
const axios = require("axios");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const { name } = require("ejs");

const app = express();
const PORT = process.env.PORTnumber || 3000;

// ------------------ PERSISTENT TRANSLATION CACHE ------------------
// Cache file path to stores translation on disk so it survive server restarts
const CACHE_FILE = path.join(__dirname, 'translation_cache.json');

// In-memory cache for fast access
let translationCache = {};

// Load cache from file on startup
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      translationCache = JSON.parse(data);
      console.log(`[CACHE] Loaded translations from file: `, Object.keys(translationCache));
    } else {
      console.log(`[CACHE] No cache file found, starting fresh`);
      translationCache = {};
    }
  } catch (err) {
    console.error('[CACHE] Error loading cache file:', err.message);
    translationCache = {};
  }
}

// Save cache to file (debounced to avoid excessive writes)
let saveTimeout = null;
function saveCacheToFile() {
  // Debounce: wait 5 seconds before actually writing to disk
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(translationCache, null, 2));
      console.log(`[CACHE] Saved translations to file:`, Object.keys(translationCache));
    } catch (err) {
      console.error('[CACHE] Error saving cache file:', err.message);
    }
  }, 5000);
}

// Initialize cache on startup
loadCacheFromFile();

// ------------------ MIDDLEWARE ------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ------------------ SERVICENOW CONFIG ------------------
const SN_INSTANCE = process.env.sn_instance;
const SN_USER = process.env.snow_username;
const SN_PASS = process.env.snow_password;

async function getElderlyByUsername(username) {
  try {
    logAuth("ServiceNow lookup started", username);

    // Look in ServiceNow Table
    const res = await axios.get(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data`,
      {
        params: {
          sysparm_query: `u_elderly_username=${username}`,
          sysparm_limit: 1
        },
        auth: {
          username: SN_USER,
          password: SN_PASS
        },
        timeout: 8000
      }
    );

    // User NOT Found
    if (!res.data?.result?.length) {
      logAuth("User not found in ServiceNow", username);
      return null;
    }

    // User Found
    logAuth("Elder:", res.data.result[0].name);
    logAuth("Username:", res.data.result[0].u_elderly_username);
    logAuth("User SYS ID:", res.data.result[0].sys_id);
    return res.data.result[0];

    // ServiceNow errors
  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      logAuth("ServiceNow unreachable", err.code);
    } else if (err.response) {
      logAuth(
        "ServiceNow error response",
        `Status ${err.response.status}`
      );
    } else {
      logAuth("Unknown ServiceNow error", err.message);
    }
    throw err;
  }
}

// Get Elderly via sys_id
async function getElderlyBySysId(sys_id) {
  const res = await axios.get(
    `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${sys_id}`,
    { auth: { username: SN_USER, password: SN_PASS } }
  );
  return res.data.result;
}


// Helper: GET table from ServiceNow
async function snGet(table, query = "") {
  const url = `${SN_INSTANCE}/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    auth: { username: SN_USER, password: SN_PASS },
  });
  return response.data.result;
}


function getSingaporeTimestamp() {
  const dateObj = new Date();
  const singaporeOffset = 8 * 60; // UTC+8 in minutes
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const singaporeTime = new Date(utc + singaporeOffset * 60000);
  return singaporeTime.toISOString().replace("T", " ").split(".")[0]; // "YYYY-MM-DD HH:mm:ss"
}

// Logger
function logAuth(stage, info = "") {
  console.log(`[AUTH] ${stage}`, info);
}

// ------------------ PASSPORT ------------------
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      logAuth("Login attempt for", username);

      const elderly = await getElderlyByUsername(username);

      if (!elderly) {
        logAuth("Login failed: user not found", username);
        return done(null, false);
      }

      if (!elderly.u_password_hash) {
        logAuth("Login failed: missing password hash for", elderly.sys_id);
        return done(null, false);
      }

      const match = await bcrypt.compare(password, elderly.u_password_hash);

      if (!match) {
        logAuth("Login failed: invalid password for", elderly.sys_id);
        return done(null, false);
      }

      logAuth("Login success:", elderly.sys_id);
      return done(null, elderly);

    } catch (err) {
      logAuth("Login exception", err.message);
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.sys_id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await getElderlyBySysId(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

function requireLogin(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect("/profile");
}

// ------------------ LANGUAGE CODE MAPPING -----------------
// Maps ServiceNow language names to language codes for translation
const LANGUAGE_MAP = {
  'English': 'en',
  'Chinese': 'zh',
  'Malay': 'ms',
  'Tamil': 'ta',
  // Fallback: if ServiceNow stores codes instead 
  'en': 'en',
  'zh': 'zh',
  'ms': 'ms',
  'ta': 'ta'
};

// Helper function to convert language name/code to standard code
function getLanguageCode(langValue) {
  if (!langValue) return 'en';

  // Normalise: trim white and make case-insensitive
  const normalized = langValue.trim().toLowerCase();

  // Check against our map (case-insensitive)
  for (const [key, code] of Object.entries(LANGUAGE_MAP)) {
    if (key.toLowerCase() === normalized) {
      return code;
    }
  }

  // Default to English if no match 
  console.warn(`Unknown language value: ${langValue}, defaulting to English`);
  return 'en';
}

// ------------------ CLOUD TRANSLATION API CONFIG ------------------

// Web App URL (For connecting to Google Web App )
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx-yLPCPqEGCpz5HkM3DDbTbK61E8cdTCir10eB9EGDCCpz9wVMnx4gPk96K5XYYXiTdA/exec';

// Library automatically finds the key based on the environment variable
// Initialize Google Cloud Translation Client
const { Translate } = require('@google-cloud/translate').v2;

// Client uses GOOGLE_APPLICATION_CREDENTIALS environment variable
const translateClient = new Translate();
// no file path is passed here as the environment variable does the work. 

app.post('/api/translate', async (req, res) => {
  // Destructure the array of strings and target language code from the client's request body
  const { texts, targetLang } = req.body;

  // Input validation 
  if (!texts || !targetLang || !Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({
      error: 'Invalid request: Provide an array of texts and a target language code.'
    });
  }

  try {
    // CHECK CACHE FIRST - if translation exists for this language, return them
    if (translationCache[targetLang]) {
      console.log(`[CACHE HIT] Returning cached translations for: ${targetLang}`);

      // Build response from cache - map English texts to their cached translations
      const cachedTranslations = texts.map((text, index) => {
        // The order matches the order in transText.en from script.js
        const keys = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'sorting', 'basket',
          'puzzle', 'puzzleTitle', 'drawAgain', 'fortune', 'text1', 'text2',
          'text3', 'text4', 'text51', 'text52', 'text6', 'omi1', 'omi2',
          'omi3', 'omi4', 'omi5', 'emergency', 'drawStickBtn', 'emergencyConfirm', 'emergencySuccess', 'emergencyError'];
        const key = keys[index];
        return translationCache[targetLang][key] || text;
      });

      return res.json({ translations: cachedTranslations, cached: true });
    }

    // CACHE MISS - need to translate
    console.log(`[CACHE MISS] Translating to: ${targetLang}`);

    // Calls the google cloud translation API
    // texts is an array of strings, targetLang is the code (e.g. 'zh', 'ms')
    let [translations] = await translateClient.translate(texts, targetLang);

    // The API returns an array but ensures it is one for consistency
    if (!Array.isArray(translations)) {
      translations = [translations];
    }

    // Store in cache for future requests
    // Build cache object with keys matching the content structure
    const cacheObj = {
      MORNING: translations[0],
      AFTERNOON: translations[1],
      EVENING: translations[2],
      NIGHT: translations[3],
      sorting: translations[4],
      basket: translations[5],
      puzzle: translations[6],
      puzzleTitle: translations[7],
      drawAgain: translations[8],
      fortune: translations[9],
      text1: translations[10],
      text2: translations[11],
      text3: translations[12],
      text4: translations[13],
      text51: translations[14],
      text52: translations[15],
      text6: translations[16],
      omi1: translations[17],
      omi2: translations[18],
      omi3: translations[19],
      omi4: translations[20],
      omi5: translations[21],
      emergency: translations[22],
      drawStickBtn: translations[23],
      emergencyConfirm: translations[24],
      emergencySuccess: translations[25],
      emergencyError: translations[26]
    };

    // Store in memory cache
    translationCache[targetLang] = cacheObj;

    // Save to disk (debounced)
    saveCacheToFile();

    console.log(`[CACHE STORED] Saved translations for: ${targetLang}`);

    // Send the translated array to the client
    res.json({
      translations: translations,
      cached: false
    });

  } catch (error) {
    // Handle API errors
    console.error('Translation API error:', error.message);
    res.status(500).json({
      error: 'Failed to communicate with the translation service.',
      detail: error.message
    });
  }
});

// ------------------ TRANSLATION CACHE MANAGEMENT ENDPOINTS ------------------

// Get cached translations for a specific language 
app.get('/api/translations/:langCode', (req, res) => {
  const { langCode } = req.params;

  if (translationCache[langCode]) {
    console.log(`[CACHE] Serving cached translations for: ${langCode}`);
    res.json({
      success: true,
      translations: translationCache[langCode],
      cached: true
    });
  } else {
    res.json({
      success: false,
      message: 'No cached translations for this language',
      cached: false
    });
  }
});

// Get all cached languages
app.get('/api/translations', (req, res) => {
  const cachedLanguages = Object.keys(translationCache);
  res.json({
    success: true,
    languages: cachedLanguages,
    cache: translationCache
  });
});

// Clear cache for a specific language (admin endpoint)
app.delete('/api/translations/:langCode', (req, res) => {
  const { langCode } = req.params;

  if (translationCache[langCode]) {
    delete translationCache[langCode];
    saveCacheToFile();
    res.json({
      success: true,
      message: `Cache cleared for ${langCode}`
    });
  } else {
    res.json({
      success: false,
      message: 'No cache found for this language'
    });
  }
});

// Clear all cache (admin endpoint)
app.delete('api/translations', (req, res) => {
  translationCache = {};
  saveCacheToFile();
  res.json({
    success: true,
    message: 'All translation cache cleared'
  });
});

// ------------------ ROUTES ------------------

// Main game page (Fetches language from authenticated user)
app.get("/", requireLogin, async (req, res) => { // async with await
  let preferredLang = 'en'; // Default to English

  // User is authenticated, req.user contains the elderly person's data
  if (req.user) {
    try {
      // Get language preference directly from authenticated user object
      const langPreference = req.user.language_preference || req.user.u_language_preference;

      // Convert language name to code (e.g. "Chinese" -> "zh")
      preferredLang = getLanguageCode(langPreference);

      console.log(`Loading page for ${req.user.name} (${req.user.u_elderly_username}) with language: ${langPreference} (${preferredLang})`);
    } catch (err) {
      console.error("Error fetching language preference on page load:", err.message);
    }
  }

  // Pass the preferred language code to the EJS template
  res.render("index", {
    title: "Senior Support - Home",
    preferredLang: preferredLang,
    user: req.user
  });
});

// Profile / Login
app.get("/profile", (req, res) => {
  res.render("profile", {
    user: req.user || null
  });
});


// Caregiver
app.get("/caregiver", (req, res) => {
  res.render("caregiver", {
    user: req.user || null
  });
});
// app.get("/caregiver", (req,res) => { res.render("caregiver")});

// Login
app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user) => {
    if (err) {
      console.error("[LOGIN] Server error:", err.message);
      return res.status(500).json({ success: false });
    }

    if (!user) {
      console.warn("[LOGIN] Authentication failed");
      return res.status(401).json({ success: false });
    }

    req.logIn(user, err => {
      if (err) {
        console.error("[LOGIN] Session error:", err.message);
        return res.status(500).json({ success: false });
      }

      const oneYear = 365 * 24 * 60 * 60 * 1000;

      res.cookie("elderlyId", user.sys_id, { maxAge: oneYear, path: "/" });
      res.cookie("elderlyName", user.name, { maxAge: oneYear, path: "/" });

      logAuth("Login complete", user.sys_id);

      res.json({ success: true });
    });
  })(req, res, next);
});


// ----------------------------------------
// GET all elderly profiles
// Normalizes ServiceNow fields → { id, name, age, etc }
// ----------------------------------------
app.get('/api/caregiver/elderly', async (req, res) => {
  try {
    const data = await snGet("x_1855398_elderl_0_elderly_data");

    const cleaned = data.map(row => ({
      id: row.sys_id || row.u_sys_id || "NA",
      name: row.name || row.u_name || "NA",
      elderly_username: row.elderly_username || row.u_elderly_username || "NA",
      password_hash: row.password_hash || row.u_password_hash || "NA",
      condition: row.condition_special_consideration || row.u_condition_special_consideration || "NA",
      language_preference: row.language_preference || row.u_language_preference || "NA",
      caregiver: row.caregiver || row.u_caregiver || "NA"

    }));

    res.json({ success: true, elderly: cleaned });
  } catch (err) {
    console.error("SN elderly fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});

// ----------------------------------------
// GET check-in logs (latest first)
// Normalizes → { elderly_name, timestamp, status }
// ----------------------------------------
app.get('/api/caregiver/checkins', async (req, res) => {
  try {
    const logs = await snGet(
      "x_1855398_elderl_0_elderly_check_in_log",
      "ORDERBYDESCsys_created_on"
    );

    const cleaned = logs.map(row => ({
      timestamp: row.sys_created_on,
      elderly_name: row.elderly_name || row.name || row.u_elderly || "",
      status: row.status || row.u_status || "",
      is_check_in_paused: row.is_check_in_paused
    }));

    res.json({ success: true, checkins: cleaned });
  } catch (err) {
    console.error("SN check-in fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});

// Update Language Preference
app.put("/api/caregiver/elderly/:sys_id/language", async (req, res) => {
  const { sys_id } = req.params;
  const { language_preference } = req.body;

  if (!sys_id) {
    return res.status(400).json({
      success: false,
      error: "Elderly sys_id is required"
    });
  }

  if (!language_preference) {
    return res.status(400).json({
      success: false,
      error: "Language preference is required"
    })
  }

  const validLanguages = ["English", "Chinese", "Malay", "Tamil"];
  if (!validLanguages.includes(language_preference)) {
    return res.status(400).json({
      success: false,
      error: "Invalid language. Must be: English, Chinese, Malay, or Tamil"
    });
  }

  try {
    console.log(`[LANGUAGE UPDATE] Updating sys_id: ${sys_id} to language: ${language_preference}`);

    const updateResponse = await axios.put(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${sys_id}`,
      {
        language_preference: language_preference,
      },
      {
        auth: { username: SN_USER, password: SN_PASS },
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log(`[LANGUAGE UPDATE] Successfully updated to: ${language_preference}`);

    res.json({
      success: true,
      message: "Language preference updated successfully",
      data: {
        sys_id: sys_id,
        language_preference: language_preference,
        updated_record: updateResponse.data.result
      }
    });
  } catch (err) {
    console.error("[LANGUAGE UPDATE] Error:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: "Failed to update language preference",
      details: err.response?.data || err.message
    });
  }
});

// ----------------- GET LANGUAGE PREFERENCE ------------------
// Fetches the elderly person's preferred language from ServiceNow by sys_id
app.get("/api/language-preference/:sys_id", async (req, res) => {
  const { sys_id } = req.params;

  if (!sys_id) {
    return res.status(400).json({ error: "sys_id required" });
  }

  try {
    // Get elderly record by sys_id 
    const user = await getElderlyBySysId(sys_id);

    if (!user) {
      return res.status(404).json({ error: "Elderly record not found" });
    }

    // Get language preference and convert to code
    const langPreference = user.language_preference || user.u_language_preference;
    const langCode = getLanguageCode(langPreference);

    res.json({
      languagePreference: langCode,
      languageName: langPreference || 'English',
      name: user.name || ""
    });
  } catch (err) {
    console.error("Language preference fetch error:", err.message);
    res.status(500).json({
      error: "Failed to fetch language preference",
      details: err.message
    });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ success: false });
    res.clearCookie("elderlyId");
    res.clearCookie("elderlyName");
    res.json({ success: true });
  });
});

// Check-in - Uses authenticated user's sys_id
app.post("/checkin", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "not authenticated" });
  }

  try {
    // 1️⃣ Get current points
    const elderly = await getElderlyBySysId(req.user.sys_id);
    const currentPoints = Number(elderly.u_points || 0);

    // 2️⃣ Add points
    const pointsEarned = 10;
    const newPoints = currentPoints + pointsEarned;

    // 3️⃣ Update elderly record
    await axios.patch(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${req.user.sys_id}`,
      {
        u_points: newPoints
      },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    // 4️⃣ Log check-in
    await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      {
        u_elderly: req.user.sys_id,
        status: "Checked In",
        u_points_awarded: pointsEarned,
        name: req.user.name,
        timestamp: getSingaporeTimestamp()
      },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    res.json({
      success: true,
      pointsEarned,
      totalPoints: newPoints
    });

  } catch (err) {
    console.error("Check-in error:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
});


// ------------------ EMERGENCY ALERT ENDPOINT ------------------
// Triggers ServiceNow workflow to send Telegram message to caregiver
app.post("/emergency", async (req, res) => {
  // Check if user if authenticated 
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      error: "Not authenticated"
    });
  }

  try {
    const user = req.user;

    console.log(`[EMERGENCY] Alert triggered by: ${user.name} (${user.sys_id})`);

    // Get caregiver information from elderly record
    const caregiverName = user.caregiver_name || user.u_caregiver_name || "Unknown Caregiver";
    const elderlyCondition = user.condition_special_consideration || user.u_condition_special_consideration || "None";

    // Prepare emergency data for ServiceNow workflow
    const emergencyPayload = {
      // Elderly person details
      name: user.name,
      username: user.u_elderly_username || "",
      condition: elderlyCondition,

      // Caregiver details
      caregiver: caregiverName,

      // Emergency details
      timestamp: getSingaporeTimestamp(),
      status: "New"
    };

    // Creates a record in a customer emergency table that triggers workflow
    const emergencyResponse = await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_emergency_alerts`,
      emergencyPayload,
      {
        auth: { username: SN_USER, password: SN_PASS },
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log(`[EMERGENCY] Alert created in ServiceNow:`, emergencyResponse.data.result.sys_id);

    res.json({
      success: true,
      message: "Emergency alert sent successfully",
      alert_id: emergencyResponse.data.result.sys_id,
      timestamp: emergencyPayload.emergency_timestamp
    });

  } catch (err) {
    console.error("[EMERGENCY] Error:", err.response?.data || err.message);

    // Return detailed error for troubleshooting
    res.status(500).json({
      success: false,
      error: "Failed to send emergency alert",
      details: err.response?.data || err.message
    });
  }
});

// Find elderly record in ServiceNow by name
async function findElderlyByName(elderly_name) {
  try {
    const res = await axios.get(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data`,
      {
        auth: { username: SN_USER, password: SN_PASS },
        params: {
          sysparm_query: `name=${elderly_name}`,
          sysparm_limit: 1,
        },
      }
    );

    if (!res.data?.result?.length) {
      console.warn(`[Elderly] Not found by name: ${elderly_name}`);
      return null;
    }

    return res.data.result[0];
  } catch (err) {
    console.error("[Elderly] findElderlyByName error:", err.response?.data || err.message);
    throw err;
  }
}

//Pause and Active
// ----------------------------------------
// TOGGLE pause / resume for an elderly
// Logs into x_1855398_elderl_0_elderly_check_in_log
// ----------------------------------------
// ----------------------------------------
// TOGGLE pause / resume for an elderly
// Only flips is_check_in_paused in log table
// ----------------------------------------
app.post("/api/caregiver/toggle-pause", async (req, res) => {
  const { elderly_name, target_state } = req.body;

  if (!elderly_name || !target_state) {
    return res
      .status(400)
      .json({ success: false, message: "elderly_name and target_state required" });
  }

  const makePaused = target_state === "paused";

  try {
    // 1) Copy latest Status and insert log (your existing code, shortened)
    const latestLogs = await axios.get(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      {
        auth: { username: SN_USER, password: SN_PASS },
        params: {
          sysparm_query: `name=${elderly_name}^ORDERBYDESCsys_created_on`,
          sysparm_limit: 1,
        },
      }
    );
    const latest = latestLogs.data.result && latestLogs.data.result[0];
    const statusToCopy = latest ? (latest.status || latest.u_status || "") : "";

    await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      {
        name: elderly_name,
        timestamp: getSingaporeTimestamp(),
        is_check_in_paused: makePaused ? true : false,
        status: statusToCopy,
      },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    // 2) Update elderly_datas (x_1855398_elderl_0_elderly_data) flag
    const elderly = await findElderlyByName(elderly_name);
    if (elderly && elderly.sys_id) {
      await axios.patch(
        `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${elderly.sys_id}`,
        {
          is_check_in_paused: makePaused ? true : false, // or u_is_check_in_paused
        },
        { auth: { username: SN_USER, password: SN_PASS } }
      );
    }

    res.json({
      success: true,
      paused: makePaused,
    });
  } catch (err) {
    console.error("Pause toggle error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ------------------ GRACEFUL SHUTDOWN ------------------
// Save cache to file when server shuts down 
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  clearTimeout(saveTimeout); // Cancel debounced save
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(translationCache, null, 2));
    console.log('[CACHE] Final save complete');
  } catch (err) {
    console.error('[CACHE] Error during final save:', err.message);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  clearTimeout(saveTimeout);
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(translationCache, null, 2));
    console.log('[CACHE] Final save complete');
  } catch (err) {
    console.error('[CACHE] Error during final save:', err.message);
  }
  process.exit(0);
})

// ------------------ START SERVER ------------------
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
