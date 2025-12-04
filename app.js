const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;
const fs = require("fs");
const axios = require('axios');

app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
require('dotenv').config();

// Web App URL (For connecting to Google Web App )
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx-yLPCPqEGCpz5HkM3DDbTbK61E8cdTCir10eB9EGDCCpz9wVMnx4gPk96K5XYYXiTdA/exec';

// Library automatically finds the key based on the environment variable
// Initialize Google Cloud Translation Client
const { Translate } = require('@google-cloud/translate').v2;

// Client uses GOOGLE_APPLICATION_CREDENTIALS environment variable
const translateClient = new Translate();
// no file path is passed here as the environment variable does the work. 

// -------------------------------
// SERVICENOW CONFIG
// -------------------------------
const SN_INSTANCE = "https://dev313533.service-now.com";
const SN_USER = process.env.snow_username;
const SN_PASS = process.env.snow_password;

// ServiceNow API caller
async function snGet(table, query = "") {
  const url = `${SN_INSTANCE}/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}`;

  const response = await axios.get(url, {
    auth: {
      username: SN_USER,
      password: SN_PASS
    }
  });

  return response.data.result;
}


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
    // Calls the google cloud translation API
    // texts is an array of strings, targetLang is the code (e.g. 'zh', 'ms')
    let [translations] = await translateClient.translate(texts, targetLang);

    // The api returns an array but ensures it is one for consistency
    if (!Array.isArray(translations)) {
      translations = [translations];
    }

    // Send the translated array to the client
    res.json({
      translations: translations
    });

  } catch (error) {
    // handle API errors
    console.error('Translation API error:', error.message);
    res.status(500).json({
      error: 'Failed to communicate with the translation service.',
      detail: error.message
    });
  }
});

// ----------------------------------------
// GET all elderly profiles
// Normalizes ServiceNow fields → { id, name, age, etc }
// ----------------------------------------
app.get('/api/caregiver/elderly', async (req, res) => {
  try {
    const data = await snGet("x_1855398_elderl_0_elderly_data");

    const cleaned = data.map(row => ({
      id: row.sys_id,
      sn: row.serial_number || row.u_serial_number || "",
      name: row.name || row.u_name || "",
      age: row.age || row.u_age || null,
      condition: row.condition_special_consideration || row.u_condition_special_consideration || null,
      caregiver: row.caregiver_name || row.u_caregiver_name || ""

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
      elderly_name: row.elderly_name || row.name || row.u_elderly_name || "",
      status: row.status || row.u_status || ""
    }));

    res.json({ success: true, checkins: cleaned });
  } catch (err) {
    console.error("SN check-in fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});


// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Senior Support - Home" });
});

// Server endpoint for /checkin
app.post('/checkin', async (req, res) => {
  // Data received from the client (browser)
  const { name, status } = req.body;

  // Data to be forwarded to Google Apps Script
  const dataToSend = { name, status };

  try {
    // Forward the request to Google Apps Script (Server-to-Server)
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSend)
    });

    // Parse the final response from Apps Script 
    const result = await response.json();

    // Send the Apps Script result back to the client (Browser)
    res.status(200).json({
      message: 'Check-in recorded via server.',
      gas_response: result
    });

  } catch (error) {
    console.error('Error forwarding request to GAS:', error.message);
    res.status(500).json({
      error: 'Failed to connect to Google Sheets service.',
      details: error.message
    });
  }
});

// ----------------------------------------
// POST /exemption  → forward exemption request to Google Apps Script
// ----------------------------------------
app.post('/api/exemption', async (req, res) => {
  const { name, isExempt, reason, startDate, endDate } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Missing elderly name."
    });
  }

  const payload = { name, isExempt, reason, startDate, endDate };

  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const gasResult = await response.json();

    res.json({
      success: true,
      message: "Exemption forwarded to Google Apps Script.",
      gas_response: gasResult
    });

  } catch (err) {
    console.error("Exemption forwarding error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to update exemption via GAS.",
      error: err.message
    });
  }
});


app.post('/api/exemption', async (req, res) => {
  try {
    const response = await fetch(GAS_URL + '?action=exemption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ result: 'error', message: err.message });
  }
});


app.get("/caregiver", (req, res) => {
  res.render("caregiver");  // loads views/caregiver.ejs
});

app.get("/manage", (req, res) => {
  res.render("exemption", { title: "Elderly Check In Management" });
});



// Port
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
