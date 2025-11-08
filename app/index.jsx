import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();          
  const [loading, setLoading] = useState(true);

  const hasNavigatedRef = useRef(false);
  const ensuredViolationsRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
      
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!mountedRef.current) return;
      if (pathname !== "/") {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const navOnce = (target) => {
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;
        router.replace(target);
        if (mountedRef.current) setLoading(false);
      };

      if (!user) {
        navOnce("/Login");
        return;
      }

      try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
          try { await signOut(auth); } catch {}
          navOnce("/Login");
        return;
      }

        const data = snap.data() || {};
        if (typeof data.violations === "undefined" && !ensuredViolationsRef.current) {
          ensuredViolationsRef.current = true;
          try { await updateDoc(userRef, { violations: [] }); } catch {}
        }

          const needsSetup = !data.accountSetupComplete || !data.vehicleSetupComplete;
        navOnce(needsSetup ? "/AccountSetup" : "/Home");
      } catch {
        navOnce("/Login");
        }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };

  }, [router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Image source={require("../assets/images/logo.png")} style={styles.logo} />
        <ActivityIndicator size="large" color="#00b2e1" />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  logo: {
    width: "80%",
    height: 200,
    resizeMode: "contain",
  },
});