const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

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

app.post("/checkin", (req, res) => {
  // Later: Log check-in or update Google Sheet
  res.send("Check-in recorded.");
});

// Port
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
