/**
 * Types Test Suite
 * Phase 3 - Type Serialization & Deserialization
 * 
 * Coverage: Boolean, Date, JSON, Blob, Integer, Real, Null handling
 */

import { SQLiteDatabase, Table } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/types-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// Test Schema with all column types
class TypedItems extends Table {
  // Text (default)
  name;
  
  // Boolean types
  active = this.True;
  disabled = this.False;
  flagNullable = this.Null(this.Bool);
  
  // Integer types
  count = this.Default(0);
  quantity = this.Null(this.Int);
  
  // Real/Float types
  price = this.Null(this.Real);
  rating = this.Null(this.Real);
  
  // Date types
  createdAt = this.Now;
  updatedAt = this.Null(this.Date);
  scheduledFor = this.Null(this.Date);
  
  // JSON types
  metadata = this.Null(this.Json);
  tags = this.Null(this.Json);
  
  // Blob types
  data = this.Null(this.Blob);
  thumbnail = this.Null(this.Blob);
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ TypedItems });

// Initialize schema
const sql = db.diff();
await db.migrate(sql);
console.log('✓ Schema created\n');

let passed = 0;
let failed = 0;

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
// BOOLEAN CONVERSION
// ============================================
console.log('=== BOOLEAN CONVERSION ===\n');

await asyncTest('BO-01: True value stored and retrieved', async () => {
  const id = await db.typedItems.insert({ name: 'Bool True', active: true });
  const item = await db.typedItems.get({ id });
  assertEquals(item.active, true, 'Should be boolean true');
  assertEquals(typeof item.active, 'boolean', 'Type should be boolean');
});

await asyncTest('BO-02: False value stored and retrieved', async () => {
  const id = await db.typedItems.insert({ name: 'Bool False', active: false });
  const item = await db.typedItems.get({ id });
  assertEquals(item.active, false, 'Should be boolean false');
  assertEquals(typeof item.active, 'boolean', 'Type should be boolean');
});

await asyncTest('BO-03: Default True applied', async () => {
  const id = await db.typedItems.insert({ name: 'Default True' });
  const item = await db.typedItems.get({ id });
  assertEquals(item.active, true, 'active should default to true');
});

await asyncTest('BO-04: Default False applied', async () => {
  const id = await db.typedItems.insert({ name: 'Default False' });
  const item = await db.typedItems.get({ id });
  assertEquals(item.disabled, false, 'disabled should default to false');
});

await asyncTest('BO-05: Nullable boolean with null', async () => {
  const id = await db.typedItems.insert({ name: 'Null Bool', flagNullable: null });
  const item = await db.typedItems.get({ id });
  assertEquals(item.flagNullable, null, 'Should be null');
});

await asyncTest('BO-06: Nullable boolean with true', async () => {
  const id = await db.typedItems.insert({ name: 'Nullable True', flagNullable: true });
  const item = await db.typedItems.get({ id });
  assertEquals(item.flagNullable, true, 'Should be true');
});

await asyncTest('BO-07: Boolean in where clause', async () => {
  await db.typedItems.insert({ name: 'Active Item', active: true });
  await db.typedItems.insert({ name: 'Inactive Item', active: false });
  
  const activeItems = await db.typedItems.many({ active: true });
  const inactiveItems = await db.typedItems.many({ active: false });
  
  assert(activeItems.length > 0, 'Should find active items');
  assert(inactiveItems.length > 0, 'Should find inactive items');
  activeItems.forEach(i => assertEquals(i.active, true));
  inactiveItems.forEach(i => assertEquals(i.active, false));
});

await asyncTest('BO-08: Update boolean value', async () => {
  const id = await db.typedItems.insert({ name: 'Toggle Bool', active: true });
  
  await db.typedItems.update({
    where: { id },
    set: { active: false }
  });
  
  const item = await db.typedItems.get({ id });
  assertEquals(item.active, false, 'Should be updated to false');
});

// ============================================
// DATE CONVERSION
// ============================================
console.log('\n=== DATE CONVERSION ===\n');

await asyncTest('DT-01: Date object stored and retrieved', async () => {
  const testDate = new Date('2025-06-15T10:30:00.000Z');
  const id = await db.typedItems.insert({ name: 'Date Test', updatedAt: testDate });
  const item = await db.typedItems.get({ id });
  
  assert(item.updatedAt instanceof Date, 'Should be Date instance');
  assertEquals(item.updatedAt.toISOString(), testDate.toISOString());
});

await asyncTest('DT-02: Now default creates current timestamp', async () => {
  const before = new Date();
  before.setMilliseconds(0); // SQLite datetime has second precision
  
  const id = await db.typedItems.insert({ name: 'Now Test' });
  
  const after = new Date();
  after.setSeconds(after.getSeconds() + 1); // Add 1 second buffer
  
  const item = await db.typedItems.get({ id });
  
  assert(item.createdAt instanceof Date, 'createdAt should be Date');
  assert(item.createdAt >= before && item.createdAt <= after, 
    `Should be within test window: ${item.createdAt.toISOString()} between ${before.toISOString()} and ${after.toISOString()}`);
});

await asyncTest('DT-03: Null date', async () => {
  const id = await db.typedItems.insert({ name: 'Null Date', updatedAt: null });
  const item = await db.typedItems.get({ id });
  assertEquals(item.updatedAt, null, 'Should be null');
});

await asyncTest('DT-04: Date in where clause', async () => {
  const targetDate = new Date('2030-01-01T00:00:00.000Z');
  await db.typedItems.insert({ name: 'Future Item', scheduledFor: targetDate });
  
  const items = await db.typedItems.many({ scheduledFor: targetDate });
  assert(items.length > 0, 'Should find item by date');
  assertEquals(items[0].scheduledFor.toISOString(), targetDate.toISOString());
});

await asyncTest('DT-05: Date ordering', async () => {
  await db.typedItems.insert({ name: 'Date A', updatedAt: new Date('2025-01-01') });
  await db.typedItems.insert({ name: 'Date B', updatedAt: new Date('2025-06-01') });
  await db.typedItems.insert({ name: 'Date C', updatedAt: new Date('2025-03-01') });
  
  const items = await db.typedItems.query({
    where: { updatedAt: c => c.not(null) },
    orderBy: 'updatedAt'
  });
  
  // Should be chronological order
  for (let i = 1; i < items.length; i++) {
    assert(items[i].updatedAt >= items[i - 1].updatedAt, 'Should be in chronological order');
  }
});

await asyncTest('DT-06: Date comparison with gt/lt', async () => {
  const cutoff = new Date('2025-04-01');
  
  const after = await db.typedItems.many({ updatedAt: c => c.gt(cutoff) });
  const before = await db.typedItems.many({ updatedAt: c => c.lt(cutoff) });
  
  after.forEach(item => {
    if (item.updatedAt) {
      assert(item.updatedAt > cutoff, 'Should be after cutoff');
    }
  });
  
  before.forEach(item => {
    if (item.updatedAt) {
      assert(item.updatedAt < cutoff, 'Should be before cutoff');
    }
  });
});

await asyncTest('DT-07: Update date value', async () => {
  const id = await db.typedItems.insert({ name: 'Update Date' });
  const newDate = new Date('2026-12-25T00:00:00.000Z');
  
  await db.typedItems.update({
    where: { id },
    set: { updatedAt: newDate }
  });
  
  const item = await db.typedItems.get({ id });
  assertEquals(item.updatedAt.toISOString(), newDate.toISOString());
});

// ============================================
// JSON CONVERSION
// ============================================
console.log('\n=== JSON CONVERSION ===\n');

await asyncTest('JS-01: Simple object stored and retrieved', async () => {
  const metadata = { key: 'value', number: 42 };
  const id = await db.typedItems.insert({ name: 'JSON Simple', metadata });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.metadata, metadata);
});

await asyncTest('JS-02: Array stored and retrieved', async () => {
  const tags = ['red', 'green', 'blue'];
  const id = await db.typedItems.insert({ name: 'JSON Array', tags });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.tags, tags);
});

await asyncTest('JS-03: Nested object stored and retrieved', async () => {
  const metadata = {
    level1: {
      level2: {
        level3: {
          value: 'deep'
        }
      }
    }
  };
  const id = await db.typedItems.insert({ name: 'JSON Nested', metadata });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.metadata, metadata);
  assertEquals(item.metadata.level1.level2.level3.value, 'deep');
});

await asyncTest('JS-04: Null inside JSON preserved', async () => {
  const metadata = { key: null, other: 'value' };
  const id = await db.typedItems.insert({ name: 'JSON Null Inside', metadata });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.metadata, metadata);
  assertEquals(item.metadata.key, null);
});

await asyncTest('JS-05: Empty object', async () => {
  const metadata = {};
  const id = await db.typedItems.insert({ name: 'JSON Empty', metadata });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.metadata, {});
});

await asyncTest('JS-06: Empty array', async () => {
  const tags = [];
  const id = await db.typedItems.insert({ name: 'JSON Empty Array', tags });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.tags, []);
});

await asyncTest('JS-07: Complex mixed JSON', async () => {
  const metadata = {
    string: 'hello',
    number: 123.456,
    boolean: true,
    null: null,
    array: [1, 'two', { three: 3 }],
    nested: {
      a: { b: { c: [1, 2, 3] } }
    }
  };
  const id = await db.typedItems.insert({ name: 'JSON Complex', metadata });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.metadata, metadata);
});

await asyncTest('JS-08: Null JSON column', async () => {
  const id = await db.typedItems.insert({ name: 'JSON Null', metadata: null });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.metadata, null);
});

await asyncTest('JS-09: Update JSON value', async () => {
  const id = await db.typedItems.insert({ name: 'JSON Update', metadata: { v: 1 } });
  
  await db.typedItems.update({
    where: { id },
    set: { metadata: { v: 2, added: true } }
  });
  
  const item = await db.typedItems.get({ id });
  assertDeepEquals(item.metadata, { v: 2, added: true });
});

await asyncTest('JS-10: Array of objects', async () => {
  const tags = [
    { id: 1, name: 'tag1' },
    { id: 2, name: 'tag2' },
    { id: 3, name: 'tag3' }
  ];
  const id = await db.typedItems.insert({ name: 'JSON Array Objects', tags });
  const item = await db.typedItems.get({ id });
  
  assertDeepEquals(item.tags, tags);
  assertEquals(item.tags[1].name, 'tag2');
});

// ============================================
// BLOB HANDLING
// ============================================
console.log('\n=== BLOB HANDLING ===\n');

await asyncTest('BL-01: Buffer insert and retrieve', async () => {
  const data = Buffer.from('Hello, World!', 'utf-8');
  const id = await db.typedItems.insert({ name: 'Blob Text', data });
  const item = await db.typedItems.get({ id });
  
  assert(Buffer.isBuffer(item.data), 'Should be Buffer');
  assert(data.equals(item.data), 'Buffer content should match');
  assertEquals(item.data.toString('utf-8'), 'Hello, World!');
});

await asyncTest('BL-02: Binary data (non-text)', async () => {
  // Create some binary data (simulating image/file)
  const data = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
  const id = await db.typedItems.insert({ name: 'Blob Binary', data });
  const item = await db.typedItems.get({ id });
  
  assert(Buffer.isBuffer(item.data), 'Should be Buffer');
  assert(data.equals(item.data), 'Binary content should match byte-for-byte');
});

await asyncTest('BL-03: Null blob', async () => {
  const id = await db.typedItems.insert({ name: 'Blob Null', data: null });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.data, null);
});

await asyncTest('BL-04: Large blob', async () => {
  // 1KB of random data
  const data = Buffer.alloc(1024);
  for (let i = 0; i < 1024; i++) {
    data[i] = i % 256;
  }
  
  const id = await db.typedItems.insert({ name: 'Blob Large', data });
  const item = await db.typedItems.get({ id });
  
  assert(Buffer.isBuffer(item.data), 'Should be Buffer');
  assertEquals(item.data.length, 1024, 'Should be 1024 bytes');
  assert(data.equals(item.data), 'Content should match');
});

await asyncTest('BL-05: Update blob value', async () => {
  const id = await db.typedItems.insert({ name: 'Blob Update', data: Buffer.from('original') });
  
  await db.typedItems.update({
    where: { id },
    set: { data: Buffer.from('updated') }
  });
  
  const item = await db.typedItems.get({ id });
  assertEquals(item.data.toString(), 'updated');
});

await asyncTest('BL-06: Multiple blob columns', async () => {
  const data = Buffer.from('main data');
  const thumbnail = Buffer.from('thumb');
  
  const id = await db.typedItems.insert({ name: 'Multi Blob', data, thumbnail });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.data.toString(), 'main data');
  assertEquals(item.thumbnail.toString(), 'thumb');
});

await asyncTest('BL-07: insertMany with blobs (uses batch path)', async () => {
  const items = [
    { name: 'Batch Blob 1', data: Buffer.from('batch1') },
    { name: 'Batch Blob 2', data: Buffer.from('batch2') },
    { name: 'Batch Blob 3', data: Buffer.from('batch3') }
  ];
  
  await db.typedItems.insertMany(items);
  
  const retrieved = await db.typedItems.many({ name: c => c.like('Batch Blob%') });
  assertEquals(retrieved.length, 3, 'Should insert 3 items');
  
  retrieved.forEach(item => {
    assert(Buffer.isBuffer(item.data), 'Each should have Buffer');
  });
});

// ============================================
// INTEGER & REAL
// ============================================
console.log('\n=== INTEGER & REAL ===\n');

await asyncTest('IR-01: Integer stored and retrieved', async () => {
  const id = await db.typedItems.insert({ name: 'Int Test', count: 42 });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.count, 42);
  assertEquals(typeof item.count, 'number');
});

await asyncTest('IR-02: Real/Float stored and retrieved', async () => {
  const id = await db.typedItems.insert({ name: 'Real Test', price: 19.99 });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.price, 19.99);
  assertEquals(typeof item.price, 'number');
});

await asyncTest('IR-03: Large integer', async () => {
  const largeInt = 9007199254740991; // Number.MAX_SAFE_INTEGER
  const id = await db.typedItems.insert({ name: 'Large Int', quantity: largeInt });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.quantity, largeInt, 'Large integer should be preserved');
});

await asyncTest('IR-04: Negative numbers', async () => {
  const id = await db.typedItems.insert({ name: 'Negative', count: -100, price: -50.5 });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.count, -100);
  assertEquals(item.price, -50.5);
});

await asyncTest('IR-05: Zero values', async () => {
  const id = await db.typedItems.insert({ name: 'Zero', count: 0, price: 0.0 });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.count, 0);
  assertEquals(item.price, 0);
});

await asyncTest('IR-06: Float precision', async () => {
  const precise = 3.141592653589793;
  const id = await db.typedItems.insert({ name: 'Precise', price: precise });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.price, precise, 'Float precision should be maintained');
});

await asyncTest('IR-07: Null integer/real', async () => {
  const id = await db.typedItems.insert({ name: 'Null Numbers', quantity: null, price: null });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.quantity, null);
  assertEquals(item.price, null);
});

// ============================================
// NULL HANDLING
// ============================================
console.log('\n=== NULL HANDLING ===\n');

await asyncTest('NU-01: Explicit null stored', async () => {
  const id = await db.typedItems.insert({
    name: 'All Nulls',
    flagNullable: null,
    quantity: null,
    price: null,
    updatedAt: null,
    metadata: null,
    data: null
  });
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.flagNullable, null);
  assertEquals(item.quantity, null);
  assertEquals(item.price, null);
  assertEquals(item.updatedAt, null);
  assertEquals(item.metadata, null);
  assertEquals(item.data, null);
});

await asyncTest('NU-02: Query for null values', async () => {
  const items = await db.typedItems.many({ quantity: null });
  assert(items.length > 0, 'Should find items with null quantity');
  items.forEach(item => {
    assertEquals(item.quantity, null);
  });
});

await asyncTest('NU-03: Update to null', async () => {
  const id = await db.typedItems.insert({ name: 'To Null', quantity: 100, price: 50.0 });
  
  await db.typedItems.update({
    where: { id },
    set: { quantity: null, price: null }
  });
  
  const item = await db.typedItems.get({ id });
  assertEquals(item.quantity, null);
  assertEquals(item.price, null);
});

await asyncTest('NU-04: Update from null', async () => {
  const id = await db.typedItems.insert({ name: 'From Null', quantity: null });
  
  await db.typedItems.update({
    where: { id },
    set: { quantity: 999 }
  });
  
  const item = await db.typedItems.get({ id });
  assertEquals(item.quantity, 999);
});

await asyncTest('NU-05: NOT null query', async () => {
  await db.typedItems.insert({ name: 'Has Qty', quantity: 50 });
  
  const items = await db.typedItems.many({ quantity: c => c.not(null) });
  assert(items.length > 0, 'Should find items with non-null quantity');
  items.forEach(item => {
    assert(item.quantity !== null, 'Should not have null quantity');
  });
});

// ============================================
// MIXED TYPE OPERATIONS
// ============================================
console.log('\n=== MIXED TYPE OPERATIONS ===\n');

await asyncTest('MX-01: Insert with all types at once', async () => {
  const id = await db.typedItems.insert({
    name: 'Full Record',
    active: true,
    disabled: false,
    flagNullable: true,
    count: 100,
    quantity: 50,
    price: 29.99,
    rating: 4.5,
    updatedAt: new Date('2025-06-15'),
    scheduledFor: new Date('2025-12-25'),
    metadata: { key: 'value' },
    tags: ['a', 'b', 'c'],
    data: Buffer.from('binary'),
    thumbnail: Buffer.from('thumb')
  });
  
  const item = await db.typedItems.get({ id });
  
  assertEquals(item.name, 'Full Record');
  assertEquals(item.active, true);
  assertEquals(item.disabled, false);
  assertEquals(item.flagNullable, true);
  assertEquals(item.count, 100);
  assertEquals(item.quantity, 50);
  assertEquals(item.price, 29.99);
  assertEquals(item.rating, 4.5);
  assert(item.updatedAt instanceof Date);
  assert(item.scheduledFor instanceof Date);
  assertDeepEquals(item.metadata, { key: 'value' });
  assertDeepEquals(item.tags, ['a', 'b', 'c']);
  assert(Buffer.isBuffer(item.data));
  assert(Buffer.isBuffer(item.thumbnail));
});

await asyncTest('MX-02: Batch retrieval preserves all types', async () => {
  const [items, count] = await db.batch((bx) => [
    bx.typedItems.many({ name: 'Full Record' }),
    bx.typedItems.count()
  ]);
  
  assert(items.length > 0, 'Should find items');
  assert(typeof count === 'number', 'Count should be number');
  
  const item = items[0];
  assertEquals(typeof item.active, 'boolean');
  assert(item.createdAt instanceof Date);
});

await asyncTest('MX-03: Transaction preserves types', async () => {
  const tx = await db.begin();
  try {
    const id = await tx.typedItems.insert({
      name: 'TX Types',
      active: true,
      metadata: { txn: true },
      data: Buffer.from('in-tx')
    });
    
    const item = await tx.typedItems.get({ id });
    assertEquals(item.active, true);
    assertDeepEquals(item.metadata, { txn: true });
    assertEquals(item.data.toString(), 'in-tx');
    
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`Types Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
fs.unlinkSync(TEST_DB);

if (failed > 0) {
  process.exit(1);
}
