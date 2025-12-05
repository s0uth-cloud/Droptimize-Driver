import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { auth, db } from "../firebaseConfig";

const FORM_STORAGE_KEY = "@account_setup_form";

export default function AccountSetup() {
  const router = useRouter();
  const { scannedJoinCode } = useLocalSearchParams();

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
  const [customWeightLimit, setCustomWeightLimit] = useState("");
  const [items, setItems] = useState([
    { label: "Motorcycle (20 kg)", value: "motorcycle" },
    { label: "Tricycle (100 kg)", value: "tricycle" },
    { label: "Car (300 kg)", value: "car" },
    { label: "Van (800 kg)", value: "van" },
    { label: "Truck (1500 kg)", value: "truck" },
  ]);

  const vehicleWeightLimits = {
    motorcycle: 20,
    tricycle: 100,
    car: 300,
    van: 800,
    truck: 1500,
  };

  const vehicleWeightRanges = {
    motorcycle: { min: 10, max: 50 },
    tricycle: { min: 50, max: 200 },
    car: { min: 200, max: 500 },
    van: { min: 500, max: 1200 },
    truck: { min: 1000, max: 3000 },
  };

  useFocusEffect(
    useCallback(() => {
      loadFormData();
    }, [])
  );

  useEffect(() => {
    if (scannedJoinCode) {
      setFormData((prev) => {
        const updated = { ...prev, joinCode: scannedJoinCode };
        saveFormData(updated, vehicleType);
        return updated;
      });
    }
  }, [scannedJoinCode, vehicleType]);

  const saveFormData = async (data, vType) => {
    try {
      await AsyncStorage.setItem(
        FORM_STORAGE_KEY,
        JSON.stringify({ formData: data, vehicleType: vType, customWeightLimit })
      );
    } catch (error) {
      console.error("Error saving form data:", error);
    }
  };

  const loadFormData = async () => {
    try {
      const saved = await AsyncStorage.getItem(FORM_STORAGE_KEY);
      if (saved) {
        const { formData: savedForm, vehicleType: savedType, customWeightLimit: savedWeight } = JSON.parse(saved);
        setFormData(savedForm);
        setVehicleType(savedType);
        setCustomWeightLimit(savedWeight || "");
      }
    } catch (error) {
      console.error("Error loading form data:", error);
    }
  };

  const clearFormData = async () => {
    try {
      await AsyncStorage.removeItem(FORM_STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing form data:", error);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      saveFormData(updated, vehicleType);
      return updated;
    });
  };

  const handleVehicleTypeChange = (value) => {
    setVehicleType(value);
    saveFormData(formData, value);
  };

  const handleWeightLimitChange = (text) => {
    // Remove any non-numeric characters except decimal point
    const cleanedText = text.replace(/[^0-9.]/g, "");
    
    // Prevent multiple decimal points
    const parts = cleanedText.split(".");
    const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanedText;
    
    // If there's a vehicle type selected, enforce min/max
    if (vehicleType && sanitized !== "") {
      const numValue = parseFloat(sanitized);
      const range = vehicleWeightRanges[vehicleType];
      
      if (!isNaN(numValue)) {
        // Clamp the value between min and max
        if (numValue < range.min) {
          setCustomWeightLimit(range.min.toString());
          setErrors((prev) => ({ 
            ...prev, 
            customWeightLimit: `Minimum weight is ${range.min} kg` 
          }));
          return;
        } else if (numValue > range.max) {
          setCustomWeightLimit(range.max.toString());
          setErrors((prev) => ({ 
            ...prev, 
            customWeightLimit: `Maximum weight is ${range.max} kg` 
          }));
          return;
        }
      }
    }
    
    // Clear error if value is valid
    setErrors((prev) => ({ ...prev, customWeightLimit: "" }));
    setCustomWeightLimit(sanitized);
  };

  const capitalizeFirstLetter = (str) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const handleSubmit = async () => {
    const newErrors = {};
    
    // Address validation
    if (!formData.address.trim()) {
      newErrors.address = "Address is required";
    } else if (formData.address.trim().length < 10) {
      newErrors.address = "Address must be at least 10 characters";
    }
    
    // Phone number validation
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = "Phone number is required";
    } else if (!/^[0-9+\-\s()]+$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Invalid phone number format";
    } else if (formData.phoneNumber.replace(/[^0-9]/g, "").length < 10) {
      newErrors.phoneNumber = "Phone number must have at least 10 digits";
    }
    
    // Join code validation
    if (!formData.joinCode.trim()) {
      newErrors.joinCode = "Join code is required";
    } else if (formData.joinCode.trim().length < 4) {
      newErrors.joinCode = "Join code must be at least 4 characters";
    }
    
    // Plate number validation
    if (!formData.plateNumber.trim()) {
      newErrors.plateNumber = "Plate number is required";
    } else if (formData.plateNumber.trim().length < 2) {
      newErrors.plateNumber = "Plate number must be at least 2 characters";
    }
    
    // Vehicle type validation
    if (!vehicleType) {
      newErrors.vehicleType = "Vehicle type is required";
    }
    
    // Vehicle model validation
    if (!formData.model.trim()) {
      newErrors.model = "Vehicle model is required";
    } else if (formData.model.trim().length < 2) {
      newErrors.model = "Vehicle model must be at least 2 characters";
    }
    
    // Custom weight limit validation
    if (customWeightLimit && vehicleType) {
      const weight = parseFloat(customWeightLimit);
      const range = vehicleWeightRanges[vehicleType];
      
      if (isNaN(weight)) {
        newErrors.customWeightLimit = "Weight must be a valid number";
      } else if (weight < range.min) {
        newErrors.customWeightLimit = `Weight must be at least ${range.min} kg for ${vehicleType}`;
      } else if (weight > range.max) {
        newErrors.customWeightLimit = `Weight cannot exceed ${range.max} kg for ${vehicleType}`;
      }
    }

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
      const userSnap = await getDoc(userRef);
      
      const capitalizedVehicleType = capitalizeFirstLetter(vehicleType);
      const weightLimit = customWeightLimit && parseFloat(customWeightLimit) > 0 
        ? parseFloat(customWeightLimit) 
        : vehicleWeightLimits[vehicleType];
      
      if (userSnap.exists()) {
        await setDoc(
          userRef,
          {
            address: formData.address,
            phoneNumber: formData.phoneNumber,
            branchId: branchRef.id,
            plateNumber: formData.plateNumber,
            vehicleType: capitalizedVehicleType,
            vehicleWeightLimit: weightLimit,
            model: formData.model,
            accountSetupComplete: true,
            vehicleSetupComplete: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        await setDoc(userRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          fullName: currentUser.displayName || "",
          photoURL: currentUser.photoURL || "",
          address: formData.address,
          phoneNumber: formData.phoneNumber,
          branchId: branchRef.id,
          plateNumber: formData.plateNumber,
          vehicleType: capitalizedVehicleType,
          vehicleWeightLimit: weightLimit,
          model: formData.model,
          accountSetupComplete: true,
          vehicleSetupComplete: true,
          role: "driver",
          status: "Offline",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await clearFormData();

      const updatedUserSnap = await getDoc(userRef);
      const userData = updatedUserSnap.data();

      if (userData?.preferredRoutes && userData.preferredRoutes.length > 0) {
        router.replace("/Home");
      } else {
        router.replace("/PreferredRoutesSetup");
      }
    } catch (err) {
      console.error("Error saving setup:", err);
      setErrors({ general: `Failed to save data: ${err.message}` });
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
              placeholderTextColor="#999"
              value={formData[key]}
              onChangeText={(text) => handleChange(key, text)}
              keyboardType={keyboard}
              underlineColorAndroid="transparent"
              autoCorrect={false}
            />
            {errors[key] && <Text style={styles.errorText}>{errors[key]}</Text>}
          </View>
        ))}

        <DropDownPicker
          open={open}
          value={vehicleType}
          items={items}
          setOpen={setOpen}
          setValue={setVehicleType}
          setItems={setItems}
          placeholder="Select vehicle type..."
          style={[styles.dropdown, errors.vehicleType && styles.inputError]}
          onChangeValue={handleVehicleTypeChange}
          textStyle={{ fontSize: 16, color: "#000" }}
          placeholderStyle={{ color: "#999" }}
        />
        {errors.vehicleType && <Text style={styles.errorText}>{errors.vehicleType}</Text>}

        <TextInput
          style={[styles.input, { marginTop: 8 }, errors.customWeightLimit && styles.inputError]}
          placeholder="Custom Weight Limit (kg) - Optional"
          placeholderTextColor="#999"
          value={customWeightLimit}
          onChangeText={handleWeightLimitChange}
          keyboardType="numeric"
          underlineColorAndroid="transparent"
          autoCorrect={false}
          editable={!!vehicleType}
        />
        {errors.customWeightLimit && <Text style={styles.errorText}>{errors.customWeightLimit}</Text>}
        {vehicleType && (
          <Text style={styles.helperText}>
            Default: {vehicleWeightLimits[vehicleType]} kg
            {customWeightLimit && parseFloat(customWeightLimit) > 0 
              ? ` → Custom: ${customWeightLimit} kg` 
              : ""}
            {"\n"}Valid range: {vehicleWeightRanges[vehicleType].min} - {vehicleWeightRanges[vehicleType].max} kg
          </Text>
        )}

        <View style={[styles.inputWrapper, errors.joinCode && styles.inputError]}>
          <TextInput
            style={styles.joinCodeInput}
            placeholder="Company Join Code"
            placeholderTextColor="#999"
            value={formData.joinCode}
            onChangeText={(text) => handleChange("joinCode", text)}
            underlineColorAndroid="transparent"
            autoCorrect={false}
            autoCapitalize="characters"
          />
          <TouchableOpacity 
            onPress={() => router.push("/ScanQR")}
            style={styles.qrButton}
          >
            <Ionicons name="qr-code-outline" size={28} color="#00b2e1" />
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
    width: "100%",
    height: 50,
    fontFamily: "Lexend-Regular",
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
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
  joinCodeInput: {
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
  dropdown: {
    borderColor: "#ccc",
    marginBottom: 6,
    width: "100%",
    fontFamily: "Lexend-Regular",
    backgroundColor: "#fff",
  },
  inputError: {
    borderColor: "#f21b3f"
  },
  errorText: {
    fontSize: 12,
    color: "#f21b3f",
    marginBottom: 10
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 10,
    marginTop: -4,
    fontFamily: "Lexend-Regular"
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