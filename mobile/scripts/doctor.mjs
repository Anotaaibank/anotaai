import {resolve} from 'node:path';
import {mobile,run} from './run-tool.mjs';
run(process.execPath,[resolve(mobile,'node_modules/expo-doctor/build/index.js')]);
