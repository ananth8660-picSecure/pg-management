import { EnvironmentInjector, Injectable, effect, signal } from '@angular/core';
import { AuthService } from './auth.service';

type LockMode = 'setup'|'unlock'|null;
interface PinRecord { v:2; salt:string; hash:string; iterations:number; digits?:number; }

@Injectable({providedIn:'root'})
export class AppLockService {
  readonly locked = signal(false);
  readonly mode = signal<LockMode>(null);
  readonly error = signal('');
  readonly unlocking = signal(false);
  readonly idleMinutes = signal(10);
  private readonly fixedIdleMinutes = 10;

  private uid='';
  private lastActivity=Date.now();
  private timer?:number;
  private listenersReady=false;
  private lastPersistedActivity=0;
  private readonly iterations=250_000;

  constructor(private auth:AuthService,private readonly injector:EnvironmentInjector){
    if(typeof window!=='undefined')window.addEventListener('pgops-fresh-login',()=>this.onFreshLogin());
    effect(()=>{
      const ready=this.auth.ready();
      const user=this.auth.user();
      if(!ready)return;
      if(!user){this.stop();this.uid='';this.unlocking.set(false);this.locked.set(false);this.mode.set(null);return;}
      if(user.uid!==this.uid)this.initializeFor(user.uid);
    },{injector:this.injector});
  }

  private initializeFor(uid:string){
    this.stop();
    this.uid=uid;
    this.error.set('');
    this.unlocking.set(false);
    // Security policy: every signed-in device auto-locks after exactly 10 minutes of inactivity.
    this.idleMinutes.set(this.fixedIdleMinutes);
    localStorage.setItem(this.timeoutKey(),String(this.fixedIdleMinutes));
    const storedActivity=Number(localStorage.getItem(this.activityKey())||0);
    this.lastActivity=storedActivity||Date.now();
    this.lastPersistedActivity=this.lastActivity;
    this.attachActivityListeners();
    const hasPin=!!localStorage.getItem(this.pinKey());
    const manuallyLocked=localStorage.getItem(this.manualLockKey())==='1';
    const expired=Date.now()-this.lastActivity>=this.fixedIdleMinutes*60_000;
    const freshCredentialLogin=this.consumeFreshLoginMarker(uid);
    // Credential login itself is the authentication gate. Do not immediately stack
    // an app-lock dialog on top of it. Manual lock and idle expiry still survive a
    // reload/app restart because those restores do not create a fresh-login marker.
    if(freshCredentialLogin){
      const now=Date.now();
      localStorage.removeItem(this.manualLockKey());
      this.lastActivity=now;this.lastPersistedActivity=now;
      localStorage.setItem(this.activityKey(),String(now));
      this.locked.set(false);this.mode.set(null);this.startTimer();
    }
    else if(hasPin&&(manuallyLocked||expired)){this.locked.set(true);this.mode.set('unlock');this.stopTimer();}
    else if(hasPin){this.locked.set(false);this.mode.set(null);this.persistActivity(true);this.startTimer();}
    else{this.locked.set(true);this.mode.set('setup');}
  }

  private onFreshLogin(){
    const user=this.auth.user();
    if(!user)return;
    const now=Date.now();
    // R160: a successful credential login is already a fresh authentication event.
    // Never stack the device-lock overlay immediately on top of the login screen.
    // Reload/session restore is intentionally different and still honours a persisted
    // manual lock or the 10-minute inactivity policy.
    this.uid=user.uid;
    localStorage.setItem(this.activityKey(),String(now));
    localStorage.removeItem(this.manualLockKey());
    this.lastActivity=now;
    this.lastPersistedActivity=now;
    this.error.set('');
    this.unlocking.set(false);
    this.locked.set(false);
    this.mode.set(null);
    this.attachActivityListeners();
    this.startTimer();
  }

  private consumeFreshLoginMarker(uid:string){
    if(typeof window==='undefined')return false;
    const key=`pgops-fresh-login:${uid}`;
    try{
      const created=Number(sessionStorage.getItem(key)||0);
      sessionStorage.removeItem(key);
      return created>0&&Date.now()-created<30_000;
    }catch{return false;}
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
  private checkIdle(){if(!this.auth.user()||this.locked())return;if(Date.now()-this.lastActivity>=this.fixedIdleMinutes*60_000)this.lockNow();}

  lockNow(){
    if(!this.auth.user())return;
    this.broadcastSecureUiReset();
    this.unlocking.set(false);
    // Persist before rendering the overlay so refresh/close/reopen cannot unlock it.
    localStorage.setItem(this.manualLockKey(),'1');
    this.locked.set(true);
    this.mode.set(localStorage.getItem(this.pinKey())?'unlock':'setup');
    this.error.set('');
    this.stopTimer();
  }

  async createPin(pin:string,confirm:string){
    this.error.set('');
    if(!/^\d{4,6}$/.test(pin)){this.error.set('Use a 4–6 digit PIN.');return false;}
    if(pin!==confirm){this.error.set('PINs do not match.');return false;}
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const hash=await this.derive(pin,salt,this.iterations);
    const record:PinRecord={v:2,salt:this.b64(salt),hash,iterations:this.iterations,digits:pin.length};
    localStorage.setItem(this.pinKey(),JSON.stringify(record));
    this.clearAttemptState();
    this.unlockSuccess();
    return true;
  }

  async verifyPinForSensitiveAction(pin:string){
    this.error.set('');
    const retryMs=this.remainingLockoutMs();
    if(retryMs>0)throw new Error(`Too many incorrect PIN attempts. Try again in ${Math.ceil(retryMs/1000)} seconds.`);
    if(!/^\d{4,6}$/.test(pin))throw new Error('Enter your 4–6 digit device PIN.');
    const saved=localStorage.getItem(this.pinKey());
    if(!saved)throw new Error('Create a device PIN before deleting PG data.');
    const ok=await this.verifySavedPin(saved,pin);
    if(!ok){this.recordFailedAttempt();throw new Error(this.remainingLockoutMs()>0?'Too many incorrect PIN attempts. Try again later.':'Incorrect device PIN.');}
    this.clearAttemptState();
    return true;
  }


  async tryUnlockAsTyped(pin:string){
    this.error.set('');
    if(!/^\d{0,6}$/.test(pin))return false;
    if(pin.length<4)return false;
    const retryMs=this.remainingLockoutMs();
    if(retryMs>0){this.error.set(`Too many incorrect PIN attempts. Try again in ${Math.ceil(retryMs/1000)} seconds.`);return false;}
    const saved=localStorage.getItem(this.pinKey());
    if(!saved){this.mode.set('setup');this.error.set('Create a device PIN first.');return false;}
    let digits=0;
    try{digits=Number((JSON.parse(saved) as Partial<PinRecord>)?.digits||0);}catch{}
    if(digits&&pin.length<digits)return false;
    if(digits&&pin.length>digits){this.error.set(`PIN is ${digits} digits.`);return false;}
    // Older records did not store their PIN length. Test 4/5 digits silently so a correct
    // legacy PIN still unlocks immediately, but do not count a partial prefix as a failed attempt.
    if(!digits&&pin.length<6){
      const ok=await this.verifySavedPin(saved,pin);
      if(ok){this.clearAttemptState();this.unlockSuccess();return true;}
      return false;
    }
    return this.unlock(pin);
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
    localStorage.setItem(this.pinKey(),JSON.stringify({v:2,salt:this.b64(salt),hash,iterations:this.iterations,digits:pin.length} satisfies PinRecord));
    return true;
  }

  private unlockSuccess(){
    if(this.unlocking())return;
    // Successful PIN verification is the only normal path that clears a manual lock.
    if(this.uid)localStorage.removeItem(this.manualLockKey());
    this.error.set('');
    this.unlocking.set(true);
    this.lastActivity=Date.now();
    this.persistActivity(true);
    // Keep the secure overlay visible briefly so the successful PIN transition feels
    // deliberate instead of flashing straight back to the workspace.
    window.setTimeout(()=>{
      this.locked.set(false);
      this.mode.set(null);
      this.unlocking.set(false);
      this.lastActivity=Date.now();
      this.persistActivity(true);
      this.startTimer();
    },620);
  }

  setIdleMinutes(_minutes:number){
    // Kept for backward compatibility with older UI code. The production policy is fixed at 10 minutes.
    this.idleMinutes.set(this.fixedIdleMinutes);if(this.uid)localStorage.setItem(this.timeoutKey(),String(this.fixedIdleMinutes));this.lastActivity=Date.now();this.persistActivity(true);
  }
  private readIdleMinutes(){return this.fixedIdleMinutes;}

  resetPin(){if(this.uid){localStorage.removeItem(this.pinKey());localStorage.removeItem(this.manualLockKey());this.clearAttemptState();}}
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
  private manualLockKey(){return `pgops-manual-lock:${this.uid}`;}


  private broadcastSecureUiReset(){
    if(typeof window==='undefined')return;
    window.dispatchEvent(new Event('pgops-secure-ui-reset'));
  }

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
