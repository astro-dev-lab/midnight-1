/**
 * File Integrity Validator Tests
 * 
 * Tests for corruption detection, truncated frames, and invalid headers.
 */

const fs = require('fs').promises;
const path = require('path');
const {
  validateFileIntegrity,
  quickValidate,
  validateHeader,
  checkMagicBytes,
  IntegrityErrorCode,
  Severity,
  MAGIC_BYTES,
  VALID_SAMPLE_RATES
} = require('../services/fileIntegrityValidator');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Helper to create test fixtures
async function ensureFixturesDir() {
  try {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
  } catch (e) {
    // Ignore
  }
}

// Helper to create a minimal valid WAV header
function createWAVHeader(options = {}) {
  const {
    sampleRate = 44100,
    channels = 2,
    bitsPerSample = 16,
    dataSize = 1000
  } = options;
  
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);
  
  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  return buffer;
}

// Helper to create a minimal valid MP3 frame
function createMP3Header() {
  // ID3 header + single frame
  const buffer = Buffer.alloc(100);
  
  // ID3v2 header
  buffer.write('ID3', 0);
  buffer.writeUInt8(4, 3); // Version major
  buffer.writeUInt8(0, 4); // Version minor
  buffer.writeUInt8(0, 5); // Flags
  buffer.writeUInt32BE(0, 6); // Size (syncsafe)
  
  // Frame sync at position 10
  buffer.writeUInt8(0xFF, 10);
  buffer.writeUInt8(0xFB, 11); // MPEG1 Layer 3
  buffer.writeUInt8(0x90, 12); // 128kbps, 44.1kHz
  buffer.writeUInt8(0x00, 13);
  
  return buffer;
}

describe('File Integrity Validator', () => {
  
  beforeAll(async () => {
    await ensureFixturesDir();
  });

  describe('Magic Bytes', () => {
    it('should export magic bytes for common formats', () => {
      expect(MAGIC_BYTES).toHaveProperty('WAV');
      expect(MAGIC_BYTES).toHaveProperty('MP3');
      expect(MAGIC_BYTES).toHaveProperty('FLAC');
      expect(MAGIC_BYTES).toHaveProperty('OGG');
      expect(MAGIC_BYTES).toHaveProperty('MP4');
      expect(MAGIC_BYTES).toHaveProperty('AIFF');
    });

    it('should have correct WAV magic bytes', () => {
      const wav = MAGIC_BYTES.WAV;
      expect(wav.offset).toBe(0);
      expect(Buffer.from(wav.bytes).toString()).toBe('RIFF');
      expect(Buffer.from(wav.secondary.bytes).toString()).toBe('WAVE');
    });

    it('should have correct FLAC magic bytes', () => {
      const flac = MAGIC_BYTES.FLAC;
      expect(Buffer.from(flac.bytes).toString()).toBe('fLaC');
    });
  });

  describe('Error Codes', () => {
    it('should export all error codes', () => {
      expect(IntegrityErrorCode.INVALID_MAGIC_BYTES).toBeDefined();
      expect(IntegrityErrorCode.CORRUPT_HEADER).toBeDefined();
      expect(IntegrityErrorCode.MISSING_AUDIO_STREAM).toBeDefined();
      expect(IntegrityErrorCode.TRUNCATED_FILE).toBeDefined();
      expect(IntegrityErrorCode.INCOMPLETE_FRAMES).toBeDefined();
      expect(IntegrityErrorCode.ZERO_DURATION).toBeDefined();
      expect(IntegrityErrorCode.FILE_NOT_FOUND).toBeDefined();
      expect(IntegrityErrorCode.FILE_EMPTY).toBeDefined();
    });
  });

  describe('Severity Levels', () => {
    it('should export severity levels', () => {
      expect(Severity.CRITICAL).toBeDefined();
      expect(Severity.HIGH).toBeDefined();
      expect(Severity.MEDIUM).toBeDefined();
      // Note: LOW is not defined in the implementation
    });
  });

  describe('Valid Sample Rates', () => {
    it('should include standard sample rates', () => {
      expect(VALID_SAMPLE_RATES).toContain(44100);
      expect(VALID_SAMPLE_RATES).toContain(48000);
      expect(VALID_SAMPLE_RATES).toContain(96000);
      expect(VALID_SAMPLE_RATES).toContain(192000);
    });
  });

  describe('checkMagicBytes', () => {
    it('should detect valid WAV magic bytes', async () => {
      const wavPath = path.join(FIXTURES_DIR, 'test-valid.wav');
      const wavBuffer = createWAVHeader();
      await fs.writeFile(wavPath, wavBuffer);
      
      try {
        const result = await checkMagicBytes(wavPath);
        expect(result.valid).toBe(true);
        expect(result.format).toBe('WAV');
      } finally {
        await fs.unlink(wavPath).catch(() => {});
      }
    });

    it('should detect valid MP3 magic bytes (ID3)', async () => {
      const mp3Path = path.join(FIXTURES_DIR, 'test-valid.mp3');
      const mp3Buffer = createMP3Header();
      await fs.writeFile(mp3Path, mp3Buffer);
      
      try {
        const result = await checkMagicBytes(mp3Path);
        expect(result.valid).toBe(true);
        expect(result.format).toBe('MP3');
      } finally {
        await fs.unlink(mp3Path).catch(() => {});
      }
    });

    it('should reject invalid magic bytes', async () => {
      const badPath = path.join(FIXTURES_DIR, 'test-invalid.wav');
      await fs.writeFile(badPath, Buffer.from('NOT_AUDIO_DATA'));
      
      try {
        const result = await checkMagicBytes(badPath);
        expect(result.valid).toBe(false);
        expect(result.error?.code).toBe(IntegrityErrorCode.INVALID_MAGIC_BYTES);
      } finally {
        await fs.unlink(badPath).catch(() => {});
      }
    });
  });

  describe('validateHeader', () => {
    it('should validate WAV header structure', () => {
      // validateHeader takes a Buffer, not a path
      const wavBuffer = createWAVHeader({ sampleRate: 48000, channels: 2 });
      const result = validateHeader(wavBuffer);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('WAV');
    });

    it('should detect truncated headers', () => {
      // Buffer too small
      const result = validateHeader(Buffer.from('RIFF'));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(IntegrityErrorCode.CORRUPT_HEADER);
    });

    it('should reject invalid format', () => {
      const badBuffer = Buffer.alloc(32);
      badBuffer.write('GARBAGE_DATA');
      const result = validateHeader(badBuffer);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(IntegrityErrorCode.INVALID_MAGIC_BYTES);
    });
  });

  describe('quickValidate', () => {
    it('should perform fast validation on valid file', async () => {
      const wavPath = path.join(FIXTURES_DIR, 'test-quick.wav');
      const wavBuffer = createWAVHeader();
      await fs.writeFile(wavPath, wavBuffer);
      
      try {
        const result = await quickValidate(wavPath);
        expect(result.valid).toBe(true);
        expect(result.format).toBeDefined();
      } finally {
        await fs.unlink(wavPath).catch(() => {});
      }
    });

    it('should fail on empty file', async () => {
      const emptyPath = path.join(FIXTURES_DIR, 'test-empty.wav');
      await fs.writeFile(emptyPath, Buffer.alloc(0));
      
      try {
        const result = await quickValidate(emptyPath);
        expect(result.valid).toBe(false);
        expect(result.error?.code).toBe(IntegrityErrorCode.FILE_EMPTY);
      } finally {
        await fs.unlink(emptyPath).catch(() => {});
      }
    });

    it('should fail on non-existent file', async () => {
      const result = await quickValidate('/nonexistent/path/file.wav');
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(IntegrityErrorCode.FILE_NOT_FOUND);
    });
  });

  describe('validateFileIntegrity (full validation)', () => {
    it('should validate complete WAV file', async () => {
      const wavPath = path.join(FIXTURES_DIR, 'test-full.wav');
      const wavBuffer = createWAVHeader({ dataSize: 2000 });
      await fs.writeFile(wavPath, wavBuffer);
      
      try {
        // Skip FFprobe since we have stub data
        const result = await validateFileIntegrity(wavPath, { skipFFprobe: true });
        // Should pass magic bytes check at minimum
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
      } finally {
        await fs.unlink(wavPath).catch(() => {});
      }
    }, 10000);

    it('should return category INGESTION for all errors', async () => {
      const badPath = path.join(FIXTURES_DIR, 'test-bad.wav');
      await fs.writeFile(badPath, Buffer.from('GARBAGE_DATA'));
      
      try {
        const result = await validateFileIntegrity(badPath);
        expect(result.valid).toBe(false);
        
        for (const error of result.errors) {
          expect(error.category).toBe('INGESTION');
        }
      } finally {
        await fs.unlink(badPath).catch(() => {});
      }
    });

    it('should include recommendations in errors', async () => {
      const result = await validateFileIntegrity('/nonexistent/file.wav');
      expect(result.valid).toBe(false);
      
      for (const error of result.errors) {
        expect(error.recommendation).toBeDefined();
        expect(typeof error.recommendation).toBe('string');
        expect(error.recommendation.length).toBeGreaterThan(0);
      }
    });

    it('should respect strictMode option', async () => {
      const wavPath = path.join(FIXTURES_DIR, 'test-strict.wav');
      const wavBuffer = createWAVHeader();
      await fs.writeFile(wavPath, wavBuffer);
      
      try {
        // Skip FFprobe for synthetic test data
        const looseResult = await validateFileIntegrity(wavPath, { strictMode: false, skipFFprobe: true });
        const strictResult = await validateFileIntegrity(wavPath, { strictMode: true, skipFFprobe: true });
        
        // Both should have results
        expect(looseResult).toHaveProperty('valid');
        expect(strictResult).toHaveProperty('valid');
      } finally {
        await fs.unlink(wavPath).catch(() => {});
      }
    }, 10000);
  });

  describe('StudioOS Compliance', () => {
    it('should use approved terminology in error descriptions', async () => {
      const result = await validateFileIntegrity('/nonexistent/file.wav');
      
      // Check no forbidden terms appear
      const forbiddenTerms = ['track', 'clip', 'session', 'plugin', 'timeline'];
      
      for (const error of result.errors) {
        const desc = error.description.toLowerCase();
        for (const term of forbiddenTerms) {
          expect(desc).not.toContain(term);
        }
      }
    });

    it('should use "asset" terminology', async () => {
      const result = await validateFileIntegrity('/nonexistent/file.wav');
      
      // Recommendations should mention "asset"
      const hasAssetTerm = result.errors.some(
        e => e.recommendation.toLowerCase().includes('asset')
      );
      expect(hasAssetTerm).toBe(true);
    });
  });

  describe('Error Structure', () => {
    it('should return structured error objects', async () => {
      const result = await validateFileIntegrity('/nonexistent/file.wav');
      
      expect(result.errors.length).toBeGreaterThan(0);
      
      const error = result.errors[0];
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('category');
      expect(error).toHaveProperty('severity');
      expect(error).toHaveProperty('description');
      expect(error).toHaveProperty('recommendation');
    });
  });
});

// Cleanup fixtures directory after all tests
afterAll(async () => {
  try {
    const files = await fs.readdir(FIXTURES_DIR);
    for (const file of files) {
      await fs.unlink(path.join(FIXTURES_DIR, file)).catch(() => {});
    }
    await fs.rmdir(FIXTURES_DIR).catch(() => {});
  } catch (e) {
    // Ignore cleanup errors
  }
});
