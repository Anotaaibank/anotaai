# Segurança e recuperação

Implementado: API desligada por padrão, bearer nativo sem fallback de cookies, sessão AES-GCM com domínio próprio/expiração e titular validado; SecureStore; HTTPS na distribuição; campos de dono recusados; regras e RLS existentes reaproveitadas. Confirmações assinadas/idempotentes e recibo de persistência antes de sucesso. Sem repetição automática de escrita após perda de rede. Nenhuma chave administrativa no bundle.

Pacote EAS usa lista de arquivos permitidos e rejeita links simbólicos e alguns padrões de segredo. Scanner é barreira adicional, não certificação. Testes sintéticos cobrem token adulterado/expirado, outro titular, logout, cookie indevido, dono no corpo, duplicidade e centavos. Não equivalem a pentest nem a auditoria do banco de produção; RLS não foi alterada.

Antes de produção: revisar rate limit distribuído, origem confiável do IP, rotação de segredo, revogação abrangente e retenção de logs. Sessões atuais dependem do SQLite do servidor. Não registrar senha, token, áudio ou transcrição bruta; usar ID, categoria, status e duração.

Backup: inventariar cobertura Supabase/volume Easypanel, definir RPO/RTO, retenção e destino cifrado. Não presumir PITR no plano atual. Fazer cópias consistentes e ensaiar restauração isolada, conferindo vínculos e contagens. O ensaio ainda não foi executado. Nunca restaurar sobre produção sem aprovação.

Recuperação de senha e exclusão completa ainda devem ser implementadas com reautenticação, confirmação, retenção legal e tratamento da conta do casal. Exclusão de dados e cancelamento de assinatura são ações distintas. Não apagar apenas o usuário Auth deixando sessões e referências. Definir contato LGPD e prazos antes da publicação.

Fontes: [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
