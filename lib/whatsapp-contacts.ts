import {phoneBR} from './whatsapp.ts';
import {AppError} from './model.ts';

export const maxAuthorizedPhones=100;

export function authorizedPhones(raw:unknown,assistantPhone:string):string[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>maxAuthorizedPhones)throw new AppError(`Cadastre de 1 a ${maxAuthorizedPhones} números autorizados.`);
 if(raw.some(value=>typeof value!=='string'))throw new AppError('Informe um telefone brasileiro válido com DDD.');
 const numbers=[...new Set(raw.map(phoneBR))];
 if(numbers.includes(phoneBR(assistantPhone)))throw new AppError('O número da IA deve ser diferente dos números autorizados.');
 return numbers;
}

export function addAuthorizedPhone(existing:string[],raw:string,assistantPhone:string):string[]{
 const number=phoneBR(raw);
 if(existing.some(value=>phoneBR(value)===number))throw new Error('Este número já está cadastrado.');
 return authorizedPhones([...existing,number],assistantPhone);
}

export function displayPhone(number:string){
 const local=number.startsWith('55')?number.slice(2):number;
 return `(${local.slice(0,2)}) ${local.slice(2,-4)}-${local.slice(-4)}`;
}
