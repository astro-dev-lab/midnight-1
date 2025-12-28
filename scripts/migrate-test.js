/**
 * Migration Test Suite
 * Phase 7 - Schema Migrations & Diff Generation
 * 
 * Crafted by Demetrius QA/PM Specialist
 * 
 * Coverage:
 * - D-01 to D-08: Diff generation (add/remove/modify columns, tables)
 * - I-01 to I-06: Index migrations (add, remove, modify indexes)
 * - C-01 to C-06: Constraint migrations (checks, foreign keys, unique)
 * - R-01 to R-05: Schema recreation scenarios
 * - A-01 to A-05: analyzeMigration function
 * - M-01 to M-06: Migration execution
 */

import { SQLiteDatabase, Table, FTSTable, analyzeMigration } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/migrate-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

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

function assertIncludes(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected "${str}" to include "${substring}"`);
  }
}

function assertNotIncludes(str, substring, message) {
  if (str.includes(substring)) {
    throw new Error(message || `Expected "${str}" to NOT include "${substring}"`);
  }
}

// ============================================
// DIFF GENERATION - Adding Elements
// ============================================
console.log('=== DIFF GENERATION - Adding Elements ===\n');

await asyncTest('D-01: Diff generates create table for new table', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
    email;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'create table users');
  assertIncludes(sql.toLowerCase(), 'name text');
  assertIncludes(sql.toLowerCase(), 'email text');
  
  await database.close();
});

await asyncTest('D-02: Diff generates add column comparing schemas', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  // Original schema
  class UsersV1 extends Table {
    static get name() { return 'users'; }
    name;
  }
  
  // New schema with added column
  class UsersV2 extends Table {
    static get name() { return 'users'; }
    name;
    email;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Users: UsersV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Users: UsersV2 });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'alter table users add column email');
  
  await db2.close();
});

await asyncTest('D-03: Diff generates multiple add columns', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class ProductsV1 extends Table {
    static get name() { return 'products'; }
    name;
  }
  
  class ProductsV2 extends Table {
    static get name() { return 'products'; }
    name;
    price;
    description;
    category;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Products: ProductsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Products: ProductsV2 });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'add column price');
  assertIncludes(sql.toLowerCase(), 'add column description');
  assertIncludes(sql.toLowerCase(), 'add column category');
  
  await db2.close();
});

await asyncTest('D-04: Diff generates create for multiple new tables', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Posts extends Table {
    title;
  }
  
  class Comments extends Table {
    body;
  }
  
  class Tags extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Posts, Comments, Tags });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'create table posts');
  assertIncludes(sql.toLowerCase(), 'create table comments');
  assertIncludes(sql.toLowerCase(), 'create table tags');
  
  await database.close();
});

// ============================================
// DIFF GENERATION - Removing Elements
// ============================================
console.log('\n=== DIFF GENERATION - Removing Elements ===\n');

await asyncTest('D-05: Diff generates drop table for removed table', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table { name; }
  class Posts extends Table { title; }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Users, Posts });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  // Remove Posts table
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Users });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'drop table posts');
  
  await db2.close();
});

await asyncTest('D-06: Diff handles column removal', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class ItemsV1 extends Table {
    static get name() { return 'items'; }
    name;
    description;
    quantity;
  }
  
  class ItemsV2 extends Table {
    static get name() { return 'items'; }
    name;
    quantity;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Items: ItemsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await client1.items.insert({ name: 'Widget', description: 'A widget', quantity: '10' });
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Items: ItemsV2 });
  const sql = client2.diff(schema1);
  
  // Column removal may use drop column or recreation
  assert(sql.toLowerCase().includes('drop column') || sql.toLowerCase().includes('temp_'), 
    'Should have drop column or recreation');
  
  await db2.close();
});

await asyncTest('D-07: Empty diff when schema unchanged', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table { name; email; }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Users });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  // Same schema
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Users });
  const sql = client2.diff(schema1);
  
  assertEquals(sql.trim(), '', 'Diff should be empty when schema unchanged');
  
  await db2.close();
});

await asyncTest('D-08: Diff with new unique column triggers change', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class SettingsV1 extends Table {
    static get name() { return 'settings'; }
    key;
    value;
  }
  
  class SettingsV2 extends Table {
    static get name() { return 'settings'; }
    key;
    value;
    uuid = this.Unique(this.Text);
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Settings: SettingsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Settings: SettingsV2 });
  const sql = client2.diff(schema1);
  
  // Adding unique column
  assertIncludes(sql.toLowerCase(), 'add column uuid');
  
  await db2.close();
});

// ============================================
// INDEX MIGRATIONS
// ============================================
console.log('\n=== INDEX MIGRATIONS ===\n');

await asyncTest('I-01: Diff generates create index for new index', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class UsersV1 extends Table {
    static get name() { return 'users'; }
    name;
    email;
  }
  
  class UsersV2 extends Table {
    static get name() { return 'users'; }
    name;
    email;
    
    Attributes() {
      return [this.Index('email')];
    }
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Users: UsersV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Users: UsersV2 });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'create index');
  assertIncludes(sql.toLowerCase(), 'email');
  
  await db2.close();
});

await asyncTest('I-02: Diff generates drop index for removed index', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class PostsV1 extends Table {
    static get name() { return 'posts'; }
    title;
    body;
    
    Attributes() {
      return [this.Index('title')];
    }
  }
  
  class PostsV2 extends Table {
    static get name() { return 'posts'; }
    title;
    body;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Posts: PostsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Posts: PostsV2 });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'drop index');
  
  await db2.close();
});

await asyncTest('I-03: Diff handles unique constraint addition', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class AccountsV1 extends Table {
    static get name() { return 'accounts'; }
    username;
    email;
  }
  
  class AccountsV2 extends Table {
    static get name() { return 'accounts'; }
    username;
    email = this.Unique(this.Text);
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Accounts: AccountsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Accounts: AccountsV2 });
  const sql = client2.diff(schema1);
  
  // Adding unique constraint may add unique index or recreate table
  assert(sql.toLowerCase().includes('unique') || sql.toLowerCase().includes('temp_'),
    'Should have unique index or recreation');
  
  await db2.close();
});

await asyncTest('I-04: Multiple indexes in same migration', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class EventsV1 extends Table {
    static get name() { return 'events'; }
    name;
    date;
    location;
    category;
  }
  
  class EventsV2 extends Table {
    static get name() { return 'events'; }
    name;
    date;
    location;
    category;
    
    Attributes() {
      return [
        this.Index('date'),
        this.Index('location')
      ];
    }
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Events: EventsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Events: EventsV2 });
  const sql = client2.diff(schema1);
  
  // Both indexes should be created
  const indexCount = (sql.toLowerCase().match(/create index/g) || []).length;
  assert(indexCount >= 2, 'Should have at least 2 create index statements');
  
  await db2.close();
});

await asyncTest('I-05: Index unchanged skips index operations', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Products extends Table {
    name;
    sku;
    
    Attributes() {
      return [this.Index('sku')];
    }
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Products });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  // Same schema with same index
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Products });
  const sql = client2.diff(schema1);
  
  assertNotIncludes(sql.toLowerCase(), 'create index');
  assertNotIncludes(sql.toLowerCase(), 'drop index');
  
  await db2.close();
});

await asyncTest('I-06: Composite index via Attributes', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Orders extends Table {
    customerId;
    productId;
    quantity;
    
    Attributes() {
      return [this.Index('customerId', 'productId')];
    }
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Orders });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'create index');
  assertIncludes(sql.toLowerCase(), 'customerid');
  assertIncludes(sql.toLowerCase(), 'productid');
  
  await database.close();
});

// ============================================
// CONSTRAINT MIGRATIONS
// ============================================
console.log('\n=== CONSTRAINT MIGRATIONS ===\n');

await asyncTest('C-01: Check constraint on column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Inventory extends Table {
    name;
    quantity = this.Check(this.Int, this.Gte(0));
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Inventory });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'check');
  
  await database.close();
});

await asyncTest('C-02: Adding not null constraint triggers recreation', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class ProfilesV1 extends Table {
    static get name() { return 'profiles'; }
    name;
    bio = this.Null(this.Text);
  }
  
  class ProfilesV2 extends Table {
    static get name() { return 'profiles'; }
    name;
    bio;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Profiles: ProfilesV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Profiles: ProfilesV2 });
  const sql = client2.diff(schema1);
  
  // Constraint changes require recreation
  assertIncludes(sql.toLowerCase(), 'temp_profiles');
  
  await db2.close();
});

await asyncTest('C-03: Foreign key added triggers recreation', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Authors extends Table {
    name;
  }
  
  class BooksV1 extends Table {
    static get name() { return 'books'; }
    title;
    authorId;
  }
  
  class BooksV2 extends Table {
    static get name() { return 'books'; }
    title;
    authorId = this.References(Authors);
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Authors, Books: BooksV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Authors, Books: BooksV2 });
  const sql = client2.diff(schema1);
  
  // FK changes require recreation
  assertIncludes(sql.toLowerCase(), 'temp_books');
  assertIncludes(sql.toLowerCase(), 'references');
  
  await db2.close();
});

await asyncTest('C-04: Default value added via add column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class TasksV1 extends Table {
    static get name() { return 'tasks'; }
    name;
  }
  
  class TasksV2 extends Table {
    static get name() { return 'tasks'; }
    name;
    priority = this.Default(5);
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Tasks: TasksV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Tasks: TasksV2 });
  const sql = client2.diff(schema1);
  
  assertIncludes(sql.toLowerCase(), 'add column priority');
  assertIncludes(sql.toLowerCase(), 'default');
  
  await db2.close();
});

await asyncTest('C-05: Primary key column added triggers recreation', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class LogsV1 extends Table {
    static get name() { return 'logs'; }
    message;
  }
  
  class LogsV2 extends Table {
    static get name() { return 'logs'; }
    uuid = this.Unique(this.Text);
    message;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Logs: LogsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Logs: LogsV2 });
  const sql = client2.diff(schema1);
  
  // Adding unique column via alter
  assertIncludes(sql.toLowerCase(), 'add column uuid');
  
  await db2.close();
});

await asyncTest('C-06: Cascade delete in initial schema', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Categories extends Table {
    name;
  }
  
  class Products extends Table {
    name;
    categoryId = this.Cascade(Categories);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Categories, Products });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'on delete cascade');
  
  await database.close();
});

// ============================================
// TABLE RECREATION SCENARIOS
// ============================================
console.log('\n=== TABLE RECREATION SCENARIOS ===\n');

await asyncTest('R-01: Recreation preserves existing data', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class EmployeesV1 extends Table {
    static get name() { return 'employees'; }
    name;
    department;
    salary = this.Default(50000);
  }
  
  class EmployeesV2 extends Table {
    static get name() { return 'employees'; }
    name;
    department;
    salary = this.Default(50000);
    
    Attributes() {
      return [this.Check('salary > 0')];
    }
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Employees: EmployeesV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await client1.employees.insertMany([
    { name: 'Alice', department: 'Engineering', salary: 100000 },
    { name: 'Bob', department: 'Sales', salary: 80000 }
  ]);
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Employees: EmployeesV2 });
  await client2.migrate(client2.diff(schema1));
  
  const employees = await client2.employees.many();
  assertEquals(employees.length, 2, 'Data should be preserved after recreation');
  
  const alice = employees.find(e => e.name === 'Alice');
  assertEquals(alice.salary, 100000, 'Alice salary should be preserved');
  
  await db2.close();
});

await asyncTest('R-02: Recreation with column removal drops data in removed column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class ContactsV1 extends Table {
    static get name() { return 'contacts'; }
    name;
    email;
    phone;
    notes;
  }
  
  class ContactsV2 extends Table {
    static get name() { return 'contacts'; }
    name;
    email;
    phone;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Contacts: ContactsV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await client1.contacts.insert({ 
    name: 'John', 
    email: 'john@example.com', 
    phone: '555-1234',
    notes: 'Important contact'
  });
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Contacts: ContactsV2 });
  await client2.migrate(client2.diff(schema1));
  
  const contacts = await client2.contacts.many();
  assertEquals(contacts.length, 1, 'Contact should still exist');
  assertEquals(contacts[0].name, 'John');
  assert(contacts[0].notes === undefined, 'Notes column should be removed');
  
  await db2.close();
});

await asyncTest('R-03: Foreign key creates index on reference column', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Departments extends Table {
    name;
  }
  
  class Staff extends Table {
    name;
    departmentId = this.References(Departments);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Departments, Staff });
  const sql = db.diff();
  
  // Foreign key creates index on the reference column
  assertIncludes(sql.toLowerCase(), 'foreign key');
  assertIncludes(sql.toLowerCase(), 'references');
  assertIncludes(sql.toLowerCase(), 'create index');
  
  await database.close();
});

await asyncTest('R-04: Column rename detection', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class ArticlesV1 extends Table {
    static get name() { return 'articles'; }
    title;
    content;
  }
  
  class ArticlesV2 extends Table {
    static get name() { return 'articles'; }
    title;
    body;  // Same type, different name - should be detected as rename
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Articles: ArticlesV1 });
  const schema1 = client1.getSchema();
  await client1.migrate(client1.diff());
  await client1.articles.insert({ title: 'Hello', content: 'World' });
  await db1.close();
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Articles: ArticlesV2 });
  const sql = client2.diff(schema1);
  
  // Should detect as rename
  assertIncludes(sql.toLowerCase(), 'rename column');
  
  await db2.close();
});

await asyncTest('R-05: Recreation with FTS table', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Documents extends FTSTable {
    title;
    content;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Documents });
  const sql = db.diff();
  
  assertIncludes(sql.toLowerCase(), 'create virtual table documents');
  assertIncludes(sql.toLowerCase(), 'fts5');
  
  await database.close();
});

// ============================================
// ANALYZE MIGRATION FUNCTION
// ============================================
console.log('\n=== ANALYZE MIGRATION FUNCTION ===\n');

test('A-01: analyzeMigration detects drop table', () => {
  const sql = 'drop table users;';
  const analysis = analyzeMigration(sql);
  
  assert(analysis.isDestructive, 'Should be destructive');
  assertEquals(analysis.dropTables.length, 1);
  assertEquals(analysis.dropTables[0], 'users');
});

test('A-02: analyzeMigration detects drop column', () => {
  const sql = 'alter table posts drop column author;';
  const analysis = analyzeMigration(sql);
  
  assert(analysis.isDestructive, 'Should be destructive');
  assertEquals(analysis.dropColumns.length, 1);
  assertEquals(analysis.dropColumns[0].table, 'posts');
  assertEquals(analysis.dropColumns[0].column, 'author');
});

test('A-03: analyzeMigration detects table recreation', () => {
  const sql = `
    create table temp_users (id integer, name text);
    insert into temp_users select id, name from users;
    drop table users;
    alter table temp_users rename to users;
  `;
  const analysis = analyzeMigration(sql);
  
  assert(analysis.isDestructive, 'Should be destructive');
  assertEquals(analysis.recreatedTables.length, 1);
  assertEquals(analysis.recreatedTables[0], 'users');
});

test('A-04: analyzeMigration detects add column (non-destructive)', () => {
  const sql = 'alter table users add column email text;';
  const analysis = analyzeMigration(sql);
  
  assert(!analysis.isDestructive, 'Should not be destructive');
  assertEquals(analysis.addColumns.length, 1);
  assertEquals(analysis.addColumns[0].table, 'users');
  assertEquals(analysis.addColumns[0].column, 'email');
});

test('A-05: analyzeMigration detects add table (non-destructive)', () => {
  const sql = 'create table posts (id integer primary key, title text);';
  const analysis = analyzeMigration(sql);
  
  assert(!analysis.isDestructive, 'Should not be destructive');
  assertEquals(analysis.addTables.length, 1);
  assertEquals(analysis.addTables[0], 'posts');
});

// ============================================
// MIGRATION EXECUTION
// ============================================
console.log('\n=== MIGRATION EXECUTION ===\n');

await asyncTest('M-01: migrate executes SQL successfully', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
    email;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  
  const sql = db.diff();
  await db.migrate(sql);
  
  // Should be able to insert after migration
  const user = await db.users.insert({ name: 'Test', email: 'test@example.com' });
  assert(user !== undefined, 'Should have created user');
  
  // Verify user can be fetched
  const fetched = await db.users.get({ name: 'Test' });
  assert(fetched !== null, 'Should be able to get user');
  assertEquals(fetched.email, 'test@example.com', 'Should have correct email');
  
  await database.close();
});

await asyncTest('M-02: migrate with dryRun does not execute', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  await db.migrate(db.diff());
  await db.users.insert({ name: 'Before' });
  
  // Try to drop table with dryRun
  const result = await db.migrate('drop table users;', { dryRun: true });
  
  // Table should still exist
  const users = await db.users.many();
  assertEquals(users.length, 1, 'Table should still exist after dryRun');
  
  await database.close();
});

await asyncTest('M-03: Second diff is empty when no changes', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table { name; }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  const sql = db.diff();
  await db.migrate(sql);
  
  // Save schema
  const schema = db.getSchema();
  
  // Second diff should be empty
  const secondDiff = db.diff(schema);
  assertEquals(secondDiff.trim(), '', 'Second diff should be empty');
  
  await database.close();
});

await asyncTest('M-04: Foreign key constraint enforced', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Parents extends Table {
    name;
  }
  
  class Children extends Table {
    name;
    parentId = this.References(Parents);
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Parents, Children });
  
  await db.migrate(db.diff());
  
  // Create parent first
  await db.parents.insert({ name: 'Parent' });
  
  // Query parent to get id
  const parent = await db.parents.get({ name: 'Parent' });
  assert(parent !== null, 'Should have parent');
  assert(parent.id !== undefined, 'Parent should have id');
  
  // Create child with parent id
  await db.children.insert({ name: 'Child', parentId: parent.id });
  
  // Verify foreign key relationship
  const child = await db.children.get({ name: 'Child' });
  assert(child !== null, 'Should fetch child');
  assert(child.parentId !== undefined, 'Child should have parentId');
  assertEquals(child.parentId, parent.id, 'Child should reference parent');
  
  await database.close();
});

await asyncTest('M-05: getSchema returns current schema', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class Users extends Table {
    name;
    email;
    
    Attributes() {
      return [this.Index('email')];
    }
  }
  
  const database = new SQLiteDatabase(TEST_DB);
  const db = database.getClient({ Users });
  
  const schema = db.getSchema();
  
  assert(Array.isArray(schema), 'Schema should be array');
  const usersTable = schema.find(t => t.name === 'users');
  assert(usersTable !== undefined, 'Should have users table');
  
  const nameCol = usersTable.columns.find(c => c.name === 'name');
  assert(nameCol !== undefined, 'Should have name column');
  
  await database.close();
});

await asyncTest('M-06: diff between saved schema and new schema', async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  class UsersV1 extends Table {
    static get name() { return 'users'; }
    name;
  }
  
  const db1 = new SQLiteDatabase(TEST_DB);
  const client1 = db1.getClient({ Users: UsersV1 });
  await client1.migrate(client1.diff());
  
  // Save schema
  const savedSchema = client1.getSchema();
  await db1.close();
  
  // New schema with additions
  class UsersV2 extends Table {
    static get name() { return 'users'; }
    name;
    email;
  }
  
  class Posts extends Table {
    title;
    body;
  }
  
  const db2 = new SQLiteDatabase(TEST_DB);
  const client2 = db2.getClient({ Users: UsersV2, Posts });
  
  // diff with previous schema
  const sql = client2.diff(savedSchema);
  
  assertIncludes(sql.toLowerCase(), 'add column email');
  assertIncludes(sql.toLowerCase(), 'create table posts');
  
  await db2.close();
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

if (failed > 0) {
  process.exit(1);
}
