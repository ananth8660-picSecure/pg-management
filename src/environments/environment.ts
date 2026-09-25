export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyAggIqalluMlLHYOIpOtwPkoyHncwp6gnE',
    authDomain: 'mana-pg.firebaseapp.com',
    projectId: 'mana-pg',
    storageBucket: 'mana-pg.firebasestorage.app',
    messagingSenderId: '152236952701',
    appId: '1:152236952701:web:5b503de43ac1984600b514',
    measurementId: 'G-06400SSKNY',
    // Firebase Console → Project settings → Cloud Messaging → Web Push certificates. Public key only.
    vapidKey: ''
  },
  // Optional: add a reCAPTCHA Enterprise/App Check site key later and enable enforcement in Firebase Console.
  appCheckSiteKey: ''
};
