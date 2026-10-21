import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {apiOrigin,ApiError,request} from '@/core/api';
import {endSession} from '@/core/session-close';
import type {User} from '@/core/contracts';
import {loadToken,saveToken} from '@/services/session-storage';
import {SessionContext as Session} from '@/contexts/session-context';
export {useSession} from '@/contexts/session-context';
export function SessionProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),token=useRef<string|null>(null),epoch=useRef(0);
 let origin='',configurationError='';try{origin=apiOrigin(process.env.EXPO_PUBLIC_API_URL,__DEV__);}catch(e){configurationError=(e as Error).message;}
 const clear=useCallback(async()=>{epoch.current++;token.current=null;setUser(null);await saveToken(null);},[]);
 const call=useCallback(async<T,>(input:Record<string,unknown>):Promise<T>=>{
  if(!token.current)throw new ApiError('Entre novamente.',401);
  const version=epoch.current;
  try{const result=await request<T>(origin,input,token.current,expoFetch);if(version!==epoch.current)throw new ApiError('A conta mudou. Atualize a tela.',401);return result;}
  catch(e){if(version===epoch.current&&e instanceof ApiError&&e.status===401)await clear();throw e;}
 },[origin,clear]);
 useEffect(()=>{let alive=true;const version=epoch.current;
  async function restore(){try{const saved=await loadToken();if(!alive||version!==epoch.current||!saved||!origin)return;const result=await request<{user:User}>(origin,{action:'session'},saved,expoFetch);if(alive&&version===epoch.current){token.current=saved;setUser(result.user);}}catch(e){if(e instanceof ApiError&&e.status===401)await saveToken(null);}finally{if(alive)setLoading(false);}}
  void restore();return()=>{alive=false;};
 },[origin]);
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state==='active'&&token.current)void call({action:'session'}).catch(()=>undefined);});return()=>listener.remove();},[call]);
 async function login(email:string,password:string){if(!origin)throw Error(configurationError);const result=await request<{user:User;token:string}>(origin,{action:'login',email,password},undefined,expoFetch);try{await saveToken(result.token);}catch{await request(origin,{action:'logout'},result.token,expoFetch).catch(()=>undefined);throw Error('Não foi possível guardar a sessão com segurança.');}epoch.current++;token.current=result.token;setUser(result.user);}
 async function logout(){const old=token.current;await endSession(clear,()=>old?request(origin,{action:'logout'},old,expoFetch):Promise.resolve());}
 return <Session value={{user,loading,configurationError,login,logout,call}}>{children}</Session>;
}
