// content.js
console.log('WebRTC Detector: Content script running');

// Create a connection to the background script
const channel = chrome.runtime.connect();

// Inject the script that will monitor WebRTC activities
const injectScript = () => {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('scripts/injected.js');
    (document.head || document.documentElement).appendChild(s);
    s.onload = function() {
      s.remove();
      console.log('WebRTC Detector: Injected script loaded successfully');
    };
    s.onerror = function(error) {
      console.error('WebRTC Detector: Failed to load injected script', error);
    };
  } catch (e) {
    console.error('WebRTC Detector: Error injecting script', e);
  }
};

// Listen for messages from the injected script
window.addEventListener('message', function(event) {
  if (typeof(event.data) === 'string') return;
  if (!Array.isArray(event.data)) return;
  
  // Forward the message to the background script
  try {
    channel.postMessage(event.data);
    console.log('Message from page:', JSON.stringify(event.data));
  } catch (e) {
    console.error('WebRTC Detector: Error posting message to background', e);
    
    // Try to reconnect if the channel is closed
    setTimeout(() => {
      try {
        channel = chrome.runtime.connect();
        channel.postMessage(event.data);
      } catch (err) {
        console.error('WebRTC Detector: Failed to reconnect channel', err);
      }
    }, 1000);
  }
});

// Send a heartbeat to keep the connection alive
setInterval(() => {
  try {
    channel.postMessage(['ContentHeartbeat', window.location.href]);
  } catch (e) {
    // Try to reconnect if the channel is closed
    try {
      channel = chrome.runtime.connect();
    } catch (err) {
      console.error('WebRTC Detector: Failed to reconnect channel during heartbeat', err);
    }
  }
}, 10000);

// Inject the script when the content script loads
injectScript();