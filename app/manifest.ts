import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{return {name:'Anotei na Hora',short_name:'Anotei',description:'Suas finanças pessoais com IA por voz e WhatsApp.',start_url:'/painel',display:'standalone',background_color:'#e7f1e6',theme_color:'#165449',icons:[{src:'/anotei-na-hora.jpeg',sizes:'1254x1254',type:'image/jpeg'}]};}
