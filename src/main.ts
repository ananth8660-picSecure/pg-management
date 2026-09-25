import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

console.info('[PG Ops] main.ts loaded');
bootstrapApplication(AppComponent, {providers:[provideRouter(routes)]}).catch(error=>{
  console.error('[PG Ops bootstrap]', error);
  const root=document.querySelector('app-root');
  if(root){
    root.innerHTML=`<div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f6fb;font-family:Arial,sans-serif"><div style="max-width:620px;padding:24px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 20px 50px rgba(30,41,59,.12)"><b style="display:block;font-size:20px;color:#172033;margin-bottom:8px">PG Ops could not start</b><span style="color:#667085;line-height:1.6">A startup error occurred. Open the browser console and share the first red error. The app no longer fails with a silent blank screen.</span></div></div>`;
  }
});
