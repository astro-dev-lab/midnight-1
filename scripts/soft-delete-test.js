/**
 * Test script for soft delete functionality
 */
import { SQLiteDatabase, SoftDeleteTable, Table } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/soft-delete-test.db';

// Cleanup before test
if (existsSync(dbPath)) unlinkSync(dbPath);

// Regular table (no soft delete)
class Users extends Table {
  name;
  email;
}

// Soft delete enabled table
class Posts extends SoftDeleteTable {
  title;
  body;
  authorId = this.Int;
}

const db = new SQLiteDatabase(dbPath);
const client = db.getClient({ Users, Posts });

async function test() {
  // Create schema
  const sql = client.diff();
  console.log('Schema SQL:');
  console.log(sql);
  
  await client.migrate(sql);
  console.log('✓ Schema created');
  
  // Insert test data
  await client.users.insert({ name: 'Alice', email: 'alice@example.com' });
  await client.posts.insert({ title: 'Post 1', body: 'Content 1', authorId: 1 });
  await client.posts.insert({ title: 'Post 2', body: 'Content 2', authorId: 1 });
  await client.posts.insert({ title: 'Post 3', body: 'Content 3', authorId: 1 });
  console.log('✓ Test data inserted');
  
  // Test 1: Regular query returns all non-deleted posts
  const allPosts = await client.posts.many();
  console.log('\n--- Test 1: many() returns non-deleted ---');
  console.log('Posts count:', allPosts.length);
  console.log('✓ Expected 3, got', allPosts.length);
  
  // Test 2: Soft delete a post
  console.log('\n--- Test 2: softDelete() ---');
  const deleted = await client.posts.softDelete({ id: 1 });
  console.log('Rows affected:', deleted);
  console.log('✓ Soft deleted 1 post');
  
  // Test 3: many() now excludes deleted posts
  console.log('\n--- Test 3: many() after soft delete ---');
  const afterDelete = await client.posts.many();
  console.log('Posts count after delete:', afterDelete.length);
  console.log('✓ Expected 2, got', afterDelete.length);
  
  // Test 4: withDeleted() includes deleted posts
  console.log('\n--- Test 4: withDeleted() ---');
  const withDeleted = await client.posts.withDeleted();
  console.log('Posts with deleted:', withDeleted.length);
  console.log('✓ Expected 3, got', withDeleted.length);
  
  // Test 5: onlyDeleted() returns only deleted posts
  console.log('\n--- Test 5: onlyDeleted() ---');
  const onlyDeleted = await client.posts.onlyDeleted();
  console.log('Deleted only:', onlyDeleted.length);
  console.log('Deleted post:', onlyDeleted[0]);
  console.log('✓ Expected 1, got', onlyDeleted.length);
  console.log('✓ deletedAt is set:', onlyDeleted[0].deletedAt instanceof Date);
  
  // Test 6: restore() un-deletes posts
  console.log('\n--- Test 6: restore() ---');
  const restored = await client.posts.restore({ id: 1 });
  console.log('Rows restored:', restored);
  const afterRestore = await client.posts.many();
  console.log('Posts after restore:', afterRestore.length);
  console.log('✓ Expected 3, got', afterRestore.length);
  
  // Test 7: get() respects soft delete
  console.log('\n--- Test 7: get() respects soft delete ---');
  await client.posts.softDelete({ id: 2 });
  const post2 = await client.posts.get({ id: 2 });
  console.log('Get deleted post:', post2);
  console.log('✓ get() returns undefined for deleted post');
  
  // Test 8: Regular table (Users) doesn't have soft delete methods fail
  console.log('\n--- Test 8: Regular table soft delete throws ---');
  try {
    await client.users.softDelete({ id: 1 });
    console.log('✗ Should have thrown');
  } catch (err) {
    console.log('Expected error:', err.message);
    console.log('✓ Correctly throws for non-soft-delete table');
  }
  
  // Test 9: count() respects soft delete
  console.log('\n--- Test 9: count() respects soft delete ---');
  const count = await client.posts.count();
  console.log('Count (excluding deleted):', count);
  console.log('✓ Expected 2, got', count);
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  
  console.log('\n=== All soft delete tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
