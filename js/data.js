/**
 * data.js - Gestión de Datos con Sincronización Doble
 */

const DataManager = {
    db: null,

    init(dbInstance) {
        this.db = dbInstance;
        console.log("DataManager: Conectado a base de datos en la nube.");
    },

    /**
     * Obtiene la configuración (precios, mora, etc) prioritariamente de la nube.
     */
    async getConfig() {
        // 1. Intentar desde la Nube (Siempre lo más fresco)
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const configDoc = await window.firebase.firestore.getDoc(docRef);
                if (configDoc.exists) {
                    const cloudData = configDoc.data();
                    // Guardamos una copia local por si se quedan sin internet
                    localStorage.setItem('correcaminos_config', JSON.stringify(cloudData));
                    return cloudData;
                }
            } catch (e) {
                console.warn("No se pudo leer la configuración de la nube, usando copia local.");
            }
        }

        // 2. Fallback a Copia Local
        const local = localStorage.getItem('correcaminos_config');
        if (local) return JSON.parse(local);

        // 3. Valores iniciales de fábrica (Solo se usan la primera vez de la historia)
        return {
            socialFee: 5000,
            lateFeeAmount: 5000,
            lateFeeDay: 12,
            activities: [
                { name: 'Atletismo Eq. Competitivo', price: 40000, social: true },
                { name: 'Atletismo Infantiles A y B', price: 40000, social: true },
                { name: 'Mayores', price: 40000, social: true },
                { name: 'Running', price: 40000, social: true }
            ]
        };
    },

    /**
     * Guarda la configuración en la nube y localmente.
     */
    async updateConfig(newConfig) {
        localStorage.setItem('correcaminos_config', JSON.stringify(newConfig));
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                await window.firebase.firestore.setDoc(docRef, newConfig);
                return true;
            } catch (e) {
                console.error("Error crítico: No se pudo guardar en la nube.", e);
                throw e; // Lanzamos el error para que la UI avise al admin
            }
        }
        return false;
    },

    /**
     * Gestión de Usuarios Centralizada en Firebase
     */
    async saveUser(uid, userData) {
        // Normalizar ID (el usuario que elige el admin)
        const finalId = userData.username ? userData.username.toLowerCase().replace(/[^a-z0-9]/g, '_') : uid;
        const finalData = { ...userData, id: finalId, lastUpdate: Date.now() };

        // 1. Guardar en Nube (Obligatorio para que sea persistente)
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", finalId);
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) {
                console.error("Error al guardar usuario en la nube:", e);
                throw e;
            }
        }

        // 2. Espejo Local para velocidad de carga
        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const idx = users.findIndex(u => u.id === finalId);
        if (idx > -1) users[idx] = finalData;
        else users.push(finalData);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));
    },

    async getUsers() {
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Actualizamos cache local
                localStorage.setItem('correcaminos_users', JSON.stringify(cloudUsers));
                return cloudUsers;
            } catch (e) {
                console.warn("Error leyendo usuarios de nube, usando locales.");
            }
        }
        return JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
    },

    async deleteUser(uid) {
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) { console.error("Error borrar nube:", e); throw e; }
        }
        let users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        users = users.filter(u => u.id !== uid);
        localStorage.setItem('correcaminos_users', JSON.stringify(users));
    },

    /**
     * Pagos y Comprobantes
     */
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

    async addPayment(payment) {
        const payId = 'pay_' + Date.now();
        payment.id = payId;
        payment.timestamp = Date.now();
        payment.date = new Date().toLocaleDateString('es-AR');

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", payId);
                await window.firebase.firestore.setDoc(docRef, payment);
            } catch (e) {
                console.error("Error guardando pago en nube:", e);
                alert("Atención: El pago se guardó localmente pero no pudo subir a la nube. Revisa tu conexión.");
            }
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
            } catch (e) { console.error("Error nube payment update:", e); }
        }
        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        const p = local.find(x => x.id === id);
        if (p) Object.assign(p, updates);
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
