import type {ExpoConfig,ConfigContext} from 'expo/config';
import {createAppConfig} from './config/app-config.ts';
export default function config(_:ConfigContext):ExpoConfig{return createAppConfig(process.env);}
