import React,{createContext,useState} from 'react';
import {useColorScheme} from 'react-native';
const palettes={light:{bg:'#eef6f1',card:'#ffffff',text:'#123c34',muted:'#49675f',line:'#cbded4',accent:'#09674e',gold:'#8b682c',danger:'#a7283e'},dark:{bg:'#062f2e',card:'#10433e',text:'#f6f4e8',muted:'#bad6c9',line:'#2e6258',accent:'#98e2b3',gold:'#e0c78d',danger:'#ffabb5'}};
type Theme={colors:typeof palettes.light;dark:boolean;toggle:()=>void};
const Context=createContext<Theme|null>(null);
export function ThemeProvider({children}:{children:React.ReactNode}){const system=useColorScheme(),[override,setOverride]=useState<boolean|null>(null),dark=override??system==='dark';return <Context value={{dark,colors:dark?palettes.dark:palettes.light,toggle:()=>setOverride(!dark)}}>{children}</Context>;}
export function useTheme(){return React.use(Context)!;}
