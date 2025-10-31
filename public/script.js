// Check-in
document.addEventListener("DOMContentLoaded", () => { // load DOM
  const checkInBtn = document.getElementById("checkInBtn"); // Get Check-In button

  checkInBtn.addEventListener("click", async () => { // wait for click
    const name = document.getElementById("seniorName").textContent; // get name, status, and timestamp
    const status = "Checked In";
    const timestamp = new Date().toISOString();

    try {
      const response = await fetch("/checkin", { // start a POST request
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status, timestamp })
      });

      const result = await response.json(); // pop up to say yes check in done
      alert(result.message);
    } catch (err) {
      console.error("Error:", err);
      alert("Check-in failed!");
    }
  });
});

// Settings Form
  function openCaregiver() {
    document.getElementById("settingsForm").style.display = "block";
  }

  function closeCaregiver() {
    document.getElementById("settingsForm").style.display = "none";
  }