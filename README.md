# FYP

Senior Connect: Building a Support Network for Elderly Living Alone (Process Workflows and Operational Procedures)

# Setup Instructions
**1. Clone the repository**
> git clone https://github.com/meitinguser/fyp-senior-connect.git \
cd fyp-senior-connect

⚠️ Important: Due to the __.gitignore__ file, the __node_modules/__ folder is **not** included in the repository. The app will not work instantly after cloning.

**2. Install dependencies**\
__!!! DO NOT run npm init.__\
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