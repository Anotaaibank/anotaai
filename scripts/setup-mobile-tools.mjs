import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=resolve('.data/mobile-tools');mkdirSync(directory,{recursive:true});
writeFileSync(resolve(directory,'package.json'),JSON.stringify({private:true,dependencies:{npm:'12.2.0','eas-cli':'25.2.0'}},null,2));
writeFileSync(resolve(directory,'pnpm-workspace.yaml'),'allowBuilds:\n  dtrace-provider: false\n  protobufjs: false\n');
const result=spawnSync('pnpm',['install'],{cwd:directory,stdio:'inherit',shell:process.platform==='win32',windowsHide:true,env:{...process.env,CI:'1'}});process.exitCode=result.status??1;
