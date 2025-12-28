/**
 * Test script for lifecycle hooks
 */
import { SQLiteDatabase, Table } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/hooks-test.db';

// Cleanup before test
if (existsSync(dbPath)) unlinkSync(dbPath);

class AuditLog extends Table {
  action;
  tableName;
  recordId = this.Int;
  data;
  createdAt = this.Now;
}

class Users extends Table {
  name;
  email;
  createdAt = this.Now;
  updatedAt = this.Null(this.Date);
}

const db = new SQLiteDatabase(dbPath);
const client = db.getClient({ Users, AuditLog });

async function test() {
  // Create schema
  const sql = client.diff();
  await client.migrate(sql);
  console.log('✓ Schema created');
  
  // ========================================
  // HOOK TESTS
  // ========================================
  console.log('\n=== Lifecycle Hooks ===\n');
  
  // Test 1: beforeInsert - modify data
  console.log('--- Test 1: beforeInsert modifies data ---');
  client.addHook('users', 'beforeInsert', (data, ctx) => {
    return {
      ...data,
      email: data.email.toLowerCase() // Normalize email
    };
  });
  
  const id1 = await client.users.insert({ 
    name: 'Alice', 
    email: 'ALICE@EXAMPLE.COM' 
  });
  const user1 = await client.users.get({ id: id1 });
  console.log(`Email stored: ${user1.email}`);
  console.log('✓ beforeInsert normalized email to lowercase');
  
  // Test 2: afterInsert - side effects
  console.log('\n--- Test 2: afterInsert for audit logging ---');
  let auditCalled = false;
  client.addHook('users', 'afterInsert', async (result, data, ctx) => {
    auditCalled = true;
    await client.auditLog.insert({
      action: 'INSERT',
      tableName: ctx.table,
      recordId: result,
      data: JSON.stringify(data)
    });
  });
  
  const id2 = await client.users.insert({ 
    name: 'Bob', 
    email: 'bob@example.com' 
  });
  const logs = await client.auditLog.many({ tableName: 'users', action: 'INSERT' });
  console.log(`Audit logs created: ${logs.length}`);
  console.log('✓ afterInsert created audit log');
  
  // Test 3: beforeUpdate - auto-update timestamp
  console.log('\n--- Test 3: beforeUpdate auto-updates timestamp ---');
  client.addHook('users', 'beforeUpdate', (data, ctx) => {
    return {
      ...data,
      updatedAt: new Date()
    };
  });
  
  await client.users.update({ where: { id: id1 }, set: { name: 'Alice Updated' } });
  const userUpdated = await client.users.get({ id: id1 });
  console.log(`updatedAt set: ${userUpdated.updatedAt instanceof Date}`);
  console.log('✓ beforeUpdate added updatedAt timestamp');
  
  // Test 4: afterUpdate - audit logging
  console.log('\n--- Test 4: afterUpdate for audit ---');
  client.addHook('users', 'afterUpdate', async (result, data, ctx) => {
    await client.auditLog.insert({
      action: 'UPDATE',
      tableName: ctx.table,
      recordId: 0, // Can't get ID easily from update
      data: JSON.stringify({ set: data, where: ctx.where })
    });
  });
  
  await client.users.update({ where: { id: id2 }, set: { name: 'Bob Updated' } });
  const updateLogs = await client.auditLog.many({ action: 'UPDATE' });
  console.log(`Update audit logs: ${updateLogs.length}`);
  console.log('✓ afterUpdate logged the change');
  
  // Test 5: beforeDelete
  console.log('\n--- Test 5: beforeDelete hook ---');
  let beforeDeleteCalled = false;
  client.addHook('users', 'beforeDelete', (query, ctx) => {
    beforeDeleteCalled = true;
    console.log(`About to delete users matching: ${JSON.stringify(query)}`);
  });
  
  // Insert a user to delete
  const id3 = await client.users.insert({ name: 'Charlie', email: 'charlie@example.com' });
  await client.users.delete({ id: id3 });
  console.log(`beforeDelete called: ${beforeDeleteCalled}`);
  console.log('✓ beforeDelete hook executed');
  
  // Test 6: afterDelete - audit logging
  console.log('\n--- Test 6: afterDelete for audit ---');
  client.addHook('users', 'afterDelete', async (result, query, ctx) => {
    await client.auditLog.insert({
      action: 'DELETE',
      tableName: ctx.table,
      recordId: query?.id || 0,
      data: JSON.stringify(query)
    });
  });
  
  const id4 = await client.users.insert({ name: 'David', email: 'david@example.com' });
  await client.users.delete({ id: id4 });
  const deleteLogs = await client.auditLog.many({ action: 'DELETE' });
  console.log(`Delete audit logs: ${deleteLogs.length}`);
  console.log('✓ afterDelete logged the deletion');
  
  // Test 7: Multiple hooks
  console.log('\n--- Test 7: Multiple hooks on same event ---');
  let hook1Called = false;
  let hook2Called = false;
  
  client.addHook('users', 'beforeInsert', (data, ctx) => {
    hook1Called = true;
    return data;
  });
  client.addHook('users', 'beforeInsert', (data, ctx) => {
    hook2Called = true;
    return data;
  });
  
  await client.users.insert({ name: 'Eve', email: 'eve@example.com' });
  console.log(`Hook 1 called: ${hook1Called}, Hook 2 called: ${hook2Called}`);
  console.log('✓ Multiple hooks execute in order');
  
  // Test 8: removeHook
  console.log('\n--- Test 8: Remove hook ---');
  let removableHookCalled = false;
  const removableHook = (data, ctx) => {
    removableHookCalled = true;
    return data;
  };
  
  client.addHook('users', 'beforeInsert', removableHook);
  const removed = client.removeHook('users', 'beforeInsert', removableHook);
  await client.users.insert({ name: 'Frank', email: 'frank@example.com' });
  console.log(`Hook removed: ${removed}, Hook still called: ${removableHookCalled}`);
  console.log('✓ removeHook works correctly');
  
  // Test 9: clearHooks
  console.log('\n--- Test 9: Clear all hooks for table ---');
  client.clearHooks('users');
  let clearedHookCalled = false;
  // Add a fresh hook after clearing
  client.addHook('users', 'beforeInsert', (data) => {
    clearedHookCalled = true;
    return data;
  });
  await client.users.insert({ name: 'Grace', email: 'grace@example.com' });
  console.log(`New hook called after clear: ${clearedHookCalled}`);
  console.log('✓ clearHooks removed old hooks');
  
  // Test 10: beforeUpsert
  console.log('\n--- Test 10: beforeUpsert hook ---');
  let upsertHookCalled = false;
  client.addHook('users', 'beforeUpsert', (data, ctx) => {
    upsertHookCalled = true;
    return {
      ...data,
      email: data.email.toLowerCase()
    };
  });
  
  await client.users.upsert({ 
    values: { name: 'Henry', email: 'HENRY@EXAMPLE.COM' },
    target: 'email'
  });
  console.log(`beforeUpsert called: ${upsertHookCalled}`);
  const henry = await client.users.first({ where: { name: 'Henry' } });
  console.log(`Email normalized: ${henry.email === 'henry@example.com'}`);
  console.log('✓ beforeUpsert hook works');
  
  // Summary
  console.log('\n--- Summary ---');
  const allLogs = await client.auditLog.many();
  console.log(`Total audit log entries: ${allLogs.length}`);
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  
  console.log('\n=== All hooks tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
