async function saveCaregiver() {
  await fetch("/caregiver/profile/self", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.value,
      phone: phone.value,
      address: address.value,
      password: password.value
    })
  });
  alert("Profile updated");
}

async function saveElderly(elderlyId, btn) {
  const inputs = btn.parentElement.querySelectorAll("input");
  const payload = {};

  inputs.forEach(i => {
    if (i.value && i.dataset.field) {
      payload[i.dataset.field] = i.value;
    }
  });

  await fetch(`/caregiver/profile/elderly/${elderlyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  alert("Elderly updated");
}

