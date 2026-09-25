import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppLockService } from '../core/app-lock.service';
import { AuthService } from '../core/auth.service';
import { Router } from '@angular/router';

@Component({selector:'app-lock-screen',standalone:true,imports:[FormsModule],template:`
@if(lock.locked()){
<div class="lock-overlay">
  <div class="lock-glow g1"></div><div class="lock-glow g2"></div>
  <section class="lock-card">
    <div class="lock-brand"><span>PG</span><div><b>PG Ops</b><small>Private Workspace</small></div></div>
    <div class="lock-icon">🔐</div>
    @if(lock.mode()==='setup'){
      <p class="lock-eyebrow">DEVICE SECURITY</p><h2>Create App Lock PIN</h2>
      <p class="lock-copy">Set a 4–6 digit PIN for this device. After inactivity, PG Ops locks without signing you out.</p>
      <form (ngSubmit)="create()">
        <input class="autofill-username" name="username" type="text" autocomplete="username" [value]="auth.user()?.email || 'pg-ops-user'" tabindex="-1" aria-hidden="true">
        <label>New PIN<input [(ngModel)]="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" placeholder="4–6 digits"></label>
        <label>Confirm PIN<input [(ngModel)]="confirm" name="confirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" placeholder="Repeat PIN"></label>
        @if(lock.error()){<div class="lock-error">{{lock.error()}}</div>}
        <button class="lock-primary" type="submit" [disabled]="busy()">{{busy()?'Securing…':'Create PIN & Continue'}}</button>
      </form>
    } @else {
      <p class="lock-eyebrow">SESSION LOCKED</p><h2>Welcome back, {{auth.user()?.name}}</h2>
      <p class="lock-copy">Your Firebase session is still active. Enter the device PIN to continue.</p>
      <form (ngSubmit)="unlock()">
        <input class="autofill-username" name="username" type="text" autocomplete="username" [value]="auth.user()?.email || 'pg-ops-user'" tabindex="-1" aria-hidden="true">
        <label>App Lock PIN<input #pinInput [(ngModel)]="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="Enter PIN"></label>
        @if(lock.error()){<div class="lock-error">{{lock.error()}}</div>}
        <button class="lock-primary" type="submit" [disabled]="busy()">{{busy()?'Checking…':'Unlock PG Ops'}}</button>
      </form>
      <div class="lock-actions"><button type="button" [disabled]="busy()" (click)="signOutAndReset()">{{busy()?'Signing out…':'Forgot PIN? Sign out securely'}}</button></div>
    }
    <div class="lock-foot"><span></span> Auto-lock after {{lock.idleMinutes()}} minutes idle</div>
  </section>
</div>
}
`,styles:[`
:host{position:relative;z-index:2147483000}.lock-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));overflow:auto;background:radial-gradient(circle at 20% 10%,#243ea8 0,#101842 26%,#080d24 66%,#050816 100%);color:#111827}.lock-overlay:before{content:"";position:fixed;inset:0;background:linear-gradient(120deg,#6d5dfc17,#0ea5e914 45%,#10b98111);pointer-events:none}.lock-glow{position:fixed;border-radius:50%;filter:blur(30px);opacity:.32;pointer-events:none}.g1{width:240px;height:240px;background:#6d5dfc;left:-100px;top:-80px}.g2{width:260px;height:260px;background:#0ea5e9;right:-110px;bottom:-90px}.lock-card{position:relative;width:min(430px,100%);padding:25px;border:1px solid #ffffff35;border-radius:27px;background:linear-gradient(160deg,#ffffff 0,#fbfcff 65%,#f1f6ff 100%);box-shadow:0 36px 100px #0008,inset 0 1px 0 #fff}.lock-brand{display:flex;align-items:center;gap:10px}.lock-brand>span{width:41px;height:41px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#6d5dfc,#0ea5e9 55%,#10b981);color:#fff;font-weight:950;box-shadow:0 10px 24px #6d5dfc40}.lock-brand b,.lock-brand small{display:block}.lock-brand b{font-size:14px}.lock-brand small{font-size:9px;color:#7f8a9c}.lock-icon{width:62px;height:62px;margin:23px 0 15px;border-radius:20px;display:grid;place-items:center;font-size:28px;background:linear-gradient(135deg,#f1efff,#eaf9ff);border:1px solid #e0e5f0;box-shadow:0 12px 30px #28335a10}.lock-eyebrow{margin:0;color:#6254f6;font-size:9px;font-weight:950;letter-spacing:.13em}.lock-card h2{margin:5px 0 7px;font-size:27px;letter-spacing:-.035em}.lock-copy{margin:0 0 18px;color:#667085;font-size:12px;line-height:1.55}.lock-card form{display:grid;gap:12px}.autofill-username{position:absolute!important;inline-size:1px!important;block-size:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important;padding:0!important;border:0!important}.lock-card label{display:grid;gap:6px;font-size:11px;font-weight:850;color:#263247}.lock-card input{height:48px;border:1px solid #dce3ef;border-radius:14px;background:#fbfcff;padding:0 14px;outline:0;font:inherit;font-size:17px;letter-spacing:.18em}.lock-card input:focus{border-color:#6d5dfc;box-shadow:0 0 0 4px #6d5dfc14;background:#fff}.lock-primary{height:48px;border:0;border-radius:14px;background:linear-gradient(135deg,#6d5dfc,#5547ef 55%,#0ea5e9);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 12px 26px #5d52f43d}.lock-primary:disabled{opacity:.55}.lock-error{padding:9px 11px;border:1px solid #fed0d7;border-radius:11px;background:#fff2f4;color:#b4233f;font-size:10px;font-weight:750}.lock-actions{text-align:center;margin-top:12px}.lock-actions button{border:0;background:transparent;color:#68738a;font-size:10px;font-weight:800;cursor:pointer}.lock-actions button:disabled{opacity:.55;cursor:wait}.lock-foot{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:18px;color:#8792a5;font-size:9px}.lock-foot span{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 5px #10b98114}@media(max-width:520px){.lock-card{padding:20px;border-radius:23px}.lock-icon{margin-top:18px}.lock-card h2{font-size:23px}.lock-copy{font-size:11px}}@media(max-height:620px){.lock-overlay{place-items:start center}.lock-card{margin-block:8px}.lock-icon{width:48px;height:48px;margin:10px 0 8px;font-size:22px}.lock-card h2{font-size:21px}.lock-copy{margin-bottom:10px}.lock-card input,.lock-primary{height:42px}}
`]})
export class AppLockComponent{
  pin='';confirm='';busy=signal(false);
  constructor(public lock:AppLockService,public auth:AuthService,private router:Router){}
  async create(){this.busy.set(true);try{if(await this.lock.createPin(this.pin,this.confirm)){this.pin='';this.confirm='';}}finally{this.busy.set(false)}}
  async unlock(){this.busy.set(true);try{if(await this.lock.unlock(this.pin))this.pin='';}finally{this.busy.set(false)}}
  async signOutAndReset(){
    if(this.busy())return;
    this.busy.set(true);
    this.lock.error.set('');
    try{
      // Keep the lock overlay visible until Firebase has fully ended the session.
      // Resetting the PIN first used to expose the dashboard briefly before logout completed.
      await this.auth.logout();
      this.lock.resetPin();
      await this.router.navigateByUrl('/login',{replaceUrl:true});
    }catch(e:any){
      this.lock.error.set(e?.message||'Could not sign out. Please try again.');
    }finally{
      this.busy.set(false);
    }
  }
}
