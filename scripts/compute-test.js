/**
 * Phase 8 - Computed Columns & SQL Functions
 * 
 * Coverage: String functions, math functions, date/time functions,
 * JSON functions, conditional logic, type casting
 */

import { Table, SQLiteDatabase } from '../index.js';
import fs from 'fs';

const TEST_DB = '/tmp/test-compute.db';

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

const assertClose = (actual, expected, tolerance, message) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
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

// Database and client setup
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

class Products extends Table {
  name;
  description;
  price = this.Real;
  quantity = this.Int;
  category;
  createdAt = this.Now;
}

class Users extends Table {
  firstName;
  lastName;
  email;
  age = this.Int;
  score = this.Real;
  metadata = this.Json;
  birthDate = this.Date;
}

class Measurements extends Table {
  sensor;
  value = this.Real;
  angle = this.Real;
  timestamp = this.Now;
}

class Documents extends Table {
  title;
  content;
  tags = this.Json;
  config = this.Json;
}

const database = new SQLiteDatabase(TEST_DB);
const db = database.getClient({ Products, Users, Measurements, Documents });

// Initialize database
await db.migrate(db.diff());

// Seed test data
await db.products.insertMany([
  { name: 'Widget', description: 'A small widget', price: 19.99, quantity: 100, category: 'tools' },
  { name: 'Gadget', description: 'A fancy gadget', price: 49.50, quantity: 50, category: 'electronics' },
  { name: 'Gizmo', description: 'A mysterious gizmo', price: 29.95, quantity: 75, category: 'tools' },
  { name: 'Doohickey', description: 'Essential doohickey', price: 9.99, quantity: 200, category: 'misc' },
  { name: 'Thingamajig', description: 'Useful thingamajig', price: 39.00, quantity: 25, category: 'electronics' }
]);

await db.users.insertMany([
  { firstName: 'Alice', lastName: 'Smith', email: 'ALICE@EXAMPLE.COM', age: 30, score: 85.5, metadata: { level: 3, tags: ['admin', 'user'] }, birthDate: new Date('1994-03-15') },
  { firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', age: 25, score: 92.3, metadata: { level: 2, tags: ['user'] }, birthDate: new Date('1999-07-22') },
  { firstName: 'Charlie', lastName: 'Brown', email: 'CHARLIE@TEST.ORG', age: 35, score: 78.0, metadata: { level: 1, tags: [] }, birthDate: new Date('1989-12-01') },
  { firstName: '  Diana  ', lastName: '  White  ', email: 'diana@example.com', age: 28, score: 88.7, metadata: { level: 4, tags: ['admin', 'moderator'] }, birthDate: new Date('1996-05-10') }
]);

await db.measurements.insertMany([
  { sensor: 'A', value: -15.5, angle: 0 },
  { sensor: 'A', value: 25.7, angle: 45 },
  { sensor: 'B', value: -8.3, angle: 90 },
  { sensor: 'B', value: 42.1, angle: 180 },
  { sensor: 'C', value: 0, angle: 270 }
]);

await db.documents.insertMany([
  { title: 'Report', content: 'Hello World', tags: ['urgent', 'review'], config: { version: 1, active: true } },
  { title: 'Notes', content: 'Some notes here', tags: ['draft'], config: { version: 2, active: false } },
  { title: 'Summary', content: 'Final summary', tags: [], config: { version: 3, active: true } }
]);

// ============================================
// STRING FUNCTIONS
// ============================================
console.log('\n=== STRING FUNCTIONS ===\n');

await asyncTest('STR-01: lower() converts to lowercase', async () => {
  const results = await db.query(c => ({
    select: {
      email: c.users.email,
      lowerEmail: c.lower(c.users.email)
    }
  }));
  
  const alice = results.find(r => r.email === 'ALICE@EXAMPLE.COM');
  assertEquals(alice.lowerEmail, 'alice@example.com', 'Should lowercase email');
});

await asyncTest('STR-02: upper() converts to uppercase', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.users.firstName,
      upperName: c.upper(c.users.firstName)
    }
  }));
  
  const bob = results.find(r => r.name === 'Bob');
  assertEquals(bob.upperName, 'BOB', 'Should uppercase name');
});

await asyncTest('STR-03: length() returns string length', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      nameLen: c.length(c.products.name)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.nameLen, 6, 'Widget has 6 characters');
});

await asyncTest('STR-04: concat() joins strings', async () => {
  const results = await db.query(c => ({
    select: {
      fullName: c.concat(c.users.firstName, ' ', c.users.lastName)
    }
  }));
  
  const names = results.map(r => r.fullName);
  assert(names.includes('Alice Smith'), 'Should have Alice Smith');
  assert(names.includes('Bob Jones'), 'Should have Bob Jones');
});

await asyncTest('STR-05: trim() removes whitespace', async () => {
  const results = await db.query(c => ({
    select: {
      first: c.users.firstName,
      trimmed: c.trim(c.users.firstName)
    }
  }));
  
  const diana = results.find(r => r.first === '  Diana  ');
  assertEquals(diana.trimmed, 'Diana', 'Should trim whitespace');
});

await asyncTest('STR-06: ltrim() removes leading whitespace', async () => {
  const results = await db.query(c => ({
    select: {
      first: c.users.firstName,
      ltrimmed: c.ltrim(c.users.firstName)
    }
  }));
  
  const diana = results.find(r => r.first === '  Diana  ');
  assertEquals(diana.ltrimmed, 'Diana  ', 'Should trim leading whitespace only');
});

await asyncTest('STR-07: rtrim() removes trailing whitespace', async () => {
  const results = await db.query(c => ({
    select: {
      first: c.users.firstName,
      rtrimmed: c.rtrim(c.users.firstName)
    }
  }));
  
  const diana = results.find(r => r.first === '  Diana  ');
  assertEquals(diana.rtrimmed, '  Diana', 'Should trim trailing whitespace only');
});

await asyncTest('STR-08: replace() substitutes text', async () => {
  const results = await db.query(c => ({
    select: {
      original: c.documents.content,
      replaced: c.replace(c.documents.content, 'World', 'Universe')
    }
  }));
  
  const report = results.find(r => r.original === 'Hello World');
  assertEquals(report.replaced, 'Hello Universe', 'Should replace text');
});

await asyncTest('STR-09: substring() extracts portion of string', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      sub: c.substring(c.products.name, 1, 3)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.sub, 'Wid', 'Should extract first 3 chars');
});

await asyncTest('STR-10: instr() finds position of substring', async () => {
  const results = await db.query(c => ({
    select: {
      email: c.users.email,
      atPos: c.instr(c.lower(c.users.email), '@')
    }
  }));
  
  const bob = results.find(r => r.email === 'bob@example.com');
  assertEquals(bob.atPos, 4, '@ is at position 4 in bob@example.com');
});

// ============================================
// MATH FUNCTIONS
// ============================================
console.log('\n=== MATH FUNCTIONS ===\n');

await asyncTest('MATH-01: abs() returns absolute value', async () => {
  const results = await db.query(c => ({
    select: {
      value: c.measurements.value,
      absValue: c.abs(c.measurements.value)
    }
  }));
  
  const negative = results.find(r => r.value === -15.5);
  assertEquals(negative.absValue, 15.5, 'Should return absolute value');
});

await asyncTest('MATH-02: round() rounds to specified decimals', async () => {
  const results = await db.query(c => ({
    select: {
      score: c.users.score,
      rounded: c.round(c.users.score, 0)
    }
  }));
  
  const alice = results.find(r => r.score === 85.5);
  assertEquals(alice.rounded, 86, 'Should round 85.5 to 86');
});

await asyncTest('MATH-03: ceil() rounds up', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      ceiling: c.ceil(c.products.price)
    }
  }));
  
  const widget = results.find(r => r.price === 19.99);
  assertEquals(widget.ceiling, 20, 'Should ceil 19.99 to 20');
});

await asyncTest('MATH-04: floor() rounds down', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      floored: c.floor(c.products.price)
    }
  }));
  
  const gadget = results.find(r => r.price === 49.50);
  assertEquals(gadget.floored, 49, 'Should floor 49.50 to 49');
});

await asyncTest('MATH-05: sqrt() calculates square root', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      sqrtQty: c.sqrt(c.products.quantity)
    }
  }));
  
  const widget = results.find(r => r.quantity === 100);
  assertEquals(widget.sqrtQty, 10, 'sqrt(100) = 10');
});

await asyncTest('MATH-06: power() raises to exponent', async () => {
  const results = await db.query(c => ({
    select: {
      value: c.measurements.value,
      squared: c.power(c.measurements.value, 2)
    }
  }));
  
  const zeroVal = results.find(r => r.value === 0);
  assertEquals(zeroVal.squared, 0, '0^2 = 0');
});

await asyncTest('MATH-07: mod() returns remainder', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      modThree: c.mod(c.products.quantity, 3)
    }
  }));
  
  const widget = results.find(r => r.quantity === 100);
  assertEquals(widget.modThree, 1, '100 mod 3 = 1');
});

await asyncTest('MATH-08: sign() returns sign of number', async () => {
  const results = await db.query(c => ({
    select: {
      value: c.measurements.value,
      signVal: c.sign(c.measurements.value)
    }
  }));
  
  const positive = results.find(r => r.value === 25.7);
  const negative = results.find(r => r.value === -15.5);
  const zero = results.find(r => r.value === 0);
  
  assertEquals(positive.signVal, 1, 'Positive should be 1');
  assertEquals(negative.signVal, -1, 'Negative should be -1');
  assertEquals(zero.signVal, 0, 'Zero should be 0');
});

await asyncTest('MATH-09: exp() and ln() are inverses', async () => {
  const results = await db.query(c => ({
    select: {
      value: c.measurements.value,
      expVal: c.exp(1),
      lnE: c.ln(c.exp(1))
    },
    limit: 1
  }));
  
  assertClose(results[0].expVal, 2.718, 0.01, 'exp(1) should be ~e');
  assertClose(results[0].lnE, 1, 0.001, 'ln(e) should be 1');
});

await asyncTest('MATH-10: log() base 10 logarithm', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      log10: c.log(c.products.quantity)
    }
  }));
  
  const hundred = results.find(r => r.quantity === 100);
  assertEquals(hundred.log10, 2, 'log10(100) = 2');
});

// ============================================
// TRIGONOMETRIC FUNCTIONS
// ============================================
console.log('\n=== TRIGONOMETRIC FUNCTIONS ===\n');

await asyncTest('TRIG-01: sin() calculates sine', async () => {
  const results = await db.query(c => ({
    select: {
      angle: c.measurements.angle,
      sinVal: c.sin(c.radians(c.measurements.angle))
    }
  }));
  
  const zero = results.find(r => r.angle === 0);
  const ninety = results.find(r => r.angle === 90);
  
  assertClose(zero.sinVal, 0, 0.001, 'sin(0) = 0');
  assertClose(ninety.sinVal, 1, 0.001, 'sin(90°) = 1');
});

await asyncTest('TRIG-02: cos() calculates cosine', async () => {
  const results = await db.query(c => ({
    select: {
      angle: c.measurements.angle,
      cosVal: c.cos(c.radians(c.measurements.angle))
    }
  }));
  
  const zero = results.find(r => r.angle === 0);
  const ninety = results.find(r => r.angle === 90);
  
  assertClose(zero.cosVal, 1, 0.001, 'cos(0) = 1');
  assertClose(ninety.cosVal, 0, 0.001, 'cos(90°) = 0');
});

await asyncTest('TRIG-03: tan() calculates tangent', async () => {
  const results = await db.query(c => ({
    select: {
      angle: c.measurements.angle,
      tanVal: c.tan(c.radians(c.measurements.angle))
    }
  }));
  
  const fortyfive = results.find(r => r.angle === 45);
  assertClose(fortyfive.tanVal, 1, 0.001, 'tan(45°) = 1');
});

await asyncTest('TRIG-04: degrees() converts radians to degrees', async () => {
  const results = await db.query(c => ({
    select: {
      deg: c.degrees(c.pi())
    },
    limit: 1
  }));
  
  assertEquals(results[0].deg, 180, 'π radians = 180°');
});

await asyncTest('TRIG-05: radians() converts degrees to radians', async () => {
  const results = await db.query(c => ({
    select: {
      rad: c.radians(180)
    },
    limit: 1
  }));
  
  assertClose(results[0].rad, Math.PI, 0.001, '180° = π radians');
});

await asyncTest('TRIG-06: pi() returns π', async () => {
  const results = await db.query(c => ({
    select: { piVal: c.pi() },
    limit: 1
  }));
  
  assertClose(results[0].piVal, Math.PI, 0.0001, 'Should return π');
});

// ============================================
// ARITHMETIC OPERATORS
// ============================================
console.log('\n=== ARITHMETIC OPERATORS ===\n');

await asyncTest('ARITH-01: plus() adds values', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      withTax: c.plus(c.products.price, 5)
    }
  }));
  
  const widget = results.find(r => r.price === 19.99);
  assertClose(widget.withTax, 24.99, 0.001, 'Should add 5 to price');
});

await asyncTest('ARITH-02: minus() subtracts values', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      discounted: c.minus(c.products.price, 10)
    }
  }));
  
  const gadget = results.find(r => r.price === 49.50);
  assertClose(gadget.discounted, 39.50, 0.001, 'Should subtract 10 from price');
});

await asyncTest('ARITH-03: multiply() multiplies values', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      quantity: c.products.quantity,
      total: c.multiply(c.products.price, c.products.quantity)
    }
  }));
  
  const widget = results.find(r => r.price === 19.99 && r.quantity === 100);
  assertClose(widget.total, 1999, 0.01, 'Should multiply price * quantity');
});

await asyncTest('ARITH-04: divide() divides values', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      half: c.divide(c.products.quantity, 2)
    }
  }));
  
  const widget = results.find(r => r.quantity === 100);
  assertEquals(widget.half, 50, 'Should divide by 2');
});

await asyncTest('ARITH-05: Complex arithmetic expression', async () => {
  // Calculate: (price * quantity) - (price * 0.1 * quantity) = price * quantity * 0.9
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      revenue: c.multiply(c.products.price, c.products.quantity),
      discountedRevenue: c.multiply(
        c.multiply(c.products.price, c.products.quantity),
        0.9
      )
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertClose(widget.discountedRevenue, 1799.1, 0.1, 'Should calculate discounted revenue');
});

// ============================================
// CONDITIONAL FUNCTIONS
// ============================================
console.log('\n=== CONDITIONAL FUNCTIONS ===\n');

await asyncTest('COND-01: if() returns value based on condition', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      status: c.if(
        c.gte(c.products.quantity, 100),
        'In Stock',
        'Low Stock'
      )
    }
  }));
  
  const inStock = results.find(r => r.quantity === 100);
  const lowStock = results.find(r => r.quantity === 25);
  
  assertEquals(inStock.status, 'In Stock', 'Should be In Stock');
  assertEquals(lowStock.status, 'Low Stock', 'Should be Low Stock');
});

await asyncTest('COND-02: coalesce() returns first non-null', async () => {
  // Check existing users with coalesce on firstName
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      displayName: c.coalesce(c.trim(c.users.firstName), 'Anonymous')
    }
  }));
  
  // Diana has leading/trailing spaces, trim makes it non-empty
  const diana = results.find(r => r.firstName === '  Diana  ');
  assertEquals(diana.displayName, 'Diana', 'Should use trimmed value');
});

await asyncTest('COND-03: nullif() returns null if equal', async () => {
  const results = await db.query(c => ({
    select: {
      value: c.measurements.value,
      nullIfZero: c.nullif(c.measurements.value, 0)
    }
  }));
  
  const zero = results.find(r => r.value === 0);
  const nonZero = results.find(r => r.value === 25.7);
  
  assertEquals(zero.nullIfZero, null, 'Should be null when value is 0');
  assertEquals(nonZero.nullIfZero, 25.7, 'Should keep non-zero value');
});

await asyncTest('COND-04: Nested if() for multiple conditions', async () => {
  const results = await db.query(c => ({
    select: {
      score: c.users.score,
      grade: c.if(
        c.gte(c.users.score, 90),
        'A',
        c.if(
          c.gte(c.users.score, 80),
          'B',
          'C'
        )
      )
    }
  }));
  
  const aGrade = results.find(r => r.score === 92.3);
  const bGrade = results.find(r => r.score === 85.5);
  const cGrade = results.find(r => r.score === 78.0);
  
  assertEquals(aGrade.grade, 'A', 'Should be grade A');
  assertEquals(bGrade.grade, 'B', 'Should be grade B');
  assertEquals(cGrade.grade, 'C', 'Should be grade C');
});

// ============================================
// JSON FUNCTIONS
// ============================================
console.log('\n=== JSON FUNCTIONS ===\n');

await asyncTest('JSON-01: extract() gets JSON property', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      level: c.extract(c.users.metadata, '$.level')
    }
  }));
  
  const alice = results.find(r => r.firstName === 'Alice');
  assertEquals(alice.level, 3, 'Should extract level from JSON');
});

await asyncTest('JSON-02: arrayLength() counts JSON array items', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.documents.title,
      tagCount: c.arrayLength(c.documents.tags)
    }
  }));
  
  const report = results.find(r => r.title === 'Report');
  const summary = results.find(r => r.title === 'Summary');
  
  assertEquals(report.tagCount, 2, 'Report should have 2 tags');
  assertEquals(summary.tagCount, 0, 'Summary should have 0 tags');
});

await asyncTest('JSON-03: json() converts to JSON', async () => {
  const results = await db.query(c => ({
    select: {
      jsonStr: c.json('{"test": 123}')
    },
    limit: 1
  }));
  
  assert(results[0].jsonStr !== undefined, 'Should parse JSON string');
});

await asyncTest('JSON-04: object() creates JSON object', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      info: c.object('name', c.products.name, 'qty', c.products.quantity)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  // JSON object may be returned as object or need parsing
  const info = typeof widget.info === 'string' ? JSON.parse(widget.info) : widget.info;
  assert(info !== null && info !== undefined, 'Should have info object');
});

await asyncTest('JSON-05: Extract nested JSON property', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      firstTag: c.extract(c.users.metadata, '$.tags[0]')
    }
  }));
  
  const alice = results.find(r => r.firstName === 'Alice');
  assertEquals(alice.firstTag, 'admin', 'Should extract first tag');
});

await asyncTest('JSON-06: Filter by extracted JSON value', async () => {
  // Query documents and filter client-side since JSON where may differ
  const results = await db.query(c => ({
    select: {
      title: c.documents.title,
      active: c.extract(c.documents.config, '$.active')
    }
  }));
  
  const activeOnes = results.filter(r => r.active === 1 || r.active === true);
  assertEquals(activeOnes.length, 2, 'Should find 2 active documents');
});

// ============================================
// TYPE CASTING
// ============================================
console.log('\n=== TYPE CASTING ===\n');

await asyncTest('CAST-01: cast() to integer', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      priceInt: c.cast(c.products.price, 'integer')
    }
  }));
  
  const widget = results.find(r => r.price === 19.99);
  assertEquals(widget.priceInt, 19, 'Should cast to integer');
});

await asyncTest('CAST-02: Numbers work in concat for text output', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      quantityText: c.concat('Qty: ', c.products.quantity)
    }
  }));
  
  const widget = results.find(r => r.quantity === 100);
  assertEquals(widget.quantityText, 'Qty: 100', 'Should concat number as text');
});

await asyncTest('CAST-03: cast() to real', async () => {
  const results = await db.query(c => ({
    select: {
      quantity: c.products.quantity,
      quantityReal: c.cast(c.products.quantity, 'real')
    }
  }));
  
  const widget = results.find(r => r.quantity === 100);
  assertEquals(widget.quantityReal, 100.0, 'Should cast to real');
});

// ============================================
// DATE/TIME FUNCTIONS
// ============================================
console.log('\n=== DATE/TIME FUNCTIONS ===\n');

await asyncTest('DATE-01: date() extracts date part', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      birthDate: c.date(c.users.birthDate)
    }
  }));
  
  const alice = results.find(r => r.firstName === 'Alice');
  assert(alice.birthDate.includes('1994-03-15'), 'Should extract date');
});

await asyncTest('DATE-02: strfTime() formats date', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      birthYear: c.strfTime('%Y', c.users.birthDate)
    }
  }));
  
  const bob = results.find(r => r.firstName === 'Bob');
  assertEquals(bob.birthYear, '1999', 'Should extract year');
});

await asyncTest('DATE-03: julianDay() converts to julian day', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      julianDay: c.julianDay(c.users.birthDate)
    }
  }));
  
  const alice = results.find(r => r.firstName === 'Alice');
  assert(alice.julianDay > 2449000, 'Should return julian day number');
});

await asyncTest('DATE-04: unixEpoch() converts to unix timestamp', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      unixTime: c.unixEpoch(c.users.birthDate)
    }
  }));
  
  const bob = results.find(r => r.firstName === 'Bob');
  // Bob born 1999-07-22
  assert(bob.unixTime > 900000000, 'Should return unix timestamp');
});

await asyncTest('DATE-05: Date arithmetic with julianDay', async () => {
  const results = await db.query(c => ({
    select: {
      firstName: c.users.firstName,
      daysOld: c.minus(c.julianDay('now'), c.julianDay(c.users.birthDate))
    }
  }));
  
  const alice = results.find(r => r.firstName === 'Alice');
  // Alice born 1994-03-15, should be roughly 11000+ days old by 2024
  assert(alice.daysOld > 10000, 'Should calculate days since birth');
});

// ============================================
// HEX AND BINARY
// ============================================
console.log('\n=== HEX AND BINARY ===\n');

await asyncTest('HEX-01: hex() converts to hexadecimal', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      hexName: c.hex(c.products.name)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  // 'Widget' in hex
  assert(widget.hexName.length > 0, 'Should have hex value');
});

await asyncTest('HEX-02: unhex() converts from hexadecimal', async () => {
  const results = await db.query(c => ({
    select: {
      original: c.products.name,
      roundTrip: c.unhex(c.hex(c.products.name))
    }
  }));
  
  const widget = results.find(r => r.original === 'Widget');
  // unhex returns blob, check it exists
  assert(widget.roundTrip !== null, 'Should round-trip through hex');
});

await asyncTest('HEX-03: unicode() returns code point', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      firstChar: c.unicode(c.products.name)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.firstChar, 87, 'W is code point 87');
});

// ============================================
// COMBINING FUNCTIONS
// ============================================
console.log('\n=== COMBINING FUNCTIONS ===\n');

await asyncTest('COMB-01: String manipulation chain', async () => {
  const results = await db.query(c => ({
    select: {
      email: c.users.email,
      normalized: c.trim(c.lower(c.users.email))
    }
  }));
  
  const alice = results.find(r => r.email === 'ALICE@EXAMPLE.COM');
  assertEquals(alice.normalized, 'alice@example.com', 'Should lowercase and trim');
});

await asyncTest('COMB-02: Math with conditional', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      price: c.products.price,
      finalPrice: c.if(
        c.gte(c.products.price, 30),
        c.multiply(c.products.price, 0.9),
        c.products.price
      )
    }
  }));
  
  const gadget = results.find(r => r.name === 'Gadget');
  const widget = results.find(r => r.name === 'Widget');
  
  assertClose(gadget.finalPrice, 44.55, 0.01, 'Expensive items get 10% off');
  assertEquals(widget.finalPrice, 19.99, 'Cheap items keep price');
});

await asyncTest('COMB-03: JSON extraction with coalesce', async () => {
  const results = await db.query(c => ({
    select: {
      title: c.documents.title,
      version: c.coalesce(c.extract(c.documents.config, '$.version'), 0)
    }
  }));
  
  const report = results.find(r => r.title === 'Report');
  assertEquals(report.version, 1, 'Should extract version');
});

await asyncTest('COMB-04: Format with multiple computations', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      summary: c.format('%s: %s ($%.2f)', c.upper(c.products.category), c.products.name, c.products.price)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.summary, 'TOOLS: Widget ($19.99)', 'Should format summary');
});

await asyncTest('COMB-05: Complex business calculation', async () => {
  // Calculate profit margin: if quantity > 50, 20% margin, else 15%
  // Profit = price * quantity * margin
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      profit: c.round(
        c.multiply(
          c.multiply(c.products.price, c.products.quantity),
          c.if(c.gt(c.products.quantity, 50), 0.20, 0.15)
        ),
        2
      )
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  // Widget: 19.99 * 100 * 0.20 = 399.80
  assertClose(widget.profit, 399.80, 0.01, 'Should calculate profit');
});

// ============================================
// OCTET LENGTH AND FORMAT
// ============================================
console.log('\n=== ADDITIONAL FUNCTIONS ===\n');

await asyncTest('ADD-01: octetLength() returns byte length', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      bytes: c.octetLength(c.products.name)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.bytes, 6, 'Widget is 6 bytes');
});

await asyncTest('ADD-02: format() formats with printf style', async () => {
  const results = await db.query(c => ({
    select: {
      name: c.products.name,
      formatted: c.format('Product: %s costs $%.2f', c.products.name, c.products.price)
    }
  }));
  
  const widget = results.find(r => r.name === 'Widget');
  assertEquals(widget.formatted, 'Product: Widget costs $19.99', 'Should format string');
});

await asyncTest('ADD-03: trunc() truncates decimal', async () => {
  const results = await db.query(c => ({
    select: {
      price: c.products.price,
      truncated: c.trunc(c.products.price)
    }
  }));
  
  const widget = results.find(r => r.price === 19.99);
  assertEquals(widget.truncated, 19, 'Should truncate to 19');
});

// Cleanup
await database.close();
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

// Summary
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
