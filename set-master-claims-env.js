const admin = require('firebase-admin');

// This script is intended to be run locally with environment variables set.
// It sets custom claims for an existing Firebase Authentication user to make them a master user.

async function setMasterClaims() {
    // --- Configuration - Read from Environment Variables ---
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const userUidToMakeMaster = process.env.MASTER_USER_UID;

    if (!serviceAccountPath) {
        console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable not set.');
        console.error('Please set it to the path of your Firebase service account key JSON file.');
        process.exit(1);
    }

    if (!userUidToMakeMaster) {
        console.error('ERROR: MASTER_USER_UID environment variable not set.');
        console.error('Please set it to the UID of the user you want to grant master privileges.');
        process.exit(1);
    }

    try {
        // Initialize Firebase Admin SDK
        // The SDK will automatically use GOOGLE_APPLICATION_CREDENTIALS
        admin.initializeApp();

        console.log(`Attempting to set 'master' claims for user UID: ${userUidToMakeMaster}...`);

        const claimsToSet = {
            roles: ['master'],
            isActive: true, // Master users should be active by default
        };

        // Set custom user claims
        await admin.auth().setCustomUserClaims(userUidToMakeMaster, claimsToSet);
        console.log(`Successfully set 'master' claims for user ${userUidToMakeMaster}.`);

        // Verify by fetching the user record (optional but good practice)
        const userRecord = await admin.auth().getUser(userUidToMakeMaster);
        console.log('Verification - User claims after update:', userRecord.customClaims);

    } catch (error) {
        console.error('Error setting master claims:', error);
        process.exit(1);
    }
}

setMasterClaims().then(() => {
    console.log('Script finished.');
    process.exit(0);
}).catch(() => {
    // Error already logged in setMasterClaims
    process.exit(1);
});
