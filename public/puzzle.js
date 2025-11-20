document.addEventListener("DOMContentLoaded", () => {

  if (typeof gameMode === "undefined" || gameMode !== "puzzle") return;

  const wrapper = document.getElementById("puzzleWrapper");
  wrapper.style.display = "block";

  const pieces = Array.from(document.querySelectorAll(".puzzle-piece"));

  /* ===== Choose puzzle image ===== */
  const puzzleImage = "/images/puzzle_bunny.jpg";

  /* ===== Assign correct background positions ===== */
  const correctPositions = [
    "0% 0%",     /* top left */
    "100% 0%",   /* top right */
    "0% 100%",   /* bottom left */
    "100% 100%"  /* bottom right */
  ];

  pieces.forEach((piece, i) => {
    piece.dataset.correct = correctPositions[i];
    piece.style.backgroundImage = `url('${puzzleImage}')`;
  });

  /* ===== Shuffle ===== */
  shufflePieces();

  function shufflePieces() {
    const shuffled = [...correctPositions].sort(() => Math.random() - 0.5);
    pieces.forEach((p, i) => p.style.backgroundPosition = shuffled[i]);
  }

  /* ===== Drag to Swap ===== */
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

  /* ===== Check If Solved ===== */
  function checkSolved() {
    const solved = pieces.every(p =>
      p.style.backgroundPosition === p.dataset.correct
    );

    if (solved) {
      pieces.forEach(p => p.classList.add("piece-correct"));

      fetch('/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: "Elderly User", status: "checked in" })
      });
    }
  }

});
