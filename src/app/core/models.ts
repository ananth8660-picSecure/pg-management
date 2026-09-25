export type Role = 'owner' | 'manager';
export type BillingCycle = 'monthly' | 'daily';
export type PlatformRole = 'platform_owner' | 'tenant_user';
export type SharingType = number;
export interface SharingRate { sharing:number; amount:number; }
export type BedStatus = 'occupied' | 'vacant' | 'maintenance' | 'blocked';
export type PagePermission = 'dashboard'|'property'|'amenities'|'residents'|'vacancy'|'payments'|'food'|'staff'|'maintenance'|'assets'|'utilities'|'expenses'|'vendors'|'calendar'|'reports'|'documents'|'notifications'|'activity'|'settings';
export interface Bed { id:string; label:string; status:BedStatus; residentId?:string; }
export interface RoomAssets { fans:number; geysers:number; taps:number; lights:number; cupboards:number; tables:number; chairs:number; }
export interface FloorAssets { washingMachines:number; waterPurifiers:number; commonFans:number; commonTaps:number; commonGeysers:number; commonLights:number; cctv:number; fireExtinguishers:number; commonToilets:number; shoeRacks:number; }
export interface FloorInventory { id:string; blockId:string; floor:number; assets:FloorAssets; notes:string; updatedAt?:string; }
export interface Room { id:string; blockId:string; floor:number; number:string; sharing:SharingType; rent:number; beds:Bed[]; attachedBath:boolean; ac:boolean; assets:RoomAssets; }
export interface Block { id:string; name:string; floors:number; }
export interface Stay { id:string; roomId:string; bedId:string; from:string; to?:string; active:boolean; reason?:'checkin'|'restore'|'transfer'; }
export interface FileEncryptionMeta { algorithm:'AES-GCM-256'; iv:string; keyId?:string; wrappedKey?:string; wrapIv?:string; }
export interface DocumentFile { type:string;name:string;uploadedAt:string;path?:string;url?:string;provider?:'r2'|'demo';encryption?:FileEncryptionMeta; }
export interface Resident { id:string; name:string; mobile:string; aadhaarLast4:string; photo:string; joined:string; status:'active'|'inactive'; currentStayId?:string; stays:Stay[]; deposit:number; billingCycle?:BillingCycle; monthlyRent:number; dailyRate?:number; plannedCheckout?:string; rentDueDay:number; documents:DocumentFile[]; }
export interface Payment {id:string;residentId:string;residentName:string;roomId:string;type:'Rent'|'Advance'|'Deposit'|'Other';amount:number;mode:string;receipt:DocumentFile;note:string;date:string;billingMonth?:string;status:'Paid'|'Partial';}
export interface RentReminder { residentId:string; residentName:string; roomId:string; dueDate:string; dueDay:number; monthlyRent:number; paid:number; balance:number; status:'Upcoming'|'Due Today'|'Overdue'|'Partial'|'Paid'; daysDelta:number; }
export interface ManagedUser { uid:string; email:string; name:string; role:Role; active:boolean; permissions:PagePermission[]; createdAt?:string; updatedAt?:string; createdBy?:string; updatedBy?:string; tenantId?:string; }
export interface AuditLog { id:string; actorUid:string; actorName:string; actorRole:Role|'unknown'; action:string; module:string; details:Record<string,unknown>; createdAt:string; }
export interface TenantBranding { name:string; shortName:string; city:string; logo?:DocumentFile; }
export interface Tenant extends TenantBranding { id:string; slug:string; active:boolean; createdAt:string; createdBy:string; ownerUid?:string; ownerName?:string; ownerEmail?:string; customerName?:string; customerPhone?:string; soldAt?:string; commercialNote?:string; memberCount?:number; activeMemberCount?:number; suspendedReason?:string; forceLogoutAt?:string; updatedAt?:string; updatedBy?:string; }
