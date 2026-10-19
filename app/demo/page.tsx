
import {Localize} from '@/components/Localization';
import {notFound} from 'next/navigation';
import Dashboard from '@/components/Dashboard';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <Localize><Dashboard demo/></Localize>;}
