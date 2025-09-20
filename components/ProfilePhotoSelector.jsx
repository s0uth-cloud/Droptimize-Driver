import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { auth, db, storage } from "../firebaseConfig";

export default function ProfilePhotoSelector({ style, initialUrl, onPhotoUploaded }) {
  const [image, setImage] = useState(initialUrl || null);
  const [uploading, setUploading] = useState(false);

  // Sync state when parent updates `initialUrl` (like after reload)
  useEffect(() => {
    setImage(initialUrl || null);
  }, [initialUrl]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alert("Permission to access media library is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const uri = result.assets[0].uri;
      if (uri) {
        setUploading(true);
        try {
          await uploadImage(uri);
        } catch (e) {
          console.error("Upload error:", e);
          alert("Upload failed. Please try again.");
        } finally {
          setUploading(false);
        }
      }
    }
  };

  const uploadImage = async (uri) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      const response = await fetch(uri);
      const blob = await response.blob();

      const filename = `users/${user.uid}.jpg`;
      const storageRef = ref(storage, filename);

      await uploadBytes(storageRef, blob);

      const downloadURL = await getDownloadURL(storageRef);
      setImage(downloadURL);

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { photoURL: downloadURL });

      if (onPhotoUploaded) {
        onPhotoUploaded(downloadURL);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload image.");
    }
  };

  return (
    <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
      <View style={[styles.wrapper, style]}>
        <View style={styles.imageContainer}>
          {uploading ? (
            <ActivityIndicator size="large" color="#00b2e1" />
          ) : image ? (
            <Image source={{ uri: image }} style={styles.image} />
          ) : (
            <View style={styles.placeholder}>
              <MaterialIcons name="person" size={60} color="#ccc" />
            </View>
          )}
        </View>

        <View style={styles.overlay}>
          <MaterialIcons name="camera-alt" size={20} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center" },
  imageContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
    resizeMode: "cover",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#00b2e1",
    borderRadius: 20,
    padding: 6,
    zIndex: 10,
    elevation: 10,
  },
});
