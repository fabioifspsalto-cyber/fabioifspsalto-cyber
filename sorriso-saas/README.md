# Sorriso SaaS (protótipo)

Micro-SaaS para clínicas odontológicas: foto do sorriso no tablet → escolha do tratamento
(lentes, clareamento, alinhadores) → simulação por IA → antes × depois → PDF com marca da clínica e orçamento.

- `apps/api` — Node.js + Fastify + TypeScript. Postgres (PGlite em dev), storage de arquivos, provedor de IA plugável, PDF (pdfkit).
- `apps/web` — React + Vite (PWA para tablet). Paleta: fundo branco, texto preto, detalhes verde-água.
- `docs/LGPD.md` — como o código atende (e o que ainda falta) em relação à LGPD.

## Rodar

```bash
npm install
ADMIN_TOKEN=troque-me npm run dev:api          # :3333
npm run dev:web                                 # :5173 (proxy para a API)

# cadastrar uma clínica (a chave só aparece uma vez)
curl -X POST localhost:3333/v1/clinics -H 'authorization: Bearer troque-me' \
  -H 'content-type: application/json' -d '{"name":"Clínica Exemplo","brandColor":"#2EC4B6"}'
```

Abra o web, entre com a `apiKey` retornada. A câmera exige HTTPS (ou `localhost`).
Testes da API: `npm test`.

## Provedor de IA

`AI_PROVIDER=mock` (padrão) **não é IA generativa**: só clareia pixels de dente na área da boca para testar o fluxo.
Para produção use `AI_PROVIDER=http` + `AI_URL` apontando para um serviço de inpainting (contrato em `apps/api/src/ai/http.ts`).
O inpainting deve ficar restrito ao retângulo da boca, para não alterar o rosto do paciente.

## Estado atual / pendências

Feito e testado (`npm test`, 4 testes): consentimento por finalidade, simulação com provedor mock (tempo medido),
PDF, isolamento entre clínicas, revogação e eliminação de dados, retenção automática.

Não feito ainda:
- Modelo de IA real e medição dos 15 s com GPU; guia da boca com MediaPipe (hoje é uma área fixa na tela).
- Login de usuários com MFA (hoje: chave por clínica), RLS no Postgres, storage S3 no Brasil, rate limit.
- UI não foi testada em navegador/tablet real; só `tsc` + build.
- Texto do termo de consentimento é um rascunho e precisa de revisão jurídica.
