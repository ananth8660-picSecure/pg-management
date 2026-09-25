import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';

type ReportKey='occupancy'|'vacancy'|'rent'|'residents'|'amenities';

@Component({
  standalone:true,
  imports:[CommonModule,FormsModule],
  template:`
  <div class="page-head reports-head">
    <div>
      <p class="eyebrow">OWNER INTELLIGENCE • REPORTS</p>
      <h1>Reports Center</h1>
      <p>Operational and financial reports generated from the current PG data. Export only what you need.</p>
    </div>
    <div class="head-actions">
      <button class="secondary-btn" (click)="printReport()">Print</button>
      <button class="primary-btn" (click)="exportCurrent()">Export CSV</button>
    </div>
  </div>

  <section class="report-tabs" aria-label="Report type">
    @for(tab of tabs;track tab.key){
      <button [class.active]="active()===tab.key" (click)="active.set(tab.key)">
        <span>{{tab.icon}}</span><div><b>{{tab.label}}</b><small>{{tab.hint}}</small></div>
      </button>
    }
  </section>

  <section class="report-summary">
    @for(card of summaryCards();track card.label){
      <article><small>{{card.label}}</small><b>{{card.value}}</b><span>{{card.hint}}</span></article>
    }
  </section>

  <section class="panel report-panel">
    <div class="panel-head report-toolbar">
      <div><p class="eyebrow">{{activeLabel()}}</p><h2>{{reportTitle()}}</h2></div>
      <div class="report-filters">
        <input [(ngModel)]="query" placeholder="Search report...">
        @if(active()!=='residents'){
          <select [(ngModel)]="blockFilter"><option value="all">All blocks</option>@for(b of store.blocks();track b.id){<option [value]="b.id">{{b.name}}</option>}</select>
        }
      </div>
    </div>

    @if(rows().length){
      <div class="table-wrap report-table"><table><thead><tr>@for(c of columns();track c.key){<th>{{c.label}}</th>}</tr></thead><tbody>
        @for(row of rows();track $index){<tr>@for(c of columns();track c.key){<td><span [class]="c.key==='status'?'status '+statusClass(row[c.key]):''">{{row[c.key]}}</span></td>}</tr>}
      </tbody></table></div>
    } @else {
      <div class="premium-empty"><div>⌁</div><h3>No matching report rows</h3><p>Try a different search or block filter.</p></div>
    }
  </section>

  @if(active()==='rent' && store.role()!=='owner'){
    <div class="report-lock"><b>Owner finance protection</b><span>Aggregate rent values are hidden from Manager accounts even when Reports access is enabled.</span></div>
  }
  `,
  styles:[`
    .reports-head{align-items:center}.report-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 16px}.report-tabs button{border:1px solid var(--line);background:linear-gradient(145deg,#fff,#f9fbff);border-radius:16px;padding:14px;text-align:left;display:flex;gap:10px;align-items:center;color:var(--ink);cursor:pointer;min-width:0}.report-tabs button>span{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#f0efff}.report-tabs button b,.report-tabs button small{display:block}.report-tabs button small{font-size:10px;color:var(--muted);margin-top:2px}.report-tabs button.active{border-color:#afa8ff;background:linear-gradient(145deg,#fff,#f1efff);box-shadow:0 10px 26px rgba(90,80,232,.11)}.report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.report-summary article{background:white;border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 1px 0 rgba(16,24,40,.02)}.report-summary small,.report-summary span{display:block;color:var(--muted)}.report-summary small{font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.report-summary b{display:block;font-size:24px;letter-spacing:-.03em;margin:3px 0}.report-summary span{font-size:10px}.report-toolbar{align-items:flex-end}.report-filters{display:flex;gap:8px}.report-filters input,.report-filters select{border:1px solid var(--line);border-radius:11px;padding:9px 10px;background:white;min-width:180px}.report-table table{min-width:820px}.report-lock{margin-top:12px;padding:12px 14px;border-radius:14px;background:#fff8eb;border:1px solid #f6dfb1;color:#8b5a08}.report-lock b,.report-lock span{display:block}.report-lock span{font-size:11px;margin-top:3px}.premium-empty{text-align:center;padding:34px 18px}.premium-empty>div{width:42px;height:42px;margin:0 auto 9px;border-radius:13px;background:#f0efff;display:grid;place-items:center;color:#5a50e8;font-weight:900}@media(max-width:1050px){.report-tabs{grid-template-columns:repeat(3,1fr)}.report-summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.report-tabs{grid-template-columns:1fr 1fr}.report-tabs button{padding:11px}.report-summary{grid-template-columns:1fr 1fr}.report-filters{width:100%;display:grid;grid-template-columns:1fr}.report-filters input,.report-filters select{min-width:0;width:100%}}@media(max-width:390px){.report-tabs,.report-summary{grid-template-columns:1fr}}
    @media print{.sidebar,.topbar,.app-footer,.report-tabs,.head-actions,.report-filters{display:none!important}.main{margin:0!important}.content{padding:0!important;width:100%!important}.panel{box-shadow:none!important;border:1px solid #ddd!important}.report-summary{grid-template-columns:repeat(4,1fr)!important}.report-table{overflow:visible!important}table{min-width:0!important;font-size:10px}}
  `]
})
export class ReportsPage{
  active=signal<ReportKey>('occupancy'); query=''; blockFilter='all';
  tabs=[
    {key:'occupancy' as const,label:'Occupancy',hint:'Block / floor / room',icon:'◫'},
    {key:'vacancy' as const,label:'Vacancy',hint:'Exact vacant beds',icon:'▣'},
    {key:'rent' as const,label:'Rent',hint:'Paid / pending / overdue',icon:'₹'},
    {key:'residents' as const,label:'Residents',hint:'Stay history',icon:'👤'},
    {key:'amenities' as const,label:'Amenities',hint:'Room assets',icon:'⚙'}
  ];
  constructor(public store:StoreService){}
  currentKey():ReportKey{return this.active() as ReportKey;}
  activeLabel(){return this.tabs.find(x=>x.key===this.currentKey())?.label?.toUpperCase()||'REPORT';}
  reportTitle(){return ({occupancy:'Occupancy by Block, Floor & Room',vacancy:'Live Vacancy Detail',rent:'Current Month Rent Collection',residents:'Resident Stay History',amenities:'Room & Amenity Inventory'} as Record<ReportKey,string>)[this.currentKey()];}
  money(v:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);}
  private match(values:any[]){const q=this.query.trim().toLowerCase();return !q||values.join(' ').toLowerCase().includes(q);}
  private blockOk(id:string){return this.blockFilter==='all'||id===this.blockFilter;}
  columns=computed(()=>({
    occupancy:[{key:'block',label:'Block'},{key:'floor',label:'Floor'},{key:'room',label:'Room'},{key:'type',label:'Type'},{key:'beds',label:'Beds'},{key:'occupied',label:'Occupied'},{key:'vacant',label:'Vacant'},{key:'status',label:'Status'}],
    vacancy:[{key:'block',label:'Block'},{key:'floor',label:'Floor'},{key:'room',label:'Room'},{key:'bed',label:'Bed'},{key:'type',label:'Room Type'},{key:'rent',label:'Rent'},{key:'status',label:'Status'}],
    rent:[{key:'resident',label:'Resident'},{key:'room',label:'Room'},{key:'due',label:'Due Date'},{key:'rent',label:'Monthly Rent'},{key:'paid',label:'Paid'},{key:'balance',label:'Balance'},{key:'status',label:'Status'}],
    residents:[{key:'id',label:'Member ID'},{key:'resident',label:'Resident'},{key:'status',label:'Status'},{key:'plan',label:'Stay Plan'},{key:'rate',label:'Rate'},{key:'joined',label:'First Joined'},{key:'stays',label:'Stays'},{key:'current',label:'Current / Last Room'},{key:'dueDay',label:'Billing'}],
    amenities:[{key:'block',label:'Block'},{key:'floor',label:'Floor'},{key:'room',label:'Room'},{key:'type',label:'Type'},{key:'beds',label:'Beds'},{key:'fans',label:'Fans'},{key:'geysers',label:'Geysers'},{key:'taps',label:'Taps'},{key:'lights',label:'Lights'}]
  } as const)[this.currentKey()]);
  rows=computed<any[]>(()=>{
    if(this.active()==='occupancy')return this.store.rooms().filter(r=>this.blockOk(r.blockId)).map(r=>{const occupied=r.beds.filter(b=>b.status==='occupied').length,vacant=r.beds.filter(b=>b.status==='vacant').length;return{block:r.blockId,floor:`Floor ${r.floor+1}`,room:r.id,type:`${r.ac?'AC':'Non-AC'} · ${r.sharing} Sharing`,beds:r.beds.length,occupied,vacant,status:vacant?'Available':'Full'};}).filter(r=>this.match(Object.values(r)));
    if(this.active()==='vacancy')return this.store.vacantBeds().filter(v=>this.blockOk(v.blockId)).map(v=>({block:v.blockId,floor:`Floor ${v.floor+1}`,room:v.room.id,bed:v.bed.label,type:`${v.room.ac?'AC':'Non-AC'} · ${v.room.sharing} Sharing`,rent:this.money(v.room.rent),status:'Vacant'})).filter(r=>this.match(Object.values(r)));
    if(this.active()==='rent')return this.store.rentReminders().map(r=>({resident:r.residentName,room:r.roomId,due:r.dueDate,rent:this.store.role()==='owner'?this.money(r.monthlyRent):'Owner only',paid:this.store.role()==='owner'?this.money(r.paid):'Owner only',balance:this.store.role()==='owner'?this.money(r.balance):'Owner only',status:r.status})).filter(r=>this.match(Object.values(r)));
    if(this.active()==='residents')return this.store.residents().map(r=>{const last=[...r.stays].sort((a,b)=>b.from.localeCompare(a.from))[0];return{id:r.id,resident:r.name,status:r.status==='active'?'Active':'Inactive',plan:(r.billingCycle||'monthly')==='daily'?'Daily Stay':'Monthly',rate:(r.billingCycle||'monthly')==='daily'?this.money(r.dailyRate||0)+'/day':this.money(r.monthlyRent)+'/month',joined:r.joined,stays:r.stays.length,current:last?.roomId||'—',dueDay:(r.billingCycle||'monthly')==='daily'?'Daily running bill':`${r.rentDueDay}${this.ordinal(r.rentDueDay)}`};}).filter(r=>this.match(Object.values(r)));
    return this.store.rooms().filter(r=>this.blockOk(r.blockId)).map(r=>({block:r.blockId,floor:`Floor ${r.floor+1}`,room:r.id,type:`${r.ac?'AC':'Non-AC'} · ${r.sharing} Sharing`,beds:r.beds.length,fans:r.assets.fans,geysers:r.assets.geysers,taps:r.assets.taps,lights:r.assets.lights})).filter(r=>this.match(Object.values(r)));
  });
  summaryCards=computed(()=>{
    if(this.active()==='occupancy')return[{label:'Total Rooms',value:String(this.store.rooms().length),hint:'Configured rooms'},{label:'Total Beds',value:String(this.store.totalBeds()),hint:'Across all blocks'},{label:'Occupied',value:String(this.store.occupiedBeds()),hint:'Currently assigned'},{label:'Vacant',value:String(this.store.vacantBeds().length),hint:'Ready to assign'}];
    if(this.active()==='vacancy')return[{label:'Vacant Beds',value:String(this.store.vacantBeds().length),hint:'Live availability'},{label:'Blocks',value:String(this.store.blocks().length),hint:'Property blocks'},{label:'AC Rooms',value:String(this.store.rooms().filter(r=>r.ac).length),hint:'Configured AC rooms'},{label:'Floors',value:String(this.store.totalFloors()),hint:'Across property'}];
    if(this.active()==='rent'){const reminders=this.store.rentReminders(),paid=reminders.filter(r=>r.status==='Paid').length,pending=reminders.reduce((n,r)=>n+r.balance,0);return[{label:'Paid Accounts',value:String(paid),hint:'This month'},{label:'Partial',value:String(reminders.filter(r=>r.status==='Partial').length),hint:'Needs follow-up'},{label:'Overdue',value:String(reminders.filter(r=>r.status==='Overdue').length),hint:'Past due date'},{label:'Pending Value',value:this.store.role()==='owner'?this.money(pending):'Owner only',hint:'Current month'}];}
    if(this.active()==='residents')return[{label:'Active',value:String(this.store.activeResidents().length),hint:'Checked in now'},{label:'Archived',value:String(this.store.residents().filter(r=>r.status==='inactive').length),hint:'Past residents'},{label:'Total Profiles',value:String(this.store.residents().length),hint:'Including history'},{label:'Total Stays',value:String(this.store.residents().reduce((n,r)=>n+r.stays.length,0)),hint:'All recorded stays'}];
    const a=this.store.totalAssets();return[{label:'Fans',value:String(a.fans),hint:'All rooms'},{label:'Geysers',value:String(a.geysers),hint:'All rooms'},{label:'Taps',value:String(a.taps),hint:'All rooms'},{label:'Lights',value:String(a.lights),hint:'All rooms'}];
  });
  ordinal(n:number){const j=n%10,k=n%100;return j===1&&k!==11?'st':j===2&&k!==12?'nd':j===3&&k!==13?'rd':'th';}
  statusClass(v:any){const s=String(v).toLowerCase();return /overdue|partial|available|vacant/.test(s)?'warn':/inactive/.test(s)?'inactive':'';}
  exportCurrent(){const cols=this.columns(), rows=this.rows();const line=(vals:any[])=>vals.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',');const csv=[line(cols.map(c=>c.label)),...rows.map(r=>line(cols.map(c=>r[c.key])))].join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pg-${this.active()}-report.csv`;a.click();URL.revokeObjectURL(a.href);}
  printReport(){window.print();}
}
