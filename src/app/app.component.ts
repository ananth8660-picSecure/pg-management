import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { NativeUpdateService } from './core/native-update.service';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ThemeService } from './core/theme.service';
import { NativeBackService } from './core/native-back.service';
import { NetworkStatusService } from './core/network-status.service';
import { PlatformService } from './core/platform.service';

@Component({
  selector:'app-root',
  standalone:true,
  imports:[RouterOutlet],
  template:`
    @if(!auth.ready()){
      <div class="boot-screen"><div class="boot-main"><div class="boot-logo">PG</div><b>Restoring your secure session…</b><small>Please wait while PG Management checks this device.</small></div><div class="powered-by"><span>Powered by</span><b>PicSecure</b></div></div>
    } @else {
      <router-outlet/>
    }

    @if(updates.available() && updates.release(); as release){
      <div class="native-update-backdrop" role="presentation">
        <section class="native-update-card" role="dialog" aria-modal="true" aria-labelledby="nativeUpdateTitle">
          <div class="native-update-badge">SECURE APP UPDATE</div>
          <button class="native-update-close" type="button" aria-label="Close update" [disabled]="release.mandatory || updates.installing()" (click)="updates.dismiss()">×</button>
          <div class="native-update-icon" aria-hidden="true">↑</div>
          <h2 id="nativeUpdateTitle">{{release.title || 'PG Management update available'}}</h2>
          <p>{{release.message || 'A newer secure build is ready to install.'}}</p>
          <div class="native-update-version"><span>Installed {{updates.currentVersion()}}</span><b>→</b><span>New {{release.version}}</span></div>
          @if(release.releaseNotes?.length){<ul>@for(note of release.releaseNotes; track note){<li>{{note}}</li>}</ul>}
          <div class="native-update-restart-note" role="note">
            <div class="native-update-restart-note-icon" aria-hidden="true">↻</div>
            <div><b>Update & restart</b><span>After installation, PG Management may close briefly. Reopen the app to load the latest changes.</span></div>
          </div>
          <div class="native-update-actions">
            @if(!release.mandatory){<button class="native-update-later" type="button" [disabled]="updates.installing()" (click)="updates.dismiss()">Later</button>}
            <button class="native-update-install" type="button" [disabled]="!release.apkUrl || updates.installing()" (click)="updates.installUpdate()">{{updates.installButtonLabel()}}</button>
          </div>
          @if(updates.installStatus()){<div class="native-update-progress" aria-live="polite"><div><span>{{updates.installStatus()}}</span><b>{{updates.installProgress()}}%</b></div><div class="native-update-progress-track"><i [style.width.%]="updates.installProgress()"></i></div></div>}
          @if(updates.error()){<div class="native-update-error">{{updates.error()}}</div>}
          <small>The APK downloads inside PG Management. Android will only open the secure system installer for your final confirmation; no browser redirect is used.</small>
        </section>
      </div>
    }


    @if(updates.postUpdateMessage()){
      <div class="native-update-success-toast" role="status" aria-live="polite"><div class="native-update-success-icon">✓</div><div><b>Update installed</b><span>{{updates.postUpdateMessage()}}</span></div></div>
    }

    @if(nativeBack.exitHintVisible()){
      <div class="native-back-toast" role="status" aria-live="polite">
        <div class="native-back-toast-icon" aria-hidden="true">←</div>
        <div><b>Press back again to close</b><span>PG Management will stay open unless you press Back once more.</span></div>
      </div>
    }

    @if(network.offline()){
      <div class="network-offline-backdrop" role="presentation">
        <section class="network-offline-card" role="alertdialog" aria-modal="true" aria-labelledby="networkOfflineTitle" aria-describedby="networkOfflineMessage">
          <div class="network-offline-mark" aria-hidden="true">
            <span class="network-offline-wifi">⌁</span>
            <span class="network-offline-slash">/</span>
          </div>
          <div class="network-offline-kicker">CONNECTION LOST</div>
          <h2 id="networkOfflineTitle">No internet connection</h2>
          <p id="networkOfflineMessage">PG Management cannot reach the cloud right now. Check Wi‑Fi or mobile data, and if you use a wired connection, check the network cable.</p>
          <div class="network-offline-status"><i></i><span>Your current screen is kept safe. Cloud actions will resume when the connection returns.</span></div>
          <button class="network-offline-retry" type="button" [disabled]="network.checking()" (click)="network.retry()">
            {{network.checking() ? 'Checking connection…' : 'Check connection'}}
          </button>
          <small>PG Management checks automatically every few seconds.</small>
        </section>
      </div>
    }

    @if(network.restored()){
      <div class="network-online-toast" role="status" aria-live="polite">
        <div class="network-online-icon" aria-hidden="true">✓</div>
        <div><b>Back online</b><span>Connection restored. Refreshing PG Management…</span></div>
      </div>
    }
  `
})
export class AppComponent{
  constructor(public auth:AuthService,public updates:NativeUpdateService,public nativeBack:NativeBackService,public theme:ThemeService,public network:NetworkStatusService,public platform:PlatformService){
    platform.detectOnce();
    if(updates.isNative){
      void StatusBar.setOverlaysWebView({overlay:false}).catch(()=>{});
      void StatusBar.setBackgroundColor({color:'#0F172A'}).catch(()=>{});
      void StatusBar.setStyle({style:Style.Light}).catch(()=>{});
      const splashFallback=setTimeout(()=>void SplashScreen.hide({fadeOutDuration:220}),5000);
      const splashReadyCheck=setInterval(()=>{
        if(this.auth.ready()){
          clearInterval(splashReadyCheck);
          clearTimeout(splashFallback);
          void SplashScreen.hide({fadeOutDuration:220});
        }
      },120);
      setTimeout(()=>{
        clearInterval(splashReadyCheck);
        void updates.checkForUpdate();
      },1200);
    }
  }
}
