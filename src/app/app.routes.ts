import { Routes } from '@angular/router';
import { authGuard, guestGuard, pageAccessGuard, superOwnerGuard } from './core/access.guard';

const protectedChild=(path:string,loadComponent:()=>Promise<any>,permission:string,data:any={})=>({
  path,loadComponent,canActivate:[pageAccessGuard],data:{...data,permission}
} as any);

export const routes:Routes=[
  {
    path:'login',
    canActivate:[guestGuard],
    loadComponent:()=>import('./pages/login.page').then(m=>m.LoginPage)
  },
  {
    path:'',
    canActivate:[authGuard],
    loadComponent:()=>import('./layout/shell.component').then(m=>m.ShellComponent),
    children:[
      protectedChild('',()=>import('./pages/dashboard.page').then(m=>m.DashboardPage),'dashboard'),
      protectedChild('vacancy',()=>import('./pages/vacancy.page').then(m=>m.VacancyPage),'vacancy'),
      protectedChild('residents',()=>import('./pages/residents.page').then(m=>m.ResidentsPage),'residents'),
      protectedChild('property',()=>import('./pages/property.page').then(m=>m.PropertyPage),'property'),
      protectedChild('amenities',()=>import('./pages/amenities.page').then(m=>m.AmenitiesPage),'amenities'),
      protectedChild('payments',()=>import('./pages/payments.page').then(m=>m.PaymentsPage),'payments'),
      protectedChild('food',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'food',{module:'food'}),
      protectedChild('staff',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'staff',{module:'staff'}),
      protectedChild('maintenance',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'maintenance',{module:'maintenance'}),
      protectedChild('assets',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'assets',{module:'assets'}),
      protectedChild('utilities',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'utilities',{module:'utilities'}),
      protectedChild('expenses',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'expenses',{module:'expenses'}),
      protectedChild('vendors',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'vendors',{module:'vendors'}),
      protectedChild('calendar',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'calendar',{module:'calendar'}),
      protectedChild('reports',()=>import('./pages/reports.page').then(m=>m.ReportsPage),'reports'),
      protectedChild('documents',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'documents',{module:'documents'}),
      protectedChild('notifications',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'notifications',{module:'notifications'}),
      protectedChild('activity',()=>import('./pages/operations.page').then(m=>m.OperationsPage),'activity',{module:'activity'}),
      protectedChild('settings',()=>import('./pages/settings.page').then(m=>m.SettingsPage),'settings'),
      {path:'profile',loadComponent:()=>import('./pages/profile.page').then(m=>m.ProfilePage)},
      {path:'platform',canActivate:[superOwnerGuard],loadComponent:()=>import('./pages/super-owner.page').then(m=>m.SuperOwnerPage)}
    ]
  },
  {path:'**',redirectTo:''}
];
