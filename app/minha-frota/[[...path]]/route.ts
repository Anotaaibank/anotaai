import {authorizeIdentity,sameOrigin} from '@/lib/server';
import {requireManager} from '@/lib/commerce';
import {handleHostedFleet} from '@/frota-us-start/server/host.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function handle(request:Request){return handleHostedFleet(request,{authenticate:async()=>{const auth=await authorizeIdentity();requireManager(auth.user.id);return auth.user.id;},sameOrigin});}
export const GET=handle;
export const POST=handle;
