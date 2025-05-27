// content.js

// Safe DOM observation and cleanup (unchanged aside from nav-lock bits)
let observer = null;
let isInitialized = false;

function safeObserve(target) {
  if (!target || !(target instanceof Node)) {
    console.debug("Tab Lock Timer: Invalid target for observation");
    return;
  }

  try {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      // no-op
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });

    isInitialized = true;
  } catch (error) {
    console.debug(
      "Tab Lock Timer: Error during initialization:",
      error.message
    );
  }
}

function cleanup() {
  try {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    isInitialized = false;
  } catch (error) {
    console.debug("Tab Lock Timer: Error during cleanup:", error.message);
  }
}

// Initialize DOM observer
function initialize() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!document.documentElement.hasAttribute("sandbox")) {
        safeObserve(document.body);
      }
    });
  } else if (!document.documentElement.hasAttribute("sandbox")) {
    safeObserve(document.body);
  }
}

// Listen for cleanup command
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "cleanup") {
    cleanup();
    sendResponse({ success: true });
  }
});

// —— NEW: Navigation‐lock logic —— //

let navLocked = false;

// Add function to check lock status on page load
async function checkLockStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "get-lock-status",
    });
    const wasLocked = navLocked;
    navLocked = response && response.isLocked;
    console.debug("Tab Lock Timer: Lock status checked:", {
      wasLocked,
      isLocked: navLocked,
      response,
    });
  } catch (error) {
    console.debug(
      "Tab Lock Timer: Failed to check lock status:",
      error.message
    );
    navLocked = false;
  }
}

// Check lock status when page loads
checkLockStatus();

// Update message listener to handle page reloads
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.debug("Tab Lock Timer: Received message:", msg);
  const wasLocked = navLocked;

  if (msg.action === "enable-nav-lock") {
    navLocked = true;
  } else if (msg.action === "disable-nav-lock") {
    navLocked = false;
    // Hide notification if it's showing
    notification.classList.remove("show");
  } else if (msg.action === "get-lock-status") {
    sendResponse({ navLocked });
  }

  console.debug("Tab Lock Timer: Lock state changed:", {
    wasLocked,
    isLocked: navLocked,
    action: msg.action,
  });
  sendResponse({ navLocked });
  return true;
});

// Update beforeunload handler to not show notification
window.addEventListener("beforeunload", (e) => {
  if (navLocked) {
    e.preventDefault();
    e.returnValue = "Navigation is locked until the timer ends.";
    // Don't show notification on page unload
    return;
  }
});

// Add visibility change handler to check lock status when tab becomes visible
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    checkLockStatus();
  }
});

// Add custom notification styles
const style = document.createElement("style");
style.textContent = `
  .tablock-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-radius: 12px;
    padding: 16px 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    max-width: 320px;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .tablock-notification.show {
    transform: translateX(0);
  }

  .tablock-notification-icon {
    width: 24px;
    height: 24px;
    color: #1a73e8;
    flex-shrink: 0;
  }

  .tablock-notification-content {
    flex-grow: 1;
  }

  .tablock-notification-title {
    font-weight: 600;
    font-size: 14px;
    color: #202124;
    margin: 0 0 4px 0;
  }

  .tablock-notification-message {
    font-size: 13px;
    color: #5f6368;
    margin: 0;
    line-height: 1.4;
  }

  .tablock-notification-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #5f6368;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
  }

  .tablock-notification-close:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .tablock-notification-close svg {
    width: 16px;
    height: 16px;
  }

  @keyframes slideIn {
    from { transform: translateX(120%); }
    to { transform: translateX(0); }
  }

  @keyframes slideOut {
    from { transform: translateX(0); }
    to { transform: translateX(120%); }
  }
`;
document.head.appendChild(style);

// Create notification element
const notification = document.createElement("div");
notification.className = "tablock-notification";
notification.innerHTML = `
  <svg class="tablock-notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
    <path d="M12 8v4M12 16h.01"/>
  </svg>
  <div class="tablock-notification-content">
    <h3 class="tablock-notification-title">Navigation Locked</h3>
    <p class="tablock-notification-message">Please wait until the timer ends to navigate.</p>
  </div>
  <button class="tablock-notification-close" aria-label="Close notification">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  </button>
`;
document.body.appendChild(notification);

// Function to show notification
function showNotification() {
  notification.classList.add("show");
  // Auto-hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove("show");
  }, 5000);
}

// Add close button functionality
notification
  .querySelector(".tablock-notification-close")
  .addEventListener("click", () => {
    notification.classList.remove("show");
  });

// Update click handler to log state
document.addEventListener(
  "click",
  (e) => {
    if (!navLocked) return;
    const a = e.target.closest("a[href]");
    if (a && a.href) {
      console.debug("Tab Lock Timer: Blocked navigation attempt:", {
        href: a.href,
        navLocked,
      });
      e.preventDefault();
      e.stopImmediatePropagation();
      showNotification();
    }
  },
  true
);

// Update form submission handler
document.addEventListener(
  "submit",
  (e) => {
    if (navLocked) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showNotification();
    }
  },
  true
);

// Update history API handlers
["pushState", "replaceState"].forEach((fn) => {
  const orig = history[fn];
  history[fn] = function (...args) {
    if (navLocked) {
      showNotification();
      return;
    }
    return orig.apply(this, args);
  };
});

// Create a floating widget element
const widget = document.createElement("div");
widget.className = "tablock-widget";
widget.style.position = "fixed";
widget.style.bottom = "20px";
widget.style.right = "20px";
widget.style.backgroundColor = "#1a73e8";
widget.style.color = "white";
widget.style.padding = "8px 12px";
widget.style.borderRadius = "8px";
widget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
widget.style.zIndex = "2147483647";
widget.style.fontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
widget.style.display = "none";
document.body.appendChild(widget);

// Function to update the widget with remaining time
let lastDisplayedTime = "";
function updateWidget(endTime) {
  const now = Date.now();
  const remaining = endTime - now;
  if (remaining <= 0) {
    widget.style.display = "none";
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const newTime = `Time remaining: ${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
  if (newTime !== lastDisplayedTime) {
    widget.textContent = newTime;
    lastDisplayedTime = newTime;
  }
  widget.style.display = "block";
}

// Function to start updating the widget
document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ action: "get-lock-status" }, (response) => {
    if (response && response.isLocked) {
      const endTime = response.endTime;
      updateWidget(endTime);
      setInterval(() => updateWidget(endTime), 1000);
    }
  });
});

// Update message listener to start widget update when lock is enabled
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.debug("Tab Lock Timer: Received message:", msg);
  if (msg.action === "enable-nav-lock") {
    const endTime = msg.endTime;
    updateWidget(endTime);
    setInterval(() => updateWidget(endTime), 1000);
  } else if (msg.action === "disable-nav-lock") {
    widget.style.display = "none";
  }
  sendResponse({ navLocked });
  return true;
});

initialize();
window.addEventListener("unload", cleanup);
