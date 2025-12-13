// External dependencies
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// Firebase imports
import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";

// Internal dependencies
import { auth, db } from "../firebaseConfig";

export default function ScanParcel() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [assignmentData, setAssignmentData] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!permission) return <View />;
  
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.text}>Camera permission is required to scan QR codes</Text>
        <TouchableOpacity style={styles.buttonContainer} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /**
   * Processes scanned QR codes from admin-generated assignment codes, validating the QR format, verifying it's an assignment type, fetching assignment details from Firestore, and ensuring the assignment belongs to the current driver.
   * Performs multiple validation checks including assignment existence, driver matching, and acceptance status before displaying the assignment modal.
   * Handles errors gracefully with descriptive alerts for each failure scenario (invalid format, wrong driver, already accepted, etc.) and allows rescanning by resetting the scanner state.
   */
  const handleBarcodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setLoading(true);

    try {
      console.log("Scanned QR data:", data);
      
      // Parse QR code data
      let qrData;
      try {
        qrData = JSON.parse(data);
      } catch (_e) {
        Alert.alert("Error", "Invalid QR code format. Please scan a valid assignment QR code.");
        setScanned(false);
        setLoading(false);
        return;
      }

      // Verify it's an assignment QR code
      if (qrData.type !== "assignment" || !qrData.id) {
        Alert.alert("Error", "This is not a valid assignment QR code.");
        setScanned(false);
        setLoading(false);
        return;
      }

      console.log("Loading assignment:", qrData.id);

      // Fetch assignment details from Firestore
      const assignmentRef = doc(db, "assignments", qrData.id);
      const assignmentSnap = await getDoc(assignmentRef);

      if (!assignmentSnap.exists()) {
        Alert.alert("Error", "Assignment not found. It may have been cancelled or already accepted.");
        setScanned(false);
        setLoading(false);
        return;
      }

      const assignment = assignmentSnap.data();

      // Check if assignment is for current driver
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "You must be logged in to accept assignments.");
        setScanned(false);
        setLoading(false);
        return;
      }

      if (assignment.driverId !== currentUser.uid) {
        Alert.alert(
          "Wrong Driver",
          "This assignment is not for you. It's assigned to: " + assignment.driverName
        );
        setScanned(false);
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (assignment.status === "accepted") {
        Alert.alert("Already Accepted", "This assignment has already been accepted.");
        setScanned(false);
        setLoading(false);
        return;
      }

      // Allow rescanning rejected assignments - just show the assignment again
      // Show assignment details
      setAssignmentData({ id: qrData.id, ...assignment });
      setShowAssignmentModal(true);
      setLoading(false);
    } catch (error) {
      console.error("Error processing QR code:", error);
      setLoading(false);
      Alert.alert(
        "Error", 
        `Failed to process QR code.\\n\\nError: ${error.message || "Unknown error"}\\n\\nPlease try again.`,
        [
          {
            text: "OK",
            onPress: () => {
              setScanned(false);
            },
          },
        ]
      );
    }
  };

  /**
   * Accepts the scanned assignment by using a Firestore batch write to atomically update all assigned parcels with the driver's information and change their status to "Out for Delivery".
   * Validates that the driver has joined a branch before accepting, updates the assignment document status to "accepted" with a timestamp, and commits all changes in a single transaction to ensure data consistency.
   * On success, displays the number of accepted parcels and navigates back to the home screen, while handling errors with detailed messages about Firestore rule deployment.
   */
  const handleAcceptAssignment = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("Error", "You must be logged in to accept assignments");
      return;
    }

    setLoading(true);
    try {
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      const userData = userSnap.data();

      if (!userData?.branchId) {
        Alert.alert(
          "No Branch",
          "You must join a branch before you can accept assignments.",
          [{ text: "OK" }]
        );
        setLoading(false);
        return;
      }

      // Use batch write to update all parcels atomically
      const batch = writeBatch(db);

      // Update all parcels in the assignment
      assignmentData.parcels.forEach((parcel) => {
        const parcelRef = doc(db, "parcels", parcel.id);
        batch.update(parcelRef, {
          driverUid: currentUser.uid,
          driverName: userData.fullName || currentUser.displayName,
          assignedAt: serverTimestamp(),
          status: "Out for Delivery",
          updatedAt: serverTimestamp(),
        });
      });

      // Update assignment status
      const assignmentRef = doc(db, "assignments", assignmentData.id);
      batch.update(assignmentRef, {
        status: "accepted",
        acceptedAt: serverTimestamp(),
      });

      await batch.commit();

      Alert.alert(
        "Success!",
        `You have accepted ${assignmentData.parcels.length} parcel${assignmentData.parcels.length > 1 ? "s" : ""}.`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowAssignmentModal(false);
              setScanned(false);
              setAssignmentData(null);
              router.back();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error accepting assignment:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      Alert.alert("Error", `Failed to accept assignment.\n\nError: ${error.message}\n\nPlease make sure Firestore rules are deployed.`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Prompts the driver with a confirmation alert before rejecting the scanned assignment.
   * Updates the assignment document in Firestore with a "rejected" status and rejection timestamp, then closes the assignment modal and resets the scanner to allow scanning another QR code.
   * Uses a small delay after closing the modal to ensure smooth UI transitions before re-enabling the scanner.
   */
  const handleRejectAssignment = () => {
    Alert.alert(
      "Reject Assignment",
      "Are you sure you want to reject this assignment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await updateDoc(doc(db, "assignments", assignmentData.id), {
                status: "rejected",
                rejectedAt: serverTimestamp(),
              });

              Alert.alert("Rejected", "Assignment has been rejected.", [
                {
                  text: "OK",
                  onPress: () => {
                    setShowAssignmentModal(false);
                    setAssignmentData(null);
                    // Small delay to ensure modal is closed before resetting scanner
                    setTimeout(() => {
                      setScanned(false);
                    }, 100);
                  },
                },
              ]);
            } catch (error) {
              console.error("Error rejecting assignment:", error);
              Alert.alert("Error", "Failed to reject assignment.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Scan Assignment QR", headerShown: true }} />
      
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00b2e1" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      {!showAssignmentModal && (
        <>
          <CameraView 
            style={{ flex: 1 }} 
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
          />
          
          {/* QR Scanner Guidelines */}
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerGuide}>
              <View style={styles.cornerTopLeft} />
              <View style={styles.cornerTopRight} />
              <View style={styles.cornerBottomLeft} />
              <View style={styles.cornerBottomRight} />
            </View>
            <Text style={styles.scannerText}>Position QR code within the frame</Text>
          </View>
        </>
      )}

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.cancelButton} 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/Home');
            }
          }}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Assignment Details Modal */}
      <Modal
        visible={showAssignmentModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📦 Parcel Assignment</Text>
            <Text style={styles.infoText}>
              You have {assignmentData?.parcels?.length || 0} parcel{assignmentData?.parcels?.length > 1 ? "s" : ""} to receive
            </Text>

            <ScrollView style={styles.parcelScrollView}>
              <View style={styles.detailsContainer}>
                <Text style={styles.sectionTitle}>Parcels:</Text>
                {assignmentData?.parcels?.map((parcel, index) => (
                  <View key={index} style={styles.parcelCard}>
                    <View style={styles.parcelHeader}>
                      <Text style={styles.parcelNumber}>#{index + 1}</Text>
                      <Text style={styles.parcelReference}>{parcel.reference}</Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Recipient:</Text>
                      <Text style={styles.detailValue}>{parcel.recipient}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Contact:</Text>
                      <Text style={styles.detailValue}>{parcel.recipientContact}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address:</Text>
                      <Text style={styles.detailValue}>
                        {[parcel.street, parcel.barangay, parcel.municipality, parcel.province]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Weight:</Text>
                      <Text style={styles.detailValue}>{parcel.weight || 0} kg</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.acceptButton, loading && styles.buttonDisabled]}
                onPress={handleAcceptAssignment}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.acceptButtonText}>Accept Assignment</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rejectButton}
                onPress={handleRejectAssignment}
                disabled={loading}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  text: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f21b3f",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
    flexDirection: "column",
  },
  buttonContainer: {
    marginTop: 16,
  },
  parcelScrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00b2e1",
    marginBottom: 12,
    textAlign: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
    lineHeight: 20,
  },
  detailsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  parcelCard: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#00b2e1",
  },
  parcelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  parcelNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00b2e1",
  },
  parcelReference: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  detailRow: {
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 2,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    color: "#000",
    fontWeight: "500",
  },
  acceptButton: {
    backgroundColor: "#29bf12",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  rejectButton: {
    backgroundColor: "#f21b3f",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  rejectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCancelButton: {
    backgroundColor: "#f21b3f",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerGuide: {
    width: 250,
    height: 250,
    position: "relative",
  },
  cornerTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#00b2e1",
  },
  cornerTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#00b2e1",
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#00b2e1",
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#00b2e1",
  },
  scannerText: {
    marginTop: 30,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
