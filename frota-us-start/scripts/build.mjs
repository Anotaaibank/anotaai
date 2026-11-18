import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const [server,html,css,js,taxonomy] = await Promise.all(['worker/api.js','web/index.html','web/style.css','web/app.js','shared/expense-categories.json'].map(p=>readFile(p,'utf8')));
const expenseGroups=JSON.parse(taxonomy);
const categoryNames=expenseGroups.flatMap(g=>g.categories);
if(categoryNames.some(c=>typeof c!=='string'||!c.trim())||new Set(categoryNames).size!==categoryNames.length)throw new Error('Categorias de despesas inválidas ou repetidas.');
const assets = {'/':{type:'text/html; charset=utf-8',body:html},'/style.css':{type:'text/css; charset=utf-8',body:css},'/app.js':{type:'text/javascript; charset=utf-8',body:js}};
await writeFile('dist/server/index.js','const ASSETS = '+JSON.stringify(assets)+';\nconst EXPENSE_GROUPS = '+JSON.stringify(expenseGroups)+';\n'+server);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json').catch(error=>{if(error.code!=='ENOENT')throw error;});console.log('Built self-contained fleet Worker.');
