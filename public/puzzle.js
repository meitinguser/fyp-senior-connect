document.addEventListener("DOMContentLoaded", () => {

	const elderlyId = getCookie("elderlyId");
	const elderlyName = getCookie("elderlyName");
	if (!elderlyId || !elderlyName) return; // cannot check in without cookies

	const wrapper = document.getElementById("puzzleWrapper");
	if (!wrapper) return;

	// Hide puzzle unless it's the current game
	wrapper.style.display = (gameMode === "puzzle") ? "block" : "none";

	const pieces = Array.from(document.querySelectorAll(".puzzle-piece"));
	const puzzleImage = "/images/puzzle_bunny.jpg";
	const correctPositions = ["0% 0%", "100% 0%", "0% 100%", "100% 100%"];

	pieces.forEach((piece, i) => {
		piece.dataset.correct = correctPositions[i];
		piece.style.backgroundImage = `url('${puzzleImage}')`;
	});

	if (gameMode !== "puzzle") return; // only init drag/drop if puzzle is active

	shufflePieces();

	function shufflePieces() {
		const shuffled = [...correctPositions].sort(() => Math.random() - 0.5);
		pieces.forEach((p, i) => p.style.backgroundPosition = shuffled[i]);
	}

	let dragged = null;

	pieces.forEach(piece => {
		piece.draggable = true;
		piece.addEventListener("dragstart", () => {
			dragged = piece;
		});
		piece.addEventListener("dragover", e => e.preventDefault());
		piece.addEventListener("drop", () => {
			if (!dragged || dragged === piece) return;
			const temp = piece.style.backgroundPosition;
			piece.style.backgroundPosition = dragged.style.backgroundPosition;
			dragged.style.backgroundPosition = temp;
			checkSolved();
		});
	});

	function checkSolved() {
		const solved = pieces.every(p => p.style.backgroundPosition === p.dataset.correct);
		if (!solved) return;

		pieces.forEach(p => p.classList.add("piece-correct"));

		const payload = {
			elderlyId,
			elderlyName,
			status: "Checked In"
		};

		setTimeout(() => {
			fetch("/checkin", {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(payload)
				})
				.then(r => r.json())
				.then(data => {
					console.log("Puzzle check-in response:", data);
					const messageEl = document.getElementById("message");
					if (messageEl) messageEl.textContent = "Check-in recorded successfully! 💛";
				})
				.catch(err => {
					console.error("Puzzle check-in error:", err);
					const messageEl = document.getElementById("message");
					if (messageEl) messageEl.textContent = "Couldn't connect. Try again later 🙏";
				});
		}, 400);
	}

});