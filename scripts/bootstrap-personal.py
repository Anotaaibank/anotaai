from pathlib import Path
import json, hashlib, shutil

root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\Bruno Lira\Documents\Codex\2026-10-01\files-pasted-by-the-user-projeto\outputs\experiencia-icom')
manifest = []
files = {
    'lib/icom-bank/personal-expenses.ts': 'lib/personal-expenses.ts',
    'lib/icom-bank/expense-context.ts': 'lib/expense-context.ts',
    'lib/icom-bank/expense-date.ts': 'lib/expense-date.ts',
    'lib/icom-bank/assistant-client.ts': 'lib/assistant-client.ts',
    'lib/icom-bank/whatsapp-ai.ts': 'lib/whatsapp-ai.ts',
    'lib/icom-bank/whatsapp-expenses.ts': 'lib/whatsapp-expenses.ts',
    'lib/secret-box.ts': 'lib/secret-box.ts',
    'app/icom-bank/bank.css': 'app/base.css',
    'app/icom-bank/voice.css': 'app/voice.css',
}
for old, new in files.items():
    raw = (source / old).read_bytes()
    text = raw.decode('utf-8-sig').replace('./administrative.ts', './expenses.ts').replace('./contracts.ts', './model.ts').replace('./model.ts', './model.ts')
    text = text.replace('../whatsapp.ts', './whatsapp.ts').replace("import type {StockRow} from './stock.ts';", '')
    text = text.replace('_stocks:StockRow[]', '_stocks:unknown[]')
    text = text.replace('ICOM Bank', 'Anota Aí').replace('ICOM IA', 'Anota IA').replace('icom-bank-assistente', 'anota-ai-assistente')
    text = text.replace("'experience-icom'", "'anota-ai'")
    text = text.replace('consultar_dados_icom', 'consultar_despesas').replace('preparar_despesa_icom', 'preparar_despesa').replace(",'preparar_lancamento_icom'", '')
    if new == 'lib/whatsapp-ai.ts':
        start = text.index('Área padrão PESSOAL.')
        end = text.index('paid true somente', start)
        text = text[:start] + 'Este aplicativo é SOMENTE para pessoa física. Use scope PESSOAL. Despesas de loja, empresa ou pessoa jurídica são OUTRO: não converta em pessoais. Gastos com carro pessoal são permitidos, sem vínculo com estoque. ' + text[end:]
        text = text.replace('LOJA mantém categoria curta própria.', '')
        text = text.replace("enum:['PESSOAL','LOJA']", "enum:['PESSOAL']").replace("name:'despesa_icom'", "name:'despesa_anota_ai'")
    if new == 'lib/whatsapp-expenses.ts':
        start = text.index(' const plate=d.plate?')
        end = text.index(' const personal=', start)
        text = text[:start] + ''' const details:Record<string,unknown>={notes:origin==='VOICE'?'Origem: Anota IA por voz · confirmação no painel':`Origem: WhatsApp Anota Aí · mensagem ${id}`,payment_method:d.payment_method||'OUTRO'};
 if(d.trip_name){const name=tripName(d.trip_name);if(!d.trip_excerpt||!/(?:viagem|ferias)/.test(expenseFold(d.trip_excerpt))||!expenseFold(transcript).includes(expenseFold(d.trip_excerpt))||!expenseFold(d.trip_excerpt).includes(expenseFold(name)))throw new Error('Confirme o nome da viagem.');details.trip_name=name;}
''' + text[end:]
        text = text.replace("if(!['PESSOAL','LOJA'].includes(d.scope)", "if(d.scope!=='PESSOAL'")
        text = text.replace('e se é pessoal ou da loja.', 'pessoal.')
        text = text.replace('o que foi pago, o valor e, se for da loja, diga isso no áudio.', 'o que foi pago e o valor.')
        text = text.replace("kind:d.scope==='PESSOAL'?'PESSOAL':'CUSTO',scope:d.scope", "kind:'PESSOAL',scope:'PESSOAL'")
        start = text.index('export function expenseReply')
        text = text[:start] + '''export function expenseReply(p:ReturnType<typeof expensePayload>){return `✅ Lançado no Anota Aí: ${currency(p.amount_cents!)} — ${p.description}.\\nCategoria: ${p.category}${p.details.trip_name?' · Viagem: '+p.details.trip_name:''} · ${audienceLabel(p.details.expense_audience)} · ${natureLabel(p.details.expense_nature)}.\\nData: ${p.entry_date.split('-').reverse().join('/')} · ${p.details.payment_method}.\\nConfira em Despesas pessoais. Código: ${p.id.slice(0,8)}.`;}
'''
    target = root / new
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')
    manifest.append({'source':old,'target':new,'source_sha256':hashlib.sha256(raw).hexdigest()})
(root / 'docs').mkdir(exist_ok=True)
(root / 'docs/source-manifest.json').write_text(json.dumps({'origin':'Experiência Icom','source_directory':str(source),'snapshot_date':'2026-10-07','files':manifest,'excluded':['env/credentials','personal and client records','contracts','vehicles and stock','legal','store sales','merchant cash','bank collection','seller integrations']},indent=2,ensure_ascii=False),encoding='utf-8')
print(f'{len(files)} módulos pessoais copiados e adaptados, sem credenciais ou dados.')
