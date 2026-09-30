import { Injectable, effect, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { FileStorageService } from './file-storage.service';
import { Resident } from './models';
import { StoreService } from './store.service';

@Injectable({providedIn:'root'})
export class ResidentPhotoService {
  private readonly urls=signal<Record<string,string>>({});
  private syncRun=0;
  private tenantKey='';

  constructor(private store:StoreService,private auth:AuthService,private files:FileStorageService){
    effect(()=>{
      const ready=this.auth.ready();
      const user=this.auth.user();
      const residents=this.store.residents();
      const tenantId=user?.tenantId||'';
      if(!ready||!user||!tenantId){
        if(ready&&!user)this.clear();
        return;
      }
      if(this.tenantKey&&this.tenantKey!==tenantId)this.clear();
      this.tenantKey=tenantId;
      void this.sync(residents,tenantId);
    });
  }

  photo(resident:Resident|undefined|null){return resident?this.urls()[resident.id]||'':'';}
  photoById(residentId:string){return this.urls()[residentId]||'';}

  private async sync(residents:Resident[],tenantId:string){
    const run=++this.syncRun;
    const current=untracked(()=>this.urls());
    const next:Record<string,string>={};
    const queue=residents.map(r=>({resident:r,doc:this.primaryPhoto(r)})).filter(x=>!!x.doc);

    for(let i=0;i<queue.length;i+=4){
      const batch=queue.slice(i,i+4);
      await Promise.all(batch.map(async ({resident,doc})=>{
        if(run!==this.syncRun||this.auth.user()?.tenantId!==tenantId)return;
        const existing=current[resident.id];
        if(existing){next[resident.id]=existing;return;}
        try{
          const mime=this.mimeFor(doc!.name);
          const url=await this.files.open(doc!.path||'',doc!.url||'',doc!.encryption,mime);
          if(run!==this.syncRun||this.auth.user()?.tenantId!==tenantId){this.revoke(url);return;}
          next[resident.id]=url;
        }catch(error){
          console.warn('[PG Management] Resident profile photo could not be loaded.',resident.id,error);
        }
      }));
      if(run!==this.syncRun)return;
    }

    if(run!==this.syncRun)return;
    for(const [id,url] of Object.entries(current))if(!next[id])this.revoke(url);
    const currentKeys=Object.keys(current),nextKeys=Object.keys(next);
    const unchanged=currentKeys.length===nextKeys.length&&nextKeys.every(id=>current[id]===next[id]);
    if(!unchanged)this.urls.set(next);
  }

  private primaryPhoto(resident:Resident){
    return resident.documents.find(d=>d.type.toLowerCase().includes('photo')&&this.isWebImage(d.name));
  }
  private isWebImage(name:string){return /\.(jpe?g|png|webp)$/i.test(name||'');}
  private mimeFor(name:string){const ext=(name.split('.').pop()||'').toLowerCase();return ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';}
  private revoke(url:string){if(url.startsWith('blob:'))URL.revokeObjectURL(url);}
  private clear(){this.syncRun++;Object.values(untracked(()=>this.urls())).forEach(url=>this.revoke(url));this.urls.set({});this.tenantKey='';}
}
