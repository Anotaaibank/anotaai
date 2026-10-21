/** Provider-neutral contracts. No price, product ID, receipt or client flag grants access. */
export type PurchaseKind='monthly'|'annual'|'feature';
export type VerifiedEntitlement={userId:string;active:boolean;expiresAt:string|null;source:'apple'|'google'|'web'};
export interface BillingProvider{
 purchase(kind:PurchaseKind):Promise<{transactionId:string}>;
 restore():Promise<void>;
}
export const billingAvailability={enabled:false,reason:'Compras e restauração dependem da escolha aprovada do provedor e da validação de recibos no servidor.'} as const;
