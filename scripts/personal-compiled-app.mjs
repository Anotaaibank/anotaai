// Dedicated local compiled app behind the protected customer portal.
import {cpSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);process.loadEnvFile(resolve(root,'.env.local'));
const build=process.env.ANOTA_PERSONAL_BUILD;
if(!build||! /^[a-z0-9-]{1,40}$/.test(build))throw Error('Configure ANOTA_PERSONAL_BUILD com uma compilação validada.');
const port=Number(process.env.ANOTA_PERSONAL_PORT||3103);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Porta local inválida.');
const output='.next-validation-'+build,standalone=resolve(root,output,'standalone'),server=resolve(standalone,'server.js');
if(!existsSync(server)||!existsSync(resolve(standalone,output,'BUILD_ID')))throw Error('A compilação pessoal ainda não está pronta.');
cpSync(resolve(root,'public'),resolve(standalone,'public'),{recursive:true});
cpSync(resolve(root,output,'static'),resolve(standalone,output,'static'),{recursive:true});
process.env.ANOTA_DATABASE_PATH=resolve(root,process.env.ANOTA_DATABASE_PATH||'.data/anota-ai.sqlite');
process.env.PORT=String(port);process.env.HOSTNAME='127.0.0.1';
await import(pathToFileURL(server).href);
