// popup.js
document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup loaded, requesting status");
  
  // Immediately request status when popup opens
  updateStatus();
  
  // Listen for status updates
  chrome.runtime.onMessage.addListener((message) => {
    console.log("Received message:", message);
    if (message.action === "callStateChanged") {
      updateUI(
        message.isOnAir, 
        message.inCall, 
        message.isScreenSharing,
        message.webrtcTabs || 0,
        message.mediaTabs || 0
      );
    }
  });
  
  // Add refresh button functionality
  document.getElementById('refreshButton').addEventListener('click', () => {
    console.log("Refresh button clicked");
    updateStatus();
  });
  
  // Auto-refresh status every 3 seconds
  setInterval(updateStatus, 3000);
});

function updateStatus() {
  console.log("Sending getCallStatus request");
  chrome.runtime.sendMessage(
    { action: "getCallStatus" },
    (response) => {
      console.log("Received status response:", response);
      
      // Check if we got a valid response
      if (response) {
        updateUI(
          response.isOnAir, 
          response.inCall, 
          response.isScreenSharing,
          response.webrtcTabs || 0,
          response.mediaTabs || 0
        );
        
        // Update details sections if available
        if (response.webrtcDetails && response.webrtcDetails.length > 0) {
          showWebRTCDetails(response.webrtcDetails);
        } else {
          hideWebRTCDetails();
        }
        
        if (response.mediaDetails && response.mediaDetails.length > 0) {
          showMediaDetails(response.mediaDetails);
        } else {
          hideMediaDetails();
        }
      } else {
        console.error("No response received or error occurred:", chrome.runtime.lastError);
        // Set default UI state on error
        updateUI(false, false, false, 0, 0);
        hideWebRTCDetails();
        hideMediaDetails();
      }
    }
  );
}

function updateUI(isOnAir, inCall, isScreenSharing, webrtcTabs, mediaTabs) {
  console.log("Updating UI:", isOnAir, inCall, isScreenSharing, webrtcTabs, mediaTabs);
  
  const indicator = document.getElementById('indicator');
  const statusText = document.getElementById('statusText');
  const webrtcStatus = document.getElementById('webrtcStatus');
  const mediaStatus = document.getElementById('mediaStatus');
  
  // Update main status
  if (isOnAir) {
    indicator.className = 'indicator active';
    statusText.textContent = `ON AIR`;
  } else {
    indicator.className = 'indicator inactive';
    statusText.textContent = 'Not On Air';
  }
  
  // Update WebRTC status
  if (inCall) {
    webrtcStatus.className = 'status-value active';
    webrtcStatus.textContent = `Active (${webrtcTabs} tab${webrtcTabs !== 1 ? 's' : ''})`;
  } else {
    webrtcStatus.className = 'status-value inactive';
    webrtcStatus.textContent = 'Not Active';
  }
  
  // Update Screen/Camera status
  if (isScreenSharing) {
    mediaStatus.className = 'status-value active';
    mediaStatus.textContent = `Active (${mediaTabs} tab${mediaTabs !== 1 ? 's' : ''})`;
  } else {
    mediaStatus.className = 'status-value inactive';
    mediaStatus.textContent = 'Not Active';
  }
}

function showWebRTCDetails(details) {
  const container = document.getElementById('webrtcDetailsContainer');
  const list = document.getElementById('webrtcDetailsList');
  
  // Clear previous details
  list.innerHTML = '';
  
  // Add each active tab to the list
  details.forEach(item => {
    const listItem = document.createElement('li');
    
    // Format the URL to be more readable
    let displayUrl = item.url;
    try {
      const urlObj = new URL(item.url);
      displayUrl = urlObj.hostname;
    } catch (e) {
      // Keep original if parsing fails
    }
    
    // Format time
    const timeAgo = getTimeAgo(item.lastActivity);
    
    listItem.innerHTML = `
      <div class="detail-item">
        <div class="detail-url" title="${item.url}">${displayUrl}</div>
        <div class="detail-info">
          <span class="detail-method">${item.method}</span>
          <span class="detail-time">${timeAgo}</span>
        </div>
      </div>
    `;
    
    list.appendChild(listItem);
  });
  
  container.style.display = 'block';
}

function hideWebRTCDetails() {
  document.getElementById('webrtcDetailsContainer').style.display = 'none';
}

function showMediaDetails(details) {
  const container = document.getElementById('mediaDetailsContainer');
  const list = document.getElementById('mediaDetailsList');
  
  // Clear previous details
  list.innerHTML = '';
  
  // Add each active tab to the list
  details.forEach(item => {
    const listItem = document.createElement('li');
    
    // Format the URL to be more readable
    let displayUrl = item.url;
    try {
      const urlObj = new URL(item.url);
      displayUrl = urlObj.hostname;
    } catch (e) {
      // Keep original if parsing fails
    }
    
    // Format time
    const timeAgo = getTimeAgo(item.lastActivity);
    
    // Format capture type
    let captureType = item.type;
    if (captureType === 'screen-capture') {
      captureType = 'Screen sharing';
    } else if (captureType === 'user-media') {
      captureType = 'Camera/Mic';
    }
    
    listItem.innerHTML = `
      <div class="detail-item">
        <div class="detail-url" title="${item.url}">${displayUrl}</div>
        <div class="detail-info">
          <span class="detail-method">${captureType}</span>
          <span class="detail-time">${timeAgo}</span>
        </div>
      </div>
    `;
    
    list.appendChild(listItem);
  });
  
  container.style.display = 'block';
}

function hideMediaDetails() {
  document.getElementById('mediaDetailsContainer').style.display = 'none';
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) {
    return 'just now';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  } else {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
}