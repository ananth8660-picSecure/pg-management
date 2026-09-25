import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';
import { FloorAssets, Room, RoomAssets, SharingType } from '../core/models';

@Component({standalone:true,imports:[FormsModule],template:`
<div class="page-head amenities-page-head">
  <div><p class="eyebrow">OWNER • PROPERTY CONTROL</p><h1>Property Structure & Amenities</h1><p>Build the PG floor-by-floor, keep every room and bed accurate, and maintain physical inventory from one workspace.</p></div>
  <div class="head-actions"><button class="secondary-btn" (click)="blockModal.set(true)">Manage Blocks / Floors</button><button class="primary-btn" (click)="newRoom()">+ New Room</button></div>
</div>

<section class="floor-command-center">
  <div class="floor-command-copy"><span class="floor-command-kicker">COMPLETE FLOOR SETUP</span><h2>One place for the entire floor</h2><p>Select a floor to see actual rooms, beds and room assets, then maintain shared floor equipment such as washing machines, common taps and CCTV.</p></div>
  <div class="floor-command-controls">
    <label><span>Block</span><select [(ngModel)]="commandBlock" (ngModelChange)="ensureCommandFloor()">@for(b of store.blocks();track b.id){<option [value]="b.id">{{b.name}}</option>}</select></label>
    <label><span>Floor</span><select [(ngModel)]="commandFloor">@for(f of commandFloors();track f){<option [ngValue]="f">{{floorName(f)}}</option>}</select></label>
    <button class="floor-command-button" (click)="openFloorSetup(commandBlock,commandFloor)"><span>Manage Complete Floor</span><small>Inventory · Rooms · Beds</small></button>
  </div>
  <div class="floor-command-metrics">
    <article class="fc-violet"><span>Rooms</span><b>{{commandSummary().rooms}}</b><small>{{commandSummary().acRooms}} AC · {{commandSummary().normalRooms}} Non-AC</small></article>
    <article class="fc-cyan"><span>Beds</span><b>{{commandSummary().beds}}</b><small>{{commandSummary().vacantBeds}} currently vacant</small></article>
    <article class="fc-amber"><span>Room Fans</span><b>{{commandSummary().roomAssets.fans}}</b><small>Across all rooms</small></article>
    <article class="fc-teal"><span>Taps</span><b>{{commandSummary().roomAssets.taps + commandSummary().common.commonTaps}}</b><small>Room + common</small></article>
    <article class="fc-coral"><span>Geysers</span><b>{{commandSummary().roomAssets.geysers + commandSummary().common.commonGeysers}}</b><small>Room + common</small></article>
    <article class="fc-green"><span>Washers</span><b>{{commandSummary().common.washingMachines}}</b><small>Floor laundry</small></article>
  </div>
</section>

<div class="infra-stats">
 <article class="infra-stat violet"><span>Blocks</span><b>{{store.blocks().length}}</b><small>Apartment blocks</small></article>
 <article class="infra-stat indigo"><span>Floors</span><b>{{store.totalFloors()}}</b><small>Configured floors</small></article>
 <article class="infra-stat cyan"><span>Rooms</span><b>{{store.rooms().length}}</b><small>{{acRooms()}} AC · {{normalRooms()}} Normal</small></article>
 <article class="infra-stat green"><span>Beds</span><b>{{store.totalBeds()}}</b><small>{{store.vacantBeds().length}} vacant</small></article>
 <article class="infra-stat amber"><span>Fans</span><b>{{store.totalAssets().fans}}</b><small>Inside rooms</small></article>
 <article class="infra-stat coral"><span>Geysers</span><b>{{store.totalAssets().geysers}}</b><small>Inside rooms</small></article>
 <article class="infra-stat teal"><span>Washing Machines</span><b>{{totalFloorAsset('washingMachines')}}</b><small>Common floor inventory</small></article>
</div>

<div class="infra-toolbar panel active-filter-surface premium-filter-panel">
  <div class="premium-filter-head">
    <div><span class="filter-tag">FILTERS</span><h3>Find the exact floor or room</h3><p>Choose a block, floor and room type. Results below update immediately without changing your saved structure.</p></div>
    <div class="infra-note"><b>Protected structure</b><span>Room and bed totals are calculated automatically. Occupied rooms cannot be removed accidentally.</span></div>
  </div>
  <div class="infra-filter-grid">
    <label><span>Block</span><select [(ngModel)]="blockFilter"><option value="all">All Blocks</option>@for(b of store.blocks();track b.id){<option [value]="b.id">{{b.name}}</option>}</select></label>
    <label><span>Floor</span><select [(ngModel)]="floorFilter"><option value="all">All Floors</option>@for(f of floorOptions();track f){<option [value]="f">{{floorName(f)}}</option>}</select></label>
    <label><span>Room Type</span><select [(ngModel)]="typeFilter"><option value="all">All Rooms</option><option value="ac">AC Rooms</option><option value="normal">Non-AC Rooms</option></select></label>
  </div>
</div>

@for(block of visibleBlocks();track block.id){
<section class="panel infrastructure-block">
  <div class="panel-head infra-block-head">
    <div><p class="eyebrow">{{block.id}} • {{block.floors}} FLOORS</p><h2>{{block.name}}</h2></div>
    <div class="infra-head-right"><div class="asset-chips"><span>{{roomCount(block.id)}} rooms</span><span>{{bedCount(block.id)}} beds</span><span>{{acCount(block.id)}} AC</span><span>{{assetCount(block.id,'fans')}} fans</span><span>{{blockWashingMachines(block.id)}} washers</span></div><button class="mini-primary" (click)="addFloor(block.id)">+ Add Floor</button></div>
  </div>
  @for(floor of floors(block);track floor){
    @if(floorFilter==='all'||+floorFilter===floor){
    <div class="infra-floor">
      <div class="infra-floor-head">
        <div><b>{{floorName(floor)}}</b><small>{{rooms(block.id,floor).length}} rooms · {{floorBeds(block.id,floor)}} beds · {{floorAcCount(block.id,floor)}} AC · {{store.floorInventory(block.id,floor).assets.washingMachines}} washers</small></div>
        <div class="floor-actions"><button class="floor-manage-btn" (click)="openFloorSetup(block.id,floor)">Floor Setup</button><span>{{floorAsset(block.id,floor,'fans')}} Fans</span><span>{{floorAsset(block.id,floor,'geysers')}} Geysers</span><span>{{floorAsset(block.id,floor,'taps')}} Taps</span><button class="mini-primary" (click)="newRoom(block.id,floor)">+ Room</button>@if(floor===block.floors-1){<button class="mini-danger" [disabled]="rooms(block.id,floor).length>0||block.floors<=1" (click)="askRemoveFloor(block.id,floor)">− Floor</button>}</div>
      </div>
      @if(floorDeleteKey()===block.id+':'+floor){<div class="inline-confirm"><div><b>Remove {{floorName(floor)}}?</b><small>This is allowed only when the floor is empty.</small></div><div><button class="secondary-btn compact" (click)="floorDeleteKey.set('')">Cancel</button><button class="danger-btn compact" (click)="removeFloor(block.id,floor)">Confirm Remove</button></div></div>}
      <div class="infra-room-grid">
        @for(room of filteredRooms(block.id,floor);track room.id){
        <article class="infra-room-card" [class.ac-room]="room.ac">
          <div class="infra-room-title"><div><div class="room-name-line"><b>{{room.id}}</b><span class="room-type-badge" [class.ac]="room.ac">{{room.ac?'AC':'NON-AC'}}</span></div><small>{{room.beds.length}} Beds · {{vacantCount(room)}} Vacant</small></div><button class="mini-action" (click)="editRoom(room)">Manage</button></div>
          <div class="bed-manager-preview premium-bed-grid">@for(bed of room.beds;track bed.id){<span [class.occupied]="bed.status!=='vacant'"><b>{{bed.label}}</b><small>{{bedResidentName(bed.id)||'Vacant'}}</small><em>{{bedRentLabel(room,bed.id)}}</em></span>}</div>
          <div class="room-asset-grid"><span><b>{{room.assets.fans}}</b>Fans</span><span><b>{{room.assets.geysers}}</b>Geysers</span><span><b>{{room.assets.taps}}</b>Taps</span><span><b>{{room.assets.lights}}</b>Lights</span><span><b>{{room.assets.cupboards}}</b>Cupboards</span><span><b>{{room.assets.tables}}</b>Tables</span></div>
          <div class="room-meta"><span>{{room.attachedBath?'Attached Bath':'Common Bath'}}</span><span>{{room.ac?'Air Conditioned':'Standard Room'}}</span><span>{{room.sharing}} Sharing · {{vacantCount(room)}} Vacant</span></div>
        </article>
        }@empty{<button class="empty-floor-add" (click)="newRoom(block.id,floor)">＋ Add first {{typeFilter==='all'?'room':typeFilter==='ac'?'AC room':'non-AC room'}} to {{floorName(floor)}}</button>}
      </div>
    </div>
    }
  }
</section>
}

@if(floorSetupModal()){
<div class="modal-backdrop" (click)="closeFloorSetup()"><section class="form-modal floor-setup-modal modal-shell" data-native-scroll (click)="$event.stopPropagation()">
  <div class="modal-header"><div><p class="eyebrow">COMPLETE FLOOR SETUP</p><h2>{{floorSetupBlockName()}} · {{floorName(floorSetupFloor)}}</h2><p class="modal-subtitle">One protected workspace for room totals, beds, room assets and shared floor equipment.</p></div><button class="modal-x" (click)="closeFloorSetup()">×</button></div>
  <div class="modal-body floor-setup-body">
    <div class="floor-live-summary">
      <article><span>Actual Rooms</span><b>{{floorSetupSummary().rooms}}</b><small>Derived from room records</small></article>
      <article><span>Total Beds</span><b>{{floorSetupSummary().beds}}</b><small>{{floorSetupSummary().vacantBeds}} vacant</small></article>
      <article><span>AC / Non-AC</span><b>{{floorSetupSummary().acRooms}} / {{floorSetupSummary().normalRooms}}</b><small>Room classification</small></article>
      <article><span>Room Assets</span><b>{{floorSetupSummary().roomAssets.fans + floorSetupSummary().roomAssets.geysers + floorSetupSummary().roomAssets.taps}}</b><small>Fans + geysers + taps</small></article>
    </div>

    <section class="floor-setup-section shared-floor-section">
      <div class="floor-section-title"><div><span class="section-orb emerald"></span><div><h3>Shared Floor Inventory</h3><p>Equipment outside individual rooms: laundry, corridor, common wash areas and safety.</p></div></div><span class="live-badge">Floor-level</span></div>
      <div class="floor-asset-editor">@for(item of floorAssetFields;track item.key){<label><span>{{item.label}}</span><input type="number" min="0" [(ngModel)]="floorForm.assets[item.key]"><small>{{item.help}}</small></label>}</div>
      <label class="floor-notes"><span>Floor Notes</span><textarea rows="3" [(ngModel)]="floorForm.notes" placeholder="Example: Washing machines near lift, purifier beside common dining area..."></textarea></label>
    </section>

    <section class="floor-setup-section room-totals-section">
      <div class="floor-section-title"><div><span class="section-orb violet"></span><div><h3>Room Inventory Totals</h3><p>Calculated automatically from every room on this floor. Edit individual rooms to change these numbers.</p></div></div><button class="secondary-btn compact" (click)="goToNewRoomFromFloor()">+ Single Room</button></div>
      <div class="derived-asset-grid"><span><b>{{floorSetupSummary().roomAssets.fans}}</b>Fans</span><span><b>{{floorSetupSummary().roomAssets.geysers}}</b>Geysers</span><span><b>{{floorSetupSummary().roomAssets.taps}}</b>Taps</span><span><b>{{floorSetupSummary().roomAssets.lights}}</b>Lights</span><span><b>{{floorSetupSummary().roomAssets.cupboards}}</b>Cupboards</span><span><b>{{floorSetupSummary().roomAssets.tables}}</b>Tables</span><span><b>{{floorSetupSummary().roomAssets.chairs}}</b>Chairs</span></div>
    </section>

    <section class="floor-setup-section bulk-builder-section">
      <div class="floor-section-title"><div><span class="section-orb cyan"></span><div><h3>Bulk Room Builder</h3><p>Create multiple rooms together with the same starting configuration; each remains independently editable afterward.</p></div></div><span class="live-badge cyan">Fast Setup</span></div>
      <div class="bulk-room-grid">
        <label>Number of Rooms<input type="number" min="1" max="50" [(ngModel)]="bulkForm.count"></label>
        <label>Starting Room No.<input type="number" min="1" [(ngModel)]="bulkForm.startNumber"></label>
        <label>Beds / Room<input type="number" min="1" [(ngModel)]="bulkForm.beds"></label>
        <label>Monthly Rent<input type="number" min="0" [(ngModel)]="bulkForm.rent"></label>
      </div>
      <div class="choice-groups floor-choice-groups"><div class="choice-group"><span>Room Type</span><div class="segmented-choice"><button type="button" [class.active]="!bulkForm.ac" (click)="bulkForm.ac=false"><b>Non-AC</b><small>Standard</small></button><button type="button" [class.active]="bulkForm.ac" (click)="bulkForm.ac=true"><b>AC</b><small>Air conditioned</small></button></div></div><div class="choice-group"><span>Bathroom</span><div class="segmented-choice"><button type="button" [class.active]="bulkForm.attachedBath" (click)="bulkForm.attachedBath=true"><b>Attached</b><small>Private</small></button><button type="button" [class.active]="!bulkForm.attachedBath" (click)="bulkForm.attachedBath=false"><b>Common</b><small>Shared</small></button></div></div></div>
      <div class="bulk-default-assets"><span>Default assets / room</span><div class="asset-input-grid">@for(item of assetFields;track item.key){<label><span>{{item.label}}</span><input type="number" min="0" [(ngModel)]="bulkForm.assets[item.key]"></label>}</div></div>
      <div class="bulk-builder-actions"><p>Existing room numbers are skipped automatically, so no duplicate room IDs are created.</p><button class="floor-bulk-button" [disabled]="bulkSaving()" (click)="createBulkRooms()">{{bulkSaving()?'Creating…':'Create '+bulkForm.count+' Rooms'}}</button></div>
      @if(bulkMessage()){<div class="floor-success">{{bulkMessage()}}</div>}
    </section>

    <section class="floor-setup-section existing-room-section">
      <div class="floor-section-title"><div><span class="section-orb amber"></span><div><h3>Existing Rooms on this Floor</h3><p>Room-by-room breakdown remains the source of truth for beds and room assets.</p></div></div><span class="live-badge amber">{{floorSetupRooms().length}} Rooms</span></div>
      <div class="floor-room-list">@for(room of floorSetupRooms();track room.id){<article><div class="floor-room-id"><b>{{room.id}}</b><span [class.ac]="room.ac">{{room.ac?'AC':'NON-AC'}}</span></div><div class="floor-room-facts"><span>{{room.beds.length}} Beds</span><span>{{room.assets.fans}} Fans</span><span>{{room.assets.taps}} Taps</span><span>{{room.assets.geysers}} Geysers</span><span>{{room.assets.lights}} Lights</span></div><button (click)="editRoomFromFloor(room)">Edit Room</button></article>}@empty{<div class="floor-empty-state"><b>No rooms yet</b><span>Use Bulk Room Builder above or add one room manually.</span></div>}</div>
    </section>
    @if(floorError()){<div class="notice">{{floorError()}}</div>}
  </div>
  <div class="modal-footer"><button class="secondary-btn" (click)="closeFloorSetup()">Close</button><button class="primary-btn" (click)="saveFloorSetup()">Save Floor Inventory</button></div>
</section></div>
}

@if(roomModal()){
<div class="modal-backdrop" (click)="closeRoomModal()"><section class="form-modal infra-modal modal-shell" data-native-scroll (click)="$event.stopPropagation()">
  <div class="modal-header"><div><p class="eyebrow">{{editingRoom()?'MANAGE ROOM':'NEW ROOM'}}</p><h2>{{editingRoom() ? editingRoom()!.id : 'Create Room'}}</h2><p class="modal-subtitle">Room configuration, beds and amenities stay in one protected workspace.</p></div><button class="modal-x" (click)="closeRoomModal()">×</button></div>
  <div class="modal-body">
  @if(error()){<div class="notice modal-error-top">{{error()}}</div>}
  <div class="config-section">
    <div class="config-section-head"><div><h3>Room Configuration</h3><p>Define room type, rent and bathroom setup.</p></div>@if(editingRoom()){<span class="locked-id">Room ID locked for history safety</span>}</div>
    <div class="form-grid">
      @if(!editingRoom()){
        <label>Block<select [(ngModel)]="form.blockId" (ngModelChange)="ensureFloorValid();validateRoomNumber()">@for(b of store.blocks();track b.id){<option [value]="b.id">{{b.name}}</option>}</select></label>
        <label>Floor<select [(ngModel)]="form.floor" (ngModelChange)="validateRoomNumber()">@for(f of floorsForSelected();track f){<option [ngValue]="f">{{floorName(f)}}</option>}</select></label>
        <label>Room Number<input [(ngModel)]="form.number" (ngModelChange)="validateRoomNumber()" placeholder="101" autocomplete="off">@if(roomNumberState()){<small class="field-error">{{roomNumberState()}}</small>}@else{<small class="field-help">Unique inside the selected block.</small>}</label>
        <label>Initial Beds<input [(ngModel)]="form.sharing" type="number" min="1" placeholder="3"><small class="field-help">Any number of beds; more can be added later.</small></label>
      }@else{
        <label>Block<input [value]="editingRoom()!.blockId" disabled></label><label>Floor<input [value]="floorName(editingRoom()!.floor)" disabled></label>
      }
      <label>Default Bed Rent<input [(ngModel)]="form.rent" type="number" min="0"><small class="field-help">Vacant beds show this as guidance. Once occupied, that tenant's actual rent is shown per bed.</small></label>
    </div>
    <div class="choice-groups">
      <div class="choice-group"><span>Room Type</span><div class="segmented-choice"><button [class.active]="!form.ac" (click)="form.ac=false" type="button"><b>Standard</b><small>Non-AC room</small></button><button [class.active]="form.ac" class="ac-choice" (click)="form.ac=true" type="button"><b>Air Conditioned</b><small>AC room</small></button></div></div>
      <div class="choice-group"><span>Bathroom</span><div class="segmented-choice"><button [class.active]="form.attachedBath" (click)="form.attachedBath=true" type="button"><b>Attached</b><small>Private bathroom</small></button><button [class.active]="!form.attachedBath" (click)="form.attachedBath=false" type="button"><b>Common</b><small>Shared bathroom</small></button></div></div>
    </div>
  </div>

  @if(editingRoom()){
  <div class="bed-management"><div class="bed-management-head"><div><h3>Bed Management</h3><p>Add beds anytime. Occupied/locked beds cannot be removed.</p></div><button class="primary-btn compact" (click)="addBed()">+ Add Bed</button></div><div class="bed-editor-grid">@for(bed of editingRoom()!.beds;track bed.id){<article [class.busy]="bed.status!=='vacant'"><div><b>{{bed.label}}</b><small>{{bed.status}}</small></div>@if(bed.status==='vacant'&&editingRoom()!.beds.length>1){<button (click)="removeBed(bed.id)">Remove</button>}@else{<span>{{bed.status==='occupied'?'In use':'Locked'}}</span>}</article>}</div></div>
  }

  <div class="asset-editor"><h3>Room Amenities / Inventory</h3><p>Maintain physical inventory for this room.</p><div class="asset-input-grid">@for(item of assetFields;track item.key){<label><span>{{item.label}}</span><input type="number" min="0" [(ngModel)]="form.assets[item.key]"></label>}</div></div>
  @if(editingRoom()){<div class="danger-zone"><div><b>Remove room</b><small>Only an entirely vacant room can be removed. Resident and stay history is protected.</small></div>@if(!roomDeleteConfirm()){<button class="danger-outline" (click)="roomDeleteConfirm.set(true)">Remove Empty Room</button>}@else{<div class="danger-confirm-actions"><button class="secondary-btn compact" (click)="roomDeleteConfirm.set(false)">Keep Room</button><button class="danger-btn compact" (click)="removeRoom()">Confirm Remove</button></div>}</div>}
  </div>
  <div class="modal-footer"><button class="secondary-btn" [disabled]="roomSaving()" (click)="closeRoomModal()">Cancel</button><button class="primary-btn" [disabled]="roomSaving()||(!editingRoom()&&!!roomNumberState())" [attr.aria-busy]="roomSaving()" (click)="saveRoom()">{{roomSaving()?'Saving…':editingRoom()?'Save Room Changes':'Create Room & Beds'}}</button></div>
</section></div>
}

@if(blockModal()){
<div class="modal-backdrop" (click)="blockModal.set(false)"><section class="form-modal modal-shell" data-native-scroll (click)="$event.stopPropagation()"><div class="modal-header"><div><p class="eyebrow">PROPERTY STRUCTURE</p><h2>Blocks & Floors</h2><p class="modal-subtitle">Add floors freely; safe removal prevents occupied structure loss.</p></div><button class="modal-x" (click)="blockModal.set(false)">×</button></div><div class="modal-body"><div class="block-editor">@for(b of store.blocks();track b.id){<div><div><b>{{b.name}}</b><small>{{b.floors}} floors · {{roomCount(b.id)}} rooms · {{bedCount(b.id)}} beds</small></div><div class="floor-count-control"><button class="secondary-btn compact" [disabled]="b.floors<=1||rooms(b.id,b.floors-1).length>0" (click)="askRemoveFloor(b.id,b.floors-1)">− Top Floor</button><button class="mini-primary" (click)="addFloor(b.id)">+ Floor</button></div></div>}</div><div class="structure-hint"><b>Safe removal rule</b><span>A floor must be empty and must be the top-most floor before it can be removed.</span></div><hr><div class="form-grid"><label>New Block Name<input [(ngModel)]="newBlockName" placeholder="Block C"></label><label>Initial Floors<input [(ngModel)]="newBlockFloors" type="number" min="1"></label></div></div><div class="modal-footer"><button class="secondary-btn" (click)="blockModal.set(false)">Close</button><button class="primary-btn" (click)="addBlock()">+ Add Block</button></div></section></div>
}
`})
export class AmenitiesPage{
 blockFilter='all';floorFilter:any='all';typeFilter='all';commandBlock='A';commandFloor=0;
 roomModal=signal(false);blockModal=signal(false);floorSetupModal=signal(false);editingRoom=signal<Room|null>(null);error=signal('');roomSaving=signal(false);roomNumberState=signal('');floorError=signal('');bulkMessage=signal('');bulkSaving=signal(false);
 floorSetupBlock='A';floorSetupFloor=0;newBlockName='';newBlockFloors=4;roomDeleteConfirm=signal(false);floorDeleteKey=signal('');
 assetFields:{key:keyof RoomAssets,label:string}[]=[{key:'fans',label:'Fans'},{key:'geysers',label:'Geysers'},{key:'taps',label:'Taps'},{key:'lights',label:'Lights'},{key:'cupboards',label:'Cupboards'},{key:'tables',label:'Tables'},{key:'chairs',label:'Chairs'}];
 floorAssetFields:{key:keyof FloorAssets,label:string,help:string}[]=[
  {key:'washingMachines',label:'Washing Machines',help:'Common laundry machines'},
  {key:'waterPurifiers',label:'Water Purifiers',help:'RO / drinking water units'},
  {key:'commonFans',label:'Common Fans',help:'Corridor / hall fans'},
  {key:'commonTaps',label:'Common Taps',help:'Shared wash-area taps'},
  {key:'commonGeysers',label:'Common Geysers',help:'Shared hot-water units'},
  {key:'commonLights',label:'Common Lights',help:'Corridor / common lights'},
  {key:'cctv',label:'CCTV Cameras',help:'Floor security cameras'},
  {key:'fireExtinguishers',label:'Fire Extinguishers',help:'Safety equipment'},
  {key:'commonToilets',label:'Common Toilets',help:'Shared toilet units'},
  {key:'shoeRacks',label:'Shoe Racks',help:'Shared storage racks'}
 ];
 form:any;floorForm:any;bulkForm:any;
 constructor(public store:StoreService){this.commandBlock=this.store.blocks()[0]?.id||'A';this.floorSetupBlock=this.commandBlock;this.form=this.blankForm();this.floorForm=this.blankFloorForm();this.bulkForm=this.blankBulkForm();}
 blankForm(){return{blockId:this.store?.blocks?.()?.[0]?.id||'A',floor:0,number:'',sharing:3 as SharingType,rent:8500,attachedBath:true,ac:false,assets:{fans:2,geysers:1,taps:2,lights:3,cupboards:3,tables:0,chairs:0} as RoomAssets};}
 blankFloorForm(){return{assets:{washingMachines:0,waterPurifiers:0,commonFans:0,commonTaps:0,commonGeysers:0,commonLights:0,cctv:0,fireExtinguishers:0,commonToilets:0,shoeRacks:0} as FloorAssets,notes:''};}
 blankBulkForm(){return{count:4,startNumber:101,beds:3,rent:8500,ac:false,attachedBath:true,assets:{fans:2,geysers:1,taps:2,lights:3,cupboards:3,tables:0,chairs:0} as RoomAssets};}
 floorName(f:number){return f===0?'Ground Floor':`${f}${f===1?'st':f===2?'nd':f===3?'rd':'th'} Floor`;}
 floors(b:any){return Array.from({length:b.floors},(_,i)=>i);}
 floorsForSelected(){const b=this.store.blocks().find(x=>x.id===this.form.blockId);return Array.from({length:b?.floors||1},(_,i)=>i);}
 floorOptions(){return Array.from({length:Math.max(...this.store.blocks().map(b=>b.floors),1)},(_,i)=>i);}
 commandFloors(){const b=this.store.blocks().find(x=>x.id===this.commandBlock);return Array.from({length:b?.floors||1},(_,i)=>i);}
 ensureCommandFloor(){const max=this.commandFloors().length-1;if(this.commandFloor>max)this.commandFloor=Math.max(0,max);}
 commandSummary(){return this.store.floorSummary(this.commandBlock,this.commandFloor);}
 visibleBlocks(){return this.store.blocks().filter(b=>this.blockFilter==='all'||b.id===this.blockFilter);}
 rooms(block:string,floor:number){return this.store.rooms().filter(r=>r.blockId===block&&r.floor===floor);}
 filteredRooms(block:string,floor:number){return this.rooms(block,floor).filter(r=>this.typeFilter==='all'||(this.typeFilter==='ac'?r.ac:!r.ac));}
 roomCount(block:string){return this.store.rooms().filter(r=>r.blockId===block).length;}
 bedCount(block:string){return this.store.rooms().filter(r=>r.blockId===block).reduce((n,r)=>n+r.beds.length,0);}
 acRooms(){return this.store.rooms().filter(r=>r.ac).length;}
 normalRooms(){return this.store.rooms().filter(r=>!r.ac).length;}
 acCount(block:string){return this.store.rooms().filter(r=>r.blockId===block&&r.ac).length;}
 floorAcCount(block:string,floor:number){return this.rooms(block,floor).filter(r=>r.ac).length;}
 assetCount(block:string,key:keyof RoomAssets){return this.store.rooms().filter(r=>r.blockId===block).reduce((n,r)=>n+r.assets[key],0);}
 totalFloorAsset(key:keyof FloorAssets){return this.store.floorInventories().reduce((n,v)=>n+Number(v.assets[key]||0),0);}
 blockWashingMachines(block:string){return this.store.floorInventories().filter(v=>v.blockId===block).reduce((n,v)=>n+Number(v.assets.washingMachines||0),0);}
 floorBeds(block:string,floor:number){return this.rooms(block,floor).reduce((n,r)=>n+r.beds.length,0);}
 floorAsset(block:string,floor:number,key:keyof RoomAssets){return this.rooms(block,floor).reduce((n,r)=>n+r.assets[key],0);}
 vacantCount(room:Room){return room.beds.filter(b=>b.status==='vacant').length;}
 ensureFloorValid(){const max=this.floorsForSelected().length-1;if(this.form.floor>max)this.form.floor=Math.max(0,max);}
 validateRoomNumber(){if(this.editingRoom()){this.roomNumberState.set('');return;}const no=String(this.form.number||'').trim();if(!no){this.roomNumberState.set('');return;}const exists=this.store.rooms().some(r=>r.blockId===this.form.blockId&&r.number.trim().toLowerCase()===no.toLowerCase());this.roomNumberState.set(exists?'Already added — choose another room number.':'');}
 bedResidentName(bedId:string){return this.store.residentForBed(bedId)?.name||'';}
 bedRentLabel(room:Room,bedId:string){const resident=this.store.residentForBed(bedId),amount=this.store.bedRent(room,bedId);const suffix=resident&&resident.billingCycle==='daily'?'/ day':'/ month';return amount>0?`₹${amount.toLocaleString('en-IN')} ${suffix}`:'Rate not set';}

 openFloorSetup(blockId:string,floor:number){this.floorSetupBlock=blockId;this.floorSetupFloor=floor;const inv=this.store.floorInventory(blockId,floor);this.floorForm={assets:{...inv.assets},notes:inv.notes||''};this.bulkForm=this.blankBulkForm();this.bulkForm.startNumber=(floor+1)*100+1;this.floorError.set('');this.bulkMessage.set('');this.floorSetupModal.set(true);}
 closeFloorSetup(){this.floorSetupModal.set(false);this.floorError.set('');this.bulkMessage.set('');}
 floorSetupSummary(){return this.store.floorSummary(this.floorSetupBlock,this.floorSetupFloor);}
 floorSetupRooms(){return this.rooms(this.floorSetupBlock,this.floorSetupFloor).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));}
 floorSetupBlockName(){return this.store.blocks().find(b=>b.id===this.floorSetupBlock)?.name||this.floorSetupBlock;}
 async saveFloorSetup(){this.floorError.set('');for(const f of this.floorAssetFields)this.floorForm.assets[f.key]=Math.max(0,Number(this.floorForm.assets[f.key])||0);const result=await this.store.saveFloorInventory(this.floorSetupBlock,this.floorSetupFloor,{...this.floorForm.assets},this.floorForm.notes);if(!result?.ok){this.floorError.set('Unable to save floor inventory.');return;}this.bulkMessage.set('Floor inventory saved securely.');}
 async createBulkRooms(){this.bulkSaving.set(true);this.floorError.set('');this.bulkMessage.set('');try{const result=await this.store.bulkAddRooms({blockId:this.floorSetupBlock,floor:this.floorSetupFloor,count:Number(this.bulkForm.count),startNumber:Number(this.bulkForm.startNumber),beds:Number(this.bulkForm.beds),rent:Number(this.bulkForm.rent),ac:Boolean(this.bulkForm.ac),attachedBath:Boolean(this.bulkForm.attachedBath),assets:{...this.bulkForm.assets}});if(!result?.ok){this.floorError.set('Unable to create rooms.');return;}this.bulkMessage.set(`${result.created} room${result.created===1?'':'s'} created. Room and bed totals updated automatically.`);this.bulkForm.startNumber=Number(this.bulkForm.startNumber)+Math.max(1,Number(this.bulkForm.count)||1);}finally{this.bulkSaving.set(false);}}
 goToNewRoomFromFloor(){const b=this.floorSetupBlock,f=this.floorSetupFloor;this.closeFloorSetup();this.newRoom(b,f);}
 editRoomFromFloor(room:Room){this.closeFloorSetup();this.editRoom(room);}

 newRoom(blockId?:string,floor?:number){this.editingRoom.set(null);this.roomNumberState.set('');this.form=this.blankForm();if(blockId)this.form.blockId=blockId;if(floor!==undefined)this.form.floor=floor;this.error.set('');this.roomDeleteConfirm.set(false);this.roomModal.set(true);}
 editRoom(room:Room){this.editingRoom.set(room);this.form={...this.blankForm(),...room,sharing:room.beds.length,assets:{...room.assets}};this.error.set('');this.roomDeleteConfirm.set(false);this.roomModal.set(true);}
 closeRoomModal(){if(this.roomSaving())return;this.roomModal.set(false);this.roomDeleteConfirm.set(false);this.error.set('');this.roomNumberState.set('');}
 async saveRoom(){if(this.roomSaving())return;this.error.set('');this.validateRoomNumber();if(!this.editingRoom()&&this.roomNumberState()){this.error.set(this.roomNumberState());return;}if(Number(this.form.rent)<0){this.error.set('Default bed rent cannot be negative.');return;}if(!this.editingRoom()&&!this.form.number.trim()){this.error.set('Room number is required.');return;}if(!this.editingRoom()&&Number(this.form.sharing)<1){this.error.set('At least one bed is required.');return;}this.roomSaving.set(true);try{if(this.editingRoom()){const result=await this.store.updateRoom(this.editingRoom()!.id,{rent:Number(this.form.rent)||0,attachedBath:Boolean(this.form.attachedBath),ac:Boolean(this.form.ac),assets:{...this.form.assets}});if(!result?.ok){this.error.set('Unable to save room changes.');return;}this.roomModal.set(false);return;}const result=await this.store.addRoom({...this.form,sharing:Number(this.form.sharing) as SharingType,assets:{...this.form.assets}});if(!result?.ok){this.error.set(result?.error==='exists'?'Already added — this room number already exists in the selected block.':'Unable to create room.');this.validateRoomNumber();return;}this.roomModal.set(false);}finally{this.roomSaving.set(false);}}
 async addBed(){const room=this.editingRoom();if(!room)return;await this.store.addBed(room.id);this.editingRoom.set(this.store.rooms().find(r=>r.id===room.id)||null);}
 async removeBed(bedId:string){const room=this.editingRoom();if(!room)return;const result=await this.store.removeBed(room.id,bedId);if(!result?.ok){this.error.set('Only vacant beds can be removed.');return;}this.editingRoom.set(this.store.rooms().find(r=>r.id===room.id)||null);}
 async removeRoom(){const room=this.editingRoom();if(!room)return;const result=await this.store.removeRoom(room.id);if(!result?.ok){this.error.set('This room cannot be removed while a bed is occupied or linked to an active resident.');this.roomDeleteConfirm.set(false);return;}this.closeRoomModal();}
 async addFloor(blockId:string){const result=await this.store.addFloor(blockId);if(!result?.ok)this.error.set('Unable to add floor.');}
 askRemoveFloor(blockId:string,floor:number){this.floorDeleteKey.set(`${blockId}:${floor}`);this.blockModal.set(false);}
 async removeFloor(blockId:string,floor:number){const result=await this.store.removeFloor(blockId,floor);if(!result?.ok){this.error.set(result?.error==='rooms-exist'?'Remove all rooms from this floor first.':result?.error==='top-only'?'Only the top-most floor can be removed safely.':'This floor cannot be removed.');this.floorDeleteKey.set('');return;}this.floorDeleteKey.set('');if(this.floorFilter!=='all'&&+this.floorFilter>=this.store.blocks().find(b=>b.id===blockId)!.floors)this.floorFilter='all';}
 async addBlock(){if(!this.newBlockName.trim())return;await this.store.addBlock(this.newBlockName,this.newBlockFloors);this.newBlockName='';this.newBlockFloors=4;}
}
