/* PG Ops Firebase Cloud Messaging service worker. Firebase web config contains public identifiers, not secrets. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:'AIzaSyAggIqalluMlLHYOIpOtwPkoyHncwp6gnE',
  authDomain:'mana-pg.firebaseapp.com',
  projectId:'mana-pg',
  messagingSenderId:'152236952701',
  appId:'1:152236952701:web:5b503de43ac1984600b514'
});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
  const title=payload.notification?.title||payload.data?.title||'PG Ops';
  const options={
    body:payload.notification?.body||payload.data?.body||'A new PG update is available.',
    icon:'/favicon.svg',badge:'/favicon.svg',tag:payload.data?.tag||'pg-ops-update',
    data:{url:payload.data?.url||'/notifications'}
  };
  self.registration.showNotification(title,options);
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=event.notification.data?.url||'/notifications';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c){c.navigate(url);return c.focus();}}return clients.openWindow(url);}));
});
