/**
 * data.js - Gestión de Datos con Sincronización Doble
 */

const DataManager = {
    db: null,

    init(dbInstance) {
        this.db = dbInstance;
        console.log("DataManager: Conectado a Firebase");
    },

    async getConfig() {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const configDoc = await window.firebase.firestore.getDoc(docRef);
                if (configDoc.exists()) return configDoc.data();
            } catch (e) { console.warn("Error leyendo config de nube:", e); }
        }
        const local = localStorage.getItem('correcaminos_config');
        return local ? JSON.parse(local) : {
            socialFee: 3000,
            activities: [{ name: 'Atletismo', price: 40000, social: true }]
        };
    },

    async updateConfig(newConfig) {
        localStorage.setItem('correcaminos_config', JSON.stringify(newConfig));
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                await window.firebase.firestore.setDoc(docRef, newConfig);
                return true;
            } catch (e) {
                console.error("Error guardando config en nube:", e);
                return false;
            }
        }
        return true;
    },

    async saveUser(uid, userData) {
        // Normalizar ID
        const finalId = userData.username ? userData.username.toLowerCase().replace(/[^a-z0-9]/g, '_') : uid;
        const finalData = { ...userData, id: finalId };

        // Local
        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const idx = users.findIndex(u => u.id === finalId);
        if (idx > -1) users[idx] = finalData;
        else users.push(finalData);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        // Nube
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", finalId);
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) { console.error("Error nube user:", e); }
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
                    const idx = allUsers.findIndex(au => au.id === cu.id);
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

    async getPayments() {
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "payments");
                const snapshot = await window.firebase.firestore.getDocs(q);
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.timestamp - a.timestamp);
            } catch (e) { }
        }
        return JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
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

    async updatePayment(id, updates) {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", id);
                await window.firebase.firestore.updateDoc(docRef, updates);
            } catch (e) { console.error("Error updating payment nube:", e); }
        }
        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        const p = local.find(x => x.id === id);
        if (p) {
            Object.assign(p, updates);
        }
        localStorage.setItem('correcaminos_payments', JSON.stringify(local));
    },

    subscribeToPayments(cb) {
        if (!this.db) return () => { };
        return window.firebase.firestore.onSnapshot(window.firebase.firestore.collection(this.db, "payments"), (snap) => {
            cb(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    },

    fileToBase64(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.readAsDataURL(file);
            r.onload = () => res(r.result);
            r.onerror = e => rej(e);
        });
    }
};

window.DataManager = DataManager;
