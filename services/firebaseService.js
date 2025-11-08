import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const fetchAllParcels = async (uid = null) => {
  try {
    const parcels = [];
    if (uid) {
      const parcelsRef = collection(db, 'parcels');
      const parcelsSnapshot = await getDocs(parcelsRef);
      
      if (parcelsSnapshot.empty) {
        return parcels;
      }
      
      for (const parcelDoc of parcelsSnapshot.docs) {
        const parcelId = parcelDoc.id;
        const parcelData = parcelDoc.data();
        
        if (parcelData.uid === uid) {
          parcels.push({
            id: parcelId,
            reference: parcelData.reference || '',
            status: parcelData.status || 'Pending',
            recipient: parcelData.recipient || '',
            address: parcelData.address || '',
            dateAdded: parcelData.dateAdded?.toDate() || new Date(),
            uid: uid
          });
        }
      }
    } else {
      const parcelsRef = collection(db, 'parcels');
      const parcelsSnapshot = await getDocs(parcelsRef);

      for (const parcelDoc of parcelsSnapshot.docs) {
        const parcelId = parcelDoc.id;
        const parcelData = parcelDoc.data();
        
        parcels.push({
          id: parcelId,
          reference: parcelData.reference || '',
          status: parcelData.status || 'Pending',
          recipient: parcelData.recipient || '',
          address: parcelData.address || '',
          dateAdded: parcelData.dateAdded?.toDate() || new Date(),
          uid: parcelData.uid || ''
        });
      }
    }
    
    return parcels;
  } catch (error) {
    console.error('Error fetching parcels:', error);
    return [];
  }
};

export const fetchParcelStatusData = async (uid = null) => {
  try {
    let delivered = 0;
    let outForDelivery = 0;
    let failedOrReturned = 0;
    let pending = 0;

    const parcelsRef = collection(db, 'parcels');
    const parcelsSnapshot = await getDocs(parcelsRef);
    console.log(parcelsSnapshot)

    if (parcelsSnapshot.empty) {
      return { delivered: 0, outForDelivery: 0, failedOrReturned: 0, pending: 0, total: 0 };
    }
    
    for (const parcelDoc of parcelsSnapshot.docs) {
      const parcelData = parcelDoc.data();
      console.log()
      if (uid && parcelData.uid !== uid) {
        continue; 
      }
      console.log(parcelData.status.toLowerCase())
      switch(parcelData.status?.toLowerCase()) {
        case 'delivered':
          delivered++;
          break;
        case 'out for delivery':
          outForDelivery++;
          break;
        case 'failed':
        case 'returned':
          failedOrReturned++;
          break;
        case 'pending':
        default:
          pending++;
          break;
      }
    }
    
    return { 
      delivered, 
      outForDelivery, 
      failedOrReturned, 
      pending,
      total: delivered + outForDelivery + failedOrReturned + pending 
    };
  } catch (error) {
    console.error('Error fetching parcel status data:', error);
    return { delivered: 0, outForDelivery: 0, failedOrReturned: 0, pending: 0, total: 0 };
  }
};

// Add a new parcel to the database following the nested structure
// parcels > uid > timestamp > parcel_id
export const addParcel = async (parcelData, uid) => {
  try {
    if (!uid) {
      throw new Error('User ID (uid) is required to add a parcel');
    }
    
    // Create a timestamp for the current time
    const now = new Date();
    const timestamp = now.getTime();
    
    // Generate a unique ID for the parcel if not provided
    const parcelId = parcelData.id || `PKG${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    
    // Format the data to be stored
    const dataToStore = {
      uid: uid,
      reference: parcelData.reference || '',
      status: parcelData.status || 'Pending',
      recipient: parcelData.recipient || '',
      address: parcelData.address || '',
      dateAdded: parcelData.dateAdded || Timestamp.fromDate(now),
      createdAt: Timestamp.fromDate(now)
    };
    
    // Set the document at the nested path
    const parcelDocRef = doc(db, `parcels/${parcelId}`);
    await setDoc(parcelDocRef, dataToStore);
    
    return {
      success: true,
      id: parcelId,
      timestamp: timestamp,
      uid: uid
    };
  } catch (error) {
    console.error('Error adding parcel:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Update an existing parcel in the database
// Requires only the parcelId
export const updateParcel = async (parcelData, parcelId) => {
  try {
    if (!parcelId) {
      throw new Error('Parcel ID is required to update a parcel');
    }
    
    // Format the data to be updated
    const dataToUpdate = {
      reference: parcelData.reference,
      status: parcelData.status,
      recipient: parcelData.recipient,
      address: parcelData.address,
      // Only include fields that are provided in the update
      ...(parcelData.dateAdded && { dateAdded: parcelData.dateAdded }),
      // Add updatedAt timestamp
      updatedAt: Timestamp.fromDate(new Date())
    };
    
    // Remove any undefined fields
    Object.keys(dataToUpdate).forEach(key => {
      if (dataToUpdate[key] === undefined) {
        delete dataToUpdate[key];
      }
    });
    
    // Set the document at the path
    const parcelDocRef = doc(db, `parcels/${parcelId}`);
    await setDoc(parcelDocRef, dataToUpdate, { merge: true });
    
    return {
      success: true,
      id: parcelId
    };
  } catch (error) {
    console.error('Error updating parcel:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete a parcel from the database
// Requires the parcelId
export const deleteParcel = async (parcelId) => {
  try {
    if (!parcelId) {
      throw new Error('Parcel ID is required to delete a parcel');
    }
    
    // Reference to the parcel document
    const parcelDocRef = doc(db, `parcels/${parcelId}`);
    
    // Delete the document
    await deleteDoc(parcelDocRef);
    
    return {
      success: true,
      message: 'Parcel deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting parcel:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get a single parcel by its ID
// Requires only the parcelId
export const getParcel = async (parcelId) => {
  try {
    if (!parcelId) {
      throw new Error('Parcel ID is required to get a parcel');
    }
    
    // Reference to the parcel document
    const parcelDocRef = doc(db, `parcels/${parcelId}`);
    
    // Get the document
    const parcelDoc = await getDoc(parcelDocRef);
    
    if (!parcelDoc.exists()) {
      return {
        success: false,
        error: 'Parcel not found'
      };
    }
    
    const parcelData = parcelDoc.data();
    
    return {
      success: true,
      data: {
        id: parcelId,
        reference: parcelData.reference || '',
        status: parcelData.status || 'Pending',
        recipient: parcelData.recipient || '',
        address: parcelData.address || '',
        dateAdded: parcelData.dateAdded?.toDate() || new Date(),
        uid: parcelData.uid || ''
      }
    };
  } catch (error) {
    console.error('Error getting parcel:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Fetch driver status data
export const fetchDriverStatusData = async () => {
  try {
    const driversRef = collection(db, 'drivers');
    const driversSnapshot = await getDocs(driversRef);
    
    let available = 0;
    let onTrip = 0;
    let offline = 0;
    
    driversSnapshot.forEach((doc) => {
      const driver = doc.data();
      switch(driver.status?.toLowerCase()) {
        case 'available':
          available++;
          break;
        case 'on trip':
        case 'delivering':
          onTrip++;
          break;
        case 'offline':
        default:
          offline++;
          break;
      }
    });
    
    return { available, onTrip, offline };
  } catch (error) {
    console.error('Error fetching driver status data:', error);
    return { available: 0, onTrip: 0, offline: 0 };
  }
};

// Fetch delivery volume data
export const fetchDeliveryVolumeData = async (period = 'daily') => {
  try {
    const deliveriesRef = collection(db, 'deliveries');
    const deliveriesSnapshot = await getDocs(deliveriesRef);
    
    // Process data based on period (daily/weekly)
    const deliveryData = {};
    
    deliveriesSnapshot.forEach((doc) => {
      const delivery = doc.data();
      const date = new Date(delivery.date?.toDate() || delivery.date);
      
      if (!date || isNaN(date.getTime())) return;
      
      let dateKey;
      if (period === 'daily') {
        dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else {
        // Get week number
        const weekNumber = getWeekNumber(date);
        dateKey = `Week ${weekNumber}`;
      }
      
      if (!deliveryData[dateKey]) {
        deliveryData[dateKey] = {
          date: dateKey,
          deliveries: 0,
          failedOrReturned: 0
        };
      }
      
      deliveryData[dateKey].deliveries++;
      
      if (delivery.status === 'failed' || delivery.status === 'returned') {
        deliveryData[dateKey].failedOrReturned++;
      }
    });
    
    // Calculate success rate and convert to array
    const result = Object.values(deliveryData).map(item => {
      const successRate = ((item.deliveries - item.failedOrReturned) / item.deliveries) * 100;
      return {
        ...item,
        successRate: isNaN(successRate) ? 0 : successRate.toFixed(2)
      };
    });
    
    // Sort by date
    return result.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('Error fetching delivery volume data:', error);
    return [];
  }
};

// Fetch overspeeding incidents data
export const fetchOverspeedingData = async (period = 'daily') => {
  try {
    const incidentsRef = collection(db, 'speedingIncidents');
    const incidentsSnapshot = await getDocs(incidentsRef);
    
    // Process data based on period (daily/weekly)
    const incidentData = {};
    
    incidentsSnapshot.forEach((doc) => {
      const incident = doc.data();
      const date = new Date(incident.timestamp?.toDate() || incident.timestamp);
      
      if (!date || isNaN(date.getTime())) return;
      
      let dateKey;
      if (period === 'daily') {
        dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else {
        // Get week number
        const weekNumber = getWeekNumber(date);
        dateKey = `Week ${weekNumber}`;
      }
      
      if (!incidentData[dateKey]) {
        incidentData[dateKey] = {
          date: dateKey,
          incidents: 0,
          totalSpeed: 0,
          speedReadings: 0
        };
      }
      
      incidentData[dateKey].incidents++;
      
      if (incident.speed) {
        incidentData[dateKey].totalSpeed += incident.speed;
        incidentData[dateKey].speedReadings++;
      }
    });
    
    // Calculate average speed and convert to array
    const result = Object.values(incidentData).map(item => {
      const avgSpeed = item.speedReadings > 0 ? item.totalSpeed / item.speedReadings : 0;
      return {
        date: item.date,
        incidents: item.incidents,
        avgSpeed: Math.round(avgSpeed)
      };
    });
    
    // Sort by date
    return result.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('Error fetching overspeeding data:', error);
    return [];
  }
};

// Fetch recent incidents
export const fetchRecentIncidents = async (limit = 5) => {
  try {
    const incidentsRef = collection(db, 'speedingIncidents');
    const q = query(incidentsRef, orderBy('timestamp', 'desc'), limit(limit));
    const incidentsSnapshot = await getDocs(q);
    
    const incidents = [];
    incidentsSnapshot.forEach((doc) => {
      const incident = doc.data();
      incidents.push({
        id: doc.id,
        date: incident.timestamp?.toDate().toLocaleDateString() || 'Unknown',
        location: incident.location || 'Unknown location',
        driverName: incident.driverName || 'Unknown driver',
        speed: incident.speed || 0
      });
    });
    
    return incidents;
  } catch (error) {
    console.error('Error fetching recent incidents:', error);
    return [];
  }
};

// Helper function to get week number
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}