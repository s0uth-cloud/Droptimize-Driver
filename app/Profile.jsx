import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import ProfilePhotoSelector from "../components/ProfilePhotoSelector";
import { auth, db } from "../firebaseConfig";

export default function Profile() {
  const [userData, setUserData] = useState({
    id: "",
    fullName: "",
    phoneNumber: "",
    address: "",
    photoURL: "",
  });

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Load user data from Firestore
  useEffect(() => {
    const loadUserData = async () => {
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
          });
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

  // Save edits back to Firestore
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        fullName: userData.fullName,
        phoneNumber: userData.phoneNumber,
        address: userData.address,
        photoURL: userData.photoURL,
      });
      setEditing(false);
    } catch (error) {
      console.error("Error saving user data:", error);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#00b2e1" />
      ) : (
        <>
          {/* Profile photo with Firestore sync */}
          <ProfilePhotoSelector
            style={styles.profileImage}
            initialUrl={userData.photoURL}
            onPhotoUploaded={(url) =>
              setUserData((prev) => ({ ...prev, photoURL: url }))
            }
          />

          {/* Non-editable User ID */}
          <TextInput
            style={styles.input}
            value={userData.id}
            editable={false}
          />

          {/* Editable fields */}
          <TextInput
            style={styles.input}
            value={userData.fullName}
            onChangeText={(text) =>
              setUserData((prev) => ({ ...prev, fullName: text }))
            }
            editable={editing}
            placeholder="Full Name"
          />

          <TextInput
            style={styles.input}
            value={userData.phoneNumber}
            onChangeText={(text) =>
              setUserData((prev) => ({ ...prev, phoneNumber: text }))
            }
            editable={editing}
            placeholder="Phone Number"
            keyboardType="phone-pad"
          />

          <TextInput
            style={styles.input}
            value={userData.address}
            onChangeText={(text) =>
              setUserData((prev) => ({ ...prev, address: text }))
            }
            editable={editing}
            placeholder="Address"
          />

          {/* Toggle between edit & save */}
          <TouchableOpacity
            style={styles.button}
            onPress={editing ? handleSave : () => setEditing(true)}
          >
            <Text style={styles.buttonText}>
              {editing ? "Save Changes" : "Edit Profile"}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  profileImage: {
    marginBottom: 20,
  },
  input: {
    width: "100%",
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#00b2e1",
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
