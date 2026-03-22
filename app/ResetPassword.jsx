import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, sendPasswordResetEmail } from "../firebaseConfig";

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const oobCode = useMemo(() => {
    const rawCode = params?.oobCode;
    if (typeof rawCode === "string") return rawCode;
    if (Array.isArray(rawCode) && rawCode.length > 0) return rawCode[0];
    return null;
  }, [params]);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [validatedCode, setValidatedCode] = useState(null);

  useEffect(() => {
    if (!oobCode) {
      setVerifying(false);
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then(() => {
        setValidatedCode(oobCode);
        setVerifying(false);
      })
      .catch((err) => {
        if (
          err.code === "auth/invalid-action-code" ||
          err.code === "auth/expired-action-code"
        ) {
          setError(
            "This password reset link has expired. Please request a new one.",
          );
        } else {
          setError("Invalid reset link. Please request a new password reset.");
        }
        setVerifying(false);
      });
  }, [oobCode]);

  const handleEmailSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError("Email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Invalid email format");
      return;
    }

    setEmailError("");
    setEmailLoading(true);
    try {
      const result = await sendPasswordResetEmail(trimmedEmail);
      if (result.success) {
        setEmailSent(true);
        setSentToEmail(trimmedEmail);
        setEmail("");
      } else {
        const detail = result.error?.message || "Failed to send reset email";
        const code = result.error?.code ? ` [${result.error.code}]` : "";
        setEmailError(`${detail}${code}`);
      }
    } catch (_err) {
      setEmailError("An error occurred. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validatePassword = (password) => {
    if (!password) return "Password is required";
    if (password.length < 8)
      return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password))
      return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password))
      return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password))
      return "Password must contain at least one number";
    return "";
  };

  const handlePasswordSubmit = async () => {
    const nextErrors = {};

    const passwordError = validatePassword(formData.password);
    if (passwordError) nextErrors.password = passwordError;

    if (!formData.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setError("");
    setLoading(true);

    try {
      await confirmPasswordReset(auth, validatedCode, formData.password);
      setSuccess(true);
      setFormData({ password: "", confirmPassword: "" });

      setTimeout(() => {
        router.replace("/Login");
      }, 2000);
    } catch (err) {
      if (
        err.code === "auth/invalid-action-code" ||
        err.code === "auth/expired-action-code"
      ) {
        setError(
          "This password reset link has expired. Please request a new one.",
        );
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please use a stronger password.");
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.contentCenter}>
          <ActivityIndicator color="#00b2e1" size="large" />
          <Text style={styles.description}>Verifying reset link...</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (validatedCode) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.content}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.description}>Enter your new password below.</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? (
            <Text style={styles.successText}>
              Password reset successful. Redirecting to login...
            </Text>
          ) : null}

          {!success && !error && (
            <>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.passwordInput,
                    fieldErrors.password && styles.inputError,
                  ]}
                  placeholder="New Password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showPassword}
                  value={formData.password}
                  onChangeText={(text) =>
                    handlePasswordChange("password", text)
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={24}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {fieldErrors.password ? (
                <Text style={styles.errorText}>{fieldErrors.password}</Text>
              ) : null}

              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.passwordInput,
                    fieldErrors.confirmPassword && styles.inputError,
                  ]}
                  placeholder="Confirm Password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showConfirmPassword}
                  value={formData.confirmPassword}
                  onChangeText={(text) =>
                    handlePasswordChange("confirmPassword", text)
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={24}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {fieldErrors.confirmPassword ? (
                <Text style={styles.errorText}>
                  {fieldErrors.confirmPassword}
                </Text>
              ) : null}

              <View style={styles.requirementsBox}>
                <Text style={styles.requirementsTitle}>
                  Password Requirements
                </Text>
                <Text style={styles.requirementItem}>
                  - At least 8 characters
                </Text>
                <Text style={styles.requirementItem}>
                  - One uppercase letter
                </Text>
                <Text style={styles.requirementItem}>
                  - One lowercase letter
                </Text>
                <Text style={styles.requirementItem}>- One number</Text>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handlePasswordSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Reset Password</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => router.replace("/Login")}>
            <Text style={styles.link}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.description}>
          Enter your email address to reset your password.
        </Text>

        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setEmailError("");
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          underlineColorAndroid="transparent"
          autoCorrect={false}
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        {emailSent ? (
          <Text style={styles.successText}>
            Password reset email has been sent to {sentToEmail || "your email"}.
            Please check your inbox and follow the instructions.
          </Text>
        ) : null}

        {!emailSent && (
          <TouchableOpacity
            style={styles.button}
            onPress={handleEmailSubmit}
            disabled={emailLoading}
          >
            {emailLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        )}

        {emailSent && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setEmailSent(false)}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              Try Another Email
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/Login");
            }
          }}
        >
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
  contentCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    gap: 12,
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
    borderColor: "#f21b3f",
  },
  errorText: {
    color: "#f21b3f",
    fontSize: 12,
    marginBottom: 8,
  },
  successText: {
    color: "#29bf12",
    fontSize: 13,
    marginBottom: 10,
    textAlign: "center",
    fontFamily: "Lexend-Regular",
  },
  requirementsBox: {
    backgroundColor: "#f5f8fa",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  requirementsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
  },
  requirementItem: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 2,
  },
  button: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
    width: "60%",
    alignSelf: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#00b2e1",
  },
  secondaryButtonText: {
    color: "#00b2e1",
  },
  link: {
    marginTop: 16,
    color: "#00b2e1",
    textAlign: "center",
    fontFamily: "Lexend-Regular",
  },
});
