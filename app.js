const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

// EJS as the view engine
app.set("view engine", "ejs");

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Daily Check-In", message: "Welcome to the Senior Connect App" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
