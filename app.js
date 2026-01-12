
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

async function getCaregiverByUsername(username) {
  const res = await axios.get(
    `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_support_person`,
    {
      params: {
        sysparm_query: `c_username=${username}`,
        sysparm_limit: 1
      },
      auth: { username: SN_USER, password: SN_PASS }
    }
  );
  
    // User NOT Found
    if (!res.data?.result?.length) {
      logAuth("Caregiver not found in ServiceNow", username);
      return null;
    }

  return res.data.result[0] || null;
}

async function getCaregiverBySysId(sys_id) {
  const res = await axios.get(
    `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_support_person/${sys_id}`,
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

// ------------------ AUTOMATED ESCALATION SYSTEM ------------------

const ESCALATION_INTERVAL = 15 * 60 * 1000 // 15 minutes in milliseconds (1 min)

const SESSION_WINDOWS = {
  morning: { start: "06:00", end: "12:00", name: "morning" },
  night: { start: "16:00", end: "22:00", name: "night" }
};

// Helper: Get current Singapore time in HH:mm
function getCurrentSingaporeTime() {
  const now = new Date();
  const singaporeOffset = 8 * 60; // UTC+8
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const singaporeTime = new Date(utc + singaporeOffset * 60000);
  const hours = String(singaporeTime.getHours()).padStart(2, "0");
  const minutes = String(singaporeTime.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Helper: Check if current time is strictly AFTER a session end time
function isPastSessionEnd(sessionEndTime) {
  const current = getCurrentSingaporeTime();
  return current > sessionEndTime;
}

// ------------------ CORE LOGIC ------------------

async function checkMissedCheckIns() {
  console.log(`[ESCALATION Running check at ${getCurrentSingaporeTime()}]`);

  // Check which session has ended
  const morningEnded = isPastSessionEnd(SESSION_WINDOWS.morning.end);
  const nightEnded = isPastSessionEnd(SESSION_WINDOWS.night.end);

  if (!morningEnded && !nightEnded) {
    console.log(`[ESCALATION] No session ended yet. Skipping.`);
    return;
  }

  try {
    // Get all data needed
    const allElderly = await snGet("x_1855398_elderl_0_elderly_data");

    // Fetch all logs for today (Check-ins and Missed logs)
    const todayLogs = await snGet(
      "x_1855398_elderl_0_elderly_check_in_log",
      "sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()"
    );

    for (const elderly of allElderly) {
      const name = elderly.name || elderly.u_name;
      if (!name) continue;

      // Check morning 
      // Only check if the session has already ended
      if (morningEnded) {
        await processSessionForElderly(elderly, todayLogs, SESSION_WINDOWS.morning);
      }

      // Check night
      // Only check night if the session has actually ended
      if (nightEnded) {
        await processSessionForElderly(elderly, todayLogs, SESSION_WINDOWS.night);
      }
    }
    console.log("[ESCALATION] Check complete.")
  } catch (err) {
    console.error("[ESCALATION] System error:", err.message);
  }
}

// Logic to check a specific elderly person for a specifc session
async function processSessionForElderly(elderly, todayLogs, sessionConfig) {
  const name = elderly.name || elderly.u_name;
  const sessionLabel = sessionConfig.name // "morning" or "night"

  // Filter logs for the specifc person
  const personLogs = todayLogs.filter(log => {
    const logName = (log.name || log.u_name || log.elderly_name || log.u_elderly_name || "").trim();
    return logName === name;
  });

  // Check if escalation has already happened for this session
  // Look for log entry that contains "missed" and session name
  const alreadyEscalated = personLogs.some(log => {
    const status = (log.status || log.u_status || "").toLowerCase();
    // Check for "missed (morning)" or "missed (night)"
    return status.includes("missed") && status.includes(sessionConfig.name.toLowerCase());
  });

  if (alreadyEscalated) {
    console.log(`[ESCALATION] Already handled ${name} for ${sessionLabel}. Skipping.`);
    return;
  }

  // Check if there is a valid Check-in
  let hasCheckedIn = false;
  let isPaused = false;

  for (const log of personLogs) {
    const status = (log.status || log.u_status || "").toLowerCase();

    // Check Pause status
    if (log.is_check_in_paused === true || log.is_check_in_paused === "true") {
      isPaused = true;
    }

    // Check for "Checked in" status
    if (status.includes("checked in")) {
      // Validate Time (Strict Window Check)
      // Extract HH:mm from timestamp or sys_created_on
      let timeString = "";
      if (log.timestamp && log.timestamp.length > 10) {
        timeString = log.timestamp.slice(11, 16);
      } else if (log.sys_created_on) {
        timeString = log.sys_created_on.slice(11, 16);
      }

      // Compare "09:00" >= "06:00" && "09:00" <= "12:00"
      if (timeString >= sessionConfig.start && timeString <= sessionConfig.end) {
        hasCheckedIn = true;
        break; // stop checking once a valid check in is found
      }
    }

  }
  // Decision
  if (isPaused) {
    console.log(`[ESCALATION] ${name} is PAUSED. Skipping.`);
    return;
  }

  if (!hasCheckedIn) {
    // No check-in found, and not paused, and not already escalated
    console.log(`[ESCALATION] ${name} missed ${sessionLabel}. Creating Log...`);
    await createMissedLog(elderly, sessionLabel);
  } else {
    console.log(`[ESCALATION] ${name} is Safe (${sessionLabel}).`)
  }
}

// Creates "missed" record in the database
async function createMissedLog(elderly, sessionName) {
  try {
    const payload = {
      u_elderly: elderly.elderly_id,
      name: elderly.name,
      status: `missed (${sessionName})`,
      timestamp: getSingaporeTimestamp()
    };

    const response = await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      payload,
      {
        auth: { username: SN_USER, password: SN_PASS },
        headers: { "Content-Type": "application/json" }
      }
    );
    console.log(`[ESCALATION] Record created for ${elderly.name}: ${response.data.result.sys_id}`);

  } catch (err) {
    console.error(`[ESCALATION FAILED] ${elderly.name}:`, err.message);
  }
}

function startEscalationScheduler() {
  console.log(`[ESCALATION] Scheduler started. Morning ends: ${SESSION_WINDOWS.morning.end}, Night ends: ${SESSION_WINDOWS.night.end}`);

  // Run once on startup (after 5 seconds to let connections settle)
  setTimeout(checkMissedCheckIns, 5000);

  // Run every 15 mins
  setInterval(checkMissedCheckIns, ESCALATION_INTERVAL);
}

// ------------------ PASSPORT ------------------
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      logAuth("Login attempt", username);

      // ---- 1️⃣ Try Elderly ----
      const elderly = await getElderlyByUsername(username);
      if (elderly) {
        if (!elderly.u_password_hash) return done(null, false);

        const match = await bcrypt.compare(password, elderly.u_password_hash);
        if (!match) return done(null, false);

        return done(null, {
          id: elderly.sys_id,
          role: "elderly"
        });
      }

      // ---- 2️⃣ Try Caregiver ----
      const caregiver = await getCaregiverByUsername(username);
      if (!caregiver) return done(null, false);

      const match = await bcrypt.compare(password, caregiver.c_password_hash);
      if (!match) return done(null, false);

      return done(null, {
        id: caregiver.sys_id,
        role: "caregiver"
      });

    } catch (err) {
      console.error("[AUTH] Passport error:", err.message);
      done(err);
    }
  })
);


passport.serializeUser((user, done) => {
  done(null, { id: user.id, role: user.role });
});

passport.deserializeUser(async (obj, done) => {
  try {
    if (obj.role === "elderly") {
      const elderly = await getElderlyBySysId(obj.id);
      elderly.role = "elderly";
      return done(null, elderly);
    }

    if (obj.role === "caregiver") {
      const caregiver = await getCaregiverBySysId(obj.id);
      caregiver.role = "caregiver";
      return done(null, caregiver);
    }

    done(null, false);
  } catch (err) {
    done(err);
  }
});


function requireLogin(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect("/profile");
}

function requireCaregiver(req, res, next) {
  if (!req.isAuthenticated() || req.user.role !== "caregiver") {
    return res.redirect("/profile");
  }
  next();
}

app.get("/caregiver", requireCaregiver, (req, res) => {
  res.render("caregiver", { user: req.user });
});


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

app.get("/caregiverlogin", (req, res) => {
  res.render("caregiverlogin", {
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

      res.json({
      success: true,
      role: user.role,
      redirectTo: user.role === "caregiver" ? "/caregiver" : "/"
    });

    });
  })(req, res, next);
});

// ----------------------------------------
// SHOP
// 
// ----------------------------------------
const shopItems = [
  { id: "neck_pillow", name: "Neck Pillow", cost: 200 },
  { id: "blanket", name: "Blanket", cost: 300 },
  { id: "tea_sampler", name: "Tea Sampler", cost: 150 },
  { id: "calendar", name: "Large Print Calendar", cost: 100 },
  { id: "warm_socks", name: "Warm Socks", cost: 80 },
  { id: "hand_cream", name: "Hand Cream", cost: 50 },
  { id: "puzzle_book", name: "Puzzle Book", cost: 180 },
  { id: "magnifying_glass", name: "Magnifying Glass", cost: 250 },
  { id: "walking_stick", name: "Walking Stick Accessory", cost: 350 },
  { id: "water_bottle", name: "Reusable Water Bottle", cost: 100 }
];


app.get("/shop", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/profile");

  res.render("shop", {
    user: req.user,
    items: shopItems
  });
});

app.post("/shop/buy", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });

  const { itemId } = req.body;
  const item = shopItems.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ success: false, message: "Item not found" });

  try {
    // Get current points from ServiceNow
    const elderly = await getElderlyBySysId(req.user.sys_id);

    if ((elderly.u_points || 0) < item.cost) {
      return res.json({ success: false, message: "Not enough points" });
    }

    // Deduct points
    const newPoints = (elderly.u_points || 0) - item.cost;
    await axios.patch(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${elderly.sys_id}`,
      { u_points: newPoints },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    res.json({ success: true, newPoints });
  } catch (err) {
    console.error("Shop purchase error:", err.message);
    res.status(500).json({ success: false });
  }
});

// ----------------------------------------
// GET all elderly profiles
// Normalizes ServiceNow fields → { id, name, age, etc }
// ----------------------------------------

app.get('/api/caregiver', async (req, res) => {
  try {
    const caregiverdata = await snGet("x_1855398_elderl_0_support_person");

    const caregivercleaned = caregiverdata.map(row => ({
      id: row.sys_id || row.u_sys_id || "NA",
      name: row.name || row.u_name || "NA",
      elderly_username: row.elderly_username || row.u_elderly_username || "NA",
      password_hash: row.password_hash || row.u_password_hash || "NA",
      condition: row.condition_special_consideration || row.u_condition_special_consideration || "NA",
      language_preference: row.language_preference || row.u_language_preference || "NA",
    }));

    res.json({ success: true, elderly: cleaned });
  } catch (err) {
    console.error("SN elderly fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});

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
    return res.status(401).json({ success: false });
  }

  try {
    // 1. Get latest elderly record
    const elderlyRes = await axios.get(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${req.user.sys_id}`,
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    const elderly = elderlyRes.data.result;
    const currentPoints = Number(elderly.u_points || 0);
    const pointsEarned = 10;
    const newPoints = currentPoints + pointsEarned;

    // 2. Update points in ServiceNow
    await axios.patch(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_data/${req.user.sys_id}`,
      { u_points: newPoints },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    // 3. Log check-in (IMPORTANT)
    await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      {
        u_elderly: req.user.sys_id,
        name: req.user.name,
        status: "Checked In",
        timestamp: getSingaporeTimestamp(),
        u_points_awarded: 10
      },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    // 4. Return updated total
    res.json({
      success: true,
      pointsEarned,
      totalPoints: newPoints
    });

  } catch (err) {
    console.error("Check-in failed:", err.message);
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
app.post("/api/caregiver/toggle-pause", async (req, res) => {
  const { elderly_name, target_state, absence_reason } = req.body;

  const makePaused = target_state === "paused";

  try {
    const elderly = await findElderlyByName(elderly_name);

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

    console.log("[TOGGLE] makePaused:", makePaused);
    console.log("[TOGGLE] absence_reason from client:", JSON.stringify(absence_reason));

    const payload = {
      name: elderly_name,
      u_elderly: elderly ? elderly.sys_id : "",
      timestamp: getSingaporeTimestamp(),
      is_check_in_paused: makePaused ? true : false,
      status: statusToCopy,
    };

    if (makePaused && absence_reason && absence_reason.trim()) {
      payload.absence_reason = absence_reason.trim();
    }

    console.log("[TOGGLE] payload sent to SN:", payload);

    await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      payload,
      { auth: { username: SN_USER, password: SN_PASS } }
    );


    res.json({ success: true, paused: makePaused });
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
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)

  // Start the auto-escalation scheduler
  startEscalationScheduler();
});
