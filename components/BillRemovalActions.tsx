'use client';
import type {AdminEntry} from '@/lib/expenses';
import type {FinanceCommand,FinanceDocument} from '@/lib/finance';
import {billRuleForExpense} from '@/lib/bill-removal';
import './bill-removal.css';

export default function BillRemovalActions({expense,documents,disabled,onPrepare}:{expense:AdminEntry;documents:FinanceDocument[];disabled:boolean;onPrepare:(command:FinanceCommand)=>void}){
 if(!expense.active||expense.status!=='PREVISTO')return null;
 const rule=billRuleForExpense(expense,documents);
 return <><button className="bill-delete-action" disabled={disabled} title="Retira somente esta conta prevista, sem registrar pagamento" onClick={()=>onPrepare({action:'expense_archive',target_id:expense.id})}>Excluir conta</button>{rule&&<button className="bill-delete-action" disabled={disabled} title="Interrompe a repetição e exclui os vencimentos de hoje em diante; preserva pagamentos realizados" onClick={()=>onPrepare({action:'document_archive',target_id:rule.id})}>Excluir recorrência</button>}</>;
}
