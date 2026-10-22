import pg from 'pg';

let pool;
export function getPool(env = process.env) {
  if (pool) return pool;
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL URL required');
  if (env.VERCEL && ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Remote database required');
  pool = new pg.Pool({connectionString: env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000, allowExitOnIdle: true});
  pool.on('error', () => console.error('Database connection unavailable'));
  return pool;
}

// Only application-authored SQL enters this adapter. Values always use parameters.
// The small interface keeps validation and existing API response contracts independent of pg.
export function databaseAdapter(client) {
  return {prepare(statement) {
    let index = 0;
    const sql = statement.replace(/\?/g, () => '$' + (++index));
    return {bind(...values) {
      const execute = () => client.query(sql, values);
      return {
        async all() { return {results: (await execute()).rows}; },
        async first() { return (await execute()).rows[0] ?? null; },
        async run() { const result = await execute(); return {meta: {changes: result.rowCount}}; }
      };
    }};
  }};
}

export async function withUserTransaction(pool, userId, mutate, work) {
  const client = await pool.connect();
  let finished = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query('SET LOCAL ROLE form_api');
    // All board/closet writes for one account serialize, including reference validation.
    if (mutate) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
    const result = await work(databaseAdapter(client));
    await client.query(result instanceof Response && result.status >= 400 ? 'ROLLBACK' : 'COMMIT');
    finished = true;
    return result;
  } finally {
    if (!finished) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

export function userDatabase(pool, userId) {
  return {prepare(sql) { return {bind(...args) {
    const execute = method => withUserTransaction(pool, userId, false, db => db.prepare(sql).bind(...args)[method]());
    return {all: () => execute('all'), first: () => execute('first'), run: () => execute('run')};
  }}; }};
}
