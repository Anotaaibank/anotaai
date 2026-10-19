import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {appLocale,localeFromCookie,translatedText,hasTranslation} from '../lib/locale.ts';
import {localizedTree} from '../lib/localized-tree.ts';
import {voiceSession} from '../lib/assistant-session.ts';

test('language preference accepts only the two supported locales',()=>{
 assert.equal(appLocale('en-US'),'en-US');assert.equal(appLocale('en-GB'),'pt-BR');
 assert.equal(localeFromCookie('other=x; anotei-locale=en-US; session=private'),'en-US');
 assert.equal(localeFromCookie('anotei-locale=<script>'),'pt-BR');assert.equal(localeFromCookie(null),'pt-BR');
});
test('primary screens, checkout, registration and manual have static English copy',()=>{
 for(const source of ['Visão geral','Meu dinheiro','Rendas complementares','Contas a pagar','Minhas despesas','Despesas fixas','Agenda','Viagens','Como usar','Confirmar senha','Nome completo','Criar minha conta pessoal','Conferir e continuar','Registrar pagamento','Excluir conta','Meu uso']){
  assert.ok(hasTranslation(source),'Missing: '+source);assert.notEqual(translatedText(source,'en-US'),source);
  assert.equal(translatedText(source,'pt-BR'),source);
 }
});
test('displayed BRL amounts retain exactly the original amount, including thousands and negatives',()=>{
 assert.equal(translatedText('R$ 1.200','en-US'),'R$1,200.00');
 assert.equal(translatedText('R$ 49,90','en-US'),'R$49.90');
 assert.equal(translatedText('R$ -1.500,25','en-US'),'-R$1,500.25');
 assert.equal(translatedText('R$1,500.25','en-US'),'R$1,500.25');
 const text=translatedText('Exemplo ilustrativo: R$ 1.200 no saldo - R$ 500 de contas pendentes = R$ 700 disponíveis.','en-US');
 assert.ok(text.includes('R$1,200.00'));assert.ok(text.includes('R$500.00'));assert.ok(text.includes('R$700.00'));
});
test('translated reports preserve blank lines and never reformat an already English BRL amount',()=>{
 const source='Saldo atual: R$ 1.500,25\n\nContas a pagar: R$ 800,00';
 const result=translatedText(source,'en-US');assert.equal(result.split('\n').length,3);
 assert.ok(result.includes('R$1,500.25'));assert.ok(result.includes('R$800.00'));
 assert.ok(!result.includes('Saldo atual'));assert.equal(translatedText(result,'en-US'),result);
});
test('calendar display uses American dates without changing stored ISO values',()=>{
 assert.equal(translatedText('19/10/2026','en-US'),'10/19/2026');
 assert.equal(translatedText('outubro de 2026','en-US'),'October 2026');
 assert.equal(translatedText('19 de outubro de 2026','en-US'),'October 19, 2026');
 assert.equal(translatedText('2026-10-19','en-US'),'2026-10-19');
});
test('app voice follows the selected language while retaining exactly the same tools and confirmation boundaries',()=>{
 const portuguese=voiceSession('agenda','Lucy'),english=voiceSession('agenda','Lucy','en-US');
 assert.equal(portuguese.audio.input.transcription.language,'pt');assert.equal(english.audio.input.transcription.language,'en');
 assert.ok(english.instructions.includes('Speak natural US English'));assert.deepEqual(english.tools,portuguese.tools);
 assert.equal(english.audio.output.voice,portuguese.audio.output.voice);assert.equal(english.max_output_tokens,portuguese.max_output_tokens);
 assert.ok(english.instructions.includes('Never claim a record was saved before server confirmation'));
});
test('localization does not mutate inputs, business values, URLs, names or callbacks',()=>{
 let clicked=0;const onClick=()=>{clicked++;};
 const original=createElement('form',{action:'/api/finance'},
  createElement('input',{name:'description',defaultValue:'Minha viagem',placeholder:'Seu nome',required:true}),
  createElement('select',{name:'category',defaultValue:'Restaurante'},createElement('option',null,'Restaurante')),
  createElement('button',{onClick},'Confirmar'),
  createElement('span',{translate:'no'},'Restaurante'),
  createElement('a',{href:'/manual#contas','aria-label':'Como usar'},'Como usar'));
 const localized=localizedTree(original,'en-US') as ReactElement<Record<string,unknown>>;
 const children=localized.props.children as ReactElement<Record<string,unknown>>[];
 assert.equal(children[0].props.defaultValue,'Minha viagem');assert.equal(children[0].props.name,'description');assert.equal(children[0].props.required,true);
 const option=children[1].props.children as ReactElement<Record<string,unknown>>;
 assert.equal(option.props.value,'Restaurante');assert.equal(option.props.children,'Restaurants');
 assert.equal(children[2].props.onClick,onClick);(children[2].props.onClick as ()=>void)();assert.equal(clicked,1);
 assert.equal(children[3].props.children,'Restaurante');assert.equal(children[4].props.href,'/manual#contas');
 assert.equal((original.props as unknown as {children:ReactElement<{children:string}>[]}).children[2].props.children,'Confirmar');
 assert.strictEqual(localizedTree(original,'pt-BR'),original);
 assert.equal(renderToStaticMarkup(original).includes('Minha viagem'),true);
});
test('custom component props remain opaque and user text is never sent to a translation service',()=>{
 function UserData({name}:{name:string}){return createElement('span',null,name);}
 const component=createElement(UserData,{name:'Restaurante'});
 assert.strictEqual(localizedTree(component,'en-US'),component);
 assert.equal(translatedText('João Santos · meu carro vermelho','en-US'),'João Santos · meu carro vermelho');
});
test('dynamic greetings, payment counters and AI labels translate without translating the chosen name',()=>{
 assert.equal(translatedText('Olá, Água,','en-US'),'Hi, Água!');
 assert.equal(translatedText('Olá, vamos começar?','en-US'),'Hi, ready to get started?');
 assert.equal(translatedText('Conversar com Lucy','en-US'),'Talk to Lucy');
 assert.equal(translatedText('Lucy · toque para conversar','en-US'),'Lucy · tap to chat');
 assert.equal(translatedText('pagamentos','en-US'),'payments');
});
test('subscription copy distinguishes an unlimited usage allowance from free service and preserves the brand',()=>{
 const copy=translatedText('Pedidos, áudios no WhatsApp e voz no aplicativo sem franquia mensal.','en-US');
 assert.ok(copy.includes('no monthly usage cap'));assert.doesNotMatch(copy,/no monthly fee|free service/i);
 assert.equal(translatedText('NA HORA','en-US'),'NA HORA');
 assert.equal(translatedText('Um plano para','en-US'),'A plan to');
});
test('English forms explain the Brazilian decimal input format without changing the submitted amount',()=>{
 const input=createElement('label',null,'Valor (R$)',createElement('input',{inputMode:'decimal',name:'amount',defaultValue:'1.500,00',placeholder:'Ex.: 25,00 de gasolina'}));
 const html=renderToStaticMarkup(localizedTree(input,'en-US'));
 assert.ok(html.includes('value="1.500,00"'));assert.ok(html.includes('Use comma for decimals: 1.500,00'));
 assert.ok(html.includes('25,00'));assert.ok(html.includes('comma for decimals'));
});
test('password controls and dynamically changing summaries can switch back without changing the original tree',()=>{
 for(const source of ['Mostrar senha','Ocultar senha','Salvando…','Confirmar lançamento','Cancelar']){
  const original=createElement('button',{'aria-label':source},source);
  const english=renderToStaticMarkup(localizedTree(original,'en-US'));
  assert.ok(!english.includes('aria-label="'+source+'"'),source);
  assert.equal(renderToStaticMarkup(localizedTree(original,'pt-BR')),renderToStaticMarkup(original));
 }
});
