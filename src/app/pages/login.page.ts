import { Component, effect, signal } from '@angular/core';
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
    <section class="login-visual" aria-label="PG Ops premium Paying Guest properties"
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
          <h2>Sign in to PG Ops</h2>
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
            <span>Authentication verifies identity. PG Ops automatically resolves your assigned tenant, role and permissions. No public signup is exposed.</span>
          </div>
        }

        <div class="login-security"><span>🔒</span><small>Private workspace · Role protected · No public tenant access</small></div>
      </form>
    </section>
  </div>
  `,
  styles:[`
    :host{display:block;min-height:100dvh;background:#f3f6fb}
    .login-page{height:100dvh;min-height:100dvh;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(390px,.8fr);background:#f3f6fb;overflow:hidden}
    .login-visual{
      height:100dvh;min-height:0;position:relative;overflow:hidden;
      background:#0b1538;
    }
    .login-hero-image{
      position:absolute;inset:0;width:100%;height:100%;
      background-image:url('/pg-login-real-buildings.webp');
      background-size:cover;background-position:center center;background-repeat:no-repeat;
      display:block;user-select:none;-webkit-user-select:none;pointer-events:none;
    }
    .login-hero-shade{
      position:absolute;inset:0;pointer-events:none;
      background:
        linear-gradient(90deg,rgba(4,10,29,.08),rgba(4,10,29,0) 52%,rgba(4,10,29,.10)),
        linear-gradient(180deg,rgba(5,13,38,.02) 0%,rgba(5,13,38,.04) 60%,rgba(5,13,38,.12) 100%);
    }
    .hero-live-badge{
      position:absolute;z-index:2;top:28px;right:28px;
      display:none;align-items:center;gap:9px;
      padding:10px 14px;border:1px solid rgba(255,255,255,.2);
      border-radius:999px;background:rgba(8,22,57,.46);
      color:#eef4ff;font-size:12px;font-weight:800;
      backdrop-filter:blur(14px);box-shadow:0 12px 34px rgba(0,0,0,.18);
    }
    .hero-live-badge span{color:#6ee7d2;font-size:10px}
    .login-panel-wrap{min-height:100dvh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 50% 20%,#fff 0,#f6f8fc 52%,#eef2f8 100%)}
    .login-card{width:min(460px,100%);display:grid;gap:17px;padding:32px;border:1px solid #e3e8f1;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 28px 80px rgba(26,39,73,.13),inset 0 1px 0 #fff;backdrop-filter:blur(18px)}
    .login-card-head{display:grid;gap:4px}.login-card h2{font-size:31px;letter-spacing:-.035em;margin:2px 0}.login-card-head>p:last-child{margin:0;color:#667085}.login-status{width:max-content;display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:#f0f2f8;color:#68728a;font-size:10px;font-weight:800}.login-status.live{background:#e9f9f3;color:#08755a}.login-status.live i{background:#10b981;box-shadow:0 0 0 5px #10b98118}
    .login-card label{display:grid;gap:7px;font-weight:800;font-size:12px;color:#202b3d}.login-card input{width:100%;height:49px;border:1px solid #dce3ee;border-radius:14px;padding:0 14px;background:#fbfcff;color:#111827;font:inherit;font-weight:600;outline:none;transition:.18s ease}.login-card input::placeholder{color:#9aa6b9}.login-card input:focus{background:#fff;border-color:#7068f7;box-shadow:0 0 0 4px #6d5dfc16}
    .login-password-field{position:relative}.login-password-field input{padding-right:70px}.login-password-field button{position:absolute;right:6px;top:6px;height:37px;padding:0 11px;border:0;border-radius:9px;background:#f1f2f7;color:#59657a;font-size:9px;font-weight:900;cursor:pointer}.login-password-field button:hover{background:#ece9ff;color:#5145cd}
    .login-submit{min-height:48px;border-radius:14px;font-weight:900}.login-error{margin:0;border-radius:13px;line-height:1.45}.demo-accounts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.demo-accounts button{border:1px solid #e2e7f0;background:#f9fbff;border-radius:13px;padding:10px;text-align:left;color:#263247}.demo-accounts b,.demo-accounts span{display:block}.demo-accounts span{font-size:10px;color:#667085;margin-top:3px;word-break:break-all}
    .firebase-help{display:grid;gap:3px;padding:12px 13px;border:1px solid #dfe7f0;border-radius:14px;background:linear-gradient(135deg,#f7f9ff,#f0fbf9)}.firebase-help b{font-size:12px;color:#273451}.firebase-help span{font-size:11px;color:#6a7589;line-height:1.45}.firebase-help code{font-size:10px}.login-security{display:flex;justify-content:center;align-items:center;gap:7px;color:#7b8798;text-align:center}.login-security small{font-size:10px}
    @media(min-width:901px) and (max-height:820px){
      .login-visual{padding:24px 32px;gap:14px}
      .login-brand>span{width:44px;height:44px;border-radius:14px}.login-brand b{font-size:16px}.login-brand small{font-size:11px}
      .building-hero{height:230px;border-radius:22px}.building-hero img{height:100%}.visual-copy h1{font-size:clamp(38px,4.2vw,58px);line-height:1.02;margin:13px 0 10px;max-width:700px}
      .visual-copy p{font-size:14px;line-height:1.5;max-width:620px}
      .visual-grid{gap:9px}.visual-grid div{padding:13px 16px;border-radius:16px}.visual-grid b{font-size:17px}.visual-grid span{font-size:10px}
      .login-panel-wrap{padding:18px}.login-card{padding:27px;gap:13px}.login-card h2{font-size:29px}.login-card input{height:47px}
    }
    @media(min-width:901px) and (max-height:700px){
      .login-visual{padding:18px 24px;gap:10px}
      .building-hero{height:190px;border-radius:20px}.building-hero img{height:100%}.building-hero-overlay small{display:none}.visual-copy{margin:auto 0 4px}.visual-copy h1{font-size:clamp(34px,3.8vw,50px);margin:10px 0 8px}.visual-copy p{font-size:13px;line-height:1.42}
      .visual-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.visual-grid div{padding:9px 12px;border-radius:14px}.visual-grid b{font-size:15px}.visual-grid span{font-size:9px}
    }
    @media(max-width:900px){
      .login-page{display:block;min-height:100dvh;overflow:auto;background:linear-gradient(180deg,#101842 0,#19276d 180px,#f2f5fa 180px)}
      .login-visual{min-height:0;height:auto;padding:20px 20px 82px;gap:22px;justify-content:flex-start;background:transparent;overflow:visible}.login-visual::before,.login-visual::after{display:none}
      .login-brand>span{width:42px;height:42px;border-radius:13px}.login-brand b{font-size:15px}.login-brand small{font-size:10px}
      .building-hero{height:260px;border-radius:20px}.building-hero img{height:100%}.building-hero-overlay small{display:none}.visual-copy{max-width:620px}.secure-chip{font-size:8px;padding:5px 8px}.visual-copy h1{font-size:clamp(28px,6.8vw,40px);line-height:1.06;margin:11px 0 7px;max-width:650px}.visual-copy p{font-size:13px;line-height:1.5;max-width:620px}.visual-grid{display:none}
      .login-panel-wrap{min-height:0;display:block;padding:0 14px 24px;background:transparent}
      .login-card{width:min(620px,100%);margin:-58px auto 0;padding:25px;border-radius:24px;gap:15px;box-shadow:0 24px 60px rgba(9,18,52,.22)}
      .login-card h2{font-size:27px}.login-card input{height:47px}
    }
    @media(max-width:520px){
      .login-page{background:linear-gradient(180deg,#101842 0,#2435a4 158px,#f3f6fb 158px)}
      .login-visual{padding:16px 16px 70px;gap:15px}.login-brand small{max-width:190px}.building-hero{height:205px;border-radius:18px}.building-hero img{height:100%}.building-hero-overlay{left:10px;right:10px;bottom:10px}.building-hero-overlay small{display:none}.visual-copy h1{font-size:27px;max-width:330px}.visual-copy p{display:none}.secure-chip{letter-spacing:.09em}
      .login-panel-wrap{padding:0 10px 16px}.login-card{margin-top:-50px;padding:20px 18px 18px;border-radius:22px;gap:13px}.login-card h2{font-size:25px}.login-card-head>p:last-child{font-size:12px}.login-card input{height:46px}.firebase-help{padding:10px 11px}.login-security{padding-top:1px}
    }
    @media(max-width:380px){
      .login-visual{padding-inline:14px}.visual-copy h1{font-size:25px}.login-card{padding-inline:15px}.login-card h2{font-size:23px}.login-status{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    }
    @media(max-height:650px) and (max-width:520px){
      .login-visual{padding-top:12px;padding-bottom:58px}.visual-copy h1{font-size:23px;margin-top:8px}.login-card{margin-top:-44px;padding-top:16px;padding-bottom:14px;gap:10px}.login-card h2{font-size:22px}.login-card input{height:42px}.firebase-help{padding-block:8px}.login-security{display:none}
    }

    @media(max-width:900px){
      .login-page{display:block;min-height:100dvh;overflow:auto;background:#f3f6fb}
      .login-visual{height:340px;min-height:340px}
      .login-hero-image{background-position:center 52%}
      .login-panel-wrap{min-height:0;display:block;padding:0 14px 24px;background:#f3f6fb}
      .login-card{width:min(620px,100%);margin:-34px auto 0;position:relative;z-index:3}
    }
    @media(max-width:520px){
      .login-visual{height:260px;min-height:260px}
      .login-hero-image{background-position:center 54%}
      .login-panel-wrap{padding:0 10px 16px}
      .login-card{margin-top:-26px}
    }

    /* R49 — mobile login must fit one viewport without page scrolling */
    @media(max-width:900px){
      :host{height:100dvh;min-height:100dvh;overflow:hidden}
      .login-page{height:100dvh;min-height:100dvh;overflow:hidden;display:grid;grid-template-rows:minmax(150px,34dvh) minmax(0,1fr);background:#f3f6fb}
      .login-visual{height:auto!important;min-height:0!important;padding:0!important;overflow:hidden!important}
      .login-hero-image{background-position:center 53%}
      .login-panel-wrap{height:100%;min-height:0;display:flex;align-items:flex-start;justify-content:center;padding:0 12px 10px;background:#f3f6fb;overflow:hidden}
      .login-card{width:min(620px,100%);max-height:calc(66dvh - 8px);overflow:hidden;margin:-22px auto 0;padding:18px 18px 14px;border-radius:22px;gap:10px;align-self:flex-start}
      .login-card h2{font-size:24px;margin:0}.login-card-head{gap:2px}.login-card-head>p:last-child{font-size:11px;line-height:1.35}
      .login-status{padding:5px 9px}.login-card label{gap:5px;font-size:11px}.login-card input{height:43px;border-radius:12px}
      .login-password-field button{height:33px;top:5px}.login-submit{min-height:43px}
      .firebase-help{padding:8px 10px;border-radius:12px}.firebase-help b{font-size:11px}.firebase-help span{font-size:9.5px;line-height:1.35}
      .login-security{gap:5px}.login-security small{font-size:9px}
    }
    @media(max-width:520px){
      .login-page{grid-template-rows:minmax(128px,31dvh) minmax(0,1fr)}
      .login-card{max-height:calc(69dvh - 6px);margin-top:-18px;padding:15px 14px 12px;gap:8px;border-radius:20px}
      .login-card h2{font-size:22px}.login-card-head>p:last-child{font-size:10.5px}
      .login-card input{height:41px}.login-submit{min-height:41px}
      .firebase-help{padding:7px 9px}.login-security small{font-size:8.5px}
    }
    @media(max-width:390px),(max-height:680px) and (max-width:900px){
      .login-page{grid-template-rows:minmax(112px,28dvh) minmax(0,1fr)}
      .login-card{max-height:calc(72dvh - 4px);margin-top:-14px;padding:12px 13px 10px;gap:7px}
      .login-card h2{font-size:20px}.login-card-head>p:last-child{display:none}
      .login-card input{height:39px}.login-submit{min-height:39px}
      .firebase-help span{display:none}.firebase-help{padding:6px 8px}.login-security{display:none}
    }
  `]
})
export class LoginPage{
  email='';
  password='';
  busy=signal(false);
  showPassword=signal(false);
  error=signal('');
  constructor(private auth:AuthService,public fb:FirebaseService,private router:Router){effect(()=>{if(this.auth.ready()&&this.auth.user())void this.router.navigateByUrl('/');});}
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
