// src/lib/firbaseAdmin.js
const admin = require('firebase-admin');
const path = require('path');

function initFirebaseAdmin() {
  if (admin.apps.length) {
    return admin.app(); // return existing app
  }

  const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("Firebase Admin initialized successfully");
  return admin;
}

module.exports = initFirebaseAdmin();