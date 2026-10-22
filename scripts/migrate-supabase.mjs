import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPool} from '../server/database.js';
try {process.loadEnvFile('.env.local');} catch (error) {if(error.code !== 'ENOENT') throw error;}
const pool = getPool(), client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(18273, 2)');
  await client.query('CREATE TABLE IF NOT EXISTS public._form_migrations (name text PRIMARY KEY, checksum text NOT NULL)');
  await client.query('REVOKE ALL ON public._form_migrations FROM anon, authenticated');
  for (const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
    const sql = await readFile('supabase/migrations/'+name,'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = (await client.query('SELECT checksum FROM public._form_migrations WHERE name = $1',[name])).rows[0];
    if(previous) {
      if(previous.checksum !== checksum) throw new Error('Previously applied migration changed: '+name);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO public._form_migrations VALUES($1,$2)',[name,checksum]);
    console.log('Applied '+name);
  }
  await client.query('COMMIT');
  console.log('Supabase schema ready.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', error.code || error.name, 'Review the database connection and migration permissions.');
  process.exitCode = 1;
} finally {client.release();await pool.end();}
