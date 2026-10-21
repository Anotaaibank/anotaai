import {mkdtemp,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {mobile,run} from './run-tool.mjs';
import {stageSources} from './release-core.mjs';
const directory=await mkdtemp(join(tmpdir(),'anotei-mobile-check-'));
const files=await stageSources(mobile,directory,true),env={CI:'1',EXPO_NO_TELEMETRY:'1',EXPO_PUBLIC_API_URL:process.env.EXPO_PUBLIC_API_URL||'https://example.test'};
const record=resolve(mobile,'../.data/mobile-working-copy.json');await mkdir(resolve(mobile,'../.data'),{recursive:true});
await writeFile(record,JSON.stringify({created_at:new Date().toISOString(),directory,source:mobile,files},null,2));
console.log('Cópia de verificação fora da pasta original: '+directory);
run('pnpm',['install','--frozen-lockfile'],{cwd:directory,env});
try{
 run(process.execPath,['scripts/validate.mjs','--bundles'],{cwd:directory,env});
 await cp(join(directory,'dist'),join(mobile,'dist'),{recursive:true});
}finally{
 const evidence=await readFile(join(directory,'release-evidence/validation.json'),'utf8').catch(()=>null);
 if(evidence)await writeFile(resolve(mobile,'../.data/mobile-working-copy-validation.json'),evidence);
}
console.log('Fonte original preservada. Não edite nem publique diretamente a cópia temporária.');
