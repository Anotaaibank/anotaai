import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mobile,run} from './run-tool.mjs';
const results=[];
function check(name,args,env={}){const start=Date.now();try{run(process.execPath,args,{env});results.push({name,exit:0,ms:Date.now()-start});}catch(error){results.push({name,exit:1,ms:Date.now()-start});throw error;}}
try{
 check('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
 check('lint',['node_modules/eslint/bin/eslint.js','.']);
 check('tests',['--experimental-strip-types','--test','--test-isolation=none','tests/*.test.ts']);
 check('expo-dependencies',['node_modules/expo/bin/cli','install','--check'],{CI:'1'});
 check('expo-config',['node_modules/expo/bin/cli','config','--type','public'],{APP_VARIANT:'preview'});
 if(process.argv.includes('--bundles'))for(const platform of ['android','ios'])check('bundle-'+platform,['node_modules/expo/bin/cli','export','--platform',platform,'--output-dir','dist/'+platform],{CI:'1',APP_VARIANT:'preview'});
}finally{const directory=resolve(mobile,'release-evidence');mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'validation.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));}
