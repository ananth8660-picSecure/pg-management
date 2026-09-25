import { Injectable } from '@angular/core';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { AuditLog, Block, FloorInventory, Payment, Resident, Room, SharingRate } from './models';

@Injectable({providedIn:'root'})
export class CloudDataService{
  readonly configured:boolean;
  constructor(private fb:FirebaseService,private auth:AuthService){this.configured=fb.configured;}
  private tenantId(){const id=this.auth.user()?.tenantId;if(!id)throw new Error('No active PG workspace.');return id;}
  private col(name:string){return collection(this.fb.db!,'tenants',this.tenantId(),name);}
  private ref(name:string,id:string){return doc(this.fb.db!,'tenants',this.tenantId(),name,id);}


  watchCollection<T=any>(name:string,callback:(rows:T[])=>void,onError?:(error:any)=>void):Unsubscribe{
    if(!this.fb.configured)return()=>{};
    return onSnapshot(this.col(name),snap=>callback(snap.docs.map(d=>({...d.data(),id:d.id} as T))),err=>onError?.(err));
  }
  watchDocument<T=any>(name:string,id:string,callback:(value:T|null)=>void,onError?:(error:any)=>void):Unsubscribe{
    if(!this.fb.configured)return()=>{};
    return onSnapshot(this.ref(name,id),snap=>callback(snap.exists()?({...snap.data(),id:snap.id} as T):null),err=>onError?.(err));
  }

  async load(){
    if(!this.fb.configured) return null;
    const u=this.auth.user();
    const owner=u?.role==='owner';
    const can=(...permissions:string[])=>owner||permissions.some(p=>u?.permissions?.includes(p as any));
    const emptyDocs={docs:[]} as any;
    const [b,r,m,p,f,settings]=await Promise.all([
      can('dashboard','reports','property','amenities','vacancy','residents')?getDocs(this.col('blocks')):Promise.resolve(emptyDocs),
      can('dashboard','reports','property','amenities','vacancy','residents')?getDocs(this.col('rooms')):Promise.resolve(emptyDocs),
      can('dashboard','reports','notifications','residents','payments','documents')?getDocs(this.col('residents')):Promise.resolve(emptyDocs),
      can('dashboard','reports','notifications','payments')?getDocs(this.col('payments')):Promise.resolve(emptyDocs),
      can('reports','property','amenities')?getDocs(this.col('floorInventories')):Promise.resolve(emptyDocs),
      getDoc(this.ref('settings','app')).catch(()=>null as any)
    ]);
    const sd=settings?.exists?.()?settings.data():{};
    return {blocks:b.docs.map((x:any)=>x.data() as Block),rooms:r.docs.map((x:any)=>x.data() as Room),residents:m.docs.map((x:any)=>x.data() as Resident),payments:p.docs.map((x:any)=>x.data() as any),floorInventories:f.docs.map((x:any)=>x.data() as FloorInventory),managerAccess:Array.isArray(sd['managerAccess'])?sd['managerAccess']:undefined,sharingRates:Array.isArray(sd['sharingRates'])?sd['sharingRates'].map((x:any)=>({sharing:Number(x?.sharing)||0,amount:Number(x?.amount)||0})).filter((x:any)=>x.sharing>0):undefined};
  }
  async loadAuditLogs(){
    if(!this.fb.configured)return [] as AuditLog[];
    const s=await getDocs(this.col('auditLogs'));
    return s.docs.map(d=>{const v:any=d.data(),raw=v.createdAt;const createdAt=raw?.toDate?raw.toDate().toISOString():String(raw||v.clientTime||new Date().toISOString());return{id:d.id,actorUid:String(v.actorUid||''),actorName:String(v.actorName||'Unknown user'),actorRole:v.actorRole==='owner'||v.actorRole==='manager'?v.actorRole:'unknown',action:String(v.action||''),module:String(v.module||''),details:(v.details||{}) as Record<string,unknown>,createdAt} as AuditLog;}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,250);
  }
  async saveBlock(v:Block){if(this.fb.configured)await setDoc(this.ref('blocks',v.id),v,{merge:true});}
  async saveRoom(v:Room){if(this.fb.configured)await setDoc(this.ref('rooms',v.id),v,{merge:true});}
  async saveFloorInventory(v:FloorInventory){if(this.fb.configured)await setDoc(this.ref('floorInventories',v.id),v,{merge:true});}
  async deleteFloorInventory(id:string){if(this.fb.configured)await deleteDoc(this.ref('floorInventories',id));}
  async deleteRoom(id:string){if(this.fb.configured)await deleteDoc(this.ref('rooms',id));}
  async saveResident(v:Resident){if(this.fb.configured)await setDoc(this.ref('residents',v.id),v,{merge:true});}

  async checkInResidentAtomic(resident:Resident,roomId:string,bedId:string){
    if(!this.fb.configured)return null;
    return runTransaction(this.fb.db!,async tx=>{
      const roomRef=this.ref('rooms',roomId),roomSnap=await tx.get(roomRef);
      if(!roomSnap.exists())throw new Error('ROOM_NOT_FOUND');
      const room=roomSnap.data() as Room,bed=room.beds.find(b=>b.id===bedId);
      if(!bed||bed.status!=='vacant'||bed.residentId)throw new Error('TARGET_BED_OCCUPIED');
      const updatedRoom:Room={...room,beds:room.beds.map(b=>b.id===bedId?{...b,status:'occupied',residentId:resident.id}:b)};
      tx.set(roomRef,updatedRoom,{merge:true});tx.set(this.ref('residents',resident.id),resident,{merge:true});
      return{resident,room:updatedRoom};
    });
  }

  async restoreResidentAtomic(residentId:string,roomId:string,bedId:string){
    if(!this.fb.configured)return null;
    return runTransaction(this.fb.db!,async tx=>{
      const residentRef=this.ref('residents',residentId),roomRef=this.ref('rooms',roomId);
      const [residentSnap,roomSnap]=await Promise.all([tx.get(residentRef),tx.get(roomRef)]);
      if(!residentSnap.exists()||!roomSnap.exists())throw new Error('RESTORE_TARGET_MISSING');
      const resident=residentSnap.data() as Resident,room=roomSnap.data() as Room,bed=room.beds.find(b=>b.id===bedId);
      if(!bed||bed.status!=='vacant'||bed.residentId)throw new Error('TARGET_BED_OCCUPIED');
      const today=new Date().toISOString().slice(0,10),stayId=`ST-${Date.now()}`;
      const updatedResident:Resident={...resident,status:'active',currentStayId:stayId,stays:[...resident.stays.map(s=>s.active?{...s,active:false,to:today}:s),{id:stayId,roomId,bedId,from:today,active:true,reason:'restore'}]};
      const updatedRoom:Room={...room,beds:room.beds.map(b=>b.id===bedId?{...b,status:'occupied',residentId}:b)};
      tx.set(residentRef,updatedResident,{merge:true});tx.set(roomRef,updatedRoom,{merge:true});return{resident:updatedResident,room:updatedRoom};
    });
  }

  async checkoutResidentAtomic(residentId:string){
    if(!this.fb.configured)return null;
    return runTransaction(this.fb.db!,async tx=>{
      const residentRef=this.ref('residents',residentId),residentSnap=await tx.get(residentRef);if(!residentSnap.exists())throw new Error('RESIDENT_NOT_FOUND');
      const resident=residentSnap.data() as Resident,stay=resident.stays.find(s=>s.active),today=new Date().toISOString().slice(0,10);
      const updatedResident:Resident={...resident,status:'inactive',currentStayId:undefined,stays:resident.stays.map(s=>s.active?{...s,active:false,to:today}:s)};
      tx.set(residentRef,updatedResident,{merge:true});let room:Room|undefined;
      if(stay){const roomRef=this.ref('rooms',stay.roomId),roomSnap=await tx.get(roomRef);if(roomSnap.exists()){const current=roomSnap.data() as Room;room={...current,beds:current.beds.map(b=>b.id===stay.bedId?{...b,status:'vacant',residentId:undefined}:b)};tx.set(roomRef,room,{merge:true});}}
      return{resident:updatedResident,room};
    });
  }

  async transferResidentAtomic(residentId:string,targetRoomId:string,targetBedId:string,applyTargetRent=false){
    if(!this.fb.configured)return null;
    return runTransaction(this.fb.db!,async tx=>{
      const residentRef=this.ref('residents',residentId),residentSnap=await tx.get(residentRef);if(!residentSnap.exists())throw new Error('Resident record no longer exists.');
      const resident=residentSnap.data() as Resident,current=resident.stays.find(s=>s.active);if(!current)throw new Error('Resident has no active room allocation.');
      const sourceRef=this.ref('rooms',current.roomId),targetRef=this.ref('rooms',targetRoomId),sourceSnap=await tx.get(sourceRef),targetSnap=current.roomId===targetRoomId?sourceSnap:await tx.get(targetRef);if(!sourceSnap.exists()||!targetSnap.exists())throw new Error('Source or target room no longer exists.');
      const sourceRoom=sourceSnap.data() as Room,targetRoom=targetSnap.data() as Room,targetBed=targetRoom.beds.find(b=>b.id===targetBedId);if(!targetBed||targetBed.status!=='vacant'||targetBed.residentId)throw new Error('TARGET_BED_OCCUPIED');
      const today=new Date().toISOString().slice(0,10),stayId=`ST-${Date.now()}`;let updatedSource:Room,updatedTarget:Room;
      if(sourceRoom.id===targetRoom.id){const updated:Room={...sourceRoom,beds:sourceRoom.beds.map(b=>b.id===current.bedId?{...b,status:'vacant',residentId:undefined}:b.id===targetBedId?{...b,status:'occupied',residentId}:b)};updatedSource=updated;updatedTarget=updated;tx.set(sourceRef,updated,{merge:true});}
      else{updatedSource={...sourceRoom,beds:sourceRoom.beds.map(b=>b.id===current.bedId?{...b,status:'vacant',residentId:undefined}:b)};updatedTarget={...targetRoom,beds:targetRoom.beds.map(b=>b.id===targetBedId?{...b,status:'occupied',residentId}:b)};tx.set(sourceRef,updatedSource,{merge:true});tx.set(targetRef,updatedTarget,{merge:true});}
      const updatedResident:Resident={...resident,currentStayId:stayId,monthlyRent:applyTargetRent?targetRoom.rent:resident.monthlyRent,stays:[...resident.stays.map(s=>s.active?{...s,active:false,to:today}:s),{id:stayId,roomId:targetRoomId,bedId:targetBedId,from:today,active:true,reason:'transfer'}]};tx.set(residentRef,updatedResident,{merge:true});return{resident:updatedResident,sourceRoom:updatedSource,targetRoom:updatedTarget,fromRoomId:current.roomId,fromBedId:current.bedId};
    });
  }

  async loadModuleRows(name:string):Promise<any[]>{
    if(!this.fb.configured)return[];
    const allowed=['food','staff','maintenance','assets','utilities','expenses','vendors','calendar','documents','notifications'];
    if(!allowed.includes(name))return[];
    const snap=await getDocs(this.col(name));
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  }
  async saveModuleRow(name:string,id:string,row:Record<string,unknown>){
    if(!this.fb.configured)return;
    const allowed=['food','staff','maintenance','assets','utilities','expenses','vendors','calendar','documents','notifications'];
    if(!allowed.includes(name))throw new Error('Unsupported operations module.');
    await setDoc(this.ref(name,id),{...row,id,updatedAt:serverTimestamp()},{merge:true});
  }

  async deleteModuleRow(name:string,id:string){
    if(!this.fb.configured)return;
    const allowed=['food','staff','maintenance','assets','utilities','expenses','vendors','calendar','documents','notifications'];
    if(!allowed.includes(name))throw new Error('Unsupported operations module.');
    await deleteDoc(this.ref(name,id));
  }
  async exportTenantSnapshot(){
    if(!this.fb.configured)return{};
    const names=['blocks','rooms','floorInventories','residents','payments','food','staff','maintenance','assets','utilities','expenses','vendors','calendar','documents','notifications','auditLogs'];
    const entries=await Promise.all(names.map(async name=>{try{const snap=await getDocs(this.col(name));return[name,snap.docs.map(d=>({id:d.id,...d.data()}))] as const;}catch{return[name,[]] as const;}}));
    return Object.fromEntries(entries);
  }

  async savePayment(v:any){if(this.fb.configured)await setDoc(this.ref('payments',v.id),{...v,createdAt:serverTimestamp()});}
  async saveManagerAccess(managerAccess:string[]){if(this.fb.configured)await setDoc(this.ref('settings','app'),{managerAccess,updatedAt:serverTimestamp()},{merge:true});}
  async saveSharingRates(sharingRates:SharingRate[]){if(this.fb.configured)await setDoc(this.ref('settings','app'),{sharingRates,updatedAt:serverTimestamp()},{merge:true});}
  async audit(actor:any,action:string,module:string,details:any={}):Promise<AuditLog>{
    const id=`AUD-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,clientTime=new Date().toISOString();const item:AuditLog={id,actorUid:actor?.uid||'unknown',actorName:actor?.name||actor?.email||'Unknown user',actorRole:actor?.role||'unknown',action,module,details:{...details,tenantId:this.auth.user()?.tenantId||''},createdAt:clientTime};if(this.fb.configured)await setDoc(this.ref('auditLogs',id),{...item,clientTime,createdAt:serverTimestamp()});return item;
  }
}
