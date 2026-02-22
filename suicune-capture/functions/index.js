const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

exports.attemptCapture = functions.https.onCall(async (data, context) => {

  // Secure RNG
  const roll = crypto.randomInt(0, 10000);

  const success = roll < 50; // 0.5%

  await admin.firestore().collection("captures").add({
    roll,
    success,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success };

});