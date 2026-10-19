
import {Localize} from '@/components/Localization';
import Login from '@/components/Login';
import {headers} from 'next/headers';
export default async function Page(){return <Localize><Login publicPortal={(await headers()).get('x-anotei-public-portal')==='1'}/></Localize>;}
