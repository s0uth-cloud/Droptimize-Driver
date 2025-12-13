// External dependencies
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

// Internal dependencies
import { registerUser } from "../firebaseConfig";

/**
 * Driver registration screen with comprehensive form validation.
 * Collects firstName, lastName, email, password, and confirmPassword with real-time validation.
 * Validates email format, password matching, and required fields before creating Firebase Auth account.
 * Sends email verification and navigates to AccountSetup on successful registration.
 */
export default function SignUp() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  /**
   * Handles signup submission with comprehensive validation (required fields, email format, password matching).
   * Calls registerUser from firebaseConfig to create Firebase Auth account and initial Firestore user document.
   * Navigates to AccountSetup on success or displays error alert on failure.
   */
  const handleSignUp = async () => {
    const { email, password, confirmPassword, firstName, lastName } = formData;
    const newErrors = {};
    if (!firstName?.trim()) newErrors.firstName = "First name is required";
    if (!lastName?.trim()) newErrors.lastName = "Last name is required";
    if (!email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "Invalid email format";
    if (!password) newErrors.password = "Password is required";
    if (!confirmPassword) newErrors.confirmPassword = "Please confirm your password";
    if (password && confirmPassword && password !== confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    if (Object.keys(newErrors).length > 0) return setErrors(newErrors);

    setLoading(true);
    try {
      const result = await registerUser(formData);
      if (result.success) router.replace("/AccountSetup");
      else Alert.alert("Error", result.error.message || result.error);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.container}>
        <Text style={styles.title}>Sign Up</Text>
        
        <View>
          <TextInput
            style={[styles.input, errors.firstName && styles.errorInput]}
            placeholder="First Name"
            placeholderTextColor="#999"
            value={formData.firstName}
            onChangeText={(text) => handleChange("firstName", text)}
            underlineColorAndroid="transparent"
            autoCorrect={false}
            autoCapitalize="words"
          />
          {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
        </View>

        <View>
          <TextInput
            style={[styles.input, errors.lastName && styles.errorInput]}
            placeholder="Last Name"
            placeholderTextColor="#999"
            value={formData.lastName}
            onChangeText={(text) => handleChange("lastName", text)}
            underlineColorAndroid="transparent"
            autoCorrect={false}
            autoCapitalize="words"
          />
          {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
        </View>

        <View>
          <TextInput
            style={[styles.input, errors.email && styles.errorInput]}
            placeholder="Email"
            placeholderTextColor="#999"
            value={formData.email}
            onChangeText={(text) => handleChange("email", text)}
            underlineColorAndroid="transparent"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        <View>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.passwordInput, errors.password && styles.errorInput]}
              placeholder="Password"
              placeholderTextColor="#999"
              value={formData.password}
              secureTextEntry={!showPassword}
              onChangeText={(text) => handleChange("password", text)}
              underlineColorAndroid="transparent"
              autoCorrect={false}
              autoCapitalize="none"
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

        <View>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.passwordInput, errors.confirmPassword && styles.errorInput]}
              placeholder="Confirm Password"
              placeholderTextColor="#999"
              value={formData.confirmPassword}
              secureTextEntry={!showConfirmPassword}
              onChangeText={(text) => handleChange("confirmPassword", text)}
              underlineColorAndroid="transparent"
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                size={24}
                color="#666"
              />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/Login")}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  errorInput: { 
    borderColor: "#f21b3f" 
  },
  errorText: { 
    color: "#f21b3f", 
    fontSize: 12, 
    marginBottom: 8 
  },
  button: { 
    backgroundColor: "#00b2e1", 
    padding: 14, 
    borderRadius: 6, 
    alignItems: "center", 
    marginTop: 16, 
    width: "50%", 
    alignSelf: "center" 
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