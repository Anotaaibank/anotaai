import * as SecureStore from 'expo-secure-store';
const key='anotei.native.session.v1';
let browserMemory:string|null=null;
export async function loadToken(){return process.env.EXPO_OS==='web'?browserMemory:SecureStore.getItemAsync(key);}
export async function saveToken(value:string|null){
 if(process.env.EXPO_OS==='web'){browserMemory=value;return;}
 if(value)await SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});else await SecureStore.deleteItemAsync(key);
}
