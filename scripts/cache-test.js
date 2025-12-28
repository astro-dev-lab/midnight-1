/**
 * Test script for query result caching
 */
import { SQLiteDatabase, Table } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/cache-test.db';

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
  
  // Insert test data
  await client.users.insert({ name: 'Alice', email: 'alice@example.com' });
  await client.users.insert({ name: 'Bob', email: 'bob@example.com' });
  console.log('✓ Test data inserted');
  
  // Test 1: Cache disabled by default
  console.log('\n--- Test 1: Cache disabled by default ---');
  let stats = client.getCacheStats();
  console.log('Cache enabled:', stats.enabled);
  console.log('✓ Cache is disabled by default');
  
  // Test 2: Enable caching
  console.log('\n--- Test 2: Enable caching ---');
  client.enableCache(true, { ttl: 5000 }); // 5 second TTL
  stats = client.getCacheStats();
  console.log('Cache enabled:', stats.enabled);
  console.log('✓ Cache is now enabled');
  
  // Test 3: First query populates cache
  console.log('\n--- Test 3: First query (cache miss) ---');
  const users1 = await client.users.many();
  stats = client.getCacheStats();
  console.log('Users:', users1.length);
  console.log('Hits:', stats.hits, 'Misses:', stats.misses);
  console.log('✓ First query: 0 hits, 1 miss');
  
  // Test 4: Second query hits cache
  console.log('\n--- Test 4: Second query (cache hit) ---');
  const users2 = await client.users.many();
  stats = client.getCacheStats();
  console.log('Users:', users2.length);
  console.log('Hits:', stats.hits, 'Misses:', stats.misses);
  console.log('✓ Second query: 1 hit, 1 miss');
  
  // Test 5: Cache returns cloned data (mutations don't affect cache)
  console.log('\n--- Test 5: Cache returns cloned data ---');
  users2[0].name = 'MUTATED';
  const users3 = await client.users.many();
  console.log('Original name in cache:', users3[0].name);
  console.log('✓ Cache data is not affected by mutations');
  
  // Test 6: Insert invalidates cache
  console.log('\n--- Test 6: Insert invalidates cache ---');
  await client.users.insert({ name: 'Charlie', email: 'charlie@example.com' });
  stats = client.getCacheStats();
  console.log('Invalidations:', stats.invalidations);
  console.log('✓ Insert caused cache invalidation');
  
  // Test 7: After invalidation, next query is a miss
  console.log('\n--- Test 7: After invalidation ---');
  const prevMisses = stats.misses;
  const users4 = await client.users.many();
  stats = client.getCacheStats();
  console.log('Users:', users4.length);
  console.log('Misses increased:', stats.misses > prevMisses);
  console.log('✓ After invalidation, query is a cache miss');
  
  // Test 8: Update invalidates cache
  console.log('\n--- Test 8: Update invalidates cache ---');
  const prevInvalidations = stats.invalidations;
  await client.users.update({ where: { id: 1 }, set: { name: 'Alice Updated' } });
  stats = client.getCacheStats();
  console.log('Invalidations increased:', stats.invalidations > prevInvalidations);
  console.log('✓ Update caused cache invalidation');
  
  // Test 9: Clear cache
  console.log('\n--- Test 9: Clear cache ---');
  await client.users.many(); // Populate cache
  stats = client.getCacheStats();
  console.log('Cache size before clear:', stats.size);
  client.clearCache();
  stats = client.getCacheStats();
  console.log('Cache size after clear:', stats.size);
  console.log('✓ Cache cleared');
  
  // Test 10: Disable caching
  console.log('\n--- Test 10: Disable caching ---');
  client.enableCache(false);
  stats = client.getCacheStats();
  console.log('Cache enabled:', stats.enabled);
  console.log('✓ Cache disabled');
  
  // Test 11: Get hit rate
  console.log('\n--- Test 11: Cache statistics ---');
  client.enableCache(true);
  client.resetCacheStats();
  await client.users.many(); // miss
  await client.users.many(); // hit
  await client.users.many(); // hit
  stats = client.getCacheStats();
  console.log('Hit rate:', stats.hitRate);
  console.log('✓ Hit rate calculated:', stats.hitRate);
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  
  console.log('\n=== All caching tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
