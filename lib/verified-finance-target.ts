import type {FinanceDraft} from './finance-ai.ts';
import type {FinanceCommand,FinanceState} from './finance.ts';
// Ephemeral provenance, not a JSON flag, permission, request lease or record cache.
// A model/client cannot recreate object identity by returning fields or JSON.
const proofs=new WeakMap<object,{source:string;id:string;action:string;reserve_id?:string;snapshot:string}>();
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
function targetSnapshot(state:FinanceState,c:FinanceCommand){const collection=c.action.startsWith('expense_')?'expenses':'documents',row=state[collection].find(r=>r.id===c.target_id);return row?JSON.stringify([collection,canonical(row)]):null;}
export function markLocalFinanceTarget<T extends FinanceDraft|null>(draft:T,source:string,state:FinanceState):T{
 if(!draft||draft.intent!=='COMMAND'||!draft.command||typeof draft.command!=='object')return draft;
 const c=draft.command as FinanceCommand;if(!c.target_id||draft.target_excerpt!==c.target_id)return draft;const snapshot=targetSnapshot(state,c);if(snapshot)proofs.set(draft,{source:source.normalize('NFC').trim(),id:c.target_id,action:c.action,reserve_id:c.reserve_id,snapshot});return draft;
}
export function hasLocalFinanceTarget(draft:FinanceDraft){return proofs.has(draft);}
export function verifiedFinanceTarget(source:string,draft:FinanceDraft,state?:FinanceState):string|undefined{
 const proof=proofs.get(draft),c=draft.command as FinanceCommand|null;if(!proof||!c||c.target_id!==proof.id||draft.target_excerpt!==proof.id||c.action!==proof.action||c.reserve_id!==proof.reserve_id)return;
 let text=source.normalize('NFC').trim();if(text!==proof.source){const suffix='\nRegistro identificado nesta conversa: '+proof.id;if(!text.endsWith(suffix))return;text=text.slice(0,-suffix.length);if(text!==proof.source)return;}
 if(state&&targetSnapshot(state,c)!==proof.snapshot)return;return proof.id;
}
