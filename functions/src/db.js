const admin = require("firebase-admin");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db, FieldValue, Timestamp };
