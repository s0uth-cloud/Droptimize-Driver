// External dependencies
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

// Internal dependencies
import { db, loginUser } from "../firebaseConfig";

/**
 * Driver login screen with email and password authentication.
 * Validates credentials, authenticates with Firebase Auth, checks account setup completion status, and navigates to appropriate screen (Home if setup complete, AccountSetup if not).
 * Displays validation errors and Firebase authentication errors with user-friendly messages.
 */
export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  /**
   * Validates login form fields (email and password presence).
   * Returns true if valid, false otherwise, and updates errors state.
   */
  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.password.trim()) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles login submission by validating form, authenticating with Firebase, checking account setup status, and navigating to appropriate screen.
   * Fetches user document from Firestore to determine if account setup is complete.
   */
  const handleLogin = async () => {
    setFirebaseError("");
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await loginUser(formData.email, formData.password);
      if (!result.success) {
        setFirebaseError(result.error.message || result.error);
        return;
      }

      const user = result.user;
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      const data = userDocSnap.data();

      if (data?.accountSetupComplete) router.replace("/Home");
      else router.replace("/AccountSetup");
    } catch (error) {
      console.error(error);
      setFirebaseError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LOGIN</Text>
      
      <View>
        <TextInput
          style={[styles.input, errors.email && styles.inputError]}
          placeholder="Email"
          placeholderTextColor="#999"
          value={formData.email}
          onChangeText={(text) => handleChange("email", text)}
          keyboardType="email-address"
          autoCapitalize="none"
          underlineColorAndroid="transparent"
          autoCorrect={false}
        />
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
      </View>

      <View>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, errors.password && styles.inputError]}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={formData.password}
            onChangeText={(text) => handleChange("password", text)}
            autoCapitalize="none"
            underlineColorAndroid="transparent"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={24}
              color="#666"
            />
          </TouchableOpacity>
        </View>
        {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
      </View>

      {firebaseError && <Text style={styles.errorText}>{firebaseError}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/SignUp")}>
        <Text style={styles.link}>Don&apos;t have an account? Register</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/ResetPassword")}>
        <Text style={styles.link}>Forgot Password?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    padding: 16, 
    backgroundColor: "#fff" 
  },
  title: { 
    fontSize: 32, 
    marginBottom: 24, 
    textAlign: "center", 
    fontFamily: "LEMONMILK-Bold", 
    color: "#00b2e1" 
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
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 4,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    height: 50,
    padding: 12,
    fontFamily: "Lexend-Regular",
    fontSize: 16,
    color: "#000",
  },
  eyeButton: {
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  inputError: { 
    borderColor: "#f21b3f" 
  },
  errorText: { 
    color: "#f21b3f", 
    fontSize: 12, 
    marginBottom: 8 
  },
  button: { 
    backgroundColor: "#00b2e1", 
    padding: 12, 
    borderRadius: 8, 
    width: "50%", 
    alignItems: "center", 
    alignSelf: "center", 
    marginTop: 12 
  },
  buttonText: { 
    color: "#fff", 
    fontWeight: "bold", 
    fontSize: 18 
  },
  link: { 
    marginTop: 12, 
    color: "#00b2e1", 
    textAlign: "center" 
  },
});