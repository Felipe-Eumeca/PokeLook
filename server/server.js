// PokeLook — servidor (Back4app Web App)
// - Login com Google (verifica o ID token e abre uma sessão própria em cookie httpOnly)
// - Guarda a coleção do usuário (cartas + binder) num banco Parse do Back4app
// - Exportar e excluir conta (LGPD, art. 18)
// - Proxy com cache das imagens oficiais das cartas (mesma origem → o app pode ler os pixels)
//
// O site na Vercel repassa /api/* para cá (vercel.json), então para o navegador tudo é o mesmo domínio.

import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { criarArmazenamento } from './armazenamento.js';

const {
  PORT = 8080,
  GOOGLE_CLIENT_ID = '',
  SESSION_SECRET = '',
  ALLOWED_ORIGINS = '', // ex.: "https://pokelook.vercel.app,http://localhost:8080"
  NODE_ENV = 'production',
} = process.env;

export const POLITICA_VERSAO = '2026-11-25';
const SESSAO_DIAS = 30;
const LIMITE_COLECAO = 120 * 1024; // bytes de JSON (o Parse aceita até 128 KB por objeto)
const PROD = NODE_ENV === 'production';

if (!SESSION_SECRET) console.warn('[aviso] SESSION_SECRET vazio: usando um segredo aleatório (as sessões caem a cada reinício).');
const SEGREDO = SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const google = new OAuth2Client();
const db = criarArmazenamento(process.env);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json({ limit: '200kb' }));

// Cabeçalhos de segurança básicos
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  next();
});

// CORS só para as origens configuradas (o caminho normal é pelo proxy da Vercel, que não precisa de CORS)
const origens = ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const o = req.get('origin');
  if (o && origens.includes(o)) {
    res.set({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'Content-Type, X-PokeLook', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Limite simples de requisições por IP (protege o plano grátis)
const janela = new Map();
app.use('/api', (req, res, next) => {
  const ip = req.ip || 'x', agora = Date.now();
  const r = janela.get(ip) || { n: 0, t: agora };
  if (agora - r.t > 60_000) { r.n = 0; r.t = agora; }
  r.n++; janela.set(ip, r);
  if (janela.size > 5000) janela.clear();
  if (r.n > 240) return res.status(429).json({ erro: 'Muitas requisições. Tente de novo em um minuto.' });
  next();
});

// Proteção contra CSRF: toda requisição que muda dados precisa do cabeçalho X-PokeLook (um site de fora não consegue mandá-lo sem CORS)
function exigeCabecalho(req, res, next) {
  if (req.get('x-pokelook') !== '1') return res.status(403).json({ erro: 'Requisição recusada.' });
  next();
}

/* ---------------- Sessão (token assinado com HMAC, guardado em cookie httpOnly) ---------------- */
const b64 = s => Buffer.from(s).toString('base64url');
const assinar = dados => crypto.createHmac('sha256', SEGREDO).update(dados).digest('base64url');
function criarToken(uid) {
  const corpo = b64(JSON.stringify({ uid, exp: Date.now() + SESSAO_DIAS * 864e5 }));
  return `${corpo}.${assinar(corpo)}`;
}
function lerToken(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const [corpo, sig] = tok.split('.');
  if (!corpo || !sig) return null;
  const esperado = assinar(corpo);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try { const p = JSON.parse(Buffer.from(corpo, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const opcoesCookie = { httpOnly: true, secure: PROD, sameSite: 'lax', path: '/', maxAge: SESSAO_DIAS * 864e5 };
function exigeLogin(req, res, next) {
  const s = lerToken(req.cookies?.pokelook_sessao);
  if (!s) return res.status(401).json({ erro: 'Entre com o Google para continuar.' });
  req.uid = s.uid; next();
}

// Pseudonimização: não guardamos o identificador do Google, só um HMAC dele.
const pseudonimo = sub => crypto.createHmac('sha256', SEGREDO + ':uid').update(String(sub)).digest('hex').slice(0, 40);

/* ---------------- Rotas ---------------- */
// Só para testes locais: serve o site junto com a API (SITE_DIR=../web)
if (process.env.SITE_DIR) app.use(express.static(process.env.SITE_DIR));
app.get('/', (req, res) => res.type('text').send('PokeLook API. Veja /api/saude.'));
app.get('/api/saude', (req, res) => res.json({ ok: true, armazenamento: db.tipo, googleConfigurado: !!GOOGLE_CLIENT_ID }));
// Em produção, só oferece login quando o banco está configurado (senão os dados ficariam só na memória).
const LOGIN_ATIVO = !!GOOGLE_CLIENT_ID && (!PROD || db.tipo !== 'memoria');
app.get('/api/config', (req, res) => res.json({ googleClientId: LOGIN_ATIVO ? GOOGLE_CLIENT_ID : '', politicaVersao: POLITICA_VERSAO }));

app.post('/api/auth/google', exigeCabecalho, async (req, res) => {
  const { credential, consentimento } = req.body || {};
  if (!LOGIN_ATIVO) return res.status(503).json({ erro: 'Login com Google ainda não configurado no servidor.' });
  if (!credential) return res.status(400).json({ erro: 'Faltou o token do Google.' });
  if (!consentimento?.aceitouPolitica || consentimento.versao !== POLITICA_VERSAO || !consentimento.idadeOk)
    return res.status(400).json({ erro: 'É preciso aceitar a Política de Privacidade vigente e confirmar a idade.' });
  let p;
  try {
    const t = await google.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    p = t.getPayload();
  } catch { return res.status(401).json({ erro: 'Não foi possível validar o login do Google.' }); }
  const uid = pseudonimo(p.sub);
  try {
    const agora = new Date().toISOString();
    const u = await db.obter(uid);
    await db.salvar(uid, {
      criadoEm: u?.criadoEm || agora,
      consentimento: { versao: POLITICA_VERSAO, em: agora },
      colecao: u?.colecao ?? null,
      colecaoAtualizadaEm: u?.colecaoAtualizadaEm ?? null,
    });
    res.cookie('pokelook_sessao', criarToken(uid), opcoesCookie);
    // Nome e foto vão só para o navegador mostrar; não são gravados no banco.
    res.json({ ok: true, perfil: { nome: p.given_name || p.name || 'Treinador(a)', foto: p.picture || null }, novo: !u });
  } catch (e) {
    console.error('auth', e.message);
    res.status(500).json({ erro: 'Falha ao gravar no banco.' });
  }
});

app.get('/api/me', exigeLogin, async (req, res) => {
  const u = await db.obter(req.uid).catch(() => null);
  if (!u) { res.clearCookie('pokelook_sessao', { ...opcoesCookie, maxAge: undefined }); return res.status(401).json({ erro: 'Conta não encontrada.' }); }
  res.json({ ok: true, consentimento: u.consentimento, politicaAtual: POLITICA_VERSAO, colecaoAtualizadaEm: u.colecaoAtualizadaEm });
});

app.post('/api/logout', exigeCabecalho, (req, res) => {
  res.clearCookie('pokelook_sessao', { ...opcoesCookie, maxAge: undefined });
  res.json({ ok: true });
});

app.get('/api/colecao', exigeLogin, async (req, res) => {
  const u = await db.obter(req.uid);
  res.json({ colecao: u?.colecao ?? null, atualizadaEm: u?.colecaoAtualizadaEm ?? null });
});

app.put('/api/colecao', exigeCabecalho, exigeLogin, async (req, res) => {
  const c = limparColecao(req.body?.colecao);
  if (!c) return res.status(400).json({ erro: 'Formato de coleção inválido.' });
  if (Buffer.byteLength(JSON.stringify(c)) > LIMITE_COLECAO) return res.status(413).json({ erro: 'Coleção grande demais para sincronizar.' });
  const u = await db.obter(req.uid);
  if (!u) return res.status(401).json({ erro: 'Conta não encontrada.' });
  const atualizadaEm = new Date().toISOString();
  await db.salvar(req.uid, { ...u, colecao: c, colecaoAtualizadaEm: atualizadaEm });
  res.json({ ok: true, atualizadaEm });
});

// Portabilidade / acesso (LGPD art. 18, II e V)
app.get('/api/conta/exportar', exigeLogin, async (req, res) => {
  const u = await db.obter(req.uid);
  res.set('Content-Disposition', 'attachment; filename="pokelook-meus-dados.json"');
  res.json({ geradoEm: new Date().toISOString(), politicaVersao: POLITICA_VERSAO,
    explicacao: 'Todos os dados que o PokeLook guarda sobre você. O identificador é um pseudônimo derivado da sua conta Google; e-mail, nome e foto não são gravados.',
    identificador: req.uid, ...u });
});

// Eliminação (LGPD art. 18, VI) e revogação do consentimento (art. 8, §5)
app.delete('/api/conta', exigeCabecalho, exigeLogin, async (req, res) => {
  await db.excluir(req.uid);
  res.clearCookie('pokelook_sessao', { ...opcoesCookie, maxAge: undefined });
  res.json({ ok: true });
});

/* ---------------- Imagens oficiais das cartas (proxy com cache) ---------------- */
const HOSTS_IMG = new Set(['images.pokemontcg.io', 'assets.tcgdex.net']);
const cacheImg = new Map(); // url -> { buf, tipo, t }
const CACHE_MAX = 300;
app.get('/api/img', async (req, res) => {
  let url;
  try { url = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
  if (url.protocol !== 'https:' || !HOSTS_IMG.has(url.hostname) || !/\.(png|jpe?g|webp)$/i.test(url.pathname)) return res.status(400).json({ erro: 'Endereço de imagem não permitido.' });
  const chave = url.href;
  let item = cacheImg.get(chave);
  if (!item) {
    try {
      const r = await fetch(chave, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).end();
      const tipo = r.headers.get('content-type') || 'image/png';
      if (!tipo.startsWith('image/')) return res.status(502).end();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 3_000_000) return res.status(502).end();
      item = { buf, tipo };
      cacheImg.set(chave, item);
      if (cacheImg.size > CACHE_MAX) cacheImg.delete(cacheImg.keys().next().value);
    } catch { return res.status(504).end(); }
  }
  res.set({ 'Content-Type': item.tipo, 'Cache-Control': 'public, max-age=2592000, immutable' });
  res.send(item.buf);
});

/* ---------------- Validação da coleção ---------------- */
// Aceita { colecao: [{id, ts}], binder: {name, color, stickers, slots} }. Fotos (img) nunca são aceitas.
function limparColecao(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.colecao)) return null;
  const itens = c.colecao.slice(0, 3000).filter(x => x && typeof x.id === 'string' && Number.isFinite(x.ts))
    .map(x => ({ id: x.id.slice(0, 40), ts: Math.trunc(x.ts) }));
  let binder = null;
  if (c.binder && typeof c.binder === 'object') {
    const b = c.binder;
    binder = {
      name: typeof b.name === 'string' ? b.name.slice(0, 30) : '',
      color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#c0392b',
      stickers: Array.isArray(b.stickers) ? b.stickers.slice(0, 16).filter(s => s && typeof s.k === 'string')
        .map(s => ({ k: s.k.slice(0, 20), x: clamp(+s.x), y: clamp(+s.y) })) : [],
      slots: Array.isArray(b.slots) ? b.slots.slice(0, 90).map(v => (Number.isFinite(v) ? Math.trunc(v) : null)) : [],
    };
  }
  return { colecao: itens, binder };
}
const clamp = v => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50);

app.use((err, req, res, next) => { console.error(err.message); res.status(err.status || 500).json({ erro: 'Erro no servidor.' }); });

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  app.listen(PORT, () => console.log(`PokeLook API na porta ${PORT} · armazenamento: ${db.tipo}`));
}
export default app;
