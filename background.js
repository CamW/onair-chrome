// background.js
let isInCall = false;
let isScreenSharing = false;
let activeWebRTCTabs = new Map(); // Track tabs with active WebRTC
let activeMediaCaptures = new Map(); // Track tabs with active media captures
const TIMEOUT_DURATION = 60000; // Increase timeout to 60 seconds

// Update the extension icon based on call state
function updateIcon() {
  const isOnAir = isInCall || isScreenSharing;
  console.log("Updating icon to", isOnAir ? "active" : "inactive");
  console.log("WebRTC active:", isInCall, "Screen sharing active:", isScreenSharing);
  
  // Define the paths for active and inactive icons
  const iconPath = isOnAir 
    ? {
        "16": "images/onair_16_active.png",
        "32": "images/onair_32_active.png",
        "48": "images/onair_48_active.png",
        "128": "images/onair_128_active.png"
      }
    : {
        "16": "images/onair_16.png",
        "32": "images/onair_32.png",
        "48": "images/onair_48.png",
        "128": "images/onair_128.png"
      };
  
  // Log icon state for debugging
  console.log("Setting icon to", isOnAir ? "active" : "inactive");
  
  try {
    chrome.action.setIcon({ path: iconPath }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error updating icon:", chrome.runtime.lastError);
      } else {
        console.log("Icon updated successfully");
      }
    });
    
    // Update badge text
    if (isOnAir) {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    console.error("Exception when updating icon:", e);
  }
}

// Function to periodically cleanup stale sessions
function startCleanupTimer() {
  // Check for stale sessions every 10 seconds
  setInterval(() => {
    const now = Date.now();
    let stateChanged = false;
    
    console.log('Running cleanup check');
    console.log('Active WebRTC tabs:', activeWebRTCTabs.size);
    console.log('Active media captures:', activeMediaCaptures.size);
    
    // Clean up stale WebRTC sessions
    activeWebRTCTabs.forEach((data, tabId) => {
      const timeSinceActivity = now - data.lastActivity;
      console.log(`Tab ${tabId} WebRTC last activity: ${timeSinceActivity/1000}s ago`);
      
      if (timeSinceActivity > TIMEOUT_DURATION) {
        console.log(`WebRTC session in tab ${tabId} timed out (${TIMEOUT_DURATION / 1000}s without activity)`);
        activeWebRTCTabs.delete(tabId);
        stateChanged = true;
      }
    });
    
    // Clean up stale media captures
    activeMediaCaptures.forEach((data, tabId) => {
      const timeSinceActivity = now - data.lastActivity;
      console.log(`Tab ${tabId} Media Capture last activity: ${timeSinceActivity/1000}s ago`);
      
      if (timeSinceActivity > TIMEOUT_DURATION) {
        console.log(`Media capture in tab ${tabId} timed out (${TIMEOUT_DURATION / 1000}s without activity)`);
        activeMediaCaptures.delete(tabId);
        stateChanged = true;
      }
    });
    
    // Update state if anything changed
    if (stateChanged) {
      updateState();
    }
  }, 10000);
}

// Update the global state based on active tabs
function updateState() {
  const wasInCall = isInCall;
  const wasScreenSharing = isScreenSharing;
  
  // Check if any tab has an active connection
  isInCall = Array.from(activeWebRTCTabs.values()).some(data => 
    data.isActive === true || 
    (data.method && (
      data.method.includes('connectionState:connected') ||
      data.method.includes('iceConnectionState:connected') ||
      data.method.includes('iceConnectionState:completed')
    ))
  );
  
  isScreenSharing = activeMediaCaptures.size > 0;
  
  if (wasInCall !== isInCall || wasScreenSharing !== isScreenSharing) {
    updateIcon();
    notifyPopup();
  }
}

// Notify the popup about status changes
function notifyPopup() {
  const isOnAir = isInCall || isScreenSharing;
  
  chrome.runtime.sendMessage({
    action: "callStateChanged",
    isOnAir: isOnAir,
    inCall: isInCall,
    isScreenSharing: isScreenSharing,
    webrtcTabs: Array.from(activeWebRTCTabs.keys()).length,
    mediaTabs: Array.from(activeMediaCaptures.keys()).length
  }).catch(err => {
    // This is normal if popup is not open
    console.log("Could not send message to popup (it's probably not open)");
  });
}

// Initialize when extension is loaded
chrome.runtime.onInstalled.addListener(() => {
  console.log('On Air Detector extension installed');
  updateIcon();
  startCleanupTimer();
});

// Listen for activity from content scripts
chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;
  
  console.log(`Connected to tab ${tabId}`);
  
  port.onMessage.addListener((message) => {
    if (!Array.isArray(message)) return;
    
    const messageType = message[0];
    const url = message[1];
    const details = message[2];
    
    console.log(`Received ${messageType} from tab ${tabId}`);
    
    switch (messageType) {
      case 'WebRTCSnoop':
      case 'WebRTCHeartbeat':
        // Handle WebRTC activity and heartbeats
        if (activeWebRTCTabs.has(tabId)) {
          const data = activeWebRTCTabs.get(tabId);
          data.lastActivity = Date.now();
          data.method = details || data.method;
        } else {
          activeWebRTCTabs.set(tabId, {
            url: url,
            lastActivity: Date.now(),
            method: details
          });
          updateState();
        }
        break;
        
      case 'MediaCapture':
      case 'MediaCaptureHeartbeat':
        // Handle media capture start and heartbeats
        if (activeMediaCaptures.has(tabId)) {
          const data = activeMediaCaptures.get(tabId);
          data.lastActivity = Date.now();
          data.type = details || data.type;
        } else {
          activeMediaCaptures.set(tabId, {
            url: url,
            lastActivity: Date.now(),
            type: details
          });
          updateState();
        }
        break;
        
      case 'MediaCaptureEnded':
        // Handle media capture ending
        if (activeMediaCaptures.has(tabId)) {
          activeMediaCaptures.delete(tabId);
          updateState();
        }
        break;
        
      case 'ContentHeartbeat':
        // Just a heartbeat to keep the connection alive
        break;
        
      default:
        console.log(`Unknown message type: ${messageType}`);
    }
  });
  
  // Handle disconnection - don't immediately clean up
  port.onDisconnect.addListener(() => {
    console.log(`Tab ${tabId} disconnected`);
  });
});

// Handle tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  let stateChanged = false;
  
  if (activeWebRTCTabs.has(tabId)) {
    activeWebRTCTabs.delete(tabId);
    stateChanged = true;
  }
  
  if (activeMediaCaptures.has(tabId)) {
    activeMediaCaptures.delete(tabId);
    stateChanged = true;
  }
  
  if (stateChanged) {
    updateState();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getCallStatus") {
    // Return current status
    const isOnAir = isInCall || isScreenSharing;
    
    const webrtcDetails = Array.from(activeWebRTCTabs.entries()).map(([tabId, data]) => {
      return {
        tabId: tabId,
        url: data.url,
        lastActivity: data.lastActivity,
        method: data.method
      };
    });
    
    const mediaDetails = Array.from(activeMediaCaptures.entries()).map(([tabId, data]) => {
      return {
        tabId: tabId,
        url: data.url,
        lastActivity: data.lastActivity,
        type: data.type
      };
    });
    
    sendResponse({ 
      isOnAir: isOnAir,
      inCall: isInCall,
      isScreenSharing: isScreenSharing,
      webrtcTabs: activeWebRTCTabs.size,
      mediaTabs: activeMediaCaptures.size,
      webrtcDetails: webrtcDetails,
      mediaDetails: mediaDetails
    });
    
    return true; // Keep the channel open for asynchronous response
  }
});