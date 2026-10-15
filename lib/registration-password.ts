import {AppError} from './model.ts';
export const minimumPasswordLength=6;
export function confirmedRegistrationPassword(password:unknown,confirmation:unknown){
 if(typeof password!=='string'||password.length<minimumPasswordLength||password.length>128)throw new AppError('Crie uma senha com pelo menos 6 caracteres. Pode usar somente números.');
 if(typeof confirmation!=='string'||confirmation!==password)throw new AppError('As senhas não são iguais. Digite a mesma senha nos dois campos.');
 return password;
}
