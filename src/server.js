import app from './app.js';
import { config, missingSupabaseEnv } from './config.js';

const server = app.listen(config.port, () => {
  console.log(`${'\u001b[32m'}perpustakaan-api${'\u001b[0m'} siap di http://localhost:${config.port}`);
  if (missingSupabaseEnv.length > 0) {
    console.warn(
      `[peringatan] env belum lengkap: ${missingSupabaseEnv.join(', ')}. ` +
        'Salin .env.example menjadi .env lalu isi kredensial Supabase.',
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
