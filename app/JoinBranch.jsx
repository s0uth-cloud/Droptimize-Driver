import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function JoinBranch() {
  const router = useRouter();
  const { scannedJoinCode } = useLocalSearchParams();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (scannedJoinCode) {
      setJoinCode(scannedJoinCode);
    }
  }, [scannedJoinCode]);

  const handleJoinBranch = async () => {
    setError("");
    
    if (!joinCode.trim()) {
      setError("Join code is required");
      return;
    }

    if (joinCode.trim().length < 4) {
      setError("Join code must be at least 4 characters");
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not authenticated. Please log in again.");
        router.replace("/Login");
        return;
      }

      // Verify branch exists
      const branchRef = doc(db, "branches", joinCode);
      const branchSnap = await getDoc(branchRef);
      
      if (!branchSnap.exists()) {
        setError("Invalid join code. Please check and try again.");
        setLoading(false);
        return;
      }

      // Update user with branch ID
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        branchId: branchRef.id,
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        "Success!",
        "You have successfully joined the branch.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/Home")
          }
        ]
      );
    } catch (err) {
      console.error("Error joining branch:", err);
      setError("Failed to join branch. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <Ionicons name="business-outline" size={80} color="#00b2e1" style={{ marginBottom: 20 }} />
        
        <Text style={styles.title}>Join a Branch</Text>
        <Text style={styles.description}>
          Enter your company&apos;s branch code or scan the QR code to join a branch and start receiving deliveries.
        </Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="Enter Join Code"
            placeholderTextColor="#999"
            value={joinCode}
            onChangeText={(text) => {
              setJoinCode(text);
              setError("");
            }}
            autoCapitalize="characters"
            underlineColorAndroid="transparent"
            autoCorrect={false}
          />
          <TouchableOpacity 
            onPress={() => router.push("/ScanQR")}
            style={styles.qrButton}
          >
            <Ionicons name="qr-code-outline" size={28} color="#00b2e1" />
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleJoinBranch} 
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Join Branch</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/Home")} style={{ marginTop: 16 }}>
          <Text style={styles.link}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    marginBottom: 12,
    textAlign: "center",
    fontFamily: "LEMONMILK-Bold",
    color: "#00b2e1",
  },
  description: {
    fontSize: 14,
    textAlign: "center",
    color: "#666",
    marginBottom: 32,
    fontFamily: "Lexend-Regular",
    paddingHorizontal: 20,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    marginBottom: 6,
    width: "100%",
    height: 50,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    height: 50,
    paddingVertical: 0,
    paddingRight: 10,
    fontSize: 16,
    color: "#000",
    fontFamily: "Lexend-Regular",
  },
  qrButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    height: 40,
    width: 40,
  },
  inputError: {
    borderColor: "#f21b3f",
  },
  errorText: {
    color: "#f21b3f",
    fontSize: 12,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  button: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
    width: "70%",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
  link: {
    color: "#666",
    textAlign: "center",
    fontFamily: "Lexend-Regular",
    textDecorationLine: "underline",
  },
});
