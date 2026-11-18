import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function webAssets(base=''){
 const assets={};for(const [file,type] of [['index.html','text/html; charset=utf-8'],['style.css','text/css; charset=utf-8'],['mobile.css','text/css; charset=utf-8'],['app.js','text/javascript; charset=utf-8']]){let body=await readFile(join(root,'web',file),'utf8');if(file==='index.html'&&base)body=body.replace(/(href|src)="\//g,'$1="'+base+'/');assets[file==='index.html'?'/':'/'+file]={type,body};}
 const icons=[{src:base+'/assets/icon-v2-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:base+'/assets/icon-v2-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}];
 assets['/manifest.webmanifest']={type:'application/manifest+json; charset=utf-8',body:JSON.stringify({id:base||'/',name:'Minha Frota',short_name:'Minha Frota',lang:'pt-BR',description:'Gestão de carros, proprietários, custos e aluguéis.',start_url:(base||'/')+'?app=1#overview',scope:base||'/',display:'standalone',background_color:'#102f2d',theme_color:'#102f2d',icons,shortcuts:[{name:'Minha frota',url:(base||'/')+'#fleet'},{name:'Movimentações',url:(base||'/')+'#entries'},{name:'Custos por categoria',url:(base||'/')+'#costs'}]})};
 for(const file of await readdir(join(root,'web/assets'))){if(!/\.(png|webp|jpeg)$/.test(file))continue;assets['/assets/'+file]={type:file.endsWith('.png')?'image/png':file.endsWith('.jpeg')?'image/jpeg':'image/webp',encoding:'base64',body:(await readFile(join(root,'web/assets',file))).toString('base64')};}
 return assets;
}
