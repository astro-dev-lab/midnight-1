/**
 * Phase 9 - Error Handling, Edge Cases & Validation
 * 
 * Coverage: Error conditions, boundary values, null handling,
 * empty results, concurrent operations, invalid inputs
 */

import { Table, SoftDeleteTable, SQLiteDatabase } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/test-edge-cases.db';

// Test utilities
let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const assertThrows = async (fn, expectedError, message) => {
  try {
    await fn();
    throw new Error(`${message}: Expected error but none thrown`);
  } catch (error) {
    if (expectedError && !error.message.includes(expectedError)) {
      throw new Error(`${message}: Expected error containing "${expectedError}", got "${error.message}"`);
    }
  }
};

const asyncTest = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
};

// ============================================
// NULL AND UNDEFINED HANDLING
// ============================================
console.log('\n=== NULL AND UNDEFINED HANDLING ===\n');

await asyncTest('NULL-01: Insert with null values in nullable column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    description = this.Null(this.Text);
    quantity = this.Null(this.Int);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const item = await db.items.insert({ name: 'Test', description: null, quantity: null });
  assert(item !== undefined, 'Should insert with null values');
  
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.description, null, 'Description should be null');
  assertEquals(fetched.quantity, null, 'Quantity should be null');
  
  await database.close();
});

await asyncTest('NULL-02: Query where column is null', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    category = this.Null(this.Text);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'With Category', category: 'tools' });
  await db.items.insert({ name: 'No Category', category: null });
  
  const withNull = await db.items.many({ category: null });
  assertEquals(withNull.length, 1, 'Should find 1 item with null category');
  assertEquals(withNull[0].name, 'No Category', 'Should be correct item');
  
  await database.close();
});

await asyncTest('NULL-03: Update sets column to null', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status = this.Null(this.Text);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test', status: 'active' });
  await db.items.update({ where: { name: 'Test' }, set: { status: null } });
  
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.status, null, 'Status should be updated to null');
  
  await database.close();
});

await asyncTest('NULL-04: coalesce handles null values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    category;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test', category: 'tools' });
  
  const results = await db.query(c => ({
    select: {
      name: c.items.name,
      value: c.coalesce(c.items.category, 'unknown')
    }
  }));
  
  assertEquals(results[0].value, 'tools', 'Should use actual value when not null');
  
  await database.close();
});

// ============================================
// EMPTY RESULT HANDLING
// ============================================
console.log('\n=== EMPTY RESULT HANDLING ===\n');

await asyncTest('EMPTY-01: get() returns undefined for no match', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const result = await db.items.get({ name: 'nonexistent' });
  assertEquals(result, undefined, 'Should return undefined for no match');
  
  await database.close();
});

await asyncTest('EMPTY-02: many() returns empty array for no matches', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const results = await db.items.many({ name: 'nonexistent' });
  assert(Array.isArray(results), 'Should return array');
  assertEquals(results.length, 0, 'Should be empty array');
  
  await database.close();
});

await asyncTest('EMPTY-03: first() returns undefined for no match', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const result = await db.items.first({ name: 'nonexistent' });
  assertEquals(result, undefined, 'Should return undefined for no match');
  
  await database.close();
});

await asyncTest('EMPTY-04: count() returns 0 for empty table', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const count = await db.items.count();
  assertEquals(count, 0, 'Should return 0 for empty table');
  
  await database.close();
});

await asyncTest('EMPTY-05: exists() returns false for no match', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const exists = await db.items.exists({ name: 'nonexistent' });
  assertEquals(exists, false, 'Should return false for no match');
  
  await database.close();
});

await asyncTest('EMPTY-06: update() returns 0 for no matches', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const updated = await db.items.update({ 
    where: { name: 'nonexistent' }, 
    set: { status: 'updated' } 
  });
  assertEquals(updated, 0, 'Should return 0 for no matches');
  
  await database.close();
});

await asyncTest('EMPTY-07: delete() returns 0 for no matches', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const deleted = await db.items.delete({ name: 'nonexistent' });
  assertEquals(deleted, 0, 'Should return 0 for no matches');
  
  await database.close();
});

await asyncTest('EMPTY-08: insertMany with empty array', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const result = await db.items.insertMany([]);
  assertEquals(result, undefined, 'Should return undefined for empty array');
  
  await database.close();
});

// ============================================
// BOUNDARY VALUES
// ============================================
console.log('\n=== BOUNDARY VALUES ===\n');

await asyncTest('BOUND-01: Large integer values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Numbers extends Table {
    name;
    value = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Numbers });
  await db.migrate(db.diff());
  
  const large = 9007199254740991; // MAX_SAFE_INTEGER
  await db.numbers.insert({ name: 'Large', value: large });
  
  const fetched = await db.numbers.get({ name: 'Large' });
  assertEquals(fetched.value, large, 'Should handle MAX_SAFE_INTEGER');
  
  await database.close();
});

await asyncTest('BOUND-02: Negative integer values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Numbers extends Table {
    name;
    value = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Numbers });
  await db.migrate(db.diff());
  
  await db.numbers.insert({ name: 'Negative', value: -999999 });
  
  const fetched = await db.numbers.get({ name: 'Negative' });
  assertEquals(fetched.value, -999999, 'Should handle negative integers');
  
  await database.close();
});

await asyncTest('BOUND-03: Zero values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Numbers extends Table {
    name;
    intVal = this.Int;
    realVal = this.Real;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Numbers });
  await db.migrate(db.diff());
  
  await db.numbers.insert({ name: 'Zero', intVal: 0, realVal: 0.0 });
  
  const fetched = await db.numbers.get({ name: 'Zero' });
  assertEquals(fetched.intVal, 0, 'Should handle zero integer');
  assertEquals(fetched.realVal, 0, 'Should handle zero real');
  
  await database.close();
});

await asyncTest('BOUND-04: Very small decimal values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Numbers extends Table {
    name;
    value = this.Real;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Numbers });
  await db.migrate(db.diff());
  
  const small = 0.00000001;
  await db.numbers.insert({ name: 'Small', value: small });
  
  const fetched = await db.numbers.get({ name: 'Small' });
  assert(Math.abs(fetched.value - small) < 0.0000001, 'Should handle very small decimals');
  
  await database.close();
});

await asyncTest('BOUND-05: Empty string values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    description;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Empty', description: '' });
  
  const fetched = await db.items.get({ name: 'Empty' });
  assertEquals(fetched.description, '', 'Should handle empty string');
  
  await database.close();
});

await asyncTest('BOUND-06: Very long string values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    content;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const longString = 'x'.repeat(10000);
  await db.items.insert({ name: 'Long', content: longString });
  
  const fetched = await db.items.get({ name: 'Long' });
  assertEquals(fetched.content.length, 10000, 'Should handle 10k char string');
  
  await database.close();
});

await asyncTest('BOUND-07: Unicode and special characters', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    content;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const unicode = '日本語 🎉 émojis café naïve';
  await db.items.insert({ name: 'Unicode', content: unicode });
  
  const fetched = await db.items.get({ name: 'Unicode' });
  assertEquals(fetched.content, unicode, 'Should handle unicode');
  
  await database.close();
});

await asyncTest('BOUND-08: SQL injection attempt in string', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    description;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const injection = "'; DROP TABLE items; --";
  await db.items.insert({ name: 'Injection', description: injection });
  
  const fetched = await db.items.get({ name: 'Injection' });
  assertEquals(fetched.description, injection, 'Should escape SQL injection');
  
  // Table should still exist
  const count = await db.items.count();
  assertEquals(count, 1, 'Table should not be dropped');
  
  await database.close();
});

// ============================================
// SOFT DELETE OPERATIONS
// ============================================
console.log('\n=== SOFT DELETE OPERATIONS ===\n');

await asyncTest('SD-01: Basic soft delete marks as deleted', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
    content;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Test', content: 'Content' });
  const beforeDelete = await db.posts.count();
  assertEquals(beforeDelete, 1, 'Should have 1 post');
  
  await db.posts.softDelete({ title: 'Test' });
  const afterDelete = await db.posts.count();
  assertEquals(afterDelete, 0, 'Should have 0 visible posts');
  
  await database.close();
});

await asyncTest('SD-02: many() excludes soft deleted by default', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Active' });
  await db.posts.insert({ title: 'ToDelete' });
  await db.posts.softDelete({ title: 'ToDelete' });
  
  const posts = await db.posts.many();
  assertEquals(posts.length, 1, 'Should only return active posts');
  assertEquals(posts[0].title, 'Active', 'Should be the active post');
  
  await database.close();
});

await asyncTest('SD-03: withDeleted() includes soft deleted', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Active' });
  await db.posts.insert({ title: 'Deleted' });
  await db.posts.softDelete({ title: 'Deleted' });
  
  const allPosts = await db.posts.withDeleted();
  assertEquals(allPosts.length, 2, 'Should return all posts');
  
  await database.close();
});

await asyncTest('SD-04: onlyDeleted() returns only deleted', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Active' });
  await db.posts.insert({ title: 'Deleted' });
  await db.posts.softDelete({ title: 'Deleted' });
  
  const deletedOnly = await db.posts.onlyDeleted();
  assertEquals(deletedOnly.length, 1, 'Should return only deleted posts');
  assertEquals(deletedOnly[0].title, 'Deleted', 'Should be the deleted post');
  
  await database.close();
});

await asyncTest('SD-05: restore() brings back soft deleted record', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Test' });
  await db.posts.softDelete({ title: 'Test' });
  
  const beforeRestore = await db.posts.count();
  assertEquals(beforeRestore, 0, 'Should be 0 before restore');
  
  await db.posts.restore({ title: 'Test' });
  
  const afterRestore = await db.posts.count();
  assertEquals(afterRestore, 1, 'Should be 1 after restore');
  
  await database.close();
});

await asyncTest('SD-06: hardDelete permanently removes record', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends SoftDeleteTable {
    title;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts });
  await db.migrate(db.diff());
  
  await db.posts.insert({ title: 'Test' });
  await db.posts.softDelete({ title: 'Test' });
  
  // Hard delete the soft-deleted record
  await db.posts.delete({ title: 'Test' });
  
  const allPosts = await db.posts.withDeleted();
  assertEquals(allPosts.length, 0, 'Should be permanently deleted');
  
  await database.close();
});

// ============================================
// DEFAULT VALUES
// ============================================
console.log('\n=== DEFAULT VALUES ===\n');

await asyncTest('DEF-01: Default string value applied', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status = this.Default('pending');
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test' });
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.status, 'pending', 'Should apply default value');
  
  await database.close();
});

await asyncTest('DEF-02: Default integer value applied', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    quantity = this.Default(0);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test' });
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.quantity, 0, 'Should apply default integer');
  
  await database.close();
});

await asyncTest('DEF-03: Default boolean value (True)', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    active = this.True;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test' });
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.active, true, 'Should default to true');
  
  await database.close();
});

await asyncTest('DEF-04: Default boolean value (False)', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    deleted = this.False;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test' });
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.deleted, false, 'Should default to false');
  
  await database.close();
});

await asyncTest('DEF-05: Now default for timestamps', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    createdAt = this.Now;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  const before = new Date();
  await db.items.insert({ name: 'Test' });
  const after = new Date();
  
  const fetched = await db.items.get({ name: 'Test' });
  assert(fetched.createdAt instanceof Date, 'Should be Date object');
  assert(fetched.createdAt >= new Date(before.getTime() - 1000), 'Should be recent');
  assert(fetched.createdAt <= new Date(after.getTime() + 1000), 'Should not be future');
  
  await database.close();
});

await asyncTest('DEF-06: Explicit value overrides default', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status = this.Default('pending');
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insert({ name: 'Test', status: 'active' });
  const fetched = await db.items.get({ name: 'Test' });
  assertEquals(fetched.status, 'active', 'Explicit value should override default');
  
  await database.close();
});

// ============================================
// UNIQUE CONSTRAINT HANDLING
// ============================================
console.log('\n=== UNIQUE CONSTRAINT HANDLING ===\n');

await asyncTest('UNIQ-01: Unique constraint prevents duplicates', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
    email = this.Unique(this.Text);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  await db.migrate(db.diff());
  
  await db.users.insert({ name: 'User1', email: 'test@example.com' });
  
  await assertThrows(
    () => db.users.insert({ name: 'User2', email: 'test@example.com' }),
    'UNIQUE constraint failed',
    'Should throw on duplicate unique'
  );
  
  await database.close();
});

await asyncTest('UNIQ-02: Insert multiple with different unique values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
    email = this.Unique(this.Text);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  await db.migrate(db.diff());
  
  await db.users.insert({ name: 'User1', email: 'user1@example.com' });
  await db.users.insert({ name: 'User2', email: 'user2@example.com' });
  
  const count = await db.users.count();
  assertEquals(count, 2, 'Should have 2 users with different emails');
  
  await database.close();
});

// ============================================
// FOREIGN KEY HANDLING
// ============================================
console.log('\n=== FOREIGN KEY HANDLING ===\n');

await asyncTest('FK-01: Foreign key prevents orphan insert', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Authors extends Table {
    name;
  }
  
  class Books extends Table {
    title;
    authorId = this.References(Authors);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Authors, Books });
  await db.migrate(db.diff());
  
  await assertThrows(
    () => db.books.insert({ title: 'Test Book', authorId: 999 }),
    'FOREIGN KEY constraint failed',
    'Should throw on invalid FK'
  );
  
  await database.close();
});

await asyncTest('FK-02: Valid foreign key insert succeeds', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Authors extends Table {
    name;
  }
  
  class Books extends Table {
    title;
    authorId = this.References(Authors);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Authors, Books });
  await db.migrate(db.diff());
  
  await db.authors.insert({ name: 'Author' });
  const author = await db.authors.get({ name: 'Author' });
  
  await db.books.insert({ title: 'Book', authorId: author.id });
  const book = await db.books.get({ title: 'Book' });
  assertEquals(book.authorId, author.id, 'Should have correct FK');
  
  await database.close();
});

await asyncTest('FK-03: Cascade delete removes related records', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Authors extends Table {
    name;
  }
  
  class Books extends Table {
    title;
    authorId = this.Cascade(Authors);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Authors, Books });
  await db.migrate(db.diff());
  
  await db.authors.insert({ name: 'Author' });
  const author = await db.authors.get({ name: 'Author' });
  await db.books.insert({ title: 'Book1', authorId: author.id });
  await db.books.insert({ title: 'Book2', authorId: author.id });
  
  const beforeDelete = await db.books.count();
  assertEquals(beforeDelete, 2, 'Should have 2 books');
  
  await db.authors.delete({ id: author.id });
  
  const afterDelete = await db.books.count();
  assertEquals(afterDelete, 0, 'Cascade should delete books');
  
  await database.close();
});

// ============================================
// QUERY OPERATORS
// ============================================
console.log('\n=== QUERY OPERATORS ===\n');

await asyncTest('OP-01: like operator with wildcards', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'Apple' },
    { name: 'Apricot' },
    { name: 'Banana' }
  ]);
  
  const results = await db.items.many({ name: c => c.like('Ap%') });
  assertEquals(results.length, 2, 'Should match Apple and Apricot');
  
  await database.close();
});

await asyncTest('OP-02: not operator excludes value', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    category;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'Item1', category: 'A' },
    { name: 'Item2', category: 'B' },
    { name: 'Item3', category: 'A' }
  ]);
  
  const results = await db.items.many({ category: c => c.not('A') });
  assertEquals(results.length, 1, 'Should exclude category A');
  assertEquals(results[0].category, 'B', 'Should be category B');
  
  await database.close();
});

await asyncTest('OP-03: gt and lt operators for range', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    price = this.Real;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'Cheap', price: 10 },
    { name: 'Medium', price: 50 },
    { name: 'Expensive', price: 100 }
  ]);
  
  const results = await db.items.many({ 
    and: [
      { price: c => c.gt(10) },
      { price: c => c.lt(100) }
    ]
  });
  assertEquals(results.length, 1, 'Should find items in range');
  assertEquals(results[0].name, 'Medium', 'Should be Medium item');
  
  await database.close();
});

await asyncTest('OP-04: in operator for multiple values', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'A', status: 'active' },
    { name: 'B', status: 'pending' },
    { name: 'C', status: 'inactive' }
  ]);
  
  const results = await db.items.many({ status: ['active', 'pending'] });
  assertEquals(results.length, 2, 'Should find active and pending');
  
  await database.close();
});

await asyncTest('OP-05: not in operator excludes multiple', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    status;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'A', status: 'active' },
    { name: 'B', status: 'pending' },
    { name: 'C', status: 'inactive' }
  ]);
  
  const results = await db.items.many({ status: c => c.not(['active', 'pending']) });
  assertEquals(results.length, 1, 'Should exclude active and pending');
  assertEquals(results[0].status, 'inactive', 'Should be inactive');
  
  await database.close();
});

// ============================================
// LIMIT AND OFFSET
// ============================================
console.log('\n=== LIMIT AND OFFSET ===\n');

await asyncTest('LIM-01: limit restricts result count', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  for (let i = 0; i < 10; i++) {
    await db.items.insert({ name: `Item ${i}` });
  }
  
  const results = await db.items.query({ limit: 5 });
  assertEquals(results.length, 5, 'Should limit to 5 results');
  
  await database.close();
});

await asyncTest('LIM-02: offset with limit skips initial results', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    seq = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  for (let i = 0; i < 10; i++) {
    await db.items.insert({ name: `Item ${i}`, seq: i });
  }
  
  // Offset requires limit in SQLite
  const results = await db.items.query({ limit: 100, offset: 5, orderBy: 'seq' });
  assertEquals(results.length, 5, 'Should return remaining 5');
  assertEquals(results[0].name, 'Item 5', 'Should start at offset');
  
  await database.close();
});

await asyncTest('LIM-03: limit and offset together for pagination', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    seq = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  for (let i = 0; i < 25; i++) {
    await db.items.insert({ name: `Item ${i}`, seq: i });
  }
  
  const page2 = await db.items.query({ limit: 10, offset: 10, orderBy: 'seq' });
  assertEquals(page2.length, 10, 'Should return 10 for page 2');
  assertEquals(page2[0].name, 'Item 10', 'Should start at item 10');
  assertEquals(page2[9].name, 'Item 19', 'Should end at item 19');
  
  await database.close();
});

await asyncTest('LIM-04: limit 1 for single result', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'First' },
    { name: 'Second' },
    { name: 'Third' }
  ]);
  
  const results = await db.items.query({ limit: 1 });
  assertEquals(results.length, 1, 'Should return only 1');
  
  await database.close();
});

// ============================================
// ORDER BY VARIATIONS
// ============================================
console.log('\n=== ORDER BY VARIATIONS ===\n');

await asyncTest('ORDER-01: Order by ascending', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    value = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'C', value: 30 },
    { name: 'A', value: 10 },
    { name: 'B', value: 20 }
  ]);
  
  const results = await db.items.query({ orderBy: 'value' });
  assertEquals(results[0].name, 'A', 'First should be A');
  assertEquals(results[2].name, 'C', 'Last should be C');
  
  await database.close();
});

await asyncTest('ORDER-02: Order by descending', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
    value = this.Int;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'C', value: 30 },
    { name: 'A', value: 10 },
    { name: 'B', value: 20 }
  ]);
  
  const results = await db.items.query({ orderBy: 'value', desc: true });
  assertEquals(results[0].name, 'C', 'First should be C');
  assertEquals(results[2].name, 'A', 'Last should be A');
  
  await database.close();
});

await asyncTest('ORDER-03: Order by text column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Items extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Items });
  await db.migrate(db.diff());
  
  await db.items.insertMany([
    { name: 'Charlie' },
    { name: 'Alice' },
    { name: 'Bob' }
  ]);
  
  const results = await db.items.query({ orderBy: 'name' });
  assertEquals(results[0].name, 'Alice', 'First alphabetically');
  assertEquals(results[2].name, 'Charlie', 'Last alphabetically');
  
  await database.close();
});

// Cleanup
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

// Summary
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
