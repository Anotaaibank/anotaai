import {Tabs} from 'expo-router';
import {Text} from 'react-native';
import {useTheme} from '@/providers/theme';
export default function TabLayout(){const {colors}=useTheme();return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:colors.accent,tabBarInactiveTintColor:colors.muted,tabBarStyle:{backgroundColor:colors.card,borderTopColor:colors.line},tabBarLabelStyle:{fontSize:11},tabBarHideOnKeyboard:true}}>{[['index','Início','◉'],['agenda','Agenda','▦'],['entry','Anotar','＋'],['assistant','Assistente','✦'],['settings','Conta','⚙']].map(([name,title,icon])=><Tabs.Screen key={name} name={name} options={{title,tabBarIcon:({color})=><Text style={{color,fontSize:23}}>{icon}</Text>}}/>)}</Tabs>;}
