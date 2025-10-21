import axios from "axios";
import { useRouter } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import RNPickerSelect from "react-native-picker-select";
import { auth, db } from "../firebaseConfig";

export default function PreferredRoutesSetup() {
  const router = useRouter();

  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedBarangay, setSelectedBarangay] = useState([]);

  const [preferredRoutes, setPreferredRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editIndex, setEditIndex] = useState(null);

  useEffect(() => {
    axios.get("https://psgc.gitlab.io/api/regions/").then((res) => setRegions(res.data));
  }, []);

  useEffect(() => {
    if (selectedRegion) {
      axios.get(`https://psgc.gitlab.io/api/regions/${selectedRegion}/provinces/`).then((res) => setProvinces(res.data));
      setSelectedProvince(null);
      setSelectedCity(null);
      setSelectedBarangay(null);
      setCities([]);
      setBarangays([]);
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (selectedProvince) {
      axios.get(`https://psgc.gitlab.io/api/provinces/${selectedProvince}/cities-municipalities/`).then((res) => setCities(res.data));
      setSelectedCity(null);
      setSelectedBarangay(null);
      setBarangays([]);
    }
  }, [selectedProvince]);


  useEffect(() => {
    if (selectedCity) {
      axios.get(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity}/barangays/`).then((res) => setBarangays(res.data));
      setSelectedBarangay(null);
    }
  }, [selectedCity]);

const handleAddOrUpdateRoute = () => {
  if (!selectedRegion || !selectedProvince || !selectedCity || selectedBarangay.length === 0) {
    Alert.alert("Incomplete", "Please select at least one barangay.");
    return;
  }

  const regionObj = regions.find((r) => r.code === selectedRegion);
  const provinceObj = provinces.find((p) => p.code === selectedProvince);
  const cityObj = cities.find((c) => c.code === selectedCity);


  const newRoutes = selectedBarangay.map((barangayCode) => {
    const barangayObj = barangays.find((b) => b.code === barangayCode);
    return {
      regionCode: regionObj.code,
      regionName: regionObj.name,
      provinceCode: provinceObj.code,
      provinceName: provinceObj.name,
      municipalityCode: cityObj.code,
      municipalityName: cityObj.name,
      barangayCode: barangayObj.code,
      barangayName: barangayObj.name,
    };
  });

  let updatedRoutes = [...preferredRoutes];

  newRoutes.forEach((route) => {
    const exists = updatedRoutes.some((r) => r.barangayCode === route.barangayCode);
    if (!exists) {
      updatedRoutes.push(route);
    }
  });

  setPreferredRoutes(updatedRoutes);
  setEditIndex(null);
  resetSelection();
};


const resetSelection = () => {
  setSelectedRegion(null);
  setSelectedProvince(null);
  setSelectedCity(null);
  setSelectedBarangay([]);
};


  const handleEditRoute = (index) => {
    const route = preferredRoutes[index];
    setSelectedRegion(route.regionCode);
    setSelectedProvince(route.provinceCode);
    setSelectedCity(route.municipalityCode);
    setSelectedBarangay(route.barangayCode);
    setEditIndex(index);
  };

  const handleRemoveRoute = (index) => {
    Alert.alert("Remove Route", "Are you sure you want to delete this route?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => setPreferredRoutes(preferredRoutes.filter((_, i) => i !== index)) },
    ]);
  };

  const handleSaveRoutes = async () => {
    if (preferredRoutes.length === 0) return Alert.alert("No Routes", "Please add at least one route before saving.");

    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return Alert.alert("Error", "User not authenticated.");

      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { preferredRoutes, updatedAt: serverTimestamp() }, { merge: true });

      Alert.alert("Success", "Preferred routes saved!");
      router.replace("/Home");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Set Preferred Routes</Text>

      <RNPickerSelect
        onValueChange={setSelectedRegion}
        items={regions.map((r) => ({ label: r.name, value: r.code }))}
        placeholder={{ label: "Select Region", value: null }}
        value={selectedRegion}
        style={pickerSelectStyles}
      />

      {selectedRegion && (
        <RNPickerSelect
          onValueChange={setSelectedProvince}
          items={provinces.map((p) => ({ label: p.name, value: p.code }))}
          placeholder={{ label: "Select Province", value: null }}
          value={selectedProvince}
          style={pickerSelectStyles}
        />
      )}

      {selectedProvince && (
        <RNPickerSelect
          onValueChange={setSelectedCity}
          items={cities.map((c) => ({ label: c.name, value: c.code }))}
          placeholder={{ label: "Select City / Municipality", value: null }}
          value={selectedCity}
          style={pickerSelectStyles}
        />
      )}

{selectedCity && barangays.length > 0 && (
  <>
    <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Select Barangays:</Text>
    {barangays.map((b) => {
      const isSelected = selectedBarangay?.includes(b.code);
      return (
        <TouchableOpacity
          key={b.code}
          style={[
            styles.barangayOption,
            isSelected && styles.barangaySelected
          ]}
          onPress={() => {
            if (isSelected) {
              setSelectedBarangay(selectedBarangay.filter(code => code !== b.code));
            } else {
              setSelectedBarangay([...(selectedBarangay || []), b.code]);
            }
          }}
        >
          <Text style={{ color: isSelected ? "#fff" : "#000" }}>{b.name}</Text>
        </TouchableOpacity>
      );
    })}
  </>
)}


      <TouchableOpacity style={styles.addButton} onPress={handleAddOrUpdateRoute}>
        <Text style={styles.addText}>{editIndex !== null ? "Update Route" : "+ Add Route"}</Text>
      </TouchableOpacity>

      {preferredRoutes.map((route, idx) => (
        <View key={idx} style={styles.routeCard}>
          <Text style={styles.routeText}>
            {route.regionName} → {route.provinceName} → {route.municipalityName} → {route.barangayName}
          </Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity onPress={() => handleEditRoute(idx)}>
              <Text style={styles.edit}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRemoveRoute(idx)}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.saveButton} onPress={handleSaveRoutes} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Routes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
barangayOption: {
  padding: 12,
  borderWidth: 1,
  borderColor: "#ccc",
  borderRadius: 6,
  marginBottom: 5,
},
barangaySelected: {
  backgroundColor: "#0064b5",
  borderColor: "#0064b5",
},
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  addButton: {
    backgroundColor: "#0064b5",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 20,
  },
  addText: { color: "#fff", fontWeight: "bold" },
  routeCard: {
    padding: 12,
    backgroundColor: "#f1f1f1",
    borderRadius: 6,
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  routeText: { flex: 1, marginRight: 10 },
  actionButtons: { flexDirection: "row", gap: 15 },
  edit: { color: "#0064b5", fontWeight: "bold" },
  remove: { color: "#f21b3f", fontWeight: "bold" },
  saveButton: {
    backgroundColor: "#00b2e1",
    padding: 16,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 30,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 10,
    color: "#000",
  },
  inputAndroid: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 10,
    color: "#000",
  },
});
