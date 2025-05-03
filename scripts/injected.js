// scripts/injected.js
console.log('WebRTC Detector: Injected script running');

// Track media devices usage
let isCapturingScreen = false;
let isCapturingUserMedia = false;
let activePeerConnections = [];

// Hook into navigator.mediaDevices.getDisplayMedia to detect screen sharing
const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
navigator.mediaDevices.getDisplayMedia = async function(constraints) {
  console.log('Screen capture detected via getDisplayMedia');
  
  try {
    const stream = await originalGetDisplayMedia.call(navigator.mediaDevices, constraints);
    
    // When screen sharing starts, notify content script
    isCapturingScreen = true;
    window.postMessage(['MediaCapture', window.location.href, 'screen-capture'], '*');
    
    // When screen sharing stops, notify content script
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        console.log('Screen capture track ended');
        
        // Check if any tracks are still active
        const hasActiveTracks = stream.getTracks().some(t => !t.ended);
        
        if (!hasActiveTracks) {
          isCapturingScreen = false;
          window.postMessage(['MediaCaptureEnded', window.location.href, 'screen-capture'], '*');
        }
      });
    });
    
    return stream;
  } catch (error) {
    console.error('Error in getDisplayMedia:', error);
    throw error;
  }
};

// Hook into navigator.mediaDevices.getUserMedia to detect camera/mic usage
const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = async function(constraints) {
  console.log('Media capture detected via getUserMedia', constraints);
  
  try {
    const stream = await originalGetUserMedia.call(navigator.mediaDevices, constraints);
    
    // Check if we're capturing video or audio
    const isCapturingVideo = constraints.video !== undefined && constraints.video !== false;
    const isCapturingAudio = constraints.audio !== undefined && constraints.audio !== false;
    
    if (isCapturingVideo || isCapturingAudio) {
      isCapturingUserMedia = true;
      window.postMessage(['MediaCapture', window.location.href, 'user-media'], '*');
      
      // When media capture stops, notify content script
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('User media track ended');
          
          // Check if any tracks are still active
          const hasActiveTracks = stream.getTracks().some(t => !t.ended);
          
          if (!hasActiveTracks) {
            isCapturingUserMedia = false;
            window.postMessage(['MediaCaptureEnded', window.location.href, 'user-media'], '*');
          }
        });
      });
    }
    
    return stream;
  } catch (error) {
    console.error('Error in getUserMedia:', error);
    throw error;
  }
};

// Send regular heartbeats for active sessions
setInterval(() => {
  // Send heartbeat for media capture if active
  if (isCapturingScreen || isCapturingUserMedia) {
    window.postMessage([
      'MediaCaptureHeartbeat', 
      window.location.href, 
      isCapturingScreen ? 'screen-capture' : 'user-media'
    ], '*');
  }
  
  // Send heartbeat for WebRTC connections if any are active
  if (activePeerConnections.length > 0) {
    // Filter list to only active connections
    const activeConnections = activePeerConnections.filter(pc => {
      if (!pc || !pc.connectionState) return false;
      
      return pc.connectionState === 'connected' || 
             pc.connectionState === 'connecting' ||
             pc.iceConnectionState === 'connected' ||
             pc.iceConnectionState === 'completed' ||
             pc.iceConnectionState === 'checking';
    });
    
    if (activeConnections.length > 0) {
      window.postMessage(['WebRTCHeartbeat', window.location.href, activeConnections.length], '*');
    }
  }
}, 3000); // Send heartbeat every 3 seconds

// Override RTCPeerConnection constructor to track all connections
const originalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(...args) {
  const pc = new originalRTCPeerConnection(...args);
  console.log('New RTCPeerConnection created');
  
  // Add to tracking array
  activePeerConnections.push(pc);
  
  // Monitor connection state changes
  pc.addEventListener('connectionstatechange', () => {
    console.log(`Connection state changed: ${pc.connectionState}`);
    window.postMessage(['WebRTCSnoop', window.location.href, `connectionState:${pc.connectionState}`], '*');
  });
  
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log(`ICE connection state changed: ${pc.iceConnectionState}`);
    window.postMessage(['WebRTCSnoop', window.location.href, `iceConnectionState:${pc.iceConnectionState}`], '*');
  });
  
  // Notify that a new connection was created
  window.postMessage(['WebRTCSnoop', window.location.href, 'newConnection'], '*');
  
  return pc;
};

// Hook into RTCPeerConnection methods to detect WebRTC usage
const rtcMethods = [
  'createOffer', 
  'createAnswer',
  'setLocalDescription', 
  'setRemoteDescription'
];

rtcMethods.forEach(function(method) {
  if (!RTCPeerConnection.prototype[method]) return;
  
  const nativeMethod = RTCPeerConnection.prototype[method];
  RTCPeerConnection.prototype[method] = function() {
    // Send message to content script
    window.postMessage(['WebRTCSnoop', window.location.href, method], '*');
    
    // Add ice candidate listener if not already added
    if (!this._iceListenerAdded) {
      this.addEventListener('icecandidate', function(event) {
        if (event.candidate) {
          window.postMessage(['WebRTCSnoop', window.location.href, 'iceCandidate'], '*');
        }
      });
      this._iceListenerAdded = true;
    }
    
    // Call the original method
    return nativeMethod.apply(this, arguments);
  };
});