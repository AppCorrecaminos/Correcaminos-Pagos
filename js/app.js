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

async function initApp() {
    currentUser = window.Auth.getCurrentUser();
    if (currentUser) {
        // Refrescar datos del usuario desde la nube si es posible
        try {
            // Usar el nuevo método getUser para obtener el usuario específico
            const fresh = await window.DataManager.getUser(currentUser.id);
            if (fresh) {
                currentUser = fresh;
                localStorage.setItem('correcaminos_session', JSON.stringify(currentUser));
            }
        } catch (e) {
            console.warn("No se pudo refrescar el usuario desde la nube, usando sesión local.", e);
        }

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

function getChildList(user) {
    if (user.athletes && user.athletes.length > 0) {
        return user.athletes.map(a => ({
            name: a.name,
            category: a.activity || a.category || 'Mayores'
        }));
    }
    return parseChildren(user.children);
}

async function updateUI() {
    if (!currentUser) return;
    try {
        // Refrescar datos del usuario desde la nube si está conectado
        if (window.DataManager.db && currentUser.id !== 'local_admin') {
            const freshUser = await window.DataManager.getUser(currentUser.id);
            if (freshUser) {
                currentUser = freshUser;
                localStorage.setItem('correcaminos_session', JSON.stringify(currentUser));
            }
        }

        const config = await window.DataManager.getConfig();
        const activities = config.activities || [
            { name: 'Atletismo Eq. Competitivo', price: 40000, social: true },
            { name: 'Atletismo Infantiles A y B', price: 40000, social: true }
        ];

        if (currentUser.role === 'admin') {
            await renderAdminDashboard();
            await renderAdminUsers();
            await renderAdminCC();
            renderActivitiesConfig(activities);
            const socIn = document.getElementById('config-social');
            if (socIn) socIn.value = config.socialFee || 3000;
            window.DataManager.subscribeToPayments((payments) => {
                renderAdminDashboard(payments);
                renderAdminCC(payments);
            });
        } else {
            await renderUserDashboard();
            const nameDisp = document.getElementById('user-display-name');
            if (nameDisp) nameDisp.innerText = currentUser.name;

            // Fuente de Verdad: Atletas (Fichas) prioritarias sobre el string del Admin
            const children = getChildList(currentUser);

            const breakdownContainer = document.getElementById('breakdown-container');
            const paymentChildrenAssignment = document.getElementById('children-assignment');

            if (children.length === 0) {
                if (breakdownContainer) breakdownContainer.innerHTML = '<div class="card"><div class="card-body">No hay atletas registrados.</div></div>';
                renderAthletes([], activities);
                return;
            }

            // Lógica de Mora Corregida (Recargo a partir del día 13)
            const monthsNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            const today = new Date();
            const currentMonthIndex = today.getMonth();

            // Si es Enero (0), mostramos Febrero (1) por defecto para el cobro
            const displayMonthIndex = currentMonthIndex === 0 ? 1 : currentMonthIndex;
            const displayMonthName = monthsNames[displayMonthIndex];

            const lateFeeDay = config.lateFeeDay || 12;
            const lateFeeAmount = config.lateFeeAmount || 5000;

            const checkLate = (monthName) => {
                const mIdxTarget = monthsNames.indexOf(monthName);
                if (mIdxTarget === -1) return false;

                // Si el día de hoy es menor o igual al día límite, NO hay mora
                if (today.getMonth() === mIdxTarget && today.getDate() <= lateFeeDay) return false;

                // Si ya pasó el mes, o estamos en el mismo mes después del día límite
                let targetYear = today.getFullYear();
                const deadline = new Date(targetYear, mIdxTarget, lateFeeDay, 23, 59, 59);
                return today > deadline;
            };

            const lateStatus = checkLate(displayMonthName);

            let totalActivitiesCost = 0;
            let totalLateFees = 0;
            let tableRowsHtml = '';
            let appliesSocialFee = false;
            let activitiesWithSocial = [];

            children.forEach(kid => {
                const cleanCategory = kid.category.trim().toLowerCase();
                const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
                const price = activity ? activity.price : (activities[0]?.price || 40000);

                let kidLateFee = 0;
                if (lateStatus) {
                    kidLateFee = lateFeeAmount;
                    totalLateFees += kidLateFee;
                }

                if (activity && activity.social) {
                    appliesSocialFee = true;
                    if (!activitiesWithSocial.includes(activity.name)) activitiesWithSocial.push(activity.name);
                }
                totalActivitiesCost += price;

                // Determinar Logo
                let logoSrc = 'img/Logo Correcaminos.jpeg'; // Default
                if (kid.category.includes("Kids") || kid.category.includes("Infantiles")) {
                    logoSrc = 'img/Logo Kids.jpeg';
                }

                tableRowsHtml += `
                    <tr>
                        <td>
                            <div class="child-info" style="display:flex; align-items:center; gap:1rem;">
                                <img src="${logoSrc}" class="child-logo" alt="Logo" style="width:40px; height:40px; border-radius:50%;">
                                <div>
                                    <b>${kid.name}</b> <br>
                                    <span class="cost-tag" style="font-size:0.8rem; color:#666;">${kid.category}</span>
                                    ${kidLateFee > 0 ? `<br><span class="text-xs" style="color:var(--danger); font-weight:600;"><i class="fas fa-clock"></i> + Recargo Mora</span>` : ''}
                                </div>
                            </div>
                        </td>
                        <td align="right" style="vertical-align: bottom;">
                            $ ${price.toLocaleString('es-AR')}
                            ${kidLateFee > 0 ? `<br><small style="color:var(--danger)">+$ ${kidLateFee.toLocaleString('es-AR')}</small>` : ''}
                        </td>
                    </tr>`;
            });

            const socialFee = appliesSocialFee ? (config.socialFee || 0) : 0;
            const finalTotal = totalActivitiesCost + socialFee + totalLateFees;

            if (breakdownContainer) {
                breakdownContainer.innerHTML = `
                    <div class="card" style="margin-top: 2rem;">
                        <div class="card-header">
                            <div>
                                <h3>Desglose Detallado - Cuota ${displayMonthName}</h3>
                                <p class="text-xs">Valores vigentes para el periodo seleccionado.</p>
                            </div>
                        </div>
                        <div class="card-body">
                            <table class="children-fees">${tableRowsHtml}
                                <tr style="border-top: 2px solid #ddd">
                                    <td>
                                        <b>Cuota Social Familiar</b> <br>
                                        <small class="text-xs" style="color:var(--text-muted)">
                                            ${appliesSocialFee ? `Aplica por actividad: ${activitiesWithSocial.join(', ')}` : 'No aplica a estas actividades'}
                                        </small>
                                    </td>
                                    <td align="right" style="vertical-align: bottom;">$ ${socialFee.toLocaleString('es-AR')}</td>
                                </tr>
                            </table>
                            <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 700; font-size: 1.1rem;">Total a abonar:</span>
                                <span style="font-weight: 800; font-size: 1.5rem; color: var(--primary);">$ ${finalTotal.toLocaleString('es-AR')}</span>
                            </div>
                            ${!lateStatus ? `<p class="text-xs" style="margin-top: 1rem; color: var(--success);"><i class="fas fa-info-circle"></i> Tienes hasta el día ${lateFeeDay} para abonar sin recargo por mora.</p>` : ''}
                        </div>
                    </div>`;
            }

            if (paymentChildrenAssignment) {
                paymentChildrenAssignment.innerHTML = `
                    <table class="children-fees">${tableRowsHtml}
                        <tr style="border-top: 1px solid #eee">
                            <td><b>Cuota Social Familiar</b></td>
                            <td align="right">$ ${socialFee.toLocaleString('es-AR')}</td>
                        </tr>
                    </table>`;
            }

            const feeTotalEl = document.getElementById('fee-total');
            if (feeTotalEl) feeTotalEl.innerText = `$ ${finalTotal.toLocaleString('es-AR')}`;
            const feeAthEl = document.getElementById('fee-athletics');
            if (feeAthEl) feeAthEl.innerText = `$ ${totalActivitiesCost.toLocaleString('es-AR')}`;
            const feeSocEl = document.getElementById('fee-social');
            if (feeSocEl) feeSocEl.innerText = `$ ${socialFee.toLocaleString('es-AR')}`;

            const amountInput = document.getElementById('payment-amount');
            if (amountInput) amountInput.value = finalTotal;

            // Renderizar Fichas de Atletas
            renderAthletes(children, activities);
        }
    } catch (err) {
        console.error("Error en updateUI:", err);
    }
}

function renderAthletes(children, activities) {
    const container = document.getElementById('athletes-container');
    if (!container) return;

    const athletesData = currentUser.athletes || [];
    container.innerHTML = '';

    if (children.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; background: #f8fafc; border-radius: 12px; border: 2px dashed #e2e8f0;">
                <i class="fas fa-users" style="font-size: 2rem; color: #cbd5e0; margin-bottom: 1rem;"></i>
                <p style="color: #718096;">No hay atletas registrados. Haz clic en "Añadir Atleta" arriba para comenzar.</p>
            </div>
        `;
    } else {
        children.forEach((kid, index) => {
            const data = athletesData.find(a => a.name.trim().toLowerCase() === kid.name.trim().toLowerCase()) || {};
            const isComplete = data.dni && data.address && data.parentsPhone;

            const card = document.createElement('div');
            card.className = `athlete-card ${isComplete ? '' : 'incomplete'}`;
            card.innerHTML = `
                <div class="athlete-card-header">
                    <h4>${kid.name}</h4>
                    <span class="badge ${isComplete ? 'badge-approved' : 'badge-pending'}">${isComplete ? 'Ficha Completa' : 'Ficha Pendiente'}</span>
                </div>
                <div class="athlete-card-body">
                    <p><strong>Categoría:</strong> ${data.category || kid.category}</p>
                    <p><strong>DNI:</strong> ${data.dni || '---'}</p>
                    <p><strong>Teléfono:</strong> ${data.phone || '---'}</p>
                </div>
                <button class="btn-text btn-edit-athlete" data-index="${index}" style="margin-top: 1rem; width: 100%; border: 1px solid #eee; padding: 0.5rem; border-radius: 4px;">
                    <i class="fas fa-edit"></i> Completar Ficha Técnica
                </button>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('.btn-edit-athlete').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.dataset.index;
                const kid = children[idx];
                const data = athletesData.find(a => a.name.trim().toLowerCase() === kid.name.trim().toLowerCase()) || {};

                document.getElementById('ath-index').value = idx;
                const nameField = document.getElementById('ath-name');
                nameField.value = kid.name;
                nameField.readOnly = false;
                nameField.placeholder = "Nombre completo del atleta";

                document.getElementById('ath-category').value = data.category || 'Mayores';
                const actSelect = document.getElementById('ath-activity');
                if (actSelect) {
                    actSelect.innerHTML = activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
                    actSelect.value = data.activity || kid.category;
                }
                document.getElementById('ath-dni').value = data.dni || '';
                document.getElementById('ath-phone').value = data.phone || '';
                document.getElementById('ath-email').value = data.email || '';
                document.getElementById('ath-parents-names').value = data.parentsNames || '';
                document.getElementById('ath-parents-phone').value = data.parentsPhone || '';
                document.getElementById('ath-address').value = data.address || '';

                document.getElementById('athlete-modal').classList.add('active');
            });
        });
    }
}

async function renderAdminUsers() {
    const users = await window.DataManager.getUsers();
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];
    const tbody = document.querySelector('#admin-users-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach(u => {
        const id = u.id || u.username;
        const athletes = u.athletes || [];

        // Generamos el HTML de los atletas para este padre
        let athletesHtml = '';
        if (athletes.length > 0) {
            athletesHtml = `<div class="admin-user-athletes">
                ${athletes.map((a, idx) => `
                    <div class="mini-athlete-pill" onclick="openAdminAthleteFile('${id}', ${idx})">
                        <i class="fas fa-id-card"></i> ${a.name} <small>(${a.activity || a.category})</small>
                    </div>
                `).join('')}
            </div>`;
        } else if (u.children && u.children.trim() !== "") {
            athletesHtml = `<small style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Pendiente migrar: ${u.children}</small>`;
        } else {
            athletesHtml = `<small style="color:var(--text-muted)">Sin atletas registrados</small>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="user-main-info">
                    <span class="user-name">${u.name}</span>
                    <span class="user-id">@${u.username || u.id}</span>
                </div>
            </td>
            <td>
                ${athletesHtml}
            </td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-approved' : 'badge-pending'}">${u.role.toUpperCase()}</span></td>
            <td>
                <div style="display:flex; gap:0.5rem">
                    <button class="btn-action edit btn-edit-user" data-id="${id}" title="Editar cuenta y clave"><i class="fas fa-user-edit"></i></button> 
                    <button class="btn-action reject btn-del-user" data-id="${id}" title="Eliminar usuario" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    // Eventos
    tbody.querySelectorAll('.btn-edit-user').forEach(btn => btn.addEventListener('click', () => {
        const user = users.find(u => (u.id || u.username) === btn.dataset.id);
        if (user) openEditUserModal(user);
    }));

    tbody.querySelectorAll('.btn-del-user').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar usuario por completo? Esta acción no se puede deshacer.')) {
            await window.DataManager.deleteUser(btn.dataset.id);
            toast('Usuario eliminado');
            renderAdminUsers();
        }
    }));
}

/**
 * Permite al Admin abrir la ficha de un atleta de un usuario específico
 */
async function openAdminAthleteFile(userId, athleteIndex) {
    const users = await window.DataManager.getUsers();
    const user = users.find(u => (u.id || u.username) === userId);
    if (!user || !user.athletes[athleteIndex]) return;

    const athlete = user.athletes[athleteIndex];
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];

    // Llenamos el modal (reutilizamos el del usuario pero para el admin)
    document.getElementById('ath-index').value = athleteIndex;
    // Guardamos temporalmente el ID del usuario que estamos editando
    document.getElementById('athlete-modal').dataset.editingUserId = userId;

    const nameField = document.getElementById('ath-name');
    nameField.value = athlete.name;
    nameField.readOnly = false;

    document.getElementById('ath-category').value = athlete.category || 'Mayores';
    const actSelect = document.getElementById('ath-activity');
    if (actSelect) {
        actSelect.innerHTML = activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
        actSelect.value = athlete.activity || athlete.category;
    }
    document.getElementById('ath-dni').value = athlete.dni || '';
    document.getElementById('ath-phone').value = athlete.phone || '';
    document.getElementById('ath-email').value = athlete.email || '';
    document.getElementById('ath-parents-names').value = athlete.parentsNames || '';
    document.getElementById('ath-parents-phone').value = athlete.parentsPhone || '';
    document.getElementById('ath-address').value = athlete.address || '';

    document.getElementById('athlete-modal').classList.add('active');
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
        btn.innerText = "Sincronizando...";

        try {
            const users = await window.DataManager.getUsers();
            for (let u of users) { await window.DataManager.saveUser(u.id || u.username, u); }
            const config = await window.DataManager.getConfig();
            await window.DataManager.updateConfig(config);
            alert("✅ Todos los datos locales se han subido a la nube con éxito.");
        } catch (err) {
            alert("❌ Error en la sincronización: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Sincronizar Usuarios Locales";
        }
    });

    document.getElementById('btn-migrate-to-athletes')?.addEventListener('click', async () => {
        if (!confirm("⚠️ ¿Deseas migrar los datos? \n\nEsto moverá los nombres de los hijos del campo de texto a Fichas Técnicas para todos los usuarios. El campo antiguo se vaciará.")) return;

        const btn = document.getElementById('btn-migrate-to-athletes');
        btn.disabled = true;
        btn.innerText = "Migrando...";

        try {
            const users = await window.DataManager.getUsers();
            let count = 0;
            for (let u of users) {
                if (u.role === 'admin' || !u.children || u.children.trim() === "") continue;
                const kids = parseChildren(u.children);
                if (!u.athletes) u.athletes = [];
                kids.forEach(k => {
                    const exists = u.athletes.some(a => a.name.trim().toLowerCase() === k.name.trim().toLowerCase());
                    if (!exists) {
                        u.athletes.push({
                            name: k.name, category: k.category, activity: k.category,
                            dni: "", phone: "", email: "", address: "", parentsNames: "", parentsPhone: ""
                        });
                    }
                });
                u.children = "";
                await window.DataManager.saveUser(u.id || u.username, u);
                count++;
            }
            alert(`✅ Migración exitosa: ${count} usuarios actualizados en la nube.`);
            updateUI();
        } catch (err) { alert("Error: " + err.message); } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Migrar Datos a Fichas Técnicas';
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
    // Exportar CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
        const payments = await window.DataManager.getPayments();
        const fStatus = document.getElementById('filter-status').value;
        const fMonth = document.getElementById('filter-month').value;

        const filtered = payments.filter(p => {
            if (fStatus !== 'all' && p.status !== fStatus) return false;
            if (fMonth !== 'all' && p.month !== fMonth) return false;
            return true;
        });

        if (filtered.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        let csv = 'Fecha,Usuario,Hijos,Mes,Monto,Estado\n';
        filtered.forEach(p => {
            csv += `"${p.date}","${p.userName}","${(p.childrenNames || '').replace(/"/g, '""')}","${p.month}",${p.amount},"${p.status}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Reporte_Pagos_${fMonth}_${fStatus}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('Reporte exportado');
    });

    // Guardar Ficha Atleta (Soporta Admin y Padre)
    document.getElementById('athlete-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const modal = document.getElementById('athlete-modal');
        const editingUserId = modal.dataset.editingUserId;
        const index = document.getElementById('ath-index').value;
        const name = document.getElementById('ath-name').value;

        const newAthlete = {
            name: name,
            dni: document.getElementById('ath-dni').value,
            phone: document.getElementById('ath-phone').value,
            email: document.getElementById('ath-email').value,
            parentsNames: document.getElementById('ath-parents-names').value,
            parentsPhone: document.getElementById('ath-parents-phone').value,
            address: document.getElementById('ath-address').value,
            category: document.getElementById('ath-category').value,
            activity: document.getElementById('ath-activity').value
        };

        let targetUser = currentUser;

        // Si hay un editingUserId, significa que el Admin está editando a un usuario
        if (editingUserId && currentUser.role === 'admin') {
            const users = await window.DataManager.getUsers();
            targetUser = users.find(u => (u.id || u.username) === editingUserId);
        }

        if (!targetUser) return;
        if (!targetUser.athletes) targetUser.athletes = [];

        if (index !== "-1") targetUser.athletes[index] = newAthlete;
        else targetUser.athletes.push(newAthlete);

        // Sincronizar con el string de hijos para facturación
        targetUser.children = targetUser.athletes.map(a => `${a.name} (${a.activity})`).join(', ');

        await window.DataManager.saveUser(targetUser.id || targetUser.username, targetUser);

        modal.classList.remove('active');
        delete modal.dataset.editingUserId; // Limpiamos

        toast('Ficha técnica y actividad actualizadas');

        if (currentUser.role === 'admin') renderAdminUsers();
        else updateUI();
    });

    // Recalcular monto al cambiar mes en pago
    document.getElementById('payment-month')?.addEventListener('change', async (e) => {
        const selectedMonth = e.target.value;
        if (!selectedMonth) return;

        const config = await window.DataManager.getConfig();
        const activities = config.activities || [];
        let children = [];
        if (currentUser.athletes && currentUser.athletes.length > 0) {
            children = currentUser.athletes.map(a => ({ name: a.name, category: a.activity || a.category || 'Mayores' }));
        } else {
            children = parseChildren(currentUser.children);
        }
        const monthsNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const today = new Date();
        const currentMonthIndex = today.getMonth();
        const dayOfMonth = today.getDate();
        const lateFeeDay = config.lateFeeDay || 12;
        const lateFeeAmount = config.lateFeeAmount || 5000;

        const checkLate = (monthName) => {
            const mIdxTarget = monthsNames.indexOf(monthName);
            let targetYear = today.getFullYear();
            if (currentMonthIndex === 11 && mIdxTarget === 0) targetYear++;
            if (currentMonthIndex === 0 && mIdxTarget === 11) targetYear--;

            const deadline = new Date(targetYear, mIdxTarget, lateFeeDay);
            return today > deadline;
        };

        const lateStatus = checkLate(selectedMonth);
        let total = 0;
        let appliesSocial = false;

        children.forEach(kid => {
            const cleanCategory = kid.category.trim().toLowerCase();
            const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
            const price = activity ? activity.price : (activities[0]?.price || 40000);
            total += price;
            if (lateStatus) total += lateFeeAmount;
            if (activity && activity.social) appliesSocial = true;
        });

        if (appliesSocial) total += (config.socialFee || 3000);
        document.getElementById('payment-amount').value = total;

        // Actualizar visualmente la tabla en el modal
        const breakdownTbody = document.querySelector('#children-assignment .children-fees');
        if (breakdownTbody) {
            // Re-render table logic here or trigger a partial update
            // Para simplificar, actualizamos el input que es lo crítico.
        }
    });

    // Exportar Atletas
    document.getElementById('btn-export-athletes')?.addEventListener('click', async () => {
        const users = await window.DataManager.getUsers();
        let csv = 'Padre/Madre,Atleta,DNI,Categoria,Actividad,Telefono Atleta,Email,Padres,Tel Padres,Direccion\n';

        users.forEach(u => {
            if (u.athletes && u.athletes.length > 0) {
                u.athletes.forEach(a => {
                    csv += `"${u.name}","${a.name}","${a.dni || ''}","${a.category || ''}","${a.activity || ''}","${a.phone || ''}","${a.email || ''}","${a.parentsNames || ''}","${a.parentsPhone || ''}","${a.address || ''}"\n`;
                });
            } else if (u.children && u.role !== 'admin') {
                const kids = parseChildren(u.children);
                kids.forEach(k => {
                    csv += `"${u.name}","${k.name}","","${k.category}","","","","","",""\n`;
                });
            }
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Listado_Atletas_Correcaminos.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('Listado de atletas exportado');
    });

    // Confirmación de Reclazo
    document.getElementById('btn-reject-payment')?.addEventListener('click', () => {
        document.getElementById('reject-payment-modal').classList.add('active');
    });

    document.getElementById('btn-confirm-reject')?.addEventListener('click', async () => {
        if (!activePaymentForApproval) return;
        const reason = document.getElementById('reject-reason').value.trim() || 'No se especificó motivo.';

        const btn = document.getElementById('btn-confirm-reject');
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            await window.DataManager.updatePayment(activePaymentForApproval.id, {
                status: 'rejected',
                rejectReason: reason
            });
            document.getElementById('reject-payment-modal').classList.remove('active');
            document.getElementById('approve-payment-modal').classList.remove('active');
            toast('Pago rechazado correctamente', 'warning');
            renderAdminDashboard();
        } catch (e) {
            toast('Error al rechazar', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = "Confirmar Rechazo";
        }
    });

    // Añadir atleta manualmente
    document.getElementById('btn-add-athlete-manually')?.addEventListener('click', async () => {
        const config = await window.DataManager.getConfig();
        const activities = config.activities || [];

        document.getElementById('ath-index').value = '-1';
        const nameField = document.getElementById('ath-name');
        if (nameField) {
            nameField.value = '';
            nameField.readOnly = false;
            nameField.placeholder = "Nombre completo del niño/a";
        }

        const catField = document.getElementById('ath-category');
        if (catField) catField.value = 'Mayores';

        const actSelect = document.getElementById('ath-activity');
        if (actSelect) {
            actSelect.innerHTML = activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
        }

        ['ath-dni', 'ath-phone', 'ath-email', 'ath-parents-names', 'ath-parents-phone', 'ath-address'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        document.getElementById('athlete-modal').classList.add('active');
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
                <div style="display:flex; gap:0.5rem">
                    ${p.status === 'pending' ? `<button class="btn-action approve" data-id="${p.id}" title="Aprobar Pago"><i class="fas fa-check"></i></button>` : ''}
                    ${p.status === 'pending' ? `<button class="btn-action reject-quick" data-id="${p.id}" title="Rechazar Pago"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('stat-pending').innerText = pending;
    document.getElementById('stat-total').innerText = `$ ${total.toLocaleString('es-AR')}`;

    tbody.querySelectorAll('.approve').forEach(btn => btn.addEventListener('click', async () => {
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p) openApproveModal(p);
    }));

    tbody.querySelectorAll('.reject-quick').forEach(btn => btn.addEventListener('click', async () => {
        const p = payments.find(pay => pay.id === btn.dataset.id);
        if (p) {
            activePaymentForApproval = p;
            document.getElementById('reject-payment-modal').classList.add('active');
        }
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

    // Calcular esperado mensual
    const children = getChildList(currentUser);
    let monthlyExpected = 0;
    let appliesSocial = false;
    children.forEach(kid => {
        const cleanCategory = kid.category.trim().toLowerCase();
        const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
        monthlyExpected += activity ? activity.price : (activities[0]?.price || 0);
        if (activity && activity.social) appliesSocial = true;
    });
    if (appliesSocial) monthlyExpected += socialFee;

    // Control Panel Panel Summary
    const now = new Date();
    const allMonths = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Si es Enero, el sistema apunta a Febrero
    let currentMonthIndex = now.getMonth();
    if (currentMonthIndex === 0) currentMonthIndex = 1;
    const currentMonthName = allMonths[currentMonthIndex];

    const currentMonthPayment = payments.find(p => p.month === currentMonthName);
    const lastRejected = payments.filter(p => p.status === 'rejected').sort((a, b) => b.timestamp - a.timestamp)[0];

    const statusCard = document.querySelector('.stat-card.highlight');
    const statusIcon = statusCard.querySelector('.stat-icon i');
    if (statusCard) {
        if (lastRejected) {
            statusCard.style.background = 'linear-gradient(135deg, #e53e3e 0%, #9b2c2c 100%)';
            document.getElementById('user-cc-status').innerText = 'Revisar Pago';
            if (statusIcon) statusIcon.className = 'fas fa-exclamation-triangle';
        } else if (currentMonthPayment?.status === 'pending') {
            statusCard.style.background = 'linear-gradient(135deg, #ecc94b 0%, #b7791f 100%)';
            document.getElementById('user-cc-status').innerText = 'En Revisión';
            if (statusIcon) statusIcon.className = 'fas fa-hourglass-half';
        } else if (currentMonthPayment?.status === 'approved') {
            statusCard.style.background = 'linear-gradient(135deg, #38a169 0%, #22543d 100%)';
            document.getElementById('user-cc-status').innerText = 'Al Día';
            if (statusIcon) statusIcon.className = 'fas fa-check-double';
        } else {
            statusCard.style.background = 'linear-gradient(135deg, #2c5282 0%, #1a365d 100%)';
            document.getElementById('user-cc-status').innerText = 'Pendiente ' + currentMonthName;
            if (statusIcon) statusIcon.className = 'fas fa-calendar-day';
        }
    }

    // Mostrar alerta de rechazo si existe
    const breakdownContainer = document.getElementById('breakdown-container');
    if (lastRejected && breakdownContainer) {
        const alertHtml = `
            <div class="card" style="border-left: 5px solid var(--danger); background: #fff5f5; margin-bottom: 2rem;">
                <div class="card-body">
                    <h4 style="color: var(--danger);"><i class="fas fa-exclamation-circle"></i> Atención: Pago de ${lastRejected.month} Rechazado</h4>
                    <p style="margin-top:0.5rem"><b>Motivo:</b> ${lastRejected.rejectReason || 'No especificado'}</p>
                    <p class="text-sm" style="margin-top:0.5rem">Por favor, vuelve a informar el pago con los datos correctos.</p>
                </div>
            </div>`;
        breakdownContainer.insertAdjacentHTML('afterbegin', alertHtml);
    }

    // Línea de Tiempo Dinámica (Horizontal & Interactiva)
    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const timelineContainer = document.getElementById('user-yearly-timeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = '';
        months.forEach(m => {
            const hasPayment = payments.some(p => p.month === m && p.status === 'approved');
            const isPending = payments.some(p => p.month === m && p.status === 'pending');
            const isRejected = payments.some(p => p.month === m && p.status === 'rejected');
            const isCurrent = m === currentMonthName;

            const state = hasPayment ? 'paid' : (isRejected ? 'rejected' : (isPending ? 'pending' : 'idle'));

            const div = document.createElement('div');
            div.className = `timeline-item ${state} ${isCurrent ? 'active' : ''}`;
            div.innerHTML = `
                <div class="tm-dot"></div>
                <div class="tm-content">
                    <span class="tm-month">${m.substring(0, 3)}</span>
                    <span class="tm-status">${state === 'paid' ? 'Pagado' : (state === 'rejected' ? 'Rechazado' : (state === 'pending' ? 'En revisión' : 'Pendiente'))}</span>
                </div>
            `;
            timelineContainer.appendChild(div);
        });

        // Auto-scroll al mes actual
        setTimeout(() => {
            const active = timelineContainer.querySelector('.active');
            if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }, 300);
    }

    // Tabla de historial
    const tbody = document.querySelector('#payments-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
    payments.slice(0, 5).forEach(p => {
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
    const now = new Date();
    const currentMonthName = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][now.getMonth()];

    // Actualizar encabezados para resaltar mes actual
    const thead = document.querySelector('#admin-cc-table thead tr');
    if (thead) {
        let headers = `<th>Usuario</th>`;
        months.forEach(m => {
            const isCurrent = m === currentMonthName;
            headers += `<th class="month-col ${isCurrent ? 'current-month-col' : ''}">${m.substring(0, 3)}</th>`;
        });
        headers += `<th>Deuda Total</th>`;
        thead.innerHTML = headers;
    }

    users.forEach(u => {
        if (u.role === 'admin') return;

        const children = getChildList(u);
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

        const userPayments = payments.filter(p => p.userId === (u.id || u.username));

        months.forEach(m => {
            const paid = userPayments.filter(p => p.month === m && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
            const isFull = paid >= monthlyExpected && monthlyExpected > 0;
            const isPartial = paid > 0 && paid < monthlyExpected;
            const isDebt = paid === 0 && monthlyExpected > 0;
            const hasPending = userPayments.some(p => p.month === m && p.status === 'pending');
            const isCurrent = m === currentMonthName;

            if (isDebt || isPartial) totalDebt += (monthlyExpected - paid);

            monthTds += `
                <td class="month-col ${isCurrent ? 'current-month-col' : ''}">
                    <div class="status-check ${isFull ? 'ok' : (hasPending ? 'pending' : (isDebt ? 'debt' : 'void'))}" 
                         title="${m}: $ ${paid.toLocaleString('es-AR')} de $ ${monthlyExpected.toLocaleString('es-AR')} ${hasPending ? '(Hay un pago pendiente de revisión)' : ''}">
                        <i class="fas ${isFull ? 'fa-check' : (hasPending ? 'fa-clock' : (isDebt ? 'fa-dollar-sign' : 'fa-minus'))}"></i>
                    </div>
                </td>`;
        });

        const tr = document.createElement('tr');
        const childNames = children.map(c => `<li>${c.name} (${c.category})</li>`).join('');
        tr.innerHTML = `
            <td>
                <b>${u.name}</b><br>
                <ul style="margin:5px 0; padding:0 15px; font-size:0.75rem; color:#666;">${childNames || '<li>Sin atletas</li>'}</ul>
                <small>${u.username || u.id}</small>
            </td>
            ${monthTds}
            <td><b class="${totalDebt > 0 ? 'text-red' : 'text-green'}" style="font-size: 1.1rem">$ ${totalDebt.toLocaleString('es-AR')}</b></td>
        `;
        tbody.appendChild(tr);
    });
}
