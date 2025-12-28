/**
 * Joins & Complex Queries Test Suite
 * Phase 4 - Joins, Subqueries, GroupBy, Having, Select/Omit/Distinct
 * 
 * Crafted by Demetrius QA/PM Specialist
 * 
 * Coverage:
 * - J-01 to J-08: Join Operations (inner, left, right, cross, multi-table)
 * - S-01 to S-06: Subqueries and CTEs (db.subquery, db.use)
 * - G-01 to G-08: GroupBy with Aggregates and Having
 * - Q-01 to Q-08: Complex Query Features (select, omit, distinct, orderBy)
 */

import { SQLiteDatabase, Table } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/joins-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// Test Schema - Multi-table relationships
class Users extends Table {
  name = this.Text;
  email = this.Unique(this.Text);
  department = this.Null(this.Text);
  salary = this.Default(50000);
}

class Posts extends Table {
  title = this.Text;
  content = this.Null(this.Text);
  authorId = this.References(Users);
  views = this.Default(0);
  published = this.Default(false);
}

class Comments extends Table {
  postId = this.References(Posts);
  authorId = this.References(Users);
  text = this.Text;
  likes = this.Default(0);
}

class Tags extends Table {
  name = this.Unique(this.Text);
}

class PostTags extends Table {
  postId = this.References(Posts);
  tagId = this.References(Tags);
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ Users, Posts, Comments, Tags, PostTags });

// Initialize schema
const sql = db.diff();
await db.migrate(sql);
console.log('✓ Schema created\n');

// Seed data
async function seedData() {
  // Users
  const alice = await db.users.insert({ name: 'Alice', email: 'alice@test.com', department: 'Engineering', salary: 80000 });
  const bob = await db.users.insert({ name: 'Bob', email: 'bob@test.com', department: 'Marketing', salary: 60000 });
  const charlie = await db.users.insert({ name: 'Charlie', email: 'charlie@test.com', department: 'Engineering', salary: 90000 });
  const diana = await db.users.insert({ name: 'Diana', email: 'diana@test.com', department: 'Sales', salary: 70000 });
  const eve = await db.users.insert({ name: 'Eve', email: 'eve@test.com', department: null, salary: 55000 });

  // Posts
  const post1 = await db.posts.insert({ title: 'Intro to SQL', content: 'SQL is great', authorId: alice, views: 100, published: true });
  const post2 = await db.posts.insert({ title: 'Advanced Joins', content: 'Joins are powerful', authorId: alice, views: 250, published: true });
  const post3 = await db.posts.insert({ title: 'Marketing Tips', content: 'Reach your audience', authorId: bob, views: 50, published: true });
  const post4 = await db.posts.insert({ title: 'Draft Post', content: 'Not ready yet', authorId: charlie, views: 0, published: false });

  // Comments
  await db.comments.insert({ postId: post1, authorId: bob, text: 'Great article!', likes: 5 });
  await db.comments.insert({ postId: post1, authorId: charlie, text: 'Very helpful', likes: 3 });
  await db.comments.insert({ postId: post2, authorId: bob, text: 'Mind blown', likes: 10 });
  await db.comments.insert({ postId: post2, authorId: diana, text: 'Need more examples', likes: 2 });
  await db.comments.insert({ postId: post3, authorId: alice, text: 'Good tips', likes: 1 });

  // Tags
  const sqlTag = await db.tags.insert({ name: 'sql' });
  const tutorialTag = await db.tags.insert({ name: 'tutorial' });
  const marketingTag = await db.tags.insert({ name: 'marketing' });

  // PostTags
  await db.postTags.insert({ postId: post1, tagId: sqlTag });
  await db.postTags.insert({ postId: post1, tagId: tutorialTag });
  await db.postTags.insert({ postId: post2, tagId: sqlTag });
  await db.postTags.insert({ postId: post3, tagId: marketingTag });

  return { alice, bob, charlie, diana, eve, post1, post2, post3, post4, sqlTag, tutorialTag, marketingTag };
}

const ids = await seedData();
console.log('✓ Seed data created\n');

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
// JOIN OPERATIONS
// ============================================
console.log('=== JOIN OPERATIONS ===\n');

await asyncTest('J-01: Inner join - posts with authors', async () => {
  const results = await db.query(c => ({
    select: {
      postTitle: c.posts.title,
      authorName: c.users.name
    },
    join: [c.posts.authorId, c.users.id],
    where: {
      [c.posts.published]: true
    },
    orderBy: c.posts.id
  }));
  
  assertEquals(results.length, 3, 'Should have 3 published posts with authors');
  assertEquals(results[0].authorName, 'Alice');
  assertEquals(results[0].postTitle, 'Intro to SQL');
});

await asyncTest('J-02: Inner join with specific column selection', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      email: c.users.email
    },
    join: [c.posts.authorId, c.users.id],
    where: {
      [c.posts.views]: c.gte(100)
    }
  }));
  
  assertEquals(results.length, 2, 'Should have 2 posts with views >= 100');
  assert(results.every(r => r.email.includes('@')), 'All should have emails');
});

await asyncTest('J-03: Left join - all users with their post counts', async () => {
  const results = await db.query(c => ({
    select: {
      userName: c.users.name,
      postTitle: c.posts.title
    },
    join: [[c.users.id, c.posts.authorId, 'left']],
    orderBy: c.users.name
  }));
  
  // Alice has 2 posts, Bob has 1, Charlie has 1, Diana has 0, Eve has 0
  assert(results.length >= 4, 'Should have at least 4 rows (users with posts)');
  const diana = results.find(r => r.userName === 'Diana');
  assertEquals(diana?.postTitle, null, 'Diana should have null postTitle (no posts)');
});

await asyncTest('J-04: Multi-table join - posts with authors and comment counts', async () => {
  const results = await db.query(c => ({
    select: {
      postTitle: c.posts.title,
      authorName: c.users.name,
      commentText: c.comments.text
    },
    join: [
      [c.posts.authorId, c.users.id],
      [c.comments.postId, c.posts.id]
    ],
    orderBy: c.posts.id
  }));
  
  assert(results.length >= 5, 'Should have at least 5 rows (posts with comments)');
  assert(results.every(r => r.postTitle && r.authorName && r.commentText), 'All fields should be populated');
});

await asyncTest('J-05: Join with aggregate in select', async () => {
  const results = await db.query(c => ({
    select: {
      userName: c.users.name,
      totalViews: c.sum(c.posts.views)
    },
    join: [[c.users.id, c.posts.authorId, 'left']],
    groupBy: c.users.id,
    orderBy: c.users.name
  }));
  
  assertEquals(results.length, 5, 'Should have 5 users');
  const alice = results.find(r => r.userName === 'Alice');
  assertEquals(alice?.totalViews, 350, 'Alice should have 350 total views');
});

await asyncTest('J-06: Join with where on both tables', async () => {
  const results = await db.query(c => ({
    select: {
      postTitle: c.posts.title,
      authorName: c.users.name
    },
    join: [c.posts.authorId, c.users.id],
    where: {
      [c.posts.published]: true,
      [c.users.department]: 'Engineering'
    }
  }));
  
  assertEquals(results.length, 2, 'Should have 2 posts by Engineering dept');
  assert(results.every(r => r.authorName === 'Alice'), 'All should be by Alice');
});

await asyncTest('J-07: Self-referential query pattern (via multiple selects)', async () => {
  // Get comments on Alice's posts
  const alicePosts = await db.posts.many({ authorId: ids.alice }, 'id');
  const comments = await db.comments.many({ postId: alicePosts });
  
  assertEquals(comments.length, 4, 'Should have 4 comments on Alice\'s posts');
});

await asyncTest('J-08: Join with ordering and limit', async () => {
  const results = await db.query(c => ({
    select: {
      postTitle: c.posts.title,
      authorName: c.users.name,
      views: c.posts.views
    },
    join: [c.posts.authorId, c.users.id],
    where: {
      [c.posts.published]: true
    },
    orderBy: c.posts.views,
    desc: true,
    limit: 2
  }));
  
  assertEquals(results.length, 2, 'Should have 2 results');
  assertEquals(results[0].views, 250, 'First should have highest views');
  assertEquals(results[1].views, 100, 'Second should have second highest views');
});

// ============================================
// SUBQUERIES AND CTEs
// ============================================
console.log('\n=== SUBQUERIES AND CTEs ===\n');

await asyncTest('S-01: Create subquery for reuse', async () => {
  const topAuthors = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId,
      totalViews: c.sum(c.posts.views)
    },
    groupBy: c.posts.authorId
  }));
  
  assert(topAuthors.sql, 'Subquery should have SQL');
  assert(topAuthors.columns, 'Subquery should have column types');
  assertEquals(topAuthors.columns.authorId, 'integer', 'authorId should be integer');
});

await asyncTest('S-02: Use subquery with db.use()', async () => {
  const postStats = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId,
      postCount: c.count()
    },
    groupBy: c.posts.authorId
  }));
  
  const results = await db.query(c => {
    const stats = c.use(postStats);
    return {
      select: {
        userName: c.users.name,
        postCount: stats.postCount
      },
      join: [c.users.id, stats.authorId]
    };
  });
  
  assert(results.length >= 3, 'Should have at least 3 users with posts');
  const alice = results.find(r => r.userName === 'Alice');
  assertEquals(alice?.postCount, 2, 'Alice should have 2 posts');
});

await asyncTest('S-03: Nested subquery for complex aggregation', async () => {
  // Get users whose total post views exceed average
  const userViews = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId,
      totalViews: c.sum(c.posts.views)
    },
    groupBy: c.posts.authorId
  }));
  
  const results = await db.query(c => {
    const stats = c.use(userViews);
    return {
      select: {
        userName: c.users.name,
        totalViews: stats.totalViews
      },
      join: [c.users.id, stats.authorId],
      where: {
        [stats.totalViews]: c.gte(stats.totalViews, 100)
      }
    };
  });
  
  assert(results.length >= 1, 'Should have at least 1 user with >= 100 views');
  assertEquals(results[0].userName, 'Alice');
  assertEquals(results[0].totalViews, 350);
});

await asyncTest('S-04: Subquery in exists pattern', async () => {
  // Users who have written at least one post
  const usersWithPosts = await db.users.many();
  const hasPost = await Promise.all(
    usersWithPosts.map(async u => ({
      ...u,
      hasPost: await db.posts.exists({ authorId: u.id })
    }))
  );
  
  const withPosts = hasPost.filter(u => u.hasPost);
  assertEquals(withPosts.length, 3, 'Should have 3 users with posts');
});

await asyncTest('S-05: Subquery with filtering', async () => {
  const publishedByDept = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId,
      publishedCount: c.count()
    },
    where: {
      [c.posts.published]: true
    },
    groupBy: c.posts.authorId
  }));
  
  const results = await db.query(c => {
    const stats = c.use(publishedByDept);
    return {
      select: {
        userName: c.users.name,
        department: c.users.department,
        publishedCount: stats.publishedCount
      },
      join: [c.users.id, stats.authorId],
      orderBy: stats.publishedCount,
      desc: true
    };
  });
  
  assertEquals(results[0].userName, 'Alice', 'Alice should have most published');
  assertEquals(results[0].publishedCount, 2);
});

await asyncTest('S-06: Multiple subqueries combined', async () => {
  const postCounts = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId,
      postCount: c.count()
    },
    groupBy: c.posts.authorId
  }));
  
  const commentCounts = db.subquery(c => ({
    select: {
      authorId: c.comments.authorId,
      commentCount: c.count()
    },
    groupBy: c.comments.authorId
  }));
  
  // Query users with their post counts (via one subquery)
  const results = await db.query(c => {
    const posts = c.use(postCounts);
    return {
      select: {
        userName: c.users.name,
        postCount: posts.postCount
      },
      join: [[c.users.id, posts.authorId, 'left']]
    };
  });
  
  assert(results.length >= 3, 'Should have users with post counts');
});

// ============================================
// GROUPBY AND HAVING
// ============================================
console.log('\n=== GROUPBY AND HAVING ===\n');

await asyncTest('G-01: Basic groupBy with count', async () => {
  const results = await db.posts.groupBy('authorId').count({ column: { count: 'id' } });
  
  assert(results.length >= 3, 'Should have at least 3 authors');
  const alice = results.find(r => r.authorId === ids.alice);
  assertEquals(alice?.count, 2, 'Alice should have 2 posts');
});

await asyncTest('G-02: GroupBy with sum aggregate', async () => {
  const results = await db.posts.groupBy('authorId').sum({ column: { totalViews: 'views' } });
  
  const alice = results.find(r => r.authorId === ids.alice);
  assertEquals(alice?.totalViews, 350, 'Alice should have 350 total views');
});

await asyncTest('G-03: GroupBy with max aggregate', async () => {
  const results = await db.posts.groupBy('authorId').max({ column: { maxViews: 'views' } });
  
  const alice = results.find(r => r.authorId === ids.alice);
  assertEquals(alice?.maxViews, 250, 'Alice\'s max views should be 250');
});

await asyncTest('G-04: GroupBy with min aggregate', async () => {
  const results = await db.users.groupBy('department').min({ column: { minSalary: 'salary' } });
  
  const engineering = results.find(r => r.department === 'Engineering');
  assertEquals(engineering?.minSalary, 80000, 'Engineering min salary should be 80000');
});

await asyncTest('G-05: GroupBy with avg aggregate', async () => {
  const results = await db.users.groupBy('department').avg({ column: { avgSalary: 'salary' } });
  
  const engineering = results.find(r => r.department === 'Engineering');
  assertEquals(engineering?.avgSalary, 85000, 'Engineering avg salary should be 85000');
});

await asyncTest('G-06: GroupBy with where clause', async () => {
  const results = await db.posts.groupBy('authorId').count({
    column: { count: 'id' },
    where: { published: true }
  });
  
  const alice = results.find(r => r.authorId === ids.alice);
  assertEquals(alice?.count, 2, 'Alice should have 2 published posts');
});

await asyncTest('G-07: GroupBy with having (filter by aggregate)', async () => {
  const results = await db.posts.groupBy('authorId').sum({
    column: { totalViews: 'views' },
    where: {
      sum: v => v.gte(100)
    }
  });
  
  // Only authors with >= 100 total views
  assert(results.every(r => r.totalViews >= 100), 'All should have >= 100 views');
});

await asyncTest('G-08: GroupBy with array aggregation', async () => {
  const results = await db.posts.groupBy('authorId').array({
    select: { titles: 'title' }
  });
  
  const alice = results.find(r => r.authorId === ids.alice);
  assert(Array.isArray(alice?.titles), 'Should return array of titles');
  assertEquals(alice?.titles?.length, 2, 'Alice should have 2 post titles');
});

// ============================================
// COMPLEX QUERY FEATURES
// ============================================
console.log('\n=== COMPLEX QUERY FEATURES ===\n');

await asyncTest('Q-01: Select specific columns via query()', async () => {
  const results = await db.posts.query({
    select: ['title', 'views'],
    where: { published: true }
  });
  
  assertEquals(results.length, 3, 'Should have 3 published posts');
  assert(results[0].title !== undefined, 'Should have title');
  assert(results[0].views !== undefined, 'Should have views');
  assertEquals(Object.keys(results[0]).length, 2, 'Should only have 2 columns');
});

await asyncTest('Q-02: Omit specific columns', async () => {
  const results = await db.posts.query({
    omit: ['content'],
    where: { id: ids.post1 }
  });
  
  assertEquals(results.length, 1);
  assertEquals(results[0].content, undefined, 'Content should be omitted');
  assert(results[0].title !== undefined, 'Should have title');
});

await asyncTest('Q-03: Distinct values', async () => {
  const departments = await db.users.query({
    select: ['department'],
    distinct: true
  });
  
  // Should have Engineering, Marketing, Sales, null
  assertEquals(departments.length, 4, 'Should have 4 distinct departments');
});

await asyncTest('Q-04: Order by single column ascending', async () => {
  const results = await db.posts.query({
    select: ['title', 'views'],
    where: { published: true },
    orderBy: 'views'
  });
  
  assertEquals(results[0].views, 50, 'First should have lowest views');
  assertEquals(results[2].views, 250, 'Last should have highest views');
});

await asyncTest('Q-05: Order by single column descending', async () => {
  const results = await db.posts.query({
    select: ['title', 'views'],
    where: { published: true },
    orderBy: 'views',
    desc: true
  });
  
  assertEquals(results[0].views, 250, 'First should have highest views');
  assertEquals(results[2].views, 50, 'Last should have lowest views');
});

await asyncTest('Q-06: Limit results', async () => {
  const results = await db.posts.query({
    select: ['title'],
    limit: 2
  });
  
  assertEquals(results.length, 2, 'Should have exactly 2 results');
});

await asyncTest('Q-07: Offset and limit for pagination', async () => {
  const page1 = await db.posts.query({
    select: ['title'],
    orderBy: 'id',
    limit: 2,
    offset: 0
  });
  
  const page2 = await db.posts.query({
    select: ['title'],
    orderBy: 'id',
    limit: 2,
    offset: 2
  });
  
  assertEquals(page1.length, 2, 'Page 1 should have 2 results');
  assertEquals(page2.length, 2, 'Page 2 should have 2 results');
  assert(page1[0].title !== page2[0].title, 'Pages should have different results');
});

await asyncTest('Q-08: Complex where with and/or', async () => {
  const results = await db.posts.many({
    or: [
      { authorId: ids.alice },
      { views: v => v.gte(100) }
    ]
  });
  
  // Alice's 2 posts + any with views >= 100 (which includes Alice's anyway)
  assert(results.length >= 2, 'Should have at least 2 results');
});

await asyncTest('Q-09: Return single column as values', async () => {
  const titles = await db.posts.many({ published: true }, 'title');
  
  assert(Array.isArray(titles), 'Should return array');
  assert(typeof titles[0] === 'string', 'Should be array of strings');
  assertEquals(titles.length, 3, 'Should have 3 published post titles');
});

await asyncTest('Q-10: First with complex query', async () => {
  const result = await db.posts.first({
    where: { published: true },
    orderBy: 'views',
    desc: true
  });
  
  assertEquals(result.views, 250, 'Should get post with highest views');
  assertEquals(result.title, 'Advanced Joins');
});

await asyncTest('Q-11: Query with expression in db.query()', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      upperTitle: c.upper(c.posts.title)
    }
  }));
  
  assert(results.length >= 1, 'Should have results');
  assertEquals(results[0].upperTitle, results[0].title.toUpperCase());
});

await asyncTest('Q-12: Aggregate with db.query() syntax', async () => {
  const result = await db.first(c => ({
    select: {
      totalPosts: c.count(),
      totalViews: c.sum(c.posts.views)
    }
  }));
  
  assertEquals(result.totalPosts, 4, 'Should have 4 total posts');
  assertEquals(result.totalViews, 400, 'Should have 400 total views');
});

await asyncTest('Q-13: Coalesce for null handling', async () => {
  const results = await db.query(c => ({
    select: {
      userName: c.users.name,
      dept: c.coalesce(c.users.department, 'Unassigned')
    },
    orderBy: c.users.name
  }));
  
  const eve = results.find(r => r.userName === 'Eve');
  assertEquals(eve?.dept, 'Unassigned', 'Null department should become Unassigned');
});

await asyncTest('Q-14: Case/If expressions', async () => {
  // Simple IIF test - SQLite IIF(condition, true_val, false_val)
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      views: c.posts.views,
      isPopular: c.if(c.gte(c.posts.views, 100), 'yes', 'no')
    }
  }));
  
  const advancedJoins = results.find(r => r.title === 'Advanced Joins');
  assertEquals(advancedJoins?.isPopular, 'yes', 'High views should be yes');
  
  const draft = results.find(r => r.title === 'Draft Post');
  assertEquals(draft?.isPopular, 'no', 'Zero views should be no');
});

await asyncTest('Q-15: Concat strings', async () => {
  const results = await db.query(c => ({
    select: {
      fullInfo: c.concat(c.users.name, ' - ', c.users.email)
    },
    where: {
      [c.users.id]: ids.alice
    }
  }));
  
  assertEquals(results[0].fullInfo, 'Alice - alice@test.com');
});

// ============================================
// WINDOW FUNCTIONS (Basic)
// ============================================
console.log('\n=== WINDOW FUNCTIONS ===\n');

await asyncTest('W-01: Row number', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      rowNum: c.rowNumber({ orderBy: c.posts.views })
    }
  }));
  
  assert(results.length === 4, 'Should have 4 posts');
  assert(results.some(r => r.rowNum === 1), 'Should have row 1');
  assert(results.some(r => r.rowNum === 4), 'Should have row 4');
});

await asyncTest('W-02: Rank by views', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      views: c.posts.views,
      viewRank: c.rank({ orderBy: c.posts.views, desc: true })
    }
  }));
  
  const topPost = results.find(r => r.viewRank === 1);
  assertEquals(topPost?.views, 250, 'Rank 1 should have highest views');
});

await asyncTest('W-03: Dense rank', async () => {
  const results = await db.query(c => ({
    select: {
      userName: c.users.name,
      salary: c.users.salary,
      salaryRank: c.denseRank({ orderBy: c.users.salary, desc: true })
    }
  }));
  
  assert(results.length === 5, 'Should have 5 users');
  const topEarner = results.find(r => r.salaryRank === 1);
  assertEquals(topEarner?.salary, 90000, 'Top earner should have 90000');
});

await asyncTest('W-04: Partition by with aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.posts.title,
      authorId: c.posts.authorId,
      authorPostCount: c.count({ partitionBy: c.posts.authorId })
    }
  }));
  
  const alicePosts = results.filter(r => r.authorId === ids.alice);
  assert(alicePosts.every(r => r.authorPostCount === 2), 'Alice should have 2 posts counted for each');
});

// ============================================
// EDGE CASES
// ============================================
console.log('\n=== EDGE CASES ===\n');

await asyncTest('E-01: Empty join result', async () => {
  // Eve has no posts
  const results = await db.query(c => ({
    select: {
      postTitle: c.posts.title,
      authorName: c.users.name
    },
    join: [c.posts.authorId, c.users.id],
    where: {
      [c.users.id]: ids.eve
    }
  }));
  
  assertEquals(results.length, 0, 'Eve should have no posts');
});

await asyncTest('E-02: Subquery with no results', async () => {
  const noResults = db.subquery(c => ({
    select: {
      authorId: c.posts.authorId
    },
    where: {
      [c.posts.views]: c.gt(c.posts.views, 10000)
    }
  }));
  
  const results = await db.query(c => {
    const sub = c.use(noResults);
    return {
      select: {
        userName: c.users.name
      },
      join: [c.users.id, sub.authorId]
    };
  });
  
  assertEquals(results.length, 0, 'Should have no results');
});

await asyncTest('E-03: GroupBy with no matching rows', async () => {
  const results = await db.posts.groupBy('authorId').count({
    column: { count: 'id' },
    where: { views: v => v.gt(10000) }
  });
  
  assertEquals(results.length, 0, 'Should have no results for impossible filter');
});

await asyncTest('E-04: Complex query on empty result set', async () => {
  const result = await db.posts.first({
    where: { id: 99999 }
  });
  
  assertEquals(result, undefined, 'Non-existent ID should return undefined');
});

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
fs.unlinkSync(TEST_DB);

if (failed > 0) {
  process.exit(1);
}
