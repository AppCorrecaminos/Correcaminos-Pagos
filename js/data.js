/**
 * data.js - Gestión de Datos Robusta
 */

const DataManager = {
    db: null,

    init(dbInstance) {
        this.db = dbInstance;
        console.log("DataManager initialized with DB:", !!dbInstance);
    },

    // Config Methods
    async getConfig() {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const configDoc = await window.firebase.firestore.getDoc(docRef);
                if (configDoc.exists()) return configDoc.data();
            } catch (e) { }
        }
        // Fallback Local
        const localConfig = JSON.parse(localStorage.getItem('correcaminos_config'));
        return localConfig || {
            socialFee: 3000,
            activities: [
                { name: 'Atletismo', price: 40000 },
                { name: 'Ajedrez', price: 35000 }
            ]
        };
    },

    async updateConfig(newConfig) {
        localStorage.setItem('correcaminos_config', JSON.stringify(newConfig));
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                await window.firebase.firestore.updateDoc(docRef, newConfig);
            } catch (e) { }
        }
    },

    // User Methods
    async saveUser(uid, userData) {
        // Guardar en LOCAL
        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const index = users.findIndex(u => u.id === uid);

        // Mantener campos existentes si no vienen en userData (como email o username)
        const oldData = index > -1 ? users[index] : {};
        const mergedData = { ...oldData, id: uid, ...userData };

        if (index > -1) users[index] = mergedData;
        else users.push(mergedData);

        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        // Guardar en NUBE (Firestore)
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.setDoc(docRef, mergedData, { merge: true });
            } catch (e) { console.warn("No se pudo sincronizar con la nube."); }
        }
    },

    async getUsers() {
        let allUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Mezclar local y nube (favor de nube)
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
        // Local
        let users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        users = users.filter(u => u.id !== uid);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        // Nube
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) { console.error("Error al eliminar en la nube:", e); }
        }
    },

    // Payment Methods
    async getPayments() {
        let payments = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "payments");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                cloudPayments.forEach(cp => {
                    if (!payments.find(p => p.id === cp.id)) payments.push(cp);
                });
            } catch (e) { }
        }
        return payments.sort((a, b) => b.timestamp - a.timestamp);
    },

    async getPaymentsByUser(userId) {
        const all = await this.getPayments();
        return all.filter(p => p.userId === userId);
    },

    async addPayment(payment) {
        payment.id = 'pay_' + Date.now();
        payment.date = new Date().toISOString().split('T')[0];
        payment.timestamp = Date.now();

        // Guardar Local
        const payments = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        payments.push(payment);
        localStorage.setItem('correcaminos_payments', JSON.stringify(payments));

        // Guardar Nube
        if (this.db) {
            try {
                await window.firebase.firestore.addDoc(window.firebase.firestore.collection(this.db, "payments"), payment);
            } catch (e) { }
        }
    },

    async updatePaymentStatus(paymentId, status) {
        // Local
        const payments = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        const p = payments.find(pay => pay.id === paymentId);
        if (p) p.status = status;
        localStorage.setItem('correcaminos_payments', JSON.stringify(payments));

        // Nube
        if (this.db) {
            try {
                const paymentRef = window.firebase.firestore.doc(this.db, "payments", paymentId);
                await window.firebase.firestore.updateDoc(paymentRef, { status: status });
            } catch (e) { }
        }
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
