import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env { PG_FILES:R2Bucket; FILE_KEK_B64:string; FIREBASE_PROJECT_ID:string; ALLOWED_ORIGIN:string; KEY_ID:string; }
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export default {
  async fetch(req:Request,env:Env):Promise<Response>{
    const origin=req.headers.get('origin')||'',cors=corsHeaders(origin,env);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      const tenantId=cleanTenant(req.headers.get('x-pg-tenant')||'');if(!tenantId)throw http(400,'Missing PG workspace.');
      const actor=await authorize(req,env,tenantId),url=new URL(req.url);
      if(url.pathname==='/health')return json({ok:true,bucket:'mana-pg-management',tenant:tenantId,encryption:'AES-GCM-256 envelope'},200,cors);
      if(url.pathname==='/v1/files/object'&&req.method==='PUT'){
        const bucket=req.headers.get('x-pg-bucket');if(bucket!=='mana-pg-management')throw http(400,'Invalid bucket.');
        const path=cleanPath(req.headers.get('x-pg-path')||'');if(!path.startsWith(`pg/${tenantId}/`))throw http(403,'File path is outside this PG workspace.');assertFilePermission(actor,path,'PUT');
        const fileKey=req.headers.get('x-pg-key')||'',fileIv=req.headers.get('x-pg-file-iv')||'',name=decodeURIComponent(req.headers.get('x-pg-name')||'file'),mime=req.headers.get('x-pg-mime')||'application/octet-stream';
        if(!path||!fileKey||!fileIv)throw http(400,'Encrypted file metadata is incomplete.');if(!allowedMime(mime,name))throw http(415,'Only images, PDF and office/text documents are allowed.');const length=Number(req.headers.get('content-length')||0);if(length>16*1024*1024)throw http(413,'Encrypted object is too large.');
        const wrapped=await wrapKey(fileKey,env);await env.PG_FILES.put(path,req.body,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{tenantId,originalName:name,mimeType:mime,fileIv,wrappedKey:wrapped.wrappedKey,wrapIv:wrapped.wrapIv,keyId:env.KEY_ID||'pg-files-v1',uploadedBy:actor.uid,uploadedRole:actor.role,uploadedAt:new Date().toISOString()}});return json({objectPath:path,keyId:env.KEY_ID||'pg-files-v1',wrappedKey:wrapped.wrappedKey,wrapIv:wrapped.wrapIv},200,cors);
      }
      if(url.pathname==='/v1/files/object'&&req.method==='GET'){
        const path=cleanPath(url.searchParams.get('path')||'');if(!path)throw http(400,'Missing file path.');if(!path.startsWith(`pg/${tenantId}/`))throw http(403,'File path is outside this PG workspace.');assertFilePermission(actor,path,'GET');const object=await env.PG_FILES.get(path);if(!object)throw http(404,'File not found.');const meta=object.customMetadata||{};if(String(meta.tenantId||tenantId)!==tenantId)throw http(403,'File belongs to another PG workspace.');
        const rawKey=await unwrapKey(String(meta.wrappedKey||''),String(meta.wrapIv||''),env),headers=new Headers(cors);headers.set('content-type','application/octet-stream');headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');headers.set('x-pg-key',rawKey);headers.set('x-pg-file-iv',String(meta.fileIv||''));headers.set('x-pg-mime',String(meta.mimeType||'application/octet-stream'));headers.set('x-pg-name',encodeURIComponent(String(meta.originalName||'file')));headers.set('access-control-expose-headers','x-pg-key,x-pg-file-iv,x-pg-mime,x-pg-name');return new Response(object.body,{status:200,headers});
      }
      if(url.pathname==='/v1/files/object'&&req.method==='DELETE'){
        const path=cleanPath(url.searchParams.get('path')||'');if(!path||!path.startsWith(`pg/${tenantId}/`))throw http(403,'Invalid file path.');if(actor.role!=='owner')throw http(403,'Only a PG Owner can delete encrypted files.');await env.PG_FILES.delete(path);return json({ok:true},200,cors);
      }
      return json({error:'Not found'},404,cors);
    }catch(e:any){return json({error:e?.message||'Secure file service error'},Number(e?.status||500),cors);}
  }
};

async function authorize(req:Request,env:Env,tenantId:string){
  const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))throw http(401,'Missing Firebase session.');const token=auth.slice(7),project=env.FIREBASE_PROJECT_ID||'mana-pg';const {payload}=await jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${project}`,audience:project}),uid=String(payload.sub||'');if(!uid)throw http(401,'Invalid Firebase identity.');
  const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/tenants/${encodeURIComponent(tenantId)}`;
  const [member,tenant]=await Promise.all([fetch(`${base}/members/${uid}`,{headers:{authorization:`Bearer ${token}`}}),fetch(base,{headers:{authorization:`Bearer ${token}`}})]);
  if(!member.ok)throw http(403,'PG workspace membership is unavailable.');if(!tenant.ok)throw http(403,'PG workspace is unavailable.');
  const memberData:any=await member.json(),memberFields=memberData.fields||{},role=String(memberFields.role?.stringValue||''),memberActive=memberFields.active?.booleanValue!==false;
  const permissions=(memberFields.permissions?.arrayValue?.values||[]).map((v:any)=>String(v.stringValue||'')).filter(Boolean),memberForcedEpoch=Number(memberFields.forceLogoutEpoch?.integerValue||0);
  const tenantData:any=await tenant.json(),tenantFields=tenantData.fields||{},tenantActive=tenantFields.active?.booleanValue!==false,forcedEpoch=Number(tenantFields.forceLogoutEpoch?.integerValue||0),authTime=Number(payload.auth_time||0);
  if(!memberActive||!['owner','manager'].includes(role))throw http(403,'PG workspace access is disabled.');
  if(memberForcedEpoch && authTime<memberForcedEpoch)throw http(401,'This user session was signed out by the PG Owner. Sign in again.');
  if(!tenantActive)throw http(403,'This PG workspace is suspended.');
  if(forcedEpoch && authTime<forcedEpoch)throw http(401,'This session was signed out by the PG Ops provider. Sign in again.');
  return{uid,role,tenantId,permissions};
}
function assertFilePermission(actor:{uid:string;role:string;tenantId:string;permissions:string[]},path:string,method:'GET'|'PUT'){
  if(actor.role==='owner')return;
  const rel=path.replace(`pg/${actor.tenantId}/`,'');
  const namespace=rel.split('/')[0]||'';
  const has=(p:string)=>actor.permissions.includes(p);
  const modulePermission:{[key:string]:string}={food:'food',staff:'staff',maintenance:'maintenance',assets:'assets',utilities:'utilities',expenses:'expenses',vendors:'vendors',calendar:'calendar',notifications:'notifications'};
  const allowed=namespace==='residents'?(has('residents')||has('documents')):
    namespace==='payments'?(has('payments')||has('documents')):
    namespace==='documents'?has('documents'):
    namespace==='branding'?false:
    modulePermission[namespace]?has(modulePermission[namespace]):false;
  if(!allowed)throw http(403,`Your Manager access does not allow ${method==='PUT'?'uploading':'opening'} this file.`);
}
async function wrapKey(rawKeyB64:string,env:Env){const kek=await importKek(env),iv=crypto.getRandomValues(new Uint8Array(12)),raw=fromB64(rawKeyB64);if(raw.byteLength!==32)throw http(400,'Invalid file encryption key.');const wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv},kek,raw);return{wrappedKey:toB64(new Uint8Array(wrapped)),wrapIv:toB64(iv)};}
async function unwrapKey(wrappedB64:string,ivB64:string,env:Env){if(!wrappedB64||!ivB64)throw http(500,'Stored key metadata is incomplete.');const kek=await importKek(env),raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(ivB64)},kek,fromB64(wrappedB64));return toB64(new Uint8Array(raw));}
async function importKek(env:Env){const raw=fromB64(env.FILE_KEK_B64||'');if(raw.byteLength!==32)throw http(500,'FILE_KEK_B64 must be a 32-byte base64 secret.');return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
function cleanTenant(v:string){return v.trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);}function cleanPath(v:string){return v.replace(/^\/+/, '').replace(/\.\./g,'').replace(/[^a-zA-Z0-9_./-]/g,'_');}
function allowedMime(mime:string,name:string){const safeMimes=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','application/rtf']);const extOk=/\.(jpe?g|png|webp|heic|heif|pdf|docx?|xlsx?|txt|rtf)$/i.test(name);return safeMimes.has(mime.toLowerCase())&&extOk;}
function corsHeaders(origin:string,env:Env){const allowed=origin===env.ALLOWED_ORIGIN||origin==='https://pg.picsecure.in'||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);return{'access-control-allow-origin':allowed?origin:env.ALLOWED_ORIGIN,'access-control-allow-methods':'GET,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,x-pg-bucket,x-pg-tenant,x-pg-path,x-pg-key,x-pg-file-iv,x-pg-name,x-pg-mime','vary':'Origin','cache-control':'no-store'};}
function http(status:number,message:string){const e:any=new Error(message);e.status=status;return e;}function json(v:any,status:number,headers:Record<string,string>){return new Response(JSON.stringify(v),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});}function toB64(v:Uint8Array){let s='';v.forEach(x=>s+=String.fromCharCode(x));return btoa(s);}function fromB64(v:string){const s=atob(v),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
