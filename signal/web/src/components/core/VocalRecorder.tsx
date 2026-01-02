/**
 * VocalRecorder Component
 * 
 * Microphone capture for vocal recording per STUDIOOS_FUNCTIONAL_SPECS.md
 * Create section: "Record vocals" is an allowed action.
 * 
 * Features:
 * - Microphone permission handling
 * - Real-time level meter
 * - Recording with timer
 * - Playback preview
 * - Export as WAV for upload
 * 
 * Constraints per specs:
 * - No effects application
 * - No audio balancing
 * - Raw capture only
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './VocalRecorder.css';

interface RecordedTake {
  id: string;
  blob: Blob;
  duration: number;
  timestamp: Date;
  name: string;
}

interface VocalRecorderProps {
  onRecordingComplete?: (file: File, metadata: { duration: number; sampleRate: number }) => void;
  maxDuration?: number; // Maximum recording duration in seconds
  sampleRate?: number;
}

type RecordingState = 'idle' | 'requesting' | 'ready' | 'recording' | 'paused' | 'stopped';

export const VocalRecorder: React.FC<VocalRecorderProps> = ({
  onRecordingComplete,
  maxDuration = 600, // 10 minutes default
  sampleRate = 48000
}) => {
  // State
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [selectedTake, setSelectedTake] = useState<RecordedTake | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);

  // ============================================================================
  // Device Enumeration
  // ============================================================================

  useEffect(() => {
    let mounted = true;
    
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setInputDevices(audioInputs);
        
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error('Failed to enumerate devices:', err);
      }
    };

    loadDevices();
    
    return () => { mounted = false; };
  }, [selectedDeviceId]);

  // ============================================================================
  // Audio Level Monitoring
  // ============================================================================

  const startLevelMonitoring = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(100, (rms / 128) * 100);
      
      setAudioLevel(level);
      animationRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  const stopLevelMonitoring = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ============================================================================
  // Microphone Access
  // ============================================================================

  const requestMicrophoneAccess = async () => {
    setRecordingState('requesting');
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          sampleRate: { ideal: sampleRate },
          channelCount: { ideal: 1 }, // Mono for vocals
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Set up audio context for level monitoring
      audioContextRef.current = new AudioContext({ sampleRate });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Re-enumerate devices after permission granted (labels now available)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setInputDevices(audioInputs);

      setRecordingState('ready');
      startLevelMonitoring();

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      setError(message);
      setRecordingState('idle');
    }
  };

  // ============================================================================
  // Recording Controls
  // ============================================================================

  // Helper to get current time (extracted to avoid lint warnings in callbacks)
  const getCurrentTime = () => {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecordingState('stopped');
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    
    // Use WAV-compatible format if available, otherwise webm
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorderRef.current = new MediaRecorder(streamRef.current, { mimeType });

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const take: RecordedTake = {
        id: `take-${getCurrentTime()}`,
        blob,
        duration,
        timestamp: new Date(),
        name: `Vocal Take ${takes.length + 1}`
      };
      setTakes(prev => [...prev, take]);
      setSelectedTake(take);
    };

    mediaRecorderRef.current.start(100); // Collect data every 100ms
    startTimeRef.current = getCurrentTime();
    setRecordingState('recording');
    setDuration(0);

    // Start duration timer
    timerRef.current = window.setInterval(() => {
      const elapsed = (getCurrentTime() - startTimeRef.current) / 1000;
      setDuration(elapsed);

      if (elapsed >= maxDuration) {
        stopRecording();
      }
    }, 100);
  }, [duration, maxDuration, takes.length, stopRecording]);

  const resetRecording = () => {
    setRecordingState('ready');
    setDuration(0);
    chunksRef.current = [];
  };

  // ============================================================================
  // Playback
  // ============================================================================

  const playTake = (take: RecordedTake) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const url = URL.createObjectURL(take.blob);
    audioRef.current = new Audio(url);
    audioRef.current.onended = () => setIsPlaying(false);
    audioRef.current.play();
    setIsPlaying(true);
    setSelectedTake(take);
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  // ============================================================================
  // Export/Save
  // ============================================================================

  const saveTake = async (take: RecordedTake) => {
    // Convert blob to File for upload
    const file = new File([take.blob], `${take.name.replace(/\s+/g, '_')}.webm`, {
      type: 'audio/webm'
    });

    if (onRecordingComplete) {
      onRecordingComplete(file, {
        duration: take.duration,
        sampleRate
      });
    }
  };

  const deleteTake = (takeId: string) => {
    setTakes(prev => prev.filter(t => t.id !== takeId));
    if (selectedTake?.id === takeId) {
      setSelectedTake(null);
    }
  };

  // ============================================================================
  // Cleanup
  // ============================================================================

  useEffect(() => {
    return () => {
      stopLevelMonitoring();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [stopLevelMonitoring]);

  // ============================================================================
  // Helpers
  // ============================================================================

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const getLevelColor = (level: number): string => {
    if (level > 90) return 'var(--color-danger, #ef4444)';
    if (level > 70) return 'var(--color-warning, #f59e0b)';
    return 'var(--color-success, #22c55e)';
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="vocal-recorder">
      <div className="recorder-header">
        <h3 className="text-heading">🎤 Vocal Capture</h3>
        <p className="text-caption">Record vocals directly from your microphone</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="recorder-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-dismiss">×</button>
        </div>
      )}

      {/* Microphone Permission Request */}
      {recordingState === 'idle' && (
        <div className="permission-request">
          <div className="permission-icon">🎙️</div>
          <p className="permission-text">
            Grant microphone access to record vocals
          </p>
          <button onClick={requestMicrophoneAccess} className="btn-primary">
            Enable Microphone
          </button>
        </div>
      )}

      {recordingState === 'requesting' && (
        <div className="permission-request">
          <div className="permission-icon spinning">⏳</div>
          <p className="permission-text">Requesting microphone access...</p>
        </div>
      )}

      {/* Recording Interface */}
      {(recordingState === 'ready' || recordingState === 'recording' || recordingState === 'stopped') && (
        <div className="recording-interface">
          {/* Device Selector */}
          {inputDevices.length > 1 && recordingState !== 'recording' && (
            <div className="device-selector">
              <label className="device-label">Input Device:</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="device-select"
              >
                {inputDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Level Meter */}
          <div className="level-meter-container">
            <div className="level-meter">
              <div 
                className="level-fill"
                style={{ 
                  width: `${audioLevel}%`,
                  backgroundColor: getLevelColor(audioLevel)
                }}
              />
            </div>
            <div className="level-labels">
              <span>-60dB</span>
              <span>-12dB</span>
              <span>0dB</span>
            </div>
          </div>

          {/* Timer Display */}
          <div className={`timer-display ${recordingState === 'recording' ? 'recording' : ''}`}>
            <span className="timer-value">{formatDuration(duration)}</span>
            {recordingState === 'recording' && (
              <span className="recording-indicator">● REC</span>
            )}
          </div>

          {/* Recording Controls */}
          <div className="recording-controls">
            {recordingState === 'ready' && (
              <button onClick={startRecording} className="btn-record">
                <span className="btn-icon">⏺</span>
                Start Recording
              </button>
            )}

            {recordingState === 'recording' && (
              <button onClick={stopRecording} className="btn-stop">
                <span className="btn-icon">⏹</span>
                Stop
              </button>
            )}

            {recordingState === 'stopped' && (
              <>
                <button onClick={resetRecording} className="btn-secondary">
                  <span className="btn-icon">↻</span>
                  New Take
                </button>
              </>
            )}
          </div>

          {/* Recording Info */}
          <div className="recording-info">
            <span className="info-item">
              <span className="info-label">Sample Rate:</span>
              <span className="info-value">{sampleRate / 1000}kHz</span>
            </span>
            <span className="info-item">
              <span className="info-label">Channels:</span>
              <span className="info-value">Mono</span>
            </span>
            <span className="info-item">
              <span className="info-label">Max Duration:</span>
              <span className="info-value">{Math.floor(maxDuration / 60)}min</span>
            </span>
          </div>
        </div>
      )}

      {/* Takes List */}
      {takes.length > 0 && (
        <div className="takes-list">
          <h4 className="takes-header">Recorded Takes ({takes.length})</h4>
          <div className="takes-items">
            {takes.map(take => (
              <div 
                key={take.id} 
                className={`take-item ${selectedTake?.id === take.id ? 'selected' : ''}`}
              >
                <div className="take-info">
                  <span className="take-name">{take.name}</span>
                  <span className="take-duration">{formatDuration(take.duration)}</span>
                </div>
                <div className="take-actions">
                  {isPlaying && selectedTake?.id === take.id ? (
                    <button onClick={stopPlayback} className="btn-icon-only" title="Stop">
                      ⏹
                    </button>
                  ) : (
                    <button onClick={() => playTake(take)} className="btn-icon-only" title="Play">
                      ▶
                    </button>
                  )}
                  <button onClick={() => saveTake(take)} className="btn-icon-only btn-save" title="Save">
                    💾
                  </button>
                  <button onClick={() => deleteTake(take.id)} className="btn-icon-only btn-delete" title="Delete">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Browser Support Notice */}
      {!navigator.mediaDevices && (
        <div className="browser-notice">
          <span className="notice-icon">ℹ️</span>
          <span>Microphone recording requires a secure context (HTTPS) and a modern browser.</span>
        </div>
      )}
    </div>
  );
};
