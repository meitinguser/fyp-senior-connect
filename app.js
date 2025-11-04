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
