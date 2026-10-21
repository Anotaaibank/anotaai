export type User={id:string;name:string;email:string;assistant_name?:string};
export type Pending={title:string;lines:string[];confirmation:string};
export type Proposal={pending?:Pending;answer?:string;conversation_id?:string};
export type Usage={plan_code:string;requests:number;voice_seconds:number;whatsapp_seconds:number;limits:{requests:number|null;voice_seconds:number|null;whatsapp_seconds:number|null}};
export type Document={id:string;kind:string;description:string;date:string;amount_cents:number;active:boolean;status:string;details:Record<string,unknown>};
export type Expense={id:string;description:string;entry_date:string;amount_cents:number;active:boolean;status:string};
export type Snapshot={today:string;configured:boolean;profile:{salary_cents:number};balance_cents:number;pending_month_cents:number;paid_month_cents:number;available_month_cents:number;alerts:string[];documents:Document[];expenses:Expense[]};
export type SnapshotResponse={snapshot:Snapshot;usage:Usage};
