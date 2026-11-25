// Copia o app (protótipo) para web/ e inclui o conta.js (login + sincronização).
// Uso: node scripts/importar-prototipo.mjs /caminho/para/prototipo-app
import fs from 'node:fs';
import path from 'node:path';

const origem = process.argv[2];
if (!origem) { console.error('Uso: node scripts/importar-prototipo.mjs <pasta-do-prototipo>'); process.exit(1); }
const web = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'web');

let html = fs.readFileSync(path.join(origem, 'pagina-completa.html'), 'utf8');
const tag = '<script src="conta.js" defer></script>';
if (!html.includes(tag)) {
  const i = html.indexOf('</body>');
  html = i >= 0 ? html.slice(0, i) + tag + '\n' + html.slice(i) : html + '\n' + tag + '\n';
}
fs.writeFileSync(path.join(web, 'index.html'), html);
for (const pasta of ['data', 'tessdata']) {
  fs.rmSync(path.join(web, pasta), { recursive: true, force: true });
  fs.cpSync(path.join(origem, pasta), path.join(web, pasta), { recursive: true });
}
console.log('Protótipo importado para web/ com conta.js incluído.');
