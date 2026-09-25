import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';

initializeApp();
const db=getFirestore();
const auth=getAuth();
const messaging=getMessaging();
const REGION='asia-south1';
const FIRESTORE_TRIGGER_REGION='asia-east2';
const MANAGER_PERMISSIONS=new Set(['dashboard','property','residents','vacancy','payments','food','staff','maintenance','assets','utilities','expenses','vendors','calendar','reports','documents','notifications','activity']);
function validEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function cleanPermissions(input:unknown){return Array.isArray(input)?[...new Set(input.map(String).filter(v=>MANAGER_PERMISSIONS.has(v)))]:[];}

type Recipient={uid:string;role:string;permissions:string[];forceLogoutAt?:string};

async function profile(uid:string){const s=await db.doc(`users/${uid}`).get();return s.exists?s.data() as any:null;}
async function requirePlatformOwner(uid:string){const p=await profile(uid);if(!p||p.active===false||p.platformRole!=='platform_owner')throw new HttpsError('permission-denied','Super Owner access is required.');return p;}
async function requireTenantOwner(uid:string,tenantId:string){const [tenant,member]=await Promise.all([db.doc(`tenants/${tenantId}`).get(),db.doc(`tenants/${tenantId}/members/${uid}`).get()]);if(!tenant.exists||tenant.data()?.active===false)throw new HttpsError('failed-precondition','PG workspace is not active.');if(!member.exists||member.data()?.active===false||member.data()?.role!=='owner')throw new HttpsError('permission-denied','PG Owner access is required.');return{tenant:tenant.data() as any,member:member.data() as any};}

export const createTenantUser=onCall({region:REGION},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Sign in first.');
  const tenantId=String(req.data?.tenantId||''),name=String(req.data?.name||'').trim(),email=String(req.data?.email||'').trim().toLowerCase(),password=String(req.data?.password||''),role=req.data?.role==='owner'?'owner':'manager',permissions=cleanPermissions(req.data?.permissions);
  if(!tenantId||!name||!validEmail(email)||password.length<8)throw new HttpsError('invalid-argument','Tenant, name, a valid email and an 8+ character temporary password are required.');
  await requireTenantOwner(req.auth.uid,tenantId);
  let user;
  try{user=await auth.createUser({email,password,displayName:name,emailVerified:false});}catch(e:any){throw new HttpsError('already-exists',e?.message||'Unable to create Firebase account.');}
  const now=new Date().toISOString(),batch=db.batch();
  batch.set(db.doc(`users/${user.uid}`),{uid:user.uid,email,name,active:true,platformRole:'tenant_user',activeTenantId:tenantId,tenantIds:[tenantId],createdAt:now,updatedAt:now,createdBy:req.auth.uid,updatedBy:req.auth.uid});
  batch.set(db.doc(`tenants/${tenantId}/members/${user.uid}`),{uid:user.uid,email,name,role,active:true,permissions:role==='owner'?[]:permissions,createdAt:now,updatedAt:now,createdBy:req.auth.uid,updatedBy:req.auth.uid,tenantId});
  try{await batch.commit();}catch(e){await auth.deleteUser(user.uid).catch(()=>undefined);throw new HttpsError('internal','Firebase account was rolled back because PG access could not be saved.');}
  return{uid:user.uid,email,name,role,active:true,permissions:role==='owner'?[]:permissions,tenantId};
});

export const createCustomerTenant=onCall({region:REGION},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Sign in first.');await requirePlatformOwner(req.auth.uid);
  const pgName=String(req.data?.pgName||'').trim(),shortName=String(req.data?.shortName||'').trim(),city=String(req.data?.city||'').trim(),ownerName=String(req.data?.ownerName||'').trim(),ownerEmail=String(req.data?.ownerEmail||'').trim().toLowerCase(),password=String(req.data?.password||'');
  if(!pgName||!ownerName||!validEmail(ownerEmail)||password.length<8)throw new HttpsError('invalid-argument','PG name, first Owner, a valid email and an 8+ character temporary password are required.');
  const slug=pgName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'pg',tenantId=`${slug}-${Date.now().toString(36).slice(-5)}`,now=new Date().toISOString();
  const owner=await auth.createUser({email:ownerEmail,password,displayName:ownerName});
  const actor=await profile(req.auth.uid),batch=db.batch();
  const tenant={id:tenantId,slug,name:pgName,shortName:shortName||pgName.slice(0,18),city,active:true,createdAt:now,createdBy:req.auth.uid,ownerUid:owner.uid,ownerName,ownerEmail,customerName:String(req.data?.customerName||ownerName).trim(),customerPhone:String(req.data?.customerPhone||'').trim(),soldAt:String(req.data?.soldAt||now.slice(0,10)),commercialNote:String(req.data?.commercialNote||'').trim(),memberCount:1,activeMemberCount:1,updatedAt:now,updatedBy:req.auth.uid};
  batch.set(db.doc(`tenants/${tenantId}`),tenant);batch.set(db.doc(`users/${owner.uid}`),{uid:owner.uid,email:ownerEmail,name:ownerName,active:true,platformRole:'tenant_user',activeTenantId:tenantId,tenantIds:[tenantId],createdAt:now,updatedAt:now,createdBy:req.auth.uid,updatedBy:req.auth.uid});batch.set(db.doc(`tenants/${tenantId}/members/${owner.uid}`),{uid:owner.uid,email:ownerEmail,name:ownerName,role:'owner',active:true,permissions:[],createdAt:now,updatedAt:now,createdBy:req.auth.uid,updatedBy:req.auth.uid,tenantId});
  if(req.auth.uid!==owner.uid)batch.set(db.doc(`tenants/${tenantId}/members/${req.auth.uid}`),{uid:req.auth.uid,email:actor?.email||'',name:actor?.name||'Super Owner',role:'owner',active:true,permissions:[],createdAt:now,updatedAt:now,createdBy:req.auth.uid,updatedBy:req.auth.uid,tenantId,platformOversight:true});
  const auditId=`PLAT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;batch.set(db.doc(`platformAuditLogs/${auditId}`),{id:auditId,action:'Customer PG created',tenantId,details:{ownerEmail,customerName:tenant.customerName},actorUid:req.auth.uid,actorName:actor?.name||actor?.email||'Super Owner',createdAt:now});
  try{await batch.commit();}catch(e){await auth.deleteUser(owner.uid).catch(()=>undefined);throw new HttpsError('internal','Customer Owner account was rolled back because the PG workspace could not be saved.');}return tenant;
});

async function recipients(tenantId:string,ownersOnly=false,bypassTenantState=false){
  const [tenantSnap,membersSnap,tokensSnap]=await Promise.all([db.doc(`tenants/${tenantId}`).get(),db.collection(`tenants/${tenantId}/members`).get(),db.collection(`tenants/${tenantId}/pushTokens`).get()]);
  if(!tenantSnap.exists||(!bypassTenantState&&tenantSnap.data()?.active===false))return{tokens:[] as string[],uids:[] as string[]};
  const tenantForce=String(tenantSnap.data()?.forceLogoutAt||'');const members=new Map<string,Recipient>();
  for(const d of membersSnap.docs){const v=d.data();if(v.platformOversight===true||v.active===false)continue;const role=String(v.role||'');const perms=Array.isArray(v.permissions)?v.permissions.map(String):[];if(role==='owner'||(!ownersOnly&&role==='manager'&&perms.includes('notifications')))members.set(d.id,{uid:d.id,role,permissions:perms,forceLogoutAt:String(v.forceLogoutAt||'')});}
  const validTokens:string[]=[],uids:string[]=[];
  for(const d of tokensSnap.docs){const t=d.data(),m=members.get(String(t.uid||''));if(!m||!t.token)continue;const updated=t.updatedAt instanceof Timestamp?t.updatedAt.toDate():new Date(0);const cutoff=[tenantForce,m.forceLogoutAt||''].filter(Boolean).map(x=>new Date(x)).sort((a,b)=>b.getTime()-a.getTime())[0];if(!bypassTenantState&&cutoff&&updated<=cutoff)continue;validTokens.push(String(t.token));uids.push(m.uid);}
  return{tokens:[...new Set(validTokens)],uids:[...new Set(uids)]};
}
async function sendPush(tenantId:string,title:string,body:string,data:Record<string,string>={},ownersOnly=false,excludeUid='',bypassTenantState=false){
  const rec=await recipients(tenantId,ownersOnly,bypassTenantState);if(!rec.tokens.length)return;
  const memberTokens=await db.collection(`tenants/${tenantId}/pushTokens`).get();const filtered:string[]=[];for(const d of memberTokens.docs){const v=d.data();if(String(v.uid||'')===excludeUid)continue;if(rec.tokens.includes(String(v.token||'')))filtered.push(String(v.token));}
  for(let i=0;i<filtered.length;i+=500){const chunk=filtered.slice(i,i+500);if(!chunk.length)continue;const res=await messaging.sendEachForMulticast({tokens:chunk,notification:{title,body},data:{...data,title,body},webpush:{fcmOptions:{link:data.url||'/notifications'},notification:{icon:'/favicon.svg',badge:'/favicon.svg',tag:data.tag||'pg-ops'}}});
    const dead:string[]=[];res.responses.forEach((r,idx)=>{const code=(r.error as any)?.code||'';if(!r.success&&(code.includes('registration-token-not-registered')||code.includes('invalid-registration-token')))dead.push(chunk[idx]);});if(dead.length){const snaps=await db.collection(`tenants/${tenantId}/pushTokens`).where('token','in',dead.slice(0,30)).get().catch(()=>null);if(snaps){const batch=db.batch();snaps.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}}
  }
}
async function addNotification(tenantId:string,id:string,type:string,message:string,priority='Normal',extra:Record<string,unknown>={}){await db.doc(`tenants/${tenantId}/notifications/${id}`).set({id,time:new Date().toISOString(),createdAt:new Date().toISOString(),type,message,priority,status:'Active',source:'system',...extra},{merge:true});}

export const notifyTenantAudit=onDocumentCreated({document:'tenants/{tenantId}/auditLogs/{auditId}',region:FIRESTORE_TRIGGER_REGION},async event=>{
  const v=event.data?.data() as any;if(!v)return;const tid=event.params.tenantId,actor=String(v.actorName||'PG user'),role=String(v.actorRole||'user'),action=String(v.action||'Updated PG data'),module=String(v.module||'Operations'),actorUid=String(v.actorUid||'');
  if(module.toLowerCase().includes('notification'))return; // avoids a read/create notification causing another notification loop
  const id=`change-${event.params.auditId}`;await addNotification(tid,id,'Change',`${actor} (${role}) · ${action}`,'Normal',{module,actorUid});await sendPush(tid,`${actor} updated ${module}`,action,{url:'/notifications',tag:id},false,actorUid);
});

export const notifyPlatformAudit=onDocumentCreated({document:'platformAuditLogs/{logId}',region:FIRESTORE_TRIGGER_REGION},async event=>{
  const v=event.data?.data() as any;if(!v?.tenantId)return;const tid=String(v.tenantId),action=String(v.action||'Platform access updated'),id=`platform-${event.params.logId}`;await addNotification(tid,id,'Platform',`PG Ops provider · ${action}`,'High',{platform:true});await sendPush(tid,'PG Ops platform update',action,{url:'/notifications',tag:id},true,'',true);
});

function indiaNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));}
function daysInMonth(y:number,m:number){return new Date(y,m,0).getDate();}
export const dailyRentNotifications=onSchedule({schedule:'0 8 * * *',timeZone:'Asia/Kolkata',region:REGION},async()=>{
  const now=indiaNow(),y=now.getFullYear(),month=now.getMonth()+1,day=now.getDate(),ym=`${y}-${String(month).padStart(2,'0')}`,today=`${ym}-${String(day).padStart(2,'0')}`;const tenants=await db.collection('tenants').where('active','!=',false).get();
  for(const t of tenants.docs){const tid=t.id;const [residents,payments]=await Promise.all([db.collection(`tenants/${tid}/residents`).where('status','==','active').get(),db.collection(`tenants/${tid}/payments`).get()]);
    for(const r of residents.docs){const v=r.data() as any;if((v.billingCycle||'monthly')!=='monthly')continue;const dueDay=Math.min(daysInMonth(y,month),Math.max(1,Number(v.rentDueDay||5))),rent=Number(v.monthlyRent||0);if(rent<=0)continue;const paid=payments.docs.filter(p=>{const x=p.data() as any;return String(x.residentId||'')===r.id&&String(x.type||'')==='Rent'&&(String(x.billingMonth||'')===ym||String(x.date||'').startsWith(ym));}).reduce((n,p)=>n+Number((p.data() as any).amount||0),0),balance=Math.max(0,rent-paid);if(!balance)continue;const status=day===dueDay?'Due Today':day>dueDay?'Overdue':'';if(!status)continue;const room=(Array.isArray(v.stays)?v.stays.find((s:any)=>s.active)?.roomId:'')||'Room';const id=`rent-${ym}-${r.id}-${status==='Due Today'?'due':'overdue'}`,message=`${v.name||'Resident'} · ${room} · ₹${balance.toLocaleString('en-IN')} ${status==='Due Today'?'due today':'overdue'}`;await addNotification(tid,id,'Rent',message,'High',{residentId:r.id,status});await sendPush(tid,status==='Due Today'?'Rent due today':'Rent overdue',message,{url:'/payments',tag:id});}
  }
});
