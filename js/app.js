/**
 * app.js - Lógica Principal (Versión con máxima compatibilidad)
 */

let db = null;
let auth = null;

// Inicialización de Firebase (desde variables globales)
function initializeFirebase() {
    try {
        if (!window.firebaseConfig || window.firebaseConfig.apiKey === "TU_API_KEY") {
            console.warn("Firebase no configurado. Usando modo offline.");
            return;
        }

        const app = window.firebase.app.initializeApp(window.firebaseConfig);
        db = window.firebase.firestore.getFirestore(app);
        auth = window.firebase.auth.getAuth(app);

        // Inyectar instancias en DataManager y Auth
        window.DataManager.init(db);
        window.Auth.init(auth, db);

        console.log("Firebase inicializado correctamente.");
    } catch (e) {
        console.error("Error al inicializar Firebase:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    initApp();
});

let currentUser = null;

function initApp() {
    currentUser = window.Auth.getCurrentUser();

    if (currentUser) {
        showView(currentUser.role === 'admin' ? 'admin-view' : 'user-view');
        updateUI();
    } else {
        showView('login-view');
    }

    setupEventListeners();

    // Listener de Auth de Firebase (opcional por si se loguea en otra pestaña)
    if (auth) {
        window.firebase.auth.onAuthStateChanged(auth, async (user) => {
            if (user && !currentUser) {
                // Si Firebase detecta sesión pero no hay en localStorage, refrescamos
                window.location.reload();
            }
        });
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
}

function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

async function updateUI() {
    if (!currentUser) return;

    const config = await window.DataManager.getConfig();
    const childrenCount = currentUser.children ? currentUser.children.split(',').length : 1;

    if (currentUser.role === 'admin') {
        renderAdminDashboard();
        renderAdminUsers();
        const athInput = document.getElementById('config-athletics');
        const socInput = document.getElementById('config-social');
        if (athInput) athInput.value = config.athleticsFee;
        if (socInput) socInput.value = config.socialFee;
        updateConfigPreview();

        window.DataManager.subscribeToPayments((payments) => {
            renderAdminDashboard(payments);
        });
    } else {
        renderUserDashboard();
        const nameDisp = document.getElementById('user-display-name');
        if (nameDisp) nameDisp.innerText = currentUser.name;

        const athleticsTotal = config.athleticsFee * childrenCount;
        const finalTotal = athleticsTotal + config.socialFee;

        document.getElementById('fee-athletics').innerText = `$ ${athleticsTotal.toLocaleString('es-AR')}`;
        document.getElementById('fee-social').innerText = `$ ${config.socialFee.toLocaleString('es-AR')}`;
        document.getElementById('fee-total').innerText = `$ ${finalTotal.toLocaleString('es-AR')}`;

        const amountInput = document.getElementById('payment-amount');
        if (amountInput) amountInput.value = finalTotal;

        // Prepare children assignment in modal
        const childrenContainer = document.getElementById('children-assignment');
        if (childrenContainer) {
            if (currentUser.children) {
                const kids = currentUser.children.split(',').map(k => k.trim());
                childrenContainer.innerHTML = '<label>Hijos incluidos en este pago:</label>';
                kids.forEach(kid => {
                    childrenContainer.innerHTML += `
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
                            <input type="checkbox" checked disabled> <span>${kid}</span>
                        </div>
                    `;
                });
                const detailText = document.getElementById('payment-detail-text');
                if (detailText) detailText.innerText = `(${kids.length} hijo/a: $${athleticsTotal.toLocaleString('es-AR')} + Cuota Social: $${config.socialFee.toLocaleString('es-AR')})`;
            } else {
                childrenContainer.innerHTML = '';
            }
        }
    }
}

async function renderUserDashboard() {
    if (!currentUser) return;
    const payments = await window.DataManager.getPaymentsByUser(currentUser.id);
    const tbody = document.querySelector('#payments-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };

    payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.month}</td>
            <td>${p.date}</td>
            <td>$ ${p.amount.toLocaleString('es-AR')}</td>
            <td>${p.childrenNames || 'Hijo/a'}</td>
            <td><span class="badge badge-${p.status}">${statusMap[p.status] || p.status}</span></td>
            <td>
                ${p.receiptURL ? `<button class="btn-text btn-view-photo" data-id="${p.id}">Ver Foto</button>` : '<span class="text-muted">Sin foto</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-view-photo').forEach(btn => {
        btn.addEventListener('click', () => {
            const payment = payments.find(pay => pay.id === btn.dataset.id);
            if (payment && payment.receiptURL) openImageModal(payment.receiptURL);
        });
    });
}

async function renderAdminUsers() {
    const users = await window.DataManager.getUsers();
    const tbody = document.querySelector('#admin-users-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${u.name}</b></td>
            <td>${u.email || u.id}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-approved' : 'badge-pending'}">${u.role.toUpperCase()}</span></td>
            <td>
                <button class="btn-text" onclick="alert('Funcionalidad de edición planeada para futura versión: '+ '${u.id}')">Editar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openImageModal(url) {
    const win = window.open("");
    win.document.write(`<body style="margin:0; display:flex; justify-content:center; background:#000;"><img src="${url}" style="max-height:100vh; width:auto;"></body>`);
}

async function renderAdminDashboard(manualPayments = null) {
    const payments = manualPayments || await window.DataManager.getPayments();
    const tbody = document.querySelector('#admin-payments-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };

    payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.date}</td>
            <td>${p.userName || 'Usuario'}</td>
            <td>${p.month}</td>
            <td>$ ${p.amount.toLocaleString('es-AR')}</td>
            <td>
                ${p.receiptURL ? `<a href="#" class="btn-view-admin-photo link-receipt" data-id="${p.id}"><i class="fas fa-image"></i> Ver</a>` : '<span class="text-muted">Sin archivo</span>'}
            </td>
            <td><span class="badge badge-${p.status}">${statusMap[p.status] || p.status}</span></td>
            <td>
                ${p.status === 'pending' ? `
                    <button class="btn-action approve" data-id="${p.id}"><i class="fas fa-check"></i></button>
                    <button class="btn-action reject" data-id="${p.id}"><i class="fas fa-times"></i></button>
                ` : '<span class="text-muted">Listo</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-view-admin-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const payment = payments.find(pay => pay.id === btn.dataset.id);
            if (payment && payment.receiptURL) openImageModal(payment.receiptURL);
        });
    });

    tbody.querySelectorAll('.btn-action.approve').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            btn.disabled = true;
            await window.DataManager.updatePaymentStatus(id, 'approved');
            toast('Pago aprobado');
            renderAdminDashboard(); // Refresco inmediato
        });
    });
    tbody.querySelectorAll('.btn-action.reject').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            btn.disabled = true;
            await window.DataManager.updatePaymentStatus(id, 'rejected');
            toast('Pago rechazado', 'error');
            renderAdminDashboard(); // Refresco inmediato
        });
    });
}

function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userVal = document.getElementById('username').value;
            const passVal = document.getElementById('password').value;
            const btn = e.target.querySelector('button');

            btn.innerText = "Entrando...";
            btn.disabled = true;

            const res = await window.Auth.login(userVal, passVal);
            if (res.success) {
                currentUser = res.user;
                showView(currentUser.role === 'admin' ? 'admin-view' : 'user-view');
                updateUI();
                toast('¡Bienvenido!');
            } else {
                alert(res.message);
                btn.innerText = "Iniciar Sesión";
                btn.disabled = false;
            }
        });
    }

    const logoutBtns = ['logout-btn', 'admin-logout-btn'];
    logoutBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => window.Auth.logout());
    });

    const reportBtn = document.getElementById('btn-report-payment');
    const modal = document.getElementById('payment-modal');
    if (reportBtn && modal) {
        reportBtn.addEventListener('click', () => modal.classList.add('active'));
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
    });

    const fileIn = document.getElementById('payment-receipt');
    const zone = document.getElementById('file-upload-zone');
    if (zone && fileIn) {
        zone.addEventListener('click', () => fileIn.click());
        fileIn.addEventListener('change', (e) => {
            if (e.target.files[0]) document.getElementById('file-name').innerText = e.target.files[0].name;
        });
    }

    const reportForm = document.getElementById('payment-report-form');
    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Enviando...';

            try {
                const config = await window.DataManager.getConfig();
                const file = document.getElementById('payment-receipt').files[0];
                let receiptURL = file ? await window.DataManager.fileToBase64(file) : null;

                const payment = {
                    userId: currentUser.id,
                    userName: currentUser.name,
                    childrenNames: currentUser.children || 'Hijo/a',
                    month: document.getElementById('payment-month').value,
                    amount: parseInt(document.getElementById('payment-amount').value),
                    status: 'pending',
                    receiptURL: receiptURL,
                    timestamp: Date.now()
                };

                await window.DataManager.addPayment(payment);
                modal.classList.remove('active');
                toast('Pago informado');
                e.target.reset();
                document.getElementById('file-name').innerText = '';
                renderUserDashboard();
            } catch (err) {
                toast('Error al enviar', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Enviar Reporte';
            }
        });
    }

    // Modal Usuario
    const userModal = document.getElementById('user-modal');
    const btnAddUser = document.getElementById('btn-add-user');
    if (btnAddUser) {
        btnAddUser.addEventListener('click', () => userModal.classList.add('active'));
    }

    const newUserForm = document.getElementById('new-user-form');
    if (newUserForm) {
        newUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Creando...';

            try {
                const name = document.getElementById('reg-name').value;
                const emailRaw = document.getElementById('reg-email').value;
                const kids = document.getElementById('reg-children').value;
                const pass = document.getElementById('reg-pass').value;
                const role = document.getElementById('reg-role').value;
                const email = emailRaw.includes('@') ? emailRaw : `${emailRaw}@correcaminos.com`;

                const userId = email.replace(/[^a-zA-Z0-9]/g, '_');

                await window.DataManager.saveUser(userId, {
                    name: name,
                    email: email,
                    username: emailRaw,
                    children: kids,
                    role: role,
                    password: pass
                });

                userModal.classList.remove('active');
                toast('Usuario registrado con éxito');
                e.target.reset();
                renderAdminUsers();
            } catch (err) {
                console.error(err);
                toast('Error al registrar', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Crear Usuario';
            }
        });
    }

    // Tabs
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(link.dataset.target).classList.add('active');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    const configForm = document.getElementById('config-fees-form');
    if (configForm) {
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ath = parseInt(document.getElementById('config-athletics').value);
            const soc = parseInt(document.getElementById('config-social').value);
            await window.DataManager.updateConfig({ athleticsFee: ath, socialFee: soc });
            toast('Actualizado');
            updateUI();
        });
    }
}

function updateConfigPreview() {
    const athField = document.getElementById('config-athletics');
    const socField = document.getElementById('config-social');
    if (!athField || !socField) return;
    const a = parseInt(athField.value) || 0;
    const s = parseInt(socField.value) || 0;
    const prev = document.getElementById('config-total-preview');
    if (prev) prev.innerText = `$ ${(a + s).toLocaleString('es-AR')}`;
}
