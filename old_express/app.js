/**
 * Voice Assistant Premium Dashboard Logic
 * Fully client-side controller using @ricky0123/vad-web and ONNX.
 */

// Global Configuration & State
const API_BASE = "http://localhost:3000";
let chatId = null;
let vadInstance = null;
let isConversationRunning = false;
let isAutolistenEnabled = true;
let currentMode = "assistant"; // "assistant" or "interviewer"

// Audio Visualization State
let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let isAudioContextInitialized = false;

// DOM Elements
const bodyEl = document.body;
const visualizerContainer = document.getElementById("visualizerContainer");
const orbCanvas = document.getElementById("orbCanvas");
const orbCore = document.getElementById("orbCore");
const toggleBtn = document.getElementById("toggleBtn");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("statusText");
const badgeLabel = document.getElementById("badgeLabel");
const statusBadge = document.getElementById("statusBadge");
const liveSubtitle = document.getElementById("liveSubtitle");
const chatHistory = document.getElementById("chatHistory");
const sessionVal = document.getElementById("sessionVal");
const logList = document.getElementById("logList");
const autolistenToggle = document.getElementById("autolistenToggle");
const aiPlayer = document.getElementById("aiPlayer");

// AI Interviewer Mode DOM Elements
const tabAssistant = document.getElementById("tabAssistant");
const tabInterviewer = document.getElementById("tabInterviewer");
const interviewInputsPanel = document.getElementById("interviewInputsPanel");
const jdInput = document.getElementById("jdInput");
const resumeInput = document.getElementById("resumeInput");

// Canvas context
const ctx = orbCanvas.getContext("2d");
let animationFrameId = null;
let wavePhase = 0;
let visualizerState = "idle"; // idle, listening, speaking, processing, playing

// SVG Icons
const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  loader: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/></svg>',
  headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14c0-4.97 4-9 9-9s9 4 9 9v3a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2h3M3 14v3a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2H3"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
};

// Log Message helper
function log(msg, type = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  entry.innerHTML = `[${timeStr}] ${msg}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// Float32 array to 16-bit PCM WAV Blob (16kHz)
// Standard format required by the /transcribe endpoint
function float32ToWavBlob(float32Audio) {
  const sampleRate = 16000;
  const buffer = new ArrayBuffer(44 + float32Audio.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  let offset = 0;
  writeString(view, offset, "RIFF"); offset += 4;
  view.setUint32(offset, 36 + float32Audio.length * 2, true); offset += 4;
  writeString(view, offset, "WAVE"); offset += 4;
  writeString(view, offset, "fmt "); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * 2, true); offset += 4;
  view.setUint16(offset, 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString(view, offset, "data"); offset += 4;
  view.setUint32(offset, float32Audio.length * 2, true); offset += 4;

  let index = 44;
  for (let i = 0; i < float32Audio.length; i++) {
    let sample = Math.max(-1, Math.min(1, float32Audio[i]));
    view.setInt16(
      index,
      sample < 0 ? sample * 0x8000 : sample * 0x7FFF,
      true
    );
    index += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

// Canvas Initialization & Dynamic Resizing
function initCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = orbCanvas.getBoundingClientRect();
  orbCanvas.width = rect.width * dpr;
  orbCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

// Real-time Canvas Rendering Loop
function drawVisualizer() {
  const width = orbCanvas.width / (window.devicePixelRatio || 1);
  const height = orbCanvas.height / (window.devicePixelRatio || 1);
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = 80;

  ctx.clearRect(0, 0, width, height);
  wavePhase += 0.05;

  if (visualizerState === "playing" && analyserNode) {
    // ── AI SPEAKING: Visualize real speaker audio frequency data ──
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    // Dynamic color gradient for speaker bars
    const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, baseRadius + 30);
    gradient.addColorStop(0, "rgba(52, 211, 153, 0.8)"); // Green
    gradient.addColorStop(0.5, "rgba(59, 130, 246, 0.6)"); // Blue
    gradient.addColorStop(1, "rgba(139, 92, 246, 0)"); // Faded Violet

    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw circular frequency visualizer bars
    const barCount = 60;
    const angleStep = (Math.PI * 2) / barCount;

    for (let i = 0; i < barCount; i++) {
      // Map frequency bin data
      const binIdx = Math.floor((i / barCount) * (bufferLength * 0.6));
      const value = dataArray[binIdx] || 0;
      const barHeight = (value / 255) * 35;

      const angle = i * angleStep + wavePhase * 0.1;
      const xStart = Math.cos(angle) * (baseRadius - 5);
      const yStart = Math.sin(angle) * (baseRadius - 5);
      const xEnd = Math.cos(angle) * (baseRadius + barHeight);
      const yEnd = Math.sin(angle) * (baseRadius + barHeight);

      ctx.beginPath();
      ctx.moveTo(xStart, yStart);
      ctx.lineTo(xEnd, yEnd);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(16, 185, 129, ${0.4 + (value / 255) * 0.6})`;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();

    // Draw inner subtle glowing pulse
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const avg = sum / bufferLength;
    const scaleFactor = 1 + (avg / 255) * 0.15;

    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius * scaleFactor, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(16, 185, 129, ${0.03 + (avg / 255) * 0.05})`;
    ctx.fill();

  } else {
    // ── PROCEDURAL WAVES: Render animations based on assistant states ──
    ctx.save();
    let waveCount = 3;
    let maxAmp = 10;
    let waveSpeed = 0.06;
    let color = "rgba(139, 92, 246, 0.35)"; // Purple default

    if (visualizerState === "listening") {
      waveCount = 4;
      maxAmp = 14;
      waveSpeed = 0.08;
      color = "rgba(59, 130, 246, 0.4)"; // Bright Blue
    } else if (visualizerState === "speaking") {
      waveCount = 5;
      maxAmp = 25;
      waveSpeed = 0.2;
      color = "rgba(239, 68, 68, 0.55)"; // Red Jittery
    } else if (visualizerState === "processing") {
      waveCount = 2;
      maxAmp = 6;
      waveSpeed = 0.03;
      color = "rgba(192, 132, 252, 0.4)"; // Soft Violet loading
    }

    // Draw multi-layered phase-shifted overlapping circular wave rings
    for (let w = 0; w < waveCount; w++) {
      ctx.beginPath();
      const phaseOffset = w * (Math.PI / waveCount);
      const speedModifier = 1 + w * 0.2;

      for (let angle = 0; angle <= Math.PI * 2 + 0.1; angle += 0.05) {
        // Create wavy radial distortions using trigonometric waves
        const sineDistortion = Math.sin(angle * (5 + w) + wavePhase * waveSpeed * speedModifier + phaseOffset);
        const cosineDistortion = Math.cos(angle * (3 - w) - wavePhase * waveSpeed * 0.7);
        const radius = baseRadius + sineDistortion * cosineDistortion * maxAmp;

        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (angle === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.lineWidth = 1.5;
      // Fade out outer waves
      ctx.strokeStyle = color.replace(/[\d\.]+\)$/, `${(0.15 + (w / waveCount) * 0.25).toFixed(2)})`);
      ctx.stroke();
    }

    // Add spin overlay for processing status
    if (visualizerState === "processing") {
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius + 15, wavePhase, wavePhase + Math.PI * 0.4);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(139, 92, 246, 0.8)";
      ctx.stroke();
    }

    ctx.restore();
  }

  animationFrameId = requestAnimationFrame(drawVisualizer);
}

// Update State UI
function updateUIState(state) {
  visualizerState = state;
  
  // Clear classes
  visualizerContainer.className = "visualizer-container";
  statusBadge.className = "status-badge";
  orbCore.innerHTML = ICONS.mic; // Default icon
  
  if (state === "idle") {
    visualizerContainer.classList.add("idle");
    statusBadge.classList.add("idle");
    badgeLabel.textContent = "Idle";
    statusText.textContent = "Click orb to begin conversation";
    bodyEl.style.setProperty("--accent-color", "#8b5cf6");
  } else if (state === "listening") {
    visualizerContainer.classList.add("listening");
    statusBadge.classList.add("listening");
    badgeLabel.textContent = "Listening";
    statusText.textContent = "🎙️ Listening... Speak naturally.";
    bodyEl.style.setProperty("--accent-color", "#3b82f6");
    orbCore.innerHTML = ICONS.headset;
  } else if (state === "speaking") {
    visualizerContainer.classList.add("speaking");
    statusBadge.classList.add("speaking");
    badgeLabel.textContent = "Speaking";
    statusText.textContent = "🔴 I hear you, processing soon...";
    bodyEl.style.setProperty("--accent-color", "#ef4444");
  } else if (state === "processing") {
    visualizerContainer.classList.add("processing");
    statusBadge.classList.add("processing");
    badgeLabel.textContent = "Processing";
    statusText.textContent = "⏳ Thinking & transcribing...";
    bodyEl.style.setProperty("--accent-color", "#c084fc");
    orbCore.innerHTML = ICONS.loader;
  } else if (state === "playing") {
    visualizerContainer.classList.add("playing");
    statusBadge.classList.add("playing");
    badgeLabel.textContent = "Assistant speaking";
    statusText.textContent = "🔊 Playing AI response...";
    bodyEl.style.setProperty("--accent-color", "#10b981");
    orbCore.innerHTML = ICONS.volume;
  }
}

// Connect Audio Element to Web Audio API Analyser
function initAudioContext() {
  if (isAudioContextInitialized) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    // Connect HTML5 Audio Element output to the Web Audio Analyser
    sourceNode = audioContext.createMediaElementSource(aiPlayer);
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    isAudioContextInitialized = true;
    log("Web Audio Context & Analyser initialized successfully", "success");
  } catch (err) {
    log(`Failed to initialize Web Audio: ${err.message}`, "warning");
  }
}

// Session Initializer
async function initializeChat() {
  try {
    log("Initializing chat session with Node.js server...");
    const res = await fetch(`${API_BASE}/initializeChat`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    chatId = data.id;
    sessionVal.textContent = chatId;
    log(`Session established! Chat ID: ${chatId}`, "success");
    chatHistory.innerHTML = "";
    addAssistantMessage("Hello! I am ready. Click the orb to start our conversation.");
    return true;
  } catch (err) {
    log(`Failed to initialize chat session: ${err.message}`, "speaking");
    sessionVal.textContent = "Offline";
    return false;
  }
}

// UI Append message helpers
function addUserMessage(text) {
  // Clear any placeholder/empty states
  const empty = chatHistory.querySelector(".chat-empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user";
  bubble.innerHTML = `
    <div class="bubble-sender">You</div>
    <div class="bubble-content">${text}</div>
  `;
  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addAssistantMessage(text) {
  const empty = chatHistory.querySelector(".chat-empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble assistant";
  bubble.innerHTML = `
    <div class="bubble-sender">Assistant</div>
    <div class="bubble-content">${text}</div>
  `;
  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Create and show typing indicator
function showTypingIndicator() {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble assistant typing-bubble";
  bubble.id = "typingBubble";
  bubble.innerHTML = `
    <div class="bubble-sender">Assistant</div>
    <div class="bubble-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeTypingIndicator() {
  const bubble = document.getElementById("typingBubble");
  if (bubble) bubble.remove();
}

// Send Float32 voice audio buffer to server
async function processSpeech(float32Audio) {
  if (!chatId) {
    log("Session not established. Cannot process speech.", "warning");
    updateUIState("idle");
    return;
  }

  try {
    updateUIState("processing");
    log("Voice captured. Packaging wav buffer...");
    
    const wavBlob = float32ToWavBlob(float32Audio);
    
    // Convert to Base64 String
    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = async () => {
      try {
        const base64Audio = reader.result.split(",")[1];
        log("Uploading WAV audio for transcription...");
        
        // Step 1: Transcribe user voice
        const transcribeRes = await fetch(`${API_BASE}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64Audio })
        });
        
        if (!transcribeRes.ok) throw new Error("Transcription server error");
        
        const transcribeData = await transcribeRes.json();
        const userPrompt = transcribeData.transcription;
        
        if (!userPrompt || userPrompt.trim() === "") {
          log("Transcription was empty (misfire or silence detected)", "info");
          resumeVadListening();
          return;
        }

        // Filter out Whisper silent room hallucinations (e.g. "Thank you", "Thanks for watching")
        const cleanedPrompt = userPrompt.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
        const hallucinations = ["thank you", "thanks for watching", "you", "bye", "go", "thanks", "thank you so much"];
        if (hallucinations.includes(cleanedPrompt)) {
          log(`Filtered out Whisper room-noise hallucination: "${userPrompt}"`, "info");
          resumeVadListening();
          return;
        }

        log(`Transcribed: "${userPrompt}"`, "success");
        addUserMessage(userPrompt);
        liveSubtitle.innerHTML = `<span>"${userPrompt}"</span>`;
        liveSubtitle.classList.add("active");

        // Step 2: Fetch LLM completion + TTS Audio Response
        showTypingIndicator();
        const targetEndpoint = currentMode === "interviewer" ? "getInterviewAudio" : "getAIAudio";
        log(`Requesting ${currentMode} AI completion and synthesized speech stream via /${targetEndpoint}...`);

        const aiAudioRes = await fetch(`${API_BASE}/${targetEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, prompt: userPrompt })
        });

        removeTypingIndicator();

        if (!aiAudioRes.ok) throw new Error("Failed to generate AI audio response");

        // Extract assistant transcript text from the header
        const xTranscript = aiAudioRes.headers.get("X-Transcript");
        let assistantText = "";
        
        if (xTranscript) {
          assistantText = decodeURIComponent(xTranscript);
        } else {
          // CORS fallback: Fetch last message from history endpoint
          try {
            log("X-Transcript header blocked by CORS or missing. Fetching history fallback...", "info");
            const historyRes = await fetch(`${API_BASE}/history/${chatId}`);
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              const messages = historyData.messages || [];
              const assistantMessages = messages.filter(m => m.role === "assistant");
              if (assistantMessages.length > 0) {
                assistantText = assistantMessages[assistantMessages.length - 1].content;
              }
            }
          } catch (err) {
            console.error("History fallback failed:", err);
          }
        }
        
        if (!assistantText) {
          assistantText = "Here is my response.";
        }
        
        log(`AI Response: "${assistantText}"`, "success");
        addAssistantMessage(assistantText);
        liveSubtitle.innerHTML = `<span style="color: var(--success-color)">"${assistantText}"</span>`;

        // Extract response stream as WAV blob and feed into player
        const audioBlob = await aiAudioRes.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Play AI Audio Response
        playAssistantSpeech(audioUrl);

      } catch (err) {
        removeTypingIndicator();
        log(`Processing cycle failed: ${err.message}`, "speaking");
        liveSubtitle.innerHTML = `<span class="placeholder">Error: Could not compute response</span>`;
        resumeVadListening();
      }
    };
  } catch (err) {
    log(`Wav packaging error: ${err.message}`, "speaking");
    resumeVadListening();
  }
}

// Play assistant speech stream
function playAssistantSpeech(audioUrl) {
  // Ensure AudioContext is loaded/active (required to unlock sound visualizer in browser)
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  // 1. Pause VAD microphone input to prevent feedback loops!
  pauseVadListening();

  // 2. Play Audio via player
  updateUIState("playing");
  aiPlayer.src = audioUrl;
  aiPlayer.play().catch(err => {
    log(`Playback blocked by browser or failed: ${err.message}`, "warning");
    // Resume VAD immediately if speech fails to trigger
    resumeVadListening();
  });
}

// Stop AI audio playback and reset state
function stopAssistantSpeech() {
  if (!aiPlayer.paused) {
    aiPlayer.pause();
    aiPlayer.currentTime = 0;
    log("Assistant speech stopped/interrupted.", "info");
  }
}

// Pause VAD
function pauseVadListening() {
  if (vadInstance) {
    log("Suspending microphone voice activity detection (VAD)...");
    vadInstance.pause();
  }
}

// Resume VAD
function resumeVadListening() {
  if (!isConversationRunning) return;

  if (vadInstance) {
    updateUIState("listening");
    log("Resuming microphone VAD listener...");
    vadInstance.start();
  }
}

// Start Main Conversation loop
async function startConversation() {
  // Delegate to Interviewer starting flow if in AI Interviewer mode
  if (currentMode === "interviewer") {
    startInterview();
    return;
  }

  // 1. Activate browser sound context
  initAudioContext();
  if (audioContext && audioContext.state === "suspended") {
    await audioContext.resume();
  }

  updateUIState("processing");
  statusText.textContent = "Initializing microphone VAD...";
  log("Initializing Voice Activity Detection (VAD)...");

  try {
    // 2. Instantiate VAD engine using Ricky0123 MicVAD bundle
    vadInstance = await window.vad.MicVAD.new({
      positiveSpeechThreshold: 0.65, // default is 0.5; make VAD slightly less sensitive to breathing/ambient noise
      negativeSpeechThreshold: 0.45, // default is 0.35; make silence trigger faster
      minSpeechFrames: 10,           // default is 5; ignore short clicks, deep breaths, room hums
      onSpeechStart: () => {
        log("Speech detected! Recording...", "speaking");
        updateUIState("speaking");
        
        // Interrupt ongoing assistant voice if user speaks (Interrupt-On-Speech UX)
        stopAssistantSpeech();
      },
      onSpeechEnd: (audioBuffer) => {
        log("Speech ended. Transferring audio buffer...");
        processSpeech(audioBuffer);
      },
      onVADMisfire: () => {
        log("VAD Misfire (silence or ambient noise detected)");
        resumeVadListening();
      },
      onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
      baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/"
    });

    // 3. Fire up the engine
    vadInstance.start();
    isConversationRunning = true;
    toggleBtn.textContent = "Stop Assistant";
    toggleBtn.className = "btn btn-danger";
    updateUIState("listening");
    log("Voice Assistant active and listening hands-free!", "success");

  } catch (err) {
    log(`Failed to initiate microphone: ${err.message}`, "speaking");
    statusText.textContent = "Mic access blocked or error.";
    updateUIState("idle");
  }
}

// Terminate Conversation loop
function stopConversation() {
  isConversationRunning = false;
  
  stopAssistantSpeech();

  if (vadInstance) {
    log("Terminating Voice Activity Detection...");
    vadInstance.destroy();
    vadInstance = null;
  }

  toggleBtn.textContent = currentMode === "interviewer" ? "Start Interview" : "Start Conversation";
  toggleBtn.className = "btn btn-primary";
  updateUIState("idle");
  liveSubtitle.innerHTML = '<span class="placeholder">Microphone is off</span>';
  liveSubtitle.classList.remove("active");
  
  if (interviewInputsPanel) {
    interviewInputsPanel.classList.remove("minimized");
  }
  
  log(`${currentMode === "interviewer" ? "Interview" : "Voice Assistant"} deactivated.`, "info");
}

// Hook Audio Player Finished Event
aiPlayer.addEventListener("ended", () => {
  log("Assistant finished speaking.");
  URL.revokeObjectURL(aiPlayer.src); // free memory
  
  if (isConversationRunning) {
    if (isAutolistenEnabled) {
      // 600ms guard delay to let speaker echoes settle down before activating microphone
      log("Waiting 600ms for room echo to settle before hot-mic resumes...");
      setTimeout(() => {
        resumeVadListening();
      }, 600);
    } else {
      updateUIState("idle");
      log("Continuous conversation paused. Enable Auto-Listen to speak again automatically.", "info");
    }
  } else {
    updateUIState("idle");
  }
});

// ── AI Interviewer Mode & UI Switching Logic ─────────────────────────────────

// Switch tab to Assistant Mode
tabAssistant.addEventListener("click", () => {
  if (currentMode === "assistant") return;
  
  tabAssistant.classList.add("active");
  tabInterviewer.classList.remove("active");
  interviewInputsPanel.classList.add("hidden");
  
  currentMode = "assistant";
  stopConversation();
  
  log("Switched to AI Assistant mode.");
  toggleBtn.textContent = "Start Conversation";
  
  // Reestablish general assistant session
  initializeChat();
});

// Switch tab to Interviewer Mode
tabInterviewer.addEventListener("click", () => {
  if (currentMode === "interviewer") return;
  
  tabInterviewer.classList.add("active");
  tabAssistant.classList.remove("active");
  interviewInputsPanel.classList.remove("hidden");
  interviewInputsPanel.classList.remove("minimized");
  
  currentMode = "interviewer";
  stopConversation();
  
  log("Switched to AI Interviewer mode. Please paste Job Description and Resume.");
  toggleBtn.textContent = "Start Interview";
  
  chatHistory.innerHTML = "";
  chatId = null;
  sessionVal.textContent = "Offline";
  addAssistantMessage("Welcome! Please paste the Job Description and your Resume in the fields above, then click 'Start Interview'.");
});

// Start AI Interviewer Screening Session
async function startInterview() {
  const jd = jdInput.value.trim();
  const resume = resumeInput.value.trim();

  if (!jd || !resume) {
    alert("Please paste both the Job Description (JD) and your Resume before starting the interview!");
    updateUIState("idle");
    return;
  }

  // 1. Activate browser sound context
  initAudioContext();
  if (audioContext && audioContext.state === "suspended") {
    await audioContext.resume();
  }

  updateUIState("processing");
  statusText.textContent = "Initializing AI Interviewer...";
  log("Contacting local server to establish interview session...");

  try {
    // 2. Call backend to initialize the interview and retrieve welcome question
    const res = await fetch(`${API_BASE}/initializeInterview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd, resume })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    chatId = data.id;
    const firstQuestion = data.firstQuestion;

    sessionVal.textContent = chatId;
    log(`Interview session established! Session ID: ${chatId}`, "success");
    
    // Clear chat feed and render first welcome bubble
    chatHistory.innerHTML = "";
    addAssistantMessage(firstQuestion);
    liveSubtitle.innerHTML = `<span style="color: var(--success-color)">"${firstQuestion}"</span>`;
    liveSubtitle.classList.add("active");

    // Minimize input textareas to focus on visualizer stage
    interviewInputsPanel.classList.add("minimized");

    log("Initializing Voice Activity Detection (VAD)...");

    // 3. Instantiate VAD engine using Ricky0123 MicVAD bundle
    vadInstance = await window.vad.MicVAD.new({
      positiveSpeechThreshold: 0.65, // make VAD slightly less sensitive to breathing/ambient noise
      negativeSpeechThreshold: 0.45, // make silence trigger faster
      minSpeechFrames: 10,           // ignore short clicks, deep breaths, room hums
      onSpeechStart: () => {
        log("Speech detected! Recording...", "speaking");
        updateUIState("speaking");
        
        // Interrupt ongoing assistant voice if user speaks (Interrupt-On-Speech UX)
        stopAssistantSpeech();
      },
      onSpeechEnd: (audioBuffer) => {
        log("Speech ended. Transferring audio buffer...");
        processSpeech(audioBuffer);
      },
      onVADMisfire: () => {
        log("VAD Misfire (silence or ambient noise detected)");
        resumeVadListening();
      },
      onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
      baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/"
    });

    // 4. Start listening
    vadInstance.start();
    isConversationRunning = true;
    toggleBtn.textContent = "Stop Interview";
    toggleBtn.className = "btn btn-danger";

    // 5. Play welcoming intro question immediately!
    playInterviewWelcomeSpeech();

  } catch (err) {
    log(`Failed to start interview: ${err.message}`, "speaking");
    statusText.textContent = "Microphone access or server error.";
    updateUIState("idle");
    interviewInputsPanel.classList.remove("minimized");
  }
}

// Fetch and stream welcoming interview speech
async function playInterviewWelcomeSpeech() {
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  // 1. Pause VAD microphone input to prevent feedback loops!
  pauseVadListening();

  // 2. Play welcomed intro audio
  updateUIState("playing");
  log("Loading synthesized welcome speech...");
  
  try {
    const welcomeRes = await fetch(`${API_BASE}/getInterviewIntroAudio/${chatId}`);
    if (!welcomeRes.ok) throw new Error("Failed to fetch welcomed intro audio");
    
    const audioBlob = await welcomeRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    aiPlayer.src = audioUrl;
    aiPlayer.play().catch(err => {
      log(`Audio playback blocked or failed: ${err.message}`, "warning");
      resumeVadListening();
    });
  } catch (err) {
    log(`Welcome speech synthesis failed: ${err.message}`, "warning");
    resumeVadListening();
  }
}

// Event Listeners for UI interaction
toggleBtn.addEventListener("click", () => {
  if (isConversationRunning) {
    stopConversation();
  } else {
    startConversation();
  }
});

// Reset Chat Session
resetBtn.addEventListener("click", async () => {
  const confirmReset = confirm(`Are you sure you want to reset your current ${currentMode === "interviewer" ? "interview" : "assistant"} session?`);
  if (confirmReset) {
    stopAssistantSpeech();
    const wasRunning = isConversationRunning;
    if (wasRunning) {
      stopConversation();
    }
    
    if (currentMode === "interviewer") {
      chatHistory.innerHTML = "";
      jdInput.value = "";
      resumeInput.value = "";
      chatId = null;
      sessionVal.textContent = "Offline";
      log("Interview session reset. Please paste JD and Resume to start again.");
      addAssistantMessage("Interview reset. Paste Job Description and Resume, then click 'Start Interview'.");
    } else {
      const ok = await initializeChat();
      if (ok && wasRunning) {
        startConversation();
      }
    }
  }
});

// Interactive Orb Clicks
visualizerContainer.addEventListener("click", () => {
  if (!isConversationRunning) {
    startConversation();
  } else {
    // If active and speaking, manual interrupt
    if (visualizerState === "playing") {
      stopAssistantSpeech();
      resumeVadListening();
    } else {
      // Toggle off entirely
      stopConversation();
    }
  }
});

// Auto Listen Settings Toggle
autolistenToggle.addEventListener("change", (e) => {
  isAutolistenEnabled = e.target.checked;
  log(`Auto-Listen set to: ${isAutolistenEnabled}`, "info");
});

// Canvas Init & Resize triggers
window.addEventListener("resize", initCanvas);
document.addEventListener("DOMContentLoaded", () => {
  initCanvas();
  drawVisualizer();
  
  // Establish Session immediately
  initializeChat();
  
  // Initialize Auto-Listen checkbox
  autolistenToggle.checked = isAutolistenEnabled;
  
  log("Dashboard loaded. Ready to start.");
});
