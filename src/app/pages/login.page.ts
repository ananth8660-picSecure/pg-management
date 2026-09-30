import { Component, EnvironmentInjector, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { FirebaseService } from '../core/firebase.service';
import { Router } from '@angular/router';

@Component({
  selector:'app-login',
  standalone:true,
  imports:[FormsModule],
  template:`
  <div class="login-page" [class.firebase-live]="fb.configured">
    <section class="login-visual" aria-label="PG Management premium Paying Guest properties"
             (contextmenu)="$event.preventDefault()" (dragstart)="$event.preventDefault()">
      <div class="login-hero-image" role="img" aria-label="Three modern premium Paying Guest buildings with PG management features"></div>
      <div class="login-hero-shade" aria-hidden="true"></div>
      <div class="hero-live-badge" aria-hidden="true">
        <span>●</span> Secure · Reliable · Owner Control
      </div>
    </section>

    <section class="login-panel-wrap">
      <form class="login-card" (ngSubmit)="login()" novalidate>
        <div class="login-card-head">
          <div class="login-status" [class.live]="fb.configured"><i></i>{{fb.configured ? 'Connected to mana-pg' : 'Local demo mode'}}</div>
          <p class="eyebrow">WELCOME BACK</p>
          <h2>Sign in to PG Management</h2>
          <p>{{fb.configured ? 'Use the email and password created in Firebase Authentication.' : 'Use a demo Owner or Manager account.'}}</p>
        </div>

        <label>Email
          <input [(ngModel)]="email" name="email" type="email" autocomplete="username" [placeholder]="fb.configured ? 'you@example.com' : 'owner@demo.local'" inputmode="email">
        </label>
        <label>Password<div class="login-password-field"><input [(ngModel)]="password" name="password" [type]="showPassword()?'text':'password'" autocomplete="current-password" placeholder="Enter password"><button type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword()?'Hide password':'Show password'">{{showPassword()?'Hide':'Show'}}</button></div></label>

        @if(error()){<div class="notice login-error">{{error()}}</div>}

        <button class="primary-btn full login-submit" type="submit" [disabled]="busy()">
          {{busy() ? 'Verifying secure access…' : 'Secure Sign In'}}
        </button>

        @if(!fb.configured){
          <div class="demo-accounts">
            <button type="button" (click)="fillOwner()"><b>Owner Demo</b><span>owner@demo.local · Owner@123</span></button>
            <button type="button" (click)="fillManager()"><b>Manager Demo</b><span>manager@demo.local · Manager@123</span></button>
          </div>
        } @else {
          <div class="firebase-help">
            <b>Firebase access is active</b>
            <span>Authentication verifies identity. PG Management automatically resolves your assigned tenant, role and permissions. No public signup is exposed.</span>
          </div>
        }

        <div class="login-security"><span>🔒</span><small>Private workspace · Role protected · No public tenant access</small></div>
        <div class="login-powered"><span>Powered by</span><b>PicSecure</b></div>
      </form>
    </section>
  </div>
  `,
  styles:[`
    :host{
      display:block;
      width:100%;
      height:100dvh;
      min-height:100dvh;
      overflow:hidden;
      background:#eef3fb;
      color:#111827;
    }
    *,*::before,*::after{box-sizing:border-box}

    .login-page{
      width:100%;
      height:100dvh;
      min-height:100dvh;
      display:grid;
      grid-template-columns:minmax(0,1.18fr) minmax(390px,.82fr);
      overflow:hidden;
      background:#f3f6fb;
    }

    .login-visual{
      position:relative;
      min-width:0;
      min-height:0;
      height:100%;
      overflow:hidden;
      background:#071735;
    }
    .login-hero-image{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      background-image:url('/pg-login-real-buildings.webp');
      background-repeat:no-repeat;
      background-size:cover;
      background-position:center center;
      user-select:none;
      -webkit-user-select:none;
      pointer-events:none;
    }
    .login-hero-shade{
      position:absolute;
      inset:0;
      pointer-events:none;
      background:
        linear-gradient(90deg,rgba(3,10,28,.04),rgba(3,10,28,0) 58%,rgba(3,10,28,.10)),
        linear-gradient(180deg,rgba(4,12,35,.01),rgba(4,12,35,.02) 62%,rgba(4,12,35,.10));
    }
    .hero-live-badge{display:none}

    .login-panel-wrap{
      min-width:0;
      min-height:0;
      height:100%;
      display:grid;
      place-items:center;
      overflow:hidden;
      padding:clamp(20px,3vw,34px);
      background:
        radial-gradient(circle at 50% 14%,rgba(255,255,255,1) 0,rgba(250,252,255,.98) 36%,rgba(239,244,251,.98) 100%);
    }
    .login-card{
      width:min(470px,100%);
      min-width:0;
      display:grid;
      gap:16px;
      padding:30px;
      border:1px solid #e1e7f0;
      border-radius:30px;
      background:rgba(255,255,255,.97);
      box-shadow:0 28px 80px rgba(27,47,87,.14),0 2px 10px rgba(28,53,104,.06),inset 0 1px 0 #fff;
      backdrop-filter:blur(16px);
      -webkit-backdrop-filter:blur(16px);
    }
    .login-card-head{display:grid;gap:5px;min-width:0}
    .login-status{
      width:max-content;
      max-width:100%;
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:6px 10px;
      border-radius:999px;
      background:#f0f2f8;
      color:#68728a;
      font-size:10px;
      font-weight:800;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .login-status.live{background:#e9f9f3;color:#08755a}
    .login-status i{width:7px;height:7px;border-radius:999px;background:#94a3b8;flex:0 0 auto}
    .login-status.live i{background:#10b981;box-shadow:0 0 0 5px #10b98118}
    .eyebrow{margin:4px 0 0;color:#5d55e8;font-size:10px;font-weight:900;letter-spacing:.17em}
    .login-card h2{margin:1px 0 0;font-size:clamp(27px,2.2vw,32px);line-height:1.08;letter-spacing:-.035em;color:#121a2d}
    .login-card-head>p:last-child{margin:0;color:#667085;font-size:13px;line-height:1.5}

    .login-card label{display:grid;gap:7px;min-width:0;color:#202b3d;font-size:12px;font-weight:800}
    .login-card input{
      width:100%;
      min-width:0;
      height:49px;
      padding:0 14px;
      border:1px solid #dbe3ef;
      border-radius:14px;
      outline:none;
      background:#fbfcff;
      color:#111827;
      font:inherit;
      font-weight:600;
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
    }
    .login-card input::placeholder{color:#9aa6b9}
    .login-card input:focus{background:#fff;border-color:#7068f7;box-shadow:0 0 0 4px #6d5dfc16}
    .login-password-field{position:relative;min-width:0}
    .login-password-field input{padding-right:72px}
    .login-password-field button{
      position:absolute;
      right:6px;
      top:6px;
      height:37px;
      padding:0 12px;
      border:0;
      border-radius:10px;
      background:#f1f3f8;
      color:#59657a;
      font-size:9px;
      font-weight:900;
      cursor:pointer;
    }
    .login-submit{min-height:48px;border-radius:14px;font-weight:900}
    .login-error{margin:0;border-radius:13px;line-height:1.45}
    .demo-accounts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .demo-accounts button{min-width:0;border:1px solid #e2e7f0;background:#f9fbff;border-radius:13px;padding:10px;text-align:left;color:#263247}
    .demo-accounts b,.demo-accounts span{display:block}.demo-accounts span{margin-top:3px;color:#667085;font-size:10px;word-break:break-all}
    .firebase-help{display:grid;gap:4px;padding:12px 13px;border:1px solid #dfe7f0;border-radius:14px;background:linear-gradient(135deg,#f7f9ff,#f0fbf9)}
    .firebase-help b{color:#273451;font-size:12px}.firebase-help span{color:#6a7589;font-size:11px;line-height:1.42}
    .login-security{display:flex;justify-content:center;align-items:center;gap:7px;color:#7b8798;text-align:center}.login-security small{font-size:10px}
    .login-powered{display:flex;justify-content:center;align-items:center;gap:6px;padding-top:2px;color:#8893a7;font-size:10px;letter-spacing:.02em}
    .login-powered b{font-size:11px;font-weight:900;background:linear-gradient(90deg,#5b5cf6,#2cb8d8,#28c6a8);-webkit-background-clip:text;background-clip:text;color:transparent}

    /* Compact desktop/laptop heights: keep the desktop split layout while fitting the full card. */
    @media(min-width:1000px) and (max-height:760px){
      .login-panel-wrap{padding:16px 20px}
      .login-card{gap:11px;padding:22px 24px;border-radius:25px}
      .login-card h2{font-size:27px}.login-card-head>p:last-child{font-size:11px}
      .login-card input{height:43px}.login-password-field button{height:31px}
      .login-submit{min-height:43px}.firebase-help{padding:9px 11px}.firebase-help span{font-size:10px}
    }

    /* Tablets: preserve a premium hero, but give the sign-in form priority and never clip it. */
    @media(min-width:768px) and (max-width:999px){
      :host{background:#edf3fb}
      .login-page{
        grid-template-columns:1fr;
        grid-template-rows:minmax(250px,34dvh) minmax(0,1fr);
        padding-top:env(safe-area-inset-top,0px);
        padding-bottom:env(safe-area-inset-bottom,0px);
        background:#edf3fb;
      }
      .login-visual{border-radius:0 0 30px 30px}
      .login-hero-image{background-position:center 34%}
      .login-panel-wrap{align-items:start;padding:0 24px 18px;overflow:visible;background:transparent}
      .login-card{width:min(650px,94vw);margin:-28px auto 0;padding:22px 24px;gap:12px;border-radius:28px;box-shadow:0 22px 60px rgba(20,45,94,.18)}
      .login-card h2{font-size:27px}.login-card-head>p:last-child{font-size:11.5px}
      .login-card input{height:45px}.login-submit{min-height:44px}
    }
    @media(min-width:768px) and (max-width:999px) and (max-height:820px){
      .login-page{grid-template-rows:minmax(190px,27dvh) minmax(0,1fr)}
      .login-card{margin-top:-20px;padding:16px 20px;gap:8px;border-radius:24px}
      .login-card h2{font-size:23px}.login-card-head>p:last-child{font-size:10px}
      .login-card input{height:40px}.login-submit{min-height:40px}
      .firebase-help{padding:7px 9px}.firebase-help span{font-size:9px}.login-security small{font-size:8.5px}
    }

    /* Small screens only: premium login-first canvas. Desktop and big-tablet layouts above stay unchanged. */
    @media(max-width:767px){
      :host{
        background:#0b1f4d;
      }
      .login-page{
        position:relative;
        display:block;
        width:100%;
        height:100dvh;
        min-height:100dvh;
        overflow:hidden;
        padding:
          max(12px,env(safe-area-inset-top,0px))
          max(12px,env(safe-area-inset-right,0px))
          max(12px,env(safe-area-inset-bottom,0px))
          max(12px,env(safe-area-inset-left,0px));
        background:
          radial-gradient(circle at 15% 8%,rgba(53,190,255,.72) 0,rgba(53,190,255,.26) 20%,transparent 42%),
          radial-gradient(circle at 90% 18%,rgba(113,88,255,.78) 0,rgba(113,88,255,.24) 24%,transparent 48%),
          radial-gradient(circle at 12% 92%,rgba(145,99,255,.42) 0,transparent 38%),
          radial-gradient(circle at 88% 90%,rgba(32,211,189,.42) 0,transparent 36%),
          linear-gradient(145deg,#0b2f72 0%,#2f63ff 34%,#7468ff 66%,#1bc7c5 100%);
      }
      .login-page::before,
      .login-page::after{
        content:'';
        position:absolute;
        pointer-events:none;
        border:1px solid rgba(255,255,255,.22);
        border-radius:50%;
        filter:blur(.1px);
      }
      .login-page::before{
        width:72vw;height:72vw;left:-38vw;top:-18vw;
        box-shadow:0 0 90px rgba(255,255,255,.08) inset;
      }
      .login-page::after{
        width:86vw;height:86vw;right:-52vw;bottom:-30vw;
        box-shadow:0 0 100px rgba(255,255,255,.08) inset;
      }
      .login-visual{display:none}
      .login-panel-wrap{
        position:relative;
        z-index:1;
        width:100%;
        height:100%;
        min-height:0;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:visible;
        padding:38px 0 0;
        background:transparent;
      }
      .login-panel-wrap::before{
        content:'PG Management';
        position:absolute;
        top:2px;
        left:50%;
        transform:translateX(-50%);
        width:max-content;
        max-width:92%;
        padding:7px 13px;
        border:1px solid rgba(255,255,255,.24);
        border-radius:999px;
        background:rgba(9,31,74,.28);
        color:#fff;
        box-shadow:0 10px 30px rgba(8,22,54,.18),inset 0 1px 0 rgba(255,255,255,.25);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
        font-size:11px;
        font-weight:900;
        letter-spacing:.02em;
        white-space:nowrap;
      }
      .login-card{
        width:min(430px,calc(100vw - 24px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)));
        max-width:100%;
        min-width:0;
        max-height:none;
        overflow:visible;
        margin:0;
        padding:clamp(15px,4.4vw,21px);
        gap:clamp(8px,1.25vh,12px);
        border:1px solid rgba(255,255,255,.86);
        border-radius:clamp(22px,6.2vw,29px);
        background:rgba(255,255,255,.965);
        box-shadow:0 30px 80px rgba(9,28,74,.34),0 1px 0 rgba(255,255,255,.96) inset;
        backdrop-filter:blur(20px);
        -webkit-backdrop-filter:blur(20px);
        transform-origin:center center;
      }
      .login-card h2{font-size:clamp(21px,5.7vw,27px);line-height:1.08;overflow-wrap:normal;word-break:normal}
      .login-card-head>p:last-child{font-size:clamp(10px,2.85vw,12px);line-height:1.36}
      .login-card label{font-size:11px;gap:5px}
      .login-card input{height:clamp(40px,6vh,47px)}
      .login-password-field button{top:5px;height:calc(100% - 10px)}
      .login-submit{min-height:clamp(40px,6vh,47px)}
      .firebase-help{padding:9px 10px}.firebase-help b{font-size:11px}.firebase-help span{font-size:9.5px;line-height:1.35}
      .login-security small{font-size:8.6px}.login-powered{font-size:8.8px}.login-powered b{font-size:10px}
    }

    /* Height compaction keeps the complete card visible instead of hiding sections. */
    @media(max-width:767px) and (max-height:720px){
      .login-panel-wrap{padding-top:32px}
      .login-card{padding:13px 15px;gap:6px;border-radius:22px}
      .login-status{padding:4px 8px;font-size:8.5px}.eyebrow{font-size:8px;margin-top:1px}
      .login-card h2{font-size:19px}.login-card-head>p:last-child{font-size:9.2px;line-height:1.25}
      .login-card label{font-size:9.5px;gap:3px}.login-card input{height:36px}.login-submit{min-height:36px}
      .firebase-help{padding:6px 8px}.firebase-help b{font-size:9.5px}.firebase-help span{font-size:8.1px;line-height:1.22}
      .login-security{gap:4px}.login-security small{font-size:7.7px}.login-powered{font-size:7.8px;padding-top:0}.login-powered b{font-size:9px}
      .login-panel-wrap::before{font-size:9.5px;padding:5px 10px}
    }
    @media(max-width:767px) and (max-height:610px){
      .login-panel-wrap{padding-top:28px}
      .login-card{padding:10px 12px;gap:4px;border-radius:20px;transform:scale(.92)}
      .login-status{font-size:7.6px;padding:3px 7px}.eyebrow{font-size:7px;margin:0}
      .login-card h2{font-size:17px}.login-card-head>p:last-child{font-size:8px;line-height:1.15}
      .login-card label{font-size:8.5px;gap:2px}.login-card input{height:32px;border-radius:11px}.login-submit{min-height:32px;border-radius:11px}
      .login-password-field button{font-size:7.5px;padding:0 7px}
      .firebase-help{padding:5px 7px}.firebase-help b{font-size:8.5px}.firebase-help span{font-size:7px;line-height:1.15}
      .login-security small{font-size:6.8px}.login-powered{font-size:7px}.login-powered b{font-size:8px}
      .login-panel-wrap::before{font-size:8.8px;padding:4px 9px}
    }
    @media(max-width:767px) and (max-height:520px){
      .login-card{transform:scale(.82)}
    }

    /* Ultra-narrow phones keep safe side gutters and scale rather than clip. */
    @media(max-width:340px){
      .login-page{padding-left:max(8px,env(safe-area-inset-left,0px));padding-right:max(8px,env(safe-area-inset-right,0px))}
      .login-card{width:min(430px,calc(100vw - 16px));padding-left:10px;padding-right:10px}
      .login-card h2{font-size:17px}
      .login-password-field input{padding-right:58px}.login-password-field button{padding:0 7px;font-size:7.5px}
    }
  `]})
export class LoginPage{
  email='';
  password='';
  busy=signal(false);
  showPassword=signal(false);
  error=signal('');
  constructor(private auth:AuthService,public fb:FirebaseService,private router:Router,private readonly injector:EnvironmentInjector){effect(()=>{if(this.auth.ready()&&this.auth.user())void this.router.navigateByUrl('/');},{injector:this.injector});}
  fillOwner(){this.email='owner@demo.local';this.password='Owner@123'}
  fillManager(){this.email='manager@demo.local';this.password='Manager@123'}
  async login(){
    this.error.set('');
    if(!this.email.trim()||!this.password){this.error.set('Enter your Firebase email and password.');return}
    this.busy.set(true);
    try{await this.auth.login(this.email,this.password);await this.router.navigateByUrl('/')}
    catch(e:any){this.error.set(e?.message||'Sign in failed. Please verify your account details.')}
    finally{this.busy.set(false)}
  }
}
