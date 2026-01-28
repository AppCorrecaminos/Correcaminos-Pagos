/**
 * app.js - Lógica Principal (Versión Completa y Restaurada)
 */

let db = null;
let auth = null;
let currentUser = null;

function updateDBStatus(isOnline, message = "") {
    const ids = ['db-status', 'db-status-admin'];
    const texts = ['db-status-text', 'db-status-text-admin'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.className = `db-status ${isOnline ? 'online' : 'offline'}`;
        }
    });

    texts.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = message || (isOnline ? 'En línea' : 'Modo Local');
        }
    });
}

function initializeFirebase() {
    updateDBStatus(false, "Conectando...");
    try {
        if (!window.firebaseConfig || window.firebaseConfig.apiKey === "AIzaSyBsV1av9R0RfNiGf_8tXugsXmxym0jt5CI") {
            // El usuario ya tiene su API Key puesta, si fuera la de ejemplo diría "TU_API_KEY"
        }

        const app = window.firebase.app.initializeApp(window.firebaseConfig);
        db = window.firebase.firestore.getFirestore(app);
        auth = window.firebase.auth.getAuth(app);

        window.DataManager.init(db);
        window.Auth.init(auth, db);

        // Verificar conexión real intentando un ping a Firestore
        window.firebase.firestore.getDoc(window.firebase.firestore.doc(db, "settings", "general"))
            .then(() => updateDBStatus(true))
            .catch(e => {
                console.warn("Firebase conectado pero bloqueado por reglas:", e);
                updateDBStatus(false, "Error de Permisos");
            });

    } catch (e) {
        console.error("Error crítico Firebase:", e);
        // Si hay un error, lo mostramos simplificado en el estado
        let userMsg = "Error de Config";
        if (e.message.includes("apiKey")) userMsg = "Falta API Key";
        else if (e.message.includes("projectId")) userMsg = "Falta ProjectID";
        else if (e.message.includes("firebase is not defined")) userMsg = "Sin Internet / Bloqueado";

        updateDBStatus(false, userMsg + ": " + e.message);
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
        if (parts) return { name: parts[1].trim(), category: parts[2].trim() };
        return { name: trimmed, category: 'Atletismo' };
    });
}

async function updateUI() {
    if (!currentUser) return;
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [{ name: 'Atletismo', price: 40000 }];

    if (currentUser.role === 'admin') {
        renderAdminDashboard();
        renderAdminUsers();
        renderAdminCC();
        renderActivitiesConfig(activities);
        const socIn = document.getElementById('config-social');
        if (socIn) socIn.value = config.socialFee || 3000;
        window.DataManager.subscribeToPayments((payments) => {
            renderAdminDashboard(payments);
            renderAdminCC(payments);
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
        let appliesSocialFee = false;

        children.forEach(kid => {
            const cleanCategory = kid.category.trim().toLowerCase();
            const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
            const price = activity ? activity.price : (activities[0]?.price || 40000);
            if (activity && activity.social) appliesSocialFee = true;
            totalActivitiesCost += price;

            // Determinar Logo
            let logoSrc = 'img/Logo Correcaminos.jpeg'; // Default
            if (kid.category.includes("Infantiles")) {
                logoSrc = 'img/Logo Kids.jpeg';
            }

            tableRowsHtml += `
                <tr>
                    <td>
                        <div class="child-info">
                            <img src="${logoSrc}" class="child-logo" alt="Logo">
                            <div>
                                <b>${kid.name}</b> <br>
                                <span class="cost-tag">${kid.category}</span>
                            </div>
                        </div>
                    </td>
                    <td align="right" style="vertical-align: bottom;">$ ${price.toLocaleString('es-AR')}</td>
                </tr>`;
        });

        const socialFee = appliesSocialFee ? (config.socialFee || 0) : 0;

        // Lógica de Mora
        const today = new Date();
        const dayOfMonth = today.getDate();
        const lateFeeDay = config.lateFeeDay || 12;
        const lateFeeAmount = config.lateFeeAmount || 5000;
        const isLate = dayOfMonth > lateFeeDay;
        const appliedLateFee = isLate ? lateFeeAmount : 0;

        const finalTotal = totalActivitiesCost + socialFee + appliedLateFee;

        if (breakdownContainer) {
            breakdownContainer.innerHTML = `
                <div class="card" style="margin-top: 2rem;">
                    <div class="card-header"><h3>Desglose Detallado por Hijo</h3></div>
                    <div class="card-body">
                        <table class="children-fees">${tableRowsHtml}
                            <tr style="border-top: 2px solid #ddd"><td><b>Cuota Social Familiar</b> ${appliesSocialFee ? '' : '(No aplica)'}</td><td align="right">$ ${socialFee.toLocaleString('es-AR')}</td></tr>
                            ${isLate ? `<tr style="color: var(--danger); font-weight: 600;"><td><i class="fas fa-exclamation-triangle"></i> Recargo por Mora (Después del día ${lateFeeDay})</td><td align="right">$ ${lateFeeAmount.toLocaleString('es-AR')}</td></tr>` : ''}
                        </table>
                        ${!isLate ? `<p class="text-xs" style="margin-top: 1rem; color: var(--success);"><i class="fas fa-info-circle"></i> Tienes hasta el día ${lateFeeDay} para abonar sin recargo.</p>` : ''}
                    </div>
                </div>`;
        }

        if (paymentChildrenAssignment) {
            paymentChildrenAssignment.innerHTML = `<label>Resumen de Cobro:</label>
                <table class="children-fees">${tableRowsHtml}
                    <tr style="border-top: 1px solid #eee"><td>Cuota Social</td><td align="right">$ ${socialFee.toLocaleString('es-AR')}</td></tr>
                    ${isLate ? `<tr style="color: var(--danger)"><td>Recargo por Mora</td><td align="right">$ ${lateFeeAmount.toLocaleString('es-AR')}</td></tr>` : ''}
                </table>`;
        }

        document.getElementById('fee-total').innerText = `$ ${finalTotal.toLocaleString('es-AR')}`;
        document.getElementById('fee-athletics').innerText = `$ ${totalActivitiesCost.toLocaleString('es-AR')}`;
        document.getElementById('fee-social').innerText = `$ ${socialFee.toLocaleString('es-AR')}`;
        const amountInput = document.getElementById('payment-amount');
        if (amountInput) amountInput.value = finalTotal;
    }
}

async function renderAdminUsers() {
    const users = await window.DataManager.getUsers();
    const tbody = document.querySelector('#admin-users-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    users.forEach(u => {
        const id = u.id || u.username;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><b>${u.name}</b></td><td>${u.username || u.id}</td><td><span class="badge ${u.role === 'admin' ? 'badge-approved' : 'badge-pending'}">${u.role.toUpperCase()}</span></td><td><button class="btn-text btn-edit-user" data-id="${id}">Editar</button> <button class="btn-text btn-del-user" data-id="${id}" style="color:red">Borrar</button></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-user').forEach(btn => btn.addEventListener('click', () => {
        const user = users.find(u => (u.id || u.username) === btn.dataset.id);
        if (user) openEditUserModal(user);
    }));
    tbody.querySelectorAll('.btn-del-user').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar usuario?')) { await window.DataManager.deleteUser(btn.dataset.id); toast('Eliminado'); renderAdminUsers(); }
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
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.innerText = "Verificando...";
        const res = await window.Auth.login(document.getElementById('username').value, document.getElementById('password').value);
        if (res.success) {
            currentUser = res.user;
            showView(currentUser.role === 'admin' ? 'admin-view' : 'user-view');
            updateUI();
            toast('¡Hola ' + currentUser.name + '!');
        } else {
            alert(res.message);
            btn.disabled = false;
            btn.innerText = "Iniciar Sesión";
        }
    });

    // Navegación Admin
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(link.dataset.target).classList.add('active');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            if (link.dataset.target === 'admin-cc') renderAdminCC();
        });
    });

    // Actividades
    document.getElementById('btn-add-activity-row')?.addEventListener('click', () => {
        const tbody = document.querySelector('#activities-config-table tbody');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input type="text" placeholder="Actividad" class="act-name"></td><td><input type="number" placeholder="Costo" class="act-price"></td><td><input type="checkbox" class="act-social" checked></td><td><button class="btn-text btn-del-new"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
        tr.querySelector('.btn-del-new').addEventListener('click', () => tr.remove());
    });

    document.getElementById('btn-save-activities')?.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#activities-config-table tbody tr');
        const activities = [];
        rows.forEach(r => {
            const n = r.querySelector('.act-name').value;
            const p = parseInt(r.querySelector('.act-price').value) || 0;
            const s = r.querySelector('.act-social').checked;
            if (n) activities.push({ name: n.trim(), price: p, social: s });
        });
        const c = await window.DataManager.getConfig();
        c.activities = activities;
        await window.DataManager.updateConfig(c);
        toast('Actividades guardadas'); updateUI();
    });

    // Usuarios: Crear y Editar
    document.getElementById('new-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-email').value.toLowerCase().trim();
        const userId = username.replace(/[^a-z0-9]/g, '_');
        await window.DataManager.saveUser(userId, {
            name: document.getElementById('reg-name').value,
            username: username,
            children: document.getElementById('reg-children').value,
            password: document.getElementById('reg-pass').value,
            role: document.getElementById('reg-role').value
        });
        document.getElementById('user-modal').classList.remove('active');
        toast('Usuario creado'); renderAdminUsers(); e.target.reset();
    });

    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-u-id').value;
        await window.DataManager.saveUser(id, {
            name: document.getElementById('edit-u-name').value,
            children: document.getElementById('edit-u-children').value,
            password: document.getElementById('edit-u-pass').value,
            role: document.getElementById('edit-u-role').value
        });
        document.getElementById('edit-user-modal').classList.remove('active');
        toast('Actualizado'); renderAdminUsers();
    });

    document.getElementById('btn-add-user')?.addEventListener('click', () => {
        document.getElementById('user-modal').classList.add('active');
    });

    // Configuración y Sincronización
    document.getElementById('config-fees-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const config = await window.DataManager.getConfig();
        config.socialFee = parseInt(document.getElementById('config-social').value);
        config.lateFeeAmount = parseInt(document.getElementById('config-late-fee').value);
        config.lateFeeDay = parseInt(document.getElementById('config-late-day').value);
        await window.DataManager.updateConfig(config);
        toast('Configuración guardada'); updateUI();
    });

    document.getElementById('btn-sync-to-cloud')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const btn = e.target;
        btn.disabled = true;
        btn.innerText = "Sincronizando todo...";

        try {
            // 1. Sincronizar Usuarios
            const users = await window.DataManager.getUsers();
            for (let u of users) { await window.DataManager.saveUser(u.id || u.username, u); }

            // 2. Sincronizar Configuración (Precios y Actividades)
            const config = await window.DataManager.getConfig();
            const res = await window.DataManager.updateConfig(config);

            if (res) alert("¡Sincronización Exitosa! Usuarios y Precios subidos a la Nube.");
            else alert("Error: Se subieron los usuarios pero no los precios. Revisa Firebase.");

        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "📤 Subir Todo a la Nube";
        }
    });

    // Pagos
    document.getElementById('payment-report-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const file = document.getElementById('payment-receipt').files[0];
            const receipt = file ? await window.DataManager.fileToBase64(file) : null;
            await window.DataManager.addPayment({
                userId: currentUser.id,
                userName: currentUser.name,
                childrenNames: currentUser.children || 'Hijos',
                month: document.getElementById('payment-month').value,
                amount: parseInt(document.getElementById('payment-amount').value),
                status: 'pending', receiptURL: receipt
            });
            document.getElementById('payment-modal').classList.remove('active');
            updateUI();
            toast('Pago informado');
        } catch (e) { toast('Error', 'error'); } finally { btn.disabled = false; }
    });

    document.getElementById('btn-report-payment')?.addEventListener('click', () => {
        document.getElementById('payment-modal').classList.add('active');
    });

    // Filtros Reportes
    document.getElementById('filter-status')?.addEventListener('change', () => renderAdminDashboard());
    document.getElementById('filter-month')?.addEventListener('change', () => renderAdminDashboard());

    // Modales y Logout
    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }));
    document.querySelectorAll('.btn-logout').forEach(b => b.addEventListener('click', () => window.Auth.logout()));

    // Foto recibo
    document.getElementById('file-upload-zone')?.addEventListener('click', () => document.getElementById('payment-receipt').click());
    document.getElementById('payment-receipt')?.addEventListener('change', (e) => {
        if (e.target.files[0]) document.getElementById('file-name').innerText = e.target.files[0].name;
    });

    // Confirmación de Aprobación Manual
    document.getElementById('btn-confirm-approve')?.addEventListener('click', async () => {
        if (!activePaymentForApproval) return;
        const finalAmount = parseInt(document.getElementById('confirm-amount').value);
        if (isNaN(finalAmount) || finalAmount <= 0) {
            alert("Por favor ingresa un monto válido.");
            return;
        }

        const btn = document.getElementById('btn-confirm-approve');
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            await window.DataManager.updatePayment(activePaymentForApproval.id, {
                status: 'approved',
                amount: finalAmount
            });
            document.getElementById('approve-payment-modal').classList.remove('active');
            toast('Pago aprobado con éxito');
            renderAdminDashboard();
        } catch (e) {
            toast('Error al aprobar', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = "Confirmar y Aprobar";
        }
    });
}

function renderActivitiesConfig(activities) {
    const tbody = document.querySelector('#activities-config-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    activities.forEach((act, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input type="text" value="${act.name}" class="act-name"></td><td><input type="number" value="${act.price}" class="act-price"></td><td><input type="checkbox" class="act-social" ${act.social ? 'checked' : ''}></td><td><button class="btn-text btn-del-act" data-index="${index}"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-del-act').forEach(btn => btn.addEventListener('click', () => {
        activities.splice(parseInt(btn.dataset.index), 1);
        renderActivitiesConfig(activities);
    }));
}

async function renderAdminDashboard(manualPayments = null) {
    const payments = manualPayments || await window.DataManager.getPayments();
    const tbody = document.querySelector('#admin-payments-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
    const fStatus = document.getElementById('filter-status').value;
    const fMonth = document.getElementById('filter-month').value;
    let total = 0; let pending = 0;

    payments.forEach(p => {
        if (fStatus !== 'all' && p.status !== fStatus) return;
        if (fMonth !== 'all' && p.month !== fMonth) return;
        if (p.status === 'approved') total += (p.amount || 0);
        if (p.status === 'pending') pending++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.date}</td>
            <td><b>${p.userName}</b><br><small>${p.childrenNames || ''}</small></td>
            <td>${p.month}</td>
            <td>$ ${(p.amount || 0).toLocaleString('es-AR')}</td>
            <td>${p.receiptURL ? `<button class="btn-text btn-view-admin-photo" data-id="${p.id}"><i class="fas fa-image"></i> Ver Foto</button>` : '---'}</td>
            <td><span class="badge badge-${p.status}">${statusMap[p.status]}</span></td>
            <td>
                ${p.status === 'pending' ? `<button class="btn-action approve" data-id="${p.id}" title="Aprobar Pago"><i class="fas fa-check"></i></button>` : ''}
            </td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('stat-pending').innerText = pending;
    document.getElementById('stat-total').innerText = `$ ${total.toLocaleString('es-AR')}`;

    tbody.querySelectorAll('.approve').forEach(btn => btn.addEventListener('click', async () => {
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p) openApproveModal(p);
    }));

    tbody.querySelectorAll('.btn-view-admin-photo').forEach(btn => btn.addEventListener('click', () => {
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p && p.receiptURL) openImageModal(p.receiptURL);
    }));
}

let activePaymentForApproval = null;

function openApproveModal(payment) {
    activePaymentForApproval = payment;
    document.getElementById('approve-user-name').innerText = payment.userName;
    document.getElementById('approve-month').innerText = payment.month;
    document.getElementById('approve-amount-reported').innerText = `$ ${(payment.amount || 0).toLocaleString('es-AR')}`;
    document.getElementById('confirm-amount').value = payment.amount || 0;

    const img = document.getElementById('approve-img-preview');
    if (payment.receiptURL) {
        img.src = payment.receiptURL;
        img.style.display = 'block';
        img.onclick = () => openImageModal(payment.receiptURL);
    } else {
        img.style.display = 'none';
    }

    document.getElementById('approve-payment-modal').classList.add('active');
}

async function renderUserDashboard() {
    const payments = await window.DataManager.getPaymentsByUser(currentUser.id);
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];
    const socialFee = config.socialFee || 0;

    // 1. Calcular esperado mensual
    const children = parseChildren(currentUser.children);
    let monthlyExpected = 0;
    let appliesSocial = false;
    children.forEach(kid => {
        const cleanCategory = kid.category.trim().toLowerCase();
        const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
        monthlyExpected += activity ? activity.price : (activities[0]?.price || 0);
        if (activity && activity.social) appliesSocial = true;
    });
    if (appliesSocial) monthlyExpected += socialFee;

    // 2. Renderizar Línea de Tiempo
    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const timelineContainer = document.getElementById('user-yearly-timeline');
    const now = new Date();
    const currentMonthName = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][now.getMonth()];

    if (timelineContainer) {
        timelineContainer.innerHTML = '';
        months.forEach(m => {
            const paidMonth = payments.filter(p => p.month === m && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
            const isPaid = paidMonth >= monthlyExpected && monthlyExpected > 0;
            const isCurrent = m === currentMonthName;

            const div = document.createElement('div');
            div.className = `timeline-month ${isPaid ? 'paid' : (isCurrent ? 'pending' : '')} ${isCurrent ? 'current' : ''}`;
            div.innerHTML = `
                <span class="tm-name">${m.substring(0, 3)}</span>
                <span class="tm-icon"><i class="fas ${isPaid ? 'fa-check-circle' : (isCurrent ? 'fa-exclamation-circle' : 'fa-circle')}"></i></span>
                <span class="text-xs" style="margin-top:0.5rem">${monthlyExpected > 0 ? (isPaid ? 'Al día' : `$ ${(monthlyExpected - paidMonth).toLocaleString('es-AR')}`) : '---'}</span>
            `;
            timelineContainer.appendChild(div);
        });
    }

    // Actualizar Estado General
    const approvedPaymentsCount = payments.filter(p => p.status === 'approved').length;
    const pendingPaymentsCount = payments.filter(p => p.status === 'pending').length;
    document.getElementById('user-cc-status').innerText = pendingPaymentsCount > 0 ? 'Pago en Revisión' : (approvedPaymentsCount > 0 ? 'Activo' : 'Pendiente');

    // 3. Tabla de historial
    const tbody = document.querySelector('#payments-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
    payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.month}</td><td>${p.date}</td><td>$ ${p.amount.toLocaleString('es-AR')}</td><td><span class="badge badge-${p.status}">${statusMap[p.status] || p.status}</span></td><td>${p.receiptURL ? `<button class="btn-text btn-view-photo" data-id="${p.id}"><i class="fas fa-eye"></i> Ver</button>` : '---'}</td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-view-photo').forEach(btn => btn.addEventListener('click', () => {
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p && p.receiptURL) openImageModal(p.receiptURL);
    }));
}

function openImageModal(url) {
    const win = window.open("");
    win.document.write(`<body style="margin:0;display:flex;justify-content:center;background:#000;"><img src="${url}" style="max-height:100vh;"></body>`);
}

async function renderAdminCC(manualPayments = null) {
    const users = await window.DataManager.getUsers();
    const payments = manualPayments || await window.DataManager.getPayments();
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];
    const socialFee = config.socialFee || 0;

    const tbody = document.querySelector('#admin-cc-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    users.forEach(u => {
        if (u.role === 'admin') return;

        const children = parseChildren(u.children);
        let monthlyExpected = 0;
        let appliesSocial = false;
        children.forEach(kid => {
            const cleanCategory = kid.category.trim().toLowerCase();
            const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
            monthlyExpected += activity ? activity.price : (activities[0]?.price || 0);
            if (activity && activity.social) appliesSocial = true;
        });
        if (appliesSocial) monthlyExpected += socialFee;

        let totalDebt = 0;
        let monthTds = '';

        const userPayments = payments.filter(p => p.userId === (u.id || u.username) && p.status === 'approved');

        months.forEach(m => {
            const paid = userPayments.filter(p => p.month === m).reduce((sum, p) => sum + p.amount, 0);
            const isFull = paid >= monthlyExpected && monthlyExpected > 0;
            const isPartial = paid > 0 && paid < monthlyExpected;
            const isDebt = paid === 0 && monthlyExpected > 0;

            if (isDebt || isPartial) totalDebt += (monthlyExpected - paid);

            monthTds += `
                <td class="month-col">
                    <div class="status-check ${isFull ? 'ok' : (isDebt ? 'debt' : 'void')}" title="${m}: $ ${paid.toLocaleString('es-AR')} de $ ${monthlyExpected.toLocaleString('es-AR')}">
                        <i class="fas ${isFull ? 'fa-check' : (isDebt ? 'fa-dollar-sign' : 'fa-minus')}"></i>
                    </div>
                </td>`;
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${u.name}</b><br><small>${u.username || u.id}</small></td>
            ${monthTds}
            <td><b class="${totalDebt > 0 ? 'text-red' : 'text-green'}" style="font-size: 1.1rem">$ ${totalDebt.toLocaleString('es-AR')}</b></td>
        `;
        tbody.appendChild(tr);
    });
}
