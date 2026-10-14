import {adminInput} from '@/lib/expenses';
import {AppError,monthlyDates,uuid} from '@/lib/model';
import {archive,authorize,body,failure,json,rows,sameOrigin,save} from '@/lib/server';
import {randomUUID} from 'node:crypto';
export const runtime='nodejs';
export async function GET(){try{const auth=await authorize();return json({rows:await rows(auth),user:auth.user});}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),raw=await body(req),input=adminInput(raw);const {expected_updated_at,...payload}=input;return json({row:await save(auth,payload,expected_updated_at)});}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req);if(!uuid(input.id)||typeof input.expected_updated_at!=='string'||typeof input.active!=='boolean')throw new AppError('Atualize a despesa antes de continuar.');return json({row:await archive(auth,input.id,input.expected_updated_at,input.active)});}catch(e){return failure(e);}}
