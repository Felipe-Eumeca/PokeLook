# PokeLook

App web (mobile-first) que identifica cartas de Pokémon TCG por foto, com visão computacional rodando no navegador. Projeto acadêmico (Trabalho I — Sistemas de Visão).

## Estrutura

| Pasta | O que é | Onde roda |
|---|---|---|
| `web/` | O app (HTML/CSS/JS estático), dados das cartas, `conta.js` (login e sincronização) e `privacidade.html` | Vercel |
| `server/` | API Node/Express: login com Google, coleção do usuário, exportar/excluir conta, proxy de imagens das cartas | Back4app (Web App) |
| `scripts/` | `importar-prototipo.mjs`: copia o protótipo para `web/` e inclui o `conta.js` | sua máquina |

O site chama sempre `/api/...` no próprio domínio; o `web/vercel.json` repassa essas chamadas para o servidor no Back4app. Assim o cookie de sessão é do próprio site (sem cookie de terceiros).

## Privacidade (LGPD)

- Login é opcional; sem conta nada sai do aparelho.
- As fotos são processadas só no navegador e nunca são enviadas.
- O servidor guarda só um pseudônimo (HMAC do identificador Google), a versão/data do aceite e a coleção (ids das cartas + binder). Sem e-mail, nome ou foto.
- O script do Google só carrega depois do aceite da política e da confirmação de idade.
- "Baixar meus dados" (JSON) e "Excluir conta e dados" ficam no ícone de conta.
- Ao mudar a política, troque `POLITICA_VERSAO` em `server/server.js` e a versão em `web/privacidade.html`: o app pede novo aceite.
- **Não troque o `SESSION_SECRET` depois de ter usuários**: o pseudônimo depende dele, e as contas existentes ficariam órfãs.

## Variáveis do servidor (painel do Back4app)

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
