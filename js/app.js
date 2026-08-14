/**
 * app.js - Lógica Principal (Versión Completa y Restaurada)
 */

let db = null;
let auth = null;
let currentUser = null;
let selectedTimelineMonth = null;

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

        // ACTIVACIÓN DE PERSISTENCIA OFFLINE EN FIRESTORE (PWA Native feature)
        db.enablePersistence({ synchronizeTabs: true })
            .then(() => {
                console.log("Persistencia local de Firestore activada con éxito.");
            })
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn("Múltiples pestañas abiertas. Persistencia activa solo en una pestaña.");
                } else if (err.code == 'unimplemented') {
                    console.warn("El navegador actual no soporta persistencia local.");
                }
            });

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
                try {
                    localStorage.setItem('correcaminos_session', JSON.stringify(currentUser));
                } catch (errStorage) {
                    console.warn("Storage lleno al actualizar sesión:", errStorage);
                }
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
    if (target) {
        target.classList.add('active');
        if (viewId === 'user-view') {
            document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('user-dashboard-tab')?.classList.add('active');
            const navLinks = target.querySelectorAll('.nav-link');
            navLinks.forEach(l => l.classList.remove('active'));
            const defaultNav = target.querySelector('.nav-link[data-target="user-dashboard-tab"]');
            if (defaultNav) defaultNav.classList.add('active');
        }
    }
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

function setupActivityPicker(containerId, pickerId, nameInputId, addBtnId, childrenStr = "") {
    const container = document.getElementById(containerId);
    const picker = document.getElementById(pickerId);
    const nameInput = document.getElementById(nameInputId);
    const addBtn = document.getElementById(addBtnId);
    if (!container || !picker) return;

    container.innerHTML = "";

    // Parse existing children
    const kids = parseChildren(childrenStr);
    kids.forEach((k) => {
        addActivityRow(container, k.category, k.name);
    });

    // Populate picker options
    window.DataManager.getConfig().then(config => {
        picker.innerHTML = '<option value="">Actividad...</option>' +
            config.activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
    });

    // Reset old listeners
    picker.onchange = null;

    // Button listener
    if (addBtn) {
        addBtn.onclick = () => {
            const activity = picker.value;
            const name = nameInput ? nameInput.value.trim() : "";
            if (!activity) {
                toast("Selecciona una actividad", "error");
                return;
            }
            addActivityRow(container, activity, name || `Atleta ${container.children.length + 1}`);
            if (nameInput) nameInput.value = "";
            picker.value = "";
        };
    }
}

function addActivityRow(container, activity, name = "") {
    const item = document.createElement('div');
    item.className = 'activity-picker-item';
    item.dataset.activity = activity;
    item.innerHTML = `
        <span>${name} (${activity})</span>
        <button type="button" class="btn-remove-activity" title="Eliminar">
            <i class="fas fa-trash-alt"></i>
        </button>
    `;
    item.querySelector('.btn-remove-activity').onclick = () => item.remove();
    container.appendChild(item);
}

function getActivitiesFromList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return "";
    const rows = container.querySelectorAll('.activity-picker-item');
    return Array.from(rows).map((row) => {
        const span = row.querySelector('span');
        return span ? span.innerText : "";
    }).join(', ');
}

function getChildList(user) {
    if (user.athletes && user.athletes.length > 0) {
        return user.athletes.map(a => ({
            name: a.name,
            category: a.activity || a.category || 'Mayores',
            discountType: a.discountType || 'none',
            discountValue: parseFloat(a.discountValue || 0),
            discountReason: a.discountReason || ''
        }));
    }
    return parseChildren(user.children);
}

function getFirstPendingMonth(payments, currentMonthName) {
    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    for (const m of months) {
        const mPayments = payments.filter(p => p.month === m).sort((a, b) => b.timestamp - a.timestamp);
        const latestStatus = mPayments.length > 0 ? mPayments[0].status : 'idle';
        if (latestStatus !== 'approved') {
            return m;
        }
    }
    return currentMonthName;
}

async function updateUI() {
    if (!currentUser) return;
    try {
        // Refrescar datos del usuario desde la nube si está conectado
        if (window.DataManager.db && currentUser.id !== 'local_admin') {
            const freshUser = await window.DataManager.getUser(currentUser.id);
            if (freshUser) {
                currentUser = freshUser;
                try {
                    localStorage.setItem('correcaminos_session', JSON.stringify(currentUser));
                } catch (errStorage) {
                    console.warn("Storage lleno al actualizar sesión en updateUI:", errStorage);
                }
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
            const payments = await window.DataManager.getPaymentsByUser(currentUser.id);
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
            const defaultMonthIndex = currentMonthIndex === 0 ? 1 : currentMonthIndex;
            const defaultMonthName = monthsNames[defaultMonthIndex];

            // Usar el mes seleccionado en la línea de tiempo, con fallback al mes por defecto
            const displayMonthName = selectedTimelineMonth || defaultMonthName;

            // Comprobar el estado del pago para el mes seleccionado
            const mPayments = payments.filter(p => p.month === displayMonthName).sort((a, b) => b.timestamp - a.timestamp);
            const paymentForMonth = mPayments.length > 0 ? mPayments[0] : null;
            const isPaid = paymentForMonth && paymentForMonth.status === 'approved';
            const isPending = paymentForMonth && paymentForMonth.status === 'pending';
            const isRejected = paymentForMonth && paymentForMonth.status === 'rejected';

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

            const lateStatus = !isPaid && !isPending && checkLate(displayMonthName);

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
                if (isPaid || isPending) {
                    // Si ya se registró el pago, obtenemos el recargo real que se cobró/informó.
                    const totalLatePaid = paymentForMonth.lateFeeAmount || 0;
                    kidLateFee = children.length > 0 ? (totalLatePaid / children.length) : 0;
                } else if (lateStatus) {
                    kidLateFee = lateFeeAmount;
                }

                totalLateFees += kidLateFee;

                if (activity && activity.social) {
                    appliesSocialFee = true;
                    if (!activitiesWithSocial.includes(activity.name)) activitiesWithSocial.push(activity.name);
                }
                totalActivitiesCost += price;

                // Determinar Logo
                let logoSrc = 'img/Nuevo Logo Correcaminos.jpeg'; // Use the new logo for everything

                // El HTML de la mora cambia de estilo según si ya está pago/pendiente o no
                let moraHtml = '';
                if (kidLateFee > 0) {
                    if (isPaid) {
                        moraHtml = `<br><span class="text-xs" style="color:var(--success); font-weight:600;"><i class="fas fa-check-circle"></i> + Recargo Mora (Cobrado)</span>`;
                    } else if (isPending) {
                        moraHtml = `<br><span class="text-xs" style="color:var(--warning); font-weight:600;"><i class="fas fa-hourglass-half"></i> + Recargo Mora (En revisión)</span>`;
                    } else {
                        moraHtml = `<br><span class="text-xs" style="color:var(--danger); font-weight:600;"><i class="fas fa-clock"></i> + Recargo Mora</span>`;
                    }
                }

                tableRowsHtml += `
                    <tr>
                        <td>
                            <div class="child-info" style="display:flex; align-items:center; gap:1rem;">
                                <img src="${logoSrc}" class="child-logo" alt="Logo" style="width:40px; height:40px; border-radius:50%;">
                                <div>
                                    <b>${kid.name}</b> <br>
                                    <span class="cost-tag" style="font-size:0.8rem; color:#666;">${kid.category}</span>
                                    ${moraHtml}
                                </div>
                            </div>
                        </td>
                        <td align="right" style="vertical-align: bottom;">
                            $ ${price.toLocaleString('es-AR')}
                            ${kidLateFee > 0 ? `<br><small style="color:${isPaid ? 'var(--success)' : (isPending ? 'var(--warning)' : 'var(--danger)')}">+$ ${kidLateFee.toLocaleString('es-AR')}</small>` : ''}
                        </td>
                    </tr>`;
            });

            const socialFee = appliesSocialFee ? (isPaid || isPending ? (paymentForMonth.socialFeeAmount || 0) : (config.socialFee || 0)) : 0;
            const finalTotal = isPaid || isPending ? paymentForMonth.amount : (totalActivitiesCost + socialFee + totalLateFees);

            // Ajustar textos del desglose según estado del pago
            let titleSuffix = '';
            let totalLabel = 'Total a abonar:';
            let totalColor = 'var(--primary)';
            if (isPaid) {
                titleSuffix = ' <span class="badge badge-approved" style="font-size:0.8rem; margin-left:0.5rem;"><i class="fas fa-check-circle"></i> PAGADA</span>';
                totalLabel = 'Total abonado:';
                totalColor = 'var(--success)';
            } else if (isPending) {
                titleSuffix = ' <span class="badge badge-pending" style="font-size:0.8rem; margin-left:0.5rem;"><i class="fas fa-hourglass-half"></i> EN REVISIÓN</span>';
                totalLabel = 'Total informado:';
                totalColor = 'var(--warning)';
            } else if (isRejected) {
                titleSuffix = ' <span class="badge badge-rejected" style="font-size:0.8rem; margin-left:0.5rem;"><i class="fas fa-times-circle"></i> RECHAZADA</span>';
                totalLabel = 'Total a abonar:';
                totalColor = 'var(--danger)';
            }

            if (breakdownContainer) {
                breakdownContainer.innerHTML = `
                    <div class="card" style="margin-top: 2rem;">
                        <div class="card-header">
                            <div>
                                <h3>Desglose Detallado - Cuota ${displayMonthName}${titleSuffix}</h3>
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
                                <span style="font-weight: 700; font-size: 1.1rem;">${totalLabel}</span>
                                <span style="font-weight: 800; font-size: 1.5rem; color: ${totalColor};">$ ${finalTotal.toLocaleString('es-AR')}</span>
                            </div>
                            ${(!lateStatus && !isPaid && !isPending) ? `<p class="text-xs" style="margin-top: 1rem; color: var(--success);"><i class="fas fa-info-circle"></i> Tienes hasta el día ${lateFeeDay} para abonar sin recargo por mora.</p>` : ''}
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
            const isComplete = data.dni && data.address && data.parentsPhone && data.medicalCert && data.rulesAccepted;

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
                    <p><strong>F. Nac:</strong> ${data.birthdate || '---'}</p>
                    <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem;">
                        <span class="badge ${data.medicalCert ? 'badge-approved' : 'badge-pending'}" style="font-size: 0.7rem;">
                            <i class="fas ${data.medicalCert ? 'fa-check-circle' : 'fa-times-circle'}"></i> Cert. Médico
                        </span>
                        <span class="badge ${data.rulesAccepted ? 'badge-approved' : 'badge-pending'}" style="font-size: 0.7rem;">
                            <i class="fas ${data.rulesAccepted ? 'fa-check-circle' : 'fa-times-circle'}"></i> Reglamento
                        </span>
                    </div>
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
                document.getElementById('ath-birthdate').value = data.birthdate || '';
                document.getElementById('ath-phone').value = data.phone || '';
                document.getElementById('ath-email').value = data.email || '';
                document.getElementById('ath-parents-names').value = data.parentsNames || '';
                document.getElementById('ath-parents-phone').value = data.parentsPhone || '';
                document.getElementById('ath-address').value = data.address || '';
                document.getElementById('ath-rules-accepted').checked = data.rulesAccepted || false;

                // Reset medical cert status in modal
                const certStatus = document.getElementById('medical-cert-status');
                const certName = document.getElementById('medical-cert-name');
                if (data.medicalCert) {
                    certStatus.style.display = 'block';
                    certName.innerText = "Certificado cargado (Toca para cambiar)";
                    document.getElementById('athlete-modal').dataset.tempCert = data.medicalCert;
                    const viewLink = document.getElementById('view-medical-cert');
                    if (viewLink) {
                        viewLink.href = data.medicalCert;
                        viewLink.style.display = 'inline';
                    }
                } else {
                    certStatus.style.display = 'none';
                    certName.innerText = "Toca para adjuntar certificado";
                    delete document.getElementById('athlete-modal').dataset.tempCert;
                    const viewLink = document.getElementById('view-medical-cert');
                    if (viewLink) viewLink.style.display = 'none';
                }

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
                ${athletes.map((a, idx) => {
                    let discountBadge = '';
                    if (a.discountType === 'full') discountBadge = ' <small style="color:#15803d; font-weight:700;">[🏅 Beca 100%]</small>';
                    else if (a.discountType === 'percent' && a.discountValue > 0) discountBadge = ` <small style="color:#15803d; font-weight:700;">[🏷️ ${a.discountValue}% OFF]</small>`;
                    else if (a.discountType === 'fixed' && a.discountValue > 0) discountBadge = ` <small style="color:#15803d; font-weight:700;">[💵 -$${a.discountValue}]</small>`;

                    return `
                    <div class="mini-athlete-pill" onclick="openAdminAthleteFile('${id}', ${idx})">
                        <i class="fas fa-id-card"></i> ${a.name} <small>(${a.activity || a.category})</small>${discountBadge}
                    </div>`;
                }).join('')}
            </div>`;
        } else if (u.children && u.children.trim() !== "") {
            athletesHtml = `<small style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Pendiente migrar: ${u.children}</small>`;
        } else {
            athletesHtml = `<small style="color:var(--text-muted)">Sin atletas registrados</small>`;
        }

        const isPaused = u.paused === true;
        const statusBadge = isPaused ? 
            `<span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca;"><i class="fas fa-pause-circle"></i> PAUSADO</span>` : 
            `<span class="badge badge-approved" style="background:#dcfce7; color:#166534;"><i class="fas fa-check-circle"></i> ACTIVO</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="user-main-info">
                    <span class="user-name">${u.name} ${isPaused ? '<small style="color:var(--danger); font-weight:bold;">(Pausado)</small>' : ''}</span>
                    <span class="user-id">@${u.username || u.id}</span>
                </div>
            </td>
            <td>
                ${athletesHtml}
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:flex-start;">
                    ${statusBadge}
                    <small style="color:var(--text-muted); font-size:0.7rem;">${u.role.toUpperCase()}</small>
                </div>
            </td>
            <td>
                <div style="display:flex; gap:0.5rem">
                    <button class="btn-action btn-toggle-pause" data-id="${id}" title="${isPaused ? 'Reactivar usuario (volverá a generar cuotas)' : 'Pausar usuario (no generará cuotas ni deuda)'}" style="color:${isPaused ? 'var(--success)' : '#d97706'}">
                        <i class="fas ${isPaused ? 'fa-play' : 'fa-pause'}"></i>
                    </button>
                    <button class="btn-action edit btn-edit-user" data-id="${id}" title="Editar cuenta y clave"><i class="fas fa-user-edit"></i></button> 
                    <button class="btn-action reject btn-del-user" data-id="${id}" title="Eliminar usuario" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    // Eventos
    tbody.querySelectorAll('.btn-toggle-pause').forEach(btn => btn.addEventListener('click', async () => {
        const user = users.find(u => (u.id || u.username) === btn.dataset.id);
        if (!user) return;

        const newPausedState = !user.paused;
        const actionWord = newPausedState ? 'PAUSAR' : 'REACTIVAR';
        const msg = newPausedState ? 
            `¿PAUSAR temporalmente a ${user.name}?\n\nMientras esté pausado, NO se le calculará cuota esperada ni se considerará como deuda en ningún mes.` :
            `¿REACTIVAR a ${user.name}?\n\nVolverá a figurar activo y se le calculará la cuota correspondiente.`;

        if (confirm(msg)) {
            user.paused = newPausedState;
            const uid = user.id || user.username;
            await window.DataManager.saveUser(uid, user);
            toast(`Usuario ${newPausedState ? 'Pausado' : 'Reactivado'} con éxito`);
            renderAdminUsers();
            renderAdminCC(); // Refrescar Cuenta Corriente también
        }
    }));

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
    document.getElementById('ath-birthdate').value = athlete.birthdate || '';
    document.getElementById('ath-phone').value = athlete.phone || '';
    document.getElementById('ath-email').value = athlete.email || '';
    document.getElementById('ath-parents-names').value = athlete.parentsNames || '';
    document.getElementById('ath-parents-phone').value = athlete.parentsPhone || '';
    document.getElementById('ath-address').value = athlete.address || '';
    document.getElementById('ath-rules-accepted').checked = athlete.rulesAccepted || false;

    // Cargar datos de Beca / Bonificación
    if (document.getElementById('ath-discount-type')) {
        document.getElementById('ath-discount-type').value = athlete.discountType || 'none';
        document.getElementById('ath-discount-value').value = athlete.discountValue || 0;
        document.getElementById('ath-discount-reason').value = athlete.discountReason || '';
    }

    // Reset medical cert status in modal
    const certStatus = document.getElementById('medical-cert-status');
    const certName = document.getElementById('medical-cert-name');
    if (athlete.medicalCert) {
        certStatus.style.display = 'block';
        certName.innerText = "Certificado cargado (Toca para cambiar)";
        document.getElementById('athlete-modal').dataset.tempCert = athlete.medicalCert;
        const viewLink = document.getElementById('view-medical-cert');
        if (viewLink) {
            viewLink.href = athlete.medicalCert;
            viewLink.style.display = 'inline';
        }
    } else {
        certStatus.style.display = 'none';
        certName.innerText = "No hay certificado cargado";
        delete document.getElementById('athlete-modal').dataset.tempCert;
        const viewLink = document.getElementById('view-medical-cert');
        if (viewLink) viewLink.style.display = 'none';
    }

    document.getElementById('athlete-modal').classList.add('active');
}

function openEditUserModal(user) {
    document.getElementById('edit-u-id').value = user.id || user.username;
    document.getElementById('edit-u-name').value = user.name || '';
    document.getElementById('edit-u-username').value = user.username || '';
    setupActivityPicker('edit-u-activities-list', 'edit-u-activity-picker', 'edit-u-ath-name-input', 'btn-edit-u-add-activity', user.children || '');
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

    // Navegación General (Admin y Socio)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.dataset.target;
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            // 1. Cambiar visualmente de pestaña de forma instantánea sin esperar a la red (0 ms delay)
            if (targetEl.classList.contains('admin-tab')) {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                targetEl.classList.add('active');
            } else if (targetEl.classList.contains('user-tab')) {
                document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                targetEl.classList.add('active');
                if (targetId === 'user-benefits-tab') renderUserBenefits();
                if (targetId === 'user-finance-tab' || targetId === 'user-profile-tab') updateUI();
            }

            link.parentElement.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // 2. Cargar/Actualizar datos en segundo plano de manera asíncrona no bloqueante
            setTimeout(() => {
                if (targetId === 'admin-cc') renderAdminCC();
                else if (targetId === 'admin-benefits') renderAdminBenefits();
                else if (targetId === 'user-benefits-tab') renderUserBenefits();
            }, 10);
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
            children: getActivitiesFromList('reg-activities-list'),
            password: document.getElementById('reg-pass').value,
            role: document.getElementById('reg-role').value
        });
        document.getElementById('user-modal').classList.remove('active');
        toast('Usuario creado'); renderAdminUsers(); e.target.reset();
    });

    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-u-id').value;
        const existingUser = (await window.DataManager.getUser(id)) || {};
        await window.DataManager.saveUser(id, {
            ...existingUser,
            name: document.getElementById('edit-u-name').value,
            username: document.getElementById('edit-u-username').value.toLowerCase().trim(),
            children: getActivitiesFromList('edit-u-activities-list'),
            password: document.getElementById('edit-u-pass').value,
            role: document.getElementById('edit-u-role').value
        });
        document.getElementById('edit-user-modal').classList.remove('active');
        toast('Actualizado'); renderAdminUsers();
    });

    document.getElementById('btn-add-user')?.addEventListener('click', () => {
        setupActivityPicker('reg-activities-list', 'reg-activity-picker', 'reg-ath-name-input', 'btn-reg-add-activity', "");
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

    document.getElementById('btn-fix-payment-data')?.addEventListener('click', async () => {
        if (!confirm("Esta herramienta actualizará todos los pagos antiguos en la base de datos para separar Cuota Social de Actividades basado en la configuración actual. ¿Continuar?")) return;

        const btn = document.getElementById('btn-fix-payment-data');
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            const payments = await window.DataManager.getPayments();
            const config = await window.DataManager.getConfig();
            const activities = config.activities || [];
            const socialFee = config.socialFee || 5000;
            let count = 0;

            for (let p of payments) {
                if (p.socialFeeAmount === undefined || p.socialFeeAmount === null) {
                    const kids = parseChildren(p.childrenNames || '');
                    const hasSocial = kids.some(k => {
                        const actName = (k.category || '').toLowerCase();
                        const actMatch = activities.find(a =>
                            a.name.toLowerCase() === actName ||
                            actName.includes(a.name.toLowerCase()) ||
                            a.name.toLowerCase().includes(actName)
                        );
                        return actMatch ? actMatch.social : true;
                    });

                    const sFee = hasSocial ? socialFee : 0;
                    const aFee = Math.max(0, (p.amount || 0) - sFee);

                    await window.DataManager.updatePayment(p.id, {
                        socialFeeAmount: sFee,
                        activitiesFeeAmount: aFee,
                        lateFeeAmount: 0
                    });
                    count++;
                }
            }
            alert(`✅ Se actualizaron ${count} registros de pago con éxito.`);
            renderAdminDashboard();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-tools"></i> Reparar Desglose de Pagos Históricos';
        }
    });



    // Pagos
    document.getElementById('payment-report-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const method = document.getElementById('payment-method').value;
        const month = document.getElementById('payment-month').value;
        const amount = parseInt(document.getElementById('payment-amount').value);
        const file = document.getElementById('payment-receipt').files[0];

        if (method === 'Transferencia' && !file) {
            alert("Por favor selecciona una foto del comprobante para transferencias.");
            return;
        }

        btn.disabled = true;
        try {
            const receipt = file ? await window.DataManager.fileToBase64(file) : null;
            const breakdown = await window.calculateBreakdown(currentUser.id, month, amount);

            await window.DataManager.addPayment({
                userId: currentUser.id,
                userName: currentUser.name,
                childrenNames: currentUser.children || 'Hijos',
                month: month,
                amount: amount,
                socialFeeAmount: breakdown.social,
                activitiesFeeAmount: breakdown.activities,
                paymentMethod: method,
                status: 'pending',
                receiptURL: receipt
            });
            document.getElementById('payment-modal').classList.remove('active');
            updateUI();
            toast('Pago informado');
        } catch (e) { toast('Error', 'error'); } finally { btn.disabled = false; }
    });

    document.getElementById('btn-report-payment')?.addEventListener('click', () => {
        const modal = document.getElementById('payment-modal');
        const monthSelect = document.getElementById('payment-month');
        
        if (monthSelect) {
            window.DataManager.getPaymentsByUser(currentUser.id).then(payments => {
                const now = new Date();
                const allMonths = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                let currentMonthIndex = now.getMonth();
                if (currentMonthIndex === 0) currentMonthIndex = 1;
                const currentMonthName = allMonths[currentMonthIndex];
                
                const targetMonth = selectedTimelineMonth || currentMonthName;
                const mPayments = payments.filter(p => p.month === targetMonth);
                const isPaidOrPending = mPayments.length > 0 && (mPayments[0].status === 'approved' || mPayments[0].status === 'pending');
                
                if (isPaidOrPending) {
                    monthSelect.value = getFirstPendingMonth(payments, currentMonthName);
                } else {
                    monthSelect.value = targetMonth;
                }
                
                monthSelect.dispatchEvent(new Event('change'));
            });
        }
        
        modal.classList.add('active');
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
    document.getElementById('file-upload-zone')?.addEventListener('click', () => {
        if (document.getElementById('payment-method').value === 'Efectivo') {
            toast('No es necesario subir comprobante para pagos en efectivo', 'info');
            return;
        }
        document.getElementById('payment-receipt').click();
    });
    document.getElementById('payment-receipt')?.addEventListener('change', (e) => {
        if (e.target.files[0]) document.getElementById('file-name').innerText = e.target.files[0].name;
    });

    document.getElementById('payment-method')?.addEventListener('change', (e) => {
        const uploadZone = document.getElementById('file-upload-zone');
        const fileName = document.getElementById('file-name');
        if (e.target.value === 'Efectivo') {
            uploadZone.style.opacity = '0.5';
            uploadZone.style.pointerEvents = 'none';
            uploadZone.style.background = '#f1f5f9';
            fileName.innerText = "No requerido para efectivo";
            document.getElementById('payment-receipt').value = ""; // Clear file
        } else {
            uploadZone.style.opacity = '1';
            uploadZone.style.pointerEvents = 'auto';
            uploadZone.style.background = '';
            fileName.innerText = "";
        }
    });

    // Certificado Médico
    document.getElementById('medical-cert-upload-zone')?.addEventListener('click', () => document.getElementById('ath-medical-cert').click());
    document.getElementById('ath-medical-cert')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const base64 = await window.DataManager.fileToBase64(file);
            document.getElementById('athlete-modal').dataset.tempCert = base64;
            document.getElementById('medical-cert-name').innerText = file.name;
            document.getElementById('medical-cert-status').style.display = 'block';
            document.getElementById('medical-cert-badge').innerHTML = '<i class="fas fa-check"></i> Certificado listo para guardar';
            const viewLink = document.getElementById('view-medical-cert');
            if (viewLink) {
                viewLink.href = base64;
                viewLink.style.display = 'inline';
            }
        }
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
            // Recalcular breakdown para el monto final aprobado
            const breakdown = await window.calculateBreakdown(activePaymentForApproval.userId, activePaymentForApproval.month, finalAmount);

            await window.DataManager.updatePayment(activePaymentForApproval.id, {
                status: 'approved',
                amount: finalAmount,
                socialFeeAmount: breakdown.social,
                activitiesFeeAmount: breakdown.activities,
                lateFeeAmount: breakdown.late
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

    // Helper Global para cálculos de cuotas
    window.calculateBreakdown = async (userId, month, totalAmount) => {
        const config = await window.DataManager.getConfig();
        const user = await window.DataManager.getUser(userId) || currentUser;
        const children = getChildList(user);
        const activities = config.activities || [];

        let hasSocial = false;
        children.forEach(k => {
            const act = activities.find(a => a.name.toLowerCase() === k.category.toLowerCase());
            if (act && act.social) hasSocial = true;
        });

        const socialFee = hasSocial ? (config.socialFee || 0) : 0;
        // Si el total es menor a la cuota social (raro), la cuota social es el total
        const finalSocial = Math.min(socialFee, totalAmount);
        const remaining = totalAmount - finalSocial;

        return {
            social: finalSocial,
            activities: remaining,
            late: 0 // Simplificado para el breakdown de reportes
        };
    };
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
            birthdate: document.getElementById('ath-birthdate').value,
            phone: document.getElementById('ath-phone').value,
            email: document.getElementById('ath-email').value,
            parentsNames: document.getElementById('ath-parents-names').value,
            parentsPhone: document.getElementById('ath-parents-phone').value,
            address: document.getElementById('ath-address').value,
            category: document.getElementById('ath-category').value,
            activity: document.getElementById('ath-activity').value,
            discountType: document.getElementById('ath-discount-type')?.value || 'none',
            discountValue: parseFloat((document.getElementById('ath-discount-value')?.value || '0').replace(/[^0-9.]/g, '')) || 0,
            discountReason: document.getElementById('ath-discount-reason')?.value || '',
            rulesAccepted: document.getElementById('ath-rules-accepted').checked,
            medicalCert: modal.dataset.tempCert || null
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
        let children = getChildList(currentUser);
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
            let price = activity ? activity.price : (activities[0]?.price || 40000);

            // Aplicar Bonificación / Beca del atleta
            if (kid.discountType === 'full') {
                price = 0;
            } else if (kid.discountType === 'percent' && kid.discountValue > 0) {
                price = Math.max(0, price * (1 - (kid.discountValue / 100)));
            } else if (kid.discountType === 'fixed' && kid.discountValue > 0) {
                price = Math.max(0, price - kid.discountValue);
            }

            total += price;
            if (lateStatus && price > 0) total += lateFeeAmount;
            if (activity && activity.social && kid.discountType !== 'full') appliesSocial = true;
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
        let csv = 'Padre/Madre,Atleta,DNI,F.Nac,Categoria,Actividad,Telefono Atleta,Email,Padres,Tel Padres,Direccion,Reglamento,Cert Medico\n';

        users.forEach(u => {
            if (u.athletes && u.athletes.length > 0) {
                u.athletes.forEach(a => {
                    csv += `"${u.name}","${a.name}","${a.dni || ''}","${a.birthdate || ''}","${a.category || ''}","${a.activity || ''}","${a.phone || ''}","${a.email || ''}","${a.parentsNames || ''}","${a.parentsPhone || ''}","${a.address || ''}","${a.rulesAccepted ? 'SI' : 'NO'}","${a.medicalCert ? 'SI' : 'NO'}"\n`;
                });
            } else if (u.children && u.role !== 'admin') {
                const kids = parseChildren(u.children);
                kids.forEach(k => {
                    csv += `"${u.name}","${k.name}","","","${k.category}","","","","","","","NO","NO"\n`;
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

        ['ath-dni', 'ath-birthdate', 'ath-phone', 'ath-email', 'ath-parents-names', 'ath-parents-phone', 'ath-address'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('ath-rules-accepted').checked = false;
        document.getElementById('medical-cert-status').style.display = 'none';
        document.getElementById('medical-cert-name').innerText = "Toca para adjuntar certificado";
        delete document.getElementById('athlete-modal').dataset.tempCert;

        document.getElementById('athlete-modal').classList.add('active');
    });

    // Cerrar modal al hacer clic fuera del contenido
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', (e) => {
            if (e.target === m) {
                m.classList.remove('active');
                if (m.id === 'athlete-modal') delete m.dataset.editingUserId;
            }
        });
    });

    // Toggle visibilidad de contraseña
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.onclick = () => {
            const input = document.getElementById(btn.dataset.target);
            if (input.type === 'password') {
                input.type = 'text';
                btn.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                btn.classList.replace('fa-eye-slash', 'fa-eye');
            }
        };
    });

    // Admin: Registrar/Editar Convenio
    document.getElementById('btn-add-partner')?.addEventListener('click', () => {
        document.getElementById('partner-modal-title').innerText = "Registrar Convenio";
        document.getElementById('partner-edit-id').value = "";
        document.getElementById('partner-form').reset();
        
        // Reset logo elements
        const modal = document.getElementById('partner-modal');
        if (modal) {
            delete modal.dataset.tempLogo;
        }
        const previewContainer = document.getElementById('partner-logo-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        const previewImg = document.getElementById('partner-logo-preview');
        if (previewImg) previewImg.src = '';
        const logoName = document.getElementById('partner-logo-name');
        if (logoName) logoName.innerText = "Toca para seleccionar imagen";

        document.getElementById('partner-modal').classList.add('active');
    });

    // Drag & Drop / Seleccionar Logo de Convenio
    const partnerLogoUploadZone = document.getElementById('partner-logo-upload-zone');
    const partnerLogoFile = document.getElementById('partner-logo-file');
    
    partnerLogoUploadZone?.addEventListener('click', () => partnerLogoFile.click());
    
    partnerLogoUploadZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        partnerLogoUploadZone.style.borderColor = 'var(--primary)';
        partnerLogoUploadZone.style.background = 'hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.05)';
    });
    
    partnerLogoUploadZone?.addEventListener('dragleave', () => {
        partnerLogoUploadZone.style.borderColor = 'var(--border)';
        partnerLogoUploadZone.style.background = 'white';
    });
    
    partnerLogoUploadZone?.addEventListener('drop', async (e) => {
        e.preventDefault();
        partnerLogoUploadZone.style.borderColor = 'var(--border)';
        partnerLogoUploadZone.style.background = 'white';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await handlePartnerLogoFile(file);
        }
    });

    partnerLogoFile?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await handlePartnerLogoFile(file);
        }
    });

    async function handlePartnerLogoFile(file) {
        try {
            const base64 = await window.DataManager.fileToBase64(file);
            const modal = document.getElementById('partner-modal');
            if (modal) modal.dataset.tempLogo = base64;
            
            const logoName = document.getElementById('partner-logo-name');
            if (logoName) logoName.innerText = file.name;
            
            const preview = document.getElementById('partner-logo-preview');
            if (preview) preview.src = base64;
            
            const previewContainer = document.getElementById('partner-logo-preview-container');
            if (previewContainer) previewContainer.style.display = 'block';
        } catch (err) {
            console.error('Error al procesar la imagen:', err);
            if (typeof toast === 'function') toast('Error al procesar la imagen', 'error');
        }
    }

    document.getElementById('partner-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('partner-edit-id').value;
        const id = editId || 'partner_' + Date.now();
        const modal = document.getElementById('partner-modal');
        const logoURL = modal ? (modal.dataset.tempLogo || null) : null;
        
        const partnerData = {
            name: document.getElementById('partner-name').value,
            category: document.getElementById('partner-category').value,
            discountDetail: document.getElementById('partner-discount').value,
            description: document.getElementById('partner-description').value,
            type: document.getElementById('partner-type').value,
            logoURL: logoURL,
            active: document.getElementById('partner-active').value === 'true'
        };

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerText = "Guardando...";

        try {
            await window.DataManager.savePartner(id, partnerData);
            document.getElementById('partner-modal').classList.remove('active');
            toast(editId ? 'Convenio actualizado' : 'Convenio creado');
            renderAdminBenefits();
        } catch (err) {
            toast('Error al guardar', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = "Guardar Convenio";
        }
    });

    // Cerrar modal con tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                activeModal.classList.remove('active');
                if (activeModal.id === 'athlete-modal') delete activeModal.dataset.editingUserId;
            }
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
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];
    const socialFee = config.socialFee || 5000;

    const tbody = document.querySelector('#admin-payments-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
    const fStatus = document.getElementById('filter-status').value;
    const fMonth = document.getElementById('filter-month').value;

    let total = 0;
    let socialTotal = 0;
    let activitiesTotal = 0;
    let pending = 0;

    payments.forEach(p => {
        if (fStatus !== 'all' && p.status !== fStatus) return;
        if (fMonth !== 'all' && p.month !== fMonth) return;

        const isApproved = p.status === 'approved';
        const isManual = p.isManualCollection === true;

        if (isApproved) {
            total += (p.amount || 0);

            let sFee = p.socialFeeAmount;
            let aFee = p.activitiesFeeAmount;

            // Smart Backfill: Si no tiene el desglose, lo calculamos sobre la marcha
            if (sFee === undefined || sFee === null) {
                const kids = parseChildren(p.childrenNames || '');
                const hasSocial = kids.some(k => {
                    const actName = k.category.toLowerCase();
                    const actMatch = activities.find(a =>
                        a.name.toLowerCase() === actName ||
                        actName.includes(a.name.toLowerCase()) ||
                        a.name.toLowerCase().includes(actName)
                    );
                    return actMatch ? actMatch.social : true;
                });

                sFee = hasSocial ? socialFee : 0;
                aFee = Math.max(0, (p.amount || 0) - sFee);
            }

            socialTotal += (sFee || 0);
            activitiesTotal += (aFee || 0);
        }

        if (p.status === 'pending') pending++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.date}</td>
            <td><b>${p.userName}</b><br><small>${p.childrenNames || ''}</small></td>
            <td>${p.month}</td>
            <td>$ ${(p.amount || 0).toLocaleString('es-AR')}</td>
            <td>
                <span class="badge" style="background: ${isManual ? '#8b5cf6' : (p.paymentMethod === 'Efectivo' ? '#94a3b8' : '#3b82f6')}; color: white;">
                    ${isManual ? 'Manual (Sin Caja)' : (p.paymentMethod || 'Transf.')}
                </span>
            </td>
            <td>${p.receiptURL ? `<button class="btn-text btn-view-admin-photo" data-id="${p.id}"><i class="fas fa-image"></i> Ver Foto</button>` : (isManual ? '<i class="fas fa-user-edit"></i> Admin' : '---')}</td>
            <td><span class="badge badge-${p.status}">${statusMap[p.status]}</span></td>
            <td>
                <div style="display:flex; gap:0.5rem">
                    ${p.status === 'pending' ? `<button class="btn-action approve" data-id="${p.id}" title="Aprobar Pago"><i class="fas fa-check"></i></button>` : ''}
                    ${p.status === 'pending' ? `<button class="btn-action reject-quick" data-id="${p.id}" title="Rechazar Pago"><i class="fas fa-times"></i></button>` : ''}
                    ${isApproved ? `<button class="btn-action reject" onclick="window.deletePayment('${p.id}')" title="Eliminar Registro" style="background:#fee2e2; color:#ef4444; border:none; border-radius:4px; cursor:pointer; width:30px; height:30px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('stat-pending').innerText = pending;
    document.getElementById('stat-total').innerText = `$ ${total.toLocaleString('es-AR')}`;
    const socialEl = document.getElementById('stat-social-total');
    if (socialEl) socialEl.innerText = `$ ${socialTotal.toLocaleString('es-AR')}`;
    const activitiesEl = document.getElementById('stat-activities-total');
    if (activitiesEl) activitiesEl.innerText = `$ ${activitiesTotal.toLocaleString('es-AR')}`;

    // Re-bind listeners
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
    document.getElementById('approve-method').innerText = payment.paymentMethod || 'Transferencia';
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
    const activeRejections = payments.filter(p => p.status === 'rejected').filter(rej => {
        const newerPayment = payments.find(p =>
            p.month === rej.month &&
            (p.status === 'approved' || p.status === 'pending') &&
            p.timestamp > rej.timestamp
        );
        return !newerPayment;
    });
    const lastRejected = activeRejections.sort((a, b) => b.timestamp - a.timestamp)[0];

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

    // Inicializar el mes seleccionado de la línea de tiempo si es nulo
    if (!selectedTimelineMonth) {
        selectedTimelineMonth = getFirstPendingMonth(payments, currentMonthName);
    }

    // Línea de Tiempo Dinámica (Horizontal & Interactiva)
    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const timelineContainer = document.getElementById('user-yearly-timeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = '';
        months.forEach(m => {
            const mPayments = payments.filter(p => p.month === m).sort((a, b) => b.timestamp - a.timestamp);
            const latestStatus = mPayments.length > 0 ? mPayments[0].status : 'idle';
            const isSelected = m === selectedTimelineMonth;

            const state = latestStatus === 'approved' ? 'paid' : (latestStatus === 'rejected' ? 'rejected' : (latestStatus === 'pending' ? 'pending' : 'idle'));

            const div = document.createElement('div');
            div.className = `timeline-item ${state} ${isSelected ? 'active' : ''}`;
            div.style.cursor = 'pointer';
            div.innerHTML = `
                <div class="tm-dot"></div>
                <div class="tm-content">
                    <span class="tm-month">${m.substring(0, 3)}</span>
                    <span class="tm-status">${state === 'paid' ? 'Pagado' : (state === 'rejected' ? 'Rechazado' : (state === 'pending' ? 'En revisión' : 'Pendiente'))}</span>
                </div>
            `;
            div.addEventListener('click', () => {
                selectedTimelineMonth = m;
                updateUI();
            });
            timelineContainer.appendChild(div);
        });

        // Auto-scroll al mes seleccionado
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

    // Obtener valores de los filtros
    const selectedMonth = document.getElementById('cc-month-filter')?.value || 'ALL';
    const selectedStatus = document.getElementById('cc-status-filter')?.value || 'ALL';
    const selectedActivity = document.getElementById('cc-activity-filter')?.value || 'ALL';
    const searchQuery = (document.getElementById('cc-search-input')?.value || '').toLowerCase().trim();

    // Actualizar encabezados para resaltar mes actual o mes filtrado
    const thead = document.querySelector('#admin-cc-table thead tr');
    if (thead) {
        let headers = `<th>Usuario / Familia</th>`;
        months.forEach(m => {
            const isCurrent = m === currentMonthName;
            const isSelected = selectedMonth === m;
            const bgStyle = isSelected ? 'background-color: var(--primary); color: white;' : (isCurrent ? 'background-color: rgba(26, 54, 93, 0.1);' : '');
            headers += `<th class="month-col ${isCurrent ? 'current-month-col' : ''}" style="${bgStyle}">${m.substring(0, 3)}</th>`;
        });
        headers += `<th>Deuda / Estado</th>`;
        thead.innerHTML = headers;
    }

    let okCount = 0;
    let debtCount = 0;
    let pendingCount = 0;

    const targetMonthForStats = selectedMonth === 'ALL' ? (months.includes(currentMonthName) ? currentMonthName : 'Febrero') : selectedMonth;

    users.forEach(u => {
        if (u.role === 'admin') return;

        const children = getChildList(u);

        // Filtro por Actividad / Categoría (Infantiles, Pre Competitivo, Competitivo, u otros)
        if (selectedActivity !== 'ALL') {
            const hasActivity = children.some(c => {
                const catLower = (c.category || '').toLowerCase();
                const selLower = selectedActivity.toLowerCase();
                return catLower.includes(selLower);
            });
            if (!hasActivity) return;
        }

        // Búsqueda por texto (nombre, usuario, nombre de atletas)
        const childNamesText = children.map(c => c.name.toLowerCase()).join(' ');
        const matchesSearch = !searchQuery || 
                              (u.name && u.name.toLowerCase().includes(searchQuery)) || 
                              (u.username && u.username.toLowerCase().includes(searchQuery)) || 
                              childNamesText.includes(searchQuery);

        if (!matchesSearch) return;

        let monthlyExpected = 0;
        let appliesSocial = false;

        // Si el usuario está PAUSADO, no se le calcula cuota ni genera deuda
        if (u.paused !== true) {
            children.forEach(kid => {
                const cleanCategory = kid.category.trim().toLowerCase();
                const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
                let basePrice = activity ? activity.price : (activities[0]?.price || 0);

                // Aplicar Bonificación / Beca del atleta
                if (kid.discountType === 'full') {
                    basePrice = 0;
                } else if (kid.discountType === 'percent' && kid.discountValue > 0) {
                    basePrice = Math.max(0, basePrice * (1 - (kid.discountValue / 100)));
                } else if (kid.discountType === 'fixed' && kid.discountValue > 0) {
                    basePrice = Math.max(0, basePrice - kid.discountValue);
                }

                monthlyExpected += basePrice;
                if (activity && activity.social) appliesSocial = true;
            });
            if (appliesSocial) monthlyExpected += socialFee;
        }

        let totalDebt = 0;
        let monthTds = '';
        const userPayments = payments.filter(p => p.userId === (u.id || u.username));

        // Evaluación por mes para el usuario
        let targetMonthStatus = 'VOID'; // OK, DEBT, PENDING, VOID

        months.forEach(m => {
            const paid = userPayments.filter(p => p.month === m && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
            const isFull = paid >= monthlyExpected && monthlyExpected > 0;
            const isPartial = paid > 0 && paid < monthlyExpected;
            const isDebt = paid === 0 && monthlyExpected > 0;
            const hasPending = userPayments.some(p => p.month === m && p.status === 'pending');
            const isCurrent = m === currentMonthName;

            if (isDebt || isPartial) totalDebt += (monthlyExpected - paid);

            // Si es el mes objetivo para las estadísticas de tarjetas
            if (m === targetMonthForStats) {
                if (hasPending) targetMonthStatus = 'PENDING';
                else if (isFull) targetMonthStatus = 'OK';
                else if (isDebt || isPartial) targetMonthStatus = 'DEBT';
            }

            const isHighlightedMonth = selectedMonth === m;

            monthTds += `
                <td class="month-col ${isCurrent ? 'current-month-col' : ''}" style="${isHighlightedMonth ? 'background-color: rgba(26, 54, 93, 0.08); font-weight: bold;' : ''}">
                    <div class="status-check ${isFull ? 'ok' : (hasPending ? 'pending' : (isDebt ? 'debt' : 'void'))}" 
                         onclick="${isDebt || (isPartial && !hasPending) ? `window.doManualCollection('${u.id || u.username}', '${m}', ${monthlyExpected - paid}, '${u.name}', '${children.map(c => c.name).join(', ')}')` : ''}"
                         style="${isDebt || (isPartial && !hasPending) ? 'cursor:pointer;' : ''}"
                         title="${m}: $ ${paid.toLocaleString('es-AR')} de $ ${monthlyExpected.toLocaleString('es-AR')} ${hasPending ? '(Hay un pago pendiente de revisión)' : (isDebt ? 'Haz clic para cobro manual' : '')}">
                        <i class="fas ${isFull ? 'fa-check' : (hasPending ? 'fa-clock' : (isDebt ? 'fa-dollar-sign' : 'fa-minus'))}"></i>
                    </div>
                </td>`;
        });

        // Conteo de tarjetas de métricas según mes elegido
        if (targetMonthStatus === 'OK') okCount++;
        else if (targetMonthStatus === 'DEBT') debtCount++;
        else if (targetMonthStatus === 'PENDING') pendingCount++;

        // Filtro por Estado (Si se selecciona un estado específico)
        if (selectedStatus !== 'ALL') {
            if (selectedStatus === 'DEBT' && targetMonthStatus !== 'DEBT') return;
            if (selectedStatus === 'OK' && targetMonthStatus !== 'OK') return;
            if (selectedStatus === 'PENDING' && targetMonthStatus !== 'PENDING') return;
        }

        const tr = document.createElement('tr');
        const childNames = children.map(c => `<li>${c.name} (${c.category})</li>`).join('');
        tr.innerHTML = `
            <td>
                <b>${u.name}</b><br>
                <ul style="margin:5px 0; padding:0 15px; font-size:0.75rem; color:#666;">${childNames || '<li>Sin atletas</li>'}</ul>
                <small style="color:var(--text-muted);">${u.username || u.id}</small>
            </td>
            ${monthTds}
            <td>
                <b class="${totalDebt > 0 ? 'text-red' : 'text-green'}" style="font-size: 1.05rem; display: block;">$ ${totalDebt.toLocaleString('es-AR')}</b>
                <small style="font-size:0.7rem; color:var(--text-muted);">${totalDebt > 0 ? 'Deuda acumulada' : 'Al Día'}</small>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Actualizar contadores visuales en el encabezado
    const okEl = document.getElementById('cc-stat-ok-count');
    const debtEl = document.getElementById('cc-stat-debt-count');
    const pendingEl = document.getElementById('cc-stat-pending-count');

    if (okEl) okEl.innerText = `${okCount} familias`;
    if (debtEl) debtEl.innerText = `${debtCount} familias`;
    if (pendingEl) pendingEl.innerText = `${pendingCount} familias`;

    setupCCFilterListeners();
}

let ccListenersAssigned = false;
function setupCCFilterListeners() {
    if (ccListenersAssigned) return;
    ccListenersAssigned = true;

    ['cc-month-filter', 'cc-status-filter', 'cc-activity-filter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => renderAdminCC());
    });

    document.getElementById('cc-search-input')?.addEventListener('input', () => renderAdminCC());

    // Botones de exportación a PDF
    document.getElementById('btn-export-pdf-cc')?.addEventListener('click', () => exportCuentaCorrientePDF());
    document.getElementById('btn-export-pdf-reports')?.addEventListener('click', () => exportReporteCobrosPDF());
}

// Lógica de Cobro Manual (Solicitado por usuario)
window.doManualCollection = async (userId, month, amount, userName, kids) => {
    if (!confirm(`¿Generar COBRO MANUAL por $ ${amount.toLocaleString('es-AR')} para ${userName} (${month})?\n\nEsto saldará la deuda e INGRESARÁ el monto a la caja del reporte del mes.`)) return;

    try {
        // Necesitamos la config para calcular el breakdown
        const config = await window.DataManager.getConfig();
        const activities = config.activities || [];
        const socialFee = config.socialFee || 0;

        // Simular el desglose para el registro manual
        // Aquí simplificamos: si hay cuota social configurada, la restamos del total para obtener actividades.
        // En un sistema real buscaríamos exactamente qué actividades tiene el usuario.

        const user = await window.DataManager.getUser(userId);
        const children = getChildList(user);
        let socialAmount = 0;
        let hasSocial = children.some(k => {
            const act = activities.find(a => a.name.toLowerCase() === k.category.toLowerCase());
            return act && act.social;
        });
        if (hasSocial) socialAmount = socialFee;

        const actAmount = amount - socialAmount;

        await window.DataManager.addPayment({
            userId: userId,
            userName: userName,
            childrenNames: kids,
            month: month,
            amount: amount,
            socialFeeAmount: socialAmount,
            activitiesFeeAmount: actAmount,
            paymentMethod: 'Manual',
            status: 'approved',
            isManualCollection: true, // Flag CRÍTICO: No suma a caja
            receiptURL: null
        });

        toast('Cobro manual registrado');
        renderAdminCC();
        renderAdminDashboard();
    } catch (e) {
        console.error(e);
        toast('Error al registrar cobro manual', 'error');
    }
};

/**
 * Módulo de Convenios y Club Correcaminos (PWA)
 */

window.isUserAlDia = async (userId) => {
    try {
        const user = await window.DataManager.getUser(userId);
        if (!user) return false;
        if (user.role === 'admin') return true;

        const payments = (await window.DataManager.getPaymentsByUser(userId)) || [];

        const now = new Date();
        const allMonths = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let currentMonthIndex = now.getMonth();
        if (currentMonthIndex === 0) currentMonthIndex = 1;
        const currentMonthName = allMonths[currentMonthIndex];

        // Los meses activos del ciclo escolar son de Febrero a Diciembre
        const monthsToCheck = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const idxCurrent = monthsToCheck.indexOf(currentMonthName);

        // Si el mes actual no está en la lista de meses a controlar, o no hemos empezado el ciclo
        if (idxCurrent === -1) return true;

        // Verificar que todos los meses transcurridos del ciclo escolar hasta el mes actual tengan al menos un pago aprobado
        for (let i = 0; i <= idxCurrent; i++) {
            const m = monthsToCheck[i];
            const hasApproved = payments.some(p => p && p.month === m && p.status === 'approved');
            if (!hasApproved) {
                return false; // Falta un pago aprobado para este mes
            }
        }

        return true;
    } catch (err) {
        console.error("Error en isUserAlDia:", err);
        return false;
    }
};

async function renderUserBenefits() {
    const container = document.getElementById('user-benefits-container');
    if (!container) return;
    container.innerHTML = '<div class="text-muted" style="grid-column:1/-1; text-align:center; padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando convenios...</div>';

    try {
        const partners = (await window.DataManager.getPartners()) || [];
        const activePartners = partners.filter(p => p && (p.active === true || p.active === "true" || p.active === undefined));
        
        let alDia = false;
        try {
            alDia = await window.isUserAlDia(currentUser.id);
        } catch (diagErr) {
            console.error("Error inside isUserAlDia:", diagErr);
        }

        const myCoupons = (await window.DataManager.getCouponsByUser(currentUser.id)) || [];

        container.innerHTML = '';
        if (activePartners.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; background: white; border-radius: 12px; border: 1px dashed var(--border);">
                    <i class="fas fa-handshake" style="font-size: 2.5rem; color: #cbd5e0; margin-bottom: 1rem;"></i>
                    <p style="color: #718096; font-weight: 500;">Próximamente verás convenios y descuentos en esta sección.</p>
                    <p style="color: #cbd5e0; font-size: 0.75rem; margin-top: 0.5rem;">Cero convenios activos encontrados en la base de datos.</p>
                </div>
            `;
            return;
        }

        activePartners.forEach(p => {
            const isOnce = p.type === 'once';
            const alreadyUsed = isOnce && myCoupons.some(c => c && c.partnerId === p.id && c.status === 'used');
            const hasActiveCoupon = myCoupons.some(c => c && c.partnerId === p.id && c.status === 'active' && c.expiresAt > Date.now());
            const activeCoupon = hasActiveCoupon ? myCoupons.find(c => c && c.partnerId === p.id && c.status === 'active' && c.expiresAt > Date.now()) : null;

            const card = document.createElement('div');
            card.className = 'athlete-card benefit-card';
            if (!alDia || alreadyUsed) card.classList.add('incomplete');

            const logo = p.logoURL ? p.logoURL : 'img/Nuevo Logo Correcaminos.jpeg';

            let actionBtnHtml = '';
            if (alreadyUsed) {
                actionBtnHtml = `<button class="btn-primary" style="background:#cbd5e0; color:#718096; cursor:not-allowed; width:100%;" disabled><i class="fas fa-check-circle"></i> Beneficio Canjeado</button>`;
            } else if (!alDia) {
                actionBtnHtml = `
                    <button class="btn-primary" style="background:#fee2e2; color:#ef4444; border:1px solid #fec2c2; cursor:not-allowed; width:100%;" disabled>
                        <i class="fas fa-lock"></i> Regularizar Cuenta
                    </button>
                    <p style="font-size:0.7rem; color:var(--danger); text-align:center; margin-top:0.5rem; font-weight:600;">Requiere estar Al Día en tus cuotas</p>
                `;
            } else if (activeCoupon) {
                actionBtnHtml = `
                    <button class="btn-secondary btn-view-active-coupon" data-code="${activeCoupon.id}" data-partner-name="${p.name}" data-discount="${p.discountDetail}" data-desc="${p.description}" style="width:100%;">
                        <i class="fas fa-qrcode"></i> Ver Cupón Activo
                    </button>
                `;
            } else {
                actionBtnHtml = `
                    <button class="btn-primary btn-generate-coupon" data-partner-id="${p.id}" style="width:100%;">
                        <i class="fas fa-gift"></i> Obtener Cupón
                    </button>
                `;
            }

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                    <img src="${logo}" alt="${p.name}" style="width:50px; height:50px; border-radius:12px; object-fit:cover; border:1px solid var(--border);">
                    <div>
                        <h4 style="color:var(--primary); font-size:1.05rem; margin:0; line-height:1.2;">${p.name}</h4>
                        <span class="badge" style="background:var(--primary-light); color:white; font-size:0.7rem; padding:0.15rem 0.5rem; display:inline-block; margin-top:0.25rem;">
                            ${p.category || 'Rubro'}
                        </span>
                    </div>
                </div>
                <div class="athlete-card-body" style="flex:1;">
                    <div style="font-size:1.5rem; font-weight:800; color:var(--accent); margin:0.5rem 0;">${p.discountDetail || 'Descuento'}</div>
                    <p style="font-size:0.85rem; color:var(--text-main); margin-bottom:1rem;">${p.description || ''}</p>
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:1rem;">
                        <i class="fas fa-sync-alt"></i> ${isOnce ? 'Descuento por única vez' : 'Descuento recurrente'}
                    </span>
                </div>
                <div style="margin-top:auto;">
                    ${actionBtnHtml}
                </div>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('.btn-generate-coupon').forEach(btn => {
            btn.addEventListener('click', () => {
                const partnerId = btn.dataset.partnerId;
                handleCreateCoupon(partnerId);
            });
        });

        container.querySelectorAll('.btn-view-active-coupon').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.dataset.code;
                const partnerName = btn.dataset.partnerName;
                const discount = btn.dataset.discount;
                const desc = btn.dataset.desc;
                showCouponModal(code, partnerName, discount, desc);
            });
        });

    } catch (e) {
        console.error("Error al renderizar beneficios del socio:", e);
        container.innerHTML = `
            <div class="text-red" style="text-align:center; padding:2rem; grid-column: 1/-1;">
                <i class="fas fa-exclamation-triangle" style="font-size:2.5rem; color:var(--danger); margin-bottom:1rem;"></i>
                <p style="font-weight:600;">Ocurrió un error al cargar los convenios:</p>
                <p style="font-family:monospace; font-size:0.85rem; margin-top:0.5rem; color:var(--danger); background:#fff5f5; padding:0.75rem; border:1px solid #fed7d7; border-radius:6px;">${e.message}</p>
            </div>
        `;
    }
}

async function handleCreateCoupon(partnerId) {
    const isAlDia = await window.isUserAlDia(currentUser.id);
    if (!isAlDia) {
        toast("No podés generar cupones si registrás deudas pendientes.", "error");
        return;
    }

    if (!confirm("¿Deseás generar este cupón de descuento?\n\nTendrá una validez de 24 horas.")) return;

    try {
        const code = generateCouponCode();
        const partners = await window.DataManager.getPartners();
        const p = partners.find(x => x.id === partnerId);
        if (!p) return;

        const newCoupon = {
            id: code,
            userId: currentUser.id,
            partnerId: partnerId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000),
            status: 'active',
            usedAt: null
        };

        await window.DataManager.createCoupon(newCoupon);
        toast("Cupón generado con éxito");
        renderUserBenefits();
        showCouponModal(code, p.name, p.discountDetail, p.description);

    } catch (e) {
        console.error(e);
        toast("Error al generar cupón", "error");
    }
}

function generateCouponCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'CC-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function showCouponModal(code, partnerName, discount, desc) {
    document.getElementById('coupon-partner-name').innerText = partnerName;
    document.getElementById('coupon-discount-value').innerText = discount;
    document.getElementById('coupon-benefit-desc').innerText = desc;
    document.getElementById('coupon-code-text').innerText = code;

    const origin = window.location.origin + window.location.pathname.replace('index.html', '');
    const validationUrl = `${origin}validar.html?code=${code}`;
    
    const qrImg = document.getElementById('coupon-qr-img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(validationUrl)}`;

    document.getElementById('coupon-modal').classList.add('active');
}

async function renderAdminBenefits() {
    const tbody = document.querySelector('#admin-partners-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" align="center">Cargando convenios...</td></tr>';

    try {
        const partners = await window.DataManager.getPartners();
        tbody.innerHTML = '';

        if (partners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" align="center">No hay convenios registrados. Presioná "Nuevo Convenio" para comenzar.</td></tr>';
            return;
        }

        partners.forEach(p => {
            const isOnce = p.type === 'once';
            const isActive = p.active === true || p.active === "true" || p.active === undefined;
            const logo = p.logoURL ? p.logoURL : 'img/Nuevo Logo Correcaminos.jpeg';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${logo}" alt="${p.name}" style="width:36px; height:36px; border-radius:6px; object-fit:cover; border:1px solid var(--border);">
                        <b>${p.name}</b>
                    </div>
                </td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--text-main); border:1px solid var(--border);">${p.category}</span></td>
                <td><b style="color:var(--accent);">${p.discountDetail}</b></td>
                <td>${isOnce ? 'Única vez' : 'Recurrente'}</td>
                <td>
                    <span class="badge ${isActive ? 'badge-approved' : 'badge-pending'}">
                        ${isActive ? 'Activo' : 'Pausado'}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:0.5rem">
                        <button class="btn-action edit btn-edit-partner" data-id="${p.id}" title="Editar Convenio"><i class="fas fa-edit"></i></button>
                        <button class="btn-action reject btn-del-partner" data-id="${p.id}" title="Eliminar Convenio" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-edit-partner').forEach(btn => {
            btn.addEventListener('click', () => {
                const partner = partners.find(x => x.id === btn.dataset.id);
                if (partner) openEditPartnerModal(partner);
            });
        });

        tbody.querySelectorAll('.btn-del-partner').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('¿Eliminar convenio de forma permanente?')) {
                    await window.DataManager.deletePartner(btn.dataset.id);
                    toast('Convenio eliminado');
                    renderAdminBenefits();
                }
            });
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" align="center" style="color:var(--danger)">Error al cargar datos.</td></tr>';
    }
}

function openEditPartnerModal(p) {
    const modal = document.getElementById('partner-modal');
    if (modal) {
        modal.dataset.tempLogo = p.logoURL || '';
    }

    document.getElementById('partner-modal-title').innerText = "Editar Convenio";
    document.getElementById('partner-edit-id').value = p.id;
    document.getElementById('partner-name').value = p.name;
    document.getElementById('partner-category').value = p.category;
    document.getElementById('partner-discount').value = p.discountDetail;
    document.getElementById('partner-description').value = p.description;
    document.getElementById('partner-type').value = p.type;
    
    const previewContainer = document.getElementById('partner-logo-preview-container');
    const previewImg = document.getElementById('partner-logo-preview');
    const logoName = document.getElementById('partner-logo-name');
    
    if (p.logoURL) {
        if (previewImg) previewImg.src = p.logoURL;
        if (previewContainer) previewContainer.style.display = 'block';
        if (logoName) logoName.innerText = "Imagen cargada (toca para cambiar)";
    } else {
        if (previewImg) previewImg.src = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (logoName) logoName.innerText = "Toca para seleccionar imagen";
    }

    modal.classList.add('active');
}

/**
 * Generación de Reportes Oficiales en PDF con Logo de Correcaminos
 */

async function exportCuentaCorrientePDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        toast("Cargando motor de PDF, reintente en unos segundos...", "error");
        return;
    }

    try {
        const selectedMonth = document.getElementById('cc-month-filter')?.value || 'ALL';
        const isSingleMonth = selectedMonth !== 'ALL';
        const orientation = isSingleMonth ? 'portrait' : 'landscape';

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(orientation, 'pt', 'a4');

        const logoImg = new Image();
        logoImg.src = 'img/Nuevo Logo Correcaminos.jpeg';

        logoImg.onload = () => generateCCPDFContent(doc, logoImg, isSingleMonth, selectedMonth);
        logoImg.onerror = () => generateCCPDFContent(doc, null, isSingleMonth, selectedMonth);
    } catch (e) {
        console.error("Error al exportar PDF:", e);
        toast("Error al generar PDF", "error");
    }
}

async function generateCCPDFContent(doc, logoImg, isSingleMonth, selectedMonth) {
    const selectedStatus = document.getElementById('cc-status-filter')?.value || 'ALL';
    const selectedActivity = document.getElementById('cc-activity-filter')?.value || 'ALL';

    const users = await window.DataManager.getUsers();
    const payments = await window.DataManager.getPayments();
    const config = await window.DataManager.getConfig();
    const activities = config.activities || [];
    const socialFee = config.socialFee || 0;

    const pageWidth = doc.internal.pageSize.getWidth();

    // Dibujar Logo
    if (logoImg) {
        try {
            doc.addImage(logoImg, 'JPEG', 35, 20, 48, 48);
        } catch (e) {
            console.warn("No se pudo insertar logo en el PDF:", e);
        }
    }

    // Título y Encabezado
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(26, 54, 93); // --primary
    doc.text("Asociación Civil Correcaminos - Escuela de Atletismo", 92, 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    
    const subTitleStr = isSingleMonth ? 
        `Reporte de Estado de Cuotas - Mes de ${selectedMonth.toUpperCase()}` : 
        `Reporte General de Cuenta Corriente Anual`;
    doc.text(subTitleStr, 92, 52);

    // Meta datos fecha / filtros (Alineados a la derecha de forma limpia)
    const fechaStr = new Date().toLocaleDateString('es-AR');
    const statusText = selectedStatus === 'ALL' ? 'Todos' : (selectedStatus === 'DEBT' ? 'Impagos' : (selectedStatus === 'OK' ? 'Pagados' : 'Pendientes'));
    
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha: ${fechaStr}`, pageWidth - 35, 36, { align: 'right' });
    doc.text(`Filtros: Estado (${statusText}) | Actividad (${selectedActivity})`, pageWidth - 35, 52, { align: 'right' });

    // Línea divisora limpia
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(1);
    doc.line(35, 76, pageWidth - 35, 76);

    const months = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    let headers = [];
    let tableBody = [];

    if (isSingleMonth) {
        // FORMATO VERTICAL (PORTRAIT) - REPORTES INDIVIDUALES DE UN MES
        headers = [["Familia / Socio", "Atletas / Categoría", "Cuota Esperada", "Monto Abonado", "Estado Cuota", "Saldo Pendiente"]];

        let totalExpect = 0;
        let totalPaid = 0;
        let totalDebtMonth = 0;

        users.forEach(u => {
            if (u.role === 'admin') return;

            const children = getChildList(u);

            if (selectedActivity !== 'ALL') {
                const hasActivity = children.some(c => (c.category || '').toLowerCase().includes(selectedActivity.toLowerCase()));
                if (!hasActivity) return;
            }

            let monthlyExpected = 0;
            let appliesSocial = false;

            if (u.paused !== true) {
                children.forEach(kid => {
                    const cleanCategory = kid.category.trim().toLowerCase();
                    const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
                    let basePrice = activity ? activity.price : (activities[0]?.price || 0);

                    // Aplicar Bonificación / Beca del atleta
                    if (kid.discountType === 'full') {
                        basePrice = 0;
                    } else if (kid.discountType === 'percent' && kid.discountValue > 0) {
                        basePrice = Math.max(0, basePrice * (1 - (kid.discountValue / 100)));
                    } else if (kid.discountType === 'fixed' && kid.discountValue > 0) {
                        basePrice = Math.max(0, basePrice - kid.discountValue);
                    }

                    monthlyExpected += basePrice;
                    if (activity && activity.social) appliesSocial = true;
                });
                if (appliesSocial) monthlyExpected += socialFee;
            }

            const userPayments = payments.filter(p => p.userId === (u.id || u.username));
            const paid = userPayments.filter(p => p.month === selectedMonth && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
            const isFull = paid >= monthlyExpected && monthlyExpected > 0;
            const isPartial = paid > 0 && paid < monthlyExpected;
            const isDebt = paid === 0 && monthlyExpected > 0;
            const hasPending = userPayments.some(p => p.month === selectedMonth && p.status === 'pending');

            let statusStr = "PAGADO";
            if (hasPending) statusStr = "PENDIENTE";
            else if (isDebt) statusStr = "IMPAGO";
            else if (isPartial) statusStr = "PARCIAL";

            if (selectedStatus !== 'ALL') {
                if (selectedStatus === 'DEBT' && !isDebt && !isPartial) return;
                if (selectedStatus === 'OK' && !isFull) return;
                if (selectedStatus === 'PENDING' && !hasPending) return;
            }

            const debtVal = Math.max(0, monthlyExpected - paid);

            totalExpect += monthlyExpected;
            totalPaid += paid;
            totalDebtMonth += debtVal;

            const kidsStr = children.map(c => `${c.name} (${c.category})`).join('\n');

            tableBody.push([
                u.name,
                kidsStr || 'Sin asignación',
                `$ ${monthlyExpected.toLocaleString('es-AR')}`,
                `$ ${paid.toLocaleString('es-AR')}`,
                statusStr,
                debtVal > 0 ? `$ ${debtVal.toLocaleString('es-AR')}` : '$ 0'
            ]);
        });

        // Fila Resumen
        tableBody.push([
            "TOTALES",
            "",
            `$ ${totalExpect.toLocaleString('es-AR')}`,
            `$ ${totalPaid.toLocaleString('es-AR')}`,
            "",
            `$ ${totalDebtMonth.toLocaleString('es-AR')}`
        ]);

        doc.autoTable({
            head: headers,
            body: tableBody,
            startY: 88,
            margin: { left: 35, right: 35 },
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 5, color: [15, 23, 42], valign: 'middle' },
            headStyles: { fillColor: [26, 54, 93], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
            columnStyles: {
                0: { cellWidth: 120, fontStyle: 'bold' },
                1: { cellWidth: 165 },
                2: { cellWidth: 70, halign: 'right' },
                3: { cellWidth: 70, halign: 'right' },
                4: { cellWidth: 60, halign: 'center' },
                5: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                if (data.row.index === tableBody.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [241, 245, 249];
                }
                if (data.column.index === 4 && data.section === 'body' && data.row.index !== tableBody.length - 1) {
                    if (data.cell.raw === 'PAGADO') {
                        data.cell.styles.textColor = [22, 163, 74];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.cell.raw === 'IMPAGO') {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.cell.raw === 'PENDIENTE' || data.cell.raw === 'PARCIAL') {
                        data.cell.styles.textColor = [217, 119, 6];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

    } else {
        // FORMATO HORIZONTAL (LANDSCAPE) - MATRIZ ANUAL DE TODOS LOS MESES
        headers = [["Familia / Tutor", "Atletas Asignados", ...months.map(m => m.substring(0, 3)), "Deuda Total"]];

        users.forEach(u => {
            if (u.role === 'admin') return;

            const children = getChildList(u);

            if (selectedActivity !== 'ALL') {
                const hasActivity = children.some(c => (c.category || '').toLowerCase().includes(selectedActivity.toLowerCase()));
                if (!hasActivity) return;
            }

            if (u.paused !== true) {
                children.forEach(kid => {
                    const cleanCategory = kid.category.trim().toLowerCase();
                    const activity = activities.find(a => a.name.trim().toLowerCase() === cleanCategory);
                    let basePrice = activity ? activity.price : (activities[0]?.price || 0);

                    // Aplicar Bonificación / Beca del atleta
                    if (kid.discountType === 'full') {
                        basePrice = 0;
                    } else if (kid.discountType === 'percent' && kid.discountValue > 0) {
                        basePrice = Math.max(0, basePrice * (1 - (kid.discountValue / 100)));
                    } else if (kid.discountType === 'fixed' && kid.discountValue > 0) {
                        basePrice = Math.max(0, basePrice - kid.discountValue);
                    }

                    monthlyExpected += basePrice;
                    if (activity && activity.social) appliesSocial = true;
                });
                if (appliesSocial) monthlyExpected += socialFee;
            }

            let totalDebt = 0;
            const userPayments = payments.filter(p => p.userId === (u.id || u.username));

            const monthCells = months.map(m => {
                const paid = userPayments.filter(p => p.month === m && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
                const isFull = paid >= monthlyExpected && monthlyExpected > 0;
                const isPartial = paid > 0 && paid < monthlyExpected;
                const isDebt = paid === 0 && monthlyExpected > 0;
                const hasPending = userPayments.some(p => p.month === m && p.status === 'pending');

                if (isDebt || isPartial) totalDebt += (monthlyExpected - paid);

                if (isFull) return "OK";
                if (hasPending) return "PEND";
                if (isDebt) return "IMPAGO";
                return "-";
            });

            if (selectedStatus !== 'ALL') {
                const currentMonthName = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][new Date().getMonth()];
                const checkMonth = months.includes(currentMonthName) ? currentMonthName : 'Febrero';
                const monthIdx = months.indexOf(checkMonth);
                const statusCell = monthCells[monthIdx];

                if (selectedStatus === 'DEBT' && statusCell !== 'IMPAGO') return;
                if (selectedStatus === 'OK' && statusCell !== 'OK') return;
                if (selectedStatus === 'PENDING' && statusCell !== 'PEND') return;
            }

            const kidsStr = children.map(c => `${c.name} (${c.category})`).join(', ');

            tableBody.push([
                u.name,
                kidsStr || 'Sin asignación',
                ...monthCells,
                totalDebt > 0 ? `$ ${totalDebt.toLocaleString('es-AR')}` : 'AL DÍA'
            ]);
        });

        doc.autoTable({
            head: headers,
            body: tableBody,
            startY: 88,
            margin: { left: 35, right: 35 },
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 5 },
            headStyles: { fillColor: [26, 54, 93], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 110, fontStyle: 'bold' },
                1: { cellWidth: 150 },
                13: { halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index >= 2 && data.column.index <= 12) {
                    if (data.cell.raw === 'OK') {
                        data.cell.styles.textColor = [22, 163, 74];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.cell.raw === 'IMPAGO') {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.cell.raw === 'PEND') {
                        data.cell.styles.textColor = [217, 119, 6];
                    }
                }
            }
        });
    }

    const docName = isSingleMonth ? 
        `Correcaminos_Reporte_${selectedMonth.toUpperCase()}_${selectedStatus}_${Date.now()}.pdf` : 
        `Correcaminos_Cuenta_Corriente_Anual_${Date.now()}.pdf`;

    doc.save(docName);
    toast("Reporte PDF generado correctamente");
}

async function exportReporteCobrosPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        toast("Cargando motor de PDF, reintente en unos segundos...", "error");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'pt', 'a4');

        const logoImg = new Image();
        logoImg.src = 'img/Nuevo Logo Correcaminos.jpeg';

        logoImg.onload = async () => generateReportsPDFContent(doc, logoImg);
        logoImg.onerror = async () => generateReportsPDFContent(doc, null);
    } catch (e) {
        console.error("Error al exportar PDF de Cobros:", e);
        toast("Error al generar PDF", "error");
    }
}

async function generateReportsPDFContent(doc, logoImg) {
    const selectedMonth = document.getElementById('filter-month')?.value || 'all';
    const selectedStatus = document.getElementById('filter-status')?.value || 'all';

    const payments = await window.DataManager.getPayments();
    let filtered = payments;

    if (selectedMonth !== 'all') filtered = filtered.filter(p => p.month === selectedMonth);
    if (selectedStatus !== 'all') filtered = filtered.filter(p => p.status === selectedStatus);

    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoImg) {
        try { doc.addImage(logoImg, 'JPEG', 35, 20, 48, 48); } catch (e) {}
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(26, 54, 93);
    doc.text("Asociación Civil Correcaminos - Escuela de Atletismo", 92, 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Reporte Oficial de Rendición de Cobros e Ingresos de Caja", 92, 52);

    const fechaStr = new Date().toLocaleDateString('es-AR');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha: ${fechaStr}`, pageWidth - 35, 36, { align: 'right' });
    doc.text(`Filtros: Mes (${selectedMonth}) | Estado (${selectedStatus})`, pageWidth - 35, 52, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(1);
    doc.line(35, 76, pageWidth - 35, 76);

    let totalRecaudado = 0;
    const tableBody = filtered.map(p => {
        if (p.status === 'approved') totalRecaudado += (p.amount || 0);
        return [
            p.date || '---',
            p.userName || p.userId,
            p.month,
            `$ ${(p.amount || 0).toLocaleString('es-AR')}`,
            p.paymentMethod || 'Manual',
            p.status === 'approved' ? 'Aprobado' : (p.status === 'pending' ? 'Pendiente' : 'Rechazado')
        ];
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(22, 101, 52);
    doc.text(`Recaudación Total Aprobada: $ ${totalRecaudado.toLocaleString('es-AR')}`, 35, 96);

    doc.autoTable({
        head: [["Fecha", "Socio / Familia", "Mes", "Monto", "Medio", "Estado"]],
        body: tableBody,
        startY: 108,
        margin: { left: 35, right: 35 },
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [26, 54, 93], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    doc.save(`Correcaminos_Reporte_Cobros_${selectedMonth}_${Date.now()}.pdf`);
    toast("Reporte de Cobros en PDF exportado con éxito");
}
