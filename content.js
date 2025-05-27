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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "enable-nav-lock") {
    navLocked = true;
  } else if (msg.action === "disable-nav-lock") {
    navLocked = false;
  }
  sendResponse({ navLocked });
});

// 1) Block all <a> clicks
document.addEventListener(
  "click",
  (e) => {
    if (!navLocked) return;
    const a = e.target.closest("a[href]");
    if (a && a.href) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert("Navigation is locked until your timer ends.");
    }
  },
  true
);

// 2) Block form submissions
document.addEventListener(
  "submit",
  (e) => {
    if (navLocked) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert("Form submissions are disabled until the lock ends.");
    }
  },
  true
);

// 3) Block reload/back/forward/address‐bar
window.addEventListener("beforeunload", (e) => {
  if (navLocked) {
    e.preventDefault();
    e.returnValue = "Navigation is locked until the timer ends.";
  }
});

// 4) Prevent SPA navigations via history API
["pushState", "replaceState"].forEach((fn) => {
  const orig = history[fn];
  history[fn] = function (...args) {
    if (navLocked) {
      alert("Navigation is locked until your timer ends.");
      return;
    }
    return orig.apply(this, args);
  };
});

// —— End nav‐lock logic —— //

initialize();
window.addEventListener("unload", cleanup);
