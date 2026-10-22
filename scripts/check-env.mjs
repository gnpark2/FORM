try {process.loadEnvFile('.env.local');} catch (error) {if(error.code !== 'ENOENT') throw error;}
const keys = ['APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','DATABASE_URL'];
const missing = keys.filter(key=>!process.env[key] || /replace|your-project|YOUR_/i.test(process.env[key]));
for(const key of keys) console.log(key+': '+(missing.includes(key)?'missing':'set'));
if(missing.length) process.exitCode = 1;
