// app.js
const express = require("express");
const path = require("path");
const axios = require("axios");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------ MIDDLEWARE ------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// ------------------ SERVICENOW CONFIG ------------------
const SN_INSTANCE = "https://dev313533.service-now.com";
const SN_USER = process.env.snow_username;
const SN_PASS = process.env.snow_password;

// Helper: GET table from ServiceNow
async function snGet(table, query = "") {
  const url = `${SN_INSTANCE}/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    auth: { username: SN_USER, password: SN_PASS },
  });
  return response.data.result;
}

// ------------------ ROUTES ------------------

// Home page
app.get("/", (req, res) => {
  res.render("index", { title: "Senior Support - Home" });
});

// ------------------ LOGIN (by serial_number) ------------------
app.post("/api/login", async (req, res) => {
  const { serial_number } = req.body;
  if (!serial_number) return res.status(400).json({ error: "Serial number required" });

  try {
    // Query ServiceNow
    const users = await snGet(
      "x_1855398_elderl_0_elderly_data",
      `serial_number=${encodeURIComponent(serial_number)}`
    );
    if (!users || users.length === 0) return res.status(404).json({ error: "Invalid serial number" });

    const user = users[0];

    // Store serial_number and name in **long-lasting cookies** (365 days)
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    res.cookie("elderlyId", user.serial_number, { maxAge: oneYearMs, path: "/" });
    res.cookie("elderlyName", user.name || "", { maxAge: oneYearMs, path: "/" });

    res.json({ name: user.name || "", id: user.serial_number });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Failed to login", details: err.message });
  }
});

// ------------------ CHECK-IN ------------------
// ------------------ CHECK-IN ------------------
app.post("/checkin", async (req, res) => {
  try {
    const { elderlyId, elderlyName, status } = req.body;
    if (!elderlyId || !elderlyName || !status) {
      return res.status(400).json({ error: "Missing user or status." });
    }

    // Lookup the Elderly record in ServiceNow by serial_number to get sys_id
    const elderlyRecords = await snGet(
      "x_1855398_elderl_0_elderly_data",
      `serial_number=${encodeURIComponent(elderlyId)}`
    );

    if (!elderlyRecords || elderlyRecords.length === 0) {
      return res.status(404).json({ error: "Elderly record not found." });
    }

    const elderlySysId = elderlyRecords[0].sys_id;

    // Construct payload using ServiceNow table field names
    const payload = {
      name: elderlyName,             // caregiver/user
      status: status,                // e.g., "Checked In"
      timestamp: getSingaporeTimestamp(),
      u_elderly_name: elderlySysId   // reference to elderly record
    };

    const snResponse = await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      payload,
      {
        auth: { username: SN_USER, password: SN_PASS },
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("Check-in payload:", payload);
    res.json({ message: "Check-in recorded.", sn_response: snResponse.data });
  } catch (err) {
    console.error("Check-in error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to push check-in to ServiceNow.", details: err.response?.data || err.message });
  }
});


function getSingaporeTimestamp() {
  const dateObj = new Date();
  const singaporeOffset = 8 * 60; // UTC+8 in minutes
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const singaporeTime = new Date(utc + singaporeOffset * 60000);
  return singaporeTime.toISOString().replace("T", " ").split(".")[0]; // "YYYY-MM-DD HH:mm:ss"
}

// ------------------ CAREGIVER / MANAGEMENT ------------------
app.get("/caregiver", (req, res) => res.render("caregiver"));
app.get("/manage", (req, res) => res.render("exemption", { title: "Elderly Check In Management" }));

// ------------------ TRANSLATION ------------------
app.post("/api/translate", async (req, res) => {
  const { texts, targetLang } = req.body;
  if (!texts || !Array.isArray(texts) || !targetLang)
    return res.status(400).json({ error: "Invalid request" });

  try {
    const { Translate } = require("@google-cloud/translate").v2;
    const translateClient = new Translate();
    let [translations] = await translateClient.translate(texts, targetLang);
    if (!Array.isArray(translations)) translations = [translations];
    res.json({ translations });
  } catch (err) {
    console.error("Translation error:", err.message);
    res.status(500).json({ error: "Translation failed", details: err.message });
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
