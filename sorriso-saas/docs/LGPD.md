# LGPD — mapa do protótipo

| Requisito | Onde está | Situação |
|---|---|---|
| Consentimento específico, destacado, por finalidade (art. 11, I) | `POST /v1/consents`; 3 caixas separadas (simulação obrigatória; marketing e treino de IA opcionais, desmarcadas) | Implementado; texto precisa de revisão jurídica |
| Versão do termo e data do aceite | `consents.term_version`, `granted_at` | Implementado |
| Revogação | `POST /v1/consents/:id/revoke` apaga as imagens dependentes | Implementado |
| Eliminação a pedido (art. 18) | `DELETE /v1/patients/:id`; botão "Encerrar e apagar" | Implementado |
| Retenção limitada | `clinics.retention_days` + `purgeExpired` (a cada hora) | Implementado |
| Minimização | EXIF/GPS removidos na re-codificação; não treina IA com fotos | Implementado |
| Isolamento entre clínicas | `clinic_id` em todas as consultas (testado) | Implementado; adicionar RLS |
| Trilha de auditoria sem dado pessoal | `audit_log` | Implementado |
| Sem cache de imagem sensível | `cache-control: private, no-store` | Implementado |
| Criptografia em repouso/trânsito, região Brasil | — | Pendente (S3 sa-east-1 + SSE-KMS, TLS) |
| Transferência internacional (art. 33) | — | Pendente: manter IA/storage no Brasil ou contrato com salvaguardas |
| Papéis (clínica = controladora, SaaS = operador), contrato, subprocessadores | — | Pendente (jurídico) |
| RIPD, encarregado (DPO), plano de incidentes | — | Pendente |
| Autenticação de usuários com MFA, perfis | — | Pendente |
| Regras de publicidade do CFO para antes/depois | — | Verificar resolução vigente |
