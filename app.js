import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    enableIndexedDbPersistence,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: Replace with your actual Firebase project config
const firebaseConfig = {
    apiKey: "AIzaSyD_wuR44KHN1fa_jXpHunL-BhmMGvBDTBM",
    authDomain: "gram-sampark-d5cb8.firebaseapp.com",
    projectId: "gram-sampark-d5cb8",
    storageBucket: "gram-sampark-d5cb8.firebasestorage.app",
    messagingSenderId: "10325008019",
    appId: "1:10325008019:web:26f635ed4b84f7beb57766"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence');
    }
});

// UI Elements
const statusIndicator = document.getElementById('status-indicator');
const form = document.getElementById('patient-form');
const patientListEl = document.getElementById('patient-list');
const msgEl = document.getElementById('form-msg');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-btn');

// Keep track of all fetched patients for searching
let allPatients = [];

// Monitor Network Status
function updateOnlineStatus() {
    if (navigator.onLine) {
        statusIndicator.textContent = 'Online & Syncing';
        statusIndicator.className = 'status online';
    } else {
        statusIndicator.textContent = 'Offline (Changes will save locally)';
        statusIndicator.className = 'status offline';
    }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// Fetch and display patients in real-time
const q = query(collection(db, "patients"), orderBy("updated_at", "desc"));
onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    allPatients = [];
    snapshot.forEach((docSnap) => {
        // A record might be pending write if it's from the local cache
        const source = docSnap.metadata.hasPendingWrites ? "Local" : "Server";
        allPatients.push({ id: docSnap.id, source, ...docSnap.data() });
    });
    renderPatients(allPatients);
});

function renderPatients(patients) {
    patientListEl.innerHTML = '';
    patients.forEach(p => {
        const div = document.createElement('div');
        div.className = 'patient-card';
        const dateStr = p.updated_at ? new Date(p.client_timestamp || p.updated_at.toDate()).toLocaleString() : 'Pending...';

        div.innerHTML = `
      <h3>${escapeHTML(p.name)} (${escapeHTML(p.patient_id)})</h3>
      <p><strong>Age:</strong> ${escapeHTML(p.age)} | <strong>Village:</strong> ${escapeHTML(p.village)}</p>
      <p><strong>Diagnosis:</strong> ${escapeHTML(p.diagnosis)}</p>
      <div class="meta">
        Updated: ${dateStr} by ${escapeHTML(p.updated_by)} 
        <br><small>Status: ${p.source} (LWW enforced)</small>
      </div>
    `;
        div.addEventListener('click', () => editPatient(p));
        patientListEl.appendChild(div);
    });
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const docId = document.getElementById('docId').value;
    const patientData = {
        patient_id: document.getElementById('patient_id').value.trim(),
        name: document.getElementById('name').value.trim(),
        age: document.getElementById('age').value,
        village: document.getElementById('village').value.trim(),
        diagnosis: document.getElementById('diagnosis').value.trim(),
        medications: document.getElementById('medications').value.trim(),
        updated_by: document.getElementById('updated_by').value.trim(),
        updated_at: serverTimestamp(),
        // Keep a client-side timestamp to perform our manual Last Write Wins check
        client_timestamp: Date.now()
    };

    try {
        if (docId) {
            // Custom client-side timestamp check before updating
            const patientRef = doc(db, "patients", docId);

            // If offline, getDoc will read from local cache. 
            // If online, it ensures we retrieve the latest state for comparison.
            // Firestore naturally supports LWW, but we manually verify using our client_timestamp field.
            const existingDoc = await getDoc(patientRef);
            if (existingDoc.exists()) {
                const existingData = existingDoc.data();
                if (existingData.client_timestamp && existingData.client_timestamp > patientData.client_timestamp) {
                    showMsg('Cannot update: Server has a newer version of this record.', 'error');
                    return;
                }
            }
            await setDoc(patientRef, patientData, { merge: true });
            showMsg('Patient record updated successfully!', 'success');
        } else {
            // Add new record
            await addDoc(collection(db, "patients"), patientData);
            showMsg('New patient added successfully!', 'success');
        }
        clearForm();
    } catch (error) {
        console.error("Error writing document: ", error);
        showMsg('Error saving record. Check console for details.', 'error');
    }
});

function editPatient(p) {
    document.getElementById('docId').value = p.id;
    document.getElementById('patient_id').value = p.patient_id;
    document.getElementById('name').value = p.name;
    document.getElementById('age').value = p.age;
    document.getElementById('village').value = p.village;
    document.getElementById('diagnosis').value = p.diagnosis;
    document.getElementById('medications').value = p.medications || '';
    document.getElementById('updated_by').value = p.updated_by;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

clearBtn.addEventListener('click', clearForm);

function clearForm() {
    document.getElementById('docId').value = '';
    form.reset();
}

function showMsg(msg, type) {
    msgEl.textContent = msg;
    msgEl.className = type;
    setTimeout(() => { msgEl.textContent = ''; msgEl.className = ''; }, 3000);
}

// Search functionality
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPatients.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.patient_id.toLowerCase().includes(term)
    );
    renderPatients(filtered);
});
