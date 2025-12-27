import Database from './db.js';
import { makeClient } from './proxy.js';

class TursoDatabase extends Database {
  constructor(props) {
    super({ ...props, name: 'turso' });
    this.raw = props.db;
  }

  async runMigration(sql) {
    const defer = 'pragma defer_foreign_keys = true';
    const split = sql.split(';').filter(s => s.length > 2);
    const statements = [defer, ...split].map(sql => ({ sql, args: [] }));
    try {
      await this.raw.batch(statements, 'write');
    }
    catch (e) {
      throw e;
    }
  }

  async begin(type) {
    if (!type || !['read', 'write'].includes(type)) {
      throw Error(`Invalid transaction type: ${type}`);
    }
    const db = await this.raw.transaction(type);
    await tx.db.begin();
    return makeClient(this, { db });
  }

  async commit(tx) {
    await tx.db.commit();
  }

  async rollback(tx) {
    await tx.db.rollback();
  }

  async sync() {
    await this.raw.sync();
  }

  async getError(sql) {
    return this.raw.execute(sql);
  }

  async basicRun(sql) {
    return await this.raw.execute(sql);
  }

  async basicAll(sql) {
    const meta = await this.raw.execute(sql);
    return meta.rows;
  }

  async insertBatch(inserts) {
    const mapped = inserts.map(insert => {
      return {
        sql: insert.query,
        args: insert.params
      }
    });
    await this.raw.batch(mapped, 'write');
  }

  async batch(type, handler) {
    if (!handler) {
      handler = type;
      type = 'write';
    }
    const client = makeClient(this, { isBatch: true });
    const handlers = handler(client).flat();
    const results = await Promise.all(handlers);
    const flat = results.flat();
    const responses = await this.raw.batch(flat.map(r => r.statement), type);
    return responses.map((response, i) => {
      const handler = results[i];
      if (handler.post) {
        return handler.post(response);
      }
      return response;
    });
  }

  async run(props) {
    let { query, params, adjusted, tx, operation } = props;
    const op = operation || 'run';
    const sqlText = this.getSqlText(query);
    const start = this.now();
    const isBatch = tx && tx.isBatch;
    if (props.statement && !isBatch) {
      return await this.raw.execute(props.statement);
    }
    if (params === null) {
      params = undefined;
    }
    if (params !== undefined && !adjusted) {
      params = this.adjust(params);
    }
    const statement = {
      sql: query,
      args: params || {}
    };
    if (isBatch) {
      return statement;
    }
    try {
      await this.raw.execute(statement);
      this.logQuery({
        sql: sqlText,
        params,
        durationMs: this.elapsed(start),
        method: op,
        tx: Boolean(tx),
        write: true
      });
    }
    catch (error) {
      this.logQuery({
        sql: sqlText,
        params,
        durationMs: this.elapsed(start),
        method: op,
        tx: Boolean(tx),
        write: true,
        error
      });
      throw error;
    }
  }

  async all(props) {
    let { query, params, options, adjusted, tx, operation } = props;
    const op = operation || 'all';
    const sqlText = this.getSqlText(query);
    const start = this.now();
    const isBatch = tx && tx.isBatch;
    if (props.statement && !isBatch) {
      const meta = await this.raw.execute(props.statement);
      return this.process(meta.rows, options);
    }
    if (params === null) {
      params = undefined;
    }
    if (params !== undefined && !adjusted) {
      params = this.adjust(params);
    }
    const statement = {
      sql: query,
      args: params || {}
    };
    if (isBatch) {
      return {
        statement,
        post: (meta) => this.process(meta.rows, options)
      }
    }
    try {
      const meta = await this.raw.execute(statement);
      const result = this.process(meta.rows, options);
      this.logQuery({
        sql: sqlText,
        params,
        durationMs: this.elapsed(start),
        method: op,
        tx: Boolean(tx)
      });
      return result;
    }
    catch (error) {
      this.logQuery({
        sql: sqlText,
        params,
        durationMs: this.elapsed(start),
        method: op,
        tx: Boolean(tx),
        error
      });
      throw error;
    }
  }

  async _explain(sql, params = {}, tx) {
    const plan = `explain query plan ${sql}`;
    const options = {
      query: plan,
      params,
      tx,
      operation: 'explain'
    };
    return await this.all(options);
  }

  async exec(sql) {
    await this.raw.execute(sql);
  }
}

export default TursoDatabase;
