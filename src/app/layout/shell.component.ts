import { Component, EnvironmentInjector, HostListener, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { IconComponent } from '../shared/icon.component';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { FirebaseService } from '../core/firebase.service';
import { APP_CONFIG } from '../config/app-config';
import { PagePermission } from '../core/models';
import { AppLockService } from '../core/app-lock.service';
import { FileStorageService } from '../core/file-storage.service';
import { NotificationService } from '../core/notification.service';
import { ResidentPhotoService } from '../core/resident-photo.service';
import { AppLockComponent } from '../shared/app-lock.component';
import { ThemeService } from '../core/theme.service';
import { environment } from '../../environments/environment';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PlatformService } from '../core/platform.service';
@Component({selector:'app-shell',standalone:true,imports:[RouterLink,RouterLinkActive,RouterOutlet,FormsModule,MatSelectModule,IconComponent,AppLockComponent],template:`
<div class="app-shell" [class.nav-open]="navOpen()">
 <aside class="sidebar">
  <div class="brand"><div class="brand-mark">@if(logoUrl()){<img [src]="logoUrl()" alt="PG logo">}@else{<span>{{brandInitial}}</span>}</div><div><strong>{{auth.tenant()?.shortName||config.property.shortName}}</strong><small>{{auth.tenant()?.city||'Private PG Workspace'}}</small></div><button class="drawer-close" (click)="navOpen.set(false)" aria-label="Close menu">×</button></div>
  <div class="drawer-label">Operations</div>
  <nav>
   @for(item of visibleNav;track item.path){<a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{exact:item.path==='/' }" (click)="navOpen.set(false)"><span class="nav-icon"><app-icon [name]="item.icon"/></span><span>{{item.label}}</span>@if(item.path==='/vacancy'){<em>{{store.vacantBeds().length}}</em>}@else if(item.badge){<em>{{item.badge}}</em>}</a>}
  </nav>
  <div class="sidebar-foot">
   <div class="property-mini"><b>{{auth.tenant()?.name||config.property.name}}</b><span>{{store.blocks().length}} Blocks · {{store.totalFloors()}} Floors</span></div><div class="sidebar-version"><span>PG Management</span><b>v{{appVersion()}}</b></div><small>Private Operations · {{store.role()==='owner'?'Owner Control':'Manager Workspace'}}</small>
  </div>
 </aside>
 <main class="main">
  <header class="topbar">
   <button class="mobile-menu" (click)="navOpen.set(true)" aria-label="Open menu"><app-icon name="menu"/></button>
   <div class="mobile-app-title"><span class="mini-app-mark">@if(logoUrl()){<img [src]="logoUrl()" alt="PG logo">}@else{<span>{{brandInitial}}</span>}</span><div><b>{{auth.tenant()?.shortName||config.property.shortName}}</b><small>{{store.role()==='owner'?'Owner':'Manager'}}</small></div></div>
   @if(canUseGlobalSearch()){<div class="searchbox smart-searchbox"><app-icon name="search"/><input [(ngModel)]="search" (input)="doSearch()" placeholder="Search resident, room number, floor..."><button type="button" class="search-filter-toggle" [class.active]="propertyExplorerOpen()" (click)="$event.stopPropagation();propertyExplorerOpen.set(!propertyExplorerOpen())">Filters</button><kbd>Ctrl K</kbd>
    @if(search.trim() && (results().length||roomSearchResults().length||floorSearchResults().length)){<div class="search-results universal-search-results">
      @for(room of roomSearchResults();track room.id){<button class="search-property-card" type="button" (click)="openRoomExplorer(room.id)"><span class="search-kind">ROOM</span><div><b>Room {{room.number}} · {{blockName(room.blockId)}}</b><small>{{floorName(room.floor)}} · {{room.sharing}} Sharing · {{vacantRoomBeds(room)}} vacant</small></div></button>}
      @for(f of floorSearchResults();track f.key){<button class="search-property-card" type="button" (click)="openFloorExplorer(f.blockId,f.floor)"><span class="search-kind">FLOOR</span><div><b>{{blockName(f.blockId)}} · {{floorName(f.floor)}}</b><small>{{f.rooms}} rooms · {{f.vacant}} vacant beds</small></div></button>}
      @for(r of results();track r.id){<button class="search-person-card" type="button" (click)="selectedResidentId.set(r.id)">@if(residentPhotos.photo(r);as photo){<span class="avatar resident-avatar-image"><img [src]="photo" alt="{{r.name}} profile photo"></span>}@else{<span class="avatar">{{r.photo}}</span>}<div><b>{{r.name}}</b><small>{{r.id}} · {{r.mobile}} · {{activeRoomFor(r)}}</small></div></button>}
    </div>}
    @if(propertyExplorerOpen()){<div class="property-explorer" (click)="$event.stopPropagation()"><div class="explorer-head"><div><span class="filter-tag">FILTERS</span><b>Property Explorer</b><small>Block → floor → room → bed, rent, vacancy & repairs</small></div><button type="button" class="modal-x" (click)="propertyExplorerOpen.set(false)">×</button></div><div class="explorer-filters"><label>Block<mat-select class="pg-premium-select" panelClass="pg-premium-select-panel" [(ngModel)]="explorerBlock" (ngModelChange)="explorerFloor='all';explorerRoom='all'"><mat-option value="all">All Blocks</mat-option>@for(b of store.blocks();track b.id){<mat-option [value]="b.id">{{b.name}}</mat-option>}</mat-select></label><label>Floor<mat-select class="pg-premium-select" panelClass="pg-premium-select-panel" [(ngModel)]="explorerFloor" (ngModelChange)="explorerRoom='all'"><mat-option value="all">All Floors</mat-option>@for(f of explorerFloorOptions();track f){<mat-option [value]="f">{{floorName(f)}}</mat-option>}</mat-select></label><label>Room<mat-select class="pg-premium-select" panelClass="pg-premium-select-panel" [(ngModel)]="explorerRoom"><mat-option value="all">All Rooms</mat-option>@for(r of explorerRoomOptions();track r.id){<mat-option [value]="r.id">Room {{r.number}}</mat-option>}</mat-select></label></div><div class="explorer-summary"><article><span>Rooms</span><b>{{explorerRooms().length}}</b></article><article><span>Vacancies</span><b>{{explorerVacancies()}}</b></article><article><span>Rent attention</span><b>{{explorerUnpaidCount()}}</b></article><article><span>Open repairs</span><b>{{explorerRepairCount()}}</b></article></div><div class="explorer-room-grid">@for(room of explorerRooms();track room.id){<article class="explorer-room-card" [class.highlight]="explorerRoom===room.id"><div class="erc-head"><div><span>{{blockName(room.blockId)}} · {{floorName(room.floor)}}</span><b>Room {{room.number}}</b><small>{{room.sharing}} Sharing · {{room.ac?'AC':'Non-AC'}} · {{room.attachedBath?'Attached Bath':'Common Bath'}}</small></div><strong>{{vacantRoomBeds(room)}} vacant</strong></div><div class="erc-alerts">@if(store.unpaidForRoom(room.id).length){<span class="due">{{store.unpaidForRoom(room.id).length}} rent due</span>}@if(store.repairsForRoom(room).length){<span class="repair">{{store.repairsForRoom(room).length}} repair</span>}@if(!store.unpaidForRoom(room.id).length&&!store.repairsForRoom(room).length){<span class="ok">No attention needed</span>}</div><div class="erc-beds">@for(bed of room.beds;track bed.id){<button type="button" [class.free]="bed.status==='vacant'" (click)="bed.residentId&&selectedResidentId.set(bed.residentId)"><b>{{bed.label}}</b><small>{{bedResidentName(bed.id)||'Vacant'}}</small><em>{{bedRentLabel(room,bed.id)}}</em></button>}</div>@if(store.unpaidForRoom(room.id).length){<div class="erc-unpaid"><b>Rent attention</b>@for(d of store.unpaidForRoom(room.id);track d.residentId){<button type="button" (click)="selectedResidentId.set(d.residentId)">{{d.residentName}} · ₹{{d.balance.toLocaleString('en-IN')}} · {{d.status}}</button>}</div>}</article>}@empty{<div class="explorer-empty">No rooms match these filters.</div>}</div></div>}
   </div>}@else{<div class="restricted-search-context"><b>{{auth.tenant()?.name}}</b><small>{{store.role()==='owner'?'Owner workspace':'Assigned manager workspace'}}</small></div>}
   <div class="top-actions"><span class="sync-pill" [class.live]="fb.configured">{{fb.configured ? (store.syncState()==='synced'?'Cloud Connected':'Syncing…') : 'Demo Mode'}}</span><button class="icon-btn app-lock-btn" type="button" (click)="lockNow()" [attr.title]="platform.shortcutLabel() ? 'Lock PG Management now · ' + platform.shortcutLabel() : 'Lock PG Management now'" aria-label="Lock PG Management now"><app-icon name="lock"/><span class="app-lock-label">Lock</span>@if(platform.shortcutLabel()){<kbd class="app-lock-shortcut">{{platform.shortcutLabel()}}</kbd>}</button>@if(store.canAccess('notifications')){<a class="icon-btn" routerLink="/notifications" aria-label="Notifications"><app-icon name="bell"/>@if(notificationCount){<span class="dot">{{notificationCount}}</span>}</a>}<div class="profile-menu-wrap account-zone"><button class="profile profile-btn account-trigger" type="button" (click)="$event.stopPropagation();profileOpen.set(!profileOpen())" [attr.aria-expanded]="profileOpen()" aria-haspopup="menu" aria-label="Open account menu"><span class="avatar lg">{{initials}}</span><div class="account-trigger-copy"><b>{{auth.user()?.name}}</b><small>{{store.role()==='owner'?'Owner':'Manager'}} · Account</small></div><span class="account-chevron" [class.open]="profileOpen()">⌄</span></button>@if(profileOpen()){<div class="profile-menu compact-account-menu" role="menu" (click)="$event.stopPropagation()"><div class="profile-menu-head"><span class="avatar">{{initials}}</span><div><b>{{auth.user()?.name}}</b><small>{{auth.user()?.email}}</small><div class="profile-menu-role"><span>{{store.role()==='owner'?'Owner · Full PG Access':'Manager · Assigned Access'}}</span><span class="tenant">{{auth.tenant()?.shortName||auth.tenant()?.name}}</span></div></div></div><a class="profile-menu-link primary-account-link" routerLink="/profile" (click)="profileOpen.set(false)"><app-icon name="users"/><span><b>{{store.role()==='owner'?'Profile & Access':'My Profile'}}</b><small>{{store.role()==='owner'?'Account, Owners, Managers & permissions':'My account, security & assigned access'}}</small></span></a>@if(auth.isOwner()){<a class="profile-menu-link data-vault-menu-link" routerLink="/data-vault" (click)="profileOpen.set(false)"><app-icon name="archive"/><span><b>Data Vault & Recovery</b><small>Export, read backup & securely delete PG data</small></span></a>}<div class="profile-menu-divider"></div><button class="signout premium-signout" (click)="requestLogout()"><app-icon name="logout"/><span><b>Logout</b><small>Securely end this session</small></span></button></div>}</div></div>
  </header>
  @if(store.canAccess('activity')){@if(store.latestAudit(); as change){<div class="global-change-strip"><span class="change-dot"></span><b>{{change.actorRole==='owner'?'Owner':'Manager'}} {{change.actorName}}</b><span>{{change.action}}</span><time>{{formatChange(change.createdAt)}}</time></div>}}
  <section class="content">@if(!appLock.locked() && !logoutConfirmOpen() && !loggingOut()){<router-outlet/>}</section>
  <footer class="app-footer">
   <div class="footer-brand"><span class="footer-mark">{{brandInitial}}</span><div><b>{{auth.tenant()?.name||config.property.name}}</b><small>Private operations workspace</small></div></div>
   <div class="footer-meta"><span><i class="footer-dot"></i>{{fb.configured ? 'Cloud connected' : 'Local mode'}}</span><span>{{store.role()==='owner' ? 'Owner Control' : 'Manager Workspace'}}</span><span>{{store.rooms().length}} Rooms · {{store.vacantBeds().length}} Vacant beds</span></div>
   <div class="footer-end"><small>Powered by</small><b>PicSecure</b></div>
  </footer>
  <nav class="mobile-bottom-nav" aria-label="Primary mobile navigation">
    @if(store.canAccess('dashboard')){<a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}"><span><app-icon name="grid"/></span><small>Home</small></a>}
    @if(store.canAccess('residents')){<a routerLink="/residents" routerLinkActive="active"><span><app-icon name="users"/></span><small>Residents</small></a>}
    @if(store.canAccess('vacancy')){<a routerLink="/vacancy" routerLinkActive="active"><span class="nav-badge-wrap"><app-icon name="bed"/>@if(store.vacantBeds().length){<i>{{store.vacantBeds().length}}</i>}</span><small>Vacancy</small></a>}
    @if(store.canAccess('payments')){<a routerLink="/payments" routerLinkActive="active"><span><app-icon name="wallet"/></span><small>Rent</small></a>}
    <button type="button" [class.active]="navOpen()" (click)="navOpen.set(true)"><span><app-icon name="menu"/></span><small>More</small></button>
  </nav>
 </main>
 @if(navOpen()){<button class="scrim" (click)="navOpen.set(false)" aria-label="Close menu"></button>}
 @if(selectedResident(); as resident){<div class="modal-backdrop" (click)="selectedResidentId.set('')"><section class="resident-quick-card" (click)="$event.stopPropagation()"><button class="modal-x" type="button" (click)="selectedResidentId.set('')">×</button><div class="rq-head">@if(residentPhotos.photo(resident);as photo){<span class="avatar lg resident-avatar-image"><img [src]="photo" alt="{{resident.name}} profile photo"></span>}@else{<span class="avatar lg">{{resident.photo}}</span>}<div><p class="eyebrow">RESIDENT DETAILS</p><h2>{{resident.name}}</h2><small>{{resident.id}} · {{resident.mobile}}</small></div></div><div class="rq-grid"><div><span>Room / Bed</span><b>{{activeRoomFor(resident)}}</b></div><div><span>Billing</span><b>{{resident.billingCycle==='daily'?'Daily':'Monthly'}}</b></div><div><span>Rent</span><b>₹{{(resident.billingCycle==='daily'?(resident.dailyRate||0):resident.monthlyRent).toLocaleString('en-IN')}} {{resident.billingCycle==='daily'?'/ day':'/ month'}}</b></div><div><span>Due day</span><b>{{resident.billingCycle==='daily'?'Daily':store.ordinal(resident.rentDueDay)}}</b></div><div><span>Deposit</span><b>₹{{resident.deposit.toLocaleString('en-IN')}}</b></div><div><span>Status</span><b>{{resident.status}}</b></div></div><a class="primary-btn rq-open" routerLink="/residents" (click)="selectedResidentId.set('');propertyExplorerOpen.set(false)">Open Residents</a></section></div>}
 @if(logoutConfirmOpen()){
<div class="modal-backdrop account-confirm-backdrop" (click)="cancelLogout()">
  <section class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle" aria-describedby="logoutConfirmDesc" (click)="$event.stopPropagation()">
    <button class="logout-x" type="button" (click)="cancelLogout()" aria-label="Close logout confirmation">×</button>

    <div class="logout-icon-wrap" aria-hidden="true"><app-icon name="logout"/></div>
    <p class="logout-kicker">SECURE SIGN OUT</p>
    <h2 id="logoutConfirmTitle">Sign out of PG Management?</h2>
    <p id="logoutConfirmDesc" class="logout-copy">You’ll be signed out on this device. Any unsaved changes on the current screen may be lost.</p>

    <div class="logout-account-card">
      <span class="avatar logout-avatar">{{initials}}</span>
      <div class="logout-account-copy">
        <b>{{auth.user()?.name}}</b>
        <small>{{auth.tenant()?.name}} · {{store.role()==='owner'?'Owner':'Manager'}}</small>
      </div>
      <span class="logout-session-chip">This device</span>
    </div>

    <div class="logout-note"><span class="logout-note-dot"></span><span>Your Firebase session will be securely ended.</span></div>

    <div class="logout-actions">
      <button class="logout-stay-btn" type="button" [disabled]="loggingOut()" (click)="cancelLogout()">Stay signed in</button>
      <button class="logout-confirm-btn" type="button" [disabled]="loggingOut()" [attr.aria-busy]="loggingOut()" (click)="confirmLogout()">
        @if(loggingOut()){<span class="logout-spinner" aria-hidden="true"></span><span>Signing out…</span>}@else{<app-icon name="logout"/><span>Sign out</span>}
      </button>
    </div>
  </section>
</div>
}
<app-lock-screen/></div>`})
export class ShellComponent{
 navOpen=signal(false);profileOpen=signal(false);logoutConfirmOpen=signal(false);loggingOut=signal(false);propertyExplorerOpen=signal(false);selectedResidentId=signal('');search='';results=signal<any[]>([]);explorerBlock='all';explorerFloor='all';explorerRoom='all';readonly config=APP_CONFIG;readonly appVersion=signal(environment.nativeApp.version&&environment.nativeApp.version!=='0.0.0'?environment.nativeApp.version:'—');
 nav:{path:string,label:string,icon:string,permission:PagePermission,badge?:string}[]=[
  {path:'/',label:'Dashboard',icon:'grid',permission:'dashboard'},
  {path:'/property',label:'Blocks, Floors & Rooms',icon:'building',permission:'property'},
  {path:'/amenities',label:'Floor & Room Setup',icon:'sliders',permission:'amenities'},
  {path:'/residents',label:'Residents',icon:'users',permission:'residents'},
  {path:'/vacancy',label:'Bed Vacancy',icon:'bed',permission:'vacancy'},
  {path:'/payments',label:'Rent & Receipts',icon:'wallet',permission:'payments'},
  {path:'/food',label:'Kitchen & Meals',icon:'utensils',permission:'food'},
  {path:'/staff',label:'Staff Management',icon:'badge',permission:'staff'},
  {path:'/maintenance',label:'Repairs & Maintenance',icon:'wrench',permission:'maintenance'},
  {path:'/assets',label:'Asset Inventory',icon:'archive',permission:'assets'},
  {path:'/utilities',label:'Utilities & Bills',icon:'zap',permission:'utilities'},
  {path:'/expenses',label:'Expense Ledger',icon:'receipt',permission:'expenses'},
  {path:'/vendors',label:'Vendors & Purchases',icon:'cart',permission:'vendors'},
  {path:'/calendar',label:'Tasks & Calendar',icon:'calendar',permission:'calendar'},
  {path:'/reports',label:'Reports & Exports',icon:'chart',permission:'reports'},
  {path:'/documents',label:'Secure Documents',icon:'folder',permission:'documents'},
  {path:'/notifications',label:'Alerts & Notifications',icon:'bell',permission:'notifications'},
  {path:'/activity',label:'Audit Trail',icon:'history',permission:'activity'},
  {path:'/settings',label:'PG Settings & Access',icon:'settings',permission:'settings'}];
 get visibleNav(){return this.nav.filter(item=>this.store.canAccess(item.permission));}
 get notificationCount(){return Math.min(99,this.notifications.unreadCount());}
 logoUrl=signal('');private previousLogo='';
 private touchStartX=0;private touchStartY=0;private touchStartAt=0;private touchTracking=false;private touchMode:'none'|'drawer'|'page'='none';private pageSwipeNavigating=false;
 constructor(public store:StoreService,public auth:AuthService,public fb:FirebaseService,public appLock:AppLockService,private files:FileStorageService,public notifications:NotificationService,public residentPhotos:ResidentPhotoService,public theme:ThemeService,public platform:PlatformService,private router:Router,private readonly injector:EnvironmentInjector){void this.loadAppVersion();effect(()=>{if(this.appLock.locked()||!auth.user())this.resetTransientUi();if(auth.ready()&&!auth.user()){void this.router.navigateByUrl('/login',{replaceUrl:true});return;}const logo=auth.tenant()?.logo;const path=logo?.path||'';if(!path||path===this.previousLogo){if(!path){const old=this.logoUrl();if(old.startsWith('blob:'))URL.revokeObjectURL(old);this.logoUrl.set('');}return;}this.previousLogo=path;void this.files.open(path,logo?.url,logo?.encryption).then(url=>{const old=this.logoUrl();if(old.startsWith('blob:')&&old!==url)URL.revokeObjectURL(old);this.logoUrl.set(url);}).catch(()=>this.logoUrl.set(''));},{injector:this.injector});}

 private async loadAppVersion(){
  try{
   if(Capacitor.isNativePlatform()){
    const info=await App.getInfo();
    const version=String(info.version||'').trim();
    if(version){this.appVersion.set(version);return;}
   }
   const response=await fetch('/app-release.json',{cache:'no-store'});
   if(response.ok){const release=await response.json() as {version?:string};const version=String(release?.version||'').trim();if(version){this.appVersion.set(version);return;}}
  }catch(e){console.warn('[PG Management] Unable to resolve runtime version',e);}
  const fallback=String(environment.nativeApp.version||'').trim();
  this.appVersion.set(fallback&&fallback!=='0.0.0'?fallback:'Web');
 }
 get brandInitial(){return (this.auth.tenant()?.shortName||'PG').trim().charAt(0).toUpperCase()||'P';}
 get initials(){return (this.auth.user()?.name||'PG').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
 private resetTransientUi(){
  this.navOpen.set(false);this.profileOpen.set(false);this.propertyExplorerOpen.set(false);this.selectedResidentId.set('');this.search='';this.results.set([]);
 }
 lockNow(){this.resetTransientUi();this.appLock.lockNow();}
 requestLogout(){this.resetTransientUi();this.logoutConfirmOpen.set(true);}
 cancelLogout(){if(!this.loggingOut())this.logoutConfirmOpen.set(false);}
 async confirmLogout(){if(this.loggingOut())return;this.resetTransientUi();this.loggingOut.set(true);try{try{await this.notifications.removeCurrentDeviceToken();}catch(e){console.warn('[PG Management] Push token cleanup skipped during sign out',e);}await this.auth.logout();this.logoutConfirmOpen.set(false);this.propertyExplorerOpen.set(false);this.navOpen.set(false);await this.router.navigateByUrl('/login',{replaceUrl:true});}catch(e){console.error('[PG Management] Sign out failed',e);}finally{this.loggingOut.set(false);}}
 async logout(){this.requestLogout();}
 canUseGlobalSearch(){return this.store.canAccess('residents')||this.store.canAccess('property')||this.store.canAccess('vacancy');}
 doSearch(){this.results.set(this.store.search(this.search));}
 blockName(id:string){return this.store.blocks().find(b=>b.id===id)?.name||`Block ${id}`;}
 floorName(f:number){if(f===0)return'Ground Floor';const n=f%100;if(n>=11&&n<=13)return`${f}th Floor`;switch(f%10){case 1:return`${f}st Floor`;case 2:return`${f}nd Floor`;case 3:return`${f}rd Floor`;default:return`${f}th Floor`;}}
 vacantRoomBeds(room:any){return room.beds.filter((b:any)=>b.status==='vacant').length;}
 activeRoomFor(r:any){const s=r.stays?.find((x:any)=>x.active);return s?`${s.roomId} · ${String(s.bedId).split('-').pop()}`:'No active room';}
 roomSearchResults(){const q=this.search.trim().toLowerCase();if(!q)return[];return this.store.rooms().filter(r=>r.number.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)||this.blockName(r.blockId).toLowerCase().includes(q)).slice(0,6);}
 floorSearchResults(){const q=this.search.trim().toLowerCase();if(!q)return[] as any[];const out:any[]=[];for(const b of this.store.blocks())for(let f=0;f<b.floors;f++){const label=this.floorName(f).toLowerCase();if(label.includes(q)||String(f)===q){const rooms=this.store.rooms().filter(r=>r.blockId===b.id&&r.floor===f);out.push({key:`${b.id}-${f}`,blockId:b.id,floor:f,rooms:rooms.length,vacant:rooms.reduce((n,r)=>n+this.vacantRoomBeds(r),0)});}}return out.slice(0,6);}
 explorerFloorOptions(){const rooms=this.store.rooms().filter(r=>this.explorerBlock==='all'||r.blockId===this.explorerBlock);return [...new Set(rooms.map(r=>r.floor))].sort((a,b)=>a-b);}
 explorerRoomOptions(){return this.store.rooms().filter(r=>(this.explorerBlock==='all'||r.blockId===this.explorerBlock)&&(this.explorerFloor==='all'||String(r.floor)===this.explorerFloor)).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));}
 explorerRooms(){return this.explorerRoomOptions().filter(r=>this.explorerRoom==='all'||r.id===this.explorerRoom);}
 explorerVacancies(){return this.explorerRooms().reduce((n,r)=>n+this.vacantRoomBeds(r),0);}
 explorerUnpaidCount(){return this.explorerRooms().reduce((n,r)=>n+this.store.unpaidForRoom(r.id).length,0);}
 explorerRepairCount(){return this.explorerRooms().reduce((n,r)=>n+this.store.repairsForRoom(r).length,0);}
 bedResidentName(bedId:string){return this.store.residentForBed(bedId)?.name||'';}
 bedRentLabel(room:any,bedId:string){const resident=this.store.residentForBed(bedId),amount=this.store.bedRent(room,bedId);return amount>0?`₹${amount.toLocaleString('en-IN')} ${resident?.billingCycle==='daily'?'/day':'/month'}`:'Rate not set';}
 selectedResident(){return this.store.residents().find(r=>r.id===this.selectedResidentId())||null;}
 openRoomExplorer(roomId:string){const r=this.store.rooms().find(x=>x.id===roomId);if(!r)return;this.propertyExplorerOpen.set(true);this.explorerBlock=r.blockId;this.explorerFloor=String(r.floor);this.explorerRoom=r.id;this.search='';this.results.set([]);}
 openFloorExplorer(blockId:string,floor:number){this.propertyExplorerOpen.set(true);this.explorerBlock=blockId;this.explorerFloor=String(floor);this.explorerRoom='all';this.search='';this.results.set([]);}
 formatChange(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString();}
 @HostListener('window:pgops-native-back',['$event']) onNativeBack(event:CustomEvent<{handled:boolean}>){
  if(this.logoutConfirmOpen()){this.cancelLogout();event.detail.handled=true;return;}
  if(this.selectedResidentId()){this.selectedResidentId.set('');event.detail.handled=true;return;}
  if(this.propertyExplorerOpen()){this.propertyExplorerOpen.set(false);event.detail.handled=true;return;}
  if(this.profileOpen()){this.profileOpen.set(false);event.detail.handled=true;return;}
  if(this.navOpen()){this.navOpen.set(false);event.detail.handled=true;return;}
  if(this.search.trim()){this.search='';this.results.set([]);event.detail.handled=true;return;}
 }
 @HostListener('window:pgops-secure-ui-reset') onSecureUiReset(){this.resetTransientUi();}
 private swipeBlockedTarget(target:HTMLElement|null){
  return !!target?.closest('.lock-overlay,.modal-backdrop,.property-explorer,.cdk-overlay-container,.profile-menu,.search-results,input,textarea,select,button,a,[contenteditable="true"],[role="slider"],[role="tablist"],.mat-mdc-select,.table-wrap,.table-scroll,.data-table-wrap,.horizontal-scroll,.carousel,.tabs,.segmented-control');
 }
 private currentNavIndex(){
  const clean=this.router.url.split(/[?#]/,1)[0]||'/';
  return this.visibleNav.findIndex(item=>item.path===clean);
 }
 private async navigateByPageSwipe(direction:'next'|'previous'){
  if(this.pageSwipeNavigating||this.navOpen()||this.appLock.locked())return;
  const items=this.visibleNav,index=this.currentNavIndex();
  if(index<0||!items.length)return;
  const targetIndex=direction==='next'?index+1:index-1;
  if(targetIndex<0||targetIndex>=items.length)return;
  this.pageSwipeNavigating=true;
  try{
   this.resetTransientUi();
   await this.router.navigateByUrl(items[targetIndex].path);
   if(typeof window!=='undefined')window.scrollTo({top:0,left:0,behavior:'auto'});
  }finally{setTimeout(()=>this.pageSwipeNavigating=false,180);}
 }
 @HostListener('document:touchstart',['$event']) onEdgeTouchStart(event:TouchEvent){
  this.touchTracking=false;this.touchMode='none';
  if(this.appLock.locked()||window.innerWidth>900||event.touches.length!==1)return;
  const target=event.target as HTMLElement|null;
  if(this.swipeBlockedTarget(target))return;
  const touch=event.touches[0];
  const edge=Math.max(26,Math.min(38,window.innerWidth*.08));
  this.touchStartX=touch.clientX;this.touchStartY=touch.clientY;this.touchStartAt=Date.now();
  // Left-edge inward swipe is reserved for the app drawer. Everywhere else,
  // a clean horizontal swipe moves between the visible pages for this role.
  if(this.navOpen())this.touchMode='drawer';
  else if(touch.clientX<=edge)this.touchMode='drawer';
  else if(this.currentNavIndex()>=0)this.touchMode='page';
  else return;
  this.touchTracking=true;
 }
 @HostListener('document:touchend',['$event']) onEdgeTouchEnd(event:TouchEvent){
  if(!this.touchTracking||event.changedTouches.length!==1){this.touchTracking=false;this.touchMode='none';return;}
  const mode=this.touchMode,touch=event.changedTouches[0];
  const dx=touch.clientX-this.touchStartX,dy=touch.clientY-this.touchStartY,elapsed=Date.now()-this.touchStartAt;
  this.touchTracking=false;this.touchMode='none';
  if(elapsed>850||Math.abs(dx)<64||Math.abs(dy)>Math.max(52,Math.abs(dx)*.72))return;
  if(mode==='drawer'){
   if(!this.navOpen()&&dx>0){this.resetTransientUi();this.navOpen.set(true);return;}
   if(this.navOpen()&&dx<0){this.navOpen.set(false);return;}
   return;
  }
  if(mode==='page'){
   if(dx<0){void this.navigateByPageSwipe('next');return;}
   if(dx>0){void this.navigateByPageSwipe('previous');}
  }
 }
 @HostListener('document:touchcancel') onEdgeTouchCancel(){this.touchTracking=false;this.touchMode='none';}
 @HostListener('document:click',['$event']) closeTransientMenus(event:MouseEvent){
  const target=event.target as HTMLElement|null;
  if(this.profileOpen()&&!target?.closest('.profile-menu-wrap'))this.profileOpen.set(false);
  if(this.propertyExplorerOpen()&&!target?.closest('.property-explorer,.search-filter-toggle,.cdk-overlay-container'))this.propertyExplorerOpen.set(false);
 }
 @HostListener('window:keydown',['$event']) onShortcut(e:KeyboardEvent){
  const key=e.key.toLowerCase();
  if(this.platform.isLockShortcut(e)){
   e.preventDefault();e.stopPropagation();
   if(!this.appLock.locked())this.lockNow();
   return;
  }
  if((e.ctrlKey||e.metaKey)&&key==='k'&&this.store.canAccess('residents')){e.preventDefault();const input=document.querySelector('.searchbox input') as HTMLInputElement|null;input?.focus();input?.select();}
 }
}
