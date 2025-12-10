import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    getAuth,
    getReactNativePersistence,
    initializeAuth,
    onAuthStateChanged,
    sendEmailVerification,
    signInWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    query,
    serverTimestamp,
    setDoc,
    where,
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

export const registerUser = async ({ email, password, firstName, lastName }) => {
  try {
    // Create user first with Firebase Auth
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const fullName = `${firstName} ${lastName}`;

    await updateProfile(user, { displayName: fullName });
    
    // Now check if email already exists in Firestore (should not happen, but just in case)
    const usersRef = collection(db, "users");
    const emailQuery = query(usersRef, where("email", "==", email.toLowerCase().trim()));
    const emailSnapshot = await getDocs(emailQuery);
    
    if (!emailSnapshot.empty) {
      // Clean up the auth user if Firestore document already exists
      await user.delete();
      return { 
        success: false, 
        error: { message: "This email is already registered. Please use a different email or login." } 
      };
    }
    
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      fullName,
      firstName,
      lastName,
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

    await sendEmailVerification(user);

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

export const sendPasswordResetEmail = async (email) => {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    console.error("Password reset error:", error.message);
    return { success: false, error };
  }
};