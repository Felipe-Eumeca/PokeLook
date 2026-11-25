# PokeLook

App web (mobile-first) que identifica cartas de Pokémon TCG por foto, com visão computacional rodando no navegador. Projeto acadêmico (Trabalho I — Sistemas de Visão).

## Estrutura

| Pasta | O que é | Onde roda |
|---|---|---|
| `web/` | O app (HTML/CSS/JS estático), dados das cartas, `conta.js` (login e sincronização) e `privacidade.html` | Vercel |
| `server/` | API Node/Express: login com Google, coleção do usuário, exportar/excluir conta, proxy de imagens das cartas | Vercel (função em `api/index.js`) |
| `api/` | Ponte de 3 linhas que expõe o `server/` como função da Vercel | Vercel |
| banco | Parse do Back4app (`pokelook-db`), acessado pela REST API | Back4app |
| `scripts/` | `importar-prototipo.mjs`: copia o protótipo para `web/` e inclui o `conta.js` | sua máquina |

O site chama sempre `/api/...` no próprio domínio; o `vercel.json` manda essas chamadas para a função `api/index.js`. Assim o cookie de sessão é do próprio site (sem cookie de terceiros). Na Vercel, o projeto usa a raiz do repositório, com `web/` como pasta publicada.

**Por que a API não está no Back4app:** em 25/11/2026 o Back4app estava com a criação de Web Apps grátis em manutenção. O `server/` continua pronto para rodar lá (`npm start`, porta em `PORT`, health check `/api/saude`). Para mudar: crie o Web App com a pasta `server/`, copie as variáveis abaixo para ele e troque o `rewrites` do `vercel.json` pelo de `server/vercel-proxy-back4app.json` (com o endereço do Web App no lugar de `BACKEND_URL`).

## Privacidade (LGPD)

- Login é opcional; sem conta nada sai do aparelho.
- As fotos são processadas só no navegador e nunca são enviadas.
- O servidor guarda só um pseudônimo (HMAC do identificador Google), a versão/data do aceite e a coleção (ids das cartas + binder). Sem e-mail, nome ou foto.
- O script do Google só carrega depois do aceite da política e da confirmação de idade.
- "Baixar meus dados" (JSON) e "Excluir conta e dados" ficam no ícone de conta.
- Ao mudar a política, troque `POLITICA_VERSAO` em `server/server.js` e a versão em `web/privacidade.html`: o app pede novo aceite.
- **Não troque o `SESSION_SECRET` depois de ter usuários**: o pseudônimo depende dele, e as contas existentes ficariam órfãs.

## Variáveis do servidor (Vercel › Settings › Environment Variables)

Veja `server/.env.exemplo`. `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `PARSE_APP_ID` e `PARSE_MASTER_KEY` (do banco `pokelook-db`, em App Settings › Security & Keys). Sem as chaves do Parse, o servidor guarda tudo só na memória.

No banco `pokelook-db`, a classe `Usuario` é criada sozinha no primeiro login. Cada objeto é gravado com ACL vazia (sem acesso público); só a Master Key lê.

## Rodar localmente

```bash
cd server && npm install
GOOGLE_CLIENT_ID=seu-id.apps.googleusercontent.com NODE_ENV=development SITE_DIR=../web npm start
# abra http://localhost:8080
npm test   # testes da API
```

## Atualizar o app a partir do protótipo

```bash
node scripts/importar-prototipo.mjs ../prototipo-app
```
