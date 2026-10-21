import React,{createContext} from 'react';
import type {User} from '@/core/contracts';
export type SessionContextValue={user:User|null;loading:boolean;configurationError:string;login:(email:string,password:string)=>Promise<void>;logout:()=>Promise<void>;call:<T>(input:Record<string,unknown>)=>Promise<T>};
// Keep identity stable when Fast Refresh replaces the provider implementation.
export const SessionContext=createContext<SessionContextValue|null>(null);
export function useSession(){const value=React.use(SessionContext);if(!value)throw Error('Sessão indisponível.');return value;}
