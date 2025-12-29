/**
 * Confidence Pressure Tester
 * 
 * Tests decision engine confidence outcomes against real catalog audio.
 * Validates signal extraction → classification → decision pipeline end-to-end.
 * 
 * Usage:
 *   node services/confidenceTester.js [--catalog <path>] [--sample <n>]
 */

const fs = require('fs').promises;
const path = require('path');

const audioProcessor = require('./audioProcessor');
const { classifySubgenre, getRiskWeights, SUBGENRES } = require('./subgenreHeuristics');
const { DecisionEngine } = require('./decisionEngine');
const { generateReportLanguage, formatReportForDisplay } = require('./uxLanguage');

// ============================================================================
// Configuration
// ============================================================================

const SUPPORTED_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aac', '.m4a', '.ogg'];
const DEFAULT_CATALOG_PATH = path.join(__dirname, '..', 'storage', 'uploads');

// ============================================================================
// Signal Extraction (Bridge to audioProcessor)
// ============================================================================

/**
 * Extract decision-relevant signals from a real audio file.
 * Maps audioProcessor output to subgenreHeuristics signal format.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Extracted signals
 */
async function extractSignals(filePath) {
  const results = {
    filePath,
    signals: {},
    risks: {},
    errors: [],
    extractionTime: 0
  };
  
  const startTime = Date.now();
  
  try {
    // Get basic audio info
    const audioInfo = await audioProcessor.getAudioInfo(filePath);
    
    // Analyze loudness (EBU R128)
    const loudness = await audioProcessor.analyzeLoudness(filePath);
    
    // Detect peaks
    const peaks = await audioProcessor.detectPeaks(filePath);
    
    // Analyze spectrum
    const spectrum = await audioProcessor.analyzeSpectrum(filePath);
    
    // Analyze stereo width
    const stereo = await audioProcessor.analyzeStereoWidth(filePath);
    
    // Analyze phase correlation
    const phase = await audioProcessor.analyzePhaseCorrelation(filePath);
    
    // Map to decision engine signal format
    results.signals = mapToSignals({
      audioInfo,
      loudness,
      peaks,
      spectrum,
      stereo,
      phase
    });
    
    // Calculate risk scores from raw data
    results.risks = calculateRisks({
      loudness,
      peaks,
      spectrum,
      stereo,
      phase
    });
    
    // Track any analysis errors
    if (loudness.error) results.errors.push({ source: 'loudness', error: loudness.error });
    if (peaks.error) results.errors.push({ source: 'peaks', error: peaks.error });
    if (spectrum.error) results.errors.push({ source: 'spectrum', error: spectrum.error });
    if (stereo.error) results.errors.push({ source: 'stereo', error: stereo.error });
    if (phase.error) results.errors.push({ source: 'phase', error: phase.error });
    
  } catch (error) {
    results.errors.push({ source: 'extraction', error: error.message });
  }
  
  results.extractionTime = Date.now() - startTime;
  return results;
}

/**
 * Map audioProcessor outputs to subgenreHeuristics signal format.
 */
function mapToSignals(data) {
  const { audioInfo, loudness, peaks, spectrum, stereo, phase } = data;
  
  return {
    // BPM - would require beat detection (not currently in audioProcessor)
    // For now, leave undefined to test partial signal handling
    bpm: undefined,
    
    // Sub-bass energy - derived from spectral centroid
    // Low centroid = more low-frequency energy
    subBassEnergy: spectrum.centroid 
      ? Math.max(0, Math.min(1, 1 - (spectrum.centroid / 8000)))
      : undefined,
    
    // Transient density - derived from crest factor
    // Higher crest = more transient content
    transientDensity: spectrum.crest
      ? Math.max(0, Math.min(1, spectrum.crest / 20))
      : undefined,
    
    // Dynamic range - from peaks or loudness
    dynamicRange: loudness.loudnessRange || peaks.dynamicRange || undefined,
    
    // Stereo width - from stereo analysis
    stereoWidth: stereo.width !== null 
      ? Math.max(0, Math.min(1, stereo.width / 2))
      : undefined,
    
    // Mix balance - inferred from stereo and spectral data
    mixBalance: inferMixBalance(spectrum, stereo)
  };
}

/**
 * Infer mix balance from available data.
 */
function inferMixBalance(spectrum, stereo) {
  // This is a simplified heuristic
  // Real implementation would use vocal presence detection
  if (!spectrum.centroid) return undefined;
  
  // High centroid + moderate width suggests vocal-dominant
  if (spectrum.centroid > 2000 && stereo.width < 0.6) {
    return 'vocal-dominant';
  }
  
  // Low centroid + narrow field suggests beat-dominant
  if (spectrum.centroid < 1500 && stereo.width < 0.5) {
    return 'beat-dominant';
  }
  
  return 'balanced';
}

/**
 * Calculate risk scores from raw analysis data.
 */
function calculateRisks(data) {
  const { loudness, peaks, spectrum, stereo, phase } = data;
  
  const risks = {};
  
  // Masking risk - high when spectral content is concentrated
  if (spectrum.flatness !== null) {
    // Low flatness = concentrated energy = higher masking risk
    risks.maskingRisk = Math.max(0, Math.min(1, 1 - spectrum.flatness));
  }
  
  // Clipping risk - from true peak levels
  if (loudness.truePeak !== null) {
    // Risk increases as true peak approaches 0 dBTP
    const headroom = Math.abs(loudness.truePeak);
    risks.clippingRisk = Math.max(0, Math.min(1, 1 - (headroom / 3)));
  } else if (peaks.peakDb !== null) {
    const headroom = Math.abs(peaks.peakDb);
    risks.clippingRisk = Math.max(0, Math.min(1, 1 - (headroom / 3)));
  }
  
  // Translation risk - from stereo width and low-frequency content
  if (stereo.width !== null) {
    const widthRisk = stereo.width > 0.8 ? 0.5 : 0;
    const monoRisk = stereo.monoCompatible ? 0 : 0.3;
    risks.translationRisk = Math.min(1, widthRisk + monoRisk);
  }
  
  // Phase collapse risk - from phase correlation
  if (phase && phase.correlation !== null) {
    // Risk increases as correlation drops below 0.5
    risks.phaseCollapseRisk = Math.max(0, Math.min(1, 0.5 - phase.correlation + 0.5));
  }
  
  // Over-compression risk - from loudness range
  if (loudness.loudnessRange !== null) {
    // Risk increases as LRA drops below 6 LU
    risks.overCompressionRisk = Math.max(0, Math.min(1, (6 - loudness.loudnessRange) / 6));
  }
  
  // Vocal intelligibility risk - simplified
  if (spectrum.centroid !== null && risks.maskingRisk !== undefined) {
    risks.vocalIntelligibilityRisk = risks.maskingRisk * 0.7;
  }
  
  // Fill missing risks with neutral values for testing
  const allRisks = [
    'maskingRisk', 'clippingRisk', 'translationRisk', 
    'phaseCollapseRisk', 'overCompressionRisk', 'vocalIntelligibilityRisk'
  ];
  
  for (const risk of allRisks) {
    if (risks[risk] === undefined) {
      risks[risk] = 0.3; // Neutral default
    }
  }
  
  return risks;
}

// ============================================================================
// Pressure Testing Functions
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
 * Run pressure test on a single file.
 * 
 * @param {string} filePath - Path to audio file
 * @param {DecisionEngine} engine - Decision engine instance
 * @returns {Promise<Object>} - Test result
 */
async function testFile(filePath, engine) {
  const result = {
    file: path.basename(filePath),
    path: filePath,
    status: 'pending',
    extraction: null,
    classification: null,
    decision: null,
    confidence: null,
    issues: []
  };
  
  try {
    // Extract signals
    const extraction = await extractSignals(filePath);
    result.extraction = {
      signals: extraction.signals,
      risks: extraction.risks,
      errors: extraction.errors,
      time: extraction.extractionTime
    };
    
    if (extraction.errors.length > 0) {
      result.issues.push({
        type: 'extraction_errors',
        details: extraction.errors
      });
    }
    
    // Classify subgenre
    const classification = classifySubgenre(extraction.signals);
    result.classification = {
      primary: classification.primary,
      confidence: classification.confidence,
      isUncertain: classification.isUncertain,
      conflictingSignals: classification.conflictingSignals,
      likelihoods: classification.likelihoods
    };
    
    // Run through decision engine
    const decision = engine.process(extraction.signals, extraction.risks);
    result.decision = {
      appliedRules: decision.appliedRules,
      constraints: Object.keys(decision.constraints),
      subgenre: decision.context.subgenre
    };
    
    // Calculate final confidence
    const confidenceResult = engine.calculateWeightedConfidence(
      extraction.risks,
      decision.riskWeights
    );
    result.confidence = {
      base: (1 - Object.values(extraction.risks).reduce((a, b) => a + b, 0) / 
             Object.values(extraction.risks).length),
      weighted: confidenceResult.confidence,
      percent: confidenceResult.confidencePercent,
      tier: getTier(confidenceResult.confidence)
    };
    
    // Flag potential issues
    if (classification.isUncertain) {
      result.issues.push({ type: 'uncertain_classification' });
    }
    
    if (confidenceResult.confidence < 0.4) {
      result.issues.push({ type: 'low_confidence', value: confidenceResult.confidence });
    }
    
    if (classification.conflictingSignals) {
      result.issues.push({ type: 'conflicting_signals' });
    }
    
    result.status = 'completed';
    
  } catch (error) {
    result.status = 'failed';
    result.issues.push({ type: 'fatal_error', error: error.message });
  }
  
  return result;
}

/**
 * Get confidence tier label.
 */
function getTier(confidence) {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.70) return 'GOOD';
  if (confidence >= 0.55) return 'MODERATE';
  if (confidence >= 0.40) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Run pressure test across entire catalog.
 * 
 * @param {Object} options - Test options
 * @returns {Promise<Object>} - Aggregate test results
 */
async function runPressureTest(options = {}) {
  const catalogPath = options.catalogPath || DEFAULT_CATALOG_PATH;
  const sampleSize = options.sampleSize || Infinity;
  const verbose = options.verbose || false;
  
  console.log('\n' + '═'.repeat(70));
  console.log('  CONFIDENCE PRESSURE TEST');
  console.log('═'.repeat(70));
  console.log(`Catalog: ${catalogPath}`);
  console.log(`Sample Size: ${sampleSize === Infinity ? 'All files' : sampleSize}`);
  console.log('─'.repeat(70) + '\n');
  
  // Scan catalog
  const allFiles = await scanCatalog(catalogPath);
  console.log(`Found ${allFiles.length} audio files`);
  
  if (allFiles.length === 0) {
    console.log('No audio files found. Creating synthetic test...\n');
    return runSyntheticTest();
  }
  
  // Sample files
  const testFiles = sampleSize < allFiles.length
    ? allFiles.sort(() => Math.random() - 0.5).slice(0, sampleSize)
    : allFiles;
  
  console.log(`Testing ${testFiles.length} files...\n`);
  
  // Run tests
  const engine = new DecisionEngine();
  const results = [];
  
  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    if (verbose) {
      console.log(`[${i + 1}/${testFiles.length}] ${path.basename(file)}`);
    }
    
    const result = await testFile(file, engine);
    results.push(result);
    
    if (verbose && result.status === 'completed') {
      console.log(`  → ${result.classification.primary} (${result.confidence.percent}% confidence)`);
    }
  }
  
  // Aggregate results
  return aggregateResults(results);
}

/**
 * Run synthetic test when no catalog files available.
 */
async function runSyntheticTest() {
  const { SIMULATION_SCENARIOS, runScenario } = require('./confidenceSimulator');
  
  console.log('Running against simulation scenarios...\n');
  
  const results = [];
  for (const [key, scenario] of Object.entries(SIMULATION_SCENARIOS)) {
    const result = runScenario(scenario);
    results.push({
      file: key,
      status: 'completed',
      classification: {
        primary: result.classification.primary,
        confidence: result.classification.confidence,
        isUncertain: result.classification.isUncertain
      },
      confidence: {
        percent: result.confidence.percent,
        tier: getTier(result.confidence.weighted)
      },
      decision: {
        appliedRules: result.appliedRules,
        constraints: Object.keys(result.constraints)
      },
      issues: result.classification.isUncertain ? [{ type: 'uncertain_classification' }] : []
    });
  }
  
  return aggregateResults(results);
}

/**
 * Aggregate test results into summary report.
 */
function aggregateResults(results) {
  const summary = {
    total: results.length,
    completed: 0,
    failed: 0,
    bySubgenre: {},
    byTier: { HIGH: 0, GOOD: 0, MODERATE: 0, LOW: 0, VERY_LOW: 0 },
    byIssue: {},
    ruleFrequency: {},
    avgConfidence: 0,
    avgExtractionTime: 0,
    lowConfidenceFiles: [],
    results: results
  };
  
  let totalConfidence = 0;
  let totalTime = 0;
  let timeCount = 0;
  
  for (const result of results) {
    if (result.status === 'completed') {
      summary.completed++;
      
      // Track by subgenre
      const subgenre = result.classification?.primary || 'unknown';
      summary.bySubgenre[subgenre] = (summary.bySubgenre[subgenre] || 0) + 1;
      
      // Track by tier
      if (result.confidence?.tier) {
        summary.byTier[result.confidence.tier]++;
      }
      
      // Track confidence
      if (result.confidence?.percent) {
        totalConfidence += result.confidence.percent;
      }
      
      // Track extraction time
      if (result.extraction?.time) {
        totalTime += result.extraction.time;
        timeCount++;
      }
      
      // Track rules
      if (result.decision?.appliedRules) {
        for (const rule of result.decision.appliedRules) {
          summary.ruleFrequency[rule] = (summary.ruleFrequency[rule] || 0) + 1;
        }
      }
      
      // Track issues
      for (const issue of result.issues || []) {
        summary.byIssue[issue.type] = (summary.byIssue[issue.type] || 0) + 1;
      }
      
      // Track low confidence files
      if (result.confidence?.percent < 50) {
        summary.lowConfidenceFiles.push({
          file: result.file,
          confidence: result.confidence.percent,
          subgenre: subgenre
        });
      }
      
    } else {
      summary.failed++;
    }
  }
  
  summary.avgConfidence = summary.completed > 0 
    ? (totalConfidence / summary.completed).toFixed(1) 
    : 0;
  summary.avgExtractionTime = timeCount > 0 
    ? (totalTime / timeCount).toFixed(0) 
    : 0;
  
  // Print report
  printAggregateReport(summary);
  
  return summary;
}

/**
 * Print formatted aggregate report.
 */
function printAggregateReport(summary) {
  console.log('\n' + '═'.repeat(70));
  console.log('  PRESSURE TEST RESULTS');
  console.log('═'.repeat(70) + '\n');
  
  console.log(`Total Files: ${summary.total}`);
  console.log(`Completed: ${summary.completed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Average Confidence: ${summary.avgConfidence}%`);
  console.log(`Average Extraction Time: ${summary.avgExtractionTime}ms`);
  
  console.log('\n─ Distribution by Subgenre ─');
  for (const [subgenre, count] of Object.entries(summary.bySubgenre)) {
    const pct = ((count / summary.completed) * 100).toFixed(1);
    console.log(`  ${subgenre.padEnd(12)} ${count.toString().padStart(4)} (${pct}%)`);
  }
  
  console.log('\n─ Distribution by Confidence Tier ─');
  for (const [tier, count] of Object.entries(summary.byTier)) {
    const pct = ((count / summary.completed) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / summary.completed * 20));
    console.log(`  ${tier.padEnd(10)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }
  
  if (Object.keys(summary.byIssue).length > 0) {
    console.log('\n─ Issues Detected ─');
    for (const [issue, count] of Object.entries(summary.byIssue)) {
      console.log(`  ${issue.padEnd(25)} ${count}`);
    }
  }
  
  console.log('\n─ Rule Application Frequency ─');
  const sortedRules = Object.entries(summary.ruleFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  for (const [rule, count] of sortedRules) {
    console.log(`  ${rule.padEnd(15)} ${count}`);
  }
  
  if (summary.lowConfidenceFiles.length > 0) {
    console.log('\n─ Low Confidence Files (< 50%) ─');
    for (const file of summary.lowConfidenceFiles.slice(0, 10)) {
      console.log(`  ${file.file.padEnd(30)} ${file.confidence}% (${file.subgenre})`);
    }
    if (summary.lowConfidenceFiles.length > 10) {
      console.log(`  ... and ${summary.lowConfidenceFiles.length - 10} more`);
    }
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  extractSignals,
  scanCatalog,
  testFile,
  runPressureTest,
  runSyntheticTest
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--catalog' && args[i + 1]) {
      options.catalogPath = args[++i];
    } else if (args[i] === '--sample' && args[i + 1]) {
      options.sampleSize = parseInt(args[++i]);
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    }
  }
  
  runPressureTest(options).catch(console.error);
}
