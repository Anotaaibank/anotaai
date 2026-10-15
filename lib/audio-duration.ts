import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export async function audioDurationSeconds(bytes:Uint8Array){const directory=await mkdtemp(join(tmpdir(),'anotei-audio-'));try{const path=join(directory,'input');await writeFile(path,bytes);const {stdout}=await execute(process.env.ANOTA_FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,crypto,data','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{timeout:10000,maxBuffer:4096,windowsHide:true});const seconds=Number(stdout.trim());if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)throw Error();return Math.ceil(seconds);}catch{throw new Error('Não consegui conferir a duração deste áudio. Envie outro áudio ou escreva seu pedido.');}finally{if(resolve(directory).startsWith(resolve(join(tmpdir(),'anotei-audio-'))))await rm(directory,{recursive:true,force:true});}}
