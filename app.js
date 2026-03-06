import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    enableIndexedDbPersistence,
    getDoc,
    getDocs,
    deleteDoc
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
const auth = getAuth(app);

// Global State
let currentUser = null;
let userRole = 'user';
let userStatus = 'pending';
let userAssignedVillages = []; // Now stores [{id, name}]
let activeVillage = null; // Now stores {id, name}
let allVillagesCache = []; // Now stores [{id, name}]
let patientUnsubscribe = null;
let villageUnsubscribe = null;
let usersUnsubscribe = null;
let pendingUsersUnsubscribe = null;
let accessRequestsUnsubscribe = null;

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence');
    }
});

// Auth UI Elements
const loginSection = document.getElementById('login-section');
const pendingSection = document.getElementById('pending-section');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const loginMsg = document.getElementById('login-msg');

// Admin UI Elements
const panelAdminDashboard = document.getElementById('panel-admin-dashboard');
const panelAdminManage = document.getElementById('panel-admin-manage');
const villageForm = document.getElementById('village-form');
const adminMsg = document.getElementById('admin-msg');
const villageListEl = document.getElementById('village-list');
const pendingUsersList = document.getElementById('pending-users-list');
const villageRequestsList = document.getElementById('village-requests-list');
const approvedUsersList = document.getElementById('approved-users-list');

// User UI Elements
const panelUserDashboard = document.getElementById('panel-user-dashboard');
const panelUserRequest = document.getElementById('panel-user-request');
const activeVillageSelect = document.getElementById('active-village-select');
const userVillageStats = document.getElementById('user-village-stats');
const requestVillageSelect = document.getElementById('request-village-select');
const submitRequestBtn = document.getElementById('submit-request-btn');
const myRequestsList = document.getElementById('my-requests-list');
const requestMsg = document.getElementById('request-msg');

// Shared Panels
const mainNav = document.getElementById('main-nav');
const panelAddData = document.getElementById('panel-add-data');
const panelViewData = document.getElementById('panel-view-data');
const formVillageBanner = document.getElementById('form-village-banner');
const formTargetVillage = document.getElementById('form-target-village');

// Patient UI Elements
const statusIndicator = document.getElementById('status-indicator');
const form = document.getElementById('patient-form');
const patientListEl = document.getElementById('patient-list');
const msgEl = document.getElementById('form-msg');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-btn');

// Multi-step Form Logic
let currentStep = 1;
const totalSteps = 8;
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const submitBtn = document.getElementById('submit-btn');

nextBtn.addEventListener('click', () => {
    if (validateStep(currentStep)) {
        changeStep(1);
    }
});
prevBtn.addEventListener('click', () => changeStep(-1));

function changeStep(direction) {
    document.getElementById(`step-${currentStep}`).style.display = 'none';
    document.getElementById(`step${currentStep}-indicator`).classList.remove('active');
    if (direction > 0) document.getElementById(`step${currentStep}-indicator`).classList.add('completed');

    currentStep += direction;

    document.getElementById(`step-${currentStep}`).style.display = 'block';
    document.getElementById(`step${currentStep}-indicator`).classList.add('active');

    prevBtn.style.display = currentStep > 1 ? 'inline-block' : 'none';

    if (currentStep === totalSteps) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'inline-block';
    } else {
        nextBtn.style.display = 'inline-block';
        submitBtn.style.display = 'none';
    }
}

function validateStep(step) {
    const stepEl = document.getElementById(`step-${step}`);
    const inputs = stepEl.querySelectorAll('input, select');
    let isValid = true;

    inputs.forEach(input => {
        // Clear previous errors
        input.classList.remove('invalid');
        const existingError = input.parentElement.querySelector('.error-text');
        if (existingError) existingError.remove();

        const val = input.value.trim();
        let errorMsg = '';

        if (input.hasAttribute('required') && !val) {
            errorMsg = 'This field is required.';
        } else if (val) {
            if (input.id === 'mobile' && !/^[0-9]{10}$/.test(val)) {
                errorMsg = 'Mobile must be exactly 10 digits.';
            } else if (input.id === 'pincode' && !/^[0-9]{6}$/.test(val)) {
                errorMsg = 'PIN Code must be 6 digits.';
            } else if (input.type === 'email' && input.id === 'patient_email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                errorMsg = 'Invalid email format.';
            }
        }

        if (errorMsg) {
            input.classList.add('invalid');
            const errSpan = document.createElement('span');
            errSpan.className = 'error-text';
            errSpan.textContent = errorMsg;
            input.parentElement.appendChild(errSpan);
            isValid = false;
        }
    });

    if (!isValid) {
        // Find first invalid input and scroll to it
        const firstInvalid = stepEl.querySelector('.invalid');
        if (firstInvalid) firstInvalid.focus();
    }
    return isValid;
}

// Dynamic Fields Logic
document.getElementById('is_employed').addEventListener('change', (e) => {
    const employed = e.target.value === 'Yes';
    document.getElementById('employment-sector-container').style.display = employed ? 'block' : 'none';
    if (!employed) {
        document.getElementById('farmer-details-container').style.display = 'none';
    } else {
        document.getElementById('farmer-details-container').style.display = document.getElementById('sector').value === 'Farmer' ? 'block' : 'none';
    }
});
document.getElementById('sector').addEventListener('change', (e) => {
    document.getElementById('farmer-details-container').style.display = e.target.value === 'Farmer' ? 'block' : 'none';
});
document.getElementById('owns_land').addEventListener('change', (e) => {
    document.getElementById('land-details-container').style.display = e.target.value === 'Yes' ? 'block' : 'none';
});
document.getElementById('children_school').addEventListener('change', (e) => {
    document.getElementById('school-type-container').style.display = e.target.value === 'Yes' ? 'block' : 'none';
});

// Family Members Logic
const addFamilyBtn = document.getElementById('add-family-btn');
const familyContainer = document.getElementById('family-members-container');
let memberCount = 0;

addFamilyBtn.addEventListener('click', addFamilyMember);

function addFamilyMember(data = {}) {
    memberCount++;
    const div = document.createElement('div');
    div.className = 'family-member-card';
    div.id = `member-${memberCount}`;

    div.innerHTML = `
        <button type="button" class="remove-member-btn" onclick="this.parentElement.remove()">X</button>
        <div class="form-group">
            <label>Name</label>
            <input type="text" class="member-name" value="${data.name || ''}" required>
        </div>
        <div class="form-group">
            <label>Relation</label>
            <input type="text" class="member-relation" value="${data.relation || ''}" required>
        </div>
        <div class="form-group">
            <label>Employment</label>
            <input type="text" class="member-employment" value="${data.employment || ''}">
        </div>
        <div class="form-group">
            <label>Gender</label>
            <select class="member-gender" required>
                <option value="">Select</option>
                <option value="Male" ${data.gender === 'Male' ? 'selected' : ''}>Male</option>
                <option value="Female" ${data.gender === 'Female' ? 'selected' : ''}>Female</option>
            </select>
        </div>
        <div class="form-group">
            <label>Marital Status</label>
            <select class="member-marital" required>
                <option value="">Select</option>
                <option value="Single" ${data.marital === 'Single' ? 'selected' : ''}>Single</option>
                <option value="Married" ${data.marital === 'Married' ? 'selected' : ''}>Married</option>
            </select>
        </div>
    `;
    familyContainer.appendChild(div);
}

function getFamilyData() {
    const members = [];
    familyContainer.querySelectorAll('.family-member-card').forEach(card => {
        members.push({
            name: card.querySelector('.member-name').value,
            relation: card.querySelector('.member-relation').value,
            employment: card.querySelector('.member-employment').value,
            gender: card.querySelector('.member-gender').value,
            marital: card.querySelector('.member-marital').value,
        });
    });
    return members;
}

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

// Auth Logic
let isLoginMode = true;
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const toggleAuth = document.getElementById('toggle-auth');

toggleAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authTitle.textContent = isLoginMode ? 'Login' : 'Register';
    authBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
    toggleAuth.textContent = isLoginMode ? 'Need an account? Register here' : 'Already have an account? Login here';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            // Registration
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            // Auto create unapproved user doc
            await setDoc(doc(db, 'users', userCred.user.uid), {
                email: email,
                role: 'user',
                status: 'pending',
                created_at: serverTimestamp()
            });
        }
        loginForm.reset();
        loginMsg.textContent = '';
    } catch (error) {
        loginMsg.textContent = error.message;
        loginMsg.className = 'error';
    }
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        userInfo.textContent = user.email;
        logoutBtn.style.display = 'inline-block';
        loginSection.style.display = 'none';
        appContainer.style.display = 'grid';

        // Check Role & Status
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            userRole = userDoc.data().role || 'user';
            userStatus = userDoc.data().status || 'pending';
        } else {
            // Fallback for very old users without doc
            userRole = 'user';
            userStatus = 'pending';
            await setDoc(userDocRef, { email: user.email, role: 'user', status: 'pending' });
        }

        if (userRole === 'admin') {
            appContainer.style.display = 'block';
            pendingSection.style.display = 'none';
            setupTabs([
                { id: 'panel-admin-dashboard', title: 'Admin Dashboard' },
                { id: 'panel-admin-manage', title: 'Manage System' },
                { id: 'panel-add-data', title: 'Add Record (Override)' },
                { id: 'panel-view-data', title: 'Global Database' }
            ]);
            adminSetup();
            await fetchAssignedVillages(user);
            setupPatientListener();
        } else if (userStatus === 'approved') {
            appContainer.style.display = 'block';
            pendingSection.style.display = 'none';
            setupTabs([
                { id: 'panel-user-dashboard', title: 'My Dashboard' },
                { id: 'panel-add-data', title: 'Add Data' },
                { id: 'panel-view-data', title: 'View Records' },
                { id: 'panel-user-request', title: 'Request Village Access' }
            ]);
            userSetup();
            await fetchAssignedVillages(user);
            setupPatientListener();
        } else {
            // Pending or Rejected user
            appContainer.style.display = 'none';
            pendingSection.style.display = 'block';

            const reactCont = document.getElementById('reactivation-container');
            const reactBtn = document.getElementById('request-reactivation-btn');
            const pendingStatus = document.getElementById('pending-status-msg');
            const pendingTitle = document.getElementById('pending-title');
            const pendingText = document.getElementById('pending-msg');

            if (userStatus === 'rejected' || userStatus === 'revoked') {
                pendingTitle.textContent = 'Account Access Revoked';
                pendingText.textContent = 'Your access has been revoked by an administrator.';
                reactCont.style.display = 'block';
                reactBtn.onclick = async () => {
                    try {
                        await setDoc(doc(db, 'users', user.uid), { status: 'pending' }, { merge: true });
                        pendingStatus.textContent = 'Re-activation request sent!';
                        pendingStatus.className = 'success';
                        reactCont.style.display = 'none';
                    } catch (e) {
                        pendingStatus.textContent = e.message;
                        pendingStatus.className = 'error';
                    }
                };
            } else {
                pendingTitle.textContent = 'Account Pending Approval';
                pendingText.textContent = 'Your account has been created successfully but is awaiting admin approval.';
                reactCont.style.display = 'none';
            }
        }

    } else {
        currentUser = null;
        userRole = 'user';
        userStatus = 'pending';
        userAssignedVillages = [];
        activeVillage = null;
        userInfo.textContent = '';
        logoutBtn.style.display = 'none';
        loginSection.style.display = 'block';
        appContainer.style.display = 'none';
        pendingSection.style.display = 'none';

        if (patientUnsubscribe) patientUnsubscribe();
        if (villageUnsubscribe) villageUnsubscribe();
        if (usersUnsubscribe) usersUnsubscribe();
        if (pendingUsersUnsubscribe) pendingUsersUnsubscribe();
        if (accessRequestsUnsubscribe) accessRequestsUnsubscribe();
    }
});

// Tab Navigation Logic
function setupTabs(tabs) {
    mainNav.innerHTML = '';
    const allPanels = document.querySelectorAll('.tab-panel');
    allPanels.forEach(p => p.classList.remove('active'));

    tabs.forEach((tab, index) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
        btn.textContent = tab.title;
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            allPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tab.id).classList.add('active');

            // Fix: Reset form when entering data entry tabs to avoid starting at partial/late steps
            if (tab.id === 'panel-add-data') {
                clearForm();
            }
        };
        mainNav.appendChild(btn);

        if (index === 0) {
            document.getElementById(tab.id).classList.add('active');
        }
    });
}

function setupPatientListener() {
    if (patientUnsubscribe) patientUnsubscribe();

    let q;
    if (userRole === 'admin') {
        // Admins see everything
        q = query(collection(db, "patients"), orderBy("updated_at", "desc"));
    } else {
        // Check if user has any assigned villages to avoid query errors
        if (userAssignedVillages && userAssignedVillages.length > 0) {
            const villageNames = userAssignedVillages.map(v => v.name);
            q = query(
                collection(db, "patients"),
                where("village", "in", villageNames),
                orderBy("updated_at", "desc")
            );
        } else {
            // If no villages are assigned, show nothing (or handle as needed)
            renderPatients([]);
            return;
        }
    }

    patientUnsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        allPatients = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const source = docSnap.metadata.hasPendingWrites ? "Local" : "Server";
            allPatients.push({ id: docSnap.id, source, ...data });
        });
        renderPatients(allPatients);

        if (userRole !== 'admin') {
            updateUserDashboardStats();
        }
    }, (error) => {
        console.error("Patient list error:", error);
        // Note: You may need to create a composite index in Firebase Console 
        // for (village ASC, updated_at DESC)
    });
}

function adminSetup() {
    // Listen for users for approval and approved users
    const pq = query(collection(db, 'users'));
    pendingUsersUnsubscribe = onSnapshot(pq, (snapshot) => {
        document.getElementById('stat-total-users').textContent = snapshot.size;
        pendingUsersList.innerHTML = '';
        approvedUsersList.innerHTML = ''; // Clear both to rebuild

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.role === 'admin') return;

            const div = document.createElement('div');
            div.className = 'patient-card'; // Consistent professional design

            const isApproved = data.status === 'approved';
            const approvedOn = data.approved_at ? new Date(data.approved_at.toDate()).toLocaleDateString() : 'N/A';

            div.innerHTML = `
                <div class="card-header" style="display: flex; justify-content: space-between;">
                    <h3 style="margin:0;">${escapeHTML(data.email)}</h3>
                    <span class="source-tag" style="background: ${isApproved ? '#e8f5e9' : '#fff3e0'}; color: ${isApproved ? '#2e7d32' : '#e65100'};">
                        ${data.status.toUpperCase()}
                    </span>
                </div>
                <div class="card-body" style="margin: 10px 0;">
                    <div><strong>User ID:</strong> ${docSnap.id}</div>
                    ${isApproved ? `<div style="font-size:0.85rem; color:#666; margin-top:4px;">Account Approved On: ${approvedOn}</div>` : ''}
                    ${isApproved ? `<div style="margin-top: 10px;"><strong>Village Access:</strong> <div id="v-list-${docSnap.id}" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">Loading...</div></div>` : ''}
                </div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    ${data.status !== 'approved' ? `<button class="btn-sm" onclick="approveUser('${docSnap.id}')">Approve Account</button>` : ''}
                    <button class="secondary btn-sm" onclick="revokeUser('${docSnap.id}', '${escapeHTML(data.email)}')">Revoke Full Access</button>
                </div>
            `;

            if (isApproved) {
                approvedUsersList.appendChild(div);
                // Populate granular village list for approved users
                fetchUserVillages(data.email, `v-list-${docSnap.id}`);
            } else {
                pendingUsersList.appendChild(div);
            }
        });
    });

    // Listen to villages
    const vq = query(collection(db, 'villages'), orderBy('name'));
    villageUnsubscribe = onSnapshot(vq, (snapshot) => {
        document.getElementById('stat-total-villages').textContent = snapshot.size;
        villageListEl.innerHTML = '';
        allVillagesCache = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const vObj = { id: docSnap.id, name: data.name };
            allVillagesCache.push(vObj);

            const div = document.createElement('div');
            div.className = 'patient-card'; // Consistent professional design
            div.innerHTML = `
                <div class="card-header">
                    <h3 style="margin:0;">${escapeHTML(data.name)}</h3>
                </div>
                <div class="card-body" style="margin: 10px 0;">
                    <div><strong>Village ID:</strong> ${docSnap.id}</div>
                    <div style="margin-top:5px;"><strong>Assigned Users:</strong></div>
                    <div style="font-size: 0.9rem; color: #555; margin-top:2px;">
                        ${data.assigned_users && data.assigned_users.length > 0
                    ? data.assigned_users.join(', ')
                    : '<em>No individual assignments</em>'}
                    </div>
                </div>
            `;
            villageListEl.appendChild(div);
        });

        // Populate Admin dropdown and filters when cache is updated
        setupFormVillageInput();
    });

    // Listen to access requests
    const rq = query(collection(db, 'access_requests'), where('status', '==', 'pending'));
    if (accessRequestsUnsubscribe) accessRequestsUnsubscribe();
    accessRequestsUnsubscribe = onSnapshot(rq, (snapshot) => {
        villageRequestsList.innerHTML = '';
        if (snapshot.empty) villageRequestsList.innerHTML = '<p>No pending requests.</p>';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'patient-card'; // Consistent professional design
            div.innerHTML = `
                <div class="card-header">
                    <h3 style="margin:0; font-size: 1.1rem;">Verification Requested</h3>
                </div>
                <div class="card-body" style="margin: 10px 0;">
                    <div style="margin-bottom: 5px;"><strong>User:</strong> ${escapeHTML(data.user_email)}</div>
                    <div><strong>Village:</strong> ${escapeHTML(data.village)}</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button class="btn-sm" onclick="approveAccess('${docSnap.id}', '${data.user_email}', '${data.village}')">Grant Access</button>
                    <button class="secondary btn-sm" onclick="rejectAccess('${docSnap.id}')">Decline</button>
                </div>
            `;
            villageRequestsList.appendChild(div);
        });
    });

    // Quick listen to total patients for stat
    onSnapshot(query(collection(db, 'patients')), (snap) => {
        document.getElementById('stat-total-patients').textContent = snap.size;
    });
}

// User-specific setup logic
function userSetup() {
    // Listen to global villages for the Request Access dropdown
    const vq = query(collection(db, 'villages'), orderBy('name'));
    if (villageUnsubscribe) villageUnsubscribe();
    villageUnsubscribe = onSnapshot(vq, (snapshot) => {
        requestVillageSelect.innerHTML = '<option value="">Select a village...</option>';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Check if name exists in assigned list objects
            if (!userAssignedVillages.some(v => v.name === data.name)) {
                const opt = document.createElement('option');
                opt.value = data.name;
                opt.textContent = data.name;
                requestVillageSelect.appendChild(opt);
            }
        });
    });

    // Listen to my requests
    const rq = query(collection(db, 'access_requests'), where('user_email', '==', currentUser.email));
    if (accessRequestsUnsubscribe) accessRequestsUnsubscribe();
    accessRequestsUnsubscribe = onSnapshot(rq, (snapshot) => {
        myRequestsList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const requestedAt = data.created_at ? new Date(data.created_at.toDate()).toLocaleDateString() : 'N/A';
            const approvedAt = data.approved_at ? new Date(data.approved_at.toDate()).toLocaleDateString() : '';

            const div = document.createElement('div');
            div.className = 'request-card';
            div.innerHTML = `
                <div>Village: <strong>${escapeHTML(data.village)}</strong></div>
                <div>Status: <strong class="source-tag" style="padding:2px 6px;">${escapeHTML(data.status).toUpperCase()}</strong></div>
                <div style="font-size:0.8rem; color:#888; margin-top:5px;">
                    Requested: ${requestedAt}
                    ${approvedAt ? ` | Approved: ${approvedAt}` : ''}
                </div>
            `;
            myRequestsList.appendChild(div);
        });
    });

    submitRequestBtn.onclick = async () => {
        const v = requestVillageSelect.value;
        if (!v) return;
        try {
            await addDoc(collection(db, 'access_requests'), {
                user_email: currentUser.email,
                village: v,
                status: 'pending',
                created_at: serverTimestamp()
            });
            document.getElementById('request-msg').textContent = 'Request submitted!';
            document.getElementById('request-msg').className = 'success';
            setTimeout(() => { document.getElementById('request-msg').textContent = ''; }, 3000);
        } catch (e) {
            document.getElementById('request-msg').textContent = e.message;
            document.getElementById('request-msg').className = 'error';
        }
    };

    activeVillageSelect.onchange = (e) => {
        const selectedName = e.target.value;
        activeVillage = userAssignedVillages.find(v => v.name === selectedName) || null;
        if (activeVillage) {
            formVillageBanner.style.display = 'flex';
            formTargetVillage.textContent = activeVillage.name;
        } else {
            formVillageBanner.style.display = 'none';
        }
    };
}

villageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vName = document.getElementById('village_name').value.trim();

    try {
        await addDoc(collection(db, 'villages'), {
            name: vName,
            assigned_users: [], // Array to hold multiple emails
            created_at: serverTimestamp()
        });
        showAdminMsg('Village created successfully!', 'success');
        villageForm.reset();
    } catch (err) {
        showAdminMsg(err.message, 'error');
    }
});

function showAdminMsg(msg, type) {
    adminMsg.textContent = msg;
    adminMsg.className = type;
    setTimeout(() => { adminMsg.textContent = ''; adminMsg.className = ''; }, 3000);
}

// Global scope functions for inline onclick Handlers
// Helper to fetch and render user-specific village tags with granular revoke
async function fetchUserVillages(email, containerId) {
    const container = document.getElementById(containerId);
    const vq = query(collection(db, 'villages'));
    const vSnap = await getDocs(vq);
    let html = '';
    vSnap.forEach(vDoc => {
        const vData = vDoc.data();
        if (vData.assigned_users && vData.assigned_users.includes(email)) {
            html += `<span class="source-tag" style="background:#e3f2fd; color:#1565c0; display:flex; align-items:center; gap:5px;">
                ${escapeHTML(vData.name)}
                <span onclick="revokeVillageFromUser('${escapeHTML(vData.name)}', '${escapeHTML(email)}')" style="cursor:pointer; font-weight:bold; color:#d32f2f;">&times;</span>
            </span>`;
        }
    });
    container.innerHTML = html || 'No specific villages assigned.';
}

window.revokeVillageFromUser = async function (villageName, userEmail) {
    if (!confirm(`Revoke access to ${villageName} for ${userEmail}?`)) return;
    try {
        const vq = query(collection(db, 'villages'), where('name', '==', villageName));
        const snapshot = await getDocs(vq);
        snapshot.forEach(async (docSnap) => {
            const currentUsers = docSnap.data().assigned_users || [];
            const newUsers = currentUsers.filter(e => e !== userEmail);
            await setDoc(doc(db, 'villages', docSnap.id), { assigned_users: newUsers }, { merge: true });
        });
        showAdminMsg(`Access to ${villageName} revoked for ${userEmail}`, 'success');
    } catch (e) {
        showAdminMsg(e.message, 'error');
    }
};

window.approveUser = async function (uid) {
    try {
        await setDoc(doc(db, 'users', uid), {
            status: 'approved',
            approved_at: serverTimestamp()
        }, { merge: true });
        showAdminMsg('User approved!', 'success');
    } catch (e) {
        showAdminMsg(e.message, 'error');
    }
};

window.revokeUser = async function (uid, email) {
    try {
        await setDoc(doc(db, 'users', uid), { status: 'pending' }, { merge: true });

        // 1. Remove from all village assignments 
        const vq = query(collection(db, 'villages'));
        const vSnap = await getDocs(vq);
        vSnap.forEach(async (dSnap) => {
            const assigned = dSnap.data().assigned_users || [];
            if (assigned.includes(email)) {
                const newAssigned = assigned.filter(e => e !== email);
                await setDoc(doc(db, 'villages', dSnap.id), { assigned_users: newAssigned }, { merge: true });
            }
        });

        // 2. Delete all access requests for this user
        const aq = query(collection(db, 'access_requests'), where('user_email', '==', email));
        const aSnap = await getDocs(aq);
        aSnap.forEach(async (aDoc) => {
            await deleteDoc(doc(db, 'access_requests', aDoc.id));
        });

        showAdminMsg('User access revoked and returned to pending limit.', 'success');
    } catch (e) {
        showAdminMsg(e.message, 'error');
    }
};

window.approveAccess = async function (reqId, userEmail, villageName) {
    try {
        // 1. Mark request as approved
        await setDoc(doc(db, 'access_requests', reqId), {
            status: 'approved',
            approved_at: serverTimestamp()
        }, { merge: true });

        // 2. Find village doc and append user
        const vq = query(collection(db, 'villages'), where('name', '==', villageName));
        // wait no, we need getDocs for query
        getDocs(vq).then(snapshot => {
            snapshot.forEach(async (docSnap) => {
                const currentUsers = docSnap.data().assigned_users || [];
                if (!currentUsers.includes(userEmail)) {
                    currentUsers.push(userEmail);
                    await setDoc(doc(db, 'villages', docSnap.id), { assigned_users: currentUsers }, { merge: true });
                }
            });
        });
        showAdminMsg('Request approved and village assigned', 'success');
    } catch (e) {
        showAdminMsg(e.message, 'error');
    }
}

window.rejectAccess = async function (reqId) {
    try {
        await setDoc(doc(db, 'access_requests', reqId), { status: 'rejected' }, { merge: true });
        showAdminMsg('Request rejected', 'success');
    } catch (e) {
        showAdminMsg(e.message, 'error');
    }
}

async function fetchAssignedVillages(user) {
    userAssignedVillages = [];
    const q = query(collection(db, 'villages'), where('assigned_users', 'array-contains', user.email));

    // Proper realtime listener for assigned villages to restrict UI dynamically
    onSnapshot(q, (snapshot) => {
        userAssignedVillages = [];
        snapshot.forEach(docSnap => {
            userAssignedVillages.push({
                id: docSnap.id,
                name: docSnap.data().name,
                assigned_at: docSnap.data().assigned_at // Optional if we store it there
            });
        });

        setupFormVillageInput(); // Re-render dropdown 
        setupPatientListener(); // Re-render patient list based on new villages

        if (userRole !== 'admin') {
            activeVillageSelect.innerHTML = '<option value="">Select Village...</option>';
            userVillageStats.innerHTML = '';
            userAssignedVillages.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.name;
                opt.textContent = v.name;
                activeVillageSelect.appendChild(opt);

                // Add stat card
                const approvedAt = v.assigned_at ? new Date(v.assigned_at.toDate()).toLocaleDateString() : 'N/A';
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.id = `stat-card-${v.name.replace(/\s+/g, '-')}`;
                card.innerHTML = `
                    <h3>${escapeHTML(v.name)}</h3>
                    <div class="value" id="val-${v.name.replace(/\s+/g, '-')}">0</div>
                    <div style="font-size: 0.75rem; color: #888; margin-top: 8px;">Access Granted: ${approvedAt}</div>
                `;
                userVillageStats.appendChild(card);
            });
            // Update counts natively
            updateUserDashboardStats();
        }
    });
}

function updateUserDashboardStats() {
    // Tally up from allPatients list
    const counts = {};
    allPatients.forEach(p => {
        if (p.village) {
            counts[p.village] = (counts[p.village] || 0) + 1;
        }
    });

    userAssignedVillages.forEach(v => {
        const el = document.getElementById(`val-${v.name.replace(/\s+/g, '-')}`);
        if (el) el.textContent = counts[v.name] || 0;
    });
}

function setupFormVillageInput() {
    const container = document.getElementById('village-input-container');
    container.innerHTML = '';

    const filterSelect = document.getElementById('filter-village-select');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Villages</option>';
    }

    if (userRole === 'admin') {
        const select = document.createElement('select');
        select.id = 'village';
        select.required = true;
        select.innerHTML = '<option value="">Select Village (Override)</option>';
        allVillagesCache.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.name;
            opt.textContent = v.name;
            select.appendChild(opt);

            if (filterSelect) {
                const fOpt = document.createElement('option');
                fOpt.value = v.name;
                fOpt.textContent = v.name;
                filterSelect.appendChild(fOpt);
            }
        });
        container.appendChild(select);
    } else {
        const select = document.createElement('select');
        select.id = 'village';
        select.required = true;
        select.innerHTML = '<option value="">Select Village</option>';
        userAssignedVillages.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.name;
            opt.textContent = v.name;
            select.appendChild(opt);

            if (filterSelect) {
                const fOpt = document.createElement('option');
                fOpt.value = v.name;
                fOpt.textContent = v.name;
                filterSelect.appendChild(fOpt);
            }
        });
        container.appendChild(select);
    }
}

function renderPatients(patients) {
    patientListEl.innerHTML = '';
    patients.forEach(p => {
        const div = document.createElement('div');
        div.className = 'patient-card';
        const dateStr = p.updated_at ? new Date(p.client_timestamp || p.updated_at.toDate()).toLocaleString() : 'Pending...';

        div.innerHTML = `
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
           <h3 style="margin: 0; color: var(--primary);">${escapeHTML(p.name)}</h3>
           <div style="font-size: 0.9rem; color: #666; margin-top: 4px;">
              ${escapeHTML(p.gender)} | DOB: ${escapeHTML(p.dob)}
           </div>
        </div>
        <div class="source-tag" style="background: #e0e0e0; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">
           ${p.source}
        </div>
      </div>
      
      <div class="card-body" style="margin: 12px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.95rem;">
        <div><strong>Mobile:</strong> ${escapeHTML(p.mobile)}</div>
        <div><strong>Village:</strong> ${escapeHTML(p.village)}</div>
        <div><strong>Sector:</strong> ${escapeHTML(p.sector) || 'N/A'}</div>
        <div><strong>Income:</strong> ₹${escapeHTML(p.annual_income) || '0'}</div>
      </div>

      <div class="meta" style="font-size: 0.8rem; color: #888; border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px;">
        Last Updated: ${dateStr}
      </div>
    `;

        // Bind Read View Action
        div.style.cursor = 'pointer';
        div.onclick = () => {
            showReadModal(p);
        };

        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '15px';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '8px';
        btnContainer.style.flexWrap = 'wrap';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-sm';
        editBtn.textContent = 'Edit Record';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editPatient(p);
        };
        btnContainer.appendChild(editBtn);

        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'btn-sm';
        pdfBtn.textContent = 'Report PDF';
        pdfBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.generatePDF) {
                window.generatePDF(p);
            }
        };
        btnContainer.appendChild(pdfBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'secondary btn-sm';
        delBtn.textContent = 'Delete';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to permanently delete ${p.name}'s record?`)) {
                deleteDoc(doc(db, "patients", p.id))
                    .then(() => showMsg('Record deleted.', 'success'))
                    .catch(e => showMsg(e.message, 'error'));
            }
        };
        btnContainer.appendChild(delBtn);

        div.appendChild(btnContainer);
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
    if (!validateStep(currentStep)) return;

    const docId = document.getElementById('docId').value;
    const patientData = {
        name: document.getElementById('name').value.trim(),
        mobile: document.getElementById('mobile').value.trim(),
        email: document.getElementById('patient_email').value.trim(),
        dob: document.getElementById('dob').value,
        caste: document.getElementById('caste').value.trim(),
        gender: document.getElementById('gender').value,
        marital_status: document.getElementById('marital_status').value,

        family_members: getFamilyData(),

        chronic_disease: document.getElementById('chronic_disease').value.trim(),
        vaccination_status: document.getElementById('vaccination_status').value.trim(),
        nearest_healthcare: document.getElementById('nearest_healthcare').value.trim(),

        village: activeVillage || document.getElementById('village').value.trim(),
        gram_panchayat: document.getElementById('gram_panchayat').value.trim(),
        taluk: document.getElementById('taluk').value.trim(),
        district: document.getElementById('district').value.trim(),
        state: document.getElementById('state').value.trim(),
        landmark: document.getElementById('landmark').value.trim(),
        pincode: document.getElementById('pincode').value.trim(),

        is_employed: document.getElementById('is_employed').value,
        sector: document.getElementById('sector').value,
        owns_land: document.getElementById('owns_land').value,
        acres: document.getElementById('acres').value,
        sown: document.getElementById('sown').value.trim(),
        expected_yield: document.getElementById('expected_yield').value.trim(),
        livestocks: document.getElementById('livestocks').value.trim(),

        annual_income: document.getElementById('annual_income').value.trim(),
        tax_regime: document.getElementById('tax_regime').value,

        road_access: document.getElementById('road_access').value,
        internet: document.getElementById('internet').value,
        public_transport: document.getElementById('transport').value,
        distance_hospital: document.getElementById('distance_hospital').value || '',
        distance_school: document.getElementById('distance_school').value || '',
        distance_market: document.getElementById('distance_market').value || '',

        highest_qual: document.getElementById('qualification').value.trim(),
        children_school: document.getElementById('children_school').value,
        school_type: document.getElementById('school_type').value,
        school_dropouts: document.getElementById('dropouts').value,

        assigned_by_email: currentUser.email, // Assign to current user
        village_id: activeVillage ? activeVillage.id : (allVillagesCache.find(v => v.name === document.getElementById('village').value.trim())?.id || ''),
        updated_at: serverTimestamp(),
        // Keep a client-side timestamp to perform our manual Last Write Wins check
        client_timestamp: Date.now()
    };

    try {
        if (docId) {
            const patientRef = doc(db, "patients", docId);
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
            await addDoc(collection(db, "patients"), patientData);
            showMsg('New patient added successfully!', 'success');
        }
        clearForm();

        if (document.getElementById('general-modal').style.display === 'flex') {
            closeModal();
        } else {
            // Reset steps back to 1
            currentStep = 1;
            document.querySelectorAll('.step.completed').forEach(el => el.classList.remove('completed'));
            changeStep(0); // Applies initial logic
        }

    } catch (error) {
        console.error("Error writing document: ", error);
        showMsg('Error saving record. Check console for details.', 'error');
    }
});

function editPatient(p) {
    // Reset steps to 1 before populating
    currentStep = 1;
    document.querySelectorAll('.step.completed').forEach(el => el.classList.remove('completed'));
    document.querySelectorAll('.step-indicator .step').forEach(el => el.classList.remove('active'));
    document.getElementById('step1-indicator').classList.add('active');
    document.querySelectorAll('.form-step').forEach(el => el.style.display = 'none');
    document.getElementById('step-1').style.display = 'block';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'inline-block';
    submitBtn.style.display = 'none';

    document.getElementById('docId').value = p.id;
    document.getElementById('name').value = p.name || '';
    document.getElementById('mobile').value = p.mobile || '';
    document.getElementById('patient_email').value = p.email || '';
    document.getElementById('dob').value = p.dob || '';
    document.getElementById('caste').value = p.caste || '';
    document.getElementById('gender').value = p.gender || '';
    document.getElementById('marital_status').value = p.marital_status || '';

    // Family Details
    familyContainer.innerHTML = '';
    memberCount = 0;
    if (p.family_members) {
        p.family_members.forEach(m => addFamilyMember(m));
    }

    document.getElementById('chronic_disease').value = p.chronic_disease || '';
    document.getElementById('vaccination_status').value = p.vaccination_status || '';
    document.getElementById('nearest_healthcare').value = p.nearest_healthcare || '';

    document.getElementById('village').value = p.village || '';
    document.getElementById('gram_panchayat').value = p.gram_panchayat || '';
    document.getElementById('taluk').value = p.taluk || '';
    document.getElementById('district').value = p.district || '';
    document.getElementById('state').value = p.state || '';
    document.getElementById('landmark').value = p.landmark || '';
    document.getElementById('pincode').value = p.pincode || '';

    document.getElementById('is_employed').value = p.is_employed || '';
    document.getElementById('is_employed').dispatchEvent(new Event('change'));

    document.getElementById('sector').value = p.sector || '';
    document.getElementById('sector').dispatchEvent(new Event('change'));

    document.getElementById('owns_land').value = p.owns_land || 'No';
    document.getElementById('owns_land').dispatchEvent(new Event('change'));

    document.getElementById('acres').value = p.acres || '';
    document.getElementById('sown').value = p.sown || '';
    document.getElementById('expected_yield').value = p.expected_yield || '';
    document.getElementById('livestocks').value = p.livestocks || '';

    // New taxation demographic fields
    if (document.getElementById('annual_income')) document.getElementById('annual_income').value = p.annual_income || '';
    if (document.getElementById('tax_regime')) document.getElementById('tax_regime').value = p.tax_regime || '';

    document.getElementById('road_access').value = p.road_access || '';
    document.getElementById('internet').value = p.internet || '';
    document.getElementById('transport').value = p.public_transport || '';
    if (document.getElementById('distance_hospital')) document.getElementById('distance_hospital').value = p.distance_hospital || '';
    if (document.getElementById('distance_school')) document.getElementById('distance_school').value = p.distance_school || '';
    if (document.getElementById('distance_market')) document.getElementById('distance_market').value = p.distance_market || '';

    document.getElementById('qualification').value = p.highest_qual || '';
    document.getElementById('children_school').value = p.children_school || '';
    document.getElementById('children_school').dispatchEvent(new Event('change'));
    document.getElementById('school_type').value = p.school_type || '';
    document.getElementById('dropouts').value = p.school_dropouts || '';

    const formSection = document.getElementById('patient-form-section');
    document.getElementById('modal-body-wrapper').appendChild(formSection);
    document.getElementById('general-modal').style.display = 'flex';
    formVillageBanner.style.display = 'none';
}

clearBtn.addEventListener('click', () => {
    clearForm();
    if (document.getElementById('general-modal').style.display === 'flex') {
        closeModal();
    }
});

function closeModal() {
    document.getElementById('general-modal').style.display = 'none';

    // Repark the form back where it belongs
    const formSection = document.getElementById('patient-form-section');
    document.getElementById('panel-add-data').appendChild(formSection);

    // Repark the read-view back where it belongs 
    const readView = document.getElementById('patient-read-view');
    readView.style.display = 'none';
    document.body.appendChild(readView);

    if (activeVillage) {
        formVillageBanner.style.display = 'flex';
    }
    clearForm();
}
document.getElementById('close-modal-btn').addEventListener('click', closeModal);

function showReadModal(p) {
    const wrapper = document.getElementById('modal-body-wrapper');
    const readView = document.getElementById('patient-read-view');
    const grid = document.getElementById('read-grid');

    document.getElementById('read-title').textContent = `${escapeHTML(p.name)}'s Profile`;
    grid.innerHTML = '';

    const addItem = (label, val) => {
        grid.innerHTML += `<div><strong>${label}:</strong><br/>${escapeHTML(val) || '-'}</div>`;
    };

    addItem('Mobile', p.mobile);
    addItem('Email', p.email);
    addItem('DOB', p.dob);
    addItem('Caste', p.caste);
    addItem('Gender', p.gender);
    addItem('Marital Status', p.marital_status);

    // Family length
    addItem('Family Members Count', (p.family_members || []).length);
    if (p.family_members && p.family_members.length > 0) {
        const addHTMLItem = (label, val) => {
            grid.innerHTML += `<div><strong>${label}:</strong><br/>${val || '-'}</div>`;
        };
        const famStr = p.family_members.map(fm => `${escapeHTML(fm.name)} (${escapeHTML(fm.relation)})<br/>${escapeHTML(fm.gender)}, ${escapeHTML(fm.marital)}, ${escapeHTML(fm.employment)}`).join('<br/><br/>');
        addHTMLItem('Family Details', famStr);
    }

    addItem('Chronic Diseases', p.chronic_disease);
    addItem('Vaccinations', p.vaccination_status);
    addItem('Healthcare Access', p.nearest_healthcare);

    addItem('Village', p.village);
    addItem('Gram Panchayat', p.gram_panchayat);
    addItem('Location', `${escapeHTML(p.taluk)}, ${escapeHTML(p.district)}, ${escapeHTML(p.state)}`);

    addItem('Employment', p.is_employed);
    addItem('Sector', p.sector);
    addItem('Annual Income (₹)', p.annual_income);
    addItem('Tax Regime', p.tax_regime);

    addItem('Highest Qual.', p.highest_qual);

    readView.style.display = 'block';
    wrapper.appendChild(readView);
    document.getElementById('general-modal').style.display = 'flex';
}

function clearForm() {
    document.getElementById('docId').value = '';
    form.reset();
    familyContainer.innerHTML = '';
    memberCount = 0;

    // Trigger changes to hide dynamic fields
    document.getElementById('is_employed').dispatchEvent(new Event('change'));
    document.getElementById('sector').dispatchEvent(new Event('change'));
    document.getElementById('owns_land').dispatchEvent(new Event('change'));
    document.getElementById('children_school').dispatchEvent(new Event('change'));

    currentStep = 1;
    document.querySelectorAll('.step.completed').forEach(el => el.classList.remove('completed'));
    changeStep(0);
}

function showMsg(msg, type) {
    msgEl.textContent = msg;
    msgEl.className = type;
    setTimeout(() => { msgEl.textContent = ''; msgEl.className = ''; }, 3000);
}

// Search functionality
function applyPatientFilters() {
    const term = searchInput.value.toLowerCase();
    const filterSelect = document.getElementById('filter-village-select');
    const villageFilter = filterSelect ? filterSelect.value : '';

    const filtered = allPatients.filter(p => {
        let matchesSearch = true;
        let matchesVillage = true;

        if (term) {
            const nameMatch = p.name ? p.name.toLowerCase().includes(term) : false;
            const mobileMatch = p.mobile ? String(p.mobile).includes(term) : false;
            const villageMatch = p.village ? p.village.toLowerCase().includes(term) : false;
            matchesSearch = nameMatch || mobileMatch || villageMatch;
        }

        if (villageFilter) {
            matchesVillage = p.village === villageFilter;
        }

        return matchesSearch && matchesVillage;
    });

    renderPatients(filtered);
}

searchInput.addEventListener('input', applyPatientFilters);

const filterVillageSelect = document.getElementById('filter-village-select');
if (filterVillageSelect) {
    filterVillageSelect.addEventListener('change', applyPatientFilters);
}

// PDF Generation
window.generatePDF = function (p) {
    if (!window.jspdf) {
        showMsg("PDF Library not loaded.", "error"); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Gram-Sampark Villager Record", 105, 20, null, null, "center");

    doc.setFontSize(12);
    let y = 35;
    const addLine = (label, value) => {
        // Simple word wrap
        const str = `${label}: ${value !== undefined && value !== null && value !== '' ? value : 'N/A'}`;
        const lines = doc.splitTextToSize(str, 180);
        doc.text(lines, 14, y);
        y += (lines.length * 6) + 2;
        if (y > 275) { doc.addPage(); y = 20; }
    };

    const addHeader = (title) => {
        y += 4;
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(title, 14, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        y += 8;
    }

    addHeader("1. Personal Details");
    addLine("Name", p.name);
    addLine("Mobile", p.mobile);
    addLine("Email", p.email);
    addLine("Date of Birth", p.dob);
    addLine("Caste", p.caste);
    addLine("Gender", p.gender);
    addLine("Marital Status", p.marital_status);

    if (p.family_members && p.family_members.length > 0) {
        addHeader("1.1 Family Members");
        p.family_members.forEach((fm, idx) => {
            addLine(`Member ${idx + 1}`, `${fm.name} (${fm.relation}) - ${fm.gender}, ${fm.marital}, ${fm.employment}`);
        });
    }

    addHeader("2. Health Profile");
    addLine("Chronic Diseases", p.chronic_disease);
    addLine("Vaccination Status", p.vaccination_status);
    addLine("Nearest Healthcare Access", p.nearest_healthcare);

    addHeader("3. Residency details");
    addLine("Village", p.village);
    addLine("Gram Panchayat", p.gram_panchayat);
    addLine("Taluk", p.taluk);
    addLine("District", p.district);
    addLine("State", p.state);

    addHeader("4. Occupation details");
    addLine("Employment Status", p.is_employed);
    addLine("Sector", p.sector);

    if (p.sector === "Farm" && p.farming_data) {
        addLine("Farming Target Area", p.farming_data.target_area);
        addLine("Main Crop Yield Size", p.farming_data.crop_yield_size);
        addLine("Livestock Inventory", p.farming_data.livestock_inventory);
    }

    addHeader("5. Regional Economy & Environment");
    addLine("Land Ownership", p.owns_land);
    if (p.owns_land === "Yes") {
        addLine("Total Land Assessed", p.land_data?.total_land);
    }
    addLine("Internet Accessibility", p.internet_access);
    addLine("Distance to Nearest City", p.distance_city);
    addLine("Distance to Hospital", p.distance_hospital);
    addLine("Distance to Market", p.distance_market);
    addLine("Public Transport Route", p.public_transport);

    addHeader("6. Taxation & Revenue");
    addLine("Annual Income", p.annual_income ? `Rs. ${p.annual_income}` : "");
    addLine("Tax Regime", p.tax_regime);

    addHeader("7. Education Details");
    addLine("Highest Qualification", p.highest_qual);
    addLine("Children pursuing schooling", p.children_school);
    if (p.children_school === "Yes" && p.education_data) {
        addLine("School Structure", p.education_data.school_type);
        addLine("Instances of dropouts", p.education_data.school_dropouts);
    }

    y = Math.max(y + 15, 250);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Digitally generated by Gram-Sampark PDF Utility`, 14, y);
    doc.text(`Authorized by: ${currentUser ? currentUser.email : 'System'}`, 14, y + 5);
    doc.text(`Timestamp: ${new Date().toLocaleString()}`, 14, y + 10);

    doc.save(`GramSampark_${p.name.replace(/\s+/g, '_')}.pdf`);
}
