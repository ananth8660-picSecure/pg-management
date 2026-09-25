import { Injectable, computed, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { browserLocalPersistence, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { ManagedUser, PagePermission, PlatformRole, Role, Tenant, TenantBranding } from './models';
import { APP_CONFIG } from '../config/app-config';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface SessionUser {
  uid:string; email:string; name:string; role:Role; permissions:PagePermission[]; active:boolean;
  tenantId:string; tenantIds:string[]; platformRole:PlatformRole; demo?:boolean;
}

const DEFAULT_MANAGER_PERMISSIONS:PagePermission[]=['dashboard','property','residents','vacancy','payments','food','staff','maintenance','assets','utilities','vendors','calendar','documents','notifications'];

@Injectable({providedIn:'root'})
export class AuthService {
  readonly ready = signal(false);
  readonly user = signal<SessionUser|null>(null);
  readonly tenant = signal<Tenant|null>(null);
  readonly isOwner = computed(()=>this.user()?.role==='owner');
  readonly isPlatformOwner = computed(()=>this.user()?.platformRole==='platform_owner');
  private unsubs:Unsubscribe[]=[];
  private readyResolved=false;
  private readyResolver!:()=>void;
  private readonly readyPromise=new Promise<void>(resolve=>{this.readyResolver=resolve;});

  constructor(private fb:FirebaseService){
    if(!fb.configured){ this.finishReady(); return; }
    // Do not expose the guest/login route while Firebase is still restoring a
    // persisted browser session. The router guards wait for this same signal.
    const startupWatchdog=setTimeout(()=>{
      if(!this.ready()) console.warn('[PG Ops Auth] Session restoration is taking longer than expected; still waiting for Firebase instead of flashing the login screen.');
    },8000);
    try{
      onAuthStateChanged(fb.auth!, async u=>{
        this.clearSubscriptions();
        try{
          if(!u){this.user.set(null);this.tenant.set(null);return;}
          const mapped=await Promise.race([
            this.mapUser(u),
            new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Firebase profile loading timed out. Check internet/Firestore access and try again.')),8000))
          ]);
          this.user.set(mapped.session);this.tenant.set(mapped.tenant);
          this.watchSession(u.uid,mapped.session.tenantId,mapped.tenant.forceLogoutAt||'');
        } catch(e){
          console.error('[PG Ops Auth]',e);
          this.user.set(null);this.tenant.set(null);
        } finally { clearTimeout(startupWatchdog); this.finishReady(); }
      }, error=>{
        clearTimeout(startupWatchdog);
        console.error('[PG Ops Auth state listener]',error);
        this.user.set(null);this.tenant.set(null);this.finishReady();
      });
    }catch(error){
      clearTimeout(startupWatchdog);
      console.error('[PG Ops Auth initialization]',error);
      this.user.set(null);this.tenant.set(null);this.finishReady();
    }
  }

  private finishReady(){
    if(this.readyResolved)return;
    this.readyResolved=true;
    this.ready.set(true);
    this.readyResolver();
  }

  async waitUntilReady(){
    if(this.ready())return;
    await this.readyPromise;
  }

  private clearSubscriptions(){for(const u of this.unsubs)u();this.unsubs=[];}

  private watchSession(uid:string,tenantId:string,initialForceLogoutAt=''){
    const profileRef=doc(this.fb.db!,'users',uid);
    const memberRef=doc(this.fb.db!,'tenants',tenantId,'members',uid);
    const tenantRef=doc(this.fb.db!,'tenants',tenantId);
    let forceLogoutBaseline=initialForceLogoutAt;
    let tenantForceInitialized=Boolean(initialForceLogoutAt);
    let memberForceLogoutBaseline='';
    let memberForceInitialized=false;
    this.unsubs.push(onSnapshot(profileRef,s=>{if(s.exists()&&s.data()['active']===false)void this.logout();}));
    this.unsubs.push(onSnapshot(memberRef,s=>{
      if(!s.exists())return;const d:any=s.data();if(d.active===false){void this.logout();return;}
      const memberForce=String(d.forceLogoutAt||'');
      if(memberForceInitialized && memberForce && memberForce!==memberForceLogoutBaseline){void this.logout();return;}
      if(!memberForceInitialized){memberForceLogoutBaseline=memberForce;memberForceInitialized=true;}
      this.user.update(old=>old?{...old,name:String(d.name||old.name),email:String(d.email||old.email),role:d.role==='owner'?'owner':'manager',permissions:Array.isArray(d.permissions)?d.permissions:[],active:true}:old);
    }));
    this.unsubs.push(onSnapshot(tenantRef,s=>{
      if(!s.exists())return;
      const d:any=s.data(),next=this.toTenant(s.id,d),platform=this.user()?.platformRole==='platform_owner';
      this.tenant.set(next);
      if(!platform && d.active===false){void this.logout();return;}
      const currentForce=String(d.forceLogoutAt||'');
      if(!platform && tenantForceInitialized && currentForce && currentForce!==forceLogoutBaseline){void this.logout();return;}
      if(!tenantForceInitialized){forceLogoutBaseline=currentForce;tenantForceInitialized=true;}
    }));
  }

  async login(email:string,password:string){
    const clean=email.trim().toLowerCase();
    if(!this.fb.configured){
      if(clean==='owner@demo.local' && password==='Owner@123') this.user.set({uid:'demo-owner',email:clean,name:'Ananth Kumar',role:'owner',permissions:[],active:true,tenantId:'demo',tenantIds:['demo'],platformRole:'platform_owner',demo:true});
      else if(clean==='manager@demo.local' && password==='Manager@123') this.user.set({uid:'demo-manager',email:clean,name:'PG Manager',role:'manager',permissions:DEFAULT_MANAGER_PERMISSIONS,active:true,tenantId:'demo',tenantIds:['demo'],platformRole:'tenant_user',demo:true});
      else throw new Error('Invalid demo credentials.');
      return;
    }
    try{
      await setPersistence(this.fb.auth!,browserLocalPersistence);
      const credential=await signInWithEmailAndPassword(this.fb.auth!,clean,password);
      const mapped=await this.mapUser(credential.user);
      this.user.set(mapped.session);this.tenant.set(mapped.tenant);this.clearSubscriptions();this.watchSession(credential.user.uid,mapped.session.tenantId,mapped.tenant.forceLogoutAt||'');
    } catch(err){
      if(this.fb.auth?.currentUser) await signOut(this.fb.auth).catch(()=>undefined);
      if(err instanceof Error && !('code' in err)) throw err;
      throw new Error(this.friendlyFirebaseError(err));
    }
  }

  async logout(){this.clearSubscriptions();if(this.fb.configured)await signOut(this.fb.auth!);else this.user.set(null);}

  async verifySuperOwnerPassword(password:string){
    const session=this.user(),current=this.fb.auth?.currentUser;
    if(!session||session.platformRole!=='platform_owner')throw new Error('Super Owner access is not available for this account.');
    if(!current?.email)throw new Error('Sign in again to verify Super Owner access.');
    if(!password)throw new Error('Enter the Super Owner password.');
    try{
      await reauthenticateWithCredential(current,EmailAuthProvider.credential(current.email,password));
    }catch(err){
      const code=(err as FirebaseError | undefined)?.code||'';
      if(code==='auth/invalid-credential'||code==='auth/wrong-password')throw new Error('Super Owner password is incorrect.');
      if(code==='auth/too-many-requests')throw new Error('Too many verification attempts. Try again later.');
      throw new Error(this.friendlyFirebaseError(err));
    }
  }


  async verifyCurrentPassword(password:string){
    const session=this.user(),current=this.fb.auth?.currentUser;
    if(!session||!current?.email)throw new Error('Sign in again to verify this access change.');
    if(!password)throw new Error('Enter your current account password to continue.');
    try{
      await reauthenticateWithCredential(current,EmailAuthProvider.credential(current.email,password));
    }catch(err){
      const code=(err as FirebaseError | undefined)?.code||'';
      if(code==='auth/invalid-credential'||code==='auth/wrong-password')throw new Error('Current account password is incorrect.');
      if(code==='auth/too-many-requests')throw new Error('Too many verification attempts. Try again later.');
      throw new Error(this.friendlyFirebaseError(err));
    }
  }

  async switchTenant(tenantId:string){
    const actor=this.user();const current=this.fb.auth?.currentUser;if(!actor||!current)throw new Error('Sign in again.');
    if(!actor.tenantIds.includes(tenantId) && actor.platformRole!=='platform_owner')throw new Error('You do not have access to this PG.');
    if(actor.platformRole==='platform_owner'){
      const now=new Date().toISOString();
      await setDoc(doc(this.fb.db!,'tenants',tenantId,'members',actor.uid),{uid:actor.uid,email:actor.email,name:actor.name,role:'owner',active:true,permissions:[],tenantId,platformOversight:true,updatedAt:now,updatedBy:actor.uid,createdAt:now,createdBy:actor.uid},{merge:true});
    }
    await setDoc(doc(this.fb.db!,'users',actor.uid),{activeTenantId:tenantId,updatedAt:new Date().toISOString()},{merge:true});
    const mapped=await this.mapUser(current,tenantId);this.user.set(mapped.session);this.tenant.set(mapped.tenant);this.clearSubscriptions();this.watchSession(current.uid,tenantId,mapped.tenant.forceLogoutAt||'');
  }

  async listTenants():Promise<Tenant[]>{
    const u=this.user();if(!u||!this.fb.configured)return[];
    if(u.platformRole==='platform_owner'){
      const s=await getDocs(collection(this.fb.db!,'tenants'));
      const out=await Promise.all(s.docs.map(async d=>{
        const tenant=this.toTenant(d.id,d.data());
        if(tenant.ownerUid && (!tenant.ownerEmail||!tenant.ownerName)){
          const owner=await getDoc(doc(this.fb.db!,'users',tenant.ownerUid)).catch(()=>null);
          if(owner?.exists()){tenant.ownerEmail=String(owner.data()['email']||tenant.ownerEmail||'');tenant.ownerName=String(owner.data()['name']||tenant.ownerName||'');}
        }
        const members=await getDocs(collection(this.fb.db!,'tenants',d.id,'members')).catch(()=>null);
        if(members){
          const docs=members.docs.filter(x=>x.data()['platformOversight']!==true);
          tenant.memberCount=docs.length;
          tenant.activeMemberCount=docs.filter(x=>x.data()['active']!==false).length;
        }
        return tenant;
      }));
      return out.sort((a,b)=>a.name.localeCompare(b.name));
    }
    const out:Tenant[]=[];for(const id of u.tenantIds){const s=await getDoc(doc(this.fb.db!,'tenants',id));if(s.exists())out.push(this.toTenant(s.id,s.data()));}return out;
  }

  async listPlatformAuditLogs():Promise<any[]>{
    const actor=this.user();if(!actor||actor.platformRole!=='platform_owner'||!this.fb.configured)return[];
    const s=await getDocs(collection(this.fb.db!,'platformAuditLogs'));
    return s.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,30);
  }

  async listManagedUsers():Promise<ManagedUser[]>{
    const actor=this.user();if(!this.fb.configured||!actor||actor.role!=='owner')return[];
    const s=await getDocs(collection(this.fb.db!,'tenants',actor.tenantId,'members'));
    const visible=s.docs.filter(d=>d.data()['platformOversight']!==true);
    const list=await Promise.all(visible.map(async d=>{const v:any=d.data();let email=String(v.email||''),name=String(v.name||'User');const p=await getDoc(doc(this.fb.db!,'users',d.id)).catch(()=>null);if(p?.exists())email=String(p.data()['email']||email);return{uid:d.id,email,name,role:v.role==='owner'?'owner':'manager',active:v.active!==false,permissions:Array.isArray(v.permissions)?v.permissions:[],createdAt:String(v.createdAt||''),updatedAt:String(v.updatedAt||''),createdBy:String(v.createdBy||''),updatedBy:String(v.updatedBy||''),tenantId:actor.tenantId} as ManagedUser;}));
    return list.sort((a,b)=>a.role===b.role?a.name.localeCompare(b.name):a.role==='owner'?-1:1);
  }

  async createManagedUser(input:{name:string;email:string;password:string;role:Role;permissions:PagePermission[]}):Promise<ManagedUser>{
    const actor=this.user();if(!actor||actor.role!=='owner')throw new Error('Owner access is required to add users.');
    if(!this.fb.configured||!this.fb.app)throw new Error('Firebase is not configured.');
    try{
      const call=httpsCallable(getFunctions(this.fb.app,'asia-south1'),'createTenantUser');
      const result:any=await call({tenantId:actor.tenantId,name:input.name.trim(),email:input.email.trim().toLowerCase(),password:input.password,role:input.role,permissions:input.role==='owner'?[]:input.permissions});
      return result.data as ManagedUser;
    }catch(e:any){throw new Error(this.friendlyCallableError(e,'Unable to create this PG user.'));}
  }

  async updateManagedUser(profile:ManagedUser){
    const actor=this.user();if(!actor||actor.role!=='owner')throw new Error('Owner access is required.');
    const memberRef=doc(this.fb.db!,'tenants',actor.tenantId,'members',profile.uid),existing=await getDoc(memberRef);
    if(!existing.exists())throw new Error('This PG user no longer exists.');
    const existingData:any=existing.data();
    if(existingData.platformOversight===true)throw new Error('Creator support access cannot be changed from a PG Owner account.');
    if(profile.uid===actor.uid&&profile.role!=='owner')throw new Error('You cannot remove your own Owner role while signed in.');
    if(profile.uid===actor.uid&&profile.active===false)throw new Error('You cannot disable your own active session.');
    if(existingData.role==='owner'&&(profile.role!=='owner'||profile.active===false)){
      const all=await getDocs(collection(this.fb.db!,'tenants',actor.tenantId,'members'));
      const otherActiveOwners=all.docs.filter(d=>d.id!==profile.uid&&d.data()['platformOversight']!==true&&d.data()['role']==='owner'&&d.data()['active']!==false);
      if(!otherActiveOwners.length)throw new Error('Every PG must keep at least one active Owner. Add another Owner before changing this account.');
    }
    const now=new Date().toISOString(),next={...profile,permissions:profile.role==='owner'?[]:[...profile.permissions],updatedAt:now,updatedBy:actor.uid};
    // The display name is tenant-specific. Do not let one PG Owner rewrite a user's
    // global account profile when the same person may belong to another PG.
    await setDoc(memberRef,next,{merge:true});
  }


  async sendOwnPasswordReset(){
    const current=this.fb.auth?.currentUser;if(!current?.email)throw new Error('Sign in again to reset your password.');
    await sendPasswordResetEmail(this.fb.auth!,current.email);
  }

  async sendManagedUserPasswordReset(email:string){
    const actor=this.user();if(!actor||actor.role!=='owner')throw new Error('Owner access is required.');
    if(!this.fb.auth||!this.fb.db)throw new Error('Firebase Authentication is not available.');
    const target=email.trim().toLowerCase(),members=await getDocs(collection(this.fb.db,'tenants',actor.tenantId,'members'));
    const allowed=members.docs.some(d=>d.data()['platformOversight']!==true&&String(d.data()['email']||'').toLowerCase()===target);
    if(!allowed)throw new Error('Password reset is allowed only for a user assigned to this PG.');
    await sendPasswordResetEmail(this.fb.auth,target);
  }


  async forceManagedUserLogout(uid:string){
    const actor=this.user();if(!actor||actor.role!=='owner')throw new Error('Owner access is required.');
    if(uid===actor.uid)throw new Error('Use the account menu to logout your own session.');
    const memberRef=doc(this.fb.db!,'tenants',actor.tenantId,'members',uid),snap=await getDoc(memberRef);
    if(!snap.exists())throw new Error('This PG user no longer exists.');
    if(snap.data()['platformOversight']===true)throw new Error('Creator support access cannot be controlled from this PG profile.');
    const now=new Date().toISOString(),forceLogoutEpoch=Math.floor(Date.now()/1000);
    await setDoc(memberRef,{forceLogoutAt:now,forceLogoutEpoch,updatedAt:now,updatedBy:actor.uid},{merge:true});
  }

  async setTenantAccess(tenantId:string,active:boolean,reason=''){
    const actor=this.user();if(!actor||actor.platformRole!=='platform_owner')throw new Error('Super Owner access is required.');
    const now=new Date().toISOString(),forceLogoutEpoch=Math.floor(Date.now()/1000);
    await setDoc(doc(this.fb.db!,'tenants',tenantId),{active,suspendedReason:active?'':reason.trim(),updatedAt:now,updatedBy:actor.uid,...(!active?{forceLogoutAt:now,forceLogoutEpoch}:{})},{merge:true});
    await this.writePlatformAudit(active?'Customer access activated':'Customer access suspended',tenantId,{reason:reason.trim()});
  }

  async forceTenantLogout(tenantId:string){
    const actor=this.user();if(!actor||actor.platformRole!=='platform_owner')throw new Error('Super Owner access is required.');
    const now=new Date().toISOString(),forceLogoutEpoch=Math.floor(Date.now()/1000);
    await setDoc(doc(this.fb.db!,'tenants',tenantId),{forceLogoutAt:now,forceLogoutEpoch,updatedAt:now,updatedBy:actor.uid},{merge:true});
    await this.writePlatformAudit('Forced customer sign-out',tenantId,{});
  }

  async sendTenantOwnerPasswordReset(tenant:Tenant){
    const actor=this.user();if(!actor||actor.platformRole!=='platform_owner')throw new Error('Super Owner access is required.');
    if(!tenant.ownerEmail)throw new Error('Owner email is not available for this PG.');
    if(!this.fb.auth)throw new Error('Firebase Authentication is not available.');
    await sendPasswordResetEmail(this.fb.auth,tenant.ownerEmail.trim().toLowerCase());
    await this.writePlatformAudit('Owner password reset email sent',tenant.id,{ownerEmail:tenant.ownerEmail});
  }

  private async writePlatformAudit(action:string,tenantId:string,details:Record<string,unknown>){
    const actor=this.user();if(!actor||!this.fb.db)return;
    const createdAt=new Date().toISOString(),id=`PLAT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    await setDoc(doc(this.fb.db,'platformAuditLogs',id),{id,action,tenantId,details,actorUid:actor.uid,actorName:actor.name,createdAt});
  }

  async createTenantWithOwner(input:{pgName:string;shortName:string;city:string;ownerName:string;ownerEmail:string;password:string;customerName?:string;customerPhone?:string;soldAt?:string;commercialNote?:string}){
    const actor=this.user();if(!actor||actor.platformRole!=='platform_owner')throw new Error('Platform Owner access is required.');
    if(!this.fb.configured||!this.fb.app)throw new Error('Firebase is not configured.');
    try{
      const call=httpsCallable(getFunctions(this.fb.app,'asia-south1'),'createCustomerTenant');
      const result:any=await call(input);
      return result.data as Tenant;
    }catch(e:any){throw new Error(this.friendlyCallableError(e,'Unable to create the customer PG.'));}
  }

  async updateTenantBranding(input:Partial<TenantBranding>){
    const actor=this.user();if(!actor||actor.role!=='owner')throw new Error('Owner access is required.');
    const clean:Partial<TenantBranding>={};
    if(typeof input.name==='string')clean.name=input.name.trim();
    if(typeof input.shortName==='string')clean.shortName=input.shortName.trim();
    if(typeof input.city==='string')clean.city=input.city.trim();
    if(input.logo)clean.logo=input.logo;
    if(actor.demo||!this.fb.configured||!this.fb.db){this.tenant.update(t=>t?{...t,...clean}:t);return;}
    const updatedAt=new Date().toISOString();
    await setDoc(doc(this.fb.db,'tenants',actor.tenantId),{...clean,updatedAt,updatedBy:actor.uid},{merge:true});
    this.tenant.update(t=>t?{...t,...clean,updatedAt,updatedBy:actor.uid}:t);
  }


  private async mapUser(u:User,forcedTenantId?:string):Promise<{session:SessionUser;tenant:Tenant}>{
    const profileRef=doc(this.fb.db!,'users',u.uid);let snap;
    try{
      snap=await getDoc(profileRef);
    }catch(err:any){
      if(String(err?.code||'').includes('permission-denied') && this.isConfiguredBootstrapAccount(u)){
        await this.bootstrapKnownAccount(u);
        snap=await getDoc(profileRef);
      }else if(String(err?.code||'').includes('permission-denied')){
        throw new Error('Firebase Authentication succeeded, but Firestore blocked this account. Deploy the included final firestore.rules and make sure the account was added by an Owner.');
      }else{
        throw err;
      }
    }
    if(!snap.exists()){await this.bootstrapKnownAccount(u);snap=await getDoc(profileRef);}
    if(snap.exists() && u.uid===APP_CONFIG.platform.platformOwnerUid && snap.data()['platformRole']!=='platform_owner'){await this.promoteConfiguredCreator(u);snap=await getDoc(profileRef);}
    if(!snap.exists())throw new Error(`Firebase Authentication succeeded, but this account has not been assigned to a PG yet. Ask the Super Owner/PG Owner to add ${u.email||'this user'} from Profile & Access.`);
    const p:any=snap.data();if(p.active===false)throw new Error('This PG Ops account is disabled.');
    const tenantIds=Array.isArray(p.tenantIds)?p.tenantIds.map(String):[];const tenantId=forcedTenantId||String(p.activeTenantId||tenantIds[0]||'');if(!tenantId)throw new Error('No PG workspace is assigned to this account.');
    const [memberSnap,tenantSnap]=await Promise.all([getDoc(doc(this.fb.db!,'tenants',tenantId,'members',u.uid)),getDoc(doc(this.fb.db!,'tenants',tenantId))]);
    if(!memberSnap.exists())throw new Error('Your account exists, but access to this PG workspace has not been assigned.');if(!tenantSnap.exists())throw new Error('The assigned PG workspace no longer exists.');
    const platformRole:PlatformRole=p.platformRole==='platform_owner'?'platform_owner':'tenant_user';
    const tenant=this.toTenant(tenantSnap.id,tenantSnap.data());
    if(!tenant.active && platformRole!=='platform_owner')throw new Error(`This PG workspace is currently inactive. ${tenant.suspendedReason||'Contact the PG Ops provider for access.'}`);
    const m:any=memberSnap.data();if(m.active===false)throw new Error('Your access to this PG is disabled by its Owner.');const role:Role=m.role==='owner'?'owner':m.role==='manager'?'manager':(()=>{throw new Error('Invalid PG membership role.');})();
    return{session:{uid:u.uid,email:String(p.email||u.email||''),name:String(m.name||p.name||u.email||'User'),role,permissions:Array.isArray(m.permissions)?m.permissions:[],active:true,tenantId,tenantIds:[...new Set([...tenantIds,tenantId])],platformRole},tenant};
  }

  private isConfiguredBootstrapAccount(u:User){return u.uid===APP_CONFIG.platform.platformOwnerUid;}

  private async promoteConfiguredCreator(u:User){
    const email=(u.email||'').toLowerCase();
    if(u.uid!==APP_CONFIG.platform.platformOwnerUid)return;
    const now=new Date().toISOString(),tenantId=APP_CONFIG.platform.defaultTenantId;
    const tenantRef=doc(this.fb.db!,'tenants',tenantId),tenantSnap=await getDoc(tenantRef);
    if(!tenantSnap.exists())await setDoc(tenantRef,{id:tenantId,slug:'mana-pg',name:APP_CONFIG.property.name,shortName:APP_CONFIG.property.shortName,city:APP_CONFIG.property.city,active:true,createdAt:now,createdBy:u.uid,ownerUid:u.uid,ownerName:APP_CONFIG.platform.platformOwnerName,ownerEmail:email,updatedAt:now,updatedBy:u.uid});
    await setDoc(doc(this.fb.db!,'users',u.uid),{uid:u.uid,email,name:APP_CONFIG.platform.platformOwnerName,active:true,platformRole:'platform_owner',activeTenantId:tenantId,tenantIds:[tenantId],updatedAt:now,updatedBy:u.uid},{merge:true});
    await setDoc(doc(this.fb.db!,'tenants',tenantId,'members',u.uid),{uid:u.uid,email,name:APP_CONFIG.platform.platformOwnerName,role:'owner',active:true,permissions:[],updatedAt:now,updatedBy:u.uid,tenantId},{merge:true});
  }

  private async bootstrapKnownAccount(u:User){
    if(u.uid!==APP_CONFIG.platform.platformOwnerUid)return;
    const email=(u.email||'').toLowerCase(),now=new Date().toISOString(),tenantId=APP_CONFIG.platform.defaultTenantId;
    const tenantRef=doc(this.fb.db!,'tenants',tenantId),t=await getDoc(tenantRef);
    if(!t.exists())await setDoc(tenantRef,{id:tenantId,slug:'mana-pg',name:APP_CONFIG.property.name,shortName:APP_CONFIG.property.shortName,city:APP_CONFIG.property.city,active:true,createdAt:now,createdBy:u.uid,ownerUid:u.uid,ownerName:APP_CONFIG.platform.platformOwnerName,ownerEmail:email,updatedAt:now,updatedBy:u.uid});
    await setDoc(doc(this.fb.db!,'users',u.uid),{uid:u.uid,email,name:APP_CONFIG.platform.platformOwnerName,active:true,platformRole:'platform_owner',activeTenantId:tenantId,tenantIds:[tenantId],createdAt:now,updatedAt:now,createdBy:u.uid,updatedBy:u.uid});
    await setDoc(doc(this.fb.db!,'tenants',tenantId,'members',u.uid),{uid:u.uid,email,name:APP_CONFIG.platform.platformOwnerName,role:'owner',active:true,permissions:[],createdAt:now,updatedAt:now,createdBy:u.uid,updatedBy:u.uid,tenantId});
  }

  private toTenant(id:string,d:any):Tenant{return{id,slug:String(d.slug||id),name:String(d.name||'PG Workspace'),shortName:String(d.shortName||d.name||'PG Ops'),city:String(d.city||''),logo:d.logo,active:d.active!==false,createdAt:String(d.createdAt||''),createdBy:String(d.createdBy||''),ownerUid:String(d.ownerUid||''),ownerName:String(d.ownerName||''),ownerEmail:String(d.ownerEmail||''),customerName:String(d.customerName||''),customerPhone:String(d.customerPhone||''),soldAt:String(d.soldAt||''),commercialNote:String(d.commercialNote||''),memberCount:Number(d.memberCount||0),activeMemberCount:Number(d.activeMemberCount||0),suspendedReason:String(d.suspendedReason||''),forceLogoutAt:String(d.forceLogoutAt||''),updatedAt:String(d.updatedAt||''),updatedBy:String(d.updatedBy||'')};}
  private slug(v:string){return v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'pg';}

  private friendlyCallableError(err:any,fallback:string){
    const code=String(err?.code||'');
    if(code.includes('already-exists'))return err?.message||'That email already has a Firebase Authentication account.';
    if(code.includes('permission-denied'))return 'You do not have permission for this secure account operation.';
    if(code.includes('unauthenticated'))return 'Your Firebase session expired. Sign in again.';
    if(code.includes('invalid-argument'))return err?.message||'Check the account details and try again.';
    return err?.message||fallback;
  }

  private friendlyFirebaseError(err:unknown){
    const code=(err as FirebaseError | undefined)?.code || '';
    switch(code){
      case 'auth/invalid-credential': return 'Email or password is incorrect.';
      case 'auth/invalid-email': return 'Enter a valid Firebase Authentication email address.';
      case 'auth/email-already-in-use': return 'That email already has a Firebase Authentication account.';
      case 'auth/weak-password': return 'Use a stronger temporary password (minimum 6 characters; 8+ recommended).';
      case 'auth/user-disabled': return 'This Firebase account is disabled.';
      case 'auth/too-many-requests': return 'Too many attempts. Wait a little and try again.';
      case 'auth/network-request-failed': return 'Network error while contacting Firebase.';
      case 'auth/operation-not-allowed': return 'Enable Email/Password under Firebase Authentication → Sign-in method.';
      default: return (err as Error | undefined)?.message || 'Firebase operation failed.';
    }
  }
}
