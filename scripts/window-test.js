/**
 * Window Functions Test Suite
 * Phase 6 - Comprehensive window function coverage
 * 
 * Crafted by Demetrius QA/PM Specialist
 * 
 * Coverage:
 * - W-01 to W-06: Basic window functions (rowNumber, rank, denseRank, percentRank, cumeDist, ntile)
 * - P-01 to P-06: Partition by variations
 * - O-01 to O-05: Order by and descending
 * - L-01 to L-06: Lag and lead functions
 * - V-01 to V-05: First/last/nth value functions
 * - F-01 to F-05: Frame specifications (ROWS/RANGE BETWEEN)
 * - A-01 to A-05: Window aggregates (count, sum, avg, min, max with windows)
 * - C-01 to C-04: Complex window scenarios
 */

import { SQLiteDatabase, Table } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/window-test.db';

// Clean up before test
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

// ============================================
// Schema Definitions
// ============================================

class Employees extends Table {
  name;
  department;
  salary = this.Default(0);
  hireDate;
}

class Sales extends Table {
  employeeId = this.Default(0);
  amount = this.Default(0);
  saleDate;
  region;
}

class Scores extends Table {
  studentName;
  subject;
  score = this.Default(0);
  examDate;
}

class StockPrices extends Table {
  symbol;
  priceDate;
  openPrice = this.Default(0);
  closePrice = this.Default(0);
  volume = this.Default(0);
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ 
  Employees, 
  Sales, 
  Scores,
  StockPrices
});

// Initialize schema
const sql = db.diff();
await db.migrate(sql);
console.log('✓ Schema created\n');

// Seed test data
async function seedData() {
  // Employees with varying salaries and departments
  await db.employees.insertMany([
    { name: 'Alice', department: 'Engineering', salary: 90000, hireDate: '2020-01-15' },
    { name: 'Bob', department: 'Engineering', salary: 85000, hireDate: '2020-06-01' },
    { name: 'Carol', department: 'Engineering', salary: 85000, hireDate: '2021-03-10' },
    { name: 'David', department: 'Sales', salary: 75000, hireDate: '2019-08-20' },
    { name: 'Eve', department: 'Sales', salary: 80000, hireDate: '2020-02-28' },
    { name: 'Frank', department: 'Sales', salary: 70000, hireDate: '2021-07-15' },
    { name: 'Grace', department: 'Marketing', salary: 72000, hireDate: '2020-11-01' },
    { name: 'Henry', department: 'Marketing', salary: 68000, hireDate: '2022-01-20' }
  ]);

  // Sales data
  await db.sales.insertMany([
    { employeeId: 4, amount: 5000, saleDate: '2024-01-15', region: 'North' },
    { employeeId: 4, amount: 7500, saleDate: '2024-02-20', region: 'North' },
    { employeeId: 4, amount: 3000, saleDate: '2024-03-10', region: 'South' },
    { employeeId: 5, amount: 8000, saleDate: '2024-01-25', region: 'East' },
    { employeeId: 5, amount: 4500, saleDate: '2024-02-15', region: 'East' },
    { employeeId: 5, amount: 9000, saleDate: '2024-03-25', region: 'West' },
    { employeeId: 6, amount: 6000, saleDate: '2024-01-30', region: 'West' },
    { employeeId: 6, amount: 5500, saleDate: '2024-02-28', region: 'North' },
    { employeeId: 6, amount: 7000, saleDate: '2024-03-15', region: 'South' }
  ]);

  // Student scores
  await db.scores.insertMany([
    { studentName: 'John', subject: 'Math', score: 95, examDate: '2024-01-15' },
    { studentName: 'John', subject: 'Science', score: 88, examDate: '2024-01-16' },
    { studentName: 'John', subject: 'English', score: 92, examDate: '2024-01-17' },
    { studentName: 'Jane', subject: 'Math', score: 98, examDate: '2024-01-15' },
    { studentName: 'Jane', subject: 'Science', score: 94, examDate: '2024-01-16' },
    { studentName: 'Jane', subject: 'English', score: 89, examDate: '2024-01-17' },
    { studentName: 'Mike', subject: 'Math', score: 85, examDate: '2024-01-15' },
    { studentName: 'Mike', subject: 'Science', score: 90, examDate: '2024-01-16' },
    { studentName: 'Mike', subject: 'English', score: 87, examDate: '2024-01-17' }
  ]);

  // Stock prices (sequential data for lag/lead)
  await db.stockPrices.insertMany([
    { symbol: 'ACME', priceDate: '2024-01-01', openPrice: 100, closePrice: 102, volume: 1000 },
    { symbol: 'ACME', priceDate: '2024-01-02', openPrice: 102, closePrice: 105, volume: 1500 },
    { symbol: 'ACME', priceDate: '2024-01-03', openPrice: 105, closePrice: 103, volume: 1200 },
    { symbol: 'ACME', priceDate: '2024-01-04', openPrice: 103, closePrice: 108, volume: 2000 },
    { symbol: 'ACME', priceDate: '2024-01-05', openPrice: 108, closePrice: 110, volume: 1800 },
    { symbol: 'TECH', priceDate: '2024-01-01', openPrice: 200, closePrice: 198, volume: 500 },
    { symbol: 'TECH', priceDate: '2024-01-02', openPrice: 198, closePrice: 205, volume: 800 },
    { symbol: 'TECH', priceDate: '2024-01-03', openPrice: 205, closePrice: 210, volume: 1000 },
    { symbol: 'TECH', priceDate: '2024-01-04', openPrice: 210, closePrice: 208, volume: 600 },
    { symbol: 'TECH', priceDate: '2024-01-05', openPrice: 208, closePrice: 215, volume: 900 }
  ]);
}

await seedData();
console.log('✓ Seed data created\n');

let passed = 0;
let failed = 0;

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
// BASIC WINDOW FUNCTIONS
// ============================================
console.log('=== BASIC WINDOW FUNCTIONS ===\n');

await asyncTest('W-01: rowNumber with orderBy', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      rowNum: c.rowNumber({ orderBy: c.employees.salary, desc: true })
    }
  }));
  
  assertEquals(results.length, 8, 'Should return all employees');
  const first = results.find(r => r.rowNum === 1);
  assertEquals(first?.salary, 90000, 'Row 1 should have highest salary');
});

await asyncTest('W-02: rank with ties', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      salaryRank: c.rank({ orderBy: c.employees.salary, desc: true })
    }
  }));
  
  // Bob and Carol both have 85000, so they should share rank 2
  const bobRank = results.find(r => r.name === 'Bob')?.salaryRank;
  const carolRank = results.find(r => r.name === 'Carol')?.salaryRank;
  assertEquals(bobRank, carolRank, 'Tied salaries should have same rank');
});

await asyncTest('W-03: denseRank without gaps', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      denseRank: c.denseRank({ orderBy: c.employees.salary, desc: true })
    }
  }));
  
  // Dense rank should not skip numbers after ties
  const ranks = [...new Set(results.map(r => r.denseRank))].sort((a, b) => a - b);
  // Check ranks are consecutive (no gaps)
  for (let i = 1; i < ranks.length; i++) {
    assertEquals(ranks[i], ranks[i-1] + 1, 'Dense rank should be consecutive');
  }
});

await asyncTest('W-04: percentRank distribution', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      pctRank: c.percentRank({ orderBy: c.employees.salary })
    }
  }));
  
  // Percent rank should be between 0 and 1
  const lowest = results.reduce((min, r) => r.pctRank < min ? r.pctRank : min, 1);
  const highest = results.reduce((max, r) => r.pctRank > max ? r.pctRank : max, 0);
  assertEquals(lowest, 0, 'Lowest percent rank should be 0');
  assert(highest <= 1, 'Highest percent rank should be <= 1');
});

await asyncTest('W-05: cumeDist cumulative distribution', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      cumeDist: c.cumeDist({ orderBy: c.employees.salary })
    }
  }));
  
  // Cumulative distribution for highest salary should be 1
  const highest = results.find(r => r.salary === 90000);
  assertEquals(highest?.cumeDist, 1, 'Highest value should have cumeDist of 1');
});

await asyncTest('W-06: ntile bucket distribution', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      quartile: c.ntile({ groups: 4, orderBy: c.employees.salary })
    }
  }));
  
  // With 8 employees and 4 quartiles, each quartile should have 2 employees
  const quartileCounts = {};
  results.forEach(r => {
    quartileCounts[r.quartile] = (quartileCounts[r.quartile] || 0) + 1;
  });
  assertEquals(Object.keys(quartileCounts).length, 4, 'Should have 4 quartiles');
});

// ============================================
// PARTITION BY VARIATIONS
// ============================================
console.log('\n=== PARTITION BY VARIATIONS ===\n');

await asyncTest('P-01: Partition by department', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      deptRank: c.rank({ 
        partitionBy: c.employees.department, 
        orderBy: c.employees.salary, 
        desc: true 
      })
    }
  }));
  
  // Each department should have its own rank 1
  const rank1s = results.filter(r => r.deptRank === 1);
  assertEquals(rank1s.length, 3, 'Each of 3 departments should have a rank 1');
});

await asyncTest('P-02: rowNumber within partition', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      rowInDept: c.rowNumber({ 
        partitionBy: c.employees.department, 
        orderBy: c.employees.hireDate 
      })
    }
  }));
  
  // Check Engineering has correct row numbers
  const engRows = results.filter(r => r.department === 'Engineering');
  const rowNums = engRows.map(r => r.rowInDept).sort((a, b) => a - b);
  assertEquals(rowNums.join(','), '1,2,3', 'Engineering should have rows 1,2,3');
});

await asyncTest('P-03: Multiple columns in partitionBy', async () => {
  const results = await db.query(c => ({
    select: {
      employeeId: c.sales.employeeId,
      region: c.sales.region,
      amount: c.sales.amount,
      regionRank: c.rank({ 
        partitionBy: [c.sales.employeeId, c.sales.region], 
        orderBy: c.sales.amount, 
        desc: true 
      })
    }
  }));
  
  // Each employee+region combo should have its own ranking
  assert(results.every(r => r.regionRank >= 1), 'All ranks should be >= 1');
});

await asyncTest('P-04: Count partitioned by category', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      deptSize: c.count({ partitionBy: c.employees.department })
    }
  }));
  
  // Engineering has 3, Sales has 3, Marketing has 2
  const eng = results.find(r => r.department === 'Engineering');
  assertEquals(eng?.deptSize, 3, 'Engineering should have 3 employees');
  
  const mkt = results.find(r => r.department === 'Marketing');
  assertEquals(mkt?.deptSize, 2, 'Marketing should have 2 employees');
});

await asyncTest('P-05: Sum partitioned', async () => {
  const results = await db.query(c => ({
    select: {
      employeeId: c.sales.employeeId,
      amount: c.sales.amount,
      empTotal: c.sum({ column: c.sales.amount, partitionBy: c.sales.employeeId })
    }
  }));
  
  // Employee 4 has sales of 5000 + 7500 + 3000 = 15500
  const emp4 = results.find(r => r.employeeId === 4);
  assertEquals(emp4?.empTotal, 15500, 'Employee 4 total should be 15500');
});

await asyncTest('P-06: Avg partitioned by subject', async () => {
  const results = await db.query(c => ({
    select: {
      subject: c.scores.subject,
      studentName: c.scores.studentName,
      score: c.scores.score,
      subjectAvg: c.avg({ column: c.scores.score, partitionBy: c.scores.subject })
    }
  }));
  
  // Each subject should have a consistent average across all rows
  const mathRows = results.filter(r => r.subject === 'Math');
  const mathAvg = mathRows[0]?.subjectAvg;
  assert(mathRows.every(r => r.subjectAvg === mathAvg), 'All Math rows should have same avg');
});

// ============================================
// ORDER BY VARIATIONS
// ============================================
console.log('\n=== ORDER BY VARIATIONS ===\n');

await asyncTest('O-01: Order by ascending (default)', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      rowNum: c.rowNumber({ orderBy: c.employees.salary })
    }
  }));
  
  const first = results.find(r => r.rowNum === 1);
  assertEquals(first?.salary, 68000, 'Row 1 should have lowest salary in ascending order');
});

await asyncTest('O-02: Order by descending', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      rowNum: c.rowNumber({ orderBy: c.employees.salary, desc: true })
    }
  }));
  
  const first = results.find(r => r.rowNum === 1);
  assertEquals(first?.salary, 90000, 'Row 1 should have highest salary in descending order');
});

await asyncTest('O-03: Multiple columns in orderBy', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      rowNum: c.rowNumber({ orderBy: [c.employees.department, c.employees.salary] })
    }
  }));
  
  // Should order by department first, then salary within department
  const first = results.find(r => r.rowNum === 1);
  assertEquals(first?.department, 'Engineering', 'First row should be Engineering (alphabetically first)');
});

await asyncTest('O-04: Order by date column', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      dayNum: c.rowNumber({ 
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // ACME day 1 should be 2024-01-01
  const acmeDay1 = results.find(r => r.symbol === 'ACME' && r.dayNum === 1);
  assertEquals(acmeDay1?.priceDate, '2024-01-01', 'Day 1 should be first date');
});

await asyncTest('O-05: Rank with orderBy expression', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      salaryRank: c.rank({ orderBy: c.employees.salary, desc: true })
    },
    orderBy: c.employees.salary,
    desc: true
  }));
  
  // Results should be ordered by salary descending
  assert(results[0].salary >= results[1].salary, 'Results should be ordered by salary');
});

// ============================================
// LAG AND LEAD FUNCTIONS
// ============================================
console.log('\n=== LAG AND LEAD FUNCTIONS ===\n');

await asyncTest('L-01: Lag to get previous value', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      prevClose: c.lag({ 
        expression: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // First day should have null prevClose
  const acmeDay1 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-01');
  assertEquals(acmeDay1?.prevClose, null, 'First day should have null previous close');
  
  // Second day should have day 1's close
  const acmeDay2 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-02');
  assertEquals(acmeDay2?.prevClose, 102, 'Day 2 prevClose should be day 1 close');
});

await asyncTest('L-02: Lag with offset > 1', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      twoDaysAgo: c.lag({ 
        expression: c.stockPrices.closePrice,
        offset: 2,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // Day 3 should have day 1's close
  const acmeDay3 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-03');
  assertEquals(acmeDay3?.twoDaysAgo, 102, 'Day 3 should reference day 1 close (102)');
});

await asyncTest('L-03: Lead to get next value', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      nextClose: c.lead({ 
        expression: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // Last day should have null nextClose
  const acmeDay5 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-05');
  assertEquals(acmeDay5?.nextClose, null, 'Last day should have null next close');
  
  // Day 4 should have day 5's close
  const acmeDay4 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-04');
  assertEquals(acmeDay4?.nextClose, 110, 'Day 4 nextClose should be day 5 close');
});

await asyncTest('L-04: Lead with offset > 1', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      twoDaysLater: c.lead({ 
        expression: c.stockPrices.closePrice,
        offset: 2,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // Day 1 should have day 3's close
  const acmeDay1 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-01');
  assertEquals(acmeDay1?.twoDaysLater, 103, 'Day 1 should reference day 3 close (103)');
});

await asyncTest('L-05: Lag and lead in same query', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      prevClose: c.lag({ 
        expression: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      }),
      nextClose: c.lead({ 
        expression: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // Middle day should have both prev and next
  const acmeDay3 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-03');
  assertEquals(acmeDay3?.prevClose, 105, 'Day 3 should have prev from day 2');
  assertEquals(acmeDay3?.nextClose, 108, 'Day 3 should have next from day 4');
});

await asyncTest('L-06: Price change calculation with lag', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      prevClose: c.lag({ 
        expression: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate 
      })
    }
  }));
  
  // Calculate price change manually
  const acmeDay2 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-02');
  const change = acmeDay2.closePrice - acmeDay2.prevClose;
  assertEquals(change, 3, 'Price change from 102 to 105 should be 3');
});

// ============================================
// FIRST/LAST/NTH VALUE FUNCTIONS
// ============================================
console.log('\n=== FIRST/LAST/NTH VALUE FUNCTIONS ===\n');

await asyncTest('V-01: firstValue in partition', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      topSalary: c.firstValue({ 
        expression: c.employees.salary,
        partitionBy: c.employees.department, 
        orderBy: c.employees.salary,
        desc: true
      })
    }
  }));
  
  // Each employee should see their department's top salary
  const engResults = results.filter(r => r.department === 'Engineering');
  assert(engResults.every(r => r.topSalary === 90000), 'All Engineering should see top salary 90000');
});

await asyncTest('V-02: lastValue in partition', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      lowestInDept: c.lastValue({ 
        expression: c.employees.salary,
        partitionBy: c.employees.department, 
        orderBy: c.employees.salary,
        desc: true,
        frame: {
          type: 'rows',
          preceding: 'unbounded',
          following: 'unbounded'
        }
      })
    }
  }));
  
  // With full frame, should see department's lowest salary
  const engResults = results.filter(r => r.department === 'Engineering');
  // Engineering lowest is 85000 (Bob and Carol)
  assert(engResults.every(r => r.lowestInDept === 85000), 'All Engineering should see lowest salary 85000');
});

await asyncTest('V-03: nthValue gets specific row', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      secondHighest: c.nthValue({ 
        expression: c.employees.salary,
        row: 2,
        partitionBy: c.employees.department, 
        orderBy: c.employees.salary,
        desc: true,
        frame: {
          type: 'rows',
          preceding: 'unbounded',
          following: 'unbounded'
        }
      })
    }
  }));
  
  // Engineering second highest is 85000 (with unbounded frame, all rows see it)
  const eng = results.find(r => r.department === 'Engineering');
  assertEquals(eng?.secondHighest, 85000, 'Second highest in Engineering should be 85000');
});

await asyncTest('V-04: firstValue for earliest hire', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      hireDate: c.employees.hireDate,
      firstHire: c.firstValue({ 
        expression: c.employees.name,
        partitionBy: c.employees.department, 
        orderBy: c.employees.hireDate
      })
    }
  }));
  
  // Engineering's first hire was Alice (2020-01-15)
  const engResults = results.filter(r => r.department === 'Engineering');
  assert(engResults.every(r => r.firstHire === 'Alice'), 'First hire in Engineering should be Alice');
});

await asyncTest('V-05: firstValue across whole result', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      highestSalary: c.firstValue({ 
        expression: c.employees.salary,
        orderBy: c.employees.salary,
        desc: true
      })
    }
  }));
  
  // Everyone should see the global highest salary
  assert(results.every(r => r.highestSalary === 90000), 'All should see highest salary');
});

// ============================================
// FRAME SPECIFICATIONS
// ============================================
console.log('\n=== FRAME SPECIFICATIONS ===\n');

await asyncTest('F-01: Running sum with rows unbounded preceding', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      volume: c.stockPrices.volume,
      runningVolume: c.sum({ 
        column: c.stockPrices.volume,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate,
        frame: {
          type: 'rows',
          preceding: 'unbounded',
          following: 0
        }
      })
    }
  }));
  
  // ACME day 1 running total should just be day 1 volume
  const acmeDay1 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-01');
  assertEquals(acmeDay1?.runningVolume, 1000, 'Day 1 running volume should be 1000');
  
  // ACME day 2 running total should be 1000 + 1500 = 2500
  const acmeDay2 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-02');
  assertEquals(acmeDay2?.runningVolume, 2500, 'Day 2 running volume should be 2500');
});

await asyncTest('F-02: Moving average with fixed window', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      movingAvg: c.avg({ 
        column: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate,
        frame: {
          type: 'rows',
          preceding: 2,
          following: 0
        }
      })
    }
  }));
  
  // Moving avg of last 3 days for ACME day 5: (103 + 108 + 110) / 3 = 107
  const acmeDay5 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-05');
  assert(acmeDay5?.movingAvg >= 106 && acmeDay5?.movingAvg <= 108, 
    'Day 5 moving avg should be around 107');
});

await asyncTest('F-03: Count with current row only', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      frameCount: c.count({ 
        orderBy: c.employees.salary,
        frame: {
          type: 'rows',
          preceding: 0,
          following: 0
        }
      })
    }
  }));
  
  // With just current row, count should always be 1
  assert(results.every(r => r.frameCount === 1), 'Current row only should count 1');
});

await asyncTest('F-04: Sum with rows between', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      volume: c.stockPrices.volume,
      windowSum: c.sum({ 
        column: c.stockPrices.volume,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate,
        frame: {
          type: 'rows',
          preceding: 1,
          following: 1
        }
      })
    }
  }));
  
  // ACME day 3: sum of day 2 + day 3 + day 4 = 1500 + 1200 + 2000 = 4700
  const acmeDay3 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-03');
  assertEquals(acmeDay3?.windowSum, 4700, 'Day 3 window sum should be 4700');
});

await asyncTest('F-05: Max with unbounded following', async () => {
  const results = await db.query(c => ({
    select: {
      symbol: c.stockPrices.symbol,
      priceDate: c.stockPrices.priceDate,
      closePrice: c.stockPrices.closePrice,
      maxRemaining: c.max({ 
        column: c.stockPrices.closePrice,
        partitionBy: c.stockPrices.symbol, 
        orderBy: c.stockPrices.priceDate,
        frame: {
          type: 'rows',
          preceding: 0,
          following: 'unbounded'
        }
      })
    }
  }));
  
  // ACME day 1: max from day 1 onwards is 110 (day 5)
  const acmeDay1 = results.find(r => r.symbol === 'ACME' && r.priceDate === '2024-01-01');
  assertEquals(acmeDay1?.maxRemaining, 110, 'Day 1 max remaining should be 110');
});

// ============================================
// WINDOW AGGREGATES
// ============================================
console.log('\n=== WINDOW AGGREGATES ===\n');

await asyncTest('A-01: Count as window aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      deptCount: c.count({ partitionBy: c.employees.department })
    }
  }));
  
  // All Engineering rows should show 3
  const engResults = results.filter(r => r.department === 'Engineering');
  assert(engResults.every(r => r.deptCount === 3), 'Engineering count should be 3');
});

await asyncTest('A-02: Sum as window aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      salary: c.employees.salary,
      deptTotal: c.sum({ column: c.employees.salary, partitionBy: c.employees.department })
    }
  }));
  
  // Engineering total: 90000 + 85000 + 85000 = 260000
  const eng = results.find(r => r.department === 'Engineering');
  assertEquals(eng?.deptTotal, 260000, 'Engineering total should be 260000');
});

await asyncTest('A-03: Avg as window aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      salary: c.employees.salary,
      deptAvg: c.avg({ column: c.employees.salary, partitionBy: c.employees.department })
    }
  }));
  
  // Marketing avg: (72000 + 68000) / 2 = 70000
  const mkt = results.find(r => r.department === 'Marketing');
  assertEquals(mkt?.deptAvg, 70000, 'Marketing avg should be 70000');
});

await asyncTest('A-04: Min as window aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      salary: c.employees.salary,
      deptMin: c.min({ column: c.employees.salary, partitionBy: c.employees.department })
    }
  }));
  
  // Sales min: 70000 (Frank)
  const sales = results.find(r => r.department === 'Sales');
  assertEquals(sales?.deptMin, 70000, 'Sales min should be 70000');
});

await asyncTest('A-05: Max as window aggregate', async () => {
  const results = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      salary: c.employees.salary,
      deptMax: c.max({ column: c.employees.salary, partitionBy: c.employees.department })
    }
  }));
  
  // Sales max: 80000 (Eve)
  const sales = results.find(r => r.department === 'Sales');
  assertEquals(sales?.deptMax, 80000, 'Sales max should be 80000');
});

// ============================================
// COMPLEX WINDOW SCENARIOS
// ============================================
console.log('\n=== COMPLEX WINDOW SCENARIOS ===\n');

await asyncTest('C-01: Multiple window functions in same query', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      deptRank: c.rank({ partitionBy: c.employees.department, orderBy: c.employees.salary, desc: true }),
      globalRank: c.rank({ orderBy: c.employees.salary, desc: true }),
      deptCount: c.count({ partitionBy: c.employees.department })
    }
  }));
  
  // Alice should be rank 1 in Engineering and rank 1 globally
  const alice = results.find(r => r.name === 'Alice');
  assertEquals(alice?.deptRank, 1, 'Alice should be rank 1 in department');
  assertEquals(alice?.globalRank, 1, 'Alice should be rank 1 globally');
});

await asyncTest('C-02: Window function with filter/where', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      department: c.employees.department,
      salary: c.employees.salary,
      salaryRank: c.rank({ orderBy: c.employees.salary, desc: true })
    },
    where: {
      [c.employees.department]: 'Engineering'
    }
  }));
  
  assertEquals(results.length, 3, 'Should only have 3 Engineering employees');
  assert(results.every(r => r.department === 'Engineering'), 'All should be Engineering');
});

await asyncTest('C-03: Combining window with orderBy', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.employees.name,
      salary: c.employees.salary,
      salaryRank: c.rank({ orderBy: c.employees.salary, desc: true })
    },
    orderBy: c.employees.salary,
    desc: true
  }));
  
  // First result should have rank 1
  assertEquals(results[0].salaryRank, 1, 'First result should have rank 1');
});

await asyncTest('C-04: Window with groupBy comparison', async () => {
  // Using window functions gives per-row results unlike groupBy
  const windowResults = await db.query(c => ({
    select: {
      department: c.employees.department,
      name: c.employees.name,
      deptTotal: c.sum({ column: c.employees.salary, partitionBy: c.employees.department })
    }
  }));
  
  // Window function returns all rows
  assertEquals(windowResults.length, 8, 'Window should return all rows');
  
  // Compare with groupBy which returns one row per group
  const groupResults = await db.query(c => ({
    select: {
      department: c.employees.department,
      total: c.sum(c.employees.salary)
    },
    groupBy: c.employees.department
  }));
  
  assertEquals(groupResults.length, 3, 'GroupBy should return one row per department');
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
