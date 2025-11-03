import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { registerUser } from "../firebaseConfig";

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

  const handleChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

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
        {["firstName", "lastName", "email", "password", "confirmPassword"].map((field) => (
          <View key={field}>
            <TextInput
              style={[styles.input, errors[field] && styles.errorInput]}
              placeholder={
                field === "firstName" ? "First Name" :
                field === "lastName" ? "Last Name" :
                field === "email" ? "Email" :
                field === "password" ? "Password" : "Confirm Password"
              }
              value={formData[field]}
              secureTextEntry={field.toLowerCase().includes("password")}
              onChangeText={(text) => handleChange(field, text)}
            />
            {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
          </View>
        ))}

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
    padding: 12, 
    borderWidth: 1, 
    borderColor: "#ccc", 
    borderRadius: 6, 
    marginBottom: 4,
    fontFamily: "Lexend-Regular",
    color: "#ccc"
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
