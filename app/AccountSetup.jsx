import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { auth, db } from "../firebaseConfig";

export default function AccountVehicleSetup() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    address: "",
    phoneNumber: "",
    joinCode: "",
    plateNumber: "",
    model: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState(null);
  const [items, setItems] = useState([
    { label: "Motorcycle", value: "motorcycle" },
    { label: "Car", value: "car" },
    { label: "Van", value: "van" },
    { label: "Truck", value: "truck" },
  ]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

const handleSubmit = async () => {
  const newErrors = {};
  if (!formData.address.trim()) newErrors.address = "Address is required";
  if (!formData.phoneNumber.trim()) newErrors.phoneNumber = "Phone number is required";
  if (!formData.joinCode.trim()) newErrors.joinCode = "Join code is required";
  if (!formData.plateNumber.trim()) newErrors.plateNumber = "Plate number is required";
  if (!vehicleType) newErrors.vehicleType = "Vehicle type is required";
  if (!formData.model.trim()) newErrors.model = "Vehicle model is required";

  setErrors(newErrors);
  if (Object.keys(newErrors).length > 0) return;

  setLoading(true);
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrors({ general: "User not authenticated. Please log in again." });
      setLoading(false);
      router.replace("/Login");
      return;
    }

    const branchRef = doc(db, "branches", formData.joinCode);
    const branchSnap = await getDoc(branchRef);
    if (!branchSnap.exists()) {
      setErrors({ joinCode: "Invalid join code" });
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", currentUser.uid);

    await setDoc(
      userRef,
      {
        address: formData.address,
        phoneNumber: formData.phoneNumber,
        branchId: branchRef.id,
        plateNumber: formData.plateNumber,
        vehicleType,
        model: formData.model,
        accountSetupComplete: true,
        vehicleSetupComplete: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const updatedUserSnap = await getDoc(userRef);
    const userData = updatedUserSnap.data();

    if (userData?.preferredRoutes && userData.preferredRoutes.length > 0) {
      router.replace("/Home");  
    } else {
      router.replace("/PreferredRoutesSetup"); 
    }
  } catch (err) {
    console.error("Error saving setup:", err);
    setErrors({ general: "Failed to save data. Try again." });
  } finally {
    setLoading(false);
  }
};


  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={styles.container}>
        <Text style={styles.title}>Account Setup</Text>

        {[
          { key: "address", placeholder: "Address", keyboard: "default" },
          { key: "phoneNumber", placeholder: "Phone Number", keyboard: "phone-pad" },
          { key: "plateNumber", placeholder: "Plate Number", keyboard: "default" },
          { key: "model", placeholder: "Vehicle Model", keyboard: "default" },
        ].map(({ key, placeholder, keyboard }) => (
          <View key={key}>
            <TextInput
              style={[styles.input, errors[key] && styles.inputError]}
              placeholder={placeholder}
              value={formData[key]}
              onChangeText={(text) => handleChange(key, text)}
              keyboardType={keyboard}
            />
            {errors[key] && <Text style={styles.errorText}>{errors[key]}</Text>}
          </View>
        ))}

        {/* Vehicle Type Dropdown */}
        <DropDownPicker
          open={open}
          value={vehicleType}
          items={items}
          setOpen={setOpen}
          setValue={setVehicleType}
          setItems={setItems}
          placeholder="Select vehicle type..."
          style={[styles.dropdown, errors.vehicleType && styles.inputError]}
        />
        {errors.vehicleType && <Text style={styles.errorText}>{errors.vehicleType}</Text>}

        {/* Join Code Input with QR */}
        <View style={[styles.inputWrapper, errors.joinCode && styles.inputError]}>
          <TextInput
            style={styles.joinCodeInput}
            placeholder="Company Join Code"
            value={formData.joinCode}
            onChangeText={(text) => handleChange("joinCode", text)}
          />
          <TouchableOpacity onPress={() => router.push("/ScanQR")}>
            <Ionicons name="qr-code-outline" size={24} color="#00b2e1" />
          </TouchableOpacity>
        </View>
        {errors.joinCode && <Text style={styles.errorText}>{errors.joinCode}</Text>}
        {errors.general && <Text style={styles.errorText}>{errors.general}</Text>}

          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Next</Text>}
          </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff" 
  },
  title: { 
    fontSize: 28, 
    textAlign: "center", 
    fontFamily: "LEMONMILK-Bold", 
    color: "#00b2e1", 
    marginBottom: 24 
  },
  input: { 
    borderWidth: 1, 
    borderColor: "#ccc", 
    borderRadius: 6, 
    padding: 12, 
    marginBottom: 6, 
    width: "100%" 
  },
  inputWrapper: { 
    flexDirection: "row", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "#ccc", 
    borderRadius: 6, 
    paddingHorizontal: 12, 
    marginBottom: 6, 
    width: "100%" 
  },
  joinCodeInput: { 
    flex: 1, 
    paddingVertical: 12, 
    paddingRight: 10 
  },
  dropdown: { 
    borderColor: "#ccc", 
    marginBottom: 6, 
    width: "100%" 
  },
  inputError: { 
    borderColor: "#f21b3f" 
  },
  errorText: { 
    fontSize: 12, 
    color: "#f21b3f", 
    marginBottom: 10 
  },
  button: { 
    backgroundColor: "#00b2e1", 
    padding: 14, 
    borderRadius: 6, 
    alignItems: "center", 
    marginTop: 12, 
    width: "50%", 
    alignSelf: "center" 
  },
  buttonText: { 
    color: "#fff", 
    fontWeight: "bold", 
    fontSize: 18 
  },
});
