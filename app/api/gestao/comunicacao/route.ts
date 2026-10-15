import {authorizeManager} from '@/lib/commerce-server';
import {body,failure,json,sameOrigin} from '@/lib/server';
import {AppError,object} from '@/lib/model';
import {communicationData,communicationDetail,prepareCommunication,confirmCommunication} from '@/lib/communications-server';
export const runtime='nodejs';
export async function GET(req:Request){try{const auth=await authorizeManager(),params=new URL(req.url).searchParams,id=params.get('id');return json(id?await communicationDetail(auth.user.id,id,Number(params.get('offset')||0)):await communicationData(auth.user.id));}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorizeManager(),input=object(await body(req,500000));if(Object.keys(input).some(k=>!['action','data'].includes(k)))throw new AppError('Confira os campos.');if(input.action==='prepare')return json(await prepareCommunication(auth.user.id,input.data));const data=object(input.data);if(Object.keys(data).some(k=>k!=='id'))throw new AppError('Confira o comunicado.');if(input.action==='confirm'||input.action==='cancel')return json(await confirmCommunication(auth.user.id,data.id,input.action==='cancel'));throw new AppError('Escolha uma ação de comunicação.');}catch(e){return failure(e);}}
