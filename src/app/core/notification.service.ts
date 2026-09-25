import { Injectable, effect, signal } from '@angular/core';
import { getMessaging, getToken, isSupported, Messaging, onMessage } from 'firebase/messaging';
import { deleteDoc, doc, setDoc, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { CloudDataService } from './cloud-data.service';
import { environment } from '../../environments/environment';

type PushState='checking'|'unsupported'|'not-configured'|'blocked'|'available'|'enabled'|'error';

@Injectable({providedIn:'root'})
export class NotificationService{
  readonly state=signal<PushState>('checking');
  readonly stateMessage=signal('Checking browser push support…');
  readonly unreadCount=signal(0);
  readonly latestItems=signal<any[]>([]);
  private messaging?:Messaging;
  private token='';
  private tokenDocId='';
  private watchedTenant='';
  private notificationUnsub?:Unsubscribe;
  private foregroundUnsub?:()=>void;

  constructor(private fb:FirebaseService,private auth:AuthService,private cloud:CloudDataService){
    effect(()=>{
      const ready=auth.ready(),u=auth.user();
      if(!ready)return;
      if(!u){this.stopTenantWatch();this.unreadCount.set(0);this.latestItems.set([]);return;}
      this.startTenantWatch(u.tenantId);
      if(typeof Notification!=='undefined'&&Notification.permission==='granted')void this.syncIfGranted();
      else void this.refreshSupportState();
    });
  }

  private canReceiveNotifications(){const u=this.auth.user();return Boolean(u&&(u.role==='owner'||u.permissions?.includes('notifications')));}
  private startTenantWatch(tenantId:string){
    if(!tenantId||this.watchedTenant===tenantId||!this.canReceiveNotifications())return;
    this.stopTenantWatch();this.watchedTenant=tenantId;
    this.notificationUnsub=this.cloud.watchCollection<any>('notifications',rows=>{
      const sorted=[...rows].sort((a,b)=>String(b.createdAt||b.time||'').localeCompare(String(a.createdAt||a.time||'')));
      this.latestItems.set(sorted.slice(0,50));
      this.unreadCount.set(sorted.filter(x=>String(x.type||'').toLowerCase()!=='rent'&&!['read','completed','closed'].includes(String(x.status||'').toLowerCase())).length);
    },()=>{});
  }
  private stopTenantWatch(){this.notificationUnsub?.();this.notificationUnsub=undefined;this.watchedTenant='';}

  async refreshSupportState(){
    if(!this.fb.configured){this.state.set('not-configured');this.stateMessage.set('Firebase is not configured.');return;}
    if(typeof window==='undefined'||typeof Notification==='undefined'||!('serviceWorker' in navigator)){this.state.set('unsupported');this.stateMessage.set('This browser does not support web push notifications.');return;}
    if(!environment.firebase.vapidKey){this.state.set('not-configured');this.stateMessage.set('Web Push key is not configured yet. Add the Firebase Web Push VAPID public key.');return;}
    if(Notification.permission==='denied'){this.state.set('blocked');this.stateMessage.set('Notifications are blocked in this browser. Allow them in the site permissions.');return;}
    const supported=await isSupported().catch(()=>false);if(!supported){this.state.set('unsupported');this.stateMessage.set('Firebase Messaging is not supported in this browser.');return;}
    this.state.set(Notification.permission==='granted'?'available':'available');this.stateMessage.set(Notification.permission==='granted'?'Push permission granted. Syncing this device…':'Push notifications are available for this device.');
  }

  async enablePush(){
    await this.refreshSupportState();
    if(['unsupported','not-configured','blocked'].includes(this.state()))return false;
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){this.state.set(permission==='denied'?'blocked':'available');this.stateMessage.set(permission==='denied'?'Notifications were blocked.':'Notification permission was not granted.');return false;}
    return this.registerCurrentDevice();
  }

  async syncIfGranted(){
    await this.refreshSupportState();
    if(typeof Notification==='undefined'||Notification.permission!=='granted'||!environment.firebase.vapidKey)return false;
    return this.registerCurrentDevice();
  }

  private async registerCurrentDevice(){
    const u=this.auth.user();if(!u||!this.fb.app||!this.fb.db||!this.canReceiveNotifications())return false;
    try{
      const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      this.messaging=this.messaging||getMessaging(this.fb.app);
      const token=await getToken(this.messaging,{vapidKey:environment.firebase.vapidKey,serviceWorkerRegistration:registration});
      if(!token)throw new Error('Firebase did not return a push token.');
      const hash=await this.sha256(token),id=`${u.uid}_${hash.slice(0,24)}`;
      await setDoc(doc(this.fb.db,'tenants',u.tenantId,'pushTokens',id),{
        id,uid:u.uid,token,tenantId:u.tenantId,role:u.role,permissions:u.permissions||[],platformRole:u.platformRole,
        userAgent:navigator.userAgent,updatedAt:serverTimestamp(),createdAt:serverTimestamp()
      },{merge:true});
      this.token=token;this.tokenDocId=id;this.state.set('enabled');this.stateMessage.set('Push notifications are enabled on this device.');
      if(!this.foregroundUnsub){this.foregroundUnsub=onMessage(this.messaging,payload=>{
        const title=payload.notification?.title||String(payload.data?.['title']||'PG Ops');
        const body=payload.notification?.body||String(payload.data?.['body']||'A new PG update is available.');
        if(Notification.permission==='granted')new Notification(title,{body,icon:'/favicon.svg',tag:String(payload.data?.['tag']||'pg-ops-update')});
      });}
      return true;
    }catch(e:any){console.error('[PG Ops Push]',e);this.state.set('error');this.stateMessage.set(e?.message||'Unable to enable push notifications.');return false;}
  }

  async removeCurrentDeviceToken(){
    const u=this.auth.user();if(!u||!this.fb.db||!this.tokenDocId)return;
    try{await deleteDoc(doc(this.fb.db,'tenants',u.tenantId,'pushTokens',this.tokenDocId));}catch{}
    this.token='';this.tokenDocId='';
  }

  private async sha256(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
}
