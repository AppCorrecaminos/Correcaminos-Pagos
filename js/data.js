/**
 * data.js - Gestión de Datos Blindada (Modo Global Cloud)
 */

const DataManager = {
    db: null,

    init(dbInstance) {
        this.db = dbInstance;
        console.log("DataManager: Firebase Cloud Link Active");
    },

    // Generador de ID estándar para evitar pérdidas
    getValidId(input, fallbackId) {
        if (fallbackId && fallbackId.length > 5) return fallbackId;
        return (input || "user").toLowerCase().replace(/[^a-z0-9]/g, '_');
    },

    // Config Methods
    async getConfig() {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const configDoc = await window.firebase.firestore.getDoc(docRef);
                if (configDoc.exists()) return configDoc.data();
            } catch (e) { console.warn("Usando config local."); }
        }
        return JSON.parse(localStorage.getItem('correcaminos_config')) || {
            socialFee: 3000,
            activities: [{ name: 'Atletismo', price: 40000 }]
        };
    },

    async updateConfig(newConfig) {
        localStorage.setItem('correcaminos_config', JSON.stringify(newConfig));
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                await window.firebase.firestore.setDoc(docRef, newConfig);
            } catch (e) { alert("Error al subir config a la nube. Revisa tus reglas de Firebase."); }
        }
    },

    // User Methods
    async saveUser(rawId, userData) {
        // Asegurar ID consistente (username slug)
        const uid = userData.username ? userData.username.toLowerCase().replace(/[^a-z0-9]/g, '_') : rawId;

        // 1. Guardar Local
        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const index = users.findIndex(u => u.id === uid || u.username === userData.username);

        const finalData = { ...userData, id: uid };
        if (index > -1) users[index] = finalData;
        else users.push(finalData);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        // 2. Guardar Nube
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.setDoc(docRef, finalData);
                console.log("Usuario sincronizado en la nube:", uid);
            } catch (e) { console.error("Error nube:", e); }
        }
    },

    async getUsers() {
        let allUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                cloudUsers.forEach(cu => {
                    const idx = allUsers.findIndex(au => au.id === cu.id || au.username === cu.username);
                    if (idx > -1) allUsers[idx] = cu;
                    else allUsers.push(cu);
                });
            } catch (e) { }
        }
        return allUsers;
    },

    async deleteUser(uid) {
        let users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        users = users.filter(u => u.id !== uid);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) { }
        }
    },

    // Payments
    async getPayments() {
        let payments = [];
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "payments");
                const snapshot = await window.firebase.firestore.getDocs(q);
                payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                payments = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
            }
        } else {
            payments = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        }
        return payments.sort((a, b) => b.timestamp - a.timestamp);
    },

    async getPaymentsByUser(userId) {
        const all = await this.getPayments();
        return all.filter(p => p.userId === userId);
    },

    async addPayment(payment) {
        const payId = 'pay_' + Date.now();
        payment.id = payId;
        payment.timestamp = Date.now();
        payment.date = new Date().toLocaleDateString('es-AR');

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", payId);
                await window.firebase.firestore.setDoc(docRef, payment);
            } catch (e) { }
        }
        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        local.push(payment);
        localStorage.setItem('correcaminos_payments', JSON.stringify(local));
    },

    async updatePaymentStatus(paymentId, status) {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", paymentId);
                await window.firebase.firestore.updateDoc(docRef, { status: status });
            } catch (e) { }
        }
        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        const p = local.find(x => x.id === paymentId);
        if (p) p.status = status;
        localStorage.setItem('correcaminos_payments', JSON.stringify(local));
    },

    subscribeToPayments(callback) {
        if (!this.db) return () => { };
        return window.firebase.firestore.onSnapshot(
            window.firebase.firestore.collection(this.db, "payments"),
            (snapshot) => {
                const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(payments);
            }
        );
    },

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
};

window.DataManager = DataManager;
