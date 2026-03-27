// External dependencies
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
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
  deleteDoc,
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

console.log("[FirebaseConfig] projectId:", firebaseConfig.projectId);

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
const PROFILE_FUNCTION_URL =
  process.env.EXPO_PUBLIC_PROFILE_FUNCTION_URL ||
  "https://asia-southeast1-droptimize-4b6fc.cloudfunctions.net/upsertUserProfile";

export { auth, db, ReactNativeAsyncStorage, storage };

const createDriverProfilePayload = ({ uid, email, firstName, lastName }) => ({
  uid,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`.trim(),
  email,
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
  let firestoreDocCreated = false;

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
    const profilePayload = createDriverProfilePayload({
      uid: user.uid,
      email: normalizedEmail,
      firstName,
      lastName,
    });

    await updateProfile(user, { displayName: fullName });

    let profileCreated = false;
    try {
      const idToken = await user.getIdToken();
      const profileRes = await fetch(PROFILE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          firstName,
          lastName,
          role: "driver",
        }),
      });

      if (!profileRes.ok) {
        const payload = await profileRes.json().catch(() => ({}));
        const message =
          payload?.message ||
          "Failed to create user profile. Please try again.";
        const profileError = new Error(message);
        profileError.code = payload?.error || "auth/profile-write-denied";
        throw profileError;
      }

      profileCreated = true;
      firestoreDocCreated = true;
    } catch (profileError) {
      console.warn(
        "[FirebaseConfig] Profile function failed, trying direct Firestore write:",
        profileError?.code || profileError?.message,
      );

      try {
        await setDoc(doc(db, "users", user.uid), profilePayload, {
          merge: true,
        });
        profileCreated = true;
        firestoreDocCreated = true;
      } catch (fallbackError) {
        const writeError = new Error(
          "Unable to create account profile. Please contact support.",
        );
        writeError.code = fallbackError?.code || "auth/profile-write-denied";
        throw writeError;
      }
    }

    if (!profileCreated) {
      const error = new Error("Unable to create account profile.");
      error.code = "auth/profile-write-denied";
      throw error;
    }

    let emailVerificationSent = false;
    try {
      await sendEmailVerification(user);
      emailVerificationSent = true;
    } catch (emailError) {
      console.error(
        "[Register] Failed to send email verification:",
        emailError?.code || emailError?.message,
      );
      const err = new Error(
        "Account created but failed to send verification email. Please check your email or contact support.",
      );
      err.code = "auth/email-verification-failed";
      throw err;
    }

    if (!emailVerificationSent) {
      const error = new Error("Failed to send email verification.");
      error.code = "auth/email-verification-failed";
      throw error;
    }

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
    // Clean up Firestore document if it was created
    if (firestoreDocCreated && createdUser) {
      console.warn(
        "[Register] Cleaning up Firestore document for UID:",
        createdUser.uid,
      );
      try {
        await deleteDoc(doc(db, "users", createdUser.uid));
        console.log(
          "[Register] Firestore document successfully deleted:",
          createdUser.uid,
        );
      } catch (firestoreDeleteError) {
        console.error(
          "[Register] Failed to delete Firestore document:",
          createdUser.uid,
          firestoreDeleteError?.code || firestoreDeleteError?.message,
        );

        try {
          console.warn("[Register] Retrying Firestore document deletion...");
          await deleteDoc(doc(db, "users", createdUser.uid));
          console.log(
            "[Register] Firestore document deleted on retry:",
            createdUser.uid,
          );
        } catch (retryError) {
          console.error(
            "[Register] CRITICAL: Failed to delete Firestore document after profile creation failed. Manual cleanup required for UID:",
            createdUser.uid,
            retryError?.code || retryError?.message,
          );
        }
      }
    }

    // Clean up Auth account if it was created
    if (createdUser) {
      console.warn(
        "[Register] Profile creation failed, cleaning up Auth account:",
        createdUser.uid,
      );
      try {
        await deleteUser(createdUser);
        console.log(
          "[Register] Auth account successfully deleted:",
          createdUser.uid,
        );
      } catch (cleanupError) {
        console.error(
          "[Register] Failed to delete Auth account on first attempt:",
          createdUser.uid,
          cleanupError?.code || cleanupError?.message,
        );

        try {
          console.warn("[Register] Retrying Auth account deletion...");
          await deleteUser(createdUser);
          console.log(
            "[Register] Auth account deleted on retry:",
            createdUser.uid,
          );
        } catch (retryError) {
          console.error(
            "[Register] CRITICAL: Failed to delete orphaned Auth account after profile creation failed. Manual cleanup required for UID:",
            createdUser.uid,
            retryError?.code || retryError?.message,
          );
        }
      }
    }

    if (
      error?.code === "permission-denied" ||
      error?.code === "profile-write-failed" ||
      error?.code === "auth/profile-write-denied"
    ) {
      return {
        success: false,
        error: {
          code: "auth/profile-write-denied",
          message:
            "Account creation was blocked by database permissions. Please contact support.",
        },
      };
    }

    if (error?.code === "auth/email-verification-failed") {
      return {
        success: false,
        error: {
          code: "auth/email-verification-failed",
          message:
            "Account created but verification email could not be sent. Please try again or contact support.",
        },
      };
    }

    if (error?.code === "auth/email-already-in-use") {
      return {
        success: false,
        error: {
          code: "auth/email-already-in-use",
          message:
            "This email is already registered. Please login or use a different email.",
        },
      };
    }

    if (error?.code === "auth/weak-password") {
      return {
        success: false,
        error: {
          code: "auth/weak-password",
          message: "Password is too weak. Please use a stronger password.",
        },
      };
    }

    if (error?.code === "auth/network-request-failed") {
      return {
        success: false,
        error: {
          code: "auth/network-request-failed",
          message: "Network error while contacting Firebase. Please try again.",
        },
      };
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

    let userDocSnap;
    try {
      userDocSnap = await getDoc(doc(db, "users", user.uid));
    } catch (error) {
      if (error?.code !== "permission-denied") {
        throw error;
      }

      await user.getIdToken(true);
      userDocSnap = await getDoc(doc(db, "users", user.uid));
    }

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
          message:
            "Please verify your email before logging in. Check your inbox for the verification link.",
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
    return { success: true, user, profile: userData };
  } catch (error) {
    console.error("Login error:", error.message);
    if (error?.code === "permission-denied") {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error(
          "Login permission-denied signOut error:",
          signOutError?.message || signOutError,
        );
      }
      return {
        success: false,
        error: {
          code: "auth/access-denied",
          message: "Access denied for this account. Please contact support.",
        },
      };
    }

    // Harden error messages to prevent information disclosure
    const SAFE_ERROR_MESSAGES = {
      "auth/user-not-found": "Invalid email or password",
      "auth/wrong-password": "Invalid email or password",
      "auth/invalid-email": "Please enter a valid email address",
      "auth/too-many-requests":
        "Too many failed login attempts. Please try again later.",
      "auth/user-disabled":
        "This account has been disabled. Please contact support.",
    };

    const safeMessage =
      SAFE_ERROR_MESSAGES[error?.code] ||
      "An error occurred during login. Please try again.";
    console.error("[Login] Error code:", error?.code);

    return {
      success: false,
      error: {
        code: error?.code || "auth/unknown-error",
        message: safeMessage,
      },
    };
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
    console.error("[Logout] Error code:", error?.code);
    return {
      success: false,
      error: {
        code: error?.code || "auth/logout-failed",
        message: "Failed to sign out. Please try again.",
      },
    };
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
    const continueUrl =
      process.env.EXPO_PUBLIC_PASSWORD_RESET_CONTINUE_URL ||
      "https://droptimize-4b6fc.web.app/reset-password";

    await firebaseSendPasswordResetEmail(auth, normalizedEmail, {
      url: continueUrl,
      handleCodeInApp: false,
    });

    return { success: true };
  } catch (error) {
    const code = error?.code || "auth/unknown";
    console.error("Password reset error:", code, error?.message || error);

    // Keep UX consistent with Firebase anti-enumeration behavior.
    if (code === "auth/user-not-found") {
      return { success: true };
    }

    const messageByCode = {
      "auth/invalid-email": "Invalid email format.",
      "auth/missing-email": "Email is required.",
      "auth/too-many-requests":
        "Too many attempts. Please wait a few minutes and try again.",
      "auth/network-request-failed":
        "Network error. Please check your connection and try again.",
      "auth/operation-not-allowed":
        "Password reset is not enabled for this project.",
    };

    return {
      success: false,
      error: {
        code,
        message:
          messageByCode[code] ||
          `${error?.message || "Failed to send reset email."} (${code})`,
      },
    };
  }
};
