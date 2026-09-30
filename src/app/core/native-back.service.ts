import { Injectable, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NativeUpdateService } from './native-update.service';

@Injectable({providedIn:'root'})
export class NativeBackService {
  readonly exitHintVisible=signal(false);
  private lastRootBackAt=0;
  private hideTimer?:ReturnType<typeof setTimeout>;
  private listenerReady=false;
  private readonly isNative=Capacitor.isNativePlatform();

  constructor(private router:Router,private location:Location,private updates:NativeUpdateService){
    if(this.isNative)void this.install();
  }

  private async install(){
    if(this.listenerReady)return;
    this.listenerReady=true;
    await App.addListener('backButton',()=>void this.handleBack());
  }

  private async handleBack(){
    if(this.updates.available()){
      const release=this.updates.release();
      if(release?.mandatory)return;
      this.updates.dismiss();
      return;
    }

    const detail={handled:false};
    window.dispatchEvent(new CustomEvent('pgops-native-back',{detail}));
    if(detail.handled)return;

    const cleanUrl=(this.router.url||'/').split('?')[0].split('#')[0];
    const isRoot=cleanUrl==='/'||cleanUrl===''||cleanUrl==='/login';
    if(!isRoot){
      this.hideExitHint();
      this.location.back();
      return;
    }

    const now=Date.now();
    if(now-this.lastRootBackAt<=2000){
      this.hideExitHint();
      this.lastRootBackAt=0;
      await App.exitApp();
      return;
    }

    this.lastRootBackAt=now;
    this.exitHintVisible.set(true);
    if(this.hideTimer)clearTimeout(this.hideTimer);
    this.hideTimer=setTimeout(()=>this.hideExitHint(),2200);
  }

  private hideExitHint(){
    if(this.hideTimer){clearTimeout(this.hideTimer);this.hideTimer=undefined;}
    this.exitHintVisible.set(false);
  }
}
