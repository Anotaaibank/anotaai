import {authorizeIdentity,body,failure,json,sameOrigin} from '@/lib/server';
import {requestPix,subscriberBilling} from '@/lib/subscription-access';
export const runtime='nodejs';
export async function GET(){try{return json(await subscriberBilling(await authorizeIdentity()));}catch(error){return failure(error);}}
export async function POST(req:Request){try{sameOrigin(req);return json({payment:await requestPix(await authorizeIdentity(),await body(req,2000))});}catch(error){return failure(error);}}
