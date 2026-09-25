import { Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { FileEncryptionMeta } from './models';

export interface StoredFileResult { name:string; path:string; url:string; provider?:'r2'|'demo'; encryption?:FileEncryptionMeta; }

@Injectable({providedIn:'root'})
export class FileStorageService {
  private readonly allowedExtensions=new Set(['jpg','jpeg','png','webp','heic','heif','pdf','doc','docx','xls','xlsx','txt','rtf']);
  private readonly allowedMimeTypes=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','application/rtf']);
  constructor(private fb:FirebaseService,private auth:AuthService){}

  async upload(path:string,file:File):Promise<StoredFileResult>{this.validate(file);if(APP_CONFIG.fileProvider==='r2')return this.uploadEncryptedToR2(path,file);return{name:file.name,path:`demo:${path}`,url:'',provider:'demo'};}
  async open(path:string,url='',encryption?:FileEncryptionMeta):Promise<string>{if(APP_CONFIG.fileProvider==='r2')return this.openEncryptedFromR2(path,encryption);if(url)return url;throw new Error('This demo file has no stored binary.');}
  async remove(path:string){if(APP_CONFIG.fileProvider!=='r2'||!path)return;const base=APP_CONFIG.r2.apiBaseUrl.replace(/\/$/,'');const token=await this.token(),tenantId=this.tenantId();const res=await fetch(`${base}/v1/files/object?path=${encodeURIComponent(path)}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`,'x-pg-tenant':tenantId}});if(!res.ok){const text=await res.text().catch(()=>'');throw new Error(text||'Unable to remove encrypted R2 file.');}}
  async health(){if(APP_CONFIG.fileProvider!=='r2')return{ok:false};const base=APP_CONFIG.r2.apiBaseUrl.replace(/\/$/,'');if(!base)return{ok:false};const token=await this.token(),tenantId=this.tenantId();const res=await fetch(`${base}/health`,{headers:{authorization:`Bearer ${token}`,'x-pg-tenant':tenantId}});if(!res.ok)return{ok:false,status:res.status};return res.json();}
  private validate(file:File){const ext=(file.name.split('.').pop()||'').toLowerCase();if(!this.allowedExtensions.has(ext))throw new Error('Only JPG, PNG, WebP, HEIC/HEIF, PDF and approved office/text documents are allowed.');if(file.type&& !this.allowedMimeTypes.has(file.type.toLowerCase()))throw new Error('This file content type is not allowed in the secure vault. SVG/HTML and executable content are blocked.');if(file.size<=0)throw new Error('The selected file is empty.');if(file.size>APP_CONFIG.r2.maxFileBytes)throw new Error(`File is too large. Maximum allowed size is ${Math.round(APP_CONFIG.r2.maxFileBytes/1024/1024)} MB.`);}
  private async token(){const user=this.fb.auth?.currentUser;if(!user)throw new Error('Your secure session is not available. Sign in again.');return user.getIdToken();}
  private tenantId(){const id=this.auth.user()?.tenantId;if(!id)throw new Error('No active PG workspace.');return id;}

  private async uploadEncryptedToR2(path:string,file:File):Promise<StoredFileResult>{
    const base=APP_CONFIG.r2.apiBaseUrl.replace(/\/$/,'');if(!base)throw new Error(`Encrypted R2 vault is not connected yet. Configure APP_CONFIG.r2.apiBaseUrl for bucket “${APP_CONFIG.r2.bucketName}”.`);
    const token=await this.token(),tenantId=this.tenantId(),rawKey=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['encrypt']),plain=await file.arrayBuffer(),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain),safePath=`pg/${tenantId}/${path}`.replace(/[^a-zA-Z0-9_./-]/g,'_');
    const res=await fetch(`${base}/v1/files/object`,{method:'PUT',headers:{'authorization':`Bearer ${token}`,'content-type':'application/octet-stream','x-pg-bucket':APP_CONFIG.r2.bucketName,'x-pg-tenant':tenantId,'x-pg-path':safePath,'x-pg-key':this.b64(rawKey),'x-pg-file-iv':this.b64(iv),'x-pg-name':encodeURIComponent(file.name),'x-pg-mime':file.type||'application/octet-stream'},body:cipher});
    if(!res.ok){const text=await res.text().catch(()=>'');throw new Error(text||'Encrypted R2 upload failed.');}const data=await res.json() as {objectPath:string;keyId?:string;wrappedKey?:string;wrapIv?:string};return{name:file.name,path:data.objectPath||safePath,url:'',provider:'r2',encryption:{algorithm:'AES-GCM-256',iv:this.b64(iv),keyId:data.keyId,wrappedKey:data.wrappedKey,wrapIv:data.wrapIv}};
  }

  private async openEncryptedFromR2(path:string,_encryption?:FileEncryptionMeta):Promise<string>{
    const base=APP_CONFIG.r2.apiBaseUrl.replace(/\/$/,'');if(!base)throw new Error(`Encrypted R2 vault is not connected yet. Configure the Worker for bucket “${APP_CONFIG.r2.bucketName}”.`);const token=await this.token(),tenantId=this.tenantId();
    const res=await fetch(`${base}/v1/files/object?path=${encodeURIComponent(path)}`,{headers:{authorization:`Bearer ${token}`,'x-pg-tenant':tenantId}});if(!res.ok){const text=await res.text().catch(()=>'');throw new Error(text||'Unable to open encrypted R2 file.');}
    const keyB64=res.headers.get('x-pg-key'),ivB64=res.headers.get('x-pg-file-iv');if(!keyB64||!ivB64)throw new Error('Encrypted file metadata is incomplete.');const key=await crypto.subtle.importKey('raw',this.unb64(keyB64),{name:'AES-GCM'},false,['decrypt']),cipher=await res.arrayBuffer(),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:this.unb64(ivB64)},key,cipher),mime=res.headers.get('x-pg-mime')||'application/octet-stream';return URL.createObjectURL(new Blob([plain],{type:mime}));
  }
  private b64(bytes:Uint8Array){let s='';bytes.forEach(v=>s+=String.fromCharCode(v));return btoa(s);}private unb64(value:string){const s=atob(value),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
}
