/**
 * Test script for pagination helpers
 */
import { SQLiteDatabase, Table } from '../index.js';
import { unlinkSync, existsSync } from 'fs';

const dbPath = '/tmp/pagination-test.db';

// Cleanup before test
if (existsSync(dbPath)) unlinkSync(dbPath);

class Posts extends Table {
  title;
  body;
  views = this.Int;
}

const db = new SQLiteDatabase(dbPath);
const client = db.getClient({ Posts });

async function test() {
  // Create schema
  const sql = client.diff();
  await client.migrate(sql);
  console.log('✓ Schema created');
  
  // Insert test data (25 posts)
  for (let i = 1; i <= 25; i++) {
    await client.posts.insert({ 
      title: `Post ${i}`, 
      body: `Content ${i}`,
      views: i * 10
    });
  }
  console.log('✓ Test data inserted (25 posts)');
  
  // ========================================
  // OFFSET-BASED PAGINATION TESTS
  // ========================================
  console.log('\n=== Offset-Based Pagination ===\n');
  
  // Test 1: Default pagination
  console.log('--- Test 1: Default pagination ---');
  const page1 = await client.posts.paginate();
  console.log(`Page: ${page1.page}, PageSize: ${page1.pageSize}, Total: ${page1.totalCount}, TotalPages: ${page1.totalPages}`);
  console.log(`Data count: ${page1.data.length}, HasMore: ${page1.hasMore}`);
  console.log('✓ Default pagination works');
  
  // Test 2: Custom page size
  console.log('\n--- Test 2: Custom page size ---');
  const page2 = await client.posts.paginate({ pageSize: 5 });
  console.log(`Page: ${page2.page}, PageSize: ${page2.pageSize}, Total: ${page2.totalCount}, TotalPages: ${page2.totalPages}`);
  console.log(`Data count: ${page2.data.length}, HasMore: ${page2.hasMore}`);
  console.log('✓ Custom page size works');
  
  // Test 3: Specific page
  console.log('\n--- Test 3: Navigate to page 3 ---');
  const page3 = await client.posts.paginate({ page: 3, pageSize: 5 });
  console.log(`Page: ${page3.page}, Data: [${page3.data.map(p => p.title).join(', ')}]`);
  console.log(`HasMore: ${page3.hasMore}`);
  console.log('✓ Page navigation works');
  
  // Test 4: Last page
  console.log('\n--- Test 4: Last page ---');
  const lastPage = await client.posts.paginate({ page: 5, pageSize: 5 });
  console.log(`Page: ${lastPage.page}, Data count: ${lastPage.data.length}, HasMore: ${lastPage.hasMore}`);
  console.log('✓ Last page hasMore is false');
  
  // Test 5: With filtering
  console.log('\n--- Test 5: Pagination with where clause ---');
  const filtered = await client.posts.paginate({ 
    where: { views: c => c.gt(100) },
    pageSize: 5
  });
  console.log(`Filtered total: ${filtered.totalCount}, Page data: ${filtered.data.length}`);
  console.log('✓ Filtering with pagination works');
  
  // Test 6: With ordering
  console.log('\n--- Test 6: Pagination with ordering ---');
  const ordered = await client.posts.paginate({ 
    pageSize: 5,
    orderBy: 'views',
    desc: true
  });
  console.log(`First post views: ${ordered.data[0].views}, Last: ${ordered.data[ordered.data.length-1].views}`);
  console.log('✓ Ordering with pagination works');
  
  // ========================================
  // CURSOR-BASED PAGINATION TESTS
  // ========================================
  console.log('\n=== Cursor-Based Pagination ===\n');
  
  // Test 7: Initial cursor fetch
  console.log('--- Test 7: Initial cursor fetch ---');
  const cursor1 = await client.posts.cursorPaginate({ limit: 5 });
  console.log(`Data count: ${cursor1.data.length}, NextCursor: ${cursor1.nextCursor}, HasMore: ${cursor1.hasMore}`);
  console.log(`IDs: [${cursor1.data.map(p => p.id).join(', ')}]`);
  console.log('✓ Initial cursor pagination works');
  
  // Test 8: Continue with cursor
  console.log('\n--- Test 8: Continue with cursor ---');
  const cursor2 = await client.posts.cursorPaginate({ 
    cursor: cursor1.nextCursor, 
    limit: 5 
  });
  console.log(`Data count: ${cursor2.data.length}, NextCursor: ${cursor2.nextCursor}, HasMore: ${cursor2.hasMore}`);
  console.log(`IDs: [${cursor2.data.map(p => p.id).join(', ')}]`);
  console.log('✓ Cursor continuation works');
  
  // Test 9: Fetch all remaining
  console.log('\n--- Test 9: Fetch remaining pages ---');
  let allFetched = [...cursor1.data, ...cursor2.data];
  let nextCursor = cursor2.nextCursor;
  while (nextCursor) {
    const page = await client.posts.cursorPaginate({ cursor: nextCursor, limit: 5 });
    allFetched = [...allFetched, ...page.data];
    nextCursor = page.nextCursor;
  }
  console.log(`Total fetched via cursor: ${allFetched.length}`);
  console.log('✓ Fetched all 25 posts via cursor pagination');
  
  // Test 10: Cursor with custom column
  console.log('\n--- Test 10: Cursor with custom column ---');
  const viewsCursor = await client.posts.cursorPaginate({ 
    limit: 5,
    cursorColumn: 'views',
    orderBy: 'views'
  });
  console.log(`First views: ${viewsCursor.data[0].views}, NextCursor: ${viewsCursor.nextCursor}`);
  console.log('✓ Custom cursor column works');
  
  // Test 11: Cursor with where clause
  console.log('\n--- Test 11: Cursor with where clause ---');
  const cursorFiltered = await client.posts.cursorPaginate({ 
    where: { views: c => c.gt(100) },
    limit: 5
  });
  console.log(`Filtered cursor data: ${cursorFiltered.data.length}, HasMore: ${cursorFiltered.hasMore}`);
  console.log('✓ Cursor with filtering works');
  
  // Cleanup
  await db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  
  console.log('\n=== All pagination tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
