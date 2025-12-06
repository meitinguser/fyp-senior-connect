// ------------------ COOKIE HELPERS ------------------
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

// ------------------ GLOBAL ELDERLY INFO ------------------
let elderlyInfo = {
    elderlyId: getCookie("elderlyId"),
    elderlyName: getCookie("elderlyName")
};

// ------------------ COOKIE WATCHER ------------------
function watchElderlyCookies(interval = 500) {
    setInterval(() => {
        const currentInfo = {
            elderlyId: getCookie("elderlyId"),
            elderlyName: getCookie("elderlyName")
        };
        if (
            currentInfo.elderlyId !== elderlyInfo.elderlyId ||
            currentInfo.elderlyName !== elderlyInfo.elderlyName
        ) {
            elderlyInfo = currentInfo;
            console.log("Elderly info updated:", elderlyInfo);
            if (messageEl && elderlyInfo.elderlyName) {
                messageEl.textContent = `Welcome back, ${elderlyInfo.elderlyName}!`;
            }
        }
    }, interval);
}

// ------------------ HELPER TO GET CURRENT ELDERLY INFO ------------------
function getCurrentElderlyInfo() {
    return {
        elderlyId: getCookie("elderlyId"),
        elderlyName: getCookie("elderlyName")
    };
}

// ------------------ DOMContentLoaded ------------------
document.addEventListener("DOMContentLoaded", () => {
    // ------------------ ELDERLY ID NAVBAR ------------------
    const navbarBtn = document.getElementById("enterIdBtn");
    if (navbarBtn) {
        navbarBtn.textContent = "Enter Elderly ID";
        navbarBtn.style.margin = "10px";
        navbarBtn.style.padding = "8px 12px";
        navbarBtn.onclick = () => {
            const currentId = getCookie("elderlyId") || "";
            const currentName = getCookie("elderlyName") || "";

            const id = prompt("Enter Elderly Serial Number:", currentId);
            const name = prompt("Enter Elderly Name:", currentName);

            if (id && name) {
                setCookie("elderlyId", id);
                setCookie("elderlyName", name);

                console.log(getCookie("elderlyId"), getCookie("elderlyName"));
                alert(`Elderly ID saved: ${getCookie("elderlyName")} (${getCookie("elderlyId")})`);
            }
        };
    }

    // Start watching cookies
    watchElderlyCookies();
});

// ------------------ GAME CONFIG ------------------
let gameMode = null;
const allGames = ["sorting", "flowers", "puzzle", "omikuji"];
gameMode = allGames[Math.floor(Math.random() * allGames.length)];

const allItems = ["whitelily", "pinkflower", "blueflower", "rose", "maroonchrysanthemum"];
const datasets = {
    berries: ["strawberry", "blueberry", "cherry-tomato"],
    flowers: ["whitelily", "pinkflower", "blueflower", "rose", "maroonchrysanthemum"],
    fruits: ["apple", "banana", "orange"],
    veggies: ["carrot", "broccoli", "potato"],
    animals: ["cat", "dog", "bird"]
};
const chosenDatasetKey = Object.keys(datasets)[Math.floor(Math.random() * Object.keys(datasets).length)];
const chosenDataset = datasets[chosenDatasetKey];

// ------------------ DOM ELEMENTS ------------------
const basketsEl = document.getElementById('baskets');
const trayEl = document.getElementById('tray');
const messageEl = document.getElementById('message');
const gameArea = document.getElementById("gameArea");
const puzzleWrapper = document.getElementById("puzzleWrapper");
const omikujiWrapper = document.getElementById("omikujiWrapper");

// ------------------ UTILS ------------------
function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function imagePath(name) {
    return `/images/${name}.png`;
}
const basketImagePath = "/images/basket-top-view.png";

function getSingaporeTimestamp() {
    const date = new Date();
    const offset = 8 * 60; // UTC+8
    const local = new Date(date.getTime() + offset * 60000);
    const yyyy = local.getFullYear();
    const mm = String(local.getMonth() + 1).padStart(2, "0");
    const dd = String(local.getDate()).padStart(2, "0");
    const hh = String(local.getHours()).padStart(2, "0");
    const min = String(local.getMinutes()).padStart(2, "0");
    const ss = String(local.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function setTimeBasedBackground(content) {
    const hour = new Date().getHours();
    let bg, greeting, textcol = '#333';
    if (hour >= 6 && hour < 12) {
        bg = 'linear-gradient(to top,#fdebd0,#f6ddcc,#fad7a0)';
        greeting = content.MORNING;
    } else if (hour >= 12 && hour < 18) {
        bg = 'linear-gradient(to top,#ffd89b,#ffb347)';
        greeting = content.AFTERNOON;
    } else if (hour >= 18 && hour < 20) {
        bg = 'linear-gradient(to top,#f6a98f,#f28e63)';
        greeting = content.EVENING;
    } else {
        bg = 'linear-gradient(to top,#2c3e50,#34495e)';
        greeting = content.NIGHT;
        textcol = 'white';
    }
    document.body.style.background = bg;
    document.getElementById('headerText').textContent = greeting;
    document.getElementById('headerText').style.color = textcol;
    const secondHeader = document.getElementById('2ndHeaderText');
    if (secondHeader) secondHeader.style.color = textcol;
    const langLabel = document.getElementById('languageSelectLabel');
    if (langLabel) langLabel.style.color = textcol;
    if (messageEl) messageEl.style.color = textcol;
}

// ------------------ TRANSLATION / 2ND HEADER ------------------
let activeLangCode = 'en';
let transText = {
    en: {
        MORNING: "Good Morning!",
        AFTERNOON: "Good Afternoon!",
        EVENING: "Good Evening!",
        NIGHT: "Good Night!",
        sorting: "Drag to match each picture",
        basket: "Drag all items into the basket.",
        puzzle: "Drag each puzzle piece into its correct position.",
        puzzleTitle: "Complete the Picture",
        drawAgain: "Draw Again",
        fortune: "Click to get today's fortune!",
        text1: "Checking in...",
        text2: "Check-in recorded successfully! 💛",
        text3: "Couldn't connect. Try again later 🙏",
        text4: "Not quite right, try again 🙏",
        text51: "Selected ",
        text52: ". Drag to a basket to place",
        text6: "Drag an item from the tray to their matching basket."
    },
    zh: null,
};
let currentContent = transText[activeLangCode];

function updateGameText() {
    if (gameMode === "sorting") document.getElementById("2ndHeaderText").textContent = currentContent.sorting;
    else if (gameMode === "flowers") document.getElementById("2ndHeaderText").textContent = currentContent.basket;
    else if (gameMode === "puzzle") document.getElementById("puzzleTitle").textContent = currentContent.puzzleTitle;
    else if (gameMode === "omikuji") document.getElementById("2ndHeaderText").textContent = currentContent.fortune;
}

// ------------------ INITIALIZE GAME ------------------
function initGame() {
    basketsEl.innerHTML = "";
    trayEl.innerHTML = "";
    messageEl.textContent = "";
    gameArea.style.display = (gameMode === "sorting" || gameMode === "flowers") ? "flex" : "none";
    puzzleWrapper.style.display = (gameMode === "puzzle") ? "block" : "none";
    omikujiWrapper.style.display = (gameMode === "omikuji") ? "block" : "none";

    const dailyEmojis = shuffleArray([...chosenDataset]).slice(0, 3);
    const trayEmojis = shuffleArray([...dailyEmojis]);

    // Build Baskets
    if (gameMode === "sorting") {
        dailyEmojis.forEach(e => {
            const b = document.createElement('div');
            b.className = 'basket';
            b.dataset.item = e;
            b.innerHTML = `<img src="${imagePath(e)}" alt="${e}" class="hint" draggable="false" style="opacity:0.3;width:100%">`;
            basketsEl.appendChild(b);
        });
    } else if (gameMode === "flowers") {
        const b = document.createElement('div');
        b.className = 'basket';
        b.dataset.item = 'flowers';
        b.innerHTML = `<img src="${basketImagePath}" alt="Basket" draggable="false" style="width:300px">`;
        dailyEmojis.forEach(f => {
            const img = document.createElement('img');
            img.src = imagePath(f);
            img.alt = f;
            img.className = 'placed-item';
            img.style.opacity = 0;
            img.style.position = 'absolute';
            img.style.left = `${10 + Math.random() * 15}%`;
            img.style.top = `${10 + Math.random() * 15}%`;
            img.style.width = '80%';
            img.style.height = '80%';
            img.style.transition = 'opacity 0.3s';
            b.appendChild(img);
        });
        basketsEl.appendChild(b);
    }

    // Build Tray
    trayEmojis.forEach(e => {
        const it = document.createElement('div');
        it.className = 'item';
        it.dataset.item = e;
        it.innerHTML = `<img src="${imagePath(e)}" alt="${e}" draggable="false">`;
        trayEl.appendChild(it);
    });

    setTimeBasedBackground(currentContent);
    updateGameText();
    initDragAndDrop();
}

// ------------------ DRAG & DROP ------------------
function initDragAndDrop() {
    let activeClone = null,
        activeSource = null,
        selectedForTap = null,
        matched = 0,
        totalNeeded = trayEl.children.length;

    function basketAtPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.basket') : null;
    }

    function createClone(text, x, y) {
        const c = document.createElement('div');
        c.className = 'item dragging';
        c.style.position = 'fixed';
        c.style.left = (x - 36) + 'px';
        c.style.top = (y - 36) + 'px';
        c.style.zIndex = 9999;
        c.style.pointerEvents = 'none';
        c.innerHTML = `<img src="${imagePath(text)}" alt="${text}" draggable="false">`;
        document.body.appendChild(c);
        return c;
    }

    function destroyClone() {
        if (activeClone) activeClone.remove();
        if (activeSource) activeSource.classList.remove('dragging');
        activeClone = null;
        activeSource = null;
    }

    function isMatch(basket, emoji) {
        return (gameMode === "sorting" && basket.dataset.item === emoji) || (gameMode === "flowers" && basket.dataset.item === "flowers");
    }

    function placeInBasket(basket, emoji) {
        const src = trayEl.querySelector(`.item[data-item='${emoji}']`);
        if (src) src.remove();
        if (gameMode === "flowers") {
            const basketImgs = Array.from(basket.querySelectorAll('.placed-item'));
            basketImgs.forEach(img => {
                if (img.alt === emoji) img.style.opacity = '1.0';
            });
            const mainImg = basket.querySelector('img:not(.placed-item)');
            if (mainImg) mainImg.style.opacity = '1.0';
        } else if (gameMode === "sorting") {
            basket.classList.add('filled');
            const hintImg = basket.querySelector('.hint');
            if (hintImg) hintImg.style.opacity = '1.0';
        }
        matched++;
        messageEl.textContent = matched === totalNeeded ? currentContent.text1 : '';

        if (matched === totalNeeded && elderlyInfo.elderlyId && elderlyInfo.elderlyName) {
            setTimeout(() => {
                const payload = {
                    elderlyId: elderlyInfo.elderlyId,
                    elderlyName: elderlyInfo.elderlyName,
                    status: "Checked In",
                };
                console.log("Check-in payload:", payload);

                fetch("/checkin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                })
                .then(r => r.json())
                .then(data => {
                    console.log("ServiceNow response:", data);
                    messageEl.textContent = currentContent.text2;
                })
                .catch(err => {
                    console.error("Check-in error:", err);
                    messageEl.textContent = currentContent.text3;
                });
            }, 400);
        }
    }

    function onItemMouseDown(e) {
        e.preventDefault();
        const item = e.currentTarget;
        const emoji = item.dataset.item;
        activeSource = item;
        activeSource.classList.add('dragging');
        activeClone = createClone(emoji, e.clientX, e.clientY);
        const moveHandler = ev => {
            activeClone.style.left = (ev.clientX - 36) + 'px';
            activeClone.style.top = (ev.clientY - 36) + 'px';
        };
        const upHandler = ev => {
            const basket = basketAtPoint(ev.clientX, ev.clientY);
            if (basket && isMatch(basket, emoji)) placeInBasket(basket, emoji);
            else messageEl.textContent = currentContent.text4;
            destroyClone();
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }

    function onItemTouchStart(e) {
        if (e.touches.length > 1) return;
        e.preventDefault();
        const item = e.currentTarget;
        const emoji = item.dataset.item;
        activeSource = item;
        activeSource.classList.add('dragging');
        const t = e.touches[0];
        activeClone = createClone(emoji, t.clientX, t.clientY);
        const moveHandler = ev => {
            if (!ev.touches.length) return;
            const tt = ev.touches[0];
            activeClone.style.left = (tt.clientX - 36) + 'px';
            activeClone.style.top = (tt.clientY - 36) + 'px';
        };
        const endHandler = ev => {
            const changed = ev.changedTouches[0];
            const basket = basketAtPoint(changed.clientX, changed.clientY);
            if (basket && isMatch(basket, emoji)) placeInBasket(basket, emoji);
            else messageEl.textContent = currentContent.text4;
            destroyClone();
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
        };
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
    }

    function onItemTap(e) {
        const it = e.currentTarget;
        if (selectedForTap === it) {
            it.classList.remove('selected');
            selectedForTap = null;
            messageEl.textContent = '';
            return;
        }
        if (selectedForTap) selectedForTap.classList.remove('selected');
        selectedForTap = it;
        it.classList.add('selected');
        messageEl.textContent = currentContent.text51 + it.dataset.item + currentContent.text52;
    }

    function onBasketTap(e) {
        const b = e.currentTarget;
        if (!selectedForTap) {
            messageEl.textContent = currentContent.text6;
            return;
        }
        const emoji = selectedForTap.dataset.item;
        if (isMatch(b, emoji)) placeInBasket(b, emoji);
        else messageEl.textContent = currentContent.text4;
        selectedForTap.classList.remove('selected');
        selectedForTap = null;
    }

    trayEl.querySelectorAll('.item').forEach(it => {
        it.addEventListener('mousedown', onItemMouseDown);
        it.addEventListener('touchstart', onItemTouchStart, { passive: false });
        it.addEventListener('click', onItemTap);
    });
    basketsEl.querySelectorAll('.basket').forEach(b => b.addEventListener('click', onBasketTap));
}

// ------------------ OMIKUJI ------------------
function initOmikuji() {
    if (gameMode !== "omikuji") return;
    omikujiWrapper.style.display = "block";
    const sticksTray = document.getElementById("sticksTray");
    const fortuneMessage = document.getElementById("fortuneMessage");
    sticksTray.innerHTML = "";

    let stickBtn = document.getElementById("drawStickBtn");
    if (!stickBtn) {
        stickBtn = document.createElement("button");
        stickBtn.id = "drawStickBtn";
        stickBtn.textContent = "Draw Stick";
        stickBtn.style.fontSize = "1.2em";
        stickBtn.style.padding = "10px 20px";
        sticksTray.appendChild(stickBtn);
    }

    const fortunes = ["Uber Luck! ✨", "Super Luck! 🌟", "Lucky Day! 🍀", "Good day for a good day 😄", "Peaceful day 😊"];
    stickBtn.onclick = () => {
        const f = fortunes[Math.floor(Math.random() * fortunes.length)];
        fortuneMessage.textContent = `Your fortune: ${f}`;

        if (elderlyInfo.elderlyId && elderlyInfo.elderlyName) {
            const payload = {
                elderlyId: elderlyInfo.elderlyId,
                elderlyName: elderlyInfo.elderlyName,
                status: "Checked In"
            };

            fetch("/checkin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(data => {
                console.log("Omikuji check-in response:", data);
                if (messageEl) messageEl.textContent = "Check-in recorded successfully! 💛";
            })
            .catch(err => {
                console.error("Omikuji check-in error:", err);
                if (messageEl) messageEl.textContent = "Couldn't connect. Try again later 🙏";
            });
        }
    };
}

// ------------------ START ------------------
initGame();
initOmikuji();
