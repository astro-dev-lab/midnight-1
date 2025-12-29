/**
 * Catalog Validator v2
 * 
 * Enterprise-scale validation of subgenre classification against real audio catalogs.
 * Supports batch processing, ground truth comparison, and statistical analysis.
 * 
 * Usage:
 *   node services/catalogValidator.js --catalog <path> [options]
 * 
 * Options:
 *   --catalog <path>     Path to audio catalog directory
 *   --ground-truth <path> Path to ground truth JSON file
 *   --output <path>      Output path for validation report
 *   --sample <n>         Process only n random files
 *   --parallel <n>       Number of parallel workers (default: 4)
 *   --verbose           Enable verbose logging
 */

const fs = require('fs').promises;
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const audioProcessor = require('./audioProcessor');
const { SUBGENRES, classifySubgenre, getRiskWeights, VERSION } = require('./subgenreHeuristicsV2');
const { DecisionEngine } = require('./decisionEngine');

// ============================================================================
// Configuration
// ============================================================================

const SUPPORTED_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aac', '.m4a', '.ogg', '.opus'];
const DEFAULT_PARALLEL_WORKERS = Math.max(1, os.cpus().length - 1);
const BATCH_SIZE = 50;

// ============================================================================
// Signal Extraction (v2 Enhanced)
// ============================================================================

/**
 * Extract v2 signals from audio file.
 * Includes new signal types: vinylNoise, reverbDecay, distortion indicators.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Extracted signals and metadata
 */
async function extractSignalsV2(filePath) {
  const startTime = Date.now();
  const result = {
    filePath,
    fileName: path.basename(filePath),
    signals: {},
    risks: {},
    metadata: {},
    errors: [],
    extractionTimeMs: 0
  };
  
  try {
    // Get basic audio info
    const audioInfo = await audioProcessor.getAudioInfo(filePath);
    result.metadata = {
      duration: audioInfo.duration,
      sampleRate: audioInfo.sampleRate,
      channels: audioInfo.channels,
      codec: audioInfo.codec,
      bitRate: audioInfo.bitRate
    };
    
    // Parallel analysis
    const [loudness, peaks, spectrum, stereo, phase] = await Promise.all([
      audioProcessor.analyzeLoudness(filePath).catch(e => ({ error: e.message })),
      audioProcessor.detectPeaks(filePath).catch(e => ({ error: e.message })),
      audioProcessor.analyzeSpectrum(filePath).catch(e => ({ error: e.message })),
      audioProcessor.analyzeStereoWidth(filePath).catch(e => ({ error: e.message })),
      audioProcessor.analyzePhaseCorrelation(filePath).catch(e => ({ error: e.message }))
    ]);
    
    // Map to v2 signals
    result.signals = mapToSignalsV2({ audioInfo, loudness, peaks, spectrum, stereo, phase });
    
    // Calculate v2 risks
    result.risks = calculateRisksV2({ loudness, peaks, spectrum, stereo, phase });
    
    // Collect errors
    if (loudness.error) result.errors.push({ source: 'loudness', error: loudness.error });
    if (peaks.error) result.errors.push({ source: 'peaks', error: peaks.error });
    if (spectrum.error) result.errors.push({ source: 'spectrum', error: spectrum.error });
    if (stereo.error) result.errors.push({ source: 'stereo', error: stereo.error });
    if (phase.error) result.errors.push({ source: 'phase', error: phase.error });
    
  } catch (error) {
    result.errors.push({ source: 'extraction', error: error.message });
  }
  
  result.extractionTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Map audioProcessor outputs to v2 signal format.
 */
function mapToSignalsV2(data) {
  const { audioInfo, loudness, peaks, spectrum, stereo, phase } = data;
  
  const signals = {
    // Core signals
    subBassEnergy: spectrum.centroid 
      ? Math.max(0, Math.min(1, 1 - (spectrum.centroid / 8000)))
      : undefined,
    
    transientDensity: spectrum.crest
      ? Math.max(0, Math.min(1, spectrum.crest / 20))
      : undefined,
    
    dynamicRange: loudness.loudnessRange || peaks.dynamicRange || undefined,
    
    stereoWidth: stereo.width !== null 
      ? Math.max(0, Math.min(1, stereo.width / 2))
      : undefined,
    
    mixBalance: inferMixBalance(spectrum, stereo),
    
    // v2 new signals
    vinylNoise: estimateVinylNoise(spectrum),
    reverbDecay: estimateReverbDecay(spectrum, stereo),
    highFreqRolloff: estimateHighFreqRolloff(spectrum),
    distortion: estimateDistortion(peaks, loudness)
  };
  
  return signals;
}

/**
 * Estimate vinyl noise level from spectral characteristics.
 */
function estimateVinylNoise(spectrum) {
  // High spectral flatness in HF range suggests noise
  if (spectrum.flatness === null) return undefined;
  
  // Vinyl noise creates consistent high-frequency content
  // High flatness in presence of rolloff suggests noise
  const flatness = spectrum.flatness || 0;
  const rolloff = spectrum.rolloff || 0;
  
  if (rolloff > 0 && flatness > 0.3) {
    return Math.min(1, flatness * 1.5);
  }
  
  return flatness * 0.5;
}

/**
 * Estimate reverb decay time from spectral and stereo characteristics.
 */
function estimateReverbDecay(spectrum, stereo) {
  // Wide stereo + low transient density suggests reverb
  if (stereo.width === null) return undefined;
  
  const width = stereo.width || 0;
  const crest = spectrum.crest || 10; // Lower crest = diffuse = more reverb
  
  // Heuristic: wide stereo + low crest = reverby
  const reverbIndicator = (width / 2) * (1 - Math.min(1, crest / 20));
  
  // Map to approximate decay time in seconds
  return Math.max(0.1, reverbIndicator * 3);
}

/**
 * Estimate high-frequency rolloff.
 */
function estimateHighFreqRolloff(spectrum) {
  if (spectrum.rolloff === null || spectrum.centroid === null) return undefined;
  
  const rolloff = spectrum.rolloff || 0;
  const centroid = spectrum.centroid || 0;
  
  // Low rolloff relative to centroid suggests intentional HF reduction
  if (centroid > 0) {
    const ratio = rolloff / centroid;
    return Math.max(0, Math.min(1, 1 - (ratio / 4)));
  }
  
  return 0;
}

/**
 * Estimate distortion level from peaks and loudness.
 */
function estimateDistortion(peaks, loudness) {
  // High peaks + low dynamic range = likely distorted
  if (peaks.peakDb === null) return undefined;
  
  const headroom = Math.abs(peaks.peakDb || -6);
  const lra = loudness.loudnessRange || 10;
  
  // Low headroom + low LRA = crushed/distorted
  const distortionIndicator = (1 - headroom / 10) * (1 - lra / 20);
  
  return Math.max(0, Math.min(1, distortionIndicator));
}

/**
 * Infer mix balance from spectral and stereo data.
 */
function inferMixBalance(spectrum, stereo) {
  if (!spectrum.centroid) return undefined;
  
  if (spectrum.centroid > 2000 && stereo.width < 0.6) {
    return 'vocal-dominant';
  }
  
  if (spectrum.centroid < 1500 && stereo.width < 0.5) {
    return 'beat-dominant';
  }
  
  return 'balanced';
}

/**
 * Calculate v2 risk scores including new risk types.
 */
function calculateRisksV2(data) {
  const { loudness, peaks, spectrum, stereo, phase } = data;
  
  const risks = {};
  
  // Core risks (from v1)
  if (spectrum.flatness !== null) {
    risks.maskingRisk = Math.max(0, Math.min(1, 1 - spectrum.flatness));
  }
  
  if (loudness.truePeak !== null) {
    const headroom = Math.abs(loudness.truePeak);
    risks.clippingRisk = Math.max(0, Math.min(1, 1 - (headroom / 3)));
  } else if (peaks.peakDb !== null) {
    const headroom = Math.abs(peaks.peakDb);
    risks.clippingRisk = Math.max(0, Math.min(1, 1 - (headroom / 3)));
  }
  
  if (stereo.width !== null) {
    const widthRisk = stereo.width > 0.8 ? 0.5 : 0;
    const monoRisk = stereo.monoCompatible ? 0 : 0.3;
    risks.translationRisk = Math.min(1, widthRisk + monoRisk);
  }
  
  if (phase && phase.correlation !== null) {
    risks.phaseCollapseRisk = Math.max(0, Math.min(1, 0.5 - phase.correlation + 0.5));
  }
  
  if (loudness.loudnessRange !== null) {
    risks.overCompressionRisk = Math.max(0, Math.min(1, (6 - loudness.loudnessRange) / 6));
  }
  
  if (spectrum.centroid !== null && risks.maskingRisk !== undefined) {
    risks.vocalIntelligibilityRisk = risks.maskingRisk * 0.7;
  }
  
  // v2 new risks
  risks.artifactRisk = estimateArtifactRisk(spectrum, peaks);
  risks.lofiAestheticRisk = estimateLofiAestheticRisk(spectrum);
  
  // Fill missing risks with neutral values
  const allRisks = [
    'maskingRisk', 'clippingRisk', 'translationRisk', 
    'phaseCollapseRisk', 'overCompressionRisk', 'vocalIntelligibilityRisk',
    'artifactRisk', 'lofiAestheticRisk'
  ];
  
  for (const risk of allRisks) {
    if (risks[risk] === undefined) {
      risks[risk] = 0.3;
    }
  }
  
  return risks;
}

/**
 * Estimate artifact risk (unintentional distortion/noise).
 */
function estimateArtifactRisk(spectrum, peaks) {
  // High flatness + low peak headroom might indicate artifacts
  const flatness = spectrum.flatness || 0.5;
  const headroom = peaks.peakDb ? Math.abs(peaks.peakDb) : 6;
  
  // More concerning if there's high-frequency noise AND low headroom
  return Math.max(0, Math.min(1, flatness * (1 - headroom / 10)));
}

/**
 * Estimate risk of unintentionally removing lo-fi aesthetic.
 */
function estimateLofiAestheticRisk(spectrum) {
  // High flatness suggests noise that might be intentional
  // Low centroid suggests reduced HF that might be intentional
  const flatness = spectrum.flatness || 0;
  const centroid = spectrum.centroid || 5000;
  
  // Lower centroid = more HF rolloff = higher lofi risk
  const rolloffFactor = Math.max(0, 1 - (centroid / 8000));
  
  return Math.min(1, (flatness * 0.5) + (rolloffFactor * 0.5));
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Scan catalog directory for audio files.
 * 
 * @param {string} catalogPath - Path to catalog directory
 * @returns {Promise<string[]>} - Array of audio file paths
 */
async function scanCatalog(catalogPath) {
  const files = [];
  
  async function scanDir(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`[Scanner] Could not read ${dirPath}: ${error.message}`);
    }
  }
  
  await scanDir(catalogPath);
  return files;
}

/**
 * Load ground truth labels from JSON file.
 * 
 * Expected format:
 * {
 *   "file1.wav": { "subgenre": "trap", "confidence": "high" },
 *   "file2.mp3": { "subgenre": "drill", "confidence": "medium" }
 * }
 * 
 * @param {string} groundTruthPath - Path to ground truth JSON
 * @returns {Promise<Object>} - Ground truth mapping
 */
async function loadGroundTruth(groundTruthPath) {
  try {
    const content = await fs.readFile(groundTruthPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`[GroundTruth] Could not load ${groundTruthPath}: ${error.message}`);
    return {};
  }
}

/**
 * Process a single file and return validation result.
 * 
 * @param {string} filePath - Path to audio file
 * @param {Object} groundTruth - Ground truth labels
 * @returns {Promise<Object>} - Validation result
 */
async function processFile(filePath, groundTruth = {}) {
  const fileName = path.basename(filePath);
  const result = {
    file: fileName,
    path: filePath,
    status: 'pending',
    extraction: null,
    classification: null,
    groundTruth: null,
    match: null,
    confidence: null,
    errors: []
  };
  
  try {
    // Extract signals
    const extraction = await extractSignalsV2(filePath);
    result.extraction = {
      signals: extraction.signals,
      risks: extraction.risks,
      metadata: extraction.metadata,
      timeMs: extraction.extractionTimeMs
    };
    
    if (extraction.errors.length > 0) {
      result.errors.push(...extraction.errors);
    }
    
    // Classify subgenre
    const classification = classifySubgenre(extraction.signals);
    result.classification = {
      primary: classification.primary,
      confidence: classification.confidence,
      isUncertain: classification.isUncertain,
      conflictingSignals: classification.conflictingSignals,
      topCandidates: classification.topCandidates
    };
    
    // Compare to ground truth
    const truth = groundTruth[fileName] || groundTruth[filePath];
    if (truth) {
      result.groundTruth = truth;
      result.match = {
        exact: classification.primary === truth.subgenre,
        inTop3: classification.topCandidates?.some(c => c.subgenre === truth.subgenre) || false
      };
    }
    
    // Calculate weighted confidence
    const riskWeights = getRiskWeights(classification);
    const avgRisk = Object.values(extraction.risks).reduce((a, b) => a + b, 0) / 
                    Object.values(extraction.risks).length;
    result.confidence = {
      classification: classification.confidence,
      processing: 1 - avgRisk
    };
    
    result.status = 'completed';
    
  } catch (error) {
    result.status = 'failed';
    result.errors.push({ source: 'processing', error: error.message });
  }
  
  return result;
}

/**
 * Run batch validation across catalog.
 * 
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - Aggregate validation results
 */
async function runValidation(options = {}) {
  const {
    catalogPath,
    groundTruthPath,
    outputPath,
    sampleSize = Infinity,
    verbose = false
  } = options;
  
  console.log('\n' + '═'.repeat(70));
  console.log('  CATALOG VALIDATION v2');
  console.log('═'.repeat(70));
  console.log(`Version: ${VERSION}`);
  console.log(`Catalog: ${catalogPath}`);
  console.log(`Ground Truth: ${groundTruthPath || 'None'}`);
  console.log(`Sample Size: ${sampleSize === Infinity ? 'All files' : sampleSize}`);
  console.log('─'.repeat(70) + '\n');
  
  // Scan catalog
  const allFiles = await scanCatalog(catalogPath);
  console.log(`Found ${allFiles.length} audio files\n`);
  
  if (allFiles.length === 0) {
    console.log('No audio files found in catalog.');
    return null;
  }
  
  // Load ground truth
  const groundTruth = groundTruthPath ? await loadGroundTruth(groundTruthPath) : {};
  console.log(`Ground truth labels: ${Object.keys(groundTruth).length}\n`);
  
  // Sample files
  const testFiles = sampleSize < allFiles.length
    ? allFiles.sort(() => Math.random() - 0.5).slice(0, sampleSize)
    : allFiles;
  
  console.log(`Processing ${testFiles.length} files...\n`);
  
  // Process files in batches
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < testFiles.length; i += BATCH_SIZE) {
    const batch = testFiles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(testFiles.length / BATCH_SIZE);
    
    if (verbose) {
      console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
    }
    
    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(file => processFile(file, groundTruth))
    );
    
    results.push(...batchResults);
    
    // Progress update
    const completed = Math.min(i + BATCH_SIZE, testFiles.length);
    const pct = ((completed / testFiles.length) * 100).toFixed(1);
    process.stdout.write(`\rProgress: ${completed}/${testFiles.length} (${pct}%)`);
  }
  
  console.log('\n');
  
  const totalTime = Date.now() - startTime;
  
  // Aggregate results
  const report = aggregateValidationResults(results, totalTime);
  
  // Print report
  printValidationReport(report);
  
  // Save report
  if (outputPath) {
    await saveValidationReport(report, outputPath);
    console.log(`\nReport saved to: ${outputPath}`);
  }
  
  return report;
}

/**
 * Aggregate validation results into statistical report.
 */
function aggregateValidationResults(results, totalTimeMs) {
  const report = {
    version: VERSION,
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      completed: 0,
      failed: 0,
      withGroundTruth: 0,
      exactMatches: 0,
      top3Matches: 0,
      totalTimeMs,
      avgTimePerFile: 0
    },
    distribution: {
      bySubgenre: {},
      byConfidenceTier: { HIGH: 0, GOOD: 0, MODERATE: 0, LOW: 0, VERY_LOW: 0 },
      byStatus: {}
    },
    accuracy: {
      exactMatch: 0,
      top3Match: 0,
      bySubgenre: {}
    },
    ruleFrequency: {},
    issues: {},
    lowConfidenceFiles: [],
    misclassifications: [],
    results
  };
  
  let totalExtractTime = 0;
  
  for (const result of results) {
    // Track status
    report.distribution.byStatus[result.status] = 
      (report.distribution.byStatus[result.status] || 0) + 1;
    
    if (result.status === 'completed') {
      report.summary.completed++;
      
      // Track subgenre distribution
      const subgenre = result.classification?.primary || 'unknown';
      report.distribution.bySubgenre[subgenre] = 
        (report.distribution.bySubgenre[subgenre] || 0) + 1;
      
      // Track confidence tier
      const conf = result.classification?.confidence || 0;
      const tier = getTier(conf);
      report.distribution.byConfidenceTier[tier]++;
      
      // Track extraction time
      if (result.extraction?.timeMs) {
        totalExtractTime += result.extraction.timeMs;
      }
      
      // Track ground truth accuracy
      if (result.groundTruth) {
        report.summary.withGroundTruth++;
        
        if (result.match?.exact) {
          report.summary.exactMatches++;
        } else if (result.match?.inTop3) {
          report.summary.top3Matches++;
        }
        
        // Track per-subgenre accuracy
        const truthSubgenre = result.groundTruth.subgenre;
        if (!report.accuracy.bySubgenre[truthSubgenre]) {
          report.accuracy.bySubgenre[truthSubgenre] = { total: 0, exact: 0, top3: 0 };
        }
        report.accuracy.bySubgenre[truthSubgenre].total++;
        if (result.match?.exact) {
          report.accuracy.bySubgenre[truthSubgenre].exact++;
        }
        if (result.match?.inTop3) {
          report.accuracy.bySubgenre[truthSubgenre].top3++;
        }
        
        // Track misclassifications
        if (!result.match?.exact && result.groundTruth) {
          report.misclassifications.push({
            file: result.file,
            expected: result.groundTruth.subgenre,
            got: result.classification?.primary,
            confidence: result.classification?.confidence
          });
        }
      }
      
      // Track low confidence files
      if (conf < 0.5) {
        report.lowConfidenceFiles.push({
          file: result.file,
          confidence: conf,
          subgenre: subgenre
        });
      }
      
    } else {
      report.summary.failed++;
    }
    
    // Track issues
    for (const error of result.errors || []) {
      const issueType = error.source || 'unknown';
      report.issues[issueType] = (report.issues[issueType] || 0) + 1;
    }
  }
  
  // Calculate averages
  report.summary.avgTimePerFile = report.summary.completed > 0
    ? Math.round(totalExtractTime / report.summary.completed)
    : 0;
  
  // Calculate accuracy percentages
  if (report.summary.withGroundTruth > 0) {
    report.accuracy.exactMatch = 
      (report.summary.exactMatches / report.summary.withGroundTruth * 100).toFixed(1);
    report.accuracy.top3Match = 
      ((report.summary.exactMatches + report.summary.top3Matches) / 
       report.summary.withGroundTruth * 100).toFixed(1);
    
    // Per-subgenre accuracy percentages
    for (const subgenre of Object.keys(report.accuracy.bySubgenre)) {
      const data = report.accuracy.bySubgenre[subgenre];
      data.exactPct = (data.exact / data.total * 100).toFixed(1);
      data.top3Pct = ((data.exact + data.top3) / data.total * 100).toFixed(1);
    }
  }
  
  return report;
}

function getTier(confidence) {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.70) return 'GOOD';
  if (confidence >= 0.55) return 'MODERATE';
  if (confidence >= 0.40) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Print formatted validation report.
 */
function printValidationReport(report) {
  console.log('═'.repeat(70));
  console.log('  VALIDATION REPORT');
  console.log('═'.repeat(70) + '\n');
  
  console.log('── Summary ──');
  console.log(`  Total Files: ${report.summary.total}`);
  console.log(`  Completed: ${report.summary.completed}`);
  console.log(`  Failed: ${report.summary.failed}`);
  console.log(`  Total Time: ${(report.summary.totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`  Avg Time/File: ${report.summary.avgTimePerFile}ms`);
  console.log(`  Throughput: ${(report.summary.completed / (report.summary.totalTimeMs / 1000)).toFixed(1)} files/sec`);
  
  console.log('\n── Distribution by Subgenre ──');
  const sortedSubgenres = Object.entries(report.distribution.bySubgenre)
    .sort(([, a], [, b]) => b - a);
  for (const [subgenre, count] of sortedSubgenres) {
    const pct = ((count / report.summary.completed) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / report.summary.completed * 30));
    console.log(`  ${subgenre.padEnd(12)} ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
  }
  
  console.log('\n── Distribution by Confidence Tier ──');
  for (const [tier, count] of Object.entries(report.distribution.byConfidenceTier)) {
    const pct = ((count / report.summary.completed) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / report.summary.completed * 30));
    console.log(`  ${tier.padEnd(10)} ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
  }
  
  if (report.summary.withGroundTruth > 0) {
    console.log('\n── Accuracy (vs Ground Truth) ──');
    console.log(`  Files with Ground Truth: ${report.summary.withGroundTruth}`);
    console.log(`  Exact Match Accuracy: ${report.accuracy.exactMatch}%`);
    console.log(`  Top-3 Accuracy: ${report.accuracy.top3Match}%`);
    
    console.log('\n  Per-Subgenre Accuracy:');
    for (const [subgenre, data] of Object.entries(report.accuracy.bySubgenre)) {
      console.log(`    ${subgenre.padEnd(12)} Exact: ${data.exactPct}% | Top-3: ${data.top3Pct}% (n=${data.total})`);
    }
    
    if (report.misclassifications.length > 0) {
      console.log('\n── Misclassifications (sample) ──');
      for (const mis of report.misclassifications.slice(0, 10)) {
        console.log(`  ${mis.file.substring(0, 30).padEnd(32)} Expected: ${mis.expected.padEnd(10)} Got: ${mis.got} (${(mis.confidence * 100).toFixed(0)}%)`);
      }
      if (report.misclassifications.length > 10) {
        console.log(`  ... and ${report.misclassifications.length - 10} more`);
      }
    }
  }
  
  if (Object.keys(report.issues).length > 0) {
    console.log('\n── Issues Detected ──');
    for (const [issue, count] of Object.entries(report.issues)) {
      console.log(`  ${issue.padEnd(20)} ${count}`);
    }
  }
  
  if (report.lowConfidenceFiles.length > 0) {
    console.log('\n── Low Confidence Files (sample) ──');
    for (const file of report.lowConfidenceFiles.slice(0, 5)) {
      console.log(`  ${file.file.substring(0, 40).padEnd(42)} ${(file.confidence * 100).toFixed(0)}% (${file.subgenre})`);
    }
    if (report.lowConfidenceFiles.length > 5) {
      console.log(`  ... and ${report.lowConfidenceFiles.length - 5} more`);
    }
  }
  
  console.log('\n' + '═'.repeat(70));
}

/**
 * Save validation report to JSON file.
 */
async function saveValidationReport(report, outputPath) {
  // Create summary version without full results array
  const summary = {
    ...report,
    results: undefined,
    resultCount: report.results.length
  };
  
  // Save summary
  await fs.writeFile(
    outputPath,
    JSON.stringify(summary, null, 2),
    'utf-8'
  );
  
  // Save full results to separate file
  const fullPath = outputPath.replace('.json', '.full.json');
  await fs.writeFile(
    fullPath,
    JSON.stringify(report, null, 2),
    'utf-8'
  );
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  extractSignalsV2,
  scanCatalog,
  loadGroundTruth,
  processFile,
  runValidation,
  aggregateValidationResults
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--catalog' && args[i + 1]) {
      options.catalogPath = args[++i];
    } else if (args[i] === '--ground-truth' && args[i + 1]) {
      options.groundTruthPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputPath = args[++i];
    } else if (args[i] === '--sample' && args[i + 1]) {
      options.sampleSize = parseInt(args[++i]);
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    }
  }
  
  if (!options.catalogPath) {
    console.log('Usage: node catalogValidator.js --catalog <path> [options]');
    console.log('\nOptions:');
    console.log('  --catalog <path>       Path to audio catalog directory');
    console.log('  --ground-truth <path>  Path to ground truth JSON file');
    console.log('  --output <path>        Output path for validation report');
    console.log('  --sample <n>           Process only n random files');
    console.log('  --verbose              Enable verbose logging');
    process.exit(1);
  }
  
  runValidation(options).catch(console.error);
}
