import { toValues } from './utils.js';
import { parse } from './parsers.js';
import { mapOne, mapMany } from './map.js';
import { makeClient } from './proxy.js';
import { processQuery } from './symbols.js';
import { process, toSql } from './tables.js';
import toMigration, { analyzeMigration } from './migrate.js';

export { analyzeMigration };

const dbTypes = {
  integer: true,
  int: true,
  real: true,
  text: true,
  blob: true,
  any: true
}

class Database {
  constructor(options = {}) {
    this.write = null;
    this.tables = {};
    this.mappers = {};
    this.customTypes = {};
    this.columns = {};
    this.columnInfo = {};
    this.hasJson = {};
    this.computed = {};
    this.softDeleteTables = new Set();
    this.schema = [];
    this.statements = new Map();
    this.virtualSet = new Set();
    this.closed = false;
    this.initialized = false;
    this.logger = options.logger || null;
    this.logOptions = options.logOptions || {};
    
    // Query cache
    this.cache = new Map();
    this.cacheEnabled = false;
    this.cacheDefaultTTL = 60000; // 60 seconds default
    this.cacheStats = { hits: 0, misses: 0, invalidations: 0 };
    
    // Lifecycle hooks: { tableName: { hookName: [fn, fn, ...] } }
    this.hooks = {};
    
    this.registerTypes([
      {
        name: 'boolean',
        valueTest: (v) => typeof v === 'boolean',
        makeConstraint: (column) => `check (${column} in (0, 1))`,
        dbToJs: (v) => Boolean(v),
        jsToDb: (v) => v === true ? 1 : 0,
        dbType: 'integer'
      },
      {
        name: 'date',
        valueTest: (v) => v instanceof Date,
        dbToJs: (v) => new Date(v),
        jsToDb: (v) => v.toISOString(),
        dbType: 'text'
      },
      {
        name: 'json',
        valueTest: (v) => Object.getPrototypeOf(v) === Object.prototype || Array.isArray(v),
        dbToJs: (v) => JSON.parse(v),
        jsToDb: (v) => JSON.stringify(v),
        dbType: 'blob'
      }
    ]);
  }

  getClient(schema) {
    const classes = Object.values(schema);
    for (const type of classes) {
      const table = process(type);
      this.schema.push(table);
    }
    this.addTables();
    return makeClient(this);
  }

  getSchema() {
    return structuredClone(this.schema);
  }

  diff(previous) {
    const current = this.getSchema();
    if (!previous) {
      const statements = [];
      for (const table of current) {
        const sql = toSql(table);
        statements.push(sql);
      }
      return statements.join('\n');
    }
    return toMigration(previous, current);
  }

  subquery(expression) {
    return processQuery(this, expression);
  }

  async query(expression, tx, first) {
    const { sql, params, post } = processQuery(this, expression, first);
    const options = {
      query: sql,
      params,
      tx
    };
    if (tx && tx.isBatch) {
      const result = await this.all(options);
      return {
        statement: result.statement,
        params: result.params,
        post: (meta) => {
          const response = result.post(meta);
          return post(response);
        }
      }
    }
    const rows = await this.all(options);
    return post(rows);
  }

  async migrate() {
    return;
  }

  addTables() {
    for (const table of this.schema) {
      if (table.type === 'fts5') {
        this.virtualSet.add(table.name);
      }
      if (table.softDelete) {
        this.softDeleteTables.add(table.name);
      }
      this.tables[table.name] = table.columns;
      this.columns[table.name] = {};
      this.columnInfo[table.name] = {};
      this.computed[table.name] = {};
      this.hasJson[table.name] = false;
      const columns = [...table.columns, ...table.computed];
      for (const column of columns) {
        this.columns[table.name][column.name] = column.type;
        this.columnInfo[table.name][column.name] = {
          type: column.type,
          notNull: column.notNull === true,
          default: column.default,
          primaryKey: column.primaryKey === true,
          computed: Boolean(column.sql)
        };
        if (column.type === 'json') {
          this.hasJson[table.name] = true;
        }
      }
      for (const computed of table.computed) {
        this.computed[table.name][computed.name] = computed.sql;
      }
    }
  }

  registerTypes(customTypes) {
    for (const customType of customTypes) {
      const { name, ...options } = customType;
      if (name.includes(',')) {
        const names = name.split(',').map(n => n.trim());
        for (const name of names) {
          this.customTypes[name] = options;
        }
      }
      else {
        this.customTypes[name] = options;
      }
    }
  }

  setLogger(logger, options = {}) {
    this.logger = logger;
    this.logOptions = { ...this.logOptions, ...options };
  }

  // ---- Query Cache Methods ----

  /**
   * Enable or disable caching with optional default TTL
   * @param {boolean} enabled - Whether to enable caching
   * @param {Object} options - Cache options
   * @param {number} options.ttl - Default TTL in milliseconds (default: 60000)
   */
  enableCache(enabled = true, options = {}) {
    this.cacheEnabled = enabled;
    if (options.ttl !== undefined) {
      this.cacheDefaultTTL = options.ttl;
    }
    if (!enabled) {
      this.clearCache();
    }
  }

  /**
   * Generate a cache key from SQL and params
   */
  getCacheKey(sql, params) {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${sql}|${paramStr}`;
  }

  /**
   * Get a cached result if valid
   */
  getCached(sql, params) {
    if (!this.cacheEnabled) return null;
    
    const key = this.getCacheKey(sql, params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.cacheStats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.cacheStats.misses++;
      return null;
    }
    
    this.cacheStats.hits++;
    // Clone on retrieval to prevent mutations affecting cached data
    return structuredClone(entry.data);
  }

  /**
   * Store a result in the cache
   */
  setCached(sql, params, data, ttl) {
    if (!this.cacheEnabled) return;
    
    const key = this.getCacheKey(sql, params);
    const effectiveTTL = ttl !== undefined ? ttl : this.cacheDefaultTTL;
    
    this.cache.set(key, {
      data: structuredClone(data), // Clone to prevent mutation
      expiresAt: Date.now() + effectiveTTL,
      tables: this.extractTablesFromSql(sql)
    });
  }

  /**
   * Extract table names from SQL (simple heuristic)
   */
  extractTablesFromSql(sql) {
    const tables = new Set();
    // Match various patterns: "from table", "join table", "into table", "update table"
    const patterns = [
      /from\s+(\w+)/gi,
      /join\s+(\w+)/gi,
      /into\s+(\w+)/gi,
      /update\s+(\w+)/gi,
      /delete\s+from\s+(\w+)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        const table = match[1];
        if (table && !table.startsWith('(')) {
          tables.add(table.toLowerCase());
        }
      }
    }
    
    return tables;
  }

  /**
   * Invalidate cache entries for affected tables
   */
  invalidateCache(tables) {
    if (!this.cacheEnabled || this.cache.size === 0) return;
    
    let tablesToInvalidate;
    if (tables instanceof Set) {
      tablesToInvalidate = tables;
    } else if (Array.isArray(tables)) {
      tablesToInvalidate = new Set(tables.map(t => t.toLowerCase()));
    } else {
      tablesToInvalidate = new Set([tables.toLowerCase()]);
    }
    
    for (const [key, entry] of this.cache.entries()) {
      for (const table of entry.tables) {
        if (tablesToInvalidate.has(table)) {
          this.cache.delete(key);
          this.cacheStats.invalidations++;
          break;
        }
      }
    }
  }

  /**
   * Clear all cached entries
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      size: this.cache.size,
      enabled: this.cacheEnabled,
      hitRate: this.cacheStats.hits + this.cacheStats.misses > 0
        ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats() {
    this.cacheStats = { hits: 0, misses: 0, invalidations: 0 };
  }

  // ---- Lifecycle Hooks ----

  /**
   * Valid hook names
   */
  static HOOK_NAMES = [
    'beforeInsert', 'afterInsert',
    'beforeUpdate', 'afterUpdate', 
    'beforeDelete', 'afterDelete',
    'beforeUpsert', 'afterUpsert'
  ];

  /**
   * Register a hook for a table
   * @param {string} table - Table name (lowercase)
   * @param {string} hookName - One of: beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete, afterDelete, beforeUpsert, afterUpsert
   * @param {Function} fn - Hook function. For 'before' hooks, receives (data, context) and can return modified data. For 'after' hooks, receives (result, data, context).
   */
  addHook(table, hookName, fn) {
    if (!Database.HOOK_NAMES.includes(hookName)) {
      throw new Error(`Invalid hook name: ${hookName}. Valid hooks: ${Database.HOOK_NAMES.join(', ')}`);
    }
    if (typeof fn !== 'function') {
      throw new Error('Hook must be a function');
    }
    const tableLower = table.toLowerCase();
    if (!this.hooks[tableLower]) {
      this.hooks[tableLower] = {};
    }
    if (!this.hooks[tableLower][hookName]) {
      this.hooks[tableLower][hookName] = [];
    }
    this.hooks[tableLower][hookName].push(fn);
  }

  /**
   * Remove a hook
   */
  removeHook(table, hookName, fn) {
    const tableLower = table.toLowerCase();
    if (!this.hooks[tableLower] || !this.hooks[tableLower][hookName]) {
      return false;
    }
    const index = this.hooks[tableLower][hookName].indexOf(fn);
    if (index > -1) {
      this.hooks[tableLower][hookName].splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all hooks for a table or all tables
   */
  clearHooks(table) {
    if (table) {
      delete this.hooks[table.toLowerCase()];
    } else {
      this.hooks = {};
    }
  }

  /**
   * Run 'before' hooks - can modify data
   * @returns {Promise<any>} Modified data or original if no hooks
   */
  async runBeforeHooks(table, hookName, data, context = {}) {
    const tableLower = table.toLowerCase();
    const hooks = this.hooks[tableLower]?.[hookName];
    if (!hooks || hooks.length === 0) {
      return data;
    }
    let result = data;
    for (const hook of hooks) {
      const modified = await hook(result, { table: tableLower, ...context });
      if (modified !== undefined) {
        result = modified;
      }
    }
    return result;
  }

  /**
   * Run 'after' hooks - for side effects
   */
  async runAfterHooks(table, hookName, result, data, context = {}) {
    const tableLower = table.toLowerCase();
    const hooks = this.hooks[tableLower]?.[hookName];
    if (!hooks || hooks.length === 0) {
      return;
    }
    for (const hook of hooks) {
      await hook(result, data, { table: tableLower, ...context });
    }
  }

  now() {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  elapsed(start) {
    return this.now() - start;
  }

  safeValue(value) {
    const customRedactor = this.logOptions.redact;
    if (typeof customRedactor === 'function') {
      return customRedactor(value);
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      const limit = this.logOptions.maxStringLength || 200;
      if (value.length > limit) {
        return `${value.slice(0, limit)}...(${value.length})`;
      }
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return `[buffer ${value.length}]`;
    }
    if (Array.isArray(value)) {
      return value.map(v => this.safeValue(v));
    }
    if (typeof value === 'object') {
      return '[object]';
    }
    return '[redacted]';
  }

  redactParams(params) {
    if (!params || typeof params !== 'object') {
      return params;
    }
    const result = Array.isArray(params) ? [] : {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = this.safeValue(value);
    }
    return result;
  }

  getSqlText(query) {
    if (typeof query === 'string') {
      return query;
    }
    if (query && typeof query === 'object') {
      if (typeof query.source === 'string') {
        return query.source;
      }
      if (typeof query.sql === 'string') {
        return query.sql;
      }
    }
    return '[statement]';
  }

  logQuery(event) {
    if (!this.logger) {
      return;
    }
    const { params, ...rest } = event;
    const payload = {
      ...rest,
      params: this.redactParams(params)
    };
    try {
      this.logger(payload);
    }
    catch (e) {
      // Ignore logger errors to avoid breaking query flow.
    }
  }

  async explain(expression, tx) {
    const details = typeof expression === 'string'
      ? { sql: expression, params: {} }
      : processQuery(this, expression);
    return await this._explain(details.sql, details.params || {}, tx);
  }

  async _explain() {
    throw Error('Explain not implemented for this driver');
  }

  needsParsing(table, keys) {
    if (typeof keys === 'string') {
      keys = [keys];
    }
    for (const key of keys) {
      const type = this.columns[table][key];
      if (!dbTypes[type]) {
        return true;
      }
    }
    return false;
  }

  getPrimaryKey(table) {
    const primaryKey = this.tables[table].find(c => c.primaryKey);
    return primaryKey.name;
  }

  convertToJs(table, column, value, customFields) {
    if (value === null) {
      return value;
    }
    let type;
    if (customFields && customFields[column]) {
      type = customFields[column];
    }
    else {
      type = this.columns[table][column];
    }
    if (dbTypes[type]) {
      return value;
    }
    const customType = this.customTypes[type];
    if (customType.dbToJs) {
      return customType.dbToJs(value);
    }
    return value;
  }

  getDbToJsConverter(type) {
    const customType = this.customTypes[type];
    if (customType) {
      return customType.dbToJs;
    }
    return null;
  }

  jsToDb(value) {
    if (value === undefined) {
      return null;
    }
    if (value === null || typeof value === 'string' || typeof value === 'number' || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))) {
      return value;
    }
    else {
      for (const customType of Object.values(this.customTypes)) {
        if (customType.valueTest && customType.valueTest(value)) {
          return customType.jsToDb(value);
        }
      }
    }
    return value;
  }

  adjust(params) {
    const adjusted = {};
    for (let [key, value] of Object.entries(params)) {
      adjusted[key] = this.jsToDb(value);
    }
    return adjusted;
  }

  process(result, options) {
    if (!options) {
      return result;
    }
    if (result.length === 0) {
      if (options.result === 'object' || options.result === 'value') {
        return undefined;
      }
      return result;
    }
    let mapper;
    if (options.result === 'object' || options.result === 'value') {
      mapper = mapOne;
    }
    else {
      mapper = mapMany;
    }
    if (options.result === 'value' || options.result === 'values') {
      if (options.parse) {
        const parsed = parse(result, options.types);
        const values = toValues(parsed);
        if (options.result === 'value') {
          return values[0];
        }
        return values;
      }
      const values = toValues(result);
      if (options.result === 'value') {
        return values[0];
      }
      return values;
    }
    if (options.parse && !options.map) {
      const parsed = parse(result, options.types);
      if (options.result === 'object') {
        return parsed[0];
      }
      return parsed;
    }
    if (options.map) {
      return mapper(this, result, options.columns, options.types);
    }
    return result;
  }

  async basicRun() {
    return;
  }

  async basicAll() {
    return;
  }

  async prepare() {
    return;
  }

  async run() {
    return;
  }

  async all() {
    return;
  }

  async exec() {
    return;
  }

  async close() {
    return;
  }
}

export default Database;
