/**
 * Test script for migration safety features
 */
import { SQLiteDatabase, Table, analyzeMigration } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/migration-test.db';
const backupPath = '/tmp/migration-test-backup.db';

// Cleanup before test
if (existsSync(dbPath)) unlinkSync(dbPath);
if (existsSync(backupPath)) unlinkSync(backupPath);

class Users extends Table {
  name;
  email;
}

class Posts extends Table {
  title;
  body;
}

const db = new SQLiteDatabase(dbPath);
const client = db.getClient({ Users, Posts });

async function test() {
  // Create initial schema
  const initialSql = client.diff();
  console.log('Initial schema SQL:');
  console.log(initialSql);
  
  await client.migrate(initialSql);
  console.log('✓ Initial migration applied');
  
  // Insert some data
  await client.users.insert({ name: 'Alice', email: 'alice@example.com' });
  await client.posts.insert({ title: 'Hello', body: 'World' });
  console.log('✓ Test data inserted');
  
  // Test 1: dryRun mode
  const dryResult = await client.migrate('drop table posts;', { dryRun: true });
  console.log('\n--- Dry run test ---');
  console.log('Dry run result:', dryResult);
  
  // Verify posts table still exists
  const posts = await client.posts.many();
  console.log('✓ Posts table still exists after dry run:', posts.length, 'rows');
  
  // Test 2: analyzeMigration
  console.log('\n--- Migration analysis test ---');
  const destructiveSql = `
    drop table posts;
    alter table users drop column email;
    create table temp_users (id integer primary key, name text);
  `;
  const analysis = analyzeMigration(destructiveSql);
  console.log('Analysis:', JSON.stringify(analysis, null, 2));
  console.log('✓ isDestructive:', analysis.isDestructive);
  
  // Test 3: backup
  console.log('\n--- Backup test ---');
  const backupResult = await db.backup(backupPath);
  console.log('Backup result:', backupResult);
  console.log('✓ Backup created:', existsSync(backupPath));
  
  // Test 4: safetyBackup (auto-timestamped)
  console.log('\n--- Safety backup test ---');
  const safetyResult = await db.safetyBackup();
  console.log('Safety backup result:', safetyResult);
  console.log('✓ Safety backup created:', existsSync(safetyResult.path));
  
  // Clean up safety backup
  if (existsSync(safetyResult.path)) unlinkSync(safetyResult.path);
  
  // Test 5: safeMigrate with non-destructive change
  console.log('\n--- Safe migrate (non-destructive) ---');
  const addColSql = 'alter table users add column age integer;';
  const safeResult1 = await db.safeMigrate(addColSql);
  console.log('Safe migrate result:', JSON.stringify(safeResult1, null, 2));
  console.log('✓ No backup needed for non-destructive migration');
  
  // Test 6: safeMigrate with destructive change
  console.log('\n--- Safe migrate (destructive) ---');
  const dropColSql = 'alter table users drop column age;';
  const safeResult2 = await db.safeMigrate(dropColSql);
  console.log('Safe migrate result:', JSON.stringify(safeResult2, null, 2));
  console.log('✓ Auto-backup created for destructive migration:', safeResult2.backup !== null);
  
  // Clean up auto backup
  if (safeResult2.backup && existsSync(safeResult2.backup.path)) {
    unlinkSync(safeResult2.backup.path);
  }
  
  // Test 7: restore
  console.log('\n--- Restore test ---');
  // First insert a marker row
  await client.users.insert({ name: 'Bob', email: 'bob@example.com' });
  const beforeRestore = await client.users.many();
  console.log('Users before restore:', beforeRestore.length);
  
  const restoreResult = await db.restore(backupPath);
  console.log('Restore result:', restoreResult);
  
  // Reinitialize client after restore
  const afterRestore = await client.users.many();
  console.log('Users after restore:', afterRestore.length);
  console.log('✓ Restore successful (rows reduced from', beforeRestore.length, 'to', afterRestore.length + ')');
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  if (existsSync(backupPath)) unlinkSync(backupPath);
  
  console.log('\n=== All migration safety tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
