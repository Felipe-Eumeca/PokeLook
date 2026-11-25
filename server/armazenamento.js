// Armazenamento dos dados de cada usuário.
// - Produção: banco Parse do Back4app (classe "Usuario"), acessado pela REST API com a Master Key.
// - Sem chaves configuradas: memória (só para testes locais; perde tudo ao reiniciar).

export function criarArmazenamento(env) {
  const { PARSE_APP_ID, PARSE_MASTER_KEY, PARSE_SERVER_URL = 'https://parseapi.back4app.com' } = env;
  if (PARSE_APP_ID && PARSE_MASTER_KEY) return parse(PARSE_SERVER_URL.replace(/\/$/, ''), PARSE_APP_ID, PARSE_MASTER_KEY);
  console.warn('[aviso] PARSE_APP_ID/PARSE_MASTER_KEY ausentes: dados ficam só na memória.');
  return memoria();
}

function memoria() {
  const m = new Map();
  return {
    tipo: 'memoria',
    async obter(uid) { return m.has(uid) ? structuredClone(m.get(uid)) : null; },
    async salvar(uid, dados) { m.set(uid, structuredClone(dados)); },
    async excluir(uid) { m.delete(uid); },
  };
}

function parse(base, appId, masterKey) {
  const CLASSE = 'Usuario';
  const ids = new Map(); // uid -> objectId
  const cab = { 'X-Parse-Application-Id': appId, 'X-Parse-Master-Key': masterKey, 'Content-Type': 'application/json' };
  async function req(metodo, caminho, corpo) {
    const r = await fetch(base + caminho, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(10_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Parse ${metodo} ${caminho.split('?')[0]}: ${r.status} ${j.error || ''}`);
    return j;
  }
  async function buscar(uid) {
    const q = encodeURIComponent(JSON.stringify({ uid }));
    const j = await req('GET', `/classes/${CLASSE}?where=${q}&limit=1`);
    const o = j.results?.[0] || null;
    if (o) ids.set(uid, o.objectId); else ids.delete(uid);
    return o;
  }
  const paraDados = o => o && {
    criadoEm: o.criadoEm, consentimento: o.consentimento ?? null,
    colecao: o.colecao ?? null, colecaoAtualizadaEm: o.colecaoAtualizadaEm ?? null,
  };
  return {
    tipo: 'parse',
    async obter(uid) { return paraDados(await buscar(uid)); },
    async salvar(uid, dados) {
      const corpo = { uid, criadoEm: dados.criadoEm, consentimento: dados.consentimento, colecao: dados.colecao, colecaoAtualizadaEm: dados.colecaoAtualizadaEm };
      let id = ids.get(uid);
      if (!id) id = (await buscar(uid))?.objectId;
      if (id) await req('PUT', `/classes/${CLASSE}/${id}`, corpo);
      else { const j = await req('POST', `/classes/${CLASSE}`, { ...corpo, ACL: {} }); ids.set(uid, j.objectId); }
    },
    async excluir(uid) {
      const id = ids.get(uid) || (await buscar(uid))?.objectId;
      if (id) await req('DELETE', `/classes/${CLASSE}/${id}`);
      ids.delete(uid);
    },
  };
}
