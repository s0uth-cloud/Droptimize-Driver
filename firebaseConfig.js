import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
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

const env = Constants.expoConfig.extra.firebase;

const firebaseConfig = {
  apiKey: env.apiKey,
  authDomain: env.authDomain,
  projectId: env.projectId,
  storageBucket: env.storageBucket,
  messagingSenderId: env.messagingSenderId,
  appId: env.appId,
};

// Log config to verify env vars are loaded
console.log("Firebase Config Check:");
console.log("API Key exists:", !!firebaseConfig.apiKey);
console.log("Project ID:", firebaseConfig.projectId);

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("❌ Firebase config is missing! Check your environment variables.");
  console.error("Config:", firebaseConfig);
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
console.log("✅ Firebase app initialized");

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
  console.log("✅ Firebase Auth initialized with persistence");
} catch (error) {
  console.log("⚠️ Using default auth (persistence might already be set)");
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

console.log("✅ Firestore and Storage initialized");

export { auth, db, ReactNativeAsyncStorage, storage };

// Rest of your functions remain the same...
export const registerUser = async ({ email, password, firstName, lastName }) => {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const fullName = `${firstName} ${lastName}`;

    await Promise.all([
      sendEmailVerification(user),
      updateProfile(user, { displayName: fullName }),
      setDoc(doc(db, "users", user.uid), {
        id: user.uid,
        fullName,
        firstName,
        lastName,
        email,
        role: "driver",
        photoURL: "",
        location: null,
        speed: 0,
        speedLimit: 0,
        status: "offline",
        parcelsLeft: 0,
        parcelsDelivered: 0,
        totalTrips: 0,
        accountSetupComplete: false,
        createdAt: serverTimestamp(),
      }),
    ]);

    await ReactNativeAsyncStorage.setItem(
      "user",
      JSON.stringify({ uid: user.uid, email, displayName: fullName })
    );

    return { success: true, user };
  } catch (error) {
    console.error("Register error:", error.message);
    return { success: false, error };
  }
};

export const loginUser = async (email, password) => {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await ReactNativeAsyncStorage.setItem(
      "user",
      JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      })
    );
    return { success: true, user };
  } catch (error) {
    console.error("Login error:", error.message);
    return { success: false, error };
  }
};

export const checkAuth = () =>
  new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) return resolve({ authenticated: false });
      const userDoc = await getDoc(doc(db, "users", user.uid)).catch(() => null);
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