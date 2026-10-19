import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// As variáveis da hospedagem têm prioridade; o Neon atualiza .env.local.
for (const filename of ['.env.local', '.env']) {
  try { loadEnvFile(fileURLToPath(new URL(filename, import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
