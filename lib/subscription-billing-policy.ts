// Commercial intent, not authorization to charge or proof of an integration.
// A payment provider, hosted checkout and verified payment events are still required.
export const subscriptionBillingPolicy={
 primary_method:'CARTAO',
 card:{recurring:true,interval:'MENSAL',status:'PENDENTE_INTEGRACAO'},
 pix:{alternative:true,confirmation:'ADMINISTRATIVA'},
} as const;

export const subscriptionPaymentCopy={
 summary:'Cartão de crédito como opção principal, com renovação mensal automática. Integração em preparação. Pix disponível como alternativa, com validação administrativa.',
 faq:'O cartão de crédito será a opção principal, com renovação automática mensal. Estamos preparando essa modalidade. O Pix continuará como alternativa, com validação da administração e 30 dias de acesso após a aprovação. A ativação do WhatsApp depende da liberação do número cadastrado.',
} as const;
