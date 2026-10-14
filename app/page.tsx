import Login from '@/components/Login';
import {headers} from 'next/headers';
export default async function Page(){return <Login publicPortal={(await headers()).get('x-anotei-public-portal')==='1'}/>;}
