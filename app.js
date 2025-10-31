const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;
const fs = require("fs");

app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));


// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Senior Support - Home"});
});

app.get("/arrange", (req, res) => {
  res.render("arrange", { title: "Arrange Meeting" });
});

app.get("/join", (req, res) => {
  res.render("join", { title: "Join Meeting" });
});

app.post("/checkin", (req, res) => {
  const { name, status, timestamp } = req.body;
  const fs = require("fs");
  const path = require("path");
  const filePath = path.join(__dirname, "checkins.json");

  let data = [];
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  data.push({ name, status, timestamp });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`Check-in recorded for ${name} at ${timestamp}`);
  res.json({ message: `Check-in recorded for ${name}` });
});


// Port
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
