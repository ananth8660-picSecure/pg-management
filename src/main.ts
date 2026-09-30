import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_SELECT_CONFIG } from '@angular/material/select';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

console.info('[PG Management] main.ts loaded');

const host = typeof location !== 'undefined' ? location.hostname : '';
const isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === '::1';

async function cleanLocalServiceWorkerState(){
  if(!isLocalDev || typeof navigator === 'undefined') return;
  try{
    if('serviceWorker' in navigator){
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));
    }
    if(typeof caches !== 'undefined'){
      const keys = await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith('pgops-shell-')).map(key=>caches.delete(key)));
    }
    console.info('[PG Management dev] stale service-worker/cache state cleared');
  }catch(error){
    console.warn('[PG Management dev] local service-worker cleanup skipped', error);
  }
}

void cleanLocalServiceWorkerState();

bootstrapApplication(AppComponent, {providers:[provideRouter(routes),provideAnimationsAsync(),{provide:MAT_SELECT_CONFIG,useValue:{disableOptionCentering:true,overlayPanelClass:'pg-select-overlay-pane'}}]}).then(()=>{
  if('serviceWorker' in navigator && !isLocalDev && location.protocol==='https:'){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/pgops-sw.js',{scope:'/'}).catch(error=>console.warn('[PG Management PWA] Service worker registration skipped',error)),{once:true});
  }
}).catch(error=>{
  console.error('[PG Management bootstrap]', error);
  const root=document.querySelector('app-root');
  if(root){
    root.innerHTML=`<div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f6fb;font-family:Arial,sans-serif"><div style="max-width:620px;padding:24px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 20px 50px rgba(30,41,59,.12)"><b style="display:block;font-size:20px;color:#172033;margin-bottom:8px">PG Management could not start</b><span style="color:#667085;line-height:1.6">A startup error occurred. Run <b>npm run start:fresh</b> once, then refresh this page.</span></div></div>`;
  }
});
