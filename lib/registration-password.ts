import {AppError} from './model.ts';
export function confirmedRegistrationPassword(password:unknown,confirmation:unknown){
 if(typeof password!=='string'||password.length<10||password.length>128)throw new AppError('Crie uma senha com pelo menos 10 caracteres.');
 if(typeof confirmation!=='string'||confirmation!==password)throw new AppError('As senhas não são iguais. Digite a mesma senha nos dois campos.');
 return password;
}
