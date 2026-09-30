import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { environment } from '../../environments/environment';

export interface NativeReleaseManifest {
  enabled: boolean;
  version: string;
  versionCode: number;
  minimumVersionCode?: number;
  title?: string;
  message?: string;
  apkUrl?: string;
  releaseNotes?: string[];
  mandatory?: boolean;
  sha256?: string;
  publishedAt?: string;
}

interface PGUpdaterPlugin {
  getStatus():Promise<{nativeBridge:boolean;packageName:string}>;
  downloadAndInstall(options:{url:string;sha256?:string;fileName?:string}):Promise<{status:string}>;
  addListener(eventName:'downloadProgress',listener:(event:{percent:number;downloaded:number;total:number;status:string})=>void):Promise<{remove:()=>Promise<void>}>;
}

const PGUpdater=registerPlugin<PGUpdaterPlugin>('PGUpdater');

@Injectable({providedIn:'root'})
export class NativeUpdateService {
  readonly available=signal(false);
  readonly checking=signal(false);
  readonly release=signal<NativeReleaseManifest|null>(null);
  readonly error=signal('');
  readonly currentVersion=signal(environment.nativeApp.version);
  readonly currentVersionCode=signal(environment.nativeApp.versionCode);
  readonly installing=signal(false);
  readonly installProgress=signal(0);
  readonly installStatus=signal('');
  readonly postUpdateMessage=signal('');

  readonly isNative=Capacitor.isNativePlatform();
  private appListenerReady=false;
  private updaterListenerReady=false;
  private pendingInstallAfterPermission=false;

  constructor(){
    if(this.isNative){
      void this.loadInstalledVersion();
      void this.installResumeCheck();
      void this.installUpdaterListener();
    }
  }

  private async loadInstalledVersion(){
    try{
      const info=await App.getInfo();
      const installedVersion=info.version||environment.nativeApp.version;
      this.currentVersion.set(installedVersion);
      const code=Number(info.build);
      if(Number.isFinite(code)&&code>0)this.currentVersionCode.set(code);
      try{
        const pending=localStorage.getItem('pg:update:pending-version')||'';
        if(pending&&pending===installedVersion){
          this.postUpdateMessage.set(`PG Management updated successfully to v${installedVersion}. New changes are ready.`);
          localStorage.removeItem('pg:update:pending-version');
          setTimeout(()=>this.postUpdateMessage.set(''),5200);
        }
      }catch{}
    }catch{}
  }

  private async installResumeCheck(){
    if(this.appListenerReady)return;
    this.appListenerReady=true;
    await App.addListener('appStateChange',({isActive})=>{
      if(!isActive)return;
      if(this.pendingInstallAfterPermission){
        this.pendingInstallAfterPermission=false;
        setTimeout(()=>void this.installUpdate(),450);
        return;
      }
      setTimeout(()=>void this.checkForUpdate(),650);
    });
  }

  private async installUpdaterListener(){
    if(this.updaterListenerReady)return;
    this.updaterListenerReady=true;
    try{
      await PGUpdater.addListener('downloadProgress',event=>{
        this.installProgress.set(Math.max(0,Math.min(100,Math.round(Number(event.percent||0)))));
        this.installStatus.set(event.status||'Downloading update…');
      });
    }catch{}
  }

  async checkForUpdate(force=false){
    if(!this.isNative&&!force)return false;
    if(this.checking())return this.available();
    this.checking.set(true);this.error.set('');
    try{
      await this.loadInstalledVersion();
      const url=new URL(environment.nativeApp.updateManifestUrl);
      url.searchParams.set('_',String(Date.now()));
      const response=await fetch(url.toString(),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Update check failed (${response.status}).`);
      const manifest=await response.json() as NativeReleaseManifest;
      if(!manifest||manifest.enabled!==true||!Number.isFinite(Number(manifest.versionCode))){this.release.set(null);this.available.set(false);return false;}
      const newer=Number(manifest.versionCode)>this.currentVersionCode();
      if(Number(manifest.minimumVersionCode||0)>this.currentVersionCode())manifest.mandatory=true;
      this.release.set(manifest);this.available.set(newer);
      return newer;
    }catch(e:any){
      this.error.set(e?.message||'Unable to check for app updates.');
      return false;
    }finally{this.checking.set(false);}
  }

  dismiss(){if(!this.release()?.mandatory&&!this.installing())this.available.set(false);}

  async installUpdate(){
    const item=this.release();
    if(!item?.apkUrl||!this.isNative)return false;
    this.error.set('');
    this.installing.set(true);
    this.installProgress.set(1);
    this.installStatus.set('Preparing secure update…');
    try{
      const bridge=await PGUpdater.getStatus();
      if(!bridge?.nativeBridge)throw new Error('Native update bridge is unavailable in this installed APK. Install the latest signed APK once, then future updates will install in-app.');
      if(bridge.packageName!=='in.picsecure.pgops')throw new Error('Installed app package identity does not match PG Management. Update stopped for safety.');
      const url=new URL(item.apkUrl,environment.nativeApp.updateManifestUrl).toString();
      try{localStorage.setItem('pg:update:pending-version',item.version||String(item.versionCode));}catch{}
      const result=await PGUpdater.downloadAndInstall({
        url,
        sha256:item.sha256||'',
        fileName:`pg-management-${item.version||item.versionCode}.apk`
      });
      if(result?.status==='permission_required'){
        this.pendingInstallAfterPermission=true;
        this.installStatus.set('Allow app installs for PG Management. Installation will continue automatically when you return.');
        return false;
      }
      if(result?.status==='installer_opened'){
        this.installProgress.set(100);
        this.installStatus.set('Android secure installer is open. Confirm Update to finish.');
        return true;
      }
      this.installStatus.set('Update downloaded. Tap again to install.');
      return false;
    }catch(e:any){
      this.error.set(e?.message||'Unable to download the app update.');
      this.installStatus.set('');
      return false;
    }finally{
      this.installing.set(false);
    }
  }

  installButtonLabel(){
    if(this.installing()){
      const progress=this.installProgress();
      if(progress<=2)return 'Preparing…';
      if(progress<98)return `Downloading ${progress}%`;
      if(progress<100)return 'Scanning update…';
      return 'Installing…';
    }
    if(this.installStatus().includes('Allow “Install unknown apps”'))return 'Install update';
    return 'Update now';
  }
}
