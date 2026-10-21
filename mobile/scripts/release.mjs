import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {mobile,run} from './run-tool.mjs';
import {stageSources,releaseBlocks} from './release-core.mjs';
const args=new Set(process.argv.slice(2)),value=name=>process.argv[process.argv.indexOf(name)+1],profile=args.has('--profile')?value('--profile'):'preview',platform=args.has('--platform')?value('--platform'):'android';
if(!['development','preview','production'].includes(profile)||!['android','ios'].includes(platform))throw Error('Perfil ou plataforma inválidos.');
const policy=JSON.parse(await readFile(resolve(mobile,'release-policy.json'),'utf8')),blocks=releaseBlocks(policy);
if(args.has('--build')||args.has('--submit')){
 if(!args.has('--approve-cloud-upload')||!args.has('--approve-costs'))throw Error('É necessária autorização explícita para upload e possíveis custos.');
 if(!process.env.EXPO_OWNER||!/^[a-f0-9-]{36}$/.test(process.env.EXPO_PROJECT_ID||''))throw Error('Conclua o login e vincule um projeto Expo autorizado.');
 const api=new URL(process.env.EXPO_PUBLIC_API_URL||'');if(api.protocol!=='https:'||api.username||api.password||api.pathname!=='/'||api.search||api.hash)throw Error('Configure a API HTTPS de homologação/produção antes de gerar a build.');
 if((profile==='production'||args.has('--submit'))&&blocks.length)throw Error('Publicação bloqueada: '+blocks.join(', '));
 if(args.has('--submit')&&!args.has('--approve-store-upload'))throw Error('O envio à loja exige autorização específica.');
}
run(process.execPath,['scripts/validate.mjs']);
const destination=resolve(mobile,'../.data/mobile-release',randomUUID());await mkdir(destination,{recursive:true});
const manifest=await stageSources(mobile,destination),git=spawnSync('git',['rev-parse','HEAD'],{cwd:mobile,encoding:'utf8',windowsHide:true}),dirty=spawnSync('git',['status','--porcelain','--','.'],{cwd:mobile,encoding:'utf8',windowsHide:true});
await writeFile(resolve(destination,'source-manifest.json'),JSON.stringify({prepared_at:new Date().toISOString(),base_commit:git.stdout?.trim(),mobile_worktree_changed:!!dirty.stdout?.trim(),source_digest:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),profile,platform,files:manifest,production_blockers:blocks},null,2));
console.log('Pacote mobile revisável: '+destination);console.log('Bloqueios de produção: '+blocks.join(', '));
if(args.has('--build')||args.has('--submit')){
 const env={...process.env,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:destination,APP_VARIANT:profile};
 run('pnpm',['install','--frozen-lockfile'],{cwd:destination,env});
 const cli=resolve(mobile,'../.data/mobile-tools/node_modules/eas-cli/bin/run');
 if(args.has('--build'))run(process.execPath,[cli,'build','--platform',platform,'--profile',profile],{cwd:destination,env});
 if(args.has('--submit')){const id=value('--build-id');if(!args.has('--build-id')||!/^[a-f0-9-]{36}$/.test(id))throw Error('Informe o ID exato de uma build já revisada.');run(process.execPath,[cli,'submit','--platform',platform,'--profile','production','--id',id],{cwd:destination,env});}
}
