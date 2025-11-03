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
    if (selectedRegion && editIndex === null) {
      axios.get(`https://psgc.gitlab.io/api/regions/${selectedRegion}/provinces/`).then((res) => setProvinces(res.data));
      setSelectedProvince(null);
      setSelectedCity(null);
      setSelectedBarangay([]);
      setCities([]);
      setBarangays([]);
    } else if (selectedRegion && editIndex !== null) {
      axios.get(`https://psgc.gitlab.io/api/regions/${selectedRegion}/provinces/`).then((res) => setProvinces(res.data));
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (selectedProvince && editIndex === null) {
      axios.get(`https://psgc.gitlab.io/api/provinces/${selectedProvince}/cities-municipalities/`).then((res) => setCities(res.data));
      setSelectedCity(null);
      setSelectedBarangay([]);
      setBarangays([]);
    } else if (selectedProvince && editIndex !== null) {
      axios.get(`https://psgc.gitlab.io/api/provinces/${selectedProvince}/cities-municipalities/`).then((res) => setCities(res.data));
    }
  }, [selectedProvince]);

  useEffect(() => {
    if (selectedCity && editIndex === null) {
      axios.get(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity}/barangays/`).then((res) => setBarangays(res.data));
      setSelectedBarangay([]);
    } else if (selectedCity && editIndex !== null) {
      axios.get(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity}/barangays/`).then((res) => setBarangays(res.data));
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

    if (editIndex !== null) {
      // Remove the old route being edited
      updatedRoutes.splice(editIndex, 1);
    }

    // Add new routes
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

  const handleEditRoute = async (index) => {
    const route = preferredRoutes[index];
    setEditIndex(index);
    
    // Reset first
    resetSelection();
    
    // Set region and wait for provinces to load
    setSelectedRegion(route.regionCode);
    
    // Wait for provinces to load, then set province
    setTimeout(async () => {
      setSelectedProvince(route.provinceCode);
      
      // Wait for cities to load, then set city
      setTimeout(async () => {
        setSelectedCity(route.municipalityCode);
        
        // Wait for barangays to load, then set barangay
        setTimeout(() => {
          setSelectedBarangay([route.barangayCode]);
        }, 300);
      }, 300);
    }, 300);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Select Preferred Routes</Text>

      <View style={styles.section}>
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
          <View style={styles.barangaySection}>
            <Text style={styles.sectionLabel}>Select Barangays:</Text>
            {barangays.map((b) => {
              const isSelected = Array.isArray(selectedBarangay) && selectedBarangay.includes(b.code);
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
                      setSelectedBarangay([...selectedBarangay, b.code]);
                    }
                  }}
                >
                  <Text style={[styles.barangayText, isSelected && styles.barangayTextSelected]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity style={styles.addButton} onPress={handleAddOrUpdateRoute}>
          <Text style={styles.addText}>{editIndex !== null ? "Update Route" : "+ Add Route"}</Text>
        </TouchableOpacity>
      </View>

      {preferredRoutes.length > 0 && (
        <View style={styles.routesSection}>
          <Text style={styles.sectionLabel}>Added Routes:</Text>
          {preferredRoutes.map((route, idx) => (
            <View key={idx} style={styles.routeCard}>
              <Text style={styles.routeText}>
                {route.regionName} → {route.provinceName} → {route.municipalityName} → {route.barangayName}
              </Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity onPress={() => handleEditRoute(idx)}>
                  <Text style={styles.editButton}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRemoveRoute(idx)}>
                  <Text style={styles.removeButton}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity 
        style={styles.saveButton} 
        onPress={handleSaveRoutes} 
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>Finish Setup</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  contentContainer: {
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    textAlign: "center",
    fontFamily: "LEMONMILK-Bold",
    color: "#00b2e1",
    marginBottom: 24
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    marginTop: 10,
  },
  barangaySection: {
    marginTop: 10,
  },
  barangayOption: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  barangaySelected: {
    backgroundColor: "#00b2e1",
    borderColor: "#00b2e1",
  },
  barangayText: {
    color: "#000",
    fontSize: 14,
  },
  barangayTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  addButton: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
  },
  addText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  routesSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  routeCard: {
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 10,
  },
  routeText: {
    fontSize: 13,
    color: "#333",
    marginBottom: 8,
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 15,
    marginTop: 4,
  },
  editButton: {
    color: "#00b2e1",
    fontWeight: "bold",
    fontSize: 14,
  },
  removeButton: {
    color: "#f21b3f",
    fontWeight: "bold",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 40,
    width: "50%",
    alignSelf: "center",
  },
  saveText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    marginBottom: 6,
    color: "#000",
    fontSize: 14,
  },
  inputAndroid: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    marginBottom: 6,
    color: "#000",
    fontSize: 14,
  },
  placeholder: {
    color: "#999",
  },
});