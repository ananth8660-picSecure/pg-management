import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { environment } from '../../environments/environment';
import { APP_CONFIG } from '../config/app-config';

@Injectable({providedIn:'root'})
export class FirebaseService{
 readonly configured=APP_CONFIG.dataProvider==='firebase'&&Boolean(environment.firebase.apiKey&&environment.firebase.projectId);
 readonly app?:FirebaseApp; readonly auth?:Auth; readonly db?:Firestore;
 constructor(){if(this.configured){this.app=initializeApp(environment.firebase);this.auth=getAuth(this.app);this.db=getFirestore(this.app);if(environment.appCheckSiteKey){try{initializeAppCheck(this.app,{provider:new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey),isTokenAutoRefreshEnabled:true});}catch(e){console.warn('[PG Ops] App Check initialization skipped',e);}}}}
}
