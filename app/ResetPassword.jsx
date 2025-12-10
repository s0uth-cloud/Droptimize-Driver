import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { sendPasswordResetEmail } from "../firebaseConfig";

export default function ResetPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleResetPassword = async () => {
    setError("");
    
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email format");
      return;
    }

    setLoading(true);
    try {
      const result = await sendPasswordResetEmail(email);
      if (result.success) {
        Alert.alert(
          "Success",
          "Password reset email sent! Please check your inbox.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        setError(result.error.message || "Failed to send reset email");
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.description}>
          Enter your email address to reset your password.
        </Text>

        <TextInput
          style={[styles.input, error && styles.inputError]}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError("");
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          underlineColorAndroid="transparent"
          autoCorrect={false}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleResetPassword} 
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Back to Login</Text>
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
    padding: 16,
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
    marginBottom: 24,
    fontFamily: "Lexend-Regular",
    paddingHorizontal: 20,
  },
  input: {
    width: "100%",
    height: 50,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 4,
    fontFamily: "Lexend-Regular",
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
  },
  inputError: {
    borderColor: "#f21b3f",
  },
  errorText: {
    color: "#f21b3f",
    fontSize: 12,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
    width: "50%",
    alignSelf: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
  link: {
    marginTop: 16,
    color: "#00b2e1",
    textAlign: "center",
    fontFamily: "Lexend-Regular",
  },
});
