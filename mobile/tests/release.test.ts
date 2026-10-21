import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stageSources,releaseBlocks} from '../scripts/release-core.mjs';
test('pacote de publicação usa lista permitida e bloqueia segredo/atalho',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'anotei-stage-test-')),source=join(directory,'mobile'),target=join(directory,'package');try{
  await mkdir(source,{recursive:true});for(const dir of ['src','assets','config'])await mkdir(join(source,dir));
  for(const file of ['app.config.ts','eas.json','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','eslint.config.js','.easignore','AGENTS.md'])await writeFile(join(source,file),'{}');
  await writeFile(join(source,'.env.local'),'private=never-upload');await writeFile(join(directory,'server-private.txt'),'never-upload');
  const list=await stageSources(source,target);assert.ok(!list.some((f:{file:string})=>f.file.includes('private')||f.file.includes('.env')));
  await writeFile(join(source,'src','bad.ts'),'const key="sk-proj-'+ 'a'.repeat(64)+'"');await assert.rejects(()=>stageSources(source,join(directory,'blocked')),/Possível segredo/);
  assert.deepEqual(releaseBlocks({billing:false,privacy:true}),['billing']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
