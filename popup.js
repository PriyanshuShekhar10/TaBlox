let countdownInterval = null;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 54; // 2πr where r=54

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateTimerProgress(endTime) {
  const now = Date.now();
  const remaining = endTime - now;
  const total = endTime - (endTime - remaining);
  const progress = remaining / total;

  const progressCircle = document.querySelector(".timer-circle-progress");
  const progressText = document.getElementById("progressText");

  // Update circle progress
  const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
  progressCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
  progressCircle.style.strokeDashoffset = offset;

  // Update progress text
  const percentage = Math.round(progress * 100);
  progressText.textContent = `${percentage}% complete`;
}

function updateCountdown(endTime) {
  const now = Date.now();
  const remaining = endTime - now;

  if (remaining <= 0) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    document.getElementById("timerContainer").classList.add("hidden");
    document.getElementById("progressText").classList.add("hidden");
    document.getElementById("status").textContent = "Lock has ended";
    document.getElementById("start").classList.remove("hidden");
    document.getElementById("stop").classList.add("hidden");
    return;
  }

  document.getElementById("countdown").textContent = formatTime(remaining);
  updateTimerProgress(endTime);
}

function startCountdown(endTime) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  // Show timer elements with animation
  const timerContainer = document.getElementById("timerContainer");
  const progressText = document.getElementById("progressText");
  timerContainer.classList.remove("hidden");
  progressText.classList.remove("hidden");

  // Reset progress circle
  const progressCircle = document.querySelector(".timer-circle-progress");
  progressCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
  progressCircle.style.strokeDashoffset = "0";

  document.getElementById("start").classList.add("hidden");
  document.getElementById("stop").classList.remove("hidden");

  // Update immediately and then every second
  updateCountdown(endTime);
  countdownInterval = setInterval(() => updateCountdown(endTime), 1000);
}

function stopLock() {
  chrome.runtime.sendMessage({ action: "stop-lock" }, () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    document.getElementById("timerContainer").classList.add("hidden");
    document.getElementById("progressText").classList.add("hidden");
    document.getElementById("status").textContent = "Lock stopped";
    document.getElementById("start").classList.remove("hidden");
    document.getElementById("stop").classList.add("hidden");
  });
}

// Check if there's an active lock when popup opens
chrome.runtime.sendMessage({ action: "get-lock-status" }, (response) => {
  if (response && response.isLocked) {
    startCountdown(response.endTime);
    const endTime = new Date(response.endTime);
    document.getElementById(
      "status"
    ).textContent = `Locked until ${endTime.toLocaleTimeString()}`;
  }
});

document.getElementById("start").addEventListener("click", async () => {
  const mins = parseInt(document.getElementById("minutes").value, 10);
  if (!mins || mins <= 0) {
    return alert("Please enter a positive number of minutes.");
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return alert("No active tab found.");
  }

  chrome.runtime.sendMessage(
    {
      action: "start-lock",
      durationMs: mins * 60 * 1000,
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
    },
    (response) => {
      if (response && response.endTime) {
        document.getElementById(
          "status"
        ).textContent = `Locked until ${new Date(
          response.endTime
        ).toLocaleTimeString()}`;
        startCountdown(response.endTime);
      }
    }
  );
});

document.getElementById("stop").addEventListener("click", stopLock);

// Cleanup when popup closes
window.addEventListener("unload", () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
