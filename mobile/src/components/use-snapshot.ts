import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {useSession} from '@/providers/session';
import type {SnapshotResponse} from '@/core/contracts';
export function useSnapshot(){const {call}=useSession(),[data,setData]=useState<SnapshotResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),generation=useRef(0);
 const refresh=useCallback(async()=>{const n=++generation.current;setLoading(true);setError('');try{const next=await call<SnapshotResponse>({action:'snapshot'});if(n===generation.current)setData(next);}catch(e){if(n===generation.current)setError((e as Error).message);}finally{if(n===generation.current)setLoading(false);}},[call]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{generation.current++;};},[refresh]));useEffect(()=>()=>{generation.current++;},[]);return {data,error,loading,refresh};}
