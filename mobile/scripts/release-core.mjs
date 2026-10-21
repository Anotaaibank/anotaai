import {createHash} from 'node:crypto';
import {readdir,readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,relative,dirname} from 'node:path';
const roots=['src','assets','config'];
const files=['app.config.ts','eas.json','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','eslint.config.js','.easignore','AGENTS.md'];
const forbidden=/(^|\/)(?:\.env[^/]*|node_modules|\.git|\.data|\.expo|dist)(\/|$)|\.(?:p8|p12|pem|jks|key|keystore|mobileprovision)$/i;
export async function stageSources(source,destination,development=false){
 const manifest=[];
 async function copy(path){const info=await lstat(path);if(info.isSymbolicLink())throw Error('Link simbólico não permitido no pacote mobile.');const rel=relative(source,path).replaceAll('\\','/');if(forbidden.test(rel))throw Error('Arquivo sensível no pacote: '+rel);
  if(info.isDirectory()){for(const name of await readdir(path))await copy(join(path,name));return;}
  const bytes=await readFile(path);if(/(?:sk-proj-|sb_secret_)[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString('utf8')))throw Error('Possível segredo no pacote: '+rel);
  await mkdir(dirname(join(destination,rel)),{recursive:true});await writeFile(join(destination,rel),bytes);manifest.push({file:rel,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 for(const file of [...files,...roots,...(development?['scripts','tests','release-policy.json','README.md']:[])])await copy(join(source,file));return manifest.sort((a,b)=>a.file.localeCompare(b.file));
}
export function releaseBlocks(policy){return Object.entries(policy).filter(([,ready])=>ready!==true).map(([name])=>name);}
