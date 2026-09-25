import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector:'app-root',
  standalone:true,
  imports:[RouterOutlet],
  template:`
    @if(!auth.ready()){
      <div class="boot-screen"><div class="boot-logo">PG</div><b>Restoring your secure session…</b><small>Please wait while PG Ops checks this device.</small></div>
    } @else {
      <router-outlet/>
    }
  `
})
export class AppComponent{constructor(public auth:AuthService){}}
