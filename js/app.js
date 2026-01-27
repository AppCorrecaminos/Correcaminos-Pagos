/**
 * app.js - Lógica Principal (Versión Corregida con Desglose y Gestión Total)
 */

let db = null;
let auth = null;
let currentUser = null;

function initializeFirebase() {
    try {
        if (!window.firebaseConfig || window.firebaseConfig.apiKey === "TU_API_KEY") {
            console.warn("Firebase no configurado. Usando modo offline.");
            return;
        }
        const app = window.firebase.app.initializeApp(window.firebaseConfig);
        db = window.firebase.firestore.getFirestore(app);
        auth = window.firebase.auth.getAuth(app);
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

function initApp() {
    currentUser = window.Auth.getCurrentUser();

    if (currentUser) {
        showView(currentUser.role === 'admin' ? 'admin-view' : 'user-view');
        updateUI();
    } else {
        showView('login-view');
    }

    setupEventListeners();
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
}

function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span>${message}</span>`;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 500);
    }, 3000);
}

function parseChildren(childrenStr) {
    if (!childrenStr) return [];
    return childrenStr.split(',').map(item => {
        const trimmed = item.trim();
        const parts = trimmed.match(/^([^(]+)\(([^)]+)\)$/);
        if (parts) {
            return { name: parts[1].trim(), category: parts[2].trim() };
        }
        return { name: trimmed, category: 'Atletismo' };
    });
}

async function updateUI() {
    if (!currentUser) return;

    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];

    if (currentUser.role === 'admin') {
        renderAdminDashboard();
        renderAdminUsers();
        renderActivitiesConfig(activities);

        const socInput = document.getElementById('config-social');
        if (socInput) socInput.value = config.socialFee || 3000;

        window.DataManager.subscribeToPayments((payments) => {
            renderAdminDashboard(payments);
        });
    } else {
        renderUserDashboard();
        const nameDisp = document.getElementById('user-display-name');
        if (nameDisp) nameDisp.innerText = currentUser.name;

        const children = parseChildren(currentUser.children);
        const breakdownContainer = document.getElementById('breakdown-container');
        const paymentChildrenAssignment = document.getElementById('children-assignment');

        let totalActivitiesCost = 0;
        let tableRowsHtml = '';

        children.forEach(kid => {
            const activity = activities.find(a => a.name.toLowerCase() === kid.category.toLowerCase());
            const price = activity ? activity.price : 0;
            totalActivitiesCost += price;

            tableRowsHtml += `
                <tr>
                    <td><b>${kid.name}</b> <span class="cost-tag">${kid.category}</span></td>
                    <td align="right">$ ${price.toLocaleString('es-AR')}</td>
                </tr>
            `;
        });

        const socialFee = config.socialFee || 0;
        const finalTotal = totalActivitiesCost + socialFee;

        // Renderizar en el Dashboard (Mi Perfil)
        if (breakdownContainer) {
            breakdownContainer.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Desglose Detallado por Hijo</h3>
                    </div>
                    <div class="card-body">
                        <table class="children-fees">
                            ${tableRowsHtml}
                            <tr style="border-top: 2px solid #ddd">
                                <td><b>Cuota Social Familiar</b></td>
                                <td align="right">$ ${socialFee.toLocaleString('es-AR')}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
        }

        // Renderizar en el Modal de Pago
        if (paymentChildrenAssignment) {
            paymentChildrenAssignment.innerHTML = `
                <label>Resumen de cobro:</label>
                <table class="children-fees">
                    ${tableRowsHtml}
                    <tr style="border-top: 1px solid #eee">
                        <td>Cuota Social</td>
                        <td align="right">$ ${socialFee.toLocaleString('es-AR')}</td>
                    </tr>
                </table>
            `;
        }

        document.getElementById('fee-total').innerText = `$ ${finalTotal.toLocaleString('es-AR')}`;
        document.getElementById('fee-athletics').innerText = `$ ${totalActivitiesCost.toLocaleString('es-AR')}`;
        document.getElementById('fee-social').innerText = `$ ${socialFee.toLocaleString('es-AR')}`;

        const amountInput = document.getElementById('payment-amount');
        if (amountInput) amountInput.value = finalTotal;
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

function openImageModal(url) {
    const win = window.open("");
    win.document.write(`<body style="margin:0; display:flex; justify-content:center; background:#000;"><img src="${url}" style="max-height:100vh; width:auto;"></body>`);
}

function renderActivitiesConfig(activities) {
    const tbody = document.querySelector('#activities-config-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    activities.forEach((act, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${act.name}" class="act-name"></td>
            <td><input type="number" value="${act.price}" class="act-price"></td>
            <td><button class="btn-text btn-del-act" data-index="${index}"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-del-act').forEach(btn => {
        btn.addEventListener('click', () => {
            activities.splice(parseInt(btn.dataset.index), 1);
            renderActivitiesConfig(activities);
        });
    });
}

async function renderAdminDashboard(manualPayments = null) {
    const payments = manualPayments || await window.DataManager.getPayments();
    const tbody = document.querySelector('#admin-payments-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
    const filterStatus = document.getElementById('filter-status').value;
    const filterMonth = document.getElementById('filter-month').value;

    let totalCollected = 0;
    let pendingCount = 0;

    payments.forEach(p => {
        if (filterStatus !== 'all' && p.status !== filterStatus) return;
        if (filterMonth !== 'all' && p.month !== filterMonth) return;

        if (p.status === 'approved') totalCollected += (p.amount || 0);
        if (p.status === 'pending') pendingCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.date}</td>
            <td><b>${p.userName}</b><br><small>${p.childrenNames || ''}</small></td>
            <td>${p.month}</td>
            <td>$ ${(p.amount || 0).toLocaleString('es-AR')}</td>
            <td>${p.receiptURL ? `<a href="#" class="btn-view-admin-photo" data-id="${p.id}"><i class="fas fa-image"></i> Ver</a>` : '---'}</td>
            <td><span class="badge badge-${p.status}">${statusMap[p.status] || p.status}</span></td>
            <td>
                ${p.status === 'pending' ? `
                    <button class="btn-action approve" data-id="${p.id}"><i class="fas fa-check"></i></button>
                    <button class="btn-action reject" data-id="${p.id}"><i class="fas fa-times"></i></button>
                ` : 'Listo'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('stat-pending').innerText = pendingCount;
    document.getElementById('stat-total').innerText = `$ ${totalCollected.toLocaleString('es-AR')}`;

    tbody.querySelectorAll('.approve').forEach(btn => btn.addEventListener('click', async () => {
        await window.DataManager.updatePaymentStatus(btn.dataset.id, 'approved');
        toast('Pago aprobado');
        renderAdminDashboard();
    }));
    tbody.querySelectorAll('.reject').forEach(btn => btn.addEventListener('click', async () => {
        await window.DataManager.updatePaymentStatus(btn.dataset.id, 'rejected');
        toast('Pago rechazado', 'error');
        renderAdminDashboard();
    }));
    tbody.querySelectorAll('.btn-view-admin-photo').forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault();
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p && p.receiptURL) openImageModal(p.receiptURL);
    }));
}

async function renderAdminUsers() {
    const users = await window.DataManager.getUsers();
    const tbody = document.querySelector('#admin-users-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    users.forEach(u => {
        const id = u.id || u.username;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${u.name}</b></td>
            <td>${u.username || u.id}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-approved' : 'badge-pending'}">${u.role.toUpperCase()}</span></td>
            <td>
                <button class="btn-text btn-edit-user" data-id="${id}">Editar</button>
                <button class="btn-text btn-del-user" data-id="${id}" style="color: #e74c3c; margin-left: 10px;">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-user').forEach(btn => btn.addEventListener('click', () => {
        const user = users.find(u => (u.id || u.username) === btn.dataset.id);
        if (user) openEditUserModal(user);
    }));

    tbody.querySelectorAll('.btn-del-user').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de eliminar este usuario?')) {
            await window.DataManager.deleteUser(btn.dataset.id);
            toast('Usuario eliminado');
            renderAdminUsers();
        }
    }));
}

function openEditUserModal(user) {
    document.getElementById('edit-u-id').value = user.id || user.username;
    document.getElementById('edit-u-name').value = user.name || '';
    document.getElementById('edit-u-children').value = user.children || '';
    document.getElementById('edit-u-pass').value = user.password || '';
    document.getElementById('edit-u-role').value = user.role || 'user';
    document.getElementById('edit-user-modal').classList.add('active');
}

function setupEventListeners() {
    // Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('username').value;
            const p = document.getElementById('password').value;
            const btn = e.target.querySelector('button');
            btn.disabled = true;
            const res = await window.Auth.login(u, p);
            if (res.success) {
                currentUser = res.user;
                showView(currentUser.role === 'admin' ? 'admin-view' : 'user-view');
                updateUI();
                toast('¡Bienvenido!');
            } else {
                alert(res.message);
                btn.disabled = false;
            }
        });
    }

    // Actividades Config
    const btnAddAct = document.getElementById('btn-add-activity-row');
    if (btnAddAct) {
        btnAddAct.addEventListener('click', () => {
            const tbody = document.querySelector('#activities-config-table tbody');
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><input type="text" placeholder="Nombre" class="act-name"></td><td><input type="number" placeholder="0" class="act-price"></td><td><button class="btn-text btn-del-new"><i class="fas fa-trash"></i></button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('.btn-del-new').addEventListener('click', () => tr.remove());
        });
    }

    const btnSaveActs = document.getElementById('btn-save-activities');
    if (btnSaveActs) {
        btnSaveActs.addEventListener('click', async () => {
            const rows = document.querySelectorAll('#activities-config-table tbody tr');
            const newActivities = [];
            rows.forEach(r => {
                const nameIn = r.querySelector('.act-name');
                const priceIn = r.querySelector('.act-price');
                if (nameIn && priceIn && nameIn.value) {
                    newActivities.push({ name: nameIn.value, price: parseInt(priceIn.value) || 0 });
                }
            });
            const config = await window.DataManager.getConfig();
            config.activities = newActivities;
            await window.DataManager.updateConfig(config);
            toast('Actividades guardadas');
            updateUI();
        });
    }

    // Cuota Social
    const feesForm = document.getElementById('config-fees-form');
    if (feesForm) {
        feesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const soc = parseInt(document.getElementById('config-social').value);
            const config = await window.DataManager.getConfig();
            config.socialFee = soc;
            await window.DataManager.updateConfig(config);
            toast('Configuración guardada');
            updateUI();
        });
    }

    // Usuarios
    const newUserForm = document.getElementById('new-user-form');
    if (newUserForm) {
        newUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const username = document.getElementById('reg-email').value.toLowerCase();
            const userId = username.replace(/[^a-zA-Z0-9]/g, '_');
            const userData = {
                name: name,
                username: username,
                children: document.getElementById('reg-children').value,
                password: document.getElementById('reg-pass').value,
                role: document.getElementById('reg-role').value
            };
            await window.DataManager.saveUser(userId, userData);
            document.getElementById('user-modal').classList.remove('active');
            toast('Usuario creado');
            renderAdminUsers();
            e.target.reset();
        });
    }

    const editUserForm = document.getElementById('edit-user-form');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-u-id').value;
            const userData = {
                name: document.getElementById('edit-u-name').value,
                children: document.getElementById('edit-u-children').value,
                password: document.getElementById('edit-u-pass').value,
                role: document.getElementById('edit-u-role').value
            };
            await window.DataManager.saveUser(id, userData);
            document.getElementById('edit-user-modal').classList.remove('active');
            toast('Usuario actualizado');
            renderAdminUsers();
        });
    }

    // Pagos
    const paymentForm = document.getElementById('payment-report-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const file = document.getElementById('payment-receipt').files[0];
                const receipt = file ? await window.DataManager.fileToBase64(file) : null;
                await window.DataManager.addPayment({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    childrenNames: currentUser.children || 'Hijo/a',
                    month: document.getElementById('payment-month').value,
                    amount: parseInt(document.getElementById('payment-amount').value),
                    status: 'pending',
                    receiptURL: receipt
                });
                document.getElementById('payment-modal').classList.remove('active');
                toast('Pago informado');
                updateUI();
            } catch (e) { toast('Error al enviar', 'error'); }
            finally { btn.disabled = false; }
        });
    }

    // UI Events
    document.querySelectorAll('.btn-logout').forEach(b => b.addEventListener('click', () => window.Auth.logout()));
    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }));
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(link.dataset.target).classList.add('active');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    document.getElementById('btn-report-payment')?.addEventListener('click', () => document.getElementById('payment-modal').classList.add('active'));
    document.getElementById('btn-add-user')?.addEventListener('click', () => document.getElementById('user-modal').classList.add('active'));

    const fileIn = document.getElementById('payment-receipt');
    if (fileIn) {
        document.getElementById('file-upload-zone').addEventListener('click', () => fileIn.click());
        fileIn.addEventListener('change', (e) => {
            if (e.target.files[0]) document.getElementById('file-name').innerText = e.target.files[0].name;
        });
    }

    document.getElementById('filter-status')?.addEventListener('change', () => renderAdminDashboard());
    document.getElementById('filter-month')?.addEventListener('change', () => renderAdminDashboard());

    document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
        const payments = await window.DataManager.getPayments();
        let csv = "Fecha;Usuario;Mes;Monto;Estado;Hijos\n";
        payments.forEach(p => { csv += `${p.date};${p.userName};${p.month};${p.amount};${p.status};${p.childrenNames}\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_${Date.now()}.csv`;
        a.click();
    });
}
