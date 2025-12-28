/**
 * Audio Processor Tests
 * 
 * Tests for the FFmpeg-based audio processing service.
 * Note: These tests require FFmpeg to be installed.
 */

const fs = require('fs').promises;
const path = require('path');
const audioProcessor = require('../services/audioProcessor');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_AUDIO_PATH = path.join(FIXTURES_DIR, 'test-tone.wav');

// Create a test audio file using FFmpeg (if it doesn't exist)
async function createTestAudioFile() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  
  try {
    await fs.access(TEST_AUDIO_PATH);
    return; // File exists
  } catch {
    // Generate a 3-second 440Hz sine wave
    const { spawn } = require('child_process');
    
    await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=3',
        '-ar', '48000',
        '-ac', '2',
        '-c:a', 'pcm_s16le',
        TEST_AUDIO_PATH
      ]);
      
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      
      proc.on('error', reject);
    });
  }
}

describe('AudioProcessor', () => {
  beforeAll(async () => {
    // Ensure test audio file exists
    await createTestAudioFile();
  });
  
  afterAll(async () => {
    // Clean up test outputs
    const outputsDir = path.join(audioProcessor.STORAGE_BASE, 'outputs', 'test');
    try {
      await fs.rm(outputsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  describe('getAudioInfo', () => {
    test('returns audio metadata for WAV file', async () => {
      const info = await audioProcessor.getAudioInfo(TEST_AUDIO_PATH);
      
      expect(info.sampleRate).toBe(48000);
      expect(info.channels).toBe(2);
      expect(info.codec).toBe('pcm_s16le');
      expect(info.duration).toBeCloseTo(3, 0);
      expect(info.fileSize).toBeGreaterThan(0);
    });
    
    test('throws error for non-existent file', async () => {
      await expect(
        audioProcessor.getAudioInfo('/nonexistent/file.wav')
      ).rejects.toThrow();
    });
  });
  
  describe('analyzeLoudness', () => {
    test('returns loudness metrics', async () => {
      const loudness = await audioProcessor.analyzeLoudness(TEST_AUDIO_PATH);
      
      // A pure sine wave should have measurable loudness
      expect(loudness.integratedLoudness).toBeDefined();
      expect(typeof loudness.integratedLoudness).toBe('number');
      expect(loudness.truePeak).toBeDefined();
    });
  });
  
  describe('detectPeaks', () => {
    test('returns peak information', async () => {
      const peaks = await audioProcessor.detectPeaks(TEST_AUDIO_PATH);
      
      // Should have some peak data (may be null if not detected)
      expect(peaks).toHaveProperty('peakDb');
      expect(peaks).toHaveProperty('rmsDb');
    });
  });
  
  describe('analyzeAudio', () => {
    test('returns complete analysis', async () => {
      const analysis = await audioProcessor.analyzeAudio(TEST_AUDIO_PATH);
      
      expect(analysis.info).toBeDefined();
      expect(analysis.loudness).toBeDefined();
      expect(analysis.peaks).toBeDefined();
      expect(analysis.analysisTime).toBeGreaterThan(0);
      expect(analysis.analyzedAt).toBeDefined();
    });
  });
  
  describe('normalizeLoudness', () => {
    test('normalizes audio to target LUFS', async () => {
      const outputPath = path.join(FIXTURES_DIR, 'test-normalized.wav');
      
      try {
        const result = await audioProcessor.normalizeLoudness(
          TEST_AUDIO_PATH,
          outputPath,
          { targetLufs: -16 }
        );
        
        expect(result.success).toBe(true);
        expect(result.outputPath).toBe(outputPath);
        expect(result.processingTime).toBeGreaterThan(0);
        
        // Verify file was created
        const stats = await fs.stat(outputPath);
        expect(stats.size).toBeGreaterThan(0);
      } finally {
        // Cleanup
        try { await fs.unlink(outputPath); } catch {}
      }
    });
  });
  
  describe('convertFormat', () => {
    test('converts WAV to MP3', async () => {
      const outputPath = path.join(FIXTURES_DIR, 'test-converted.mp3');
      
      try {
        const result = await audioProcessor.convertFormat(
          TEST_AUDIO_PATH,
          outputPath,
          { format: 'mp3', bitrate: 192 }
        );
        
        expect(result.success).toBe(true);
        expect(result.outputPath).toBe(outputPath);
        expect(result.outputInfo.codec).toBe('mp3');
        
        // Verify file was created
        const stats = await fs.stat(outputPath);
        expect(stats.size).toBeGreaterThan(0);
      } finally {
        // Cleanup
        try { await fs.unlink(outputPath); } catch {}
      }
    });
    
    test('converts WAV to FLAC', async () => {
      const outputPath = path.join(FIXTURES_DIR, 'test-converted.flac');
      
      try {
        const result = await audioProcessor.convertFormat(
          TEST_AUDIO_PATH,
          outputPath,
          { format: 'flac' }
        );
        
        expect(result.success).toBe(true);
        expect(result.outputInfo.codec).toBe('flac');
      } finally {
        // Cleanup
        try { await fs.unlink(outputPath); } catch {}
      }
    });
  });
  
  describe('masterAudio', () => {
    test('applies mastering chain', async () => {
      const outputPath = path.join(FIXTURES_DIR, 'test-mastered.wav');
      
      try {
        const result = await audioProcessor.masterAudio(
          TEST_AUDIO_PATH,
          outputPath,
          { targetLufs: -14, truePeakLimit: -1 }
        );
        
        expect(result.success).toBe(true);
        expect(result.outputPath).toBe(outputPath);
        expect(result.processingTime).toBeGreaterThan(0);
        expect(result.outputAnalysis).toBeDefined();
        expect(result.outputAnalysis.loudness).toBeDefined();
      } finally {
        // Cleanup
        try { await fs.unlink(outputPath); } catch {}
      }
    });
  });
  
  describe('resolveFilePath', () => {
    test('returns absolute path for relative key', () => {
      const resolved = audioProcessor.resolveFilePath('test/file.wav');
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toContain('test/file.wav');
    });
    
    test('returns original path for absolute path', () => {
      const absPath = '/some/absolute/path.wav';
      expect(audioProcessor.resolveFilePath(absPath)).toBe(absPath);
    });
  });
  
  describe('fileExists', () => {
    test('returns true for existing file', async () => {
      expect(await audioProcessor.fileExists(TEST_AUDIO_PATH)).toBe(true);
    });
    
    test('returns false for non-existent file', async () => {
      expect(await audioProcessor.fileExists('/nonexistent/file.wav')).toBe(false);
    });
  });
});
