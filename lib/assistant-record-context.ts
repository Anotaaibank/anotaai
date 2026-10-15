import type {FinanceState} from './finance.ts';
import {fold} from './finance-date.ts';
// Give the model relevant, bounded records. The backend still validates a target
// against the complete owner-scoped state, including ambiguous duplicate names.
export function assistantRecordContext(state:FinanceState,text:string){
 const words=fold(text).match(/[a-z0-9-]{3,}/g)?.filter(w=>!['qual','quais','quanto','para','mim','paguei','gastei','recebi','anota','agenda','hoje','amanha','reais','meu','minha','uma','com'].includes(w))||[];
 const ranked=<T extends {id:string;description:string;active:boolean;updated_at:string}>(records:T[])=>records.map(record=>({record,score:words.reduce((score,w)=>score+(fold(record.id+' '+record.description).includes(w)?10:0),0)+(record.active?2:0)})).sort((a,b)=>b.score-a.score||b.record.updated_at.localeCompare(a.record.updated_at)).slice(0,60).map(({record})=>record);
 return {documents:ranked(state.documents),expenses:ranked(state.expenses),total_documents:state.documents.length,total_expenses:state.expenses.length,truncated:state.documents.length>60||state.expenses.length>60};
}
