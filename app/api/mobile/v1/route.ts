import {mobileRequest,mobileFailure} from '@/lib/mobile-api';
export const runtime='nodejs';
export async function POST(req:Request){try{return await mobileRequest(req);}catch(error){return mobileFailure(error);}}
