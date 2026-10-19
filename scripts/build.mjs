import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
for (const file of ['env.mjs', 'auth.mjs', 'server.mjs', 'storage.mjs', 'public/app.js', 'src/team.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', 'neon.ts'], { stdio: 'inherit' });
await build({ entryPoints: ['src/team.js'], bundle: true, minify: true, platform: 'browser', target: ['es2022'], outfile: 'public/assets/team.js', logLevel: 'info' });
for (const filename of ['index.html', 'equipe.html']) {
  const html = await readFile(`public/${filename}`, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+|\/app\.js|\/styles\.css)"/g)) await access(path.join('public', match[1]));
}
console.log('BUILD OK: servidor, configuração Neon, login e recursos públicos verificados.');
