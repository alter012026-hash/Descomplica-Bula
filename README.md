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

## Conteúdo e segurança editorial

- Configure os dados do site em `site.config.js`, incluindo domínio, e-mail, categorias e fontes oficiais.
- A geração de artigos depende de uma chave de provedor de IA e das variáveis de ambiente documentadas em `.env.example`.
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
| `npm run generate-article` | Gerar uma sugestão de artigo |
| `npm run audit:seo` | Auditar SEO dos artigos |
| `npm run verify:seo` | Verificar metadados e rotas |
| `npm run check:redis` | Verificar a configuração opcional do Redis |

## Privacidade e configurações

O Google AdSense e a verificação do Search Console estão desativados por padrão. O domínio e o e-mail definidos no projeto são provisórios; atualize `site.config.js` antes de publicar. Consulte `/privacidade` para informações sobre newsletter, métricas e processamento de perguntas por provedores de IA.
