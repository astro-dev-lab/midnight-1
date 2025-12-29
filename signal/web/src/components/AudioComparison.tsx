/**
 * AudioComparison Component
 * 
 * Side-by-side audio comparison for before/after review.
 * Uses HTML5 audio with synced playback controls.
 */

import { useState, useRef, useEffect } from 'react';
import type { Asset } from '../api/types';

interface AudioComparisonProps {
  inputAsset: Asset | null;
  outputAsset: Asset | null;
  inputUrl?: string;
  outputUrl?: string;
}

export function AudioComparison({ 
  inputAsset, 
  outputAsset,
  inputUrl,
  outputUrl 
}: AudioComparisonProps) {
  const inputRef = useRef<HTMLAudioElement>(null);
  const outputRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<'none' | 'input' | 'output' | 'synced'>('none');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [inputVolume, setInputVolume] = useState(1);
  const [outputVolume, setOutputVolume] = useState(1);

  // Sync time updates
  useEffect(() => {
    const input = inputRef.current;
    const output = outputRef.current;

    const handleTimeUpdate = () => {
      if (playing === 'synced' && input) {
        setCurrentTime(input.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      const inputDuration = input?.duration || 0;
      const outputDuration = output?.duration || 0;
      setDuration(Math.max(inputDuration, outputDuration));
    };

    input?.addEventListener('timeupdate', handleTimeUpdate);
    input?.addEventListener('loadedmetadata', handleLoadedMetadata);
    output?.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      input?.removeEventListener('timeupdate', handleTimeUpdate);
      input?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      output?.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [playing]);

  // Synced playback control
  const playSynced = () => {
    const input = inputRef.current;
    const output = outputRef.current;
    
    if (input && output) {
      output.currentTime = input.currentTime;
      input.play();
      output.play();
      setPlaying('synced');
    }
  };

  const pauseAll = () => {
    inputRef.current?.pause();
    outputRef.current?.pause();
    setPlaying('none');
  };

  const playInput = () => {
    outputRef.current?.pause();
    inputRef.current?.play();
    setPlaying('input');
  };

  const playOutput = () => {
    inputRef.current?.pause();
    outputRef.current?.play();
    setPlaying('output');
  };

  const seek = (time: number) => {
    if (inputRef.current) inputRef.current.currentTime = time;
    if (outputRef.current) outputRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Build URLs from assets if not provided directly
  const resolvedInputUrl = inputUrl || (inputAsset ? `/api/assets/${inputAsset.id}/download` : '');
  const resolvedOutputUrl = outputUrl || (outputAsset ? `/api/assets/${outputAsset.id}/download` : '');

  if (!inputAsset && !outputAsset && !inputUrl && !outputUrl) {
    return (
      <div className="audio-comparison empty">
        <p>No audio files available for comparison.</p>
      </div>
    );
  }

  return (
    <div className="audio-comparison">
      <h4>Audio Comparison</h4>
      
      {/* Audio Elements (hidden) */}
      <audio ref={inputRef} src={resolvedInputUrl} preload="metadata" />
      <audio ref={outputRef} src={resolvedOutputUrl} preload="metadata" />

      {/* Comparison Grid */}
      <div className="comparison-grid">
        {/* Input (Before) */}
        <div className="comparison-panel input-panel">
          <h5>Before (Input)</h5>
          {inputAsset ? (
            <>
              <p className="asset-name">{inputAsset.name}</p>
              <div className="volume-control">
                <label>Volume</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={inputVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setInputVolume(vol);
                    if (inputRef.current) inputRef.current.volume = vol;
                  }}
                />
              </div>
              <button 
                className={`play-btn ${playing === 'input' ? 'active' : ''}`}
                onClick={playing === 'input' ? pauseAll : playInput}
              >
                {playing === 'input' ? '⏸ Pause' : '▶ Play Input'}
              </button>
            </>
          ) : (
            <p className="no-asset">No input asset</p>
          )}
        </div>

        {/* Output (After) */}
        <div className="comparison-panel output-panel">
          <h5>After (Output)</h5>
          {outputAsset ? (
            <>
              <p className="asset-name">{outputAsset.name}</p>
              <div className="volume-control">
                <label>Volume</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={outputVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setOutputVolume(vol);
                    if (outputRef.current) outputRef.current.volume = vol;
                  }}
                />
              </div>
              <button 
                className={`play-btn ${playing === 'output' ? 'active' : ''}`}
                onClick={playing === 'output' ? pauseAll : playOutput}
              >
                {playing === 'output' ? '⏸ Pause' : '▶ Play Output'}
              </button>
            </>
          ) : (
            <p className="no-asset">No output asset</p>
          )}
        </div>
      </div>

      {/* Synced Controls */}
      {inputAsset && outputAsset && (
        <div className="synced-controls">
          <button 
            className={`sync-play-btn ${playing === 'synced' ? 'active' : ''}`}
            onClick={playing === 'synced' ? pauseAll : playSynced}
          >
            {playing === 'synced' ? '⏸ Pause Both' : '▶ Play Both (Synced)'}
          </button>
          
          {/* Timeline */}
          <div className="timeline">
            <span className="time-current">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="timeline-slider"
            />
            <span className="time-total">{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Quick Toggle Instructions */}
      <p className="comparison-hint">
        Use individual play buttons to hear before/after separately, 
        or synced playback to compare in real-time.
      </p>
    </div>
  );
}

export default AudioComparison;
