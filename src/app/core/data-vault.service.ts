import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { FileStorageService } from './file-storage.service';

export interface BackupAttachmentEntry { path:string; name:string; zipPath:string; type?:string; }
export interface PgBackupPackage {
  format:'pgops-backup';
  formatVersion:1;
  exportedAt:string;
  appVersion:string;
  tenantId:string;
  tenant:any;
  collections:Record<string,any[]>;
  attachments:BackupAttachmentEntry[];
  summary:Record<string,number>;
}

@Injectable({providedIn:'root'})
export class DataVaultService {
  // Portable backups intentionally exclude FCM push tokens. They are device credentials,
  // not business records, and Firestore correctly prevents owner-side list access.
  readonly collectionNames=['members','blocks','rooms','floorInventories','residents','payments','food','staff','maintenance','assets','utilities','expenses','vendors','calendar','documents','notifications','settings','auditLogs'];
  constructor(private fb:FirebaseService,private auth:AuthService,private files:FileStorageService){}

  private tenantId(){const id=this.auth.user()?.tenantId;if(!id)throw new Error('No active PG workspace.');return id;}

  async createBackup(onProgress?:(message:string,percent:number)=>void):Promise<{blob:Blob;fileName:string;backup:PgBackupPackage}> {
    if(!this.auth.isOwner())throw new Error('Owner access is required to export the complete PG workspace.');
    if(!this.fb.configured||!this.fb.db)throw new Error('Firebase is not configured.');
    const tenantId=this.tenantId();
    onProgress?.('Reading PG workspace…',5);
    const tenantSnap=await getDoc(doc(this.fb.db,'tenants',tenantId));
    if(!tenantSnap.exists())throw new Error('PG workspace no longer exists.');
    const tenant={id:tenantSnap.id,...this.serialize(tenantSnap.data())};
    const collections:Record<string,any[]>={};
    for(let i=0;i<this.collectionNames.length;i++){
      const name=this.collectionNames[i];
      onProgress?.(`Reading ${this.pretty(name)}…`,8+Math.round((i/this.collectionNames.length)*42));
      const snap=await getDocs(collection(this.fb.db,'tenants',tenantId,name));
      collections[name]=snap.docs.map(d=>({id:d.id,...this.serialize(d.data())}));
    }
    const attachments=this.findAttachments({tenant,collections});
    const zip=new JSZip();
    const manifestAttachments:BackupAttachmentEntry[]=[];
    for(let i=0;i<attachments.length;i++){
      const a=attachments[i];
      onProgress?.(`Securing file ${i+1} of ${attachments.length}…`,52+Math.round((i/Math.max(1,attachments.length))*30));
      try{
        const objectUrl=await this.files.open(a.path,'',a.encryption);
        const response=await fetch(objectUrl);const blob=await response.blob();
        if(objectUrl.startsWith('blob:'))URL.revokeObjectURL(objectUrl);
        const ext=this.safeName(a.name||a.path.split('/').pop()||'file');
        const zipPath=`attachments/${String(i+1).padStart(4,'0')}-${ext}`;
        zip.file(zipPath,blob);manifestAttachments.push({path:a.path,name:a.name||ext,zipPath,type:a.type||''});
      }catch(e){console.warn('[PG Management] Backup attachment skipped',a.path,e);}
    }
    const backup:PgBackupPackage={format:'pgops-backup',formatVersion:1,exportedAt:new Date().toISOString(),appVersion:'1.25+',tenantId,tenant,collections,attachments:manifestAttachments,summary:this.summary(collections)};
    zip.file('tenant-backup.json',JSON.stringify(backup,null,2));
    zip.file('README.txt',this.readme(backup));
    for(const name of ['residents','payments','expenses','staff','rooms','maintenance'])zip.file(`tables/${name}.csv`,this.toCsv(collections[name]||[]));
    onProgress?.('Creating encrypted-ready backup archive…',90);
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const fileName=`PG-Management-${this.safeName(String(tenant.shortName||tenant.name||tenantId))}-Backup-${stamp}.zip`;
    onProgress?.('Backup ready',100);
    return{blob,fileName,backup};
  }

  async readBackup(file:File,onProgress?:(message:string,percent:number)=>void):Promise<{backup:PgBackupPackage;attachmentUrls:Record<string,string>}> {
    onProgress?.('Opening backup archive…',15);
    const zip=await JSZip.loadAsync(file);
    const raw=await zip.file('tenant-backup.json')?.async('text');
    if(!raw)throw new Error('This ZIP is not a PG Management backup. tenant-backup.json is missing.');
    const backup=JSON.parse(raw) as PgBackupPackage;
    if(backup.format!=='pgops-backup'||backup.formatVersion!==1)throw new Error('Unsupported PG Management backup format.');
    const attachmentUrls:Record<string,string>={};
    for(let i=0;i<(backup.attachments||[]).length;i++){
      const a=backup.attachments[i],entry=zip.file(a.zipPath);if(!entry)continue;
      onProgress?.(`Reading saved files ${i+1}/${backup.attachments.length}…`,30+Math.round((i/Math.max(1,backup.attachments.length))*60));
      const blob=await entry.async('blob');attachmentUrls[a.path]=URL.createObjectURL(blob);
    }
    onProgress?.('Backup opened in read-only mode',100);
    return{backup,attachmentUrls};
  }

  async deleteWorkspace(password:string,pin:string,onProgress?:(message:string,percent:number)=>void){
    if(!this.auth.isOwner())throw new Error('Owner access is required.');
    if(!this.fb.app)throw new Error('Firebase is not available.');
    onProgress?.('Verifying Owner password…',10);await this.auth.verifyCurrentPassword(password);
    const tenantId=this.tenantId();
    onProgress?.('Reading file vault references…',22);
    const snapshot:Record<string,any[]>={};
    for(const name of this.collectionNames){const s=await getDocs(collection(this.fb.db!,'tenants',tenantId,name));snapshot[name]=s.docs.map(d=>({id:d.id,...this.serialize(d.data())}));}
    const files=this.findAttachments(snapshot);
    for(let i=0;i<files.length;i++){onProgress?.(`Deleting secure file ${i+1}/${files.length}…`,28+Math.round((i/Math.max(1,files.length))*32));await this.files.remove(files[i].path);}
    onProgress?.('Deleting Firebase PG workspace…',70);
    const call=httpsCallable(getFunctions(this.fb.app,'asia-south1'),'deleteTenantWorkspaceData');
    await call({tenantId,confirmTenantId:tenantId,pinVerified:Boolean(pin)});
    onProgress?.('PG workspace deleted',100);
  }

  download(blob:Blob,fileName:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}

  private summary(c:Record<string,any[]>){return{residents:c['residents']?.length||0,payments:c['payments']?.length||0,expenses:c['expenses']?.length||0,staff:c['staff']?.length||0,rooms:c['rooms']?.length||0,documents:c['documents']?.length||0,notifications:c['notifications']?.length||0,auditLogs:c['auditLogs']?.length||0};}
  private serialize(v:any):any{if(v==null)return v;if(Array.isArray(v))return v.map(x=>this.serialize(x));if(typeof v==='object'){if(typeof v.toDate==='function')return v.toDate().toISOString();const o:any={};for(const[k,x]of Object.entries(v))o[k]=this.serialize(x);return o;}return v;}
  private findAttachments(root:any){const map=new Map<string,any>();const walk=(v:any,type='')=>{if(!v)return;if(Array.isArray(v)){v.forEach(x=>walk(x,type));return;}if(typeof v!=='object')return;if(v.provider==='r2'&&typeof v.path==='string'&&v.path){map.set(v.path,{path:v.path,name:String(v.name||'file'),type:String(v.type||type||''),encryption:v.encryption});}for(const[k,x]of Object.entries(v))walk(x,k);};walk(root);return[...map.values()];}
  private safeName(v:string){return v.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'PG-Management';}
  private pretty(v:string){return v.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());}
  private toCsv(rows:any[]){if(!rows.length)return'id\n';const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const esc=(v:any)=>{const s=typeof v==='object'?JSON.stringify(v):String(v??'');return`"${s.replace(/"/g,'""')}"`;};return keys.map(esc).join(',')+'\n'+rows.map(r=>keys.map(k=>esc(r[k])).join(',')).join('\n');}
  private readme(b:PgBackupPackage){return`PG Management Professional Backup\n\nPG: ${b.tenant?.name||b.tenantId}\nExported: ${b.exportedAt}\nFormat: ${b.format} v${b.formatVersion}\n\nThis archive contains tenant-scoped Firebase data, CSV summaries and available secure attachment copies. Open it from PG Management > Data Vault & Recovery for the premium read-only card view.\n`;}
}
