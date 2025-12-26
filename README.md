# !! DO NOT RUN NPM INIT !!

# FYP

Senior Connect: Building a Support Network for Elderly Living Alone (Process Workflows and Operational Procedures)

# Setup Instructions
**1. Clone the repository**
> git clone https://github.com/meitinguser/fyp-senior-connect.git \
cd fyp-senior-connect

⚠️ Important: Due to the __.gitignore__ file, the __node_modules/__ folder is **not** included in the repository. The app will not work instantly after cloning.

**2. Install dependencies**
# !! DO NOT run npm init. !!
Instead, install all necessary packages listed in package.json:

> npm install

**3. (Optional) Install nodemon for auto-reload**\
Nodemon restarts the server automatically when files change.\
<u>Recommended for development:</u>
> npm install nodemon --save-dev

!!!!!!!!!!!!!!!!!!!!\
Do not run npm init, the package.json is already included.
Always run npm install after cloning to recreate node_modules/.
Use nodemon for development to save time when testing changes.

For Google Translation API: 
> cd fyp-senior-connect
> npm install @google-cloud/translate

copy the path to the json file
> $env:GOOGLE_APPLICATION_CREDENTIALS="path/to/keys-file.json" 



# Update Log
22/12/2025 Commit [mei ting]
- Added profile.ejs page
- Changed Login/Profile Popup to seperate page (profile.ejs).

- Implemented proper profile login system
- Implemented password hash check
- Added passport.js, passport-local, express-session and bcrypt packages for password system.
- Adjusted cookies.
- Added functions to get Elderly by Username and Sys_id (not by serial number anymore)

- Edited caregiver.ejs columns to include username to better suit new username/password system
- Moved puzzle.js and puzzle.css logic into main files (index.ejs, styles.css)

23/12/25 Commit [mei ting]
- Name shows on navbar after logging in.
- Navbar improved