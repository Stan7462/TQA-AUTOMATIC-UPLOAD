import pg from 'pg';

// Millisecond timestamps and counts must keep the same numeric representation as SQLite.
pg.types.setTypeParser(20, value => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Database integer exceeds JavaScript safe range');
  return result;
});

export function postgresSql(sql) {
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(sql);
  let text = sql.replace(/^\s*INSERT OR IGNORE\b/i, 'INSERT');
  text = text.replace(/\bAS\s+([a-z_][a-z0-9_]*[A-Z][a-z0-9_]*)\b/gi, (match, alias) => /[A-Z]/.test(alias) ? `AS "${alias}"` : match);
  text = text.replace(/([\w.]+)\s+COLLATE NOCASE/gi, 'LOWER($1)');
  text = text.replace(/\bjson_each\(photo_ids\)/g, 'jsonb_array_elements_text(photo_ids::jsonb) AS photos(value)');
  text = text.replace(/\bMAX\(w.enabled_at,\?,\?\)/g, 'GREATEST(w.enabled_at,?,?)');
  // SQL literals are skipped so question marks in user-facing text stay untouched.
  let parameter = 0;
  text = text.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, token => token === '?' ? `$${++parameter}` : token);
  if (ignore) text = text.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  return text;
}

export function createDatabase({ url = process.env.DATABASE_URL, sqlite } = {}) {
  const pool = url ? new pg.Pool({connectionString:url, max:10, connectionTimeoutMillis:10000, statement_timeout:30000}) : null;
  pool?.on('error', () => console.error('PostgreSQL idle connection failed; reconnecting on next request.'));
  async function query(sql, values, client=pool) {
    if (pool) {
      const result = await client.query(postgresSql(sql), values.map(v => v instanceof Uint8Array ? Buffer.from(v) : v));
      return { rows:result.rows, changes:result.rowCount || 0 };
    }
    const statement=sqlite.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return {rows:statement.all(...values),changes:0};
    return {rows:[],changes:Number(statement.run(...values).changes)};
  }
  class Statement {
    constructor(sql,values=[]) {this.sql=sql;this.values=values;}
    bind(...values) {return new Statement(this.sql,values);}
    async get(...values) {return (await query(this.sql,values.length?values:this.values)).rows[0];}
    async first() {return await this.get() ?? null;}
    async all(...values) {return (await query(this.sql,values.length?values:this.values)).rows;}
    async run(...values) {const {changes}=await query(this.sql,values.length?values:this.values);return {changes,meta:{changes}};}
  }
  return {
    prepare(sql) {return new Statement(sql);},
    async batch(statements) {
      const client=pool ? await pool.connect() : null;
      try {
        if (client) await client.query('BEGIN'); else sqlite.exec('BEGIN');
        const results=[];
        for (const s of statements) {const {changes}=await query(s.sql,s.values,client);results.push({meta:{changes}});}
        if (client) await client.query('COMMIT'); else sqlite.exec('COMMIT');
        return results;
      } catch(error) {
        if (client) await client.query('ROLLBACK'); else sqlite.exec('ROLLBACK');
        throw error;
      } finally {client?.release();}
    },
    async close() {if(pool) await pool.end();else sqlite?.close();},
    pool,
  };
}
