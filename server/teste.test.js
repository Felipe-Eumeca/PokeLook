import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OAuth2Client } from 'google-auth-library';

process.env.GOOGLE_CLIENT_ID = 'teste.apps.googleusercontent.com';
process.env.SESSION_SECRET = 'segredo-de-teste';
process.env.NODE_ENV = 'test';
OAuth2Client.prototype.verifyIdToken = async ({ idToken, audience }) => {
  if (idToken !== 'token-bom' || audience !== process.env.GOOGLE_CLIENT_ID) throw new Error('inválido');
  return { getPayload: () => ({ sub: '1234567890', given_name: 'Ash', picture: 'https://x/y.png', email: 'ash@example.com' }) };
};
const { default: app, POLITICA_VERSAO } = await import('./server.js');
const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let cookie = '';
const H = { 'Content-Type': 'application/json', 'X-PokeLook': '1' };
const call = (m, p, body, extra = {}) => fetch(base + p, { method: m, headers: { ...H, Cookie: cookie, ...extra }, body: body && JSON.stringify(body) });

test('sem login não acessa coleção', async () => { assert.equal((await call('GET', '/api/colecao')).status, 401); });
test('login exige consentimento', async () => {
  const r = await call('POST', '/api/auth/google', { credential: 'token-bom', consentimento: { aceitouPolitica: true, versao: 'velha', idadeOk: true } });
  assert.equal(r.status, 400);
});
test('login exige cabeçalho anti-CSRF', async () => {
  const r = await fetch(base + '/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});
test('token inválido', async () => {
  const r = await call('POST', '/api/auth/google', { credential: 'ruim', consentimento: { aceitouPolitica: true, versao: POLITICA_VERSAO, idadeOk: true } });
  assert.equal(r.status, 401);
});
test('fluxo completo', async () => {
  let r = await call('POST', '/api/auth/google', { credential: 'token-bom', consentimento: { aceitouPolitica: true, versao: POLITICA_VERSAO, idadeOk: true } });
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.perfil.nome, 'Ash'); assert.equal(j.novo, true);
  cookie = r.headers.get('set-cookie').split(';')[0]; assert.match(cookie, /^pokelook_sessao=/);
  r = await call('PUT', '/api/colecao', { colecao: { colecao: [{ id: 'mep-22', ts: 1, img: 'data:image/jpeg;base64,AAAA' }], binder: { name: 'Meu', color: '#112233', stickers: [{ k: 'chama', x: 10, y: 200 }], slots: [1, null] } } });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/colecao'); const c = await r.json();
  assert.deepEqual(c.colecao.colecao, [{ id: 'mep-22', ts: 1 }], 'foto não é guardada');
  assert.equal(c.colecao.binder.stickers[0].y, 100);
  r = await call('GET', '/api/conta/exportar'); const e = await r.json();
  assert.ok(!JSON.stringify(e).includes('ash@example.com'), 'e-mail não é guardado');
  assert.ok(!JSON.stringify(e).includes('1234567890'), 'sub do Google não é guardado');
  assert.equal(e.consentimento.versao, POLITICA_VERSAO);
  r = await call('DELETE', '/api/conta'); assert.equal(r.status, 200);
  r = await call('GET', '/api/colecao'); assert.equal((await r.json()).colecao, null);
  r = await call('GET', '/api/me'); assert.equal(r.status, 401);
});
test('proxy de imagem recusa hosts de fora', async () => {
  assert.equal((await call('GET', '/api/img?u=' + encodeURIComponent('https://evil.example/a.png'))).status, 400);
  assert.equal((await call('GET', '/api/img?u=' + encodeURIComponent('http://images.pokemontcg.io/a.png'))).status, 400);
});
test.after(() => srv.close());
