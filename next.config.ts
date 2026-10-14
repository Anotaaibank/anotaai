import type { NextConfig } from 'next';
// Isolated validation outputs can use a fresh suffix when OneDrive locks an old build.
const check=process.env.ANOTA_BUILD_CHECK;
const distDir=check==='1'?'.next-validation':check&&/^[a-z0-9-]{1,40}$/.test(check)?'.next-validation-'+check:'.next';
const config: NextConfig = {output:'standalone',distDir, experimental:{cpus:1,webpackBuildWorker:false},
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}];}
};
export default config;
