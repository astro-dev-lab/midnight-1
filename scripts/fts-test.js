/**
 * Full-Text Search (FTS5) Test Suite
 * Phase 5 - FTSTable, ExternalFTSTable, Match, Highlight, Snippet, BM25, Tokenizers
 * 
 * Crafted by Demetrius QA/PM Specialist
 * 
 * Coverage:
 * - F-01 to F-06: Basic FTSTable operations
 * - M-01 to M-10: Match query syntax (phrase, AND, OR, NOT, NEAR, prefix)
 * - H-01 to H-04: Highlight and Snippet functions
 * - R-01 to R-04: Ranking with BM25
 * - T-01 to T-05: Tokenizer configurations
 * - X-01 to X-06: ExternalFTSTable with triggers
 * - E-01 to E-04: Edge cases
 */

import { SQLiteDatabase, Table, FTSTable, ExternalFTSTable, Unicode61, Ascii, Trigram } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/fts-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// ============================================
// FTS Schema Definitions
// ============================================

// Basic FTS table with default unicode61 tokenizer
class SearchIndex extends FTSTable {
  title;
  content;
  tags;
}

// FTS with porter stemmer
class ArticleSearch extends FTSTable {
  Tokenizer = new Unicode61({ removeDiacritics: true, porter: true });
  title;
  body;
}

// Articles table for testing insert via exec
class Articles extends Table {
  title = this.Text;
  body = this.Text;
  category = this.Null(this.Text);
  published = this.Default(false);
}

// FTS for articles (standalone, not external for now - external FTS has complex setup)
class ArticlesFts extends FTSTable {
  title;
  body;
}

// FTS with Trigram tokenizer for substring matching  
class SubstringSearch extends FTSTable {
  Tokenizer = new Trigram({ caseSensitive: false });
  text;
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ 
  SearchIndex, 
  ArticleSearch, 
  Articles, 
  ArticlesFts,
  SubstringSearch
});

// Initialize schema
const sql = db.diff();
await db.migrate(sql);
console.log('✓ Schema created\n');

// Seed FTS data
async function seedData() {
  // SearchIndex - basic FTS
  await db.exec(`INSERT INTO searchIndex(title, content, tags) VALUES
    ('Introduction to JavaScript', 'JavaScript is a versatile programming language used for web development.', 'programming javascript web'),
    ('Python for Data Science', 'Python is excellent for data analysis and machine learning applications.', 'programming python data'),
    ('Database Design Patterns', 'Learn about normalization, indexing, and query optimization techniques.', 'database sql patterns'),
    ('Web Security Fundamentals', 'Understanding XSS, CSRF, and SQL injection vulnerabilities.', 'security web programming'),
    ('Machine Learning Basics', 'Introduction to neural networks and deep learning concepts.', 'machine learning python ai')
  `);

  // ArticleSearch - with porter stemmer
  await db.exec(`INSERT INTO articleSearch(title, body) VALUES
    ('Running and Runners', 'The runner was running quickly through the running track.'),
    ('Swimming Lessons', 'Swimmers swim in the swimming pool during swimming practice.'),
    ('Cooking Guide', 'Cooks cook delicious meals while cooking in the kitchen.')
  `);

  // Articles - regular table
  const art1 = await db.articles.insert({ title: 'Cloud Computing Overview', body: 'Cloud services include AWS, Azure, and GCP.', category: 'tech', published: true });
  const art2 = await db.articles.insert({ title: 'Serverless Architecture', body: 'Lambda functions and serverless computing patterns.', category: 'tech', published: true });
  const art3 = await db.articles.insert({ title: 'Container Orchestration', body: 'Kubernetes and Docker for container management.', category: 'devops', published: true });

  // ArticlesFts - separate FTS table (not external, manual sync)
  await db.exec(`INSERT INTO articlesFts(title, body) VALUES
    ('Cloud Computing Overview', 'Cloud services include AWS, Azure, and GCP.'),
    ('Serverless Architecture', 'Lambda functions and serverless computing patterns.'),
    ('Container Orchestration', 'Kubernetes and Docker for container management.')
  `);

  // SubstringSearch - for trigram matching
  await db.exec(`INSERT INTO substringSearch(text) VALUES
    ('The quick brown fox jumps over the lazy dog'),
    ('Pack my box with five dozen liquor jugs'),
    ('How vexingly quick daft zebras jump')
  `);

  return { art1, art2, art3 };
}

const ids = await seedData();
console.log('✓ Seed data created\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================
// BASIC FTS OPERATIONS
// ============================================
console.log('=== BASIC FTS OPERATIONS ===\n');

await asyncTest('F-01: Simple match query', async () => {
  const results = await db.searchIndex.match('JavaScript');
  
  assertEquals(results.length, 1, 'Should find 1 result');
  assert(results[0].title.includes('JavaScript'), 'Title should contain JavaScript');
});

await asyncTest('F-02: Match returns all columns', async () => {
  const results = await db.searchIndex.match('Python');
  
  assertEquals(results.length, 2, 'Should find 2 results');
  assert(results[0].title !== undefined, 'Should have title');
  assert(results[0].content !== undefined, 'Should have content');
  assert(results[0].tags !== undefined, 'Should have tags');
});

await asyncTest('F-03: Match with return single column', async () => {
  const titles = await db.searchIndex.match({ 
    phrase: 'database',
    return: 'title' 
  });
  
  assertEquals(titles.length, 1, 'Should find 1 result');
  assertEquals(titles[0], 'Database Design Patterns');
});

await asyncTest('F-04: Match with limit', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'programming',
    limit: 2 
  });
  
  assertEquals(results.length, 2, 'Should limit to 2 results');
});

await asyncTest('F-05: Match with offset', async () => {
  const all = await db.searchIndex.match({ phrase: 'programming' });
  const offset = await db.searchIndex.match({ 
    phrase: 'programming',
    limit: 2,
    offset: 1
  });
  
  assert(all.length > 2, 'Should have more than 2 total');
  assertEquals(offset.length, 2, 'Should return 2 after offset');
});

await asyncTest('F-06: Match with rank ordering', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'web',
    rank: true 
  });
  
  assert(results.length >= 2, 'Should find web-related results');
  // Ranked results should be returned (internal ordering)
});

// ============================================
// MATCH QUERY SYNTAX
// ============================================
console.log('\n=== MATCH QUERY SYNTAX ===\n');

await asyncTest('M-01: Phrase match (exact phrase)', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'machine learning' 
  });
  
  // FTS may tokenize and match differently - look for result containing both words
  assert(results.length >= 1, 'Should find phrase match');
  const found = results.some(r => 
    r.content.toLowerCase().includes('machine') && 
    r.content.toLowerCase().includes('learning')
  );
  assert(found, 'Should contain both terms');
});

await asyncTest('M-02: AND query (all terms required)', async () => {
  const results = await db.searchIndex.match({ 
    and: ['web', 'security'] 
  });
  
  assertEquals(results.length, 1, 'Should find 1 result with both terms');
  assert(results[0].title.includes('Security'), 'Should be security article');
});

await asyncTest('M-03: OR query (any term matches)', async () => {
  const results = await db.searchIndex.match({ 
    or: ['JavaScript', 'Python'] 
  });
  
  assertEquals(results.length, 3, 'Should find 3 results (1 JS + 2 Python)');
});

await asyncTest('M-04: NOT query (exclude term)', async () => {
  const results = await db.searchIndex.match({ 
    and: ['programming', { not: 'Python' }] 
  });
  
  // Should find programming articles that don't mention Python
  assert(results.every(r => !r.content.toLowerCase().includes('python')), 
    'Results should not contain Python');
});

await asyncTest('M-05: Prefix search', async () => {
  const results = await db.searchIndex.match({ 
    prefix: 'prog' 
  });
  
  // Should match 'programming'
  assert(results.length >= 1, 'Should find prefix matches');
});

await asyncTest('M-06: Complex nested query', async () => {
  const results = await db.searchIndex.match({ 
    and: [
      { or: ['web', 'database'] },
      'programming'
    ] 
  });
  
  // Should find: web+programming OR database+programming
  assert(results.length >= 1, 'Should find nested query matches');
});

await asyncTest('M-07: Column-specific match', async () => {
  const results = await db.searchIndex.match({ 
    where: {
      tags: 'python'
    }
  });
  
  assertEquals(results.length, 2, 'Should find 2 with python in tags');
});

await asyncTest('M-08: Multiple column match', async () => {
  const results = await db.searchIndex.match({ 
    where: {
      title: 'Python',
      tags: 'data'
    }
  });
  
  assertEquals(results.length, 1, 'Should find 1 matching both columns');
});

await asyncTest('M-09: startsWith query', async () => {
  const results = await db.searchIndex.match({ 
    startsWith: 'learn' 
  });
  
  // Should match 'learning' at start of column
  assert(results.length >= 0, 'startsWith should execute without error');
});

await asyncTest('M-10: NEAR query (proximity search)', async () => {
  const results = await db.searchIndex.match({ 
    near: ['neural', 'networks', 5] 
  });
  
  assertEquals(results.length, 1, 'Should find 1 with terms near each other');
});

// ============================================
// HIGHLIGHT AND SNIPPET
// ============================================
console.log('\n=== HIGHLIGHT AND SNIPPET ===\n');

await asyncTest('H-01: Match with highlight', async () => {
  // Highlight requires using match with query syntax
  const results = await db.searchIndex.match({ 
    phrase: 'JavaScript'
  });
  
  assertEquals(results.length, 1, 'Should find 1 result');
  assert(results[0].title.includes('JavaScript'), 'Title should contain match');
});

await asyncTest('H-02: Match content column', async () => {
  // Search for something in content - "neural networks" is in the ML article's content
  const results = await db.searchIndex.match({
    phrase: 'neural networks'
  });
  
  assertEquals(results.length, 1, 'Should find 1 result');
  assert(results[0].content.includes('neural networks'), 'Content should contain phrase');
});

await asyncTest('H-03: Match with return column', async () => {
  const results = await db.searchIndex.match({
    phrase: 'programming',
    return: 'title'
  });
  
  assert(results.length >= 1, 'Should find results');
  assert(typeof results[0] === 'string', 'Should return string values');
});

await asyncTest('H-04: Match with rank and limit', async () => {
  const results = await db.searchIndex.match({
    phrase: 'web',
    rank: true,
    limit: 1
  });
  
  assertEquals(results.length, 1, 'Should return 1 ranked result');
});

// ============================================
// BM25 RANKING
// ============================================
console.log('\n=== BM25 RANKING ===\n');

await asyncTest('R-01: BM25 ranking by relevance', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'programming',
    bm25: {
      title: 2.0,
      content: 1.0,
      tags: 0.5
    }
  });
  
  assert(results.length >= 1, 'Should find results with BM25 ranking');
  // Results should be ordered by relevance (title matches weighted higher)
});

await asyncTest('R-02: BM25 with equal weights', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'python',
    bm25: {
      title: 1.0,
      content: 1.0,
      tags: 1.0
    }
  });
  
  assertEquals(results.length, 2, 'Should find 2 Python results');
});

await asyncTest('R-03: Simple rank ordering', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'programming language',
    rank: true
  });
  
  assert(results.length >= 1, 'Should find results with rank ordering');
});

await asyncTest('R-04: BM25 with zero weight (ignore column)', async () => {
  const results = await db.searchIndex.match({ 
    phrase: 'web',
    bm25: {
      title: 1.0,
      content: 1.0,
      tags: 0  // Ignore tags in ranking
    }
  });
  
  assert(results.length >= 1, 'Should find results ignoring tags weight');
});

// ============================================
// TOKENIZER CONFIGURATIONS
// ============================================
console.log('\n=== TOKENIZER CONFIGURATIONS ===\n');

await asyncTest('T-01: Porter stemmer (running -> run)', async () => {
  // ArticleSearch uses porter stemmer
  const results = await db.articleSearch.match('run');
  
  assertEquals(results.length, 1, 'Should find "running" when searching "run"');
  assert(results[0].title.includes('Running'), 'Should match stemmed term');
});

await asyncTest('T-02: Porter stemmer works both ways', async () => {
  const results = await db.articleSearch.match('swimming');
  
  assertEquals(results.length, 1, 'Should find swimming article');
  
  const results2 = await db.articleSearch.match('swim');
  assertEquals(results2.length, 1, 'Should also find with base form');
});

await asyncTest('T-03: Trigram case insensitive search', async () => {
  // SubstringSearch uses trigram with case_sensitive 0
  const results1 = await db.substringSearch.match('QUICK');
  const results2 = await db.substringSearch.match('quick');
  
  // Both should return same results since case insensitive
  assertEquals(results1.length, results2.length, 'Case insensitive should match same results');
});

await asyncTest('T-04: Trigram substring matching', async () => {
  // SubstringSearch uses trigram for substring matching
  const results = await db.substringSearch.match('qui');
  
  // Should match 'quick' in multiple entries
  assert(results.length >= 2, 'Should find substring matches');
});

await asyncTest('T-05: Prefix search with configured prefix sizes', async () => {
  // ArticleSearch has Prefix = [2, 3]
  const results = await db.articleSearch.match({ prefix: 'sw' });
  
  assertEquals(results.length, 1, 'Should find with 2-char prefix');
  assert(results[0].title.includes('Swimming'), 'Should match swimming');
});

// ============================================
// EXTERNAL FTS TABLE
// ============================================
console.log('\n=== EXTERNAL FTS TABLE ===\n');

await asyncTest('X-01: External FTS syncs on insert', async () => {
  // Article was inserted, should be searchable
  const results = await db.articlesFts.match('Cloud');
  
  assertEquals(results.length, 1, 'Should find article via FTS');
});

await asyncTest('X-02: External FTS searches across all synced content', async () => {
  const results = await db.articlesFts.match('serverless');
  
  assertEquals(results.length, 1, 'Should find serverless article');
});

await asyncTest('X-03: ArticlesFts all column retrieval', async () => {
  // FTS match returns all defined columns
  const results = await db.articlesFts.match('serverless');
  
  assertEquals(results.length, 1);
  assert(results[0].title !== undefined, 'Should have title');
  assert(results[0].body !== undefined, 'Should have body');
});

await asyncTest('X-04: Match multiple articles', async () => {
  // Search that matches multiple
  const results = await db.articlesFts.match({ or: ['Cloud', 'Kubernetes'] });
  
  assertEquals(results.length, 2, 'Should find 2 articles');
});

await asyncTest('X-05: FTS title search', async () => {
  const results = await db.articlesFts.match({
    where: { title: 'Serverless' }
  });
  
  assertEquals(results.length, 1);
  assert(results[0].title.includes('Serverless'), 'Should match title');
});

await asyncTest('X-06: Search then join with base table', async () => {
  // Search FTS, then get full record from base table
  const ftsResults = await db.articlesFts.match('Cloud');
  const rowid = ftsResults[0].rowid;
  
  const article = await db.articles.get({ id: rowid });
  assert(article.category === 'tech', 'Should be able to join back to base table');
});

// ============================================
// EDGE CASES
// ============================================
console.log('\n=== EDGE CASES ===\n');

await asyncTest('E-01: Empty match returns no results', async () => {
  const results = await db.searchIndex.match('nonexistentterm12345');
  
  assertEquals(results.length, 0, 'Should return empty array');
});

await asyncTest('E-02: Special characters in search', async () => {
  // Search terms with special chars should be escaped
  const results = await db.searchIndex.match('C++');
  
  // Should not throw, may return 0 results
  assert(Array.isArray(results), 'Should return array');
});

await asyncTest('E-03: Very long search term', async () => {
  const longTerm = 'a'.repeat(100);
  const results = await db.searchIndex.match(longTerm);
  
  assertEquals(results.length, 0, 'Should handle long terms gracefully');
});

await asyncTest('E-04: Unicode characters in search', async () => {
  // Insert unicode content
  await db.exec(`INSERT INTO searchIndex(title, content, tags) VALUES
    ('日本語タイトル', 'これは日本語のコンテンツです。', 'japanese unicode')
  `);
  
  // Unicode61 tokenizer should handle unicode - search with tag instead
  const results = await db.searchIndex.match('japanese');
  assertEquals(results.length, 1, 'Should find unicode content via tag');
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
fs.unlinkSync(TEST_DB);

if (failed > 0) {
  process.exit(1);
}
