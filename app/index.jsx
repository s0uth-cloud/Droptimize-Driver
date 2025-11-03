import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { auth } from "../firebaseConfig";

export default function Index() {
  const [userChecked, setUserChecked] = useState(false);
  const [user, setUser] = useState(null);
  const router = useRouter();

  // Wait for auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setUserChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Redirect only *after* Firebase has responded and delay is done
  useEffect(() => {
    if (userChecked) {
      const delay = setTimeout(() => {
        if (user) {
          router.replace("/Home");
        } else {
          router.replace("/Login");
        }
      }, 3000); // Splash delay (3s)

      return () => clearTimeout(delay);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userChecked, user]);

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/logo.png")} style={styles.logo} />
      <ActivityIndicator size="large" color="#00b2e1" />
    </View>
  );
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