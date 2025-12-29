import React, { useRef, useEffect, useState } from 'react';
import './AudioVisualization.css';

interface AudioVisualizationProps {
  analysisData?: {
    lufs?: number;
    peaks?: { left: number; right: number };
    spectrum?: number[];
    stereoWidth?: number;
    phaseCorrelation?: number;
    dynamicRange?: number;
  };
  type: 'spectrum' | 'levels' | 'stereo' | 'phase';
  height?: number;
  width?: number;
  className?: string;
  showGrid?: boolean;
  showLabels?: boolean;
}

/**
 * Glass Box Audio Visualization Component
 * 
 * Design Philosophy:
 * - Swiss Precision: Accurate data representation, clean scales
 * - German Engineering: Robust real-time rendering, performance optimized
 * - American Rapper Aesthetic: Bold visual impact, confident display
 * 
 * Glass Box Principle:
 * - Shows exactly what the audio processor sees
 * - Real-time feedback without interpretation
 * - Transparent data visualization
 */
export const AudioVisualization: React.FC<AudioVisualizationProps> = ({
  analysisData = {},
  type,
  height = 200,
  width = 400,
  className = '',
  showGrid = true,
  showLabels = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationFrame, setAnimationFrame] = useState<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const draw = () => {
      // Clear with glass effect background
      ctx.clearRect(0, 0, width, height);
      
      // Glass box background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(0, 0, width, height);
      
      if (showGrid) {
        drawGrid(ctx, width, height);
      }

      switch (type) {
        case 'spectrum':
          drawSpectrum(ctx, width, height, analysisData.spectrum);
          break;
        case 'levels':
          drawLevels(ctx, width, height, analysisData);
          break;
        case 'stereo':
          drawStereoField(ctx, width, height, analysisData);
          break;
        case 'phase':
          drawPhaseCorrelation(ctx, width, height, analysisData.phaseCorrelation);
          break;
      }

      if (showLabels) {
        drawLabels(ctx, width, height, type, analysisData);
      }
    };

    draw();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [analysisData, type, width, height, showGrid, showLabels]);

  return (
    <div className={`audio-visualization ${type} ${className}`}>
      <canvas
        ref={canvasRef}
        className="visualization-canvas"
        style={{ width, height }}
      />
    </div>
  );
};

// Swiss Precision Grid System
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // Vertical grid lines
  for (let i = 0; i <= 10; i++) {
    const x = (width / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  // Horizontal grid lines
  for (let i = 0; i <= 8; i++) {
    const y = (height / 8) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// Spectrum Analyzer - German Engineering Precision
function drawSpectrum(
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  spectrum?: number[]
) {
  if (!spectrum || spectrum.length === 0) return;

  const barWidth = width / spectrum.length;
  const maxDb = 0;
  const minDb = -60;

  spectrum.forEach((magnitude, index) => {
    const x = index * barWidth;
    const normalizedHeight = Math.max(0, (magnitude - minDb) / (maxDb - minDb));
    const barHeight = normalizedHeight * height;
    const y = height - barHeight;

    // American Rapper: Bold gradient
    const gradient = ctx.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, '#00ff88');
    gradient.addColorStop(0.5, '#0088ff');
    gradient.addColorStop(1, '#8800ff');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth - 1, barHeight);
  });
}

// Real-time Level Meters
function drawLevels(
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  data: any
) {
  const { peaks = { left: -60, right: -60 }, lufs = -23 } = data;
  
  // Channel meters
  const meterWidth = width / 3;
  const meterHeight = height * 0.8;
  const meterY = height * 0.1;

  // Left channel
  drawMeter(ctx, 20, meterY, meterWidth - 40, meterHeight, peaks.left, 'L');
  
  // Right channel  
  drawMeter(ctx, width - meterWidth + 20, meterY, meterWidth - 40, meterHeight, peaks.right, 'R');

  // LUFS meter (center)
  const lufsX = width / 2 - 30;
  drawLufsMeter(ctx, lufsX, meterY, 60, meterHeight, lufs);
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  level: number,
  label: string
) {
  // Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(x, y, width, height);

  // Level fill
  const normalizedLevel = Math.max(0, (level + 60) / 60);
  const fillHeight = normalizedLevel * height;
  
  // Color zones (Swiss precision thresholds)
  let color = '#00ff88'; // Safe zone
  if (level > -6) color = '#ff8800'; // Warning zone
  if (level > -3) color = '#ff0044'; // Danger zone
  
  ctx.fillStyle = color;
  ctx.fillRect(x, y + height - fillHeight, width, fillHeight);

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width / 2, y + height + 20);
  
  // Value
  ctx.font = '10px monospace';
  ctx.fillText(`${level.toFixed(1)}`, x + width / 2, y + height + 35);
}

function drawLufsMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  lufs: number
) {
  // Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(x, y, width, height);

  // Target zone (-23 LUFS)
  const targetY = y + height * 0.4;
  ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
  ctx.fillRect(x, targetY - 20, width, 40);

  // Current level
  const normalizedLufs = Math.max(0, (lufs + 40) / 40);
  const indicatorY = y + height - (normalizedLufs * height);
  
  ctx.fillStyle = '#0088ff';
  ctx.fillRect(x, indicatorY - 2, width, 4);

  // Labels
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LUFS', x + width / 2, y + height + 20);
  ctx.fillText(`${lufs.toFixed(1)}`, x + width / 2, y + height + 35);
}

// Stereo Field Visualization
function drawStereoField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: any
) {
  const { stereoWidth = 50, phaseCorrelation = 0 } = data;
  const centerX = width / 2;
  const centerY = height / 2;

  // Stereo width arc
  const radius = Math.min(width, height) * 0.3;
  const arcWidth = (stereoWidth / 100) * Math.PI;
  
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -arcWidth / 2, arcWidth / 2);
  ctx.stroke();

  // Phase correlation indicator
  const corrRadius = radius * 0.5;
  const corrAngle = phaseCorrelation * Math.PI;
  const corrX = centerX + Math.cos(corrAngle) * corrRadius;
  const corrY = centerY + Math.sin(corrAngle) * corrRadius;
  
  ctx.fillStyle = phaseCorrelation > 0.8 ? '#00ff88' : '#ff8800';
  ctx.beginPath();
  ctx.arc(corrX, corrY, 6, 0, 2 * Math.PI);
  ctx.fill();

  // Center point
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
  ctx.fill();
}

// Phase Correlation Display
function drawPhaseCorrelation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  correlation: number = 0
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;

  // Background circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Correlation arc
  const corrAngle = (correlation + 1) * Math.PI; // Map -1 to 1 → 0 to 2π
  let color = '#ff0044'; // Poor correlation
  if (correlation > 0.5) color = '#ff8800'; // Acceptable
  if (correlation > 0.8) color = '#00ff88'; // Good
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, corrAngle);
  ctx.stroke();

  // Value display
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(correlation.toFixed(2), centerX, centerY + 8);
}

// Smart Labels - Swiss Typography
function drawLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  type: string,
  data: any
) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
  
  const titles = {
    spectrum: 'FREQUENCY SPECTRUM',
    levels: 'SIGNAL LEVELS',
    stereo: 'STEREO FIELD',
    phase: 'PHASE CORRELATION'
  };

  ctx.textAlign = 'left';
  ctx.fillText(titles[type as keyof typeof titles] || '', 10, 20);

  // Context-specific labels
  if (type === 'spectrum') {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('20Hz', 5, height - 5);
    ctx.textAlign = 'right';
    ctx.fillText('20kHz', width - 5, height - 5);
  }
}

export default AudioVisualization;