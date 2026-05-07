import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';

dotenv.config();

// Ensure you have FIREBASE_SERVICE_ACCOUNT downloaded from your Firebase console
// and set its path in your .env file: FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    const serviceAccountContent = readFileSync(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH), 'utf-8');
    const serviceAccount = JSON.parse(serviceAccountContent);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    // Removed console.log for security policy
  } catch (error) {
    // Handling error silently
  }
}

export { admin };
