import net from 'node:net';
const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const first=args[0],item=Array.isArray(first)?first[0]:first;const host=typeof item==='object'?item?.host||item?.hostname:typeof args[1]==='string'?args[1]:undefined;
 // Named pipes and loopback are used by Next workers. Block outbound TCP.
 if(host&&!['localhost','127.0.0.1','::1'].includes(host))throw Error('Outbound network blocked during isolated validation');
 return original.apply(this,args);
};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Outbound fetch blocked during isolated validation');return fetchOriginal(input,options);};
