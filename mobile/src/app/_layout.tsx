import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {SessionProvider,useSession} from '@/providers/session';
import {ThemeProvider,useTheme} from '@/providers/theme';
import {Busy,Page} from '@/components/ui';
function Navigation(){const {user,loading}=useSession(),{dark}=useTheme();if(loading)return <Page title="Anotei na Hora"><Busy/></Page>;return <><StatusBar style={dark?'light':'dark'}/><Stack key={user?.id||'signed-out'} screenOptions={{headerShown:false}}><Stack.Protected guard={!!user}><Stack.Screen name="(tabs)"/></Stack.Protected><Stack.Protected guard={!user}><Stack.Screen name="sign-in"/></Stack.Protected></Stack></>;}
export default function Layout(){return <SafeAreaProvider><ThemeProvider><SessionProvider><Navigation/></SessionProvider></ThemeProvider></SafeAreaProvider>;}
