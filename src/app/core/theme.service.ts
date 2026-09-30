import { Injectable, signal } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

export type AppTheme='light'|'dark'|'system';

@Injectable({providedIn:'root'})
export class ThemeService{
  readonly preference=signal<AppTheme>('light');
  readonly resolved=signal<'light'|'dark'>('light');
  private media?:MediaQueryList;
  private readonly mediaHandler=()=>this.apply(this.preference());

  constructor(){
    if(typeof window==='undefined'||typeof document==='undefined')return;
    // Production UI is intentionally light-only for now. Keep any stale dark/system
    // preference from older builds from changing the workspace after the selector is hidden.
    this.preference.set('light');
    localStorage.setItem('pg-management-theme','light');
    this.apply('light');
  }

  setTheme(_theme:AppTheme){
    // Kept for backward compatibility with older callers; appearance is locked to light.
    this.preference.set('light');
    if(typeof localStorage!=='undefined')localStorage.setItem('pg-management-theme','light');
    this.apply('light');
  }

  private apply(theme:AppTheme){
    if(typeof document==='undefined')return;
    const resolved: 'light'|'dark'='light';
    this.resolved.set(resolved);
    document.documentElement.dataset['theme']=resolved;
    document.documentElement.dataset['themePreference']='light';
    document.documentElement.style.colorScheme=resolved;
    if(Capacitor.isNativePlatform()){
      // Keep the status bar intentionally dark in both themes so white system icons always remain visible.
      void StatusBar.setOverlaysWebView({overlay:false}).catch(()=>{});
      void StatusBar.setBackgroundColor({color:'#0F172A'}).catch(()=>{});
      void StatusBar.setStyle({style:Style.Light}).catch(()=>{});
    }
  }
}
