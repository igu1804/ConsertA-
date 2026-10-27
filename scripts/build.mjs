import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
for (const file of ['env.mjs', 'auth.mjs', 'server.mjs', 'storage.mjs', 'marketplace-store.mjs', 'marketplace-api.mjs', 'public/app.js', 'public/marketplace-ui.js', 'public/providers.js', 'public/profile.js', 'public/account.js', 'public/gestao.js', 'src/team.js', 'src/member.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', 'neon.ts'], { stdio: 'inherit' });
await build({ entryPoints: ['src/team.js'], bundle: true, minify: true, platform: 'browser', target: ['es2022'], outfile: 'public/assets/team.js', logLevel: 'info' });
await build({ entryPoints: ['src/member.js'], bundle: true, minify: true, platform: 'browser', target: ['es2022'], outfile: 'public/assets/member.js', logLevel: 'info' });
for (const filename of ['index.html', 'equipe.html', 'entrar.html', 'profissionais.html', 'meu-perfil.html', 'minha-conta.html', 'gestao.html']) {
  const html = await readFile(`public/${filename}`, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+|\/(?:[\w-]+)\.(?:js|css))"/g)) await access(path.join('public', match[1]));
}
console.log('BUILD OK: servidor, login, marketplace e recursos públicos verificados.');
