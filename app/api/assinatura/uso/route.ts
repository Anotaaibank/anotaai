import {authorizeIdentity,failure,json} from '@/lib/server';
import {usageSummary} from '@/lib/subscription-usage';
export const runtime='nodejs';
export async function GET(){try{const {user}=await authorizeIdentity();return json(await usageSummary(user.id));}catch(error){return failure(error);}}
