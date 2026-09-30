import { EnvironmentInjector, Injectable, effect, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
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
  readonly stateMessage=signal('Checking push notification support…');
  readonly unreadCount=signal(0);
  readonly latestItems=signal<any[]>([]);
  private messaging?:Messaging;
  private token='';
  private tokenDocId='';
  private watchedTenant='';
  private notificationUnsub?:Unsubscribe;
  private foregroundUnsub?:()=>void;
  private nativeListenersReady=false;
  private permissionPromptTimer?:number;
  private readonly native=Capacitor.isNativePlatform();
  private readonly nativeChannelId='pg_management_alerts';

  private async ensureNativeNotificationChannel(){
    if(!this.native)return;
    try{
      await PushNotifications.createChannel({
        id:this.nativeChannelId,
        name:'PG Alerts',
        description:'PG Management rent, resident, payment and operations alerts',
        importance:5,
        visibility:1,
        vibration:true
      });
      // Best-effort cleanup of Android/FCM's generic fallback channel.
      await PushNotifications.deleteChannel({id:'fcm_fallback_notification_channel'}).catch(()=>{});
    }catch(e){console.warn('[PG Management Push] Notification channel setup skipped.',e);}
  }

  constructor(private fb:FirebaseService,private auth:AuthService,private cloud:CloudDataService,private router:Router,private readonly injector:EnvironmentInjector){
    effect(()=>{
      const ready=auth.ready(),u=auth.user();
      if(!ready)return;
      if(!u){this.stopTenantWatch();this.unreadCount.set(0);this.latestItems.set([]);return;}
      this.startTenantWatch(u.tenantId);
      // Ask once per signed-in account/device when permission has not been decided yet.
      // Native Android gets the OS permission dialog. Web/PWA gets the browser permission dialog.
      this.schedulePermissionPrompt(u.uid);
      if(this.native)void this.syncNativeIfGranted();
      else if(typeof Notification!=='undefined'&&Notification.permission==='granted')void this.syncIfGranted();
      else void this.refreshSupportState();
    },{injector:this.injector});
  }


  private schedulePermissionPrompt(uid:string){
    if(typeof window==='undefined'||!this.canReceiveNotifications())return;
    if(this.permissionPromptTimer)window.clearTimeout(this.permissionPromptTimer);
    const key=`pg-management-push-prompt:${uid}`;
    this.permissionPromptTimer=window.setTimeout(async()=>{
      try{
        if(this.native){
          const p=await PushNotifications.checkPermissions();
          if(p.receive==='prompt'||p.receive==='prompt-with-rationale'){
            const ok=await this.enableNativePush();
            if(ok)localStorage.setItem(key,'granted');
          }else if(p.receive==='granted'){
            localStorage.setItem(key,'granted');
            await this.syncNativeIfGranted();
          }else if(p.receive==='denied')localStorage.setItem(key,'denied');
          return;
        }
        if(typeof Notification==='undefined')return;
        if(Notification.permission==='granted'){localStorage.setItem(key,'granted');await this.syncIfGranted();return;}
        if(Notification.permission==='denied'){localStorage.setItem(key,'denied');return;}
        // Do not keep nagging once the browser has recorded a final decision.
        if(localStorage.getItem(key)==='denied')return;
        const permission=await Notification.requestPermission();
        if(permission==='granted'){localStorage.setItem(key,'granted');await this.registerCurrentWebDevice();}
        else if(permission==='denied')localStorage.setItem(key,'denied');
      }catch(e){console.warn('[PG Management Push] Permission prompt could not be completed automatically.',e);}
    },900);
  }

  private canReceiveNotifications(){const u=this.auth.user();return Boolean(u&&(u.role==='owner'||u.permissions?.includes('notifications')||u.permissions?.includes('payments')));}
  private visibleToCurrentUser(row:any){const u=this.auth.user();if(!u)return false;if(u.role==='owner')return true;return String(row?.type||'').toLowerCase()==='rent'&&row?.ownerOnly!==true;}
  private isUnread(row:any){return !['read','completed','closed','paid'].includes(String(row?.status||'').toLowerCase());}
  private startTenantWatch(tenantId:string){
    if(!tenantId||this.watchedTenant===tenantId||!this.canReceiveNotifications())return;
    this.stopTenantWatch();this.watchedTenant=tenantId;
    this.notificationUnsub=this.cloud.watchNotifications<any>(rows=>{
      const visible=rows.filter(x=>this.visibleToCurrentUser(x));const sorted=[...visible].sort((a,b)=>String(b.createdAt||b.time||'').localeCompare(String(a.createdAt||a.time||'')));
      this.latestItems.set(sorted.slice(0,50));
      this.unreadCount.set(sorted.filter(x=>this.isUnread(x)).length);
    },()=>{});
  }
  private stopTenantWatch(){this.notificationUnsub?.();this.notificationUnsub=undefined;this.watchedTenant='';}

  async refreshSupportState(){
    if(!this.fb.configured){this.state.set('not-configured');this.stateMessage.set('Firebase is not configured.');return;}
    if(this.native){
      try{
        const p=await PushNotifications.checkPermissions();
        if(p.receive==='denied'){this.state.set('blocked');this.stateMessage.set('Notifications are blocked for PG Management in Android settings.');return;}
        this.state.set(p.receive==='granted'?'available':'available');
        this.stateMessage.set(p.receive==='granted'?'Native FCM permission granted. Syncing this device…':'Native FCM notifications are available for this app.');
      }catch(e:any){this.state.set('error');this.stateMessage.set(e?.message||'Unable to check native push permissions.');}
      return;
    }
    if(typeof window==='undefined'||typeof Notification==='undefined'||!('serviceWorker' in navigator)){this.state.set('unsupported');this.stateMessage.set('This browser does not support web push notifications.');return;}
    if(!environment.firebase.vapidKey){this.state.set('not-configured');this.stateMessage.set('Web Push key is not configured yet. Add the Firebase Web Push VAPID public key.');return;}
    if(Notification.permission==='denied'){this.state.set('blocked');this.stateMessage.set('Notifications are blocked in this browser. Allow them in the site permissions.');return;}
    const supported=await isSupported().catch(()=>false);if(!supported){this.state.set('unsupported');this.stateMessage.set('Firebase Messaging is not supported in this browser.');return;}
    this.state.set('available');this.stateMessage.set(Notification.permission==='granted'?'Push permission granted. Syncing this browser…':'Web push notifications are available for this browser.');
  }

  async enablePush(){
    if(this.native)return this.enableNativePush();
    await this.refreshSupportState();
    if(['unsupported','not-configured','blocked'].includes(this.state()))return false;
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){this.state.set(permission==='denied'?'blocked':'available');this.stateMessage.set(permission==='denied'?'Notifications were blocked.':'Notification permission was not granted.');return false;}
    return this.registerCurrentWebDevice();
  }

  async syncIfGranted(){
    if(this.native)return this.syncNativeIfGranted();
    await this.refreshSupportState();
    if(typeof Notification==='undefined'||Notification.permission!=='granted'||!environment.firebase.vapidKey)return false;
    return this.registerCurrentWebDevice();
  }

  private async enableNativePush(){
    try{
      let p=await PushNotifications.checkPermissions();
      if(p.receive!=='granted')p=await PushNotifications.requestPermissions();
      if(p.receive!=='granted'){this.state.set('blocked');this.stateMessage.set('Android notification permission was not granted.');return false;}
      await this.ensureNativeNotificationChannel();
      await this.prepareNativeListeners();
      await PushNotifications.register();
      this.state.set('available');this.stateMessage.set('Registering this Android device with FCM…');
      return true;
    }catch(e:any){this.state.set('error');this.stateMessage.set(e?.message||'Unable to enable native FCM notifications.');return false;}
  }

  private async syncNativeIfGranted(){
    if(!this.native)return false;
    try{
      const p=await PushNotifications.checkPermissions();
      if(p.receive!=='granted'){await this.refreshSupportState();return false;}
      await this.ensureNativeNotificationChannel();
      await this.prepareNativeListeners();
      await PushNotifications.register();
      return true;
    }catch{return false;}
  }

  private async prepareNativeListeners(){
    if(this.nativeListenersReady)return;
    this.nativeListenersReady=true;
    await PushNotifications.addListener('registration',(token:Token)=>void this.saveToken(token.value,'android-native'));
    await PushNotifications.addListener('registrationError',(err: unknown)=>{console.error('[PG Management Native Push]',err);this.state.set('error');this.stateMessage.set('FCM registration failed on this Android device.');});
    await PushNotifications.addListener('pushNotificationReceived',(_notification:PushNotificationSchema)=>{
      // Android displays background notifications natively. Foreground delivery remains reflected in the in-app notification center.
      this.state.set('enabled');
    });
    await PushNotifications.addListener('pushNotificationActionPerformed',(action:ActionPerformed)=>{
      const url=String(action.notification.data?.['url']||'/notifications');
      void this.router.navigateByUrl(url.startsWith('/')?url:`/${url}`);
    });
  }

  private async registerCurrentWebDevice(){
    const u=this.auth.user();if(!u||!this.fb.app||!this.fb.db||!this.canReceiveNotifications())return false;
    try{
      const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      this.messaging=this.messaging||getMessaging(this.fb.app);
      const token=await getToken(this.messaging,{vapidKey:environment.firebase.vapidKey,serviceWorkerRegistration:registration});
      if(!token)throw new Error('Firebase did not return a push token.');
      await this.saveToken(token,'web-pwa');
      if(!this.foregroundUnsub){this.foregroundUnsub=onMessage(this.messaging,payload=>{
        const title=payload.notification?.title||String(payload.data?.['title']||'PG Management');
        const body=payload.notification?.body||String(payload.data?.['body']||'A new PG update is available.');
        if(Notification.permission==='granted'){const url=String(payload.data?.['url']||'/notifications');void navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,{body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:String(payload.data?.['tag']||'pg-management-update'),data:{url},requireInteraction:String(payload.data?.['priority']||'').toLowerCase()==='high'})).catch(()=>{});}
      });}
      return true;
    }catch(e:any){console.error('[PG Management Push]',e);this.state.set('error');this.stateMessage.set(e?.message||'Unable to enable push notifications.');return false;}
  }

  private async saveToken(token:string,platform:string){
    const u=this.auth.user();if(!u||!this.fb.db||!this.canReceiveNotifications()||!token)return false;
    const hash=await this.sha256(token),id=`${u.uid}_${hash.slice(0,24)}`;
    await setDoc(doc(this.fb.db,'tenants',u.tenantId,'pushTokens',id),{
      id,uid:u.uid,token,tenantId:u.tenantId,role:u.role,permissions:u.permissions||[],platformRole:u.platformRole,platform,
      userAgent:typeof navigator!=='undefined'?navigator.userAgent:'native',updatedAt:serverTimestamp(),createdAt:serverTimestamp()
    },{merge:true});
    this.token=token;this.tokenDocId=id;this.state.set('enabled');this.stateMessage.set(this.native?'Native FCM notifications are enabled on this Android device.':'Push notifications are enabled in this browser.');
    return true;
  }

  async removeCurrentDeviceToken(){
    const u=this.auth.user();if(!u||!this.fb.db||!this.tokenDocId)return;
    try{await deleteDoc(doc(this.fb.db,'tenants',u.tenantId,'pushTokens',this.tokenDocId));}catch{}
    this.token='';this.tokenDocId='';
  }

  private async sha256(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
}
