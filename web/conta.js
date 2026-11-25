/* PokeLook — conta (login com Google) e sincronização da coleção.
   Fica num arquivo separado do app para não misturar com o pipeline de visão e com o binder.
   Princípios (LGPD): login opcional; o script do Google só é carregado depois que a pessoa aceita a política;
   fotos nunca saem do aparelho; o servidor guarda só um pseudônimo, o consentimento e a coleção. */
(() => {
  'use strict';
  const API = (window.CARTASCAN_API || '') + '/api';
  const POLITICA_URL = 'privacidade.html';
  const K_PERFIL = 'pokelook:perfil', K_SYNC = 'pokelook:sync';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const estado = { config: null, logado: false, perfil: ls.get(K_PERFIL, null), sincronizando: false, msg: '', erro: false, confirmarExclusao: false };

  async function api(metodo, caminho, corpo) {
    const r = await fetch(API + caminho, {
      method: metodo, credentials: 'same-origin',
      headers: { 'X-PokeLook': '1', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.erro || `Erro ${r.status}`); e.status = r.status; throw e; }
    return j;
  }

  /* ---------------- Interface ---------------- */
  const css = `
  .conta-btn{width:40px;height:40px;flex:none;margin-left:4px;padding:0;border:var(--bw) solid var(--edge);border-radius:10px;background:var(--surface);color:var(--edge);
    box-shadow:var(--lift);cursor:pointer;display:grid;place-items:center;overflow:hidden;position:relative}
  .conta-btn svg{width:26px;height:26px}
  @media (max-width:430px){header.top .sub{display:none}}
  .conta-btn img{width:100%;height:100%;object-fit:cover}
  .conta-btn .dot{position:absolute;right:2px;bottom:2px;width:9px;height:9px;border-radius:50%;background:var(--ok);border:2px solid var(--surface)}
  dialog.conta{border:var(--bw) solid var(--edge);border-radius:var(--r);background:var(--surface);color:var(--ink);padding:0;width:min(440px,calc(100vw - 32px));
    max-height:calc(100dvh - 32px);box-shadow:var(--lift);font-family:var(--f-body)}
  dialog.conta::backdrop{background:rgba(11,22,51,.55)}
  .conta-in{padding:16px;display:flex;flex-direction:column;gap:12px}
  .conta-in h2{font:400 29px/1.05 var(--f-display);letter-spacing:.03em;margin:0}
  .conta-in p{margin:0;font-size:15px;line-height:1.55}
  .conta-in .small{font-size:13px;color:var(--muted)}
  .conta-head{display:flex;align-items:center;gap:10px}
  .conta-head .fechar{margin-left:auto;width:40px;height:40px;border-radius:50%;border:2px solid var(--edge);background:var(--surface-2);font:400 22px var(--f-display);cursor:pointer;color:var(--ink)}
  .conta-ok{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}
  .conta-ok input{width:22px;height:22px;margin:1px 0 0;flex:none;accent-color:var(--ok)}
  .conta-g{min-height:44px;display:flex;justify-content:center}
  .conta-perfil{display:flex;align-items:center;gap:12px}
  .conta-perfil .av svg{width:30px;height:30px}
  .conta-perfil img,.conta-perfil .av{width:48px;height:48px;border-radius:10px;border:2px solid var(--edge);background:var(--surface-2);object-fit:cover}
  .conta-perfil b{font:400 22px var(--f-display);letter-spacing:.03em}
  .conta-acoes{display:grid;gap:8px}
  .conta-acoes .btn{width:100%}
  .conta-msg{font-size:14px;padding:8px 10px;border-radius:10px;border:2px solid var(--edge);background:var(--ok-bg)}
  .conta-msg.erro{background:var(--bad-bg)}
  .conta .perigo{background:var(--bad-bg)}
  .conta a{color:var(--scan)}
  .conta hr{border:0;border-top:2px dashed var(--line);margin:2px 0;width:100%}`;
  const icone = '<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 1h4v1h-4zM5 2h1v1h-1zM10 2h1v1h-1zM4 3h1v3h-1zM11 3h1v3h-1zM5 6h1v1h-1zM10 6h1v1h-1zM6 7h4v1h-4zM4 9h8v1h-8zM3 10h1v1h-1zM12 10h1v1h-1zM2 11h1v3h-1zM13 11h1v3h-1zM2 14h12v1h-12z"/></svg>';

  let btn, dlg;
  function montar() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'conta-btn';
    btn.onclick = () => { estado.confirmarExclusao = false; render(); dlg.showModal(); };
    (document.querySelector('header.top') || document.body).appendChild(btn);
    dlg = document.createElement('dialog'); dlg.className = 'conta'; dlg.setAttribute('aria-labelledby', 'conta-t');
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    renderBotao();
  }
  function renderBotao() {
    const p = estado.logado && estado.perfil;
    btn.innerHTML = p?.foto ? `<img alt="" referrerpolicy="no-referrer" src="${esc(p.foto)}"><span class="dot"></span>` : icone + (estado.logado ? '<span class="dot"></span>' : '');
    btn.setAttribute('aria-label', estado.logado ? `Conta de ${p?.nome || 'usuário'}` : 'Entrar ou criar conta');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const msgHtml = () => estado.msg ? `<div class="conta-msg${estado.erro ? ' erro' : ''}" role="status">${esc(estado.msg)}</div>` : '';
  function aviso(t, erro = false) { estado.msg = t; estado.erro = erro; if (dlg?.open) render(); }

  function render() {
    renderBotao();
    const cab = t => `<div class="conta-head"><h2 id="conta-t">${t}</h2><button class="fechar" type="button" aria-label="Fechar">×</button></div>`;
    if (!estado.config) {
      dlg.innerHTML = `<div class="conta-in">${cab('Conta')}<p>O login não está disponível nesta versão do app. Sua coleção continua salva neste aparelho.</p></div>`;
    } else if (!estado.logado) {
      const v = estado.config.politicaVersao;
      dlg.innerHTML = `<div class="conta-in">${cab('Entrar')}
        <p>Entrar é opcional. Com conta, sua coleção e seu binder ficam guardados no servidor e aparecem em qualquer aparelho. Sem conta, tudo fica só neste navegador.</p>
        <p class="small">Guardamos só um código que identifica sua conta (sem e-mail, nome ou foto), a data do seu aceite e a lista das suas cartas. As fotos que você tira nunca saem do aparelho.</p>
        <label class="conta-ok"><input type="checkbox" id="c-pol"> <span>Li e concordo com a <a href="${POLITICA_URL}" target="_blank" rel="noopener">Política de Privacidade</a> (versão ${esc(v)}).</span></label>
        <label class="conta-ok"><input type="checkbox" id="c-idade"> <span>Tenho 18 anos ou mais. Se tenho menos, meu pai, mãe ou responsável leu a política e autorizou.</span></label>
        <div class="conta-g" id="c-g" aria-live="polite"></div>
        ${msgHtml()}
        <p class="small">O botão do Google só é carregado depois que você marca as duas caixas.</p></div>`;
      const pol = dlg.querySelector('#c-pol'), id = dlg.querySelector('#c-idade');
      const at = () => { if (pol.checked && id.checked) mostrarGoogle(); else dlg.querySelector('#c-g').innerHTML = ''; };
      pol.onchange = at; id.onchange = at;
    } else {
      const p = estado.perfil || {};
      const s = ls.get(K_SYNC, {});
      const quando = s.em ? new Date(s.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ainda não';
      dlg.innerHTML = `<div class="conta-in">${cab('Sua conta')}
        <div class="conta-perfil">${p.foto ? `<img alt="" referrerpolicy="no-referrer" src="${esc(p.foto)}">` : `<span class="av" style="display:grid;place-items:center;color:var(--edge)">${icone}</span>`}<div><b>${esc(p.nome || 'Treinador(a)')}</b><br><span class="small">Última sincronização: ${esc(quando)}${s.pendente ? ' · há mudanças a enviar' : ''}</span></div></div>
        ${msgHtml()}
        <div class="conta-acoes">
          <button class="btn primary" type="button" data-a="sync"${estado.sincronizando ? ' disabled' : ''}>${estado.sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}</button>
          <button class="btn" type="button" data-a="exportar">Baixar meus dados</button>
          <button class="btn" type="button" data-a="sair">Sair</button>
        </div>
        <hr>
        ${estado.confirmarExclusao ? `
          <p><b>Excluir a conta apaga do servidor tudo o que é seu</b>: o registro do aceite e a coleção sincronizada. Isso não pode ser desfeito. A coleção salva neste aparelho continua aqui.</p>
          <div class="conta-acoes"><button class="btn perigo" type="button" data-a="excluir-sim">Sim, excluir minha conta</button><button class="btn" type="button" data-a="excluir-nao">Cancelar</button></div>`
        : `<button class="btn perigo" type="button" data-a="excluir">Excluir conta e dados</button>`}
        <p class="small">Para tirar também a permissão dada ao Google, acesse <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">myaccount.google.com/connections</a>. Mais detalhes na <a href="${POLITICA_URL}" target="_blank" rel="noopener">Política de Privacidade</a>.</p></div>`;
      dlg.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(b.dataset.a));
    }
    dlg.querySelector('.fechar').onclick = () => dlg.close();
  }

  /* ---------------- Google Identity Services (carregado só após o aceite) ---------------- */
  let gisPromessa;
  function carregarGIS() {
    gisPromessa ||= new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => { gisPromessa = null; erro(new Error('Não consegui carregar o login do Google.')); };
      document.head.appendChild(s);
    });
    return gisPromessa;
  }
  async function mostrarGoogle() {
    const alvo = dlg.querySelector('#c-g'); if (!alvo) return;
    alvo.textContent = 'Carregando…';
    try {
      await carregarGIS();
      google.accounts.id.initialize({ client_id: estado.config.googleClientId, callback: aoLogar, ux_mode: 'popup', auto_select: false, itp_support: true, use_fedcm_for_prompt: true });
      alvo.textContent = '';
      google.accounts.id.renderButton(alvo, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'pt-BR', width: 280 });
    } catch (e) { alvo.textContent = ''; aviso(e.message, true); }
  }
  async function aoLogar(resp) {
    aviso('Entrando…');
    try {
      const j = await api('POST', '/auth/google', { credential: resp.credential, consentimento: { aceitouPolitica: true, idadeOk: true, versao: estado.config.politicaVersao } });
      estado.logado = true; estado.perfil = j.perfil; ls.set(K_PERFIL, j.perfil);
      ls.set(K_SYNC, { em: null, pendente: true });
      aviso('Pronto! Juntando a coleção deste aparelho com a da sua conta…');
      await sincronizar({ mesclar: true });
    } catch (e) { aviso(e.message, true); }
  }

  /* ---------------- Ações ---------------- */
  async function acao(a) {
    try {
      if (a === 'sync') { await sincronizar({ mesclar: ls.get(K_SYNC, {}).pendente }); }
      else if (a === 'exportar') {
        const r = await fetch(API + '/conta/exportar', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Não consegui gerar o arquivo.');
        const url = URL.createObjectURL(await r.blob());
        const l = Object.assign(document.createElement('a'), { href: url, download: 'pokelook-meus-dados.json' });
        document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        aviso('Arquivo com seus dados baixado.');
      }
      else if (a === 'sair') { await api('POST', '/logout'); sair('Você saiu. A coleção continua salva neste aparelho.'); try { google?.accounts?.id?.disableAutoSelect(); } catch {} }
      else if (a === 'excluir') { estado.confirmarExclusao = true; render(); }
      else if (a === 'excluir-nao') { estado.confirmarExclusao = false; render(); }
      else if (a === 'excluir-sim') { await api('DELETE', '/conta'); estado.confirmarExclusao = false; sair('Conta excluída. Apagamos do servidor o seu aceite e a coleção sincronizada.'); }
    } catch (e) { if (e.status === 401) sair('Sua sessão expirou. Entre de novo.', true); else aviso(e.message, true); }
  }
  function sair(t, erro = false) {
    estado.logado = false; estado.perfil = null; ls.del(K_PERFIL); ls.del(K_SYNC);
    aviso(t, erro); render();
  }

  /* ---------------- Sincronização ---------------- */
  // Chaves do app: 'colecao' = [{id, ts, img}] e 'binder' = {name, color, stickers, slots}.
  // Só id, ts e v (imagem no binder: 'o' oficial, 'f' foto) vão para o servidor; a foto (img) fica no aparelho.
  const lerLocal = () => ({ colecao: ls.get('colecao', []), binder: ls.get('binder', null) });
  const paraServidor = l => ({ colecao: (l.colecao || []).map(({ id, ts, v }) => (v ? { id, ts, v } : { id, ts })), binder: l.binder || null });
  function gravarLocal(srv) {
    const fotos = new Map(ls.get('colecao', []).map(x => [x.ts, x.img]));
    const col = (srv.colecao || []).map(x => ({ id: x.id, ts: x.ts, img: fotos.get(x.ts) ?? null, ...(x.v ? { v: x.v } : {}) }));
    ls.set('colecao', col);
    if (srv.binder) ls.set('binder', srv.binder);
    window.dispatchEvent(new Event('cartascan:colecao'));
  }
  function juntar(local, srv) {
    const porTs = new Map();
    for (const x of srv.colecao || []) porTs.set(x.ts, x);
    for (const x of local.colecao || []) {
      const y = porTs.get(x.ts);
      porTs.set(x.ts, y ? (x.v ? { ...y, v: x.v } : y) : x);
    }
    const colecao = [...porTs.values()].sort((a, b) => b.ts - a.ts);
    return { colecao, binder: srv.binder || local.binder || null };
  }
  async function enviar() {
    const j = await api('PUT', '/colecao', { colecao: paraServidor(lerLocal()) });
    ls.set(K_SYNC, { em: j.atualizadaEm, pendente: false });
  }
  async function sincronizar({ mesclar = false } = {}) {
    if (!estado.logado || estado.sincronizando) return;
    estado.sincronizando = true; if (dlg.open) render();
    try {
      const s = ls.get(K_SYNC, {});
      const r = await api('GET', '/colecao');
      const srv = r.colecao;
      if (!srv) { await enviar(); }
      else if (mesclar || s.pendente) { gravarLocal(juntar(lerLocal(), srv)); await enviar(); }
      else if (r.atualizadaEm !== s.em) { gravarLocal(srv); ls.set(K_SYNC, { em: r.atualizadaEm, pendente: false }); }
      aviso('Coleção sincronizada.');
    } catch (e) {
      if (e.status === 401) sair('Sua sessão expirou. Entre de novo para sincronizar.', true);
      else aviso(e.status === 413 ? 'Sua coleção ficou grande demais para sincronizar.' : 'Sem conexão com o servidor. Tento de novo depois.', true);
    } finally { estado.sincronizando = false; if (dlg.open) render(); else renderBotao(); }
  }
  let timer;
  window.addEventListener('cartascan:colecao', e => {
    if (!estado.logado || e.detail?.source !== 'app') return;
    const s = ls.get(K_SYNC, {}); ls.set(K_SYNC, { ...s, pendente: true });
    clearTimeout(timer); timer = setTimeout(() => enviar().catch(() => {}), 1500);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && estado.logado) sincronizar(); });

  /* ---------------- Início ---------------- */
  async function iniciar() {
    montar();
    try {
      const c = await api('GET', '/config');
      if (!c.googleClientId) return;
      estado.config = c;
    } catch { return; } // sem servidor (ex.: versão estática): o app funciona só com o aparelho
    try {
      const me = await api('GET', '/me');
      if (me.consentimento?.versao !== me.politicaAtual) {
        // A política mudou: pede um novo aceite antes de continuar sincronizando.
        await api('POST', '/logout').catch(() => {});
        sair('A Política de Privacidade foi atualizada. Leia e entre de novo para continuar sincronizando.');
        return;
      }
      estado.logado = true; renderBotao();
      sincronizar();
    } catch { if (estado.perfil) sair('Sua sessão terminou. Entre de novo para sincronizar.'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
