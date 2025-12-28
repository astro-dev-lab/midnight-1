/**
 * CRUD Test Suite
 * Phase 1 - Core CRUD Operations
 * 
 * Coverage: Insert, Read, Update, Delete, Upsert, Query Operators
 */

import { SQLiteDatabase, Table } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/crud-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// Test Schema
class Items extends Table {
  name;
  status = this.Default('pending');
  count = this.Default(0);
  price = this.Null(this.Real);
  active = this.True;
  optional = this.Null(this.Text);
}

class Categories extends Table {
  name = this.Unique(this.Text);
  description = this.Null(this.Text);
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ Items, Categories });

// Initialize schema
const sql = db.diff();
await db.migrate(sql);
console.log('✓ Schema created\n');

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
// INSERT OPERATIONS
// ============================================
console.log('=== INSERT OPERATIONS ===\n');

await asyncTest('I-01: Basic insert returns integer ID', async () => {
  const id = await db.items.insert({ name: 'Test Item' });
  assert(typeof id === 'number', 'ID should be a number');
  assert(id > 0, 'ID should be positive');
});

await asyncTest('I-02: Insert with all column types', async () => {
  const id = await db.items.insert({
    name: 'Full Item',
    status: 'active',
    count: 10,
    price: 19.99,
    active: false,
    optional: 'extra data'
  });
  const item = await db.items.get({ id });
  assertEquals(item.name, 'Full Item');
  assertEquals(item.status, 'active');
  assertEquals(item.count, 10);
  assertEquals(item.price, 19.99);
  assertEquals(item.active, false);
  assertEquals(item.optional, 'extra data');
});

await asyncTest('I-03: Insert with null on nullable column', async () => {
  const id = await db.items.insert({ name: 'Null Test', optional: null });
  const item = await db.items.get({ id });
  assertEquals(item.optional, null);
});

await asyncTest('I-04: Insert uses default values', async () => {
  const id = await db.items.insert({ name: 'Default Test' });
  const item = await db.items.get({ id });
  assertEquals(item.count, 0, 'count should default to 0');
  assertEquals(item.active, true, 'active should default to true');
});

await asyncTest('I-05: insertMany batch insert', async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({
    name: `Batch Item ${i}`,
    status: 'batch'
  }));
  await db.items.insertMany(items);
  // Verify items were inserted
  const count = await db.items.count({ where: { status: 'batch' } });
  assertEquals(count, 100, 'Should have inserted 100 items');
});

await asyncTest('I-06: insertMany empty array returns undefined', async () => {
  const result = await db.items.insertMany([]);
  assertEquals(result, undefined, 'Empty array should return undefined');
});

await asyncTest('I-07: Insert missing required field throws', async () => {
  let threw = false;
  try {
    await db.items.insert({});
  } catch (e) {
    threw = true;
    assert(e.message.includes('name'), 'Error should mention missing column');
  }
  assert(threw, 'Should throw for missing required field');
});

// ============================================
// READ OPERATIONS
// ============================================
console.log('\n=== READ OPERATIONS ===\n');

// Setup test data for reads
await db.items.insert({ name: 'Read Test 1', status: 'active', count: 5 });
await db.items.insert({ name: 'Read Test 2', status: 'active', count: 10 });
await db.items.insert({ name: 'Read Test 3', status: 'inactive', count: 15 });

await asyncTest('R-01: get by primary key', async () => {
  const item = await db.items.get({ id: 1 });
  assert(item !== undefined, 'Should find item');
  assertEquals(item.id, 1);
});

await asyncTest('R-02: get non-existent returns undefined', async () => {
  const item = await db.items.get({ id: 99999 });
  assert(item === undefined, 'Should return undefined, not null');
});

await asyncTest('R-03: get with single column select returns scalar', async () => {
  const name = await db.items.get({ id: 1 }, 'name');
  assertEquals(typeof name, 'string', 'Should return string, not object');
  assertEquals(name, 'Test Item');
});

await asyncTest('R-04: get with array select returns partial object', async () => {
  const item = await db.items.get({ id: 1 }, ['id', 'name']);
  assert('id' in item, 'Should have id');
  assert('name' in item, 'Should have name');
  assert(!('status' in item), 'Should not have status');
});

await asyncTest('R-05: many with no filter returns all', async () => {
  const items = await db.items.many();
  assert(items.length > 0, 'Should return items');
  assert(Array.isArray(items), 'Should return array');
});

await asyncTest('R-06: many with equality filter', async () => {
  const items = await db.items.many({ status: 'active' });
  assert(items.length > 0, 'Should find active items');
  items.forEach(item => {
    assertEquals(item.status, 'active', 'All items should be active');
  });
});

await asyncTest('R-07: many with IN clause (array value)', async () => {
  const items = await db.items.many({ id: [1, 2, 3] });
  assertEquals(items.length, 3, 'Should find 3 items');
  const ids = items.map(i => i.id).sort((a, b) => a - b);
  assertDeepEquals(ids, [1, 2, 3]);
});

await asyncTest('R-08: many with null check', async () => {
  const items = await db.items.many({ optional: null });
  assert(items.length > 0, 'Should find items with null optional');
  items.forEach(item => {
    assertEquals(item.optional, null, 'All items should have null optional');
  });
});

await asyncTest('R-09: first returns single object', async () => {
  const item = await db.items.first({ orderBy: 'id' });
  assert(item !== undefined, 'Should find item');
  assertEquals(item.id, 1, 'Should be first item');
});

await asyncTest('R-10: first on empty result returns undefined', async () => {
  const item = await db.items.first({ where: { id: 99999 } });
  assert(item === undefined, 'Should return undefined');
});

await asyncTest('R-11: query with select array', async () => {
  const items = await db.items.query({
    select: ['id', 'name'],
    limit: 5
  });
  assert(items.length <= 5, 'Should respect limit');
  items.forEach(item => {
    assert('id' in item && 'name' in item, 'Should have selected columns');
  });
});

await asyncTest('R-12: query with omit', async () => {
  const items = await db.items.query({
    omit: 'optional',
    limit: 5
  });
  items.forEach(item => {
    assert(!('optional' in item), 'Should not have omitted column');
  });
});

// ============================================
// UPDATE OPERATIONS
// ============================================
console.log('\n=== UPDATE OPERATIONS ===\n');

await asyncTest('U-01: Update single row', async () => {
  const changes = await db.items.update({
    where: { id: 1 },
    set: { name: 'Updated Item' }
  });
  assertEquals(changes, 1, 'Should update 1 row');
  const item = await db.items.get({ id: 1 });
  assertEquals(item.name, 'Updated Item');
});

await asyncTest('U-02: Update multiple rows', async () => {
  // First set some items to specific status
  await db.items.update({
    where: { status: 'batch' },
    set: { status: 'updated-batch' }
  });
  const items = await db.items.many({ status: 'updated-batch' });
  assert(items.length > 1, 'Should have updated multiple rows');
});

await asyncTest('U-03: Update with computed function', async () => {
  const before = await db.items.get({ id: 1 });
  const beforeCount = before.count;
  
  await db.items.update({
    where: { id: 1 },
    set: { count: (c, f) => f.plus(c.count, 5) }
  });
  
  const after = await db.items.get({ id: 1 });
  assertEquals(after.count, beforeCount + 5, 'Count should be incremented by 5');
});

await asyncTest('U-04: Update no matches returns 0', async () => {
  const changes = await db.items.update({
    where: { id: 99999 },
    set: { name: 'Ghost' }
  });
  assertEquals(changes, 0, 'Should return 0 for no matches');
});

await asyncTest('U-05: Update to null', async () => {
  await db.items.update({
    where: { id: 1 },
    set: { optional: 'has value' }
  });
  await db.items.update({
    where: { id: 1 },
    set: { optional: null }
  });
  const item = await db.items.get({ id: 1 });
  assertEquals(item.optional, null, 'Should be null after update');
});

await asyncTest('U-06: Update with multiply function', async () => {
  await db.items.update({
    where: { id: 1 },
    set: { count: 10 }
  });
  await db.items.update({
    where: { id: 1 },
    set: { count: (c, f) => f.multiply(c.count, 2) }
  });
  const item = await db.items.get({ id: 1 });
  assertEquals(item.count, 20, 'Count should be doubled');
});

// ============================================
// DELETE OPERATIONS
// ============================================
console.log('\n=== DELETE OPERATIONS ===\n');

await asyncTest('D-01: Delete by ID', async () => {
  const id = await db.items.insert({ name: 'To Delete' });
  const changes = await db.items.delete({ id });
  assertEquals(changes, 1, 'Should delete 1 row');
  const item = await db.items.get({ id });
  assertEquals(item, undefined, 'Item should not exist');
});

await asyncTest('D-02: Delete multiple rows', async () => {
  await db.items.insert({ name: 'Delete Me 1', status: 'to-delete' });
  await db.items.insert({ name: 'Delete Me 2', status: 'to-delete' });
  await db.items.insert({ name: 'Delete Me 3', status: 'to-delete' });
  
  const changes = await db.items.delete({ status: 'to-delete' });
  assertEquals(changes, 3, 'Should delete 3 rows');
});

await asyncTest('D-03: Delete non-existent returns 0', async () => {
  const changes = await db.items.delete({ id: 99999 });
  assertEquals(changes, 0, 'Should return 0 for no matches');
});

await asyncTest('D-04: Delete with IN clause', async () => {
  const id1 = await db.items.insert({ name: 'Delete IN 1' });
  const id2 = await db.items.insert({ name: 'Delete IN 2' });
  
  const changes = await db.items.delete({ id: [id1, id2] });
  assertEquals(changes, 2, 'Should delete 2 rows');
});

// ============================================
// UPSERT OPERATIONS
// ============================================
console.log('\n=== UPSERT OPERATIONS ===\n');

await asyncTest('UP-01: Upsert insert path (new row)', async () => {
  const id = await db.categories.upsert({
    values: { name: 'Electronics', description: 'Electronic devices' },
    target: 'name'
  });
  assert(id > 0, 'Should return ID');
  const cat = await db.categories.get({ id });
  assertEquals(cat.name, 'Electronics');
});

await asyncTest('UP-02: Upsert update path (existing row)', async () => {
  const id = await db.categories.upsert({
    values: { name: 'Electronics', description: 'Updated description' },
    target: 'name',
    set: { description: 'Updated description' }
  });
  const cat = await db.categories.get({ name: 'Electronics' });
  assertEquals(cat.description, 'Updated description');
});

await asyncTest('UP-03: Upsert do nothing (no set)', async () => {
  // Get current state
  const before = await db.categories.get({ name: 'Electronics' });
  assert(before !== undefined, 'Electronics should exist from UP-01');
  
  await db.categories.upsert({
    values: { name: 'Electronics', description: 'Should not change' },
    target: 'name'
    // No set - do nothing on conflict
  });
  
  const after = await db.categories.get({ name: 'Electronics' });
  assertEquals(after.description, before.description, 'Should not change');
});

await asyncTest('UP-04: Upsert with different target column', async () => {
  const id = await db.categories.upsert({
    values: { name: 'Books', description: 'Reading materials' },
    target: 'name',
    set: { description: 'Updated books' }
  });
  assert(id > 0, 'Should return ID');
});

// ============================================
// QUERY OPERATORS
// ============================================
console.log('\n=== QUERY OPERATORS ===\n');

// Setup data for operator tests
await db.items.insert({ name: 'Op Test 1', count: 5, price: 10.00 });
await db.items.insert({ name: 'Op Test 2', count: 15, price: 50.00 });
await db.items.insert({ name: 'Op Test 3', count: 25, price: 100.00 });
await db.items.insert({ name: 'Wolf Item', count: 30, price: 150.00 });
await db.items.insert({ name: 'Gray Wolf', count: 35, price: 200.00 });

await asyncTest('Q-01: Greater than (gt)', async () => {
  const items = await db.items.many({ count: c => c.gt(20) });
  assert(items.length > 0, 'Should find items');
  items.forEach(item => {
    assert(item.count > 20, `Count ${item.count} should be > 20`);
  });
});

await asyncTest('Q-02: Less than or equal (lte)', async () => {
  const items = await db.items.many({ price: c => c.lte(50) });
  assert(items.length > 0, 'Should find items');
  items.forEach(item => {
    assert(item.price <= 50, `Price ${item.price} should be <= 50`);
  });
});

await asyncTest('Q-03: Greater than or equal (gte)', async () => {
  const items = await db.items.many({ count: c => c.gte(25) });
  items.forEach(item => {
    assert(item.count >= 25, `Count ${item.count} should be >= 25`);
  });
});

await asyncTest('Q-04: Less than (lt)', async () => {
  const items = await db.items.many({ count: c => c.lt(10) });
  items.forEach(item => {
    assert(item.count < 10, `Count ${item.count} should be < 10`);
  });
});

await asyncTest('Q-05: LIKE pattern matching', async () => {
  const items = await db.items.many({ name: c => c.like('%Wolf%') });
  assert(items.length >= 2, 'Should find Wolf items');
  items.forEach(item => {
    assert(item.name.includes('Wolf'), `Name should contain Wolf`);
  });
});

await asyncTest('Q-06: NOT IN array', async () => {
  const excluded = [1, 2, 3];
  const items = await db.items.many({ id: c => c.not(excluded) });
  items.forEach(item => {
    assert(!excluded.includes(item.id), `ID ${item.id} should not be in excluded list`);
  });
});

await asyncTest('Q-07: OR conditions', async () => {
  const items = await db.items.query({
    where: {
      or: [
        { count: c => c.lt(10) },
        { count: c => c.gt(30) }
      ]
    }
  });
  items.forEach(item => {
    assert(item.count < 10 || item.count > 30, `Count should be <10 or >30`);
  });
});

await asyncTest('Q-08: AND conditions', async () => {
  const items = await db.items.query({
    where: {
      and: [
        { count: c => c.gte(10) },
        { count: c => c.lte(30) }
      ]
    }
  });
  items.forEach(item => {
    assert(item.count >= 10 && item.count <= 30, `Count should be between 10-30`);
  });
});

await asyncTest('Q-09: Nested AND/OR', async () => {
  const items = await db.items.query({
    where: {
      or: [
        { name: c => c.like('%Wolf%') },
        {
          and: [
            { count: c => c.gte(5) },
            { count: c => c.lte(15) }
          ]
        }
      ]
    }
  });
  assert(items.length > 0, 'Should find items with complex condition');
});

await asyncTest('Q-10: orderBy ascending', async () => {
  const items = await db.items.query({
    where: { name: c => c.like('Op Test%') },
    orderBy: 'count'
  });
  for (let i = 1; i < items.length; i++) {
    assert(items[i].count >= items[i - 1].count, 'Should be ascending');
  }
});

await asyncTest('Q-11: orderBy descending', async () => {
  const items = await db.items.query({
    where: { name: c => c.like('Op Test%') },
    orderBy: 'count',
    desc: true
  });
  for (let i = 1; i < items.length; i++) {
    assert(items[i].count <= items[i - 1].count, 'Should be descending');
  }
});

await asyncTest('Q-12: limit and offset', async () => {
  const page1 = await db.items.query({ orderBy: 'id', limit: 5 });
  const page2 = await db.items.query({ orderBy: 'id', limit: 5, offset: 5 });
  
  assertEquals(page1.length, 5, 'Page 1 should have 5 items');
  assert(page1[0].id !== page2[0]?.id, 'Pages should have different items');
});

await asyncTest('Q-13: distinct select', async () => {
  // Insert some items with duplicate statuses to ensure we have data
  await db.items.insert({ name: 'Distinct 1', status: 'status-a' });
  await db.items.insert({ name: 'Distinct 2', status: 'status-a' });
  await db.items.insert({ name: 'Distinct 3', status: 'status-b' });
  
  const statuses = await db.items.query({
    select: ['status'],
    distinct: true,
    where: { status: c => c.like('status-%') }
  });
  // With distinct, we should get unique status values
  assertEquals(statuses.length, 2, 'Should have 2 distinct statuses');
});

// ============================================
// AGGREGATE FUNCTIONS
// ============================================
console.log('\n=== AGGREGATE FUNCTIONS ===\n');

await asyncTest('A-01: count all', async () => {
  const count = await db.items.count();
  assert(typeof count === 'number', 'Count should be number');
  assert(count > 0, 'Should have items');
});

await asyncTest('A-02: count with where', async () => {
  const count = await db.items.count({ where: { status: 'active' } });
  assert(typeof count === 'number', 'Count should be number');
});

await asyncTest('A-03: exists true', async () => {
  const exists = await db.items.exists({ id: 1 });
  assertEquals(exists, true, 'Should exist');
});

await asyncTest('A-04: exists false', async () => {
  // Use a definitely non-existent ID
  const maxId = await db.items.max({ column: 'id' });
  const nonExistentId = (maxId || 0) + 100000;
  const exists = await db.items.exists({ id: nonExistentId });
  assertEquals(exists, false, 'Should not exist');
});

await asyncTest('A-05: sum', async () => {
  const total = await db.items.sum({ column: 'count' });
  assert(typeof total === 'number', 'Sum should be number');
  assert(total > 0, 'Sum should be positive');
});

await asyncTest('A-06: avg', async () => {
  const avg = await db.items.avg({ column: 'count' });
  assert(typeof avg === 'number', 'Avg should be number');
});

await asyncTest('A-07: min', async () => {
  const min = await db.items.min({ column: 'count' });
  assert(typeof min === 'number', 'Min should be number');
});

await asyncTest('A-08: max', async () => {
  const max = await db.items.max({ column: 'count' });
  assert(typeof max === 'number', 'Max should be number');
  assert(max >= 35, 'Max should be at least 35');
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`CRUD Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
fs.unlinkSync(TEST_DB);

if (failed > 0) {
  process.exit(1);
}
