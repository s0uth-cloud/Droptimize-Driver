import axios from "axios";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import RNPickerSelect from "react-native-picker-select";
import ProfilePhotoSelector from "../components/ProfilePhotoSelector";
import { auth, db } from "../firebaseConfig";

export default function Profile() {
  const [userData, setUserData] = useState({
    id: "",
    fullName: "",
    phoneNumber: "",
    address: "",
    photoURL: "",
    preferredRoutes: [],
  });

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [selection, setSelection] = useState({});
  const [editingIndex, setEditingIndex] = useState(null); 

  useEffect(() => {
    fetchRegions();
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setUserData({
          id: user.uid,
          fullName: data.fullName || "",
          phoneNumber: data.phoneNumber || "",
          address: data.address || "",
          photoURL: data.photoURL || "",
          preferredRoutes: data.preferredRoutes || [],
        });
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        fullName: userData.fullName,
        phoneNumber: userData.phoneNumber,
        address: userData.address,
        photoURL: userData.photoURL,
        preferredRoutes: userData.preferredRoutes,
      });
      alert("Profile updated!");
      setEditing(false);
      setEditingIndex(null);
      setSelection({});
    } catch (err) {
      console.error("Error saving user data:", err);
    }
  };

  const fetchRegions = async () => {
    try {
      const res = await axios.get("https://psgc.gitlab.io/api/regions/");
      setRegions(
        res.data.map((r) => ({ label: r.name, value: r.code }))
      );
    } catch (err) {
      console.error("Error loading regions:", err);
    }
  };

  const fetchProvincesByRegion = async (regionCode) => {
    const res = await axios.get(
      `https://psgc.gitlab.io/api/regions/${regionCode}/provinces/`
    );
    setProvinces(res.data.map((p) => ({ label: p.name, value: p.code })));
  };

  const fetchMunicipalities = async (provinceCode) => {
    const res = await axios.get(
      `https://psgc.gitlab.io/api/provinces/${provinceCode}/cities-municipalities/`
    );
    setMunicipalities(res.data.map((m) => ({ label: m.name, value: m.code })));
  };

  const fetchBarangays = async (municipalityCode) => {
    const res = await axios.get(
      `https://psgc.gitlab.io/api/cities-municipalities/${municipalityCode}/barangays/`
    );
    setBarangays(res.data.map((b) => ({ label: b.name, value: b.code })));
  };

  const handleRegion = (value) => {
    const name = regions.find((r) => r.value === value)?.label || "";
    setSelection({ regionCode: value, regionName: name });
    setProvinces([]);
    setMunicipalities([]);
    setBarangays([]);
    fetchProvincesByRegion(value);
  };

  const handleProvince = (value) => {
    const name = provinces.find((p) => p.value === value)?.label || "";
    setSelection((prev) => ({
      ...prev,
      provinceCode: value,
      provinceName: name,
    }));
    setMunicipalities([]);
    setBarangays([]);
    fetchMunicipalities(value);
  };

  const handleMunicipality = (value) => {
    const name = municipalities.find((m) => m.value === value)?.label || "";
    setSelection((prev) => ({
      ...prev,
      municipalityCode: value,
      municipalityName: name,
    }));
    setBarangays([]);
    fetchBarangays(value);
  };

  const handleBarangay = (value) => {
    const name = barangays.find((b) => b.value === value)?.label || "";
    setSelection((prev) => ({
      ...prev,
      barangayCode: value,
      barangayName: name,
    }));
  };

  const saveRoute = () => {
    const { regionCode, provinceCode, municipalityCode, barangayCode } =
      selection;
    if (!regionCode || !provinceCode || !municipalityCode || !barangayCode) {
      alert("Please complete all selections.");
      return;
    }

    if (editingIndex !== null) {
      const updatedRoutes = [...userData.preferredRoutes];
      updatedRoutes[editingIndex] = selection;
      setUserData((prev) => ({ ...prev, preferredRoutes: updatedRoutes }));
      setEditingIndex(null);
    } else {
      setUserData((prev) => ({
        ...prev,
        preferredRoutes: [...prev.preferredRoutes, selection],
      }));
    }

    setSelection({});
  };

  const editRoute = (index) => {
    const route = userData.preferredRoutes[index];
    setSelection(route);
    setEditingIndex(index);
    fetchProvincesByRegion(route.regionCode);
    fetchMunicipalities(route.provinceCode);
    fetchBarangays(route.municipalityCode);
  };

  const removeRoute = (index) => {
    const updated = [...userData.preferredRoutes];
    updated.splice(index, 1);
    setUserData((prev) => ({ ...prev, preferredRoutes: updated }));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#00b2e1" />
      ) : (
        <>
          <ProfilePhotoSelector
            style={styles.profileImage}
            initialUrl={userData.photoURL}
            onPhotoUploaded={(url) =>
              setUserData((prev) => ({ ...prev, photoURL: url }))
            }
          />
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <TextInput style={styles.input} value={userData.id} editable={false} />

          <TextInput
            style={styles.input}
            value={userData.fullName}
            onChangeText={(t) =>
              setUserData((p) => ({ ...p, fullName: t }))
            }
            editable={editing}
            placeholder="Full Name"
          />

          <TextInput
            style={styles.input}
            value={userData.phoneNumber}
            onChangeText={(t) =>
              setUserData((p) => ({ ...p, phoneNumber: t }))
            }
            editable={editing}
            placeholder="Phone Number"
            keyboardType="phone-pad"
          />

          <TextInput
            style={styles.input}
            value={userData.address}
            onChangeText={(t) =>
              setUserData((p) => ({ ...p, address: t }))
            }
            editable={editing}
            placeholder="Address"
          />

          {editing && (
            <>
              <Text style={styles.sectionTitle}>
                {editingIndex !== null ? " Edit Route" : " Add New Route"}
              </Text>

              <RNPickerSelect
                placeholder={{ label: "Select Region", value: null, color: "#999" }}
                items={regions}
                onValueChange={handleRegion}
                value={selection.regionCode}
                style={pickerSelectStyles}
              />

              {provinces.length > 0 && (
                <RNPickerSelect
                  placeholder={{ label: "Select Province", value: null, color: "#999" }}
                  items={provinces}
                  onValueChange={handleProvince}
                  value={selection.provinceCode}
                  style={pickerSelectStyles}
                />
              )}

              {municipalities.length > 0 && (
                <RNPickerSelect
                  placeholder={{ label: "Select Municipality", value: null, color: "#999" }}
                  items={municipalities}
                  onValueChange={handleMunicipality}
                  value={selection.municipalityCode}
                  style={pickerSelectStyles}
              />
              )}

              {barangays.length > 0 && (
                <RNPickerSelect
                  placeholder={{ label: "Select Barangay", value: null, color: "#999" }}
                  items={barangays}
                  onValueChange={handleBarangay}
                  value={selection.barangayCode}
                  style={pickerSelectStyles}
              />
              )}

              <TouchableOpacity style={styles.addBtn} onPress={saveRoute}>
                <Text style={styles.addBtnText}>
                  {editingIndex !== null ? "+ Save Route" : "+ Add Route"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.sectionTitle}>Preferred Routes</Text>
          {userData.preferredRoutes.map((route, idx) => (
            <View key={idx} style={styles.routeItem}>
              <Text style={styles.routeText}>
                {route.barangayName}, {route.municipalityName},{" "}
                {route.provinceName}
              </Text>
              {editing && (
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => editRoute(idx)}>
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeRoute(idx)}>
                    <Text style={styles.removeText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={styles.button}
            onPress={editing ? handleSaveProfile : () => setEditing(true)}
          >
            <Text style={styles.buttonText}>
              {editing ? "Save Changes" : "Edit Profile"}
            </Text>
          </TouchableOpacity>

          {editing && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setEditing(false);
                setSelection({});
                setEditingIndex(null);
              }}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 50,
    backgroundColor: "#f9f9f9",
  },
  profileImage: {
    alignSelf: "center",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: "#00b2e1",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  addBtnText: {
    textAlign: "center",
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  routeItem: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  routeText: {
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  editText: {
    color: "#00b2e1",
    marginRight: 15,
  },
  removeText: {
    color: "red",
  },
  button: {
    backgroundColor: "#00b2e1",
    padding: 14,
    borderRadius: 12,
    marginTop: 30,
  },
  buttonText: {
    textAlign: "center",
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f21b3f",
  },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 14,
    color: "#000",
    backgroundColor: "#fff",
  },
  inputAndroid: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 14,
    color: "#000",
    backgroundColor: "#fff",
  },
});
