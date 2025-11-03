import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DropDownPicker from "react-native-dropdown-picker";

export default function ParcelDetailsModal({ visible, parcel, onClose, onUpdateStatus }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(parcel?.status || null);
  const [initialStatus, setInitialStatus] = useState(parcel?.status || null);

  const [items, setItems] = useState([
    { label: "Delivered", value: "Delivered" },
    { label: "Cancelled", value: "Cancelled" },
  ]);

  useEffect(() => {
    setStatus(parcel?.status ?? null);
    setInitialStatus(parcel?.status ?? null);
  }, [parcel]);

  if (!parcel) return null;

  const hasChanged = status !== initialStatus;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <ScrollView
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>📦 Parcel Details</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recipient</Text>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{parcel.recipient}</Text>

              <Text style={styles.label}>Contact</Text>
              <Text style={styles.value}>{parcel.recipientContact}</Text>

              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>
                {parcel.street ? parcel.street+ ", " : "" } {parcel.barangay}, {parcel.municipality}, {parcel.province}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Parcel Info</Text>
              <Text style={styles.label}>Reference</Text>
              <Text style={styles.value}>{parcel.reference}</Text>

              <Text style={styles.label}>Package ID</Text>
              <Text style={styles.value}>{parcel.packageId}</Text>

              <Text style={styles.label}>Assigned At</Text>
              <Text style={styles.value}>
                {parcel.assignedAt?.toDate
                  ? parcel.assignedAt.toDate().toLocaleString()
                  : "—"}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Driver</Text>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{parcel.driverName}</Text>

              <Text style={styles.label}>Region</Text>
              <Text style={styles.value}>{parcel.region}</Text>
            </View>
          </ScrollView>

          <View style={{ zIndex: 2000, marginTop: 8 }}>
            <Text style={[styles.label, { marginBottom: 4 }]}>Update Status</Text>
            <DropDownPicker
              listMode="SCROLLVIEW"
              open={open}
              value={status}
              items={items}
              setOpen={setOpen}
              setValue={setStatus}
              setItems={setItems}
              placeholder="Select status"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={2000}
            />
          </View>

          <View style={styles.buttonsRow}>
            <Pressable style={[styles.btn, styles.closeBtn]} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.saveBtn,
                !hasChanged && { backgroundColor: "#ccc" },
              ]}
              disabled={!hasChanged}
              onPress={() => {
                if (status && parcel?.ParcelID && hasChanged) {
                  onUpdateStatus(parcel.ParcelID, status);
                }
                setOpen(false);
                onClose();
              }}
            >
              <Text style={styles.saveText}>Update</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    maxHeight: "95%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
    color: "#00b2e1",
  },
  section: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: "#f2f2f2",
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#00b2e1",
    textTransform: "uppercase",
  },
  label: {
    color: "#666",
    fontSize: 13,
    marginTop: 6,
  },
  value: {
    color: "#111",
    fontSize: 15,
    fontWeight: "500",
    marginTop: 2,
  },
  dropdown: {
    borderColor: "#c4cad0",
    borderRadius: 10,
  },
  dropdownContainer: {
    borderColor: "#c4cad0",
    borderRadius: 10,
    maxHeight: 200,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#eee",
    paddingTop: 10,
    paddingBottom: 12,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  closeBtn: {
    backgroundColor: "#f2f2f2",
  },
  closeText: {
    color: "#333",
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#29bf12",
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
  },
});
