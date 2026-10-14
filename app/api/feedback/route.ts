import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {feedbacks,isManager,sendFeedback} from '@/lib/commerce-server';
import {throttleLocal} from '@/lib/local-db';
export const runtime='nodejs';
export async function GET(){try{const auth=await authorize();return json({feedbacks:await feedbacks(auth),can_manage:isManager(auth.user.id)});}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize();throttleLocal('feedback:'+auth.user.id,20,3600000);return json({feedback:await sendFeedback(auth,await body(req,14000))},201);}catch(e){return failure(e);}}
