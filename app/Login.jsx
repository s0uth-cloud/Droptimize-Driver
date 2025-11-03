import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { db, loginUser } from "../firebaseConfig";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.password.trim()) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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
      {["email", "password"].map((field) => (
        <View key={field}>
          <TextInput
            style={[styles.input, errors[field] && styles.inputError]}
            placeholder={field === "email" ? "Email" : "Password"}
            placeholderTextColor="#999"
            secureTextEntry={field === "password"}
            value={formData[field]}
            onChangeText={(text) => handleChange(field, text)}
            keyboardType={field === "email" ? "email-address" : "default"}
            autoCapitalize="none"
            underlineColorAndroid="transparent"
            autoCorrect={false}
          />
          {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
        </View>
      ))}

      {firebaseError && <Text style={styles.errorText}>{firebaseError}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/SignUp")}>
        <Text style={styles.link}>Don&apos;t have an account? Register</Text>
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