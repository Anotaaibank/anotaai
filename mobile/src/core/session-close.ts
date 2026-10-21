/** Storage failure must not prevent revoking the server session. */
export async function endSession(clear:()=>Promise<unknown>,revoke:()=>Promise<unknown>){try{await clear();}finally{await revoke();}}
