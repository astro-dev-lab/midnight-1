/**
 * Test script for database statistics
 */
import { SQLiteDatabase, Table } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/stats-test.db';

// Cleanup before test
if (existsSync(dbPath)) unlinkSync(dbPath);

class Users extends Table {
  name;
  email;
}

const db = new SQLiteDatabase(dbPath);
const client = db.getClient({ Users });

async function test() {
  // Create schema
  const sql = client.diff();
  await client.migrate(sql);
  console.log('✓ Schema created');
  
  // ========================================
  // STATS TESTS
  // ========================================
  console.log('\n=== Database Statistics ===\n');
  
  // Test 1: Initial stats
  console.log('--- Test 1: Initial stats ---');
  let stats = client.getStats();
  console.log('Initial query count:', stats.queries.total);
  console.log('✓ Stats initialized');
  
  // Test 2: Stats after writes
  console.log('\n--- Test 2: Write operations ---');
  await client.users.insert({ name: 'Alice', email: 'alice@example.com' });
  await client.users.insert({ name: 'Bob', email: 'bob@example.com' });
  await client.users.insert({ name: 'Charlie', email: 'charlie@example.com' });
  
  stats = client.getStats();
  console.log('Total queries:', stats.queries.total);
  console.log('Writes:', stats.queries.writes);
  console.log('✓ Write stats tracked');
  
  // Test 3: Stats after reads
  console.log('\n--- Test 3: Read operations ---');
  const prevReads = stats.queries.reads;
  await client.users.many();
  await client.users.get({ id: 1 });
  await client.users.count();
  
  stats = client.getStats();
  console.log('Reads:', stats.queries.reads);
  console.log('Read increase:', stats.queries.reads - prevReads);
  console.log('✓ Read stats tracked');
  
  // Test 4: Average query time
  console.log('\n--- Test 4: Average query time ---');
  stats = client.getStats();
  console.log('Avg query duration:', stats.queries.avgDurationMs, 'ms');
  console.log('✓ Query timing tracked');
  
  // Test 5: Slow query threshold
  console.log('\n--- Test 5: Slow query detection ---');
  client.setSlowQueryThreshold(0.001); // Set very low threshold
  await client.users.many();
  stats = client.getStats();
  console.log('Slow queries:', stats.queries.slowQueries);
  console.log('Slow threshold:', stats.queries.slowThresholdMs, 'ms');
  console.log('✓ Slow queries detected');
  
  // Test 6: Transaction tracking
  console.log('\n--- Test 6: Transaction tracking ---');
  const tx = await client.begin();
  stats = client.getStats();
  console.log('Active transactions during tx:', stats.transactions.active);
  await tx.users.insert({ name: 'Dave', email: 'dave@example.com' });
  await tx.commit();
  stats = client.getStats();
  console.log('Active transactions after commit:', stats.transactions.active);
  console.log('✓ Transaction tracking works');
  
  // Test 7: Writer lock wait tracking
  console.log('\n--- Test 7: Writer lock wait tracking ---');
  stats = client.getStats();
  console.log('Writer lock waits:', stats.writerLock.totalWaits);
  console.log('Avg wait time:', stats.writerLock.avgWaitMs, 'ms');
  console.log('✓ Writer lock stats available');
  
  // Test 8: Cache stats included
  console.log('\n--- Test 8: Cache stats included ---');
  client.enableCache(true);
  await client.users.many(); // miss
  await client.users.many(); // hit
  stats = client.getStats();
  console.log('Cache hits:', stats.cache.hits);
  console.log('Cache misses:', stats.cache.misses);
  console.log('Cache enabled:', stats.cache.enabled);
  console.log('✓ Cache stats included in getStats()');
  
  // Test 9: Error tracking
  console.log('\n--- Test 9: Error tracking ---');
  const prevErrors = stats.queries.errors;
  try {
    await db.run({ query: 'SELECT * FROM nonexistent_table' });
  } catch (e) {
    // Expected error
  }
  stats = client.getStats();
  console.log('Errors:', stats.queries.errors);
  console.log('Error increase:', stats.queries.errors - prevErrors);
  console.log('✓ Error tracking works');
  
  // Test 10: Reset stats
  console.log('\n--- Test 10: Reset stats ---');
  client.resetStats();
  stats = client.getStats();
  console.log('Total queries after reset:', stats.queries.total);
  console.log('Cache hits after reset:', stats.cache.hits);
  console.log('✓ Stats reset successfully');
  
  // Summary
  console.log('\n--- Final Stats Summary ---');
  await client.users.many();
  await client.users.insert({ name: 'Eve', email: 'eve@example.com' });
  stats = client.getStats();
  console.log(JSON.stringify(stats, null, 2));
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  
  console.log('\n=== All stats tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
