const fs=require('fs');
const path=require('path');
const targets=['.angular','dist',path.join('node_modules','.vite'),path.join('node_modules','.cache')];
for(const target of targets){
  const full=path.resolve(process.cwd(),target);
  try{if(fs.existsSync(full)){fs.rmSync(full,{recursive:true,force:true,maxRetries:4,retryDelay:150});console.log(`[PG Management dev clean] removed ${target}`);}}catch(error){console.warn(`[PG Management dev clean] could not remove ${target}: ${error.message}`);}
}
console.log('[PG Management dev clean] Angular/Vite development caches cleared.');
