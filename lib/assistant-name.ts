import {AppError} from './model.ts';

export const defaultAssistantName='Anotei';
export function assistantName(value:unknown){
 if(value===undefined||value===null||value==='')return defaultAssistantName;
 if(typeof value!=='string')throw new AppError('Escolha um nome para sua IA.');
 const name=value.normalize('NFC').trim().replace(/ +/g,' ');
 if(name.length<2||name.length>40||! /^[\p{L}\p{N}][\p{L}\p{N} .’'\-]*$/u.test(name))throw new AppError('Use um nome de 2 a 40 caracteres, com letras, números ou espaços.');
 return name;
}
export function savedAssistantName(value:unknown){try{return assistantName(value);}catch{return defaultAssistantName;}}
