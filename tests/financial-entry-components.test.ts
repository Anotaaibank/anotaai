import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import * as amounts from '../lib/expenses.ts';
import * as model from '../lib/model.ts';
import {buildFinancePlan,financeSnapshot,readFinance,signFinance,type FinanceCommand} from '../lib/finance.ts';
import {registerLocal} from '../lib/local-db.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import * as lifecycle from '../components/financial-dialog/lifecycle.ts';

// Actual TSX handlers with simulated hooks. These are not browser/focus tests.
type Tree={type:unknown;props:Record<string,any>};
function nodes(value:any):Tree[]{return Array.isArray(value)?value.flatMap(nodes):value?.props?[value,...nodes(value.props.children)]:[];}
function component(file:string,exportName='default',firstState?:unknown,document:unknown={}){
 const states:unknown[]=[],effects:(()=>unknown)[]=[];let index=0,tree:unknown;
 const react={useState:(initial:unknown)=>{const i=index++;if(!(i in states))states[i]=i===0&&firstState!==undefined?firstState:typeof initial==='function'?initial():initial;return [states[i],(next:unknown)=>{states[i]=next;}];},useRef:(initial:unknown)=>{const i=index++;return states[i]??=( {current:initial});},useEffect:(fn:()=>unknown)=>{effects.push(fn);},useLayoutEffect:(fn:()=>unknown)=>{effects.push(fn);}};
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const imports:Record<string,unknown>={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'@/lib/model':model,'@/lib/expenses':amounts,'./lifecycle':lifecycle,'@/components/Localization':{Localize:'localize',OriginalText:'original'},'./Localization':{Localize:'localize'}};
 const output=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exported:Record<string,(props:any)=>unknown>={};
 new Function('require','exports','document',output)((name:string)=>imports[name]??{__esModule:true,default:name,ManualIncomeForm:'manual-income'},exported,document);
 return {render(props:unknown){index=0;tree=exported[exportName](props);return tree;},get tree(){return tree;},effects};
}

test('overview routes an existing balance to current-balance adjustment and first setup to profile',()=>{
 for(const configured of [true,false]){
  const snapshot={...financeSnapshot({documents:[],expenses:[]}),configured,balance_cents:110000};
  const view=component('components/Finance.tsx','FinanceOverview',snapshot);
  const render=()=>view.render({onSaved:()=>{}});render();
  const button=nodes(view.tree).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes(configured?'Ajustar saldo atual':'Cadastrar saldo inicial'));
  assert.ok(button);button.props.onClick();render();
  const adjustment=nodes(view.tree).find(n=>n.type==='./BalanceAdjustment');
  assert.equal(!!adjustment,configured);if(adjustment)assert.equal(adjustment.props.balance,110000);
 }
});

test('manual current balance prepares adjustment, then signed confirmation preserves opening balance and history',()=>{
 process.env.ANOTA_DATABASE_PATH=':memory:';
 const user=registerLocal(randomUUID()+'@example.test','synthetic-balance-ui','UI sintética').user.id,today=model.brazilDay();
 const save=(command:FinanceCommand)=>applyLocalFinance(user,buildFinancePlan(command,localFinanceState(user),user,randomUUID(),today),'MANUAL');
 save({action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:today}});
 save({action:'income_upsert',description:'Receita anterior',amount_cents:30000});
 save({action:'expense_create',description:'Gasto anterior',amount_cents:20000,category:'Supermercado'});
 const before=localFinanceState(user),commands:FinanceCommand[]=[],view=component('components/BalanceAdjustment.tsx');
 const props={balance:110000,busy:false,onClose:()=>{},onPrepare:(c:FinanceCommand)=>commands.push(c)};
 view.render(props);nodes(view.tree).find(n=>n.type==='input')!.props.onChange({target:{value:'1.500,00'}});view.render(props);
 nodes(view.tree).find(n=>n.type==='form')!.props.onSubmit({preventDefault:()=>{}});
 assert.deepEqual(commands,[{action:'balance_adjust',balance_cents:150000}]);
 assert.deepEqual(localFinanceState(user),before); // Form only prepares, never writes.
 const plan=buildFinancePlan(commands[0],before,user,randomUUID(),today),secret='synthetic-ui-confirmation';
 const signed=signFinance(plan,user,secret);applyLocalFinance(user,readFinance(signed,user,secret),'MANUAL');
 const after=localFinanceState(user),snapshot=financeSnapshot(after,today);
 assert.equal(snapshot.balance_cents,150000);assert.equal(snapshot.profile.opening_balance_cents,100000);
 assert.deepEqual(after.expenses,before.expenses);assert.equal(after.documents.filter(d=>d.kind==='INCOME').length,1);
 assert.equal(after.documents.filter(d=>d.kind==='BALANCE_ADJUSTMENT').length,1);
 applyLocalFinance(user,readFinance(signed,user,secret),'MANUAL');assert.equal(financeSnapshot(localFinanceState(user),today).balance_cents,150000);
});

test('manual adjustment accepts zero/negative, refuses invalid values and ignores submit while busy',()=>{
 for(const [raw,expected]of [['0,00',0],['-200,00',-20000],['abc',null],['',null],['10000001,00',null]] as const){
  const commands:FinanceCommand[]=[],view=component('components/BalanceAdjustment.tsx'),props={balance:0,busy:false,onClose:()=>{},onPrepare:(c:FinanceCommand)=>commands.push(c)};
  view.render(props);nodes(view.tree).find(n=>n.type==='input')!.props.onChange({target:{value:raw}});view.render(props);nodes(view.tree).find(n=>n.type==='form')!.props.onSubmit({preventDefault:()=>{}});view.render(props);
  if(expected===null){assert.equal(commands.length,0);assert.ok(nodes(view.tree).some(n=>n.props.role==='alert'));}
  else assert.deepEqual(commands,[{action:'balance_adjust',balance_cents:expected}]);
  const count=commands.length;view.render({...props,busy:true});nodes(view.tree).find(n=>n.type==='form')!.props.onSubmit({preventDefault:()=>{}});assert.equal(commands.length,count);
 }
});

test('manual selector keeps Escape but delegates Escape/Tab to an open native child dialog',()=>{
 let listener:(event:any)=>void=()=>{},closed=0,prevented=0,child=false;
 const document={body:{style:{overflow:''}},activeElement:{focus:()=>{}},addEventListener:(_name:string,fn:typeof listener)=>{listener=fn;},removeEventListener:()=>{}};
 const view=component('components/ManualTransactions.tsx','default',undefined,document);
 view.render({onClose:()=>{closed++;},onSaved:()=>{}});
 const root=nodes(view.tree).find(n=>n.type==='div'&&n.props.className==='manual-entry-scope')!;
 root.props.ref.current={querySelector:(selector:string)=>selector==='dialog[open]'&&child?{}:null,querySelectorAll:()=>{throw Error('Native child must own Tab');}};
 const cleanup=view.effects[0]() as ()=>void;
 try{
  listener({key:'Escape',preventDefault:()=>{prevented++;}});assert.equal(closed,1);assert.equal(prevented,1);
  child=true;listener({key:'Escape',preventDefault:()=>{prevented++;}});listener({key:'Tab',preventDefault:()=>{prevented++;}});
  assert.equal(closed,1);assert.equal(prevented,1);
 }finally{cleanup();}
});

test('manual income suspends its native editor during confirmation, preserving the mounted form',()=>{
 for(const pending of [null,{title:'Conferir entrada',lines:[],confirmation:'synthetic'}]){
  const view=component('components/Finance.tsx','ManualIncomeForm',pending);
  view.render({onSaved:()=>{},onClose:()=>{}});
  const editor=nodes(view.tree).find(n=>typeof n.type==='function'&&n.type.name==='FinanceEditor');
  assert.ok(editor);assert.equal(editor.props.active,!pending);
  const wrapper=nodes(view.tree).find(n=>n.type==='div'&&'hidden' in n.props);
  assert.equal(wrapper?.props.hidden,!!pending);
 }
});

test('actual financial dialog closes when suspended and can reopen without remounting form children',()=>{
 const view=component('components/financial-dialog/FinancialDialog.tsx'),props={labelledBy:'test-title',onClose:()=>{},children:'preserved-form'};
 let shown=0,closed=0;
 const dialog={open:false,ownerDocument:{activeElement:{isConnected:true,focus:()=>{}}},showModal(){shown++;this.open=true;},close(){closed++;this.open=false;}};
 view.render({...props,active:false});nodes(view.tree).find(n=>n.type==='dialog')!.props.ref.current=dialog;
 assert.equal(view.effects.at(-1)!(),undefined);assert.equal(shown,0);
 view.render({...props,active:true});const dispose=view.effects.at(-1)!() as ()=>void;
 assert.equal(shown,1);assert.equal(dialog.open,true);
 dispose();view.render({...props,active:false});assert.equal(view.effects.at(-1)!(),undefined);assert.equal(closed,1);assert.equal(dialog.open,false);
 view.render({...props,active:true});const disposeAgain=view.effects.at(-1)!() as ()=>void;assert.equal(shown,2);disposeAgain();
});
