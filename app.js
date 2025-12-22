
require("dotenv").config();
const express = require("express");
const path = require("path");
const axios = require("axios");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORTnumber || 3000;

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

// ------------------ ROUTES ------------------

// Main (game)
app.get("/", requireLogin, (req, res) => {
  res.render("index", {
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
      sn: row.serial_number || row.u_serial_number || "NA",
      name: row.name || row.u_name || "NA",
      elderly_username: row.elderly_username || row.u_elderly_username || "NA",
      password_hash: row.password_hash || row.u_password_hash || "NA",
      condition: row.condition_special_consideration || row.u_condition_special_consideration || "NA",
      caregiver: row.caregiver_name || row.u_caregiver_name || "NA"

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
      status: row.status || row.u_status || ""
    }));

    res.json({ success: true, checkins: cleaned });
  } catch (err) {
    console.error("SN check-in fetch error:", err.message);
    res.status(500).json({ success: false });
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

// Check-in
app.post("/checkin", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false });
  }

  try {
    await axios.post(
      `${SN_INSTANCE}/api/now/table/x_1855398_elderl_0_elderly_check_in_log`,
      {
        u_elderly: req.user.sys_id,
        name: req.user.name,
        status: "Checked In"
      },
      { auth: { username: SN_USER, password: SN_PASS } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
