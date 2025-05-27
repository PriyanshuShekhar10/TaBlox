let lock = null;

// Add a helper function to safely send messages to content script
async function safeSendMessageToContentScript(tabId, message) {
  console.debug(
    "Tab Lock Timer: Attempting to send message to content script:",
    { tabId, message }
  );
  try {
    // First check if the tab exists
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      console.debug("Tab Lock Timer: Tab not found:", tabId);
      return false;
    }

    // Try to send the message
    console.debug("Tab Lock Timer: Sending message to tab:", tabId);
    await chrome.tabs.sendMessage(tabId, message);
    console.debug("Tab Lock Timer: Message sent successfully");
    return true;
  } catch (error) {
    // If the content script isn't loaded yet, inject it and try again
    if (
      error.message &&
      error.message.includes("Receiving end does not exist")
    ) {
      console.debug(
        "Tab Lock Timer: Content script not loaded, attempting injection"
      );
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        // Try sending the message again after injection
        console.debug(
          "Tab Lock Timer: Content script injected, retrying message"
        );
        await chrome.tabs.sendMessage(tabId, message);
        console.debug(
          "Tab Lock Timer: Message sent successfully after injection"
        );
        return true;
      } catch (retryError) {
        console.debug(
          "Tab Lock Timer: Failed to inject content script:",
          retryError.message
        );
        return false;
      }
    }
    console.debug(
      "Tab Lock Timer: Failed to send message to content script:",
      error.message
    );
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "start-lock") {
    // initialize lock
    lock = {
      tabId: msg.tabId,
      windowId: msg.windowId,
      url: msg.url,
      endTime: Date.now() + msg.durationMs,
    };
    // schedule unlock
    chrome.alarms.clearAll(() => {
      chrome.alarms.create("unlock", { when: lock.endTime });
    });
    // Enable navigation lock in the content script
    safeSendMessageToContentScript(msg.tabId, { action: "enable-nav-lock" });
    sendResponse({ endTime: lock.endTime });
  } else if (msg.action === "stop-lock") {
    if (lock) {
      chrome.alarms.clearAll();
      // Disable navigation lock in the content script
      safeSendMessageToContentScript(lock.tabId, {
        action: "disable-nav-lock",
      });
      lock = null;
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/48.png",
        title: "Tab Lock Timer",
        message: "Lock has been stopped.",
      });
    }
    sendResponse({ success: true });
  } else if (msg.action === "get-lock-status") {
    sendResponse({
      isLocked: lock !== null,
      endTime: lock ? lock.endTime : null,
    });
  }
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.debug("Tab Lock Timer: Alarm triggered:", alarm);
  if (alarm.name === "unlock") {
    console.debug("Tab Lock Timer: Timer ended, current lock state:", lock);
    if (lock) {
      // Disable navigation lock in the content script when timer ends
      console.debug("Tab Lock Timer: Attempting to disable navigation lock");
      const success = await safeSendMessageToContentScript(lock.tabId, {
        action: "disable-nav-lock",
      });
      console.debug("Tab Lock Timer: Disable navigation lock result:", success);

      // Update popup UI if it's open
      try {
        const views = chrome.extension.getViews({ type: "popup" });
        if (views.length > 0) {
          console.debug("Tab Lock Timer: Updating popup UI");
          views.forEach((view) => {
            if (view.document.getElementById("timerContainer")) {
              view.document
                .getElementById("timerContainer")
                .classList.add("hidden");
              view.document
                .getElementById("progressText")
                .classList.add("hidden");
              view.document.getElementById("status").textContent =
                "Lock has ended";
              view.document.getElementById("start").classList.remove("hidden");
              view.document.getElementById("stop").classList.add("hidden");
            }
          });
        }
      } catch (error) {
        console.debug(
          "Tab Lock Timer: Failed to update popup UI:",
          error.message
        );
      }
    }
    lock = null;
    console.debug("Tab Lock Timer: Lock cleared");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/48.png",
      title: "Tab Lock Timer",
      message: "Your lock has ended. You may switch tabs now.",
    });
  }
});

// Add a helper function to safely update tabs with retry
async function safeTabUpdate(tabId, updateProperties, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      await chrome.tabs.update(tabId, updateProperties);
      return true;
    } catch (error) {
      // Check if the error is due to tab dragging
      if (
        error.message &&
        error.message.includes("cannot be edited right now")
      ) {
        retries++;
        if (retries < maxRetries) {
          // Wait a short time before retrying
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
      }
      // For other errors or if we've exhausted retries, just log and return
      console.debug("Tab Lock Timer: Tab update failed:", error.message);
      return false;
    }
  }
  return false;
}

// Add a helper function to safely update windows with retry
async function safeWindowUpdate(windowId, updateProperties, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      await chrome.windows.update(windowId, updateProperties);
      return true;
    } catch (error) {
      if (
        error.message &&
        error.message.includes("cannot be edited right now")
      ) {
        retries++;
        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
      }
      console.debug("Tab Lock Timer: Window update failed:", error.message);
      return false;
    }
  }
  return false;
}

// Replace the enforceLock function with a more robust version
async function enforceLock() {
  if (!lock) return;

  try {
    // Try to update window and tab in sequence
    const windowUpdated = await safeWindowUpdate(lock.windowId, {
      focused: true,
    });
    if (windowUpdated) {
      await safeTabUpdate(lock.tabId, { active: true });
    }
  } catch (error) {
    console.debug("Tab Lock Timer: Lock enforcement failed:", error.message);
  }
}

// Update the tab activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (lock && activeInfo.tabId !== lock.tabId) {
    const success = await safeTabUpdate(lock.tabId, { active: true });
    if (success) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/48.png",
        title: "Tab Locked",
        message: "You cannot switch tabs until the timer ends.",
        priority: 2,
      });
    }
  }
});

// Update the window focus listener
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (lock && winId !== lock.windowId) {
    const windowUpdated = await safeWindowUpdate(lock.windowId, {
      focused: true,
    });
    if (windowUpdated) {
      await safeTabUpdate(lock.tabId, { active: true });
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/48.png",
        title: "Tab Locked",
        message: "You cannot switch windows until the timer ends.",
        priority: 2,
      });
    }
  }
});

// Update the navigation listener
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (lock && details.tabId === lock.tabId && details.url !== lock.url) {
    await safeTabUpdate(lock.tabId, { url: lock.url });
  }
});
