import { Injectable, effect, signal } from '@angular/core';
import { AuthService } from './auth.service';

type LockMode = 'setup'|'unlock'|null;
interface PinRecord { v:2; salt:string; hash:string; iterations:number; }

@Injectable({providedIn:'root'})
export class AppLockService {
  readonly locked = signal(false);
  readonly mode = signal<LockMode>(null);
  readonly error = signal('');
  readonly idleMinutes = signal(10);

  private uid='';
  private lastActivity=Date.now();
  private timer?:number;
  private listenersReady=false;
  private lastPersistedActivity=0;
  private readonly iterations=250_000;

  constructor(private auth:AuthService){
    effect(()=>{
      const ready=this.auth.ready();
      const user=this.auth.user();
      if(!ready)return;
      if(!user){this.stop();this.uid='';this.locked.set(false);this.mode.set(null);return;}
      if(user.uid!==this.uid)this.initializeFor(user.uid);
    });
  }

  private initializeFor(uid:string){
    this.stop();
    this.uid=uid;
    this.error.set('');
    this.idleMinutes.set(this.readIdleMinutes());
    const storedActivity=Number(localStorage.getItem(this.activityKey())||0);
    this.lastActivity=storedActivity||Date.now();
    this.lastPersistedActivity=this.lastActivity;
    this.attachActivityListeners();
    const hasPin=!!localStorage.getItem(this.pinKey());
    const expired=Date.now()-this.lastActivity>=this.idleMinutes()*60_000;
    if(hasPin&&expired){this.locked.set(true);this.mode.set('unlock');}
    else if(hasPin){this.locked.set(false);this.mode.set(null);this.persistActivity(true);this.startTimer();}
    else{this.locked.set(true);this.mode.set('setup');}
  }

  private attachActivityListeners(){
    if(this.listenersReady)return;
    this.listenersReady=true;
    const mark=()=>this.markActivity();
    for(const name of ['pointerdown','keydown','touchstart','wheel','scroll']) window.addEventListener(name,mark,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.checkIdle();});
  }

  private startTimer(){this.stopTimer();this.timer=window.setInterval(()=>this.checkIdle(),15_000);}
  private stopTimer(){if(this.timer){window.clearInterval(this.timer);this.timer=undefined;}}
  private stop(){this.stopTimer();}
  private markActivity(){if(!this.auth.user()||this.locked())return;this.lastActivity=Date.now();this.persistActivity();}
  private checkIdle(){if(!this.auth.user()||this.locked())return;if(Date.now()-this.lastActivity>=this.idleMinutes()*60_000)this.lockNow();}

  lockNow(){if(!this.auth.user())return;this.locked.set(true);this.mode.set(localStorage.getItem(this.pinKey())?'unlock':'setup');this.error.set('');}

  async createPin(pin:string,confirm:string){
    this.error.set('');
    if(!/^\d{4,6}$/.test(pin)){this.error.set('Use a 4–6 digit PIN.');return false;}
    if(pin!==confirm){this.error.set('PINs do not match.');return false;}
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const hash=await this.derive(pin,salt,this.iterations);
    const record:PinRecord={v:2,salt:this.b64(salt),hash,iterations:this.iterations};
    localStorage.setItem(this.pinKey(),JSON.stringify(record));
    this.clearAttemptState();
    this.unlockSuccess();
    return true;
  }

  async unlock(pin:string){
    this.error.set('');
    const retryMs=this.remainingLockoutMs();
    if(retryMs>0){this.error.set(`Too many incorrect PIN attempts. Try again in ${Math.ceil(retryMs/1000)} seconds.`);return false;}
    if(!/^\d{4,6}$/.test(pin)){this.error.set('Enter your 4–6 digit PIN.');return false;}
    const saved=localStorage.getItem(this.pinKey());
    if(!saved){this.mode.set('setup');this.error.set('Create a device PIN first.');return false;}
    const ok=await this.verifySavedPin(saved,pin);
    if(!ok){this.recordFailedAttempt();this.error.set(this.remainingLockoutMs()>0?'Too many incorrect PIN attempts. Device lock is temporarily paused.':'Incorrect PIN. Try again.');return false;}
    this.clearAttemptState();
    this.unlockSuccess();
    return true;
  }

  private async verifySavedPin(saved:string,pin:string){
    try{
      const record=JSON.parse(saved) as Partial<PinRecord>;
      if(record?.v===2&&record.salt&&record.hash&&record.iterations){
        const candidate=await this.derive(pin,this.unb64(record.salt),Number(record.iterations));
        return this.constantTimeEqual(candidate,record.hash);
      }
    }catch{}
    // Legacy SHA-256 migration: accept once, then immediately upgrade to PBKDF2.
    const legacy=await this.legacyHash(pin);
    if(!this.constantTimeEqual(legacy,saved))return false;
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const hash=await this.derive(pin,salt,this.iterations);
    localStorage.setItem(this.pinKey(),JSON.stringify({v:2,salt:this.b64(salt),hash,iterations:this.iterations} satisfies PinRecord));
    return true;
  }

  private unlockSuccess(){this.locked.set(false);this.mode.set(null);this.error.set('');this.lastActivity=Date.now();this.persistActivity(true);this.startTimer();}

  setIdleMinutes(minutes:number){
    const value=[5,10,15,30].includes(Number(minutes))?Number(minutes):10;
    this.idleMinutes.set(value);if(this.uid)localStorage.setItem(this.timeoutKey(),String(value));this.lastActivity=Date.now();
  }
  private readIdleMinutes(){const n=Number(localStorage.getItem(this.timeoutKey())||10);return [5,10,15,30].includes(n)?n:10;}

  resetPin(){if(this.uid){localStorage.removeItem(this.pinKey());this.clearAttemptState();}}
  hasPin(){return !!(this.uid&&localStorage.getItem(this.pinKey()));}

  private recordFailedAttempt(){
    const attempts=Number(localStorage.getItem(this.attemptKey())||0)+1;
    localStorage.setItem(this.attemptKey(),String(attempts));
    if(attempts>=10)localStorage.setItem(this.lockoutKey(),String(Date.now()+5*60_000));
    else if(attempts>=5)localStorage.setItem(this.lockoutKey(),String(Date.now()+30_000));
  }
  private remainingLockoutMs(){return Math.max(0,Number(localStorage.getItem(this.lockoutKey())||0)-Date.now());}
  private clearAttemptState(){localStorage.removeItem(this.attemptKey());localStorage.removeItem(this.lockoutKey());}

  private persistActivity(force=false){if(!this.uid)return;const now=Date.now();if(force||now-this.lastPersistedActivity>5000){localStorage.setItem(this.activityKey(),String(this.lastActivity));this.lastPersistedActivity=now;}}
  private pinKey(){return `pgops-device-pin:${this.uid}`;}
  private timeoutKey(){return `pgops-lock-timeout:${this.uid}`;}
  private activityKey(){return `pgops-last-activity:${this.uid}`;}
  private attemptKey(){return `pgops-pin-attempts:${this.uid}`;}
  private lockoutKey(){return `pgops-pin-lockout:${this.uid}`;}

  private async derive(pin:string,salt:Uint8Array,iterations:number){
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
    // WebCrypto's BufferSource typings in TS 5.9 require an ArrayBuffer-backed value.
    // Copy the salt into a real ArrayBuffer so SharedArrayBuffer/ArrayBufferLike cannot leak into the type.
    const saltBuffer=new ArrayBuffer(salt.byteLength);
    new Uint8Array(saltBuffer).set(salt);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBuffer,iterations},base,256);
    return this.hex(new Uint8Array(bits));
  }
  private async legacyHash(pin:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`pgops:${this.uid}:${pin}`));return this.hex(new Uint8Array(digest));}
  private constantTimeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
  private hex(v:Uint8Array){return Array.from(v).map(b=>b.toString(16).padStart(2,'0')).join('');}
  private b64(v:Uint8Array){let s='';v.forEach(x=>s+=String.fromCharCode(x));return btoa(s);}
  private unb64(v:string){const s=atob(v),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
}
