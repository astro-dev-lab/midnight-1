/**
 * Transaction Test Suite
 * Phase 2 - Transaction & Batch Operations
 * 
 * Coverage: begin/commit/rollback, batch operations, concurrency
 */

import { SQLiteDatabase, Table } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/transaction-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// Test Schema
class Accounts extends Table {
  name = this.Unique(this.Text);
  balance = this.Default(0);
}

class Transfers extends Table {
  fromAccountId = this.References(Accounts);
  toAccountId = this.References(Accounts);
  amount = this.Int;
  status = this.Default('pending');
}

class Logs extends Table {
  action;
  timestamp = this.Now;
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ Accounts, Transfers, Logs });

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

// ============================================
// BASIC TRANSACTIONS
// ============================================
console.log('=== BASIC TRANSACTIONS ===\n');

await asyncTest('T-01: Begin and commit persists data', async () => {
  const tx = await db.begin();
  try {
    await tx.accounts.insert({ name: 'Alice', balance: 1000 });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  
  // Verify data is persisted
  const alice = await db.accounts.get({ name: 'Alice' });
  assert(alice !== undefined, 'Alice should exist after commit');
  assertEquals(alice.balance, 1000, 'Balance should be 1000');
});

await asyncTest('T-02: Transaction returns tx proxy with table methods', async () => {
  const tx = await db.begin();
  try {
    // Verify tx has table proxies
    assert(typeof tx.accounts === 'object', 'tx.accounts should exist');
    assert(typeof tx.accounts.insert === 'function', 'tx.accounts.insert should be a function');
    assert(typeof tx.accounts.get === 'function', 'tx.accounts.get should be a function');
    assert(typeof tx.accounts.many === 'function', 'tx.accounts.many should be a function');
    assert(typeof tx.commit === 'function', 'tx.commit should be a function');
    assert(typeof tx.rollback === 'function', 'tx.rollback should be a function');
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
});

await asyncTest('T-03: Read within transaction sees uncommitted writes', async () => {
  const tx = await db.begin();
  try {
    await tx.accounts.insert({ name: 'Bob', balance: 500 });
    
    // Read within same transaction should see the insert
    const bob = await tx.accounts.get({ name: 'Bob' });
    assert(bob !== undefined, 'Bob should be visible within transaction');
    assertEquals(bob.balance, 500);
    
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
});

await asyncTest('T-04: Multi-table transaction (atomic success)', async () => {
  const tx = await db.begin();
  try {
    const fromId = await tx.accounts.insert({ name: 'Charlie', balance: 2000 });
    const toId = await tx.accounts.insert({ name: 'Diana', balance: 500 });
    
    // Transfer 300 from Charlie to Diana
    await tx.transfers.insert({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: 300,
      status: 'completed'
    });
    
    await tx.accounts.update({
      where: { id: fromId },
      set: { balance: (c, f) => f.minus(c.balance, 300) }
    });
    
    await tx.accounts.update({
      where: { id: toId },
      set: { balance: (c, f) => f.plus(c.balance, 300) }
    });
    
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  
  // Verify both accounts updated
  const charlie = await db.accounts.get({ name: 'Charlie' });
  const diana = await db.accounts.get({ name: 'Diana' });
  assertEquals(charlie.balance, 1700, 'Charlie should have 1700');
  assertEquals(diana.balance, 800, 'Diana should have 800');
  
  // Verify transfer recorded
  const transfers = await db.transfers.many({ status: 'completed' });
  assert(transfers.length >= 1, 'Should have at least 1 completed transfer');
});

await asyncTest('T-05: Transaction with read operations', async () => {
  const tx = await db.begin();
  try {
    // Read existing data
    const accounts = await tx.accounts.many();
    assert(accounts.length > 0, 'Should read existing accounts');
    
    // Aggregate within transaction
    const count = await tx.accounts.count();
    assert(count > 0, 'Count should work in transaction');
    
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
});

// ============================================
// ROLLBACK SCENARIOS
// ============================================
console.log('\n=== ROLLBACK SCENARIOS ===\n');

await asyncTest('R-01: Explicit rollback discards changes', async () => {
  const countBefore = await db.accounts.count();
  
  const tx = await db.begin();
  await tx.accounts.insert({ name: 'RollbackTest', balance: 999 });
  
  // Verify it exists in transaction
  const inTx = await tx.accounts.get({ name: 'RollbackTest' });
  assert(inTx !== undefined, 'Should exist within transaction');
  
  await tx.rollback();
  
  // Verify not persisted
  const afterRollback = await db.accounts.get({ name: 'RollbackTest' });
  assertEquals(afterRollback, undefined, 'Should not exist after rollback');
  
  const countAfter = await db.accounts.count();
  assertEquals(countAfter, countBefore, 'Count should be unchanged');
});

await asyncTest('R-02: Error with try/catch rollback', async () => {
  const countBefore = await db.accounts.count();
  
  const tx = await db.begin();
  try {
    await tx.accounts.insert({ name: 'WillFail', balance: 100 });
    
    // Simulate application error
    throw new Error('Simulated business logic error');
    
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    // Expected error
  }
  
  // Verify rollback worked
  const willFail = await db.accounts.get({ name: 'WillFail' });
  assertEquals(willFail, undefined, 'Should not exist after error rollback');
  
  const countAfter = await db.accounts.count();
  assertEquals(countAfter, countBefore, 'Count should be unchanged');
});

await asyncTest('R-03: Partial transaction rollback (atomicity)', async () => {
  const countBefore = await db.accounts.count();
  
  const tx = await db.begin();
  try {
    await tx.accounts.insert({ name: 'Partial1', balance: 100 });
    await tx.accounts.insert({ name: 'Partial2', balance: 200 });
    
    // Third insert will "fail" (simulated)
    throw new Error('Third operation failed');
    
    await tx.accounts.insert({ name: 'Partial3', balance: 300 });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
  }
  
  // None of the inserts should exist
  const p1 = await db.accounts.get({ name: 'Partial1' });
  const p2 = await db.accounts.get({ name: 'Partial2' });
  const p3 = await db.accounts.get({ name: 'Partial3' });
  
  assertEquals(p1, undefined, 'Partial1 should not exist');
  assertEquals(p2, undefined, 'Partial2 should not exist');
  assertEquals(p3, undefined, 'Partial3 should not exist');
  
  const countAfter = await db.accounts.count();
  assertEquals(countAfter, countBefore, 'Count should be unchanged');
});

await asyncTest('R-04: Rollback releases lock for new writes', async () => {
  const tx = await db.begin();
  await tx.accounts.insert({ name: 'LockTest', balance: 100 });
  await tx.rollback();
  
  // Should be able to write immediately after rollback
  const id = await db.accounts.insert({ name: 'AfterRollback', balance: 200 });
  assert(id > 0, 'Should be able to insert after rollback');
  
  const account = await db.accounts.get({ id });
  assertEquals(account.name, 'AfterRollback');
});

// ============================================
// BATCH OPERATIONS
// ============================================
console.log('\n=== BATCH OPERATIONS ===\n');

await asyncTest('B-01: Basic batch with multiple reads', async () => {
  // Setup data
  const id1 = await db.accounts.insert({ name: 'Batch1', balance: 100 });
  const id2 = await db.accounts.insert({ name: 'Batch2', balance: 200 });
  
  const [acc1, acc2, count] = await db.batch((bx) => [
    bx.accounts.get({ id: id1 }),
    bx.accounts.get({ id: id2 }),
    bx.accounts.count()
  ]);
  
  assertEquals(acc1.name, 'Batch1');
  assertEquals(acc2.name, 'Batch2');
  assert(count >= 2, 'Count should include batch test accounts');
});

await asyncTest('B-02: Batch with mixed read/write operations', async () => {
  const results = await db.batch((bx) => [
    bx.accounts.insert({ name: 'BatchInsert', balance: 500 }),
    bx.accounts.many({ name: c => c.like('Batch%') })
  ]);
  
  const [insertId, accounts] = results;
  assert(insertId > 0, 'Insert should return ID');
  assert(Array.isArray(accounts), 'Second result should be array');
});

await asyncTest('B-03: Batch returns results in order', async () => {
  await db.accounts.insert({ name: 'Order1', balance: 1 });
  await db.accounts.insert({ name: 'Order2', balance: 2 });
  await db.accounts.insert({ name: 'Order3', balance: 3 });
  
  const [o1, o2, o3] = await db.batch((bx) => [
    bx.accounts.get({ name: 'Order1' }),
    bx.accounts.get({ name: 'Order2' }),
    bx.accounts.get({ name: 'Order3' })
  ]);
  
  assertEquals(o1.balance, 1);
  assertEquals(o2.balance, 2);
  assertEquals(o3.balance, 3);
});

await asyncTest('B-04: Empty batch returns empty array', async () => {
  const results = await db.batch((bx) => []);
  assert(Array.isArray(results), 'Should return array');
  assertEquals(results.length, 0, 'Should be empty array');
});

await asyncTest('B-05: Batch with aggregates', async () => {
  const [count, sum, exists] = await db.batch((bx) => [
    bx.accounts.count(),
    bx.accounts.sum({ column: 'balance' }),
    bx.accounts.exists({ name: 'Alice' })
  ]);
  
  assert(typeof count === 'number', 'Count should be number');
  assert(typeof sum === 'number', 'Sum should be number');
  assertEquals(exists, true, 'Alice should exist');
});

await asyncTest('B-06: Batch is atomic (single transaction)', async () => {
  // Batch operations run in a single transaction
  const countBefore = await db.accounts.count();
  
  try {
    await db.batch((bx) => [
      bx.accounts.insert({ name: 'AtomicBatch1', balance: 100 }),
      bx.accounts.insert({ name: 'AtomicBatch2', balance: 200 })
    ]);
  } catch (e) {
    // If error, both should fail
  }
  
  // Both should succeed together
  const ab1 = await db.accounts.get({ name: 'AtomicBatch1' });
  const ab2 = await db.accounts.get({ name: 'AtomicBatch2' });
  assert(ab1 !== undefined && ab2 !== undefined, 'Both should exist or neither');
});

// ============================================
// CONCURRENCY
// ============================================
console.log('\n=== CONCURRENCY ===\n');

await asyncTest('C-01: Sequential writes succeed', async () => {
  // First write
  const id1 = await db.accounts.insert({ name: 'Seq1', balance: 100 });
  
  // Second write
  const id2 = await db.accounts.insert({ name: 'Seq2', balance: 200 });
  
  // Third write
  const id3 = await db.accounts.insert({ name: 'Seq3', balance: 300 });
  
  assert(id1 > 0 && id2 > 0 && id3 > 0, 'All sequential writes should succeed');
  assert(id1 !== id2 && id2 !== id3, 'All IDs should be unique');
});

await asyncTest('C-02: Read does not block during write transaction', async () => {
  // Start a transaction
  const tx = await db.begin();
  await tx.accounts.insert({ name: 'Blocking', balance: 999 });
  
  // Read on main connection should still work (separate read handle)
  const count = await db.accounts.count();
  assert(typeof count === 'number', 'Read should work during transaction');
  
  await tx.commit();
});

await asyncTest('C-03: Commit releases write lock', async () => {
  const tx = await db.begin();
  await tx.accounts.insert({ name: 'Lock1', balance: 100 });
  await tx.commit();
  
  // Immediate write after commit should work
  const id = await db.accounts.insert({ name: 'Lock2', balance: 200 });
  assert(id > 0, 'Write after commit should succeed');
});

await asyncTest('C-04: Multiple transactions in sequence', async () => {
  // Transaction 1
  const tx1 = await db.begin();
  await tx1.accounts.insert({ name: 'MultiTx1', balance: 100 });
  await tx1.commit();
  
  // Transaction 2
  const tx2 = await db.begin();
  await tx2.accounts.insert({ name: 'MultiTx2', balance: 200 });
  await tx2.commit();
  
  // Transaction 3
  const tx3 = await db.begin();
  await tx3.accounts.insert({ name: 'MultiTx3', balance: 300 });
  await tx3.commit();
  
  // All should exist
  const m1 = await db.accounts.get({ name: 'MultiTx1' });
  const m2 = await db.accounts.get({ name: 'MultiTx2' });
  const m3 = await db.accounts.get({ name: 'MultiTx3' });
  
  assert(m1 && m2 && m3, 'All sequential transactions should succeed');
});

// ============================================
// EDGE CASES
// ============================================
console.log('\n=== EDGE CASES ===\n');

await asyncTest('E-01: Empty transaction commit', async () => {
  const countBefore = await db.accounts.count();
  
  const tx = await db.begin();
  // Do nothing
  await tx.commit();
  
  const countAfter = await db.accounts.count();
  assertEquals(countAfter, countBefore, 'Count should be unchanged');
});

await asyncTest('E-02: Empty transaction rollback', async () => {
  const countBefore = await db.accounts.count();
  
  const tx = await db.begin();
  // Do nothing
  await tx.rollback();
  
  const countAfter = await db.accounts.count();
  assertEquals(countAfter, countBefore, 'Count should be unchanged');
});

await asyncTest('E-03: Update in transaction', async () => {
  const id = await db.accounts.insert({ name: 'UpdateTx', balance: 100 });
  
  const tx = await db.begin();
  await tx.accounts.update({
    where: { id },
    set: { balance: 500 }
  });
  await tx.commit();
  
  const account = await db.accounts.get({ id });
  assertEquals(account.balance, 500, 'Balance should be updated');
});

await asyncTest('E-04: Delete in transaction', async () => {
  const id = await db.accounts.insert({ name: 'DeleteTx', balance: 100 });
  
  const tx = await db.begin();
  await tx.accounts.delete({ id });
  await tx.commit();
  
  const account = await db.accounts.get({ id });
  assertEquals(account, undefined, 'Account should be deleted');
});

await asyncTest('E-05: Upsert in transaction', async () => {
  const tx = await db.begin();
  
  // First upsert - insert
  await tx.accounts.upsert({
    values: { name: 'UpsertTx', balance: 100 },
    target: 'name',
    set: { balance: 999 }
  });
  
  // Second upsert - update
  await tx.accounts.upsert({
    values: { name: 'UpsertTx', balance: 100 },
    target: 'name',
    set: { balance: 200 }
  });
  
  await tx.commit();
  
  const account = await db.accounts.get({ name: 'UpsertTx' });
  assertEquals(account.balance, 200, 'Balance should be from second upsert');
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`Transaction Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
fs.unlinkSync(TEST_DB);

if (failed > 0) {
  process.exit(1);
}
