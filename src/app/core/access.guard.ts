import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { StoreService } from './store.service';
import { PagePermission } from './models';

export const authGuard:CanActivateFn=async()=>{
  const auth=inject(AuthService),router=inject(Router);
  // Firebase local persistence restores asynchronously on a fresh page load.
  // Waiting here prevents an authenticated user from briefly being routed to
  // /login before their persisted session is available.
  await auth.waitUntilReady();
  return auth.user() ? true : router.createUrlTree(['/login']);
};

export const guestGuard:CanActivateFn=async()=>{
  const auth=inject(AuthService),router=inject(Router);
  await auth.waitUntilReady();
  return auth.user() ? router.createUrlTree(['/']) : true;
};

export const pageAccessGuard:CanActivateFn=async(route)=>{
  const auth=inject(AuthService),store=inject(StoreService),router=inject(Router);
  await auth.waitUntilReady();
  const user=auth.user(); if(!user) return router.createUrlTree(['/login']);
  const permission=(route.data?.['permission']||'dashboard') as PagePermission;
  return store.canAccess(permission) ? true : router.createUrlTree(['/profile']);
};

export const superOwnerGuard:CanActivateFn=async()=>{
  const auth=inject(AuthService),router=inject(Router);
  await auth.waitUntilReady();
  const user=auth.user();
  return user?.platformRole==='platform_owner' ? true : router.createUrlTree(['/']);
};
