'use strict';
// Lớp truy cập CSDL: Postgres (Supabase / Vercel Postgres) khi có DATABASE_URL; SQLite trong bộ nhớ khi chạy kiểm thử.
let impl = null;
function create() {
  if (process.env.DATABASE_URL) {
    const pg = require('pg');
    pg.types.setTypeParser(20, (v) => Number(v));
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL, max: 3,
      ssl: process.env.DATABASE_SSL === 'false' || local ? false : { rejectUnauthorized: false },
    });
    return {
      kind: 'pg',
      q: async (sql, p) => (await pool.query(sql, p || [])).rows,
      exec: async (sql) => { await pool.query(sql); },
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ q: async (s, p) => (await c.query(s, p || [])).rows });
          await c.query('COMMIT');
          return r;
        } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
      },
    };
  }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.SQLITE_PATH || ':memory:');
  const run = (sql, p) => {
    const s = db.prepare(sql.replace(/\$(\d+)/g, '?$1'));
    return s.all(...(p || []).map((x) => (x === undefined ? null : x)));
  };
  return {
    kind: 'sqlite',
    q: async (sql, p) => run(sql, p),
    exec: async (sql) => { db.exec(sql); },
    tx: async (fn) => {
      db.exec('BEGIN');
      try { const r = await fn({ q: async (s, p) => run(s, p) }); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
}
module.exports = () => impl || (impl = create());
module.exports.reset = () => { impl = null; };
