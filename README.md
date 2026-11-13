# sala-x4-nivel

Cópia da Futzera X4 com **gate de rating**: só entra quem tem **rating > 75** no site Haxbook.

- Nome padrão: `⬆ HAXBOOK | X4 NÍVEL 75+ ⬆`
- PM2: `sala-x4-nivel`
- Sem conta / rating ≤ 75 → kick na entrada
- Site fora / timeout → **deixa entrar** (fail-open)
- Staff **não** bypassa o gate
- Infra própria (token, Discord, Supabase, stats URL); integrada ao site via API

```bash
cp .env.example .env
# preencha HAXBALL_TOKEN, HAXBOOK_API_KEY, webhooks, supabase…
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
```

Testes: `npm test`
