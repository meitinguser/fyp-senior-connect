// This file runs in the user's web browser (server endpoint)
const LOCAL_URL = '/checkin';

// Sends the check-in data to the Google Apps Script Web App using the URL.
// Accepts the name and status as arguments to be used by the event listener

// Function to run when the button is clicked on the HTML page 
async function sendCheckIn(name, status) {

  // Data passed into the function arguments
  const dataToSend = {
    name: name,
    status: status
  };

  try {
    // Send request to the local node.js server
    const response = await fetch(LOCAL_URL, {
      method: 'POST', // specifies the HTTP method
      headers: {
        // Tells the server (Apps Script) that the body is JSON
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSend) // Turn to JSON 
    });

    if (response.ok) {
      const result = await response.json();

      // Check the response from your node.js server
      if (result.gas_response && result.gas_response.result === 'success') {
        console.log('Check in successful via server');
        alert(`Checked in: ${name} (${status})`);
      } else {
        console.error('GAS reported an error:', result.gas_response);
        alert('Check-in failed on the Google Sheets side.');
      }
    } else {
      // Handles errors from the node.js server 
      console.error('Server-side POST request failed. Status:', response.status);
      alert('Check-in failed. Please check the server error.');
    }
  } catch (error) {
    // This catch block handles pure network errors to the local server
    console.error('Error sending request to local server:', error);
    alert('Could not connect to the local check-in server.')
  }
}

// Attach the function to an event listener once the document is loaded
document.addEventListener("DOMContentLoaded", () => { // load DOM
  const checkInBtn = document.getElementById("checkInBtn"); // Get Check-In button

  if (checkInBtn) {
    checkInBtn.addEventListener("click", (event) => { // wait for click
      event.preventDefault(); // prevent form default submission 

      // Get current values from the form/URL
      const name = document.getElementById("seniorName").textContent;
      const status = "checked in";

      // Ensure data is present before sending 
      if (name && status) {
        sendCheckIn(name, status)
      } else {
        alert("Please ensure both name and status are entered")
      }
    });
  }
});

// Settings Form
function openCaregiver() {
  document.getElementById("settingsForm").style.display = "block";
}

function closeCaregiver() {
  document.getElementById("settingsForm").style.display = "none";
}
