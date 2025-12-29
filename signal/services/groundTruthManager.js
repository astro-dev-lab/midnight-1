/**
 * Ground Truth Manager
 * 
 * Manages ground truth labels for catalog validation.
 * Supports manual labeling, import/export, and statistical analysis.
 * 
 * Usage:
 *   node groundTruthManager.js <command> [options]
 * 
 * Commands:
 *   init <catalog-path>     Initialize ground truth file from catalog
 *   label <file> <subgenre> Add/update label for a file
 *   import <csv-path>       Import labels from CSV
 *   export <output-path>    Export labels to CSV
 *   stats                   Show labeling statistics
 *   validate                Validate labels against known subgenres
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const { SUBGENRES } = require('./subgenreHeuristicsV2');
const { scanCatalog } = require('./catalogValidator');

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_GROUND_TRUTH_PATH = path.join(__dirname, '..', 'data', 'ground_truth.json');
const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'uncertain'];
const VALID_SUBGENRES = Object.values(SUBGENRES);

// ============================================================================
// Ground Truth Data Structure
// ============================================================================

/**
 * Ground truth file format:
 * {
 *   "version": "2.0.0",
 *   "createdAt": "2024-12-29T...",
 *   "updatedAt": "2024-12-29T...",
 *   "catalogPath": "/path/to/catalog",
 *   "statistics": {
 *     "totalFiles": 100,
 *     "labeled": 50,
 *     "unlabeled": 50
 *   },
 *   "labels": {
 *     "filename.wav": {
 *       "subgenre": "trap",
 *       "confidence": "high",
 *       "labeledBy": "human",
 *       "labeledAt": "2024-12-29T...",
 *       "notes": "optional notes"
 *     }
 *   }
 * }
 */

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load ground truth file.
 * 
 * @param {string} filePath - Path to ground truth JSON
 * @returns {Promise<Object>} - Ground truth data
 */
async function loadGroundTruth(filePath = DEFAULT_GROUND_TRUTH_PATH) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptyGroundTruth();
    }
    throw error;
  }
}

/**
 * Save ground truth file.
 * 
 * @param {Object} data - Ground truth data
 * @param {string} filePath - Path to save
 */
async function saveGroundTruth(data, filePath = DEFAULT_GROUND_TRUTH_PATH) {
  // Update timestamp
  data.updatedAt = new Date().toISOString();
  
  // Update statistics
  data.statistics = calculateStatistics(data);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Save
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Create empty ground truth structure.
 */
function createEmptyGroundTruth() {
  return {
    version: '2.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    catalogPath: null,
    statistics: {
      totalFiles: 0,
      labeled: 0,
      unlabeled: 0,
      bySubgenre: {},
      byConfidence: {}
    },
    labels: {}
  };
}

/**
 * Calculate statistics from ground truth data.
 */
function calculateStatistics(data) {
  const stats = {
    totalFiles: Object.keys(data.labels).length,
    labeled: 0,
    unlabeled: 0,
    bySubgenre: {},
    byConfidence: {}
  };
  
  for (const label of Object.values(data.labels)) {
    if (label.subgenre) {
      stats.labeled++;
      stats.bySubgenre[label.subgenre] = (stats.bySubgenre[label.subgenre] || 0) + 1;
      
      if (label.confidence) {
        stats.byConfidence[label.confidence] = (stats.byConfidence[label.confidence] || 0) + 1;
      }
    } else {
      stats.unlabeled++;
    }
  }
  
  return stats;
}

// ============================================================================
// Command Functions
// ============================================================================

/**
 * Initialize ground truth from catalog.
 * Creates entries for all audio files in catalog.
 * 
 * @param {string} catalogPath - Path to audio catalog
 * @param {string} outputPath - Path to save ground truth
 */
async function initFromCatalog(catalogPath, outputPath = DEFAULT_GROUND_TRUTH_PATH) {
  console.log(`Scanning catalog: ${catalogPath}`);
  
  const files = await scanCatalog(catalogPath);
  console.log(`Found ${files.length} audio files`);
  
  const data = createEmptyGroundTruth();
  data.catalogPath = catalogPath;
  
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    data.labels[fileName] = {
      subgenre: null,
      confidence: null,
      labeledBy: null,
      labeledAt: null,
      filePath: filePath,
      notes: null
    };
  }
  
  await saveGroundTruth(data, outputPath);
  console.log(`Ground truth initialized: ${outputPath}`);
  console.log(`Files to label: ${files.length}`);
}

/**
 * Add or update a label.
 * 
 * @param {string} fileName - File name to label
 * @param {string} subgenre - Subgenre label
 * @param {Object} options - Additional options
 */
async function addLabel(fileName, subgenre, options = {}) {
  const {
    confidence = 'high',
    labeledBy = 'human',
    notes = null,
    groundTruthPath = DEFAULT_GROUND_TRUTH_PATH
  } = options;
  
  // Validate subgenre
  if (!VALID_SUBGENRES.includes(subgenre)) {
    throw new Error(`Invalid subgenre: ${subgenre}. Valid options: ${VALID_SUBGENRES.join(', ')}`);
  }
  
  // Validate confidence
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Invalid confidence: ${confidence}. Valid options: ${CONFIDENCE_LEVELS.join(', ')}`);
  }
  
  const data = await loadGroundTruth(groundTruthPath);
  
  // Check if file exists in ground truth
  if (!data.labels[fileName]) {
    // Try to find by partial match
    const matches = Object.keys(data.labels).filter(f => f.includes(fileName));
    if (matches.length === 1) {
      fileName = matches[0];
    } else if (matches.length > 1) {
      throw new Error(`Multiple matches found for "${fileName}": ${matches.slice(0, 5).join(', ')}`);
    } else {
      // Create new entry
      data.labels[fileName] = { filePath: null };
    }
  }
  
  // Update label
  data.labels[fileName] = {
    ...data.labels[fileName],
    subgenre,
    confidence,
    labeledBy,
    labeledAt: new Date().toISOString(),
    notes
  };
  
  await saveGroundTruth(data, groundTruthPath);
  console.log(`Labeled: ${fileName} → ${subgenre} (${confidence})`);
}

/**
 * Import labels from CSV.
 * 
 * Expected CSV format:
 * filename,subgenre,confidence,notes
 * 
 * @param {string} csvPath - Path to CSV file
 * @param {string} groundTruthPath - Path to ground truth JSON
 */
async function importFromCSV(csvPath, groundTruthPath = DEFAULT_GROUND_TRUTH_PATH) {
  const data = await loadGroundTruth(groundTruthPath);
  const content = await fs.readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  
  let imported = 0;
  let skipped = 0;
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',');
    const [fileName, subgenre, confidence, notes] = parts.map(p => p.trim());
    
    if (!fileName || !subgenre) {
      skipped++;
      continue;
    }
    
    if (!VALID_SUBGENRES.includes(subgenre)) {
      console.warn(`Skipping invalid subgenre for ${fileName}: ${subgenre}`);
      skipped++;
      continue;
    }
    
    data.labels[fileName] = {
      ...data.labels[fileName],
      subgenre,
      confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : 'medium',
      labeledBy: 'csv-import',
      labeledAt: new Date().toISOString(),
      notes: notes || null
    };
    
    imported++;
  }
  
  await saveGroundTruth(data, groundTruthPath);
  console.log(`Imported: ${imported} labels`);
  console.log(`Skipped: ${skipped} invalid entries`);
}

/**
 * Export labels to CSV.
 * 
 * @param {string} outputPath - Path for CSV output
 * @param {string} groundTruthPath - Path to ground truth JSON
 */
async function exportToCSV(outputPath, groundTruthPath = DEFAULT_GROUND_TRUTH_PATH) {
  const data = await loadGroundTruth(groundTruthPath);
  
  let csv = 'filename,subgenre,confidence,labeled_by,labeled_at,notes\n';
  
  for (const [fileName, label] of Object.entries(data.labels)) {
    if (label.subgenre) {
      const notes = (label.notes || '').replace(/,/g, ';').replace(/\n/g, ' ');
      csv += `${fileName},${label.subgenre},${label.confidence || ''},${label.labeledBy || ''},${label.labeledAt || ''},"${notes}"\n`;
    }
  }
  
  await fs.writeFile(outputPath, csv, 'utf-8');
  console.log(`Exported to: ${outputPath}`);
  console.log(`Labels exported: ${data.statistics.labeled}`);
}

/**
 * Show labeling statistics.
 * 
 * @param {string} groundTruthPath - Path to ground truth JSON
 */
async function showStatistics(groundTruthPath = DEFAULT_GROUND_TRUTH_PATH) {
  const data = await loadGroundTruth(groundTruthPath);
  const stats = data.statistics;
  
  console.log('\n' + '═'.repeat(50));
  console.log('  GROUND TRUTH STATISTICS');
  console.log('═'.repeat(50) + '\n');
  
  console.log(`Version: ${data.version}`);
  console.log(`Catalog: ${data.catalogPath || 'Not set'}`);
  console.log(`Created: ${data.createdAt}`);
  console.log(`Updated: ${data.updatedAt}`);
  
  console.log('\n── Coverage ──');
  console.log(`  Total Files: ${stats.totalFiles}`);
  console.log(`  Labeled: ${stats.labeled} (${(stats.labeled / stats.totalFiles * 100 || 0).toFixed(1)}%)`);
  console.log(`  Unlabeled: ${stats.unlabeled}`);
  
  if (Object.keys(stats.bySubgenre).length > 0) {
    console.log('\n── By Subgenre ──');
    const sorted = Object.entries(stats.bySubgenre).sort(([, a], [, b]) => b - a);
    for (const [subgenre, count] of sorted) {
      const pct = (count / stats.labeled * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / stats.labeled * 20));
      console.log(`  ${subgenre.padEnd(12)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
    }
  }
  
  if (Object.keys(stats.byConfidence).length > 0) {
    console.log('\n── By Confidence ──');
    for (const [conf, count] of Object.entries(stats.byConfidence)) {
      const pct = (count / stats.labeled * 100).toFixed(1);
      console.log(`  ${conf.padEnd(12)} ${count.toString().padStart(4)} (${pct.padStart(5)}%)`);
    }
  }
  
  console.log('\n' + '═'.repeat(50) + '\n');
}

/**
 * Validate labels against known subgenres.
 * 
 * @param {string} groundTruthPath - Path to ground truth JSON
 */
async function validateLabels(groundTruthPath = DEFAULT_GROUND_TRUTH_PATH) {
  const data = await loadGroundTruth(groundTruthPath);
  
  let valid = 0;
  let invalid = 0;
  const invalidEntries = [];
  
  for (const [fileName, label] of Object.entries(data.labels)) {
    if (label.subgenre) {
      if (VALID_SUBGENRES.includes(label.subgenre)) {
        valid++;
      } else {
        invalid++;
        invalidEntries.push({ file: fileName, subgenre: label.subgenre });
      }
    }
  }
  
  console.log('\n── Label Validation ──');
  console.log(`  Valid labels: ${valid}`);
  console.log(`  Invalid labels: ${invalid}`);
  
  if (invalidEntries.length > 0) {
    console.log('\n  Invalid entries:');
    for (const entry of invalidEntries.slice(0, 10)) {
      console.log(`    ${entry.file}: "${entry.subgenre}" is not a valid subgenre`);
    }
    if (invalidEntries.length > 10) {
      console.log(`    ... and ${invalidEntries.length - 10} more`);
    }
    
    console.log(`\n  Valid subgenres: ${VALID_SUBGENRES.join(', ')}`);
  }
}

/**
 * Interactive labeling session.
 * 
 * @param {string} groundTruthPath - Path to ground truth JSON
 */
async function interactiveLabeling(groundTruthPath = DEFAULT_GROUND_TRUTH_PATH) {
  const data = await loadGroundTruth(groundTruthPath);
  
  // Get unlabeled files
  const unlabeled = Object.entries(data.labels)
    .filter(([, label]) => !label.subgenre)
    .map(([fileName]) => fileName);
  
  if (unlabeled.length === 0) {
    console.log('All files are labeled!');
    return;
  }
  
  console.log(`\nInteractive Labeling Session`);
  console.log(`Unlabeled files: ${unlabeled.length}`);
  console.log(`Valid subgenres: ${VALID_SUBGENRES.join(', ')}`);
  console.log(`Type 'skip' to skip, 'quit' to exit\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  let labeled = 0;
  
  for (const fileName of unlabeled) {
    console.log(`\n[${labeled + 1}/${unlabeled.length}] ${fileName}`);
    
    const answer = await question('Subgenre: ');
    const trimmed = answer.trim().toLowerCase();
    
    if (trimmed === 'quit' || trimmed === 'q') {
      break;
    }
    
    if (trimmed === 'skip' || trimmed === 's' || trimmed === '') {
      continue;
    }
    
    if (!VALID_SUBGENRES.includes(trimmed)) {
      console.log(`Invalid subgenre. Options: ${VALID_SUBGENRES.join(', ')}`);
      continue;
    }
    
    const confidence = await question('Confidence (high/medium/low): ') || 'medium';
    
    data.labels[fileName] = {
      ...data.labels[fileName],
      subgenre: trimmed,
      confidence: CONFIDENCE_LEVELS.includes(confidence.trim()) ? confidence.trim() : 'medium',
      labeledBy: 'interactive',
      labeledAt: new Date().toISOString()
    };
    
    labeled++;
    
    // Save periodically
    if (labeled % 10 === 0) {
      await saveGroundTruth(data, groundTruthPath);
      console.log(`(Saved ${labeled} labels)`);
    }
  }
  
  rl.close();
  
  await saveGroundTruth(data, groundTruthPath);
  console.log(`\nSession complete. Labeled ${labeled} files.`);
}

/**
 * Generate sample ground truth for testing.
 * 
 * @param {string} outputPath - Output path
 * @param {number} count - Number of samples per subgenre
 */
async function generateSampleGroundTruth(outputPath, count = 10) {
  const data = createEmptyGroundTruth();
  
  for (const subgenre of VALID_SUBGENRES) {
    if (subgenre === 'hybrid') continue; // Skip hybrid for samples
    
    for (let i = 1; i <= count; i++) {
      const fileName = `${subgenre}_sample_${i.toString().padStart(3, '0')}.wav`;
      data.labels[fileName] = {
        subgenre,
        confidence: 'high',
        labeledBy: 'sample-generator',
        labeledAt: new Date().toISOString(),
        notes: 'Synthetic sample for testing'
      };
    }
  }
  
  await saveGroundTruth(data, outputPath);
  console.log(`Generated sample ground truth: ${outputPath}`);
  console.log(`Samples per subgenre: ${count}`);
  console.log(`Total samples: ${Object.keys(data.labels).length}`);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  loadGroundTruth,
  saveGroundTruth,
  initFromCatalog,
  addLabel,
  importFromCSV,
  exportToCSV,
  showStatistics,
  validateLabels,
  interactiveLabeling,
  generateSampleGroundTruth,
  VALID_SUBGENRES,
  CONFIDENCE_LEVELS
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const commands = {
    async init() {
      const catalogPath = args[1];
      const outputPath = args[2] || DEFAULT_GROUND_TRUTH_PATH;
      if (!catalogPath) {
        console.log('Usage: node groundTruthManager.js init <catalog-path> [output-path]');
        process.exit(1);
      }
      await initFromCatalog(catalogPath, outputPath);
    },
    
    async label() {
      const fileName = args[1];
      const subgenre = args[2];
      if (!fileName || !subgenre) {
        console.log('Usage: node groundTruthManager.js label <filename> <subgenre>');
        process.exit(1);
      }
      await addLabel(fileName, subgenre);
    },
    
    async import() {
      const csvPath = args[1];
      if (!csvPath) {
        console.log('Usage: node groundTruthManager.js import <csv-path>');
        process.exit(1);
      }
      await importFromCSV(csvPath);
    },
    
    async export() {
      const outputPath = args[1];
      if (!outputPath) {
        console.log('Usage: node groundTruthManager.js export <output-path>');
        process.exit(1);
      }
      await exportToCSV(outputPath);
    },
    
    async stats() {
      await showStatistics();
    },
    
    async validate() {
      await validateLabels();
    },
    
    async interactive() {
      await interactiveLabeling();
    },
    
    async sample() {
      const outputPath = args[1] || path.join(__dirname, '..', 'data', 'sample_ground_truth.json');
      const count = parseInt(args[2]) || 10;
      await generateSampleGroundTruth(outputPath, count);
    }
  };
  
  if (commands[command]) {
    commands[command]().catch(console.error);
  } else {
    console.log('Ground Truth Manager v2');
    console.log('\nCommands:');
    console.log('  init <catalog-path>          Initialize from catalog');
    console.log('  label <filename> <subgenre>  Add/update label');
    console.log('  import <csv-path>            Import from CSV');
    console.log('  export <output-path>         Export to CSV');
    console.log('  stats                        Show statistics');
    console.log('  validate                     Validate labels');
    console.log('  interactive                  Start interactive session');
    console.log('  sample [output] [count]      Generate sample data');
    console.log('\nValid subgenres:', VALID_SUBGENRES.join(', '));
  }
}
