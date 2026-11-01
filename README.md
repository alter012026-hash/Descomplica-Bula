# Descomplica Bula

Site editorial em português para explicar bulas, cuidados e alertas sobre medicamentos em linguagem simples. O conteúdo é informativo: não substitui a bula oficial nem a orientação de um profissional de saúde.

## Começar

Requisitos: Node.js 20 ou superior e npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. Para acessar `/admin`, defina `ADMIN_PASSWORD` em `.env.local`. Chaves de IA, newsletter, GitHub e Redis são opcionais para executar o site; configure somente os serviços que utilizar.

## Automações em produção

O deploy de produção já é feito pela integração nativa Vercel-GitHub a cada push na branch `main`; não precisa de `VERCEL_DEPLOY_HOOK`. Os workflows agendados rodam no GitHub Actions, então cadastre os valores em **Settings → Secrets and variables → Actions** no repositório, e não em arquivos do Git.

| Automação | Variáveis na Vercel | GitHub Actions secrets | Observações |
| --- | --- | --- | --- |
| Admin (`/admin`) | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | — | Defina uma senha forte e gere um segredo aleatório. |
| Rascunhos diários com IA | Uma chave: `GROK_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY` ou `GEMINI_API_KEY` | A mesma chave, com o mesmo nome | O workflow gera rascunhos para revisão; não publica artigos automaticamente. |
| Newsletter diária | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEWSLETTER_CRON_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` | `NEWSLETTER_CRON_SECRET`, `SITE_URL` | Use o mesmo segredo cron nos dois painéis, um remetente verificado no Resend e um token GitHub com acesso de leitura e escrita ao repositório. O `SITE_URL` deve ser a URL pública implantada. |
| Métricas persistentes | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | — | Credenciais da base Redis REST do Upstash. O projeto usa o prefixo `descomplica-bula:` nas chaves e pode compartilhar uma base; nesse caso, os limites de uso são compartilhados entre projetos. |

`GITHUB_TOKEN` e `GITHUB_REPO` na Vercel são necessários para ações do painel administrativo que escrevem no GitHub e para a newsletter atualizar seu estado de envio. O token deve ter permissão de conteúdo de leitura e escrita no repositório. O workflow de geração usa o `GITHUB_TOKEN` automático do Actions, com permissão de escrita no repositório. `VERCEL_DEPLOY_HOOK` é opcional para acionamentos extras e não é necessário para o deploy normal.

Gere `ADMIN_SESSION_SECRET` e `NEWSLETTER_CRON_SECRET` com valores aleatórios, por exemplo no PowerShell: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Cadastre os segredos diretamente nos painéis Vercel/GitHub; não os envie por chat nem os salve no repositório. Após alterar variáveis da Vercel, faça um novo deploy para aplicá-las.

## Conteúdo e segurança editorial

- Configure os dados do site em `site.config.js`, incluindo domínio, e-mail, categorias e fontes oficiais.
- A geração de artigos depende de uma chave de provedor de IA e das variáveis de ambiente documentadas em `.env.example`.
- A geração valida a categoria do tema, acessa até três URLs oficiais e fornece o texto extraído como contexto; se nenhuma fonte legível puder ser checada, a geração não é aprovada. Isso não comprova automaticamente cada afirmação: a revisão humana continua obrigatória.
- No admin, use **Artigos → Posts publicados → Atualizar com fontes oficiais** para propor uma revisão. Informe páginas da Anvisa ou de outros domínios permitidos; a proposta fica na fila editorial, mantém a versão publicada intacta e tem as fontes acessadas novamente antes da aprovação.
- Artigos gerados e enviados manualmente passam por verificações automáticas e devem ser aprovados por uma pessoa antes da publicação.
- A validação exige fontes HTTPS de domínios permitidos, referência à bula oficial, avisos de segurança e contatos de emergência. Ela não substitui revisão clínica e editorial.
- O recurso “Tire sua dúvida” responde com base no artigo e encaminha perguntas de risco para serviços de emergência. Não use a resposta para decidir tratamento ou dose.
- Em uma emergência, ligue para o SAMU (192) ou para o Disque-Intoxicação (0800 722 6001). Em crise emocional, ligue para o CVV (188).

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desenvolvimento local |
| `npm run build` | Compilar para produção |
| `npm start` | Servir a compilação |
| `npm test` | Executar os testes automatizados |
| `npm run generate-article` | Gerar uma sugestão de artigo; aceita `--topic "tema" --category "categoria"` |
| `npm run audit:seo` | Auditar SEO dos artigos |
| `npm run verify:seo` | Verificar metadados e rotas |
| `npm run check:redis` | Verificar a configuração opcional do Redis |

## Privacidade e configurações

O Google AdSense e a verificação do Search Console estão desativados por padrão. O domínio e o e-mail definidos no projeto são provisórios; atualize `site.config.js` antes de publicar. Consulte `/privacidade` para informações sobre newsletter, métricas e processamento de perguntas por provedores de IA.
