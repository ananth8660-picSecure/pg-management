import { Injectable, computed, effect, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CloudDataService } from './cloud-data.service';
import { FileStorageService } from './file-storage.service';
import { APP_CONFIG } from '../config/app-config';
import { AuditLog, BillingCycle, Block, FloorAssets, FloorInventory, PagePermission, Payment, RentReminder, Resident, Role, Room, RoomAssets, SharingRate, SharingType } from './models';

const OWNER_ONLY_PAGES=new Set<PagePermission>(['amenities','settings']);
const DEFAULT_MANAGER_ACCESS:PagePermission[]=['dashboard','property','residents','vacancy','payments','food','staff','maintenance','assets','utilities','vendors','calendar','documents','notifications'];
const EMPTY_ASSETS:RoomAssets={fans:0,geysers:0,taps:0,lights:0,cupboards:0,tables:0,chairs:0};
const EMPTY_FLOOR_ASSETS:FloorAssets={washingMachines:0,waterPurifiers:0,commonFans:0,commonTaps:0,commonGeysers:0,commonLights:0,cctv:0,fireExtinguishers:0,commonToilets:0,shoeRacks:0};

@Injectable({providedIn:'root'})
export class StoreService {
  readonly role = signal<Role>('owner');
  readonly blocks = signal<Block[]>(APP_CONFIG.dataProvider==='demo'?[{id:'A', name:'Block A', floors:1}]:[]);
  readonly rooms = signal<Room[]>(APP_CONFIG.dataProvider==='demo'?this.seedRooms():[]);
  readonly residents = signal<Resident[]>(APP_CONFIG.dataProvider==='demo'?this.seedResidents():[]);
  readonly payments = signal<Payment[]>([]);
  readonly floorInventories = signal<FloorInventory[]>([]);
  readonly managerAccess = signal<PagePermission[]>([...DEFAULT_MANAGER_ACCESS]);
  readonly sharingRates = signal<SharingRate[]>([]);
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly maintenanceRecords = signal<any[]>([]);
  readonly latestAudit = computed(()=>this.auditLogs()[0]||null);
  readonly hydrated = signal(false);
  readonly syncState = signal<'demo'|'syncing'|'synced'|'error'>('demo');
  readonly activeResidents = computed(()=>this.residents().filter(r=>r.status==='active'));
  readonly vacantBeds = computed(()=>this.rooms().flatMap(r=>r.beds.filter(b=>b.status==='vacant').map(b=>({blockId:r.blockId,floor:r.floor,room:r,bed:b}))));
  readonly totalBeds = computed(()=>this.rooms().reduce((n,r)=>n+r.beds.length,0));
  readonly occupiedBeds = computed(()=>this.rooms().reduce((n,r)=>n+r.beds.filter(b=>b.status==='occupied').length,0));
  readonly vacancyByBlock = computed(()=>this.blocks().map(b=>({block:b,count:this.vacantBeds().filter(v=>v.blockId===b.id).length})));
  readonly totalFloors = computed(()=>this.blocks().reduce((n,b)=>n+b.floors,0));
  readonly totalAssets = computed(()=>this.rooms().reduce((a,r)=>({fans:a.fans+r.assets.fans,geysers:a.geysers+r.assets.geysers,taps:a.taps+r.assets.taps,lights:a.lights+r.assets.lights,cupboards:a.cupboards+r.assets.cupboards,tables:a.tables+r.assets.tables,chairs:a.chairs+r.assets.chairs}),{...EMPTY_ASSETS}));
  readonly rentReminders = computed<RentReminder[]>(()=>this.buildRentReminders());
  readonly activeRentReminders = computed(()=>this.rentReminders().filter(r=>r.status!=='Paid'&&(r.daysDelta<=5||r.status==='Partial'||r.status==='Overdue'||r.status==='Due Today')));
  readonly overdueRentReminders = computed(()=>this.rentReminders().filter(r=>r.status==='Overdue'||r.status==='Partial'));
  readonly dueTodayRentReminders = computed(()=>this.rentReminders().filter(r=>r.status==='Due Today'));
  readonly dailyGuests = computed(()=>this.activeResidents().filter(r=>(r.billingCycle||'monthly')==='daily'));
  readonly monthlyResidents = computed(()=>this.activeResidents().filter(r=>(r.billingCycle||'monthly')==='monthly'));
  readonly dailyStayAccounts = computed(()=>this.dailyGuests().map(r=>{const stay=r.stays.find(s=>s.active);const from=stay?.from||r.joined;const start=new Date(from+'T12:00:00');const today=new Date();today.setHours(12,0,0,0);const days=Math.max(1,Math.floor((today.getTime()-start.getTime())/86400000)+1);const expected=days*Number(r.dailyRate||0);const paid=this.payments().filter(p=>p.residentId===r.id&&p.type==='Rent'&&p.date>=from).reduce((n,p)=>n+Number(p.amount||0),0);return{resident:r,days,expected,paid,balance:Math.max(0,expected-paid),roomId:stay?.roomId||'—',from};}));

  private bootstrapped=false;
  private loadedTenantId='';
  private liveUnsubs:(()=>void)[]=[];
  constructor(private cloud:CloudDataService,private files:FileStorageService,private auth:AuthService){
    effect(()=>{
      const ready=this.auth.ready(),u=this.auth.user();
      if(u)this.role.set(u.role);
      const tenantId=u?.tenantId||'';
      if(tenantId&&tenantId!==this.loadedTenantId){this.stopRealtime();this.loadedTenantId=tenantId;this.bootstrapped=false;this.resetWorkspaceState();}
      const canBoot=APP_CONFIG.dataProvider==='demo'||!this.cloudConfigured()||(ready&&!!u);
      if(canBoot&&!this.bootstrapped){this.bootstrapped=true;void this.bootstrap();}
    });
  }
  private resetWorkspaceState(){if(APP_CONFIG.dataProvider==='demo')return;this.blocks.set([]);this.rooms.set([]);this.residents.set([]);this.payments.set([]);this.floorInventories.set([]);this.auditLogs.set([]);this.maintenanceRecords.set([]);this.managerAccess.set([...DEFAULT_MANAGER_ACCESS]);this.sharingRates.set([]);this.hydrated.set(false);}
  private async bootstrap(){
    if(APP_CONFIG.dataProvider==='demo'||!this.cloudConfigured()){this.loadLocal();this.hydrated.set(true);return;}
    this.syncState.set('syncing');
    try{const data=await this.cloud.load();if(data){
      this.blocks.set(data.blocks);
      this.rooms.set(this.normalizeRooms(data.rooms));
      this.residents.set(this.normalizeResidents(data.residents));
      if(data.payments?.length)this.payments.set(data.payments);
      if(data.floorInventories?.length)this.floorInventories.set(data.floorInventories.map((v:any)=>({...v,assets:{...EMPTY_FLOOR_ASSETS,...(v.assets||{})}}))); 
      if(data.managerAccess?.length)this.managerAccess.set(data.managerAccess as PagePermission[]);
      if(Array.isArray(data.sharingRates))this.sharingRates.set(data.sharingRates);
      if(this.role()==='owner'||this.canAccess('activity')){try{this.auditLogs.set(await this.cloud.loadAuditLogs());}catch(e){console.warn('[PG Ops] audit log load skipped',e);}}
    }this.startRealtime();this.syncState.set('synced');}catch(e){console.error(e);this.syncState.set('error');this.resetWorkspaceState();}finally{this.hydrated.set(true)}
  }
  private stopRealtime(){for(const unsub of this.liveUnsubs.splice(0))try{unsub();}catch{}}
  private startRealtime(){
    if(!this.cloud.configured)return;this.stopRealtime();const owner=this.role()==='owner';const can=(p:PagePermission)=>owner||this.canAccess(p);const err=(e:any)=>{console.warn('[PG Ops] realtime collection skipped',e);};
    if(can('dashboard')||can('reports')||can('property')||can('amenities')||can('vacancy')||can('residents')){this.liveUnsubs.push(this.cloud.watchCollection<Block>('blocks',v=>this.blocks.set(v),err));this.liveUnsubs.push(this.cloud.watchCollection<Room>('rooms',v=>this.rooms.set(this.normalizeRooms(v)),err));}
    if(can('dashboard')||can('reports')||can('notifications')||can('residents')||can('payments')||can('documents'))this.liveUnsubs.push(this.cloud.watchCollection<Resident>('residents',v=>this.residents.set(this.normalizeResidents(v)),err));
    if(can('dashboard')||can('reports')||can('notifications')||can('payments'))this.liveUnsubs.push(this.cloud.watchCollection<Payment>('payments',v=>this.payments.set(v.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))),err));
    if(can('reports')||can('property')||can('amenities'))this.liveUnsubs.push(this.cloud.watchCollection<FloorInventory>('floorInventories',v=>this.floorInventories.set(v.map((x:any)=>({...x,assets:{...EMPTY_FLOOR_ASSETS,...(x.assets||{})}}))),err));
    if(can('maintenance'))this.liveUnsubs.push(this.cloud.watchCollection<any>('maintenance',v=>this.maintenanceRecords.set(v),err));
    this.liveUnsubs.push(this.cloud.watchDocument<any>('settings','app',v=>{if(!v)return;if(Array.isArray(v.managerAccess))this.managerAccess.set(v.managerAccess);if(Array.isArray(v.sharingRates))this.sharingRates.set(v.sharingRates.map((x:any)=>({sharing:Number(x?.sharing)||0,amount:Number(x?.amount)||0})).filter((x:any)=>x.sharing>0));},err));
  }
  private cloudConfigured(){return this.cloud.configured;}
  private normalizeRooms(rooms:any[]):Room[]{return rooms.map(r=>({...r,assets:{...EMPTY_ASSETS,...(r.assets||{})}}));}
  private normalizeResidents(residents:any[]):Resident[]{return residents.map(r=>({...r,billingCycle:(r.billingCycle==='daily'?'daily':'monthly') as BillingCycle,dailyRate:Number(r.dailyRate)||0,plannedCheckout:r.plannedCheckout||'',monthlyRent:Number(r.monthlyRent)||0,rentDueDay:Math.min(31,Math.max(1,Number(r.rentDueDay)||5))}));}
  private loadLocal(){try{const raw=localStorage.getItem(APP_CONFIG.demo.storageKey);if(raw){const v=JSON.parse(raw);if(v.rooms)this.rooms.set(this.normalizeRooms(v.rooms));if(v.residents)this.residents.set(this.normalizeResidents(v.residents));if(v.blocks)this.blocks.set(v.blocks);if(v.payments)this.payments.set(v.payments);if(v.floorInventories)this.floorInventories.set(v.floorInventories.map((x:any)=>({...x,assets:{...EMPTY_FLOOR_ASSETS,...(x.assets||{})}})));if(v.managerAccess)this.managerAccess.set(v.managerAccess);if(v.sharingRates)this.sharingRates.set(v.sharingRates);if(v.auditLogs)this.auditLogs.set(v.auditLogs);}}catch{}
    try{const perms=localStorage.getItem('pgops-manager-access');if(perms)this.managerAccess.set(JSON.parse(perms));}catch{}
  }
  private saveLocal(){if(APP_CONFIG.dataProvider!=='demo'||!APP_CONFIG.demo.persistInBrowser)return;try{localStorage.setItem(APP_CONFIG.demo.storageKey,JSON.stringify({blocks:this.blocks(),rooms:this.rooms(),residents:this.residents(),payments:this.payments(),floorInventories:this.floorInventories(),managerAccess:this.managerAccess(),sharingRates:this.sharingRates(),auditLogs:this.auditLogs()}));localStorage.setItem('pgops-manager-access',JSON.stringify(this.managerAccess()));}catch{}}
  setRole(role:Role){if(this.auth.user()?.demo&&this.auth.user()?.role==='owner')this.role.set(role);}
  canAccess(page:PagePermission){const u=this.auth.user();if(!u)return false;if(this.role()==='owner')return true;if(OWNER_ONLY_PAGES.has(page))return false;return Array.isArray(u.permissions)&&u.permissions.includes(page);}
  async setManagerPageAccess(page:PagePermission,enabled:boolean){if(this.role()!=='owner')return;this.managerAccess.update(v=>enabled?[...new Set([...v,page])]:v.filter(x=>x!==page));this.saveLocal();await this.cloud.saveManagerAccess(this.managerAccess());await this.auditAction('Default manager access changed','Settings',{page,enabled});}
  async resetManagerAccess(){if(this.role()!=='owner')return;this.managerAccess.set([...DEFAULT_MANAGER_ACCESS]);this.saveLocal();await this.cloud.saveManagerAccess(this.managerAccess());await this.auditAction('Default manager access reset','Settings',{count:this.managerAccess().length});}


  sharingRate(sharing:number){return Number(this.sharingRates().find(x=>x.sharing===Number(sharing))?.amount||0);}
  async saveSharingRates(rates:SharingRate[]){
    if(this.role()!=='owner')throw new Error('Only a PG Owner can change sharing rates.');
    const clean=[...rates].map(x=>({sharing:Math.max(1,Math.floor(Number(x.sharing)||1)),amount:Math.max(0,Number(x.amount)||0)})).filter((x,i,a)=>a.findIndex(y=>y.sharing===x.sharing)===i).sort((a,b)=>a.sharing-b.sharing);
    this.sharingRates.set(clean);this.saveLocal();await this.cloud.saveSharingRates(clean);await this.auditAction('Sharing starting rates updated','Settings',{rates:clean});return clean;
  }

  async auditAction(action:string,module:string,details:Record<string,unknown>={}){
    const item=await this.cloud.audit(this.auth.user(),action,module,details);
    this.auditLogs.update(v=>[item,...v.filter(x=>x.id!==item.id)].slice(0,250));
    this.saveLocal();
    return item;
  }
  actorLine(log:AuditLog|null|undefined){if(!log)return'';const role=log.actorRole==='owner'?'Owner':'Manager';const when=new Date(log.createdAt);return `${role} ${log.actorName} · ${when.toLocaleString()}`;}

  search(term:string){if(!this.canAccess('residents'))return[] as Resident[];const q=term.trim().toLowerCase();if(!q)return[] as Resident[];return this.residents().filter(r=>[r.id,r.name,r.mobile,r.aadhaarLast4,...r.stays.map(s=>s.roomId)].some(v=>String(v).toLowerCase().includes(q))).slice(0,8);}
  residentForBed(bedId:string){return this.activeResidents().find(r=>r.stays.some(s=>s.active&&s.bedId===bedId));}
  bedRent(room:Room,bedId:string){const resident=this.residentForBed(bedId);if(resident)return (resident.billingCycle||'monthly')==='daily'?Number(resident.dailyRate||0):Number(resident.monthlyRent||0);return this.sharingRate(room.sharing)||Number(room.rent||0);}
  unpaidForRoom(roomId:string){return this.rentReminders().filter(x=>x.roomId===roomId&&x.status!=='Paid');}
  repairsForRoom(room:Room){if(!this.canAccess('maintenance'))return[] as any[];const rid=room.id.toLowerCase(),num=room.number.toLowerCase(),block=room.blockId.toLowerCase(),floor=String(room.floor);return this.maintenanceRecords().filter((r:any)=>{const hay=Object.values(r||{}).map(v=>String(v).toLowerCase()).join(' ');const status=String(r?.status||'').toLowerCase();return status!=='completed'&&(hay.includes(rid)||hay.includes('room '+num)||hay.includes(`block ${block}`)&&hay.includes(floor));});}

  exportBackup(){
    return {
      version:1,
      exportedAt:new Date().toISOString(),
      blocks:this.blocks(),rooms:this.rooms(),residents:this.residents(),payments:this.payments(),floorInventories:this.floorInventories(),managerAccess:this.managerAccess(),sharingRates:this.sharingRates(),auditLogs:this.auditLogs()
    };
  }
  integrityIssues(){
    const issues:string[]=[];
    const roomIds=new Set(this.rooms().map(r=>r.id));
    const residentIds=new Set(this.residents().map(r=>r.id));
    for(const r of this.residents()) for(const s of r.stays){
      if(!roomIds.has(s.roomId)) issues.push(`${r.id}: stay references missing room ${s.roomId}`);
      if(s.active){const room=this.rooms().find(x=>x.id===s.roomId);const bed=room?.beds.find(b=>b.id===s.bedId);if(!bed) issues.push(`${r.id}: active stay references missing bed ${s.bedId}`);}
    }
    for(const room of this.rooms()) for(const bed of room.beds){if(bed.residentId&&!residentIds.has(bed.residentId))issues.push(`${bed.id}: references missing resident ${bed.residentId}`);}
    return issues;
  }

  private monthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  private dueDateFor(resident:Resident, now=new Date()){const y=now.getFullYear(),m=now.getMonth();const last=new Date(y,m+1,0).getDate();const day=Math.min(last,Math.max(1,resident.rentDueDay||5));return new Date(y,m,day,12,0,0);}
  private buildRentReminders():RentReminder[]{const now=new Date();now.setHours(12,0,0,0);const month=this.monthKey(now);return this.monthlyResidents().map(r=>{const due=this.dueDateFor(r,now);const paid=this.payments().filter(p=>p.residentId===r.id&&p.type==='Rent'&&(p.billingMonth||p.date.slice(0,7))===month).reduce((n,p)=>n+Number(p.amount||0),0);const balance=Math.max(0,r.monthlyRent-paid);const daysDelta=Math.round((due.getTime()-now.getTime())/86400000);let status:RentReminder['status'];if(balance<=0)status='Paid';else if(paid>0)status='Partial';else if(daysDelta<0)status='Overdue';else if(daysDelta===0)status='Due Today';else status='Upcoming';const roomId=r.stays.find(s=>s.active)?.roomId||'—';return{residentId:r.id,residentName:r.name,roomId,dueDate:due.toISOString().slice(0,10),dueDay:r.rentDueDay,monthlyRent:r.monthlyRent,paid,balance,status,daysDelta};}).sort((a,b)=>a.daysDelta-b.daysDelta||a.residentName.localeCompare(b.residentName));}
  ordinal(day:number){const n=day%100;if(n>=11&&n<=13)return `${day}th`;switch(day%10){case 1:return `${day}st`;case 2:return `${day}nd`;case 3:return `${day}rd`;default:return `${day}th`;}}

  async addBlock(name:string,floors:number){if(this.role()!=='owner')return;const base=(name.match(/[A-Z]/i)?.[0]||String.fromCharCode(65+this.blocks().length)).toUpperCase();let id=base;let n=2;while(this.blocks().some(b=>b.id===id))id=`${base}${n++}`;const block={id,name:name.trim()||`Block ${id}`,floors:Math.max(1,Number(floors)||1)};this.blocks.update(v=>[...v,block]);this.saveLocal();await this.cloud.saveBlock(block);await this.auditAction('Block added','Amenities',{blockId:block.id,name:block.name,floors:block.floors});}
  async updateBlockFloors(id:string,floors:number){if(this.role()!=='owner')return{ok:false,error:'permission'};const block=this.blocks().find(b=>b.id===id);if(!block)return{ok:false,error:'missing'};const count=Math.max(1,Number(floors)||1);const highestUsed=this.rooms().filter(r=>r.blockId===id).reduce((m,r)=>Math.max(m,r.floor),-1)+1;if(count<highestUsed)return{ok:false,error:'rooms-exist'};this.blocks.update(v=>v.map(b=>b.id===id?{...b,floors:count}:b));this.saveLocal();const updated=this.blocks().find(b=>b.id===id);if(updated)await this.cloud.saveBlock(updated);await this.auditAction('Floor count updated','Amenities',{blockId:id,floors:count});return{ok:true};}

  floorInventory(blockId:string,floor:number):FloorInventory{
    const id=`${blockId}-${floor}`;
    return this.floorInventories().find(v=>v.id===id)||{id,blockId,floor,assets:{...EMPTY_FLOOR_ASSETS},notes:''};
  }
  async saveFloorInventory(blockId:string,floor:number,assets:FloorAssets,notes=''){
    if(this.role()!=='owner')return{ok:false,error:'permission'};
    const id=`${blockId}-${floor}`,record:FloorInventory={id,blockId,floor,assets:{...EMPTY_FLOOR_ASSETS,...assets},notes:String(notes||''),updatedAt:new Date().toISOString()};
    this.floorInventories.update(list=>[...list.filter(v=>v.id!==id),record]);this.saveLocal();await this.cloud.saveFloorInventory(record);await this.auditAction('Floor inventory updated','Amenities',{blockId,floor});return{ok:true,record};
  }
  floorSummary(blockId:string,floor:number){
    const rooms=this.rooms().filter(r=>r.blockId===blockId&&r.floor===floor),common=this.floorInventory(blockId,floor).assets;
    const roomAssets=rooms.reduce((a,r)=>({fans:a.fans+r.assets.fans,geysers:a.geysers+r.assets.geysers,taps:a.taps+r.assets.taps,lights:a.lights+r.assets.lights,cupboards:a.cupboards+r.assets.cupboards,tables:a.tables+r.assets.tables,chairs:a.chairs+r.assets.chairs}),{...EMPTY_ASSETS});
    return{rooms:rooms.length,beds:rooms.reduce((n,r)=>n+r.beds.length,0),vacantBeds:rooms.reduce((n,r)=>n+r.beds.filter(b=>b.status==='vacant').length,0),acRooms:rooms.filter(r=>r.ac).length,normalRooms:rooms.filter(r=>!r.ac).length,roomAssets,common};
  }
  async bulkAddRooms(input:{blockId:string;floor:number;count:number;startNumber:number;beds:number;rent:number;ac:boolean;attachedBath:boolean;assets:RoomAssets}){
    if(this.role()!=='owner')return{ok:false,error:'permission',created:0};
    const count=Math.max(1,Math.min(50,Math.floor(Number(input.count)||1))),created:Room[]=[];let number=Math.max(1,Math.floor(Number(input.startNumber)||1));
    for(let i=0;i<count;i++,number++){
      let roomNo=String(number);while(this.rooms().some(r=>r.blockId===input.blockId&&r.number===roomNo)){number++;roomNo=String(number);}const result=await this.addRoom({blockId:input.blockId,floor:input.floor,number:roomNo,sharing:Math.max(1,Number(input.beds)||1),rent:Number(input.rent)||0,attachedBath:Boolean(input.attachedBath),ac:Boolean(input.ac),assets:{...EMPTY_ASSETS,...input.assets}});if(result.ok&&result.room)created.push(result.room);
    }
    return{ok:true,created:created.length};
  }

  async addFloor(blockId:string){const block=this.blocks().find(b=>b.id===blockId);if(!block||this.role()!=='owner')return{ok:false,error:'permission'};return this.updateBlockFloors(blockId,block.floors+1);}
  async removeFloor(blockId:string,floor:number){if(this.role()!=='owner')return{ok:false,error:'permission'};const block=this.blocks().find(b=>b.id===blockId);if(!block)return{ok:false,error:'missing'};if(floor!==block.floors-1)return{ok:false,error:'top-only'};if(this.rooms().some(r=>r.blockId===blockId&&r.floor===floor))return{ok:false,error:'rooms-exist'};if(block.floors<=1)return{ok:false,error:'minimum'};const result=await this.updateBlockFloors(blockId,block.floors-1);if(result.ok){const id=`${blockId}-${floor}`;this.floorInventories.update(v=>v.filter(x=>x.id!==id));this.saveLocal();await this.cloud.deleteFloorInventory(id);}return result;}
  async addRoom(input:{blockId:string;floor:number;number:string;sharing:SharingType;rent:number;attachedBath:boolean;ac:boolean;assets:RoomAssets}){if(this.role()!=='owner')return{ok:false,error:'permission'};const id=`${input.blockId}-${input.number.trim()}`;if(this.rooms().some(r=>r.id.toLowerCase()===id.toLowerCase()))return{ok:false,error:'exists'};const capacity=Math.max(1,Math.floor(Number(input.sharing)||1));const beds=Array.from({length:capacity},(_,i)=>({id:`${id}-B${i+1}`,label:`Bed ${i+1}`,status:'vacant' as const}));const room:Room={id,blockId:input.blockId,floor:Number(input.floor),number:input.number.trim(),sharing:capacity,rent:Number(input.rent)||0,beds,attachedBath:input.attachedBath,ac:input.ac,assets:{...EMPTY_ASSETS,...input.assets}};this.rooms.update(v=>[...v,room]);this.saveLocal();await this.cloud.saveRoom(room);await this.auditAction('Room added','Amenities',{roomId:room.id,blockId:room.blockId,floor:room.floor,beds:room.beds.length});return{ok:true,room};}
  async updateRoom(roomId:string,patch:Partial<Pick<Room,'rent'|'attachedBath'|'ac'|'assets'>>){if(this.role()!=='owner')return{ok:false,error:'permission'};let updated:Room|undefined;this.rooms.update(v=>v.map(r=>r.id===roomId?(updated={...r,...patch,assets:patch.assets?{...patch.assets}:r.assets}):r));if(!updated)return{ok:false,error:'missing'};this.saveLocal();await this.cloud.saveRoom(updated);await this.auditAction('Room updated','Amenities',{roomId,ac:updated.ac,rent:updated.rent});return{ok:true,room:updated};}
  async updateRoomAssets(roomId:string,assets:RoomAssets){return this.updateRoom(roomId,{assets});}
  async removeRoom(roomId:string){if(this.role()!=='owner')return{ok:false,error:'permission'};const room=this.rooms().find(r=>r.id===roomId);if(!room)return{ok:false,error:'missing'};if(room.beds.some(b=>b.status!=='vacant'||Boolean(b.residentId)))return{ok:false,error:'occupied'};if(this.residents().some(r=>r.status==='active'&&r.stays.some(s=>s.active&&s.roomId===roomId)))return{ok:false,error:'resident'};this.rooms.update(v=>v.filter(r=>r.id!==roomId));this.saveLocal();await this.cloud.deleteRoom(roomId);await this.auditAction('Empty room removed','Amenities',{roomId});return{ok:true};}
  async addBed(roomId:string){if(this.role()!=='owner')return;let updated:Room|undefined;this.rooms.update(list=>list.map(r=>{if(r.id!==roomId)return r;const next=r.beds.reduce((m,b)=>Math.max(m,Number((b.id.match(/B(\d+)$/)||[])[1])||0),0)+1;const beds=[...r.beds,{id:`${r.id}-B${next}`,label:`Bed ${next}`,status:'vacant' as const}];return updated={...r,beds,sharing:beds.length};}));this.saveLocal();if(updated){await this.cloud.saveRoom(updated);await this.auditAction('Bed added','Amenities',{roomId,bedCount:updated.beds.length});}}
  async removeBed(roomId:string,bedId:string){if(this.role()!=='owner')return{ok:false,error:'permission'};let updated:Room|undefined;let blocked=false;this.rooms.update(list=>list.map(r=>{if(r.id!==roomId)return r;const bed=r.beds.find(b=>b.id===bedId);if(!bed||bed.status!=='vacant'){blocked=true;return r;}if(r.beds.length<=1){blocked=true;return r;}const beds=r.beds.filter(b=>b.id!==bedId);return updated={...r,beds,sharing:beds.length};}));if(blocked||!updated)return{ok:false,error:'occupied'};this.saveLocal();await this.cloud.saveRoom(updated);await this.auditAction('Vacant bed removed','Amenities',{roomId,bedId});return{ok:true};}

  async addResident(input:{name:string;mobile:string;aadhaarLast4:string;billingCycle:BillingCycle;monthlyRent:number;dailyRate:number;plannedCheckout?:string;deposit:number;rentDueDay:number;roomId:string;bedId:string;photoFile:File;idProofFile:File}){
    const duplicate=this.residents().find(r=>r.mobile===input.mobile||r.aadhaarLast4===input.aadhaarLast4);if(duplicate)return{ok:false,duplicate};
    const next=String(Math.max(185,...this.residents().map(r=>Number(r.id.replace(/\D/g,''))||0))+1).padStart(5,'0');const id=`PG-${next}`,stayId=`ST-${Date.now()}`,today=new Date().toISOString().slice(0,10);
    const [photo,proof]=await Promise.all([this.files.upload(`residents/${id}/photo/${Date.now()}-${input.photoFile.name}`,input.photoFile),this.files.upload(`residents/${id}/proofs/${Date.now()}-${input.idProofFile.name}`,input.idProofFile)]);
    const resident:Resident={id,name:input.name,mobile:input.mobile,aadhaarLast4:input.aadhaarLast4,photo:input.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),joined:today,status:'active',currentStayId:stayId,deposit:input.deposit,billingCycle:input.billingCycle||'monthly',monthlyRent:input.billingCycle==='daily'?0:Number(input.monthlyRent)||0,dailyRate:input.billingCycle==='daily'?Number(input.dailyRate)||0:0,plannedCheckout:input.billingCycle==='daily'?(input.plannedCheckout||''):'',rentDueDay:Math.min(31,Math.max(1,Number(input.rentDueDay)||5)),documents:[{type:'Photo',...photo,uploadedAt:today},{type:'Aadhaar / ID',...proof,uploadedAt:today}],stays:[{id:stayId,roomId:input.roomId,bedId:input.bedId,from:today,active:true,reason:'checkin'}]};
    const room=this.rooms().find(r=>r.id===input.roomId);if(!room||!room.beds.some(b=>b.id===input.bedId&&b.status==='vacant'))return{ok:false,error:'bed'};
    const updatedRoom={...room,beds:room.beds.map(b=>b.id!==input.bedId?b:{...b,status:'occupied' as const,residentId:id})};
    if(this.cloud.configured){try{const created=await this.cloud.checkInResidentAtomic(resident,room.id,input.bedId);if(!created){await Promise.allSettled([this.files.remove(photo.path),this.files.remove(proof.path)]);return{ok:false,error:'bed'};}this.residents.update(v=>[created.resident,...v.filter(x=>x.id!==created.resident.id)]);this.rooms.update(v=>v.map(r=>r.id===created.room.id?created.room:r));}catch(e:any){await Promise.allSettled([this.files.remove(photo.path),this.files.remove(proof.path)]);if(String(e?.message||'').includes('TARGET_BED_OCCUPIED'))return{ok:false,error:'bed'};throw e;}}
    else{this.residents.update(v=>[resident,...v]);this.rooms.update(v=>v.map(r=>r.id===room.id?updatedRoom:r));}
    this.saveLocal();await this.auditAction('Resident checked in','Residents',{residentId:id,roomId:room.id,bedId:input.bedId,billingCycle:input.billingCycle,dailyRate:input.dailyRate,monthlyRent:input.monthlyRent});return{ok:true,resident};
  }
  async restoreResident(id:string,roomId:string,bedId:string){
    if(this.cloud.configured){const restored=await this.cloud.restoreResidentAtomic(id,roomId,bedId);if(!restored)throw new Error('Unable to restore resident.');this.residents.update(v=>v.map(r=>r.id===id?restored.resident:r));this.rooms.update(v=>v.map(r=>r.id===roomId?restored.room:r));this.saveLocal();await this.auditAction('Resident restored','Residents',{residentId:id,roomId,bedId});return;}
    const today=new Date().toISOString().slice(0,10),stayId=`ST-${Date.now()}`;let updated!:Resident;this.residents.update(list=>list.map(r=>r.id!==id?r:(updated={...r,status:'active',currentStayId:stayId,stays:[...r.stays,{id:stayId,roomId,bedId,from:today,active:true,reason:'restore'}]})));let updatedRoom!:Room;this.rooms.update(rooms=>rooms.map(r=>r.id!==roomId?r:(updatedRoom={...r,beds:r.beds.map(b=>b.id!==bedId?b:{...b,status:'occupied',residentId:id})})));this.saveLocal();await this.auditAction('Resident restored','Residents',{residentId:id,roomId,bedId});
  }

  async transferResident(residentId:string,targetRoomId:string,targetBedId:string,applyTargetRent=false){
    applyTargetRent=this.role()==='owner'&&applyTargetRent;
    const resident=this.residents().find(r=>r.id===residentId&&r.status==='active');
    const current=resident?.stays.find(s=>s.active);
    if(!resident||!current)return{ok:false,error:'resident'};
    if(this.cloud.configured){
      try{
        const moved=await this.cloud.transferResidentAtomic(residentId,targetRoomId,targetBedId,applyTargetRent);
        if(!moved)return{ok:false,error:'missing'};
        this.residents.update(list=>list.map(r=>r.id===residentId?moved.resident:r));
        this.rooms.update(list=>list.map(r=>r.id===moved.sourceRoom.id?moved.sourceRoom:r.id===moved.targetRoom.id?moved.targetRoom:r));
        this.saveLocal();
        await this.auditAction('Resident room transferred','Residents',{residentId,fromRoomId:moved.fromRoomId,fromBedId:moved.fromBedId,toRoomId:targetRoomId,toBedId:targetBedId,monthlyRent:moved.resident.monthlyRent});
        return{ok:true,resident:moved.resident};
      }catch(e:any){if(String(e?.message||'').includes('TARGET_BED_OCCUPIED'))return{ok:false,error:'occupied'};throw e;}
    }
    const sourceRoom=this.rooms().find(r=>r.id===current.roomId);
    const targetRoom=this.rooms().find(r=>r.id===targetRoomId);
    const targetBed=targetRoom?.beds.find(b=>b.id===targetBedId);
    if(!sourceRoom||!targetRoom||!targetBed)return{ok:false,error:'missing'};
    if(targetBed.status!=='vacant'||targetBed.residentId)return{ok:false,error:'occupied'};
    const today=new Date().toISOString().slice(0,10),stayId=`ST-${Date.now()}`;
    let updatedSource:Room,updatedTarget:Room;
    if(sourceRoom.id===targetRoom.id){const updated={...sourceRoom,beds:sourceRoom.beds.map(b=>b.id===current.bedId?{...b,status:'vacant' as const,residentId:undefined}:b.id===targetBedId?{...b,status:'occupied' as const,residentId}:b)};updatedSource=updatedTarget=updated;}
    else{updatedSource={...sourceRoom,beds:sourceRoom.beds.map(b=>b.id===current.bedId?{...b,status:'vacant' as const,residentId:undefined}:b)};updatedTarget={...targetRoom,beds:targetRoom.beds.map(b=>b.id===targetBedId?{...b,status:'occupied' as const,residentId}:b)};}
    const updatedResident:Resident={...resident,currentStayId:stayId,monthlyRent:applyTargetRent?targetRoom.rent:resident.monthlyRent,stays:[...resident.stays.map(s=>s.active?{...s,active:false,to:today}:s),{id:stayId,roomId:targetRoomId,bedId:targetBedId,from:today,active:true,reason:'transfer'}]};
    this.rooms.update(list=>list.map(r=>r.id===updatedSource.id?updatedSource:r.id===updatedTarget.id?updatedTarget:r));this.residents.update(list=>list.map(r=>r.id===residentId?updatedResident:r));this.saveLocal();
    await this.auditAction('Resident room transferred','Residents',{residentId,fromRoomId:current.roomId,fromBedId:current.bedId,toRoomId:targetRoomId,toBedId:targetBedId,monthlyRent:updatedResident.monthlyRent});return{ok:true,resident:updatedResident};
  }
  async updateResidentProfile(id:string,patch:{name:string;mobile:string;aadhaarLast4:string;billingCycle:BillingCycle;monthlyRent:number;dailyRate:number;plannedCheckout?:string;deposit:number;rentDueDay:number}){
    const current=this.residents().find(r=>r.id===id);if(!current)throw new Error('Resident not found.');
    const duplicate=this.residents().find(r=>r.id!==id&&(r.mobile===patch.mobile||r.aadhaarLast4===patch.aadhaarLast4));if(duplicate)throw new Error(`Mobile/Aadhaar details already belong to ${duplicate.name} (${duplicate.id}).`);
    const owner=this.role()==='owner';const cycle=owner?(patch.billingCycle||'monthly'):(current.billingCycle||'monthly');const updated:Resident={...current,name:patch.name.trim(),mobile:patch.mobile,aadhaarLast4:patch.aadhaarLast4,billingCycle:cycle,monthlyRent:owner?(cycle==='daily'?0:Number(patch.monthlyRent)||0):current.monthlyRent,dailyRate:owner?(cycle==='daily'?Number(patch.dailyRate)||0:0):Number(current.dailyRate||0),plannedCheckout:owner?(cycle==='daily'?(patch.plannedCheckout||''):''):(current.plannedCheckout||''),deposit:Number(patch.deposit)||0,rentDueDay:Math.min(31,Math.max(1,Number(patch.rentDueDay)||5))};
    this.residents.update(list=>list.map(r=>r.id===id?updated:r));this.saveLocal();await Promise.all([this.cloud.saveResident(updated),this.auditAction('Resident profile updated','Residents',{residentId:id,name:updated.name,billingCycle:updated.billingCycle,monthlyRent:updated.monthlyRent,dailyRate:updated.dailyRate,rentDueDay:updated.rentDueDay})]);return updated;
  }

  async checkoutResident(id:string){
    if(this.cloud.configured){const out=await this.cloud.checkoutResidentAtomic(id);if(!out)return;this.residents.update(v=>v.map(r=>r.id===id?out.resident:r));if(out.room)this.rooms.update(v=>v.map(r=>r.id===out.room!.id?out.room!:r));this.saveLocal();await this.auditAction('Resident checked out','Residents',{residentId:id});return;}
    const today=new Date().toISOString().slice(0,10),resident=this.residents().find(r=>r.id===id),stay=resident?.stays.find(s=>s.active);if(!resident)return;let updated!:Resident;this.residents.update(list=>list.map(r=>r.id!==id?r:(updated={...r,status:'inactive',currentStayId:undefined,stays:r.stays.map(s=>s.active?{...s,active:false,to:today}:s)})));if(stay)this.rooms.update(rooms=>rooms.map(r=>r.id!==stay.roomId?r:{...r,beds:r.beds.map(b=>b.id!==stay.bedId?b:{...b,status:'vacant',residentId:undefined})}));this.saveLocal();await this.auditAction('Resident checked out','Residents',{residentId:id});
  }
  async recordPayment(input:{residentId:string;type:Payment['type'];amount:number;mode:string;receiptFile:File;note:string}){
    const resident=this.residents().find(r=>r.id===input.residentId);if(!resident)throw new Error('Resident not found');
    const room=resident.stays.find(s=>s.active)?.roomId||'—',id=`PAY-${Date.now()}`,date=new Date().toISOString().slice(0,10),file=await this.files.upload(`payments/${id}/${Date.now()}-${input.receiptFile.name}`,input.receiptFile);
    try{const billingMonth=this.monthKey(new Date()),cycle=resident.billingCycle||'monthly',activeStay=resident.stays.find(s=>s.active),stayFrom=activeStay?.from||resident.joined,previousRent=this.payments().filter(x=>x.residentId===resident.id&&x.type==='Rent'&&(cycle==='daily'?x.date>=stayFrom:(x.billingMonth||x.date.slice(0,7))===billingMonth)).reduce((n,x)=>n+Number(x.amount||0),0),totalAfter=previousRent+Number(input.amount);let expectedRent=resident.monthlyRent;if(cycle==='daily'){const start=new Date(stayFrom+'T12:00:00'),today=new Date();today.setHours(12,0,0,0);const days=Math.max(1,Math.floor((today.getTime()-start.getTime())/86400000)+1);expectedRent=days*Number(resident.dailyRate||0);}const p:Payment={id,residentId:resident.id,residentName:resident.name,roomId:room,type:input.type,amount:Number(input.amount),mode:input.mode,receipt:{type:'Receipt',...file,uploadedAt:date},note:input.note,date,billingMonth:input.type==='Rent'&&cycle==='monthly'?billingMonth:undefined,status:input.type==='Rent'&&totalAfter<expectedRent?'Partial':'Paid'};if(this.cloud.configured)await this.cloud.savePayment(p);this.payments.update(v=>[p,...v.filter(x=>x.id!==p.id)]);this.saveLocal();await this.auditAction('Payment recorded','Payments',{paymentId:id,residentId:resident.id,amount:p.amount,type:p.type});return p;}catch(e){await this.files.remove(file.path).catch(()=>{});throw e;}
  }

  private seedResidents():Resident[]{return[{id:'PG-DEMO-001',name:'Sample Resident',mobile:'9000000000',aadhaarLast4:'0001',photo:'SR',joined:new Date().toISOString().slice(0,10),status:'active',currentStayId:'DEMO-STAY-1',deposit:5000,billingCycle:'monthly',monthlyRent:8000,dailyRate:0,rentDueDay:5,documents:[],stays:[{id:'DEMO-STAY-1',roomId:'A-101',bedId:'A-101-B1',from:new Date().toISOString().slice(0,10),active:true}]}]}
  private seedRooms():Room[]{return[{id:'A-101',blockId:'A',floor:0,number:'101',sharing:2,rent:8000,beds:[{id:'A-101-B1',label:'Bed 1',status:'occupied',residentId:'PG-DEMO-001'},{id:'A-101-B2',label:'Bed 2',status:'vacant'}],attachedBath:true,ac:false,assets:{fans:1,geysers:1,taps:2,lights:2,cupboards:2,tables:0,chairs:0}}]}
}
