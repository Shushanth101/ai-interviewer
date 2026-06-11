'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Mic, 
  Square, 
  MessageSquare, 
  Loader2, 
  ArrowLeft, 
  Volume2, 
  Sparkles 
} from 'lucide-react';

interface TranscriptEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function LiveInterview() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  // Voice Pipeline State
  const [isConversationRunning, setIsConversationRunning] = useState(false);
  const [visualizerState, setVisualizerState] = useState<'idle' | 'listening' | 'speaking' | 'processing' | 'playing'>('idle');
  const [statusText, setStatusText] = useState('Initialize microphone to begin');
  const [liveSubtitle, setLiveSubtitle] = useState('Microphone is off');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isScriptsLoaded, setIsScriptsLoaded] = useState(false);
  
  // Script loads checkpoints
  const onnxLoaded = useRef(false);
  const vadLoaded = useRef(false);

  // Audio and VAD Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const vadInstanceRef = useRef<any>(null);
  const aiPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const wavePhaseRef = useRef<number>(0);

  // Scroll Ref
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Log to UI System Console
  const [logs, setLogs] = useState<string[]>([]);
  const logSystem = (msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const logText = `[${timeStr}] ${msg}`;
    setLogs(prev => [...prev, logText]);
    console.log(`[${type.toUpperCase()}] ${msg}`);
  };

  // Auto-scroll log console
  const logEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-scroll transcript history
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Dynamically inject CDN scripts and track readiness
  useEffect(() => {
    const checkAndMark = () => {
      if (onnxLoaded.current && vadLoaded.current) {
        setIsScriptsLoaded(true);
        logSystem('Voice Activity Detection scripts loaded successfully.', 'success');
      }
    };

    const injectScript = (src: string, onLoad: () => void) => {
      // Skip if already injected
      if (document.querySelector(`script[src="${src}"]`)) {
        onLoad();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = onLoad;
      script.onerror = () => logSystem(`Failed to load script: ${src}`, 'error');
      document.head.appendChild(script);
    };

    // ONNX Runtime must load first, then VAD bundle
    injectScript(
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.js',
      () => {
        onnxLoaded.current = true;
        injectScript(
          'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/bundle.min.js',
          () => {
            vadLoaded.current = true;
            checkAndMark();
          }
        );
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert Float32 array to 16-bit PCM WAV Blob (16kHz sample rate)
  const float32ToWavBlob = (float32Audio: Float32Array): Blob => {
    const sampleRate = 16000;
    const buffer = new ArrayBuffer(44 + float32Audio.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + float32Audio.length * 2, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, float32Audio.length * 2, true); offset += 4;

    let index = 44;
    for (let i = 0; i < float32Audio.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Audio[i]));
      view.setInt16(
        index,
        sample < 0 ? sample * 0x8000 : sample * 0x7FFF,
        true
      );
      index += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  // Initialize Web Audio API components connected to player
  const initAudioContext = () => {
    if (audioContextRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      if (aiPlayerRef.current) {
        const source = audioCtx.createMediaElementSource(aiPlayerRef.current);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        sourceNodeRef.current = source;
      }

      audioContextRef.current = audioCtx;
      analyserNodeRef.current = analyser;
      logSystem('Web Audio context & visualizer analyser established.', 'success');
    } catch (err: any) {
      logSystem(`Audio context setup failed: ${err.message}`, 'warning');
    }
  };

  // Procedural visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = 80;

      ctx.clearRect(0, 0, width, height);
      wavePhaseRef.current += 0.05;

      const state = visualizerState;
      const analyser = analyserNodeRef.current;

      if (state === 'playing' && analyser) {
        // AI Speaking: circular frequency bars
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.save();
        ctx.translate(centerX, centerY);

        const barCount = 60;
        const angleStep = (Math.PI * 2) / barCount;

        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.floor((i / barCount) * (bufferLength * 0.6));
          const value = dataArray[binIdx] || 0;
          const barHeight = (value / 255) * 35;

          const angle = i * angleStep + wavePhaseRef.current * 0.1;
          const xStart = Math.cos(angle) * (baseRadius - 5);
          const yStart = Math.sin(angle) * (baseRadius - 5);
          const xEnd = Math.cos(angle) * (baseRadius + barHeight);
          const yEnd = Math.sin(angle) * (baseRadius + barHeight);

          ctx.beginPath();
          ctx.moveTo(xStart, yStart);
          ctx.lineTo(xEnd, yEnd);
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.4 + (value / 255) * 0.6})`;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        ctx.restore();

        // Inner glowing pulse
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        const scaleFactor = 1 + (avg / 255) * 0.15;

        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * scaleFactor, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${0.03 + (avg / 255) * 0.05})`;
        ctx.fill();

      } else {
        // Concentric waves depending on state
        ctx.save();
        let waveCount = 3;
        let maxAmp = 10;
        let waveSpeed = 0.06;
        let color = 'rgba(139, 92, 246, 0.35)'; // Purple default

        if (state === 'listening') {
          waveCount = 4;
          maxAmp = 14;
          waveSpeed = 0.08;
          color = 'rgba(59, 130, 246, 0.4)'; // Blue
        } else if (state === 'speaking') {
          waveCount = 5;
          maxAmp = 25;
          waveSpeed = 0.2;
          color = 'rgba(244, 63, 94, 0.55)'; // Rose Jittery
        } else if (state === 'processing') {
          waveCount = 2;
          maxAmp = 6;
          waveSpeed = 0.03;
          color = 'rgba(245, 158, 11, 0.4)'; // Amber soft
        }

        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          const phaseOffset = w * (Math.PI / waveCount);
          const speedModifier = 1 + w * 0.2;

          for (let angle = 0; angle <= Math.PI * 2 + 0.1; angle += 0.05) {
            const sineDistortion = Math.sin(angle * (5 + w) + wavePhaseRef.current * waveSpeed * speedModifier + phaseOffset);
            const cosineDistortion = Math.cos(angle * (3 - w) - wavePhaseRef.current * waveSpeed * 0.7);
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
          ctx.strokeStyle = color.replace(/[\d\.]+\)$/, `${(0.15 + (w / waveCount) * 0.25).toFixed(2)})`);
          ctx.stroke();
        }

        if (state === 'processing') {
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius + 15, wavePhaseRef.current, wavePhaseRef.current + Math.PI * 0.4);
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
          ctx.stroke();
        }

        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [visualizerState]);

  // Load session from DB immediately on load
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/interview/details?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setTranscript(data.interview.transcript || []);
          logSystem(`Connected to interview session ${id} in database.`, 'success');
          
          // Show first question in subtitles
          const firstQ = data.interview.transcript.find((m: any) => m.role === 'assistant')?.content;
          if (firstQ) {
            setLiveSubtitle(firstQ);
          }
        } else {
          logSystem(`Failed to find session ${id} in database.`, 'error');
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSession();
  }, [id]);

  // Pause VAD
  const pauseVad = () => {
    if (vadInstanceRef.current) {
      logSystem('Microphone paused (silencing hot-mic).');
      vadInstanceRef.current.pause();
    }
  };

  // Resume VAD
  const resumeVad = () => {
    if (vadInstanceRef.current && isConversationRunning) {
      setVisualizerState('listening');
      setStatusText('🎤 Listening... Speak naturally.');
      logSystem('Microphone active (hot-mic listening).');
      vadInstanceRef.current.start();
    }
  };

  // Interrupt and stop ongoing TTS playback
  const stopAssistantPlayback = () => {
    if (aiPlayerRef.current && !aiPlayerRef.current.paused) {
      aiPlayerRef.current.pause();
      aiPlayerRef.current.currentTime = 0;
      logSystem('Assistant speaking interrupted by candidate.');
    }
  };

  // Send candidate transcript and fetch LLM response
  const requestAIResponse = async (userPrompt: string) => {
    try {
      setVisualizerState('processing');
      setStatusText('⏳ Generating technical follow-up...');
      logSystem('Requesting follow-up question...');

      const res = await fetch('/api/interview/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: id, prompt: userPrompt })
      });

      if (!res.ok) throw new Error('Response generation failed');

      // Update local transcript history
      const historyRes = await fetch(`/api/interview/details?id=${id}`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setTranscript(data.interview.transcript || []);
      }

      // Extract text reply from custom header
      const xTranscript = res.headers.get('X-Transcript');
      let assistantText = '';
      if (xTranscript) {
        assistantText = decodeURIComponent(xTranscript);
      } else {
        assistantText = 'Generating speech response...';
      }

      logSystem(`AI Follow-up: "${assistantText}"`, 'success');
      setLiveSubtitle(assistantText);

      // Play synthesized audio response
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      pauseVad();
      setVisualizerState('playing');
      setStatusText('🔊 Playing interviewer voice response...');

      if (aiPlayerRef.current) {
        aiPlayerRef.current.src = audioUrl;
        aiPlayerRef.current.play().catch((playErr) => {
          logSystem(`Audio playback blocked by browser: ${playErr.message}`, 'warning');
          resumeVad();
        });
      }

    } catch (err: any) {
      logSystem(`Response round failed: ${err.message}`, 'error');
      resumeVad();
    }
  };

  // Process captured voice buffers
  const processSpeech = async (float32Audio: Float32Array) => {
    try {
      setVisualizerState('processing');
      setStatusText('⏳ Transcribing candidate speech...');
      logSystem('Speech buffer captured. Processing base64 encoding...');

      const wavBlob = float32ToWavBlob(float32Audio);

      // Read as base64 string
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          logSystem('Uploading WAV to Groq whisper...');

          const transcribeRes = await fetch('/api/interview/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Audio })
          });

          if (!transcribeRes.ok) throw new Error('Transcription pipeline failed');

          const data = await transcribeRes.json();
          const candidateText = data.transcription;

          if (!candidateText || candidateText.trim() === '') {
            logSystem('Silent misfire captured. Resuming listener...');
            resumeVad();
            return;
          }

          // Simple Whisper silence-hallucination guard filter
          const cleanedText = candidateText.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '');
          const noiseWords = ['thank you', 'thanks for watching', 'you', 'bye', 'go', 'thanks', 'thank you so much'];
          if (noiseWords.includes(cleanedText)) {
            logSystem(`Whisper ambient noise hallucination filtered: "${candidateText}"`);
            resumeVad();
            return;
          }

          logSystem(`Transcribed: "${candidateText}"`, 'success');
          setLiveSubtitle(candidateText);

          // Append instantly to transcript list
          setTranscript(prev => [
            ...prev,
            { role: 'user', content: candidateText, timestamp: new Date().toISOString() }
          ]);

          // Trigger follow-up API
          requestAIResponse(candidateText);

        } catch (err: any) {
          logSystem(`Transcription upload failure: ${err.message}`, 'error');
          resumeVad();
        }
      };
    } catch (err: any) {
      logSystem(`Audio package failed: ${err.message}`, 'error');
      resumeVad();
    }
  };

  // Welcome speech synthesis for first question
  const playWelcomeSpeech = async () => {
    try {
      pauseVad();
      setVisualizerState('playing');
      setStatusText('🔊 Playing interviewer welcoming speech...');
      logSystem('Synthesizing welcoming audio...');

      // Find welcoming question content
      const dbRes = await fetch(`/api/interview/details?id=${id}`);
      if (!dbRes.ok) throw new Error('Failed to retrieve session transcript');
      const data = await dbRes.json();
      const firstQuestion = data.interview.transcript.find((m: any) => m.role === 'assistant')?.content || '';

      const ttsRes = await fetch(`/api/interview/tts?text=${encodeURIComponent(firstQuestion)}`);
      if (!ttsRes.ok) throw new Error('TTS welcome failed');

      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (aiPlayerRef.current) {
        aiPlayerRef.current.src = audioUrl;
        aiPlayerRef.current.play().catch((playErr) => {
          logSystem(`Audio playback blocked by browser: ${playErr.message}`, 'warning');
          resumeVad();
        });
      }

    } catch (err: any) {
      logSystem(`Welcome speech failed: ${err.message}`, 'warning');
      resumeVad();
    }
  };

  // Start Mic Listening Conversation
  const startConversation = async () => {
    if (!isScriptsLoaded) {
      alert('Speech scripts are loading. Please try again in a few seconds.');
      return;
    }

    // Activate Web Audio API
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setVisualizerState('processing');
    setStatusText('Initializing VAD microphone stream...');
    logSystem('Initializing Voice Activity Detection (VAD) mic streams...');

    try {
      // Access global Ricky0123 MicVAD constructor loaded via Script tag
      const MicVAD = (window as any).vad.MicVAD;
      
      const vadInstance = await MicVAD.new({
        positiveSpeechThreshold: 0.65,
        negativeSpeechThreshold: 0.45,
        minSpeechFrames: 10,
        onSpeechStart: () => {
          logSystem('Candidate speech detected. Recording...', 'info');
          setVisualizerState('speaking');
          stopAssistantPlayback();
        },
        onSpeechEnd: (audioBuffer: Float32Array) => {
          logSystem('Candidate speech completed. Transcribing...');
          processSpeech(audioBuffer);
        },
        onVADMisfire: () => {
          logSystem('VAD misfire (silence/hum detected).');
          resumeVad();
        },
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
        baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/'
      });

      vadInstanceRef.current = vadInstance;
      vadInstance.start();

      setIsConversationRunning(true);
      logSystem('Voice session active! Speaking hands-free unlocked.', 'success');

      // Trigger first question spoken audio immediately!
      await playWelcomeSpeech();

    } catch (err: any) {
      logSystem(`Microphone stream access blocked: ${err.message}`, 'error');
      setStatusText('Mic access blocked or error.');
      setVisualizerState('idle');
    }
  };

  // Stop Conversation cleanly
  const stopConversation = () => {
    setIsConversationRunning(false);
    setVisualizerState('idle');
    setStatusText('Click microphone below to begin conversation');
    setLiveSubtitle('Microphone is off');

    // 1. Immediately pause and reset HTML5 audio playback
    if (aiPlayerRef.current) {
      aiPlayerRef.current.pause();
      aiPlayerRef.current.currentTime = 0;
      aiPlayerRef.current.src = '';
    }

    // 2. Destroy Ricky0123 VAD instance immediately to release microphone handles!
    if (vadInstanceRef.current) {
      logSystem('Destroying Voice Activity Detection (VAD) microphone streams...', 'warning');
      vadInstanceRef.current.destroy();
      vadInstanceRef.current = null;
    }

    logSystem('Voice interview deactivated cleanly.', 'warning');
  };

  // Hook HTML5 Audio finished playback trigger
  const handlePlaybackFinished = () => {
    logSystem('Interviewer finished speaking.');
    if (aiPlayerRef.current) {
      URL.revokeObjectURL(aiPlayerRef.current.src);
    }

    if (isConversationRunning) {
      // 600ms buffer to let room speaker echoes settle down before hot-mic resumes
      logSystem('Waiting 600ms for room echo to settle before microphone VAD reactivates...');
      setTimeout(() => {
        resumeVad();
      }, 600);
    } else {
      setVisualizerState('idle');
    }
  };

  // Terminate interview entirely on stop click and redirect to home
  const terminateSession = () => {
    stopConversation();
    logSystem('Session terminated by candidate. Navigating back to dashboard...', 'warning');
    router.push('/');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up audio
      if (aiPlayerRef.current) {
        aiPlayerRef.current.pause();
        aiPlayerRef.current.src = '';
      }
      if (vadInstanceRef.current) {
        try {
          vadInstanceRef.current.destroy();
        } catch (e) {}
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="app-container">
      {/* Hidden audio player */}
      <audio 
        id="aiPlayer" 
        ref={aiPlayerRef}
        crossOrigin="anonymous"
        onEnded={handlePlaybackFinished}
        style={{ display: 'none' }}
      />

      {/* Left panel: Session Console Logger */}
      <aside className="sidebar">
        <div className="brand" onClick={terminateSession} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">A</div>
          <h1 className="brand-title">Aether</h1>
        </div>

        <div className="panel-card">
          <h2 className="panel-title">Session details</h2>
          <div className="session-info">
            <div className="session-row">
              <span>Status:</span>
              <span id="badgeLabel" style={{ 
                fontWeight: 600, 
                color: visualizerState === 'idle' ? 'var(--text-muted)' : visualizerState === 'listening' ? 'var(--accent-blue)' : visualizerState === 'playing' ? 'var(--accent-emerald)' : 'var(--accent-purple)' 
              }}>
                {visualizerState.toUpperCase()}
              </span>
            </div>
            <div className="session-row">
              <span>Chat ID:</span>
              <span id="sessionVal" className="session-val">{id}</span>
            </div>
          </div>
        </div>

        <div className="panel-card status-log" style={{ flexGrow: 1 }}>
          <h2 className="panel-title">System Console</h2>
          <div className="log-list">
            <div className="log-entry info">System loaded. Connect mic to start.</div>
            {logs.map((log, index) => (
              <div 
                key={index} 
                className={`log-entry ${
                  log.includes('successfully') || log.includes('active') ? 'success' : 
                  log.includes('interrupted') || log.includes('terminated') ? 'warning' : 
                  log.includes('blocked') || log.includes('failed') ? 'speaking' : 'info'
                }`}
              >
                {log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </aside>

      {/* Center visual stage */}
      <main className="main-stage">
        <header className="header-bar">
          <div className={`status-badge ${visualizerState}`}>
            <div className="indicator-dot"></div>
            <span id="statusText">{statusText}</span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn" onClick={terminateSession}>
              <ArrowLeft size={16} /> Exit Stage
            </button>
            
            {isConversationRunning ? (
              <button className="btn btn-danger" onClick={terminateSession}>
                <Square size={16} fill="currentColor" /> Stop Interview
              </button>
            ) : (
              <button 
                className="btn btn-primary" 
                onClick={startConversation}
                disabled={!isScriptsLoaded}
              >
                {!isScriptsLoaded ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Loading scripts...
                  </>
                ) : (
                  <>
                    <Mic size={16} /> Connect Mic
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Dynamic canvas stage */}
        <section className="workspace">
          <div className="stage-container">
            <div 
              className={`visualizer-container ${visualizerState}`} 
              onClick={!isConversationRunning ? startConversation : stopAssistantPlayback}
            >
              <div className="visualizer-aura"></div>
              <div className="orb">
                <canvas ref={canvasRef} className="orb-canvas"></canvas>
                <div className="orb-core">
                  {visualizerState === 'idle' && <Mic size={24} />}
                  {visualizerState === 'listening' && <Mic size={24} style={{ color: 'var(--accent-blue)' }} />}
                  {visualizerState === 'speaking' && <Sparkles size={24} style={{ color: 'var(--accent-rose)' }} />}
                  {visualizerState === 'processing' && <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-amber)' }} />}
                  {visualizerState === 'playing' && <Volume2 size={24} style={{ color: 'var(--accent-emerald)' }} />}
                </div>
              </div>
            </div>

            <div className="live-subtitle">
              <span className={liveSubtitle === 'Microphone is off' ? 'placeholder' : ''}>
                {liveSubtitle === 'Microphone is off' ? 'Microphone is currently off. Click core to wake.' : `"${liveSubtitle}"`}
              </span>
            </div>
          </div>
        </section>

        {/* Live sliding chat transcription history drawer */}
        <section className="chat-drawer">
          <div className="chat-drawer-header">
            <div className="chat-drawer-title">
              <MessageSquare size={14} /> Transcript History
            </div>
          </div>
          <div className="chat-history">
            {transcript.filter(m => m.role !== 'system').length === 0 ? (
              <div className="chat-empty">
                <MessageSquare size={24} />
                <span>Transcript feed is currently empty. Connect your mic to begin transcribing speech in real-time.</span>
              </div>
            ) : (
              transcript
                .filter(m => m.role !== 'system')
                .map((msg, index) => (
                  <div className={`chat-bubble ${msg.role}`} key={index}>
                    <div className="bubble-sender">
                      {msg.role === 'user' ? 'Candidate' : 'Interviewer'}
                    </div>
                    <div className="bubble-content">{msg.content}</div>
                  </div>
                ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}
