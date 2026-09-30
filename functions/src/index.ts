import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret, defineString} from 'firebase-functions/params';

initializeApp();
const db=getFirestore();
const auth=getAuth();
const messaging=getMessaging();
const REGION='asia-south1';
const FIRESTORE_TRIGGER_REGION='asia-east2';
const RESEND_API_KEY=defineSecret('RESEND_API_KEY');
const MAIL_FROM=defineString('MAIL_FROM',{default:'PG Management <noreply@pg.picsecure.in>'});
const MANAGER_PERMISSIONS=new Set(['dashboard','property','residents','vacancy','payments','food','staff','maintenance','assets','utilities','expenses','vendors','calendar','reports','documents','notifications','activity']);
function validEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function cleanPermissions(input:unknown){return Array.isArray(input)?[...new Set(input.map(String).filter(v=>MANAGER_PERMISSIONS.has(v)))]:[];}

type Recipient={uid:string;role:string;permissions:string[];forceLogoutAt?:string};

function esc(v:unknown){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]||c));}
type MailResult={ok:boolean;retryable:boolean;error?:string};
async function sendResidentEmail(to:string,subject:string,html:string,replyTo?:string):Promise<MailResult>{
  if(!validEmail(to))return{ok:false,retryable:false,error:'Invalid email address.'};
  let key='';try{key=RESEND_API_KEY.value();}catch{key='';}
  if(!key)return{ok:false,retryable:false,error:'Email service is not configured.'};
  const body:any={from:MAIL_FROM.value(),to:[to],subject,html};if(replyTo&&validEmail(replyTo))body.reply_to=replyTo;
  let response:Response;
  try{response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch(e){console.error('Resident email network error',e);return{ok:false,retryable:true,error:'Email service could not be reached.'};}
  if(!response.ok){const details=await response.text().catch(()=>String(response.status));console.error('Resident email failed',response.status,details);return{ok:false,retryable:response.status===429||response.status>=500,error:details.slice(0,300)};}
  return{ok:true,retryable:false};
}
function fmtDate(v:string){const d=new Date(`${v}T12:00:00`);return Number.isNaN(d.getTime())?v:d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
function nextRentDue(paymentDate:string,dueDay:number){const d=new Date(`${paymentDate}T12:00:00`);if(Number.isNaN(d.getTime()))return paymentDate;let y=d.getFullYear(),m=d.getMonth()+1;if(m>11){m=0;y++;}const last=new Date(y,m+1,0).getDate();return `${y}-${String(m+1).padStart(2,'0')}-${String(Math.max(1,Math.min(last,dueDay||5))).padStart(2,'0')}`;}
function receiptHtml(input:{pgName:string;residentName:string;paymentId:string;type:string;amount:number;mode:string;date:string;room:string;status:string;billingMonth?:string;nextDue?:string;templateId?:string;contactEmail?:string;contactPhone?:string;address?:string;signatureName?:string;signatureStyle?:string;actualRent?:number;agreedRent?:number}){
  const themes:Record<string,{primary:string;accent:string;soft:string;ink:string;border:string;deep:string;ornament:string}>= {
    'modern-blue':{primary:'#0b3f8f',accent:'#2a8ae8',soft:'#eaf4ff',ink:'#14213d',border:'#b9dcff',deep:'#062d68',ornament:'◆'},
    'botanical-green':{primary:'#14532d',accent:'#3f8a5a',soft:'#eef8ea',ink:'#17351f',border:'#cae5c7',deep:'#0d3d20',ornament:'❦'},
    'floral-purple':{primary:'#6d28d9',accent:'#a855f7',soft:'#f7efff',ink:'#2e1854',border:'#e2c9fb',deep:'#4c1d95',ornament:'✦'},
    'corporate-red':{primary:'#b91c1c',accent:'#ef4444',soft:'#fff1f1',ink:'#3f1515',border:'#ffcaca',deep:'#7f1d1d',ornament:'◆'}
  };const t=themes[input.templateId||'modern-blue']||themes['modern-blue'];
  const paid=Number(input.amount||0),actual=Number(input.actualRent||0),agreed=Number(input.agreedRent||0),discount=Math.max(0,actual&&agreed?actual-agreed:0),month=input.billingMonth?new Date(`${input.billingMonth}-01T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'}):new Date(`${input.date}T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const rawSignature=String(input.signatureName||'').trim()||'Authorized Signatory',signature=esc(rawSignature),signatureStyle=String(input.signatureStyle||'elegant');
  const signatureSize=rawSignature.length>28?13:rawSignature.length>22?14:rawSignature.length>16?15:16;
  const signatureFont=signatureStyle==='classic'?"Georgia,'Times New Roman',serif":signatureStyle==='modern'?"'Trebuchet MS','Segoe UI',sans-serif":"'Segoe Script','Lucida Handwriting','Brush Script MT',cursive";
  const signatureTransform=signatureStyle==='modern'?'skewX(-8deg)':signatureStyle==='elegant'?'rotate(-3deg)':'none';
  const signatureWeight=signatureStyle==='elegant'?'500':'700';
  const psLogo='https://pg.picsecure.in/branding/picsecure-ps.png';
  const row=(label:string,value:string,shade=false)=>`<tr${shade?` style="background:${t.soft}"`:''}><td style="padding:9px 12px;color:#64748b;font-size:12px;border-bottom:1px solid ${t.border}66">${esc(label)}</td><td style="padding:9px 12px;text-align:right;font-size:12px;font-weight:800;color:${t.ink};border-bottom:1px solid ${t.border}66">${value}</td></tr>`;
  return `<div style="margin:0;background:#f3f6fb;padding:26px 12px;font-family:Arial,Helvetica,sans-serif;color:${t.ink}">
  <div style="max-width:840px;margin:0 auto;background:#fff;border:1px solid ${t.border};border-radius:26px;overflow:hidden;box-shadow:0 18px 54px rgba(15,23,42,.14)">
    <div style="height:8px;background:linear-gradient(90deg,${t.deep},${t.accent},${t.deep})"></div>
    <div style="padding:22px 26px 16px;background:linear-gradient(135deg,#ffffff 20%,${t.soft})">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle"><div style="font-size:26px;font-weight:900;color:${t.deep};letter-spacing:.01em">${esc(input.pgName)}</div><div style="margin-top:6px;color:#64748b;font-size:11px">${esc(input.address||'')}</div></td>
        <td align="right" valign="middle" style="font-size:11px;line-height:1.7;color:#64748b">${esc(input.contactPhone||'')}<br>${esc(input.contactEmail||'')}</td>
      </tr></table>
    </div>
    <div style="padding:0 26px 16px;background:linear-gradient(135deg,#ffffff 20%,${t.soft})"><table width="100%"><tr><td align="center" style="padding:13px 16px;border-radius:14px;background:linear-gradient(90deg,${t.deep},${t.accent});color:#fff"><div style="font-size:23px;font-weight:900;letter-spacing:.08em">${t.ornament} &nbsp; RENT RECEIPT &nbsp; ${t.ornament}</div><div style="font-size:9px;letter-spacing:.16em;margin-top:4px;opacity:.88">THANK YOU FOR YOUR PAYMENT</div></td></tr></table></div>
    <div style="padding:0 26px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr>
        <td style="padding:12px 14px;background:${t.soft};border:1px solid ${t.border};border-radius:14px"><div style="font-size:10px;color:#64748b">Receipt No.</div><div style="font-size:15px;font-weight:900;color:${t.primary};margin-top:3px">${esc(input.paymentId)}</div></td>
        <td width="10"></td>
        <td style="padding:12px 14px;background:#fff;border:1px solid ${t.border};border-radius:14px"><div style="font-size:10px;color:#64748b">Payment Date</div><div style="font-size:15px;font-weight:900;margin-top:3px">${esc(fmtDate(input.date))}</div></td>
        <td width="10"></td>
        <td style="padding:12px 14px;background:${t.soft};border:1px solid ${t.border};border-radius:14px"><div style="font-size:10px;color:#64748b">Next Payment Due</div><div style="font-size:15px;font-weight:900;color:${t.primary};margin-top:3px">${esc(fmtDate(input.nextDue||input.date))}</div></td>
      </tr></table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" width="62%"><div style="border:1px solid ${t.border};border-radius:16px;overflow:hidden"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${row('Tenant Name',esc(input.residentName))}${row('Room No.',esc(input.room),true)}${row('Month',esc(month))}${row('Payment Date',esc(fmtDate(input.date)),true)}${row('Payment Mode',esc(input.mode||'—'))}${row('Transaction ID',esc(input.paymentId),true)}</table></div></td>
        <td width="14"></td>
        <td valign="top"><div style="border:1px solid ${t.border};background:linear-gradient(145deg,#fff,${t.soft});padding:18px 14px;border-radius:16px;text-align:center;box-shadow:0 8px 22px rgba(15,23,42,.06)"><div style="font-size:11px;color:#64748b">Amount Paid</div><div style="font-size:30px;font-weight:900;color:${t.primary};margin:7px 0">₹ ${paid.toLocaleString('en-IN')}</div><span style="display:inline-block;background:#dcfce7;color:#15803d;border-radius:999px;padding:6px 13px;font-size:11px;font-weight:900">✓ ${esc(input.status||'PAID').toUpperCase()}</span><div style="height:1px;background:${t.border};margin:13px 0"></div><div style="font-size:10px;color:#64748b">Next Payment Due</div><div style="font-size:15px;font-weight:900;color:${t.primary};margin-top:4px">${esc(fmtDate(input.nextDue||input.date))}</div></div></td>
      </tr></table>
      ${actual?`<table width="100%" style="margin-top:13px;border-collapse:separate;border-spacing:0;border:1px solid ${t.border};border-radius:14px;overflow:hidden;background:${t.soft}"><tr><td style="padding:10px 12px;font-size:10px;color:#64748b">Actual Room Rent<br><b style="font-size:14px;color:${t.ink}">₹${actual.toLocaleString('en-IN')}</b></td><td style="padding:10px 12px;font-size:10px;color:#64748b">Tenant Rent<br><b style="font-size:14px;color:${t.ink}">₹${(agreed||actual).toLocaleString('en-IN')}</b></td><td style="padding:10px 12px;font-size:10px;color:#64748b">Difference<br><b style="font-size:14px;color:${t.primary}">₹${discount.toLocaleString('en-IN')}</b></td></tr></table>`:''}
      <table width="100%" style="margin-top:14px"><tr><td style="padding:13px 15px;border-radius:14px;background:${t.soft};font-size:12px"><b style="color:${t.primary}">Thank you for your payment!</b><br><span style="color:#64748b">Your stay with us makes our community stronger.</span></td><td width="18"></td><td align="center" style="width:190px;padding:4px 8px 5px"><div style="font-family:${signatureFont};font-size:${signatureSize}px;line-height:1;color:#2563eb;font-style:italic;font-weight:${signatureWeight};transform:${signatureTransform};white-space:nowrap;max-width:180px;overflow:hidden">${signature}</div><div style="margin-top:6px;padding-top:6px;border-top:1px solid #94a3b8;font-size:10px;color:#64748b">Authorized Signature</div></td></tr></table>
    </div>
    <div style="padding:11px 18px 14px;border-top:1px solid #eef2f7;text-align:center;color:#94a3b8;font-size:9px;background:#fff"><span style="display:inline-block;vertical-align:middle"><img src="${psLogo}" alt="PS" width="16" height="16" style="vertical-align:middle;object-fit:contain;margin-right:4px">Powered by <b style="color:${t.primary}">PicSecure</b></span></div>
    <div style="height:5px;background:linear-gradient(90deg,${t.deep},${t.accent},${t.deep})"></div>
  </div></div>`;
}

function dueHtml(input:{pgName:string;residentName:string;amount:number;dueDate:string;room:string;status:string}){
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f6f8fc;padding:28px;color:#172033"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e5eaf2;border-radius:24px;overflow:hidden"><div style="padding:24px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff"><div style="font-size:12px;letter-spacing:.16em;font-weight:800">PG MANAGEMENT</div><h1 style="margin:8px 0 0;font-size:24px">Rent Reminder</h1></div><div style="padding:26px"><p>Hello <b>${esc(input.residentName)}</b>,</p><p>This is a rent reminder for <b>${esc(input.pgName)}</b>.</p><div style="margin:20px 0;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa"><div style="color:#9a3412;font-size:12px;font-weight:800;letter-spacing:.08em">${esc(input.status).toUpperCase()}</div><div style="font-size:28px;font-weight:900;margin-top:6px">₹${Number(input.amount||0).toLocaleString('en-IN')}</div><div style="color:#64748b;margin-top:6px">Room ${esc(input.room)} · Due ${esc(input.dueDate)}</div></div><p>Please contact the PG office if this payment has already been made.</p></div><div style="padding:16px;text-align:center;border-top:1px solid #eef2f7;color:#94a3b8;font-size:12px">Powered by <b style="color:#2563eb">PicSecure</b></div></div></div>`;
}


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

function notificationTarget(module:string,details:any={}){
  const key=String(module||'').toLowerCase();
  if(key.includes('resident'))return '/residents';
  if(key.includes('payment')||key.includes('rent'))return '/payments';
  if(key.includes('staff')||key.includes('worker'))return '/staff';
  if(key.includes('maintenance')||key.includes('repair'))return '/maintenance';
  if(key.includes('amenit'))return '/amenities';
  if(key.includes('property')||key.includes('room')||key.includes('floor'))return '/property';
  if(key.includes('food')||key.includes('kitchen'))return '/food';
  if(key.includes('asset'))return '/assets';
  if(key.includes('utilit'))return '/utilities';
  if(key.includes('expense'))return '/expenses';
  if(key.includes('vendor')||key.includes('purchase'))return '/vendors';
  if(key.includes('calendar')||key.includes('task'))return '/calendar';
  if(key.includes('document'))return '/documents';
  if(key.includes('report'))return '/reports';
  if(key.includes('profile')||key.includes('access'))return '/profile';
  if(key.includes('setting')||key.includes('brand'))return '/settings';
  return '/notifications';
}

async function recipients(tenantId:string,ownersOnly=false,bypassTenantState=false){
  const [tenantSnap,membersSnap,tokensSnap]=await Promise.all([db.doc(`tenants/${tenantId}`).get(),db.collection(`tenants/${tenantId}/members`).get(),db.collection(`tenants/${tenantId}/pushTokens`).get()]);
  if(!tenantSnap.exists||(!bypassTenantState&&tenantSnap.data()?.active===false))return{tokens:[] as string[],uids:[] as string[]};
  const tenantForce=String(tenantSnap.data()?.forceLogoutAt||'');const members=new Map<string,Recipient>();
  for(const d of membersSnap.docs){const v=d.data();if(v.platformOversight===true||v.active===false)continue;const role=String(v.role||'');const perms=Array.isArray(v.permissions)?v.permissions.map(String):[];const managerEligible=perms.includes('notifications')||perms.includes('payments');if(role==='owner'||(!ownersOnly&&role==='manager'&&managerEligible))members.set(d.id,{uid:d.id,role,permissions:perms,forceLogoutAt:String(v.forceLogoutAt||'')});}
  const validTokens:string[]=[],uids:string[]=[];
  for(const d of tokensSnap.docs){const t=d.data(),m=members.get(String(t.uid||''));if(!m||!t.token)continue;const updated=t.updatedAt instanceof Timestamp?t.updatedAt.toDate():new Date(0);const cutoff=[tenantForce,m.forceLogoutAt||''].filter(Boolean).map(x=>new Date(x)).sort((a,b)=>b.getTime()-a.getTime())[0];if(!bypassTenantState&&cutoff&&updated<=cutoff)continue;validTokens.push(String(t.token));uids.push(m.uid);}
  return{tokens:[...new Set(validTokens)],uids:[...new Set(uids)]};
}
async function sendPush(tenantId:string,title:string,body:string,data:Record<string,string>={},ownersOnly=false,excludeUid='',bypassTenantState=false){
  const rec=await recipients(tenantId,ownersOnly,bypassTenantState);if(!rec.tokens.length)return;
  const memberTokens=await db.collection(`tenants/${tenantId}/pushTokens`).get();const filtered:string[]=[];for(const d of memberTokens.docs){const v=d.data();if(String(v.uid||'')===excludeUid)continue;if(rec.tokens.includes(String(v.token||'')))filtered.push(String(v.token));}
  for(let i=0;i<filtered.length;i+=500){const chunk=filtered.slice(i,i+500);if(!chunk.length)continue;const res=await messaging.sendEachForMulticast({tokens:chunk,notification:{title,body},data:{...data,title,body},android:{priority:String(data.priority||'').toLowerCase()==='high'?'high':'normal',notification:{icon:'ic_stat_pg_notification',color:'#5B5CF6',sound:'default',channelId:'pg_management_alerts',tag:data.tag||'pg-management'}},webpush:{fcmOptions:{link:data.url||'/notifications'},notification:{icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag||'pg-management',requireInteraction:String(data.priority||'').toLowerCase()==='high'}}});
    const dead:string[]=[];res.responses.forEach((r,idx)=>{const code=(r.error as any)?.code||'';if(!r.success&&(code.includes('registration-token-not-registered')||code.includes('invalid-registration-token')))dead.push(chunk[idx]);});if(dead.length){const snaps=await db.collection(`tenants/${tenantId}/pushTokens`).where('token','in',dead.slice(0,30)).get().catch(()=>null);if(snaps){const batch=db.batch();snaps.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}}
  }
}
async function addNotification(tenantId:string,id:string,type:string,message:string,priority='Normal',extra:Record<string,unknown>={}){await db.doc(`tenants/${tenantId}/notifications/${id}`).set({id,time:new Date().toISOString(),createdAt:new Date().toISOString(),type,message,priority,status:'Active',source:'system',targetUrl:'/notifications',ownerOnly:true,...extra},{merge:true});}

function auditPushTitle(action:string,module:string){
  const a=String(action||'').toLowerCase(),m=String(module||'').toLowerCase();
  if(/resident checked in|resident added/.test(a))return 'New tenant added';
  if(/resident checked out/.test(a))return 'Tenant checked out';
  if(/resident room transferred/.test(a))return 'Tenant room changed';
  if(/resident profile updated/.test(a))return 'Tenant updated';
  if(m.includes('maintenance')||m.includes('repair'))return /created|added|new issue/.test(a)?'Repair added':'Repair updated';
  if(/room added/.test(a))return 'Room added';
  if(/bed added/.test(a))return 'Bed added';
  if(m.includes('staff')||m.includes('worker'))return /created|added/.test(a)?'Staff added':'Staff updated';
  if(m.includes('document'))return 'Document updated';
  if(m.includes('setting')||m.includes('profile')||m.includes('access'))return 'PG settings updated';
  return `${module||'PG Management'} updated`;
}

export const notifyTenantAudit=onDocumentCreated({document:'tenants/{tenantId}/auditLogs/{auditId}',region:FIRESTORE_TRIGGER_REGION},async event=>{
  const v=event.data?.data() as any;if(!v)return;const tid=event.params.tenantId,actor=String(v.actorName||'PG user'),role=String(v.actorRole||'user'),action=String(v.action||'Updated PG data'),module=String(v.module||'Operations'),actorUid=String(v.actorUid||''),details=v.details||{};
  if(module.toLowerCase().includes('notification'))return;if(module.toLowerCase().includes('payment')&&/payment recorded/i.test(action))return;
  const id=`change-${event.params.auditId}`,targetUrl=notificationTarget(module,details),priority=/delete|removed|checkout|forced logout|access|password|security/i.test(action)?'High':'Normal',title=auditPushTitle(action,module);
  await addNotification(tid,id,'Change',`${actor} (${role}) · ${action}`,priority,{module,actorUid,targetUrl,ownerOnly:true,entityId:String(details?.residentId||details?.paymentId||details?.staffId||details?.id||'')});
  // R154: Owner receives every important workspace change, including changes made on the same Owner account/device.
  // Managers keep the existing restricted notification scope (rent-related only).
  await sendPush(tid,title,`${actor} · ${action}`,{url:targetUrl,tag:id,priority,module,action},true,'');
});


export const notifyPaymentCreated=onDocumentCreated({document:'tenants/{tenantId}/payments/{paymentId}',region:FIRESTORE_TRIGGER_REGION,secrets:[RESEND_API_KEY]},async event=>{
  const p=event.data?.data() as any;if(!p)return;const tid=event.params.tenantId,paymentId=event.params.paymentId,type=String(p.type||'Payment'),residentId=String(p.residentId||''),amount=Number(p.amount||0),residentName=String(p.residentName||'Resident'),room=String(p.roomId||'Room'),status=String(p.status||'Paid');
  const isRent=type.toLowerCase()==='rent',id=`payment-${paymentId}`,message=`${residentName} · ${type} ₹${amount.toLocaleString('en-IN')} · ${status}`;
  await addNotification(tid,id,isRent?'Rent':'Payment',message,'Normal',{paymentId,residentId,targetUrl:'/payments',ownerOnly:!isRent});
  await sendPush(tid,isRent?'Rent payment received':`${type} payment received`,message,{url:'/payments',tag:id,paymentId,residentId,priority:'Normal'},!isRent);
  // Email policy: only a Rent payment sends ONE receipt email, to the resident. No owner copy.
  if(isRent&&residentId){
    const [residentSnap,tenantSnap]=await Promise.all([
      db.doc(`tenants/${tid}/residents/${residentId}`).get(),
      db.doc(`tenants/${tid}`).get()
    ]);
    const resident=residentSnap.data() as any,tenant=tenantSnap.data() as any;
    const residentEmail=String(resident?.email||'').trim().toLowerCase();
    const pgName=String(tenant?.name||tenant?.shortName||'PG Management');
    const settings=tenant?.receiptEmail||{};
    const ownerEmail=String(settings.contactEmail||tenant?.ownerEmail||'').trim().toLowerCase();
    const paymentDate=String(p.date||new Date().toISOString().slice(0,10));
    const dueDay=Math.max(1,Math.min(31,Number(resident?.rentDueDay||5)));
    const nextDue=nextRentDue(paymentDate,dueDay);
    const html=receiptHtml({pgName,residentName:resident?.name||residentName,paymentId,type,amount,mode:String(p.mode||''),date:paymentDate,room,status,billingMonth:String(p.billingMonth||''),nextDue,templateId:String(settings.templateId||'modern-blue'),contactEmail:ownerEmail,contactPhone:String(settings.contactPhone||tenant?.customerPhone||''),address:String(settings.address||tenant?.city||''),signatureName:String(settings.signatureName||tenant?.ownerName||'Authorized Signatory'),signatureStyle:String(settings.signatureStyle||'elegant'),actualRent:Number(resident?.standardMonthlyRent||0),agreedRent:Number(resident?.monthlyRent||0)});
    if(validEmail(residentEmail)){
      const subject=`${type} receipt · ${pgName}`,result=await sendResidentEmail(residentEmail,subject,html,ownerEmail);
      // Daily quota / temporary outage: keep the receipt and let retryQueuedMail deliver it later.
      if(!result.ok&&result.retryable){
        const now=new Date().toISOString();
        await db.doc(`tenants/${tid}/mailQueue/receipt-${paymentId}`).set({kind:'receipt',paymentId,residentId,to:residentEmail,subject,html,replyTo:validEmail(ownerEmail)?ownerEmail:'',status:'pending',attempts:1,lastError:String(result.error||''),createdAt:now,updatedAt:now});
      }
    }
  }
});

export const notifyPlatformAudit=onDocumentCreated({document:'platformAuditLogs/{logId}',region:FIRESTORE_TRIGGER_REGION},async event=>{
  const v=event.data?.data() as any;if(!v?.tenantId)return;const tid=String(v.tenantId),action=String(v.action||'Platform access updated'),id=`platform-${event.params.logId}`,targetUrl='/profile';await addNotification(tid,id,'Platform',`PG Management provider · ${action}`,'High',{platform:true,targetUrl,ownerOnly:true});await sendPush(tid,'PG Management platform update',action,{url:targetUrl,tag:id,priority:'High'},true,'',true);
});

function indiaNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));}
function daysInMonth(y:number,m:number){return new Date(y,m,0).getDate();}
export const dailyRentNotifications=onSchedule({schedule:'0 8 * * *',timeZone:'Asia/Kolkata',region:REGION},async()=>{
  // Reminders are push notifications for PG staff only. Resident emails are sent manually by the Owner (sendRentReminderEmail).
  const now=indiaNow(),y=now.getFullYear(),month=now.getMonth()+1,day=now.getDate(),ym=`${y}-${String(month).padStart(2,'0')}`,today=`${ym}-${String(day).padStart(2,'0')}`;const tenants=await db.collection('tenants').where('active','!=',false).get();
  for(const t of tenants.docs){const tid=t.id;const [residents,payments]=await Promise.all([db.collection(`tenants/${tid}/residents`).where('status','==','active').get(),db.collection(`tenants/${tid}/payments`).get()]);
    for(const r of residents.docs){const v=r.data() as any;if((v.billingCycle||'monthly')!=='monthly')continue;const dueDay=Math.min(daysInMonth(y,month),Math.max(1,Number(v.rentDueDay||5))),rent=Number(v.monthlyRent||0);if(rent<=0)continue;const paid=payments.docs.filter(p=>{const x=p.data() as any;return String(x.residentId||'')===r.id&&String(x.type||'')==='Rent'&&(String(x.billingMonth||'')===ym||String(x.date||'').startsWith(ym));}).reduce((n,p)=>n+Number((p.data() as any).amount||0),0),balance=Math.max(0,rent-paid);if(!balance)continue;const status=day===dueDay?'Due Today':day>dueDay?'Overdue':'';if(!status)continue;const room=(Array.isArray(v.stays)?v.stays.find((s:any)=>s.active)?.roomId:'')||'Room';const id=`rent-${ym}-${r.id}-${status==='Due Today'?'due':'overdue'}`,message=`${v.name||'Resident'} · ${room} · ₹${balance.toLocaleString('en-IN')} ${status==='Due Today'?'due today':'overdue'}`;await addNotification(tid,id,'Rent',message,'High',{residentId:r.id,status,targetUrl:'/payments',ownerOnly:false});await sendPush(tid,status==='Due Today'?'Rent due today':'Rent overdue',message,{url:'/payments',tag:id,priority:'High'},false);}
  }
});


export const dailyStaffSalaryNotifications=onSchedule({schedule:'15 8 * * *',timeZone:'Asia/Kolkata',region:REGION},async()=>{
  const now=indiaNow();now.setHours(12,0,0,0);const y=now.getFullYear(),m=now.getMonth(),currentMonth=`${y}-${String(m+1).padStart(2,'0')}`;const tenants=await db.collection('tenants').where('active','!=',false).get();
  for(const t of tenants.docs){const tid=t.id,staff=await db.collection(`tenants/${tid}/staff`).get();
    for(const d of staff.docs){const v=d.data() as any;if(String(v.status||'Active').toLowerCase()==='inactive')continue;const salary=Number(v.salaryAmount||0);if(!Number.isFinite(salary)||salary<=0)continue;const dueDay=Math.max(1,Math.min(28,Number(v.salaryDueDay||5))),reminderDays=Math.max(0,Math.min(15,Number(v.salaryReminderDays??3)));let due=new Date(y,m,dueDay,12,0,0,0),dueMonth=currentMonth;const lastPaid=String(v.salaryLastPaidMonth||'');if(lastPaid>=currentMonth){const ny=m===11?y+1:y,nm=(m+1)%12;due=new Date(ny,nm,dueDay,12,0,0,0);dueMonth=`${ny}-${String(nm+1).padStart(2,'0')}`;}const daysDelta=Math.round((due.getTime()-now.getTime())/86400000);if(daysDelta>reminderDays)continue;const status=daysDelta<0?'Overdue':daysDelta===0?'Due Today':'Upcoming',priority=status==='Upcoming'?'Normal':'High',id=`salary-${dueMonth}-${d.id}-${status==='Upcoming'?'upcoming':status==='Due Today'?'due':'overdue'}`,message=`${v.name||'Worker'} · ${v.role||'Staff'} · ₹${salary.toLocaleString('en-IN')} salary ${status==='Overdue'?'overdue':status==='Due Today'?'due today':`due in ${daysDelta} day${daysDelta===1?'':'s'}`}`;await addNotification(tid,id,'Salary',message,priority,{targetUrl:'/staff',ownerOnly:true,dueMonth,staffId:d.id,status});await sendPush(tid,status==='Overdue'?'Staff salary overdue':status==='Due Today'?'Staff salary due today':'Upcoming staff salary',message,{url:'/staff',tag:id,dueMonth,staffId:d.id,priority},true);
    }
  }
});

// Owner-only, on-demand rent reminder email for ONE resident whose rent is due/overdue/partially paid.
export const sendRentReminderEmail=onCall({region:REGION,secrets:[RESEND_API_KEY]},async req=>{
  const uid=req.auth?.uid;if(!uid)throw new HttpsError('unauthenticated','Sign in again.');
  const tenantId=String(req.data?.tenantId||''),residentId=String(req.data?.residentId||'');
  if(!tenantId||!residentId)throw new HttpsError('invalid-argument','Select a resident first.');
  const {tenant}=await requireTenantOwner(uid,tenantId);
  const rs=await db.doc(`tenants/${tenantId}/residents/${residentId}`).get();
  if(!rs.exists)throw new HttpsError('not-found','Resident not found.');
  const v=rs.data() as any;
  if(v.status!=='active')throw new HttpsError('failed-precondition','This resident is not currently staying.');
  if((v.billingCycle||'monthly')!=='monthly')throw new HttpsError('failed-precondition','Email reminders are available for monthly residents only.');
  const email=String(v.email||'').trim().toLowerCase();
  if(!validEmail(email))throw new HttpsError('failed-precondition','This resident has no valid email address. Add it from Edit Profile.');
  const now=indiaNow(),y=now.getFullYear(),month=now.getMonth()+1,day=now.getDate(),ym=`${y}-${String(month).padStart(2,'0')}`,today=`${ym}-${String(day).padStart(2,'0')}`;
  const dueDay=Math.min(daysInMonth(y,month),Math.max(1,Number(v.rentDueDay||5))),rent=Number(v.monthlyRent||0);
  const pays=await db.collection(`tenants/${tenantId}/payments`).where('residentId','==',residentId).get();
  const paid=pays.docs.filter(p=>{const x=p.data() as any;return String(x.type||'')==='Rent'&&(String(x.billingMonth||'')===ym||String(x.date||'').startsWith(ym));}).reduce((n,p)=>n+Number((p.data() as any).amount||0),0);
  const balance=Math.max(0,rent-paid);
  const status=balance<=0?'Paid':paid>0?'Partial':day>dueDay?'Overdue':day===dueDay?'Due Today':'Upcoming';
  if(status==='Paid'||status==='Upcoming')throw new HttpsError('failed-precondition','Rent is not pending for this resident right now.');
  const logRef=db.doc(`tenants/${tenantId}/emailLog/rent-${residentId}-${today}`);
  if((await logRef.get()).exists)throw new HttpsError('already-exists','A reminder email was already sent to this resident today.');
  const pgName=String(tenant?.name||tenant?.shortName||'PG Management'),room=(Array.isArray(v.stays)?v.stays.find((s:any)=>s.active)?.roomId:'')||'Room';
  const ownerEmail=String(tenant?.receiptEmail?.contactEmail||tenant?.ownerEmail||'').trim().toLowerCase();
  const label=status==='Partial'?'Partially paid · balance pending':status;
  const result=await sendResidentEmail(email,`Rent reminder · ₹${balance.toLocaleString('en-IN')} pending · ${pgName}`,dueHtml({pgName,residentName:String(v.name||'Resident'),amount:balance,dueDate:fmtDate(`${ym}-${String(dueDay).padStart(2,'0')}`),room,status:label}),ownerEmail);
  if(!result.ok)throw new HttpsError('unavailable',result.retryable?'Email service is busy or its daily limit is reached. Try again later, or send the WhatsApp reminder.':'The email could not be sent. Check the resident email address.');
  await logRef.set({residentId,to:email,amount:balance,status,sentBy:uid,sentAt:new Date().toISOString()});
  return{ok:true,to:email,amount:balance,status};
});

// Delivers receipts that failed because of the provider daily limit or a temporary outage.
export const retryQueuedMail=onSchedule({schedule:'every 60 minutes',region:REGION,secrets:[RESEND_API_KEY]},async()=>{
  const tenants=await db.collection('tenants').get();
  for(const t of tenants.docs){
    const queue=await db.collection(`tenants/${t.id}/mailQueue`).where('status','==','pending').limit(25).get();
    for(const d of queue.docs){
      const m=d.data() as any,attempts=Number(m.attempts||1)+1,updatedAt=new Date().toISOString();
      const result=await sendResidentEmail(String(m.to||''),String(m.subject||''),String(m.html||''),m.replyTo?String(m.replyTo):undefined);
      if(result.ok){await d.ref.delete();continue;}
      if(!result.retryable||attempts>=48){await d.ref.set({status:'failed',attempts,lastError:String(result.error||''),updatedAt},{merge:true});continue;}
      await d.ref.set({attempts,lastError:String(result.error||''),updatedAt},{merge:true});
      if(result.retryable)break; // provider limit: stop this run for the tenant, try again next hour
    }
  }
});

export const deleteTenantWorkspaceData=onCall({region:REGION},async request=>{
  const uid=request.auth?.uid;if(!uid)throw new HttpsError('unauthenticated','Sign in again.');
  const tenantId=String(request.data?.tenantId||''),confirmTenantId=String(request.data?.confirmTenantId||'');
  if(!tenantId||confirmTenantId!==tenantId)throw new HttpsError('failed-precondition','PG deletion confirmation does not match.');
  await requireTenantOwner(uid,tenantId);
  const authTime=Number((request.auth?.token as any)?.auth_time||0)*1000;
  if(!authTime||Date.now()-authTime>5*60_000)throw new HttpsError('failed-precondition','Re-enter your Owner password before deleting PG data.');
  if(request.data?.pinVerified!==true)throw new HttpsError('failed-precondition','Device PIN verification is required.');
  const tenantRef=db.doc(`tenants/${tenantId}`),tenantSnap=await tenantRef.get();
  if(!tenantSnap.exists)throw new HttpsError('not-found','PG workspace no longer exists.');
  const members=await db.collection(`tenants/${tenantId}/members`).get();
  // Detach this PG from global user profiles without deleting Firebase Auth accounts.
  for(const m of members.docs){
    if(m.data()?.platformOversight===true)continue;
    const uref=db.doc(`users/${m.id}`),usnap=await uref.get().catch(()=>null);
    if(!usnap?.exists)continue;
    const data=usnap.data() as any,ids=Array.isArray(data?.tenantIds)?data.tenantIds.map(String).filter((x:string)=>x!==tenantId):[];
    const nextActive=String(data?.activeTenantId||'')===tenantId?(ids[0]||''):String(data?.activeTenantId||'');
    await uref.set({tenantIds:ids,activeTenantId:nextActive,updatedAt:new Date().toISOString()},{merge:true});
  }
  await db.recursiveDelete(tenantRef);
  return{ok:true,tenantId,deletedAt:new Date().toISOString()};
});
