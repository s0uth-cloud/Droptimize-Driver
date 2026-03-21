// External dependencies
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    getReactNativePersistence,
    initializeAuth,
    onAuthStateChanged,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from "firebase/auth";
import {
    doc,
    getDoc,
    getFirestore,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, ReactNativeAsyncStorage, storage };

/**
 * Registers a new user by creating a Firebase Auth account, initializing their Firestore profile with default driver settings, and sending an email verification.
 * The function performs email uniqueness validation in Firestore and automatically cleans up the auth account if a duplicate is found.
 * Upon successful registration, the user data is persisted to AsyncStorage for session management.
 * Returns an object with success status, the created user object, or an error message.
 */
export const registerUser = async ({
  email,
  password,
  firstName,
  lastName,
}) => {
  let createdUser = null;

  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Create user first with Firebase Auth
    const { user } = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );
    createdUser = user;
    const fullName = `${firstName} ${lastName}`;

    await updateProfile(user, { displayName: fullName });

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      fullName,
      firstName,
      lastName,
      email: normalizedEmail,
      role: "driver",
      photoURL: "",
      location: null,
      speed: 0,
      speedLimit: 0,
      status: "Offline",
      parcelsLeft: 0,
      parcelsDelivered: 0,
      totalTrips: 0,
      accountSetupComplete: false,
      vehicleSetupComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await sendEmailVerification(user);

    await ReactNativeAsyncStorage.setItem(
      "user",
      JSON.stringify({
        uid: user.uid,
        email: normalizedEmail,
        displayName: fullName,
      }),
    );

    return { success: true, user };
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (cleanupError) {
        console.error("Register cleanup error:", cleanupError.message);
      }
    }
    console.error("Register error:", error.message);
    return { success: false, error };
  }
};

/**
 * Authenticates an existing user with email and password credentials using Firebase Auth.
 * On successful login, the user's basic information (uid, email, displayName) is stored in AsyncStorage to maintain the session across app restarts.
 * Returns an object with success status, the authenticated user object, or an error message if authentication fails.
 */
export const loginUser = async (email, password) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { user } = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );

    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (!userDocSnap.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: "auth/no-user-profile",
          message: "No user profile found for this account.",
        },
      };
    }

    const userData = userDocSnap.data() || {};
    if (userData.role !== "driver") {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: "auth/forbidden-role",
          message: "Access denied. Driver account required.",
        },
      };
    }

    if (!user.emailVerified) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: "auth/email-not-verified",
          message: "Please verify your email before logging in.",
        },
      };
    }

    await ReactNativeAsyncStorage.setItem(
      "user",
      JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      }),
    );
    return { success: true, user };
  } catch (error) {
    console.error("Login error:", error.message);
    if (error?.code === "permission-denied") {
      return {
        success: false,
        error: {
          code: "auth/access-denied",
          message: "Access denied for this account. Please contact support.",
        },
      };
    }
    return { success: false, error };
  }
};

/**
 * Checks the current authentication state and retrieves the user's complete profile data from Firestore.
 * This function listens for auth state changes once, unsubscribes immediately, and returns a promise that resolves with authentication status, email verification status, and merged user data from both Firebase Auth and Firestore.
 * Used during app initialization to restore user sessions and verify authentication before allowing access to protected screens.
 */
export const checkAuth = () =>
  new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) return resolve({ authenticated: false });
      const userDoc = await getDoc(doc(db, "users", user.uid)).catch(
        () => null,
      );
      const userData = userDoc?.data() || {};
      resolve({
        authenticated: true,
        emailVerified: user.emailVerified,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          ...userData,
        },
      });
    });
  });

/**
 * Signs out the current user from Firebase Auth and clears all user data from AsyncStorage.
 * This ensures a clean logout by removing both the server-side authentication session and local cached user information.
 * Returns an object with success status or an error message if the logout process fails.
 */
export const logoutUser = async () => {
  try {
    await auth.signOut();
    await ReactNativeAsyncStorage.removeItem("user");
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error.message);
    return { success: false, error };
  }
};

/**
 * Sends a password reset email to the specified email address using Firebase Auth's built-in password recovery functionality.
 * The email contains a secure link that allows users to reset their password without requiring their current credentials.
 * Returns an object with success status or an error message if the email cannot be sent (e.g., email not found).
 */
export const sendPasswordResetEmail = async (email) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const functionUrl = process.env.EXPO_PUBLIC_PASSWORD_RESET_FUNCTION_URL;
    const webResetBaseUrl =
      process.env.EXPO_PUBLIC_PASSWORD_RESET_CONTINUE_URL ||
      "https://droptimize-4b6fc.web.app/reset-password";

    if (!functionUrl) {
      throw new Error(
        "EXPO_PUBLIC_PASSWORD_RESET_FUNCTION_URL is not configured.",
      );
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        webResetBaseUrl,
        source: "mobile",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Failed to send reset email.");
    }

    return { success: true };
  } catch (error) {
    console.error("Password reset error:", error.message);
    return { success: false, error };
  }
};
