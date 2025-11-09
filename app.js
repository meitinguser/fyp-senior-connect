const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;
const fs = require("fs");

app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

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

// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Senior Support - Home" });
});

app.get("/arrange", (req, res) => {
  res.render("arrange", { title: "Arrange Meeting" });
});

app.get("/join", (req, res) => {
  res.render("join", { title: "Join Meeting" });
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

// Port
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
