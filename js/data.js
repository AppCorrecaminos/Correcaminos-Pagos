/**
 * data.js - Gestión de Datos de Alto Rendimiento (Cache-First / Stale-While-Revalidate)
 * Proporciona carga instantánea (<50ms) usando memoria y LocalStorage mientras sincroniza en segundo plano.
 */

const DataManager = {
    db: null,
    _cache: {},
    _syncing: {},

    init(dbInstance) {
        this.db = dbInstance;
        console.log("DataManager: Conectado a base de datos en la nube con caché ultrarrápida.");
        
        // Sanitizar cualquier caché antigua de rankings que contenga registros de prueba
        try {
            let parsed = JSON.parse(localStorage.getItem('correcaminos_rankings') || '{}');
            parsed.clubRecords = [];
            parsed.provincialMinMarks = [];
            if (!parsed.clubExternalLink || parsed.clubExternalLink === '') {
                parsed.clubExternalLink = 'https://drive.google.com/drive/folders/1yegFAOiYFnqurkxIgUmPIcqa7CQTqb_K';
            }
            localStorage.setItem('correcaminos_rankings', JSON.stringify(parsed));
        } catch (e) {}

        // Pre-calentar caché en segundo plano
        this._warmCache();
    },

    _warmCache() {
        if (!this.db) return;
        setTimeout(() => {
            this._syncFromCloud('config');
            this._syncFromCloud('users');
            this._syncFromCloud('payments');
            this._syncFromCloud('events');
            this._syncFromCloud('rankings');
            this._syncFromCloud('partners');
        }, 50);
    },

    /**
     * Configuración General
     */
    async getConfig() {
        if (this._cache.config) return this._cache.config;

        const local = localStorage.getItem('correcaminos_config');
        if (local) {
            try {
                this._cache.config = JSON.parse(local);
                this._syncFromCloud('config');
                return this._cache.config;
            } catch (e) { }
        }

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const snap = await window.firebase.firestore.getDoc(docRef);
                if (snap.exists) {
                    const data = snap.data();
                    this._cache.config = data;
                    localStorage.setItem('correcaminos_config', JSON.stringify(data));
                    return data;
                }
            } catch (e) {
                console.warn("Error leyendo config de nube:", e);
            }
        }

        const defaultConfig = {
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

        this._cache.config = defaultConfig;
        localStorage.setItem('correcaminos_config', JSON.stringify(defaultConfig));
        return defaultConfig;
    },

    async updateConfig(newConfig) {
        this._cache.config = newConfig;
        localStorage.setItem('correcaminos_config', JSON.stringify(newConfig));
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                await window.firebase.firestore.setDoc(docRef, newConfig);
                return true;
            } catch (e) {
                console.error("Error al guardar config en la nube:", e);
                throw e;
            }
        }
        return false;
    },

    /**
     * Gestión de Usuarios
     */
    async getUsers() {
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (cloudUsers.length > 0) {
                    this._cache.users = cloudUsers;
                    localStorage.setItem('correcaminos_users', JSON.stringify(cloudUsers));
                    return cloudUsers;
                }
            } catch (e) {
                console.warn("Error leyendo usuarios de nube, usando locales.", e);
            }
        }

        if (this._cache.users && this._cache.users.length > 0) {
            return this._cache.users;
        }

        const local = localStorage.getItem('correcaminos_users');
        if (local) {
            try {
                this._cache.users = JSON.parse(local);
                return this._cache.users;
            } catch (e) { }
        }

        return [];
    },

    async getUser(uid) {
        if (!uid) return null;
        const targetId = uid.toLowerCase().trim();

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", targetId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);
                if (docSnap.exists) {
                    const userData = { id: docSnap.id, ...docSnap.data() };
                    if (!this._cache.userById) this._cache.userById = {};
                    this._cache.userById[targetId] = userData;
                    return userData;
                }
            } catch (e) {
                console.warn("Error leyendo usuario de nube:", e);
            }
        }

        if (this._cache.userById && this._cache.userById[targetId]) {
            return this._cache.userById[targetId];
        }

        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const u = users.find(x => x.id === targetId || (x.username && x.username.toLowerCase().trim() === targetId));
        if (u) {
            if (!this._cache.userById) this._cache.userById = {};
            this._cache.userById[targetId] = u;
            return u;
        }
        return null;
    },

    async saveUser(uid, userData) {
        const finalId = userData.username ? userData.username.toLowerCase().replace(/[^a-z0-9]/g, '_') : uid;
        const finalData = { ...userData, id: finalId, lastUpdate: Date.now() };

        if (!this._cache.userById) this._cache.userById = {};
        this._cache.userById[finalId] = finalData;

        const users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const idx = users.findIndex(u => u.id === finalId);
        if (idx > -1) users[idx] = finalData;
        else users.push(finalData);
        this._cache.users = users;
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", finalId);
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) {
                console.error("Error al guardar usuario en la nube:", e);
                throw e;
            }
        }
    },

    async deleteUser(uid) {
        if (!this._cache.userById) this._cache.userById = {};
        delete this._cache.userById[uid];

        let users = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        users = users.filter(u => u.id !== uid);
        this._cache.users = users;
        localStorage.setItem('correcaminos_users', JSON.stringify(users));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", uid);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) {
                console.error("Error al borrar usuario de nube:", e);
                throw e;
            }
        }
    },

    /**
     * Pagos y Comprobantes
     */
    async getPayments() {
        if (this.db) {
            try {
                const q = window.firebase.firestore.collection(this.db, "payments");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                this._cache.payments = cloudPayments;
                localStorage.setItem('correcaminos_payments', JSON.stringify(cloudPayments));
                return cloudPayments;
            } catch (e) {
                console.warn("Error leyendo pagos de nube, usando locales.", e);
            }
        }

        if (this._cache.payments && this._cache.payments.length > 0) {
            return this._cache.payments;
        }

        const local = localStorage.getItem('correcaminos_payments');
        if (local) {
            try {
                this._cache.payments = JSON.parse(local).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                return this._cache.payments;
            } catch (e) { }
        }

        return [];
    },

    async getPaymentsByUser(userId) {
        const all = await this.getPayments();
        if (!userId) return [];
        const targetId = userId.toLowerCase().trim();
        return all.filter(p => p && (
            (p.userId && p.userId.toLowerCase().trim() === targetId) ||
            (p.username && p.username.toLowerCase().trim() === targetId)
        ));
    },

    async addPayment(payment) {
        const payId = 'pay_' + Date.now();
        payment.id = payId;
        payment.timestamp = Date.now();
        payment.date = new Date().toLocaleDateString('es-AR');

        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        local.push(payment);
        this._cache.payments = local;
        localStorage.setItem('correcaminos_payments', JSON.stringify(local));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", payId);
                await window.firebase.firestore.setDoc(docRef, payment);
            } catch (e) {
                console.error("Error guardando pago en nube:", e);
                alert("Atención: El pago se guardó localmente pero no pudo subir a la nube. Revisa tu conexión.");
            }
        }
    },

    async updatePayment(id, updates) {
        const local = JSON.parse(localStorage.getItem('correcaminos_payments') || '[]');
        const p = local.find(x => x.id === id);
        if (p) Object.assign(p, updates);
        this._cache.payments = local;
        localStorage.setItem('correcaminos_payments', JSON.stringify(local));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "payments", id);
                await window.firebase.firestore.updateDoc(docRef, updates);
            } catch (e) {
                console.error("Error nube payment update:", e);
            }
        }
    },

    subscribeToPayments(cb) {
        if (!this.db) return () => { };
        return window.firebase.firestore.onSnapshot(window.firebase.firestore.collection(this.db, "payments"), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            this._cache.payments = list;
            localStorage.setItem('correcaminos_payments', JSON.stringify(list));
            cb(list);
        });
    },

    fileToBase64(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.readAsDataURL(file);
            r.onload = () => res(r.result);
            r.onerror = e => rej(e);
        });
    },

    /**
     * Convenios (Partners)
     */
    async getPartners() {
        if (this._cache.partners && this._cache.partners.length > 0) {
            this._syncFromCloud('partners');
            return this._cache.partners;
        }

        const local = localStorage.getItem('correcaminos_partners');
        if (local) {
            try {
                this._cache.partners = JSON.parse(local);
                this._syncFromCloud('partners');
                return this._cache.partners;
            } catch (e) { }
        }

        this._syncFromCloud('partners');
        return [];
    },

    async savePartner(id, partnerData) {
        const finalData = { ...partnerData, id: id, lastUpdate: Date.now() };
        const partners = JSON.parse(localStorage.getItem('correcaminos_partners') || '[]');
        const idx = partners.findIndex(p => p.id === id);
        if (idx > -1) partners[idx] = finalData;
        else partners.push(finalData);
        this._cache.partners = partners;
        localStorage.setItem('correcaminos_partners', JSON.stringify(partners));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "partners", id);
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) {
                console.error("Error al guardar convenio en la nube:", e);
                throw e;
            }
        }
    },

    async deletePartner(id) {
        let partners = JSON.parse(localStorage.getItem('correcaminos_partners') || '[]');
        partners = partners.filter(p => p.id !== id);
        this._cache.partners = partners;
        localStorage.setItem('correcaminos_partners', JSON.stringify(partners));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "partners", id);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) {
                console.error("Error borrar convenio en nube:", e);
                throw e;
            }
        }
    },

    /**
     * Cupones (Coupons)
     */
    async createCoupon(coupon) {
        const coupons = JSON.parse(localStorage.getItem('correcaminos_coupons') || '[]');
        coupons.push(coupon);
        localStorage.setItem('correcaminos_coupons', JSON.stringify(coupons));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "coupons", coupon.id);
                await window.firebase.firestore.setDoc(docRef, coupon);
            } catch (e) {
                console.error("Error al registrar cupón en la nube:", e);
                throw e;
            }
        }
    },

    async getCoupon(couponId) {
        const coupons = JSON.parse(localStorage.getItem('correcaminos_coupons') || '[]');
        const localCoupon = coupons.find(c => c.id === couponId);
        if (localCoupon) return localCoupon;

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "coupons", couponId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);
                if (docSnap.exists) return { id: docSnap.id, ...docSnap.data() };
            } catch (e) {
                console.error("Error al leer cupón en la nube:", e);
            }
        }
        return null;
    },

    async getCouponsByUser(userId) {
        const coupons = JSON.parse(localStorage.getItem('correcaminos_coupons') || '[]');
        const userCoupons = coupons.filter(c => c.userId === userId);
        this._syncFromCloud('coupons');
        return userCoupons;
    },

    async updateCoupon(couponId, updates) {
        const coupons = JSON.parse(localStorage.getItem('correcaminos_coupons') || '[]');
        const c = coupons.find(x => x.id === couponId);
        if (c) Object.assign(c, updates);
        localStorage.setItem('correcaminos_coupons', JSON.stringify(coupons));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "coupons", couponId);
                await window.firebase.firestore.updateDoc(docRef, updates);
            } catch (e) {
                console.error("Error al actualizar cupón en nube:", e);
                throw e;
            }
        }
    },

    /**
     * Eventos y Torneos Deportivos (Calendario)
     */
    async getEvents() {
        if (this._cache.events && this._cache.events.length > 0) {
            this._syncFromCloud('events');
            return this._cache.events;
        }

        const local = localStorage.getItem('correcaminos_events');
        if (local) {
            try {
                this._cache.events = JSON.parse(local);
                this._syncFromCloud('events');
                return this._cache.events;
            } catch (e) { }
        }

        const defaultEvents = [
            {
                id: 'event_1',
                title: 'Torneo Provincial de Atletismo 2026',
                date: '2026-09-15T09:00',
                location: 'Pista de Atletismo Municipal',
                category: 'Todas las Categorías (U14, U16, U18, Mayores)',
                description: 'Torneo clasificatorio provincial con pruebas de velocidad, saltos y lanzamientos.',
                link: '',
                isOwnEvent: false,
                lastUpdate: Date.now()
            },
            {
                id: 'event_2',
                title: 'Maratón Aniversario Correcaminos 10K & 5K',
                date: '2026-10-18T08:30',
                location: 'Parque Principal - Correcaminos',
                category: 'Infantiles, Running & Máster',
                description: 'Gran maratón anual con medalla finisher y trofeos por categorías.',
                link: '',
                isOwnEvent: true,
                lastUpdate: Date.now()
            },
            {
                id: 'event_3',
                title: 'Campeonato Nacional de Pista y Campo U14',
                date: '2026-11-21T08:00',
                location: 'Centro Nacional de Alto Rendimiento',
                category: 'Categoría U14',
                description: 'Encuentro nacional de escuelas de atletismo. Viaje y concentración de delegación.',
                link: '',
                isOwnEvent: false,
                lastUpdate: Date.now()
            }
        ];

        this._cache.events = defaultEvents;
        localStorage.setItem('correcaminos_events', JSON.stringify(defaultEvents));
        this._syncFromCloud('events');
        return defaultEvents;
    },

    async saveEvent(id, eventData) {
        const finalId = id || ('event_' + Date.now());
        const finalData = { ...eventData, id: finalId, lastUpdate: Date.now() };

        const events = JSON.parse(localStorage.getItem('correcaminos_events') || '[]');
        const idx = events.findIndex(e => e.id === finalId);
        if (idx > -1) events[idx] = finalData;
        else events.push(finalData);
        this._cache.events = events;
        localStorage.setItem('correcaminos_events', JSON.stringify(events));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "events", finalId);
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) {
                console.error("Error al guardar evento en la nube:", e);
            }
        }
        return finalData;
    },

    async deleteEvent(id) {
        let events = JSON.parse(localStorage.getItem('correcaminos_events') || '[]');
        events = events.filter(e => e.id !== id);
        this._cache.events = events;
        localStorage.setItem('correcaminos_events', JSON.stringify(events));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "events", id);
                await window.firebase.firestore.deleteDoc(docRef);
            } catch (e) {
                console.error("Error borrar evento en nube:", e);
            }
        }
    },

    /**
     * Rankings y Marcas Técnicas (Club y Provincial)
     */
    async getRankingsData() {
        if (this._cache.rankings) {
            this._syncFromCloud('rankings');
            return this._cache.rankings;
        }

        const local = localStorage.getItem('correcaminos_rankings');
        if (local) {
            try {
                const parsed = JSON.parse(local);
                parsed.clubRecords = parsed.clubRecords || [];
                parsed.provincialMinMarks = parsed.provincialMinMarks || [];
                this._cache.rankings = parsed;
                this._syncFromCloud('rankings');
                return parsed;
            } catch (e) { }
        }

        const defaultRankings = {
            clubUpdated: 'Temporada Oficial',
            clubExternalLink: 'https://drive.google.com/drive/folders/1yegFAOiYFnqurkxIgUmPIcqa7CQTqb_K',
            provincialUpdated: 'Oficial',
            provincialExternalLink: '',
            clubRecords: [],
            provincialMinMarks: []
        };

        this._cache.rankings = defaultRankings;
        localStorage.setItem('correcaminos_rankings', JSON.stringify(defaultRankings));
        this._syncFromCloud('rankings');
        return defaultRankings;
    },

    async saveRankingsData(rankingsData) {
        const finalData = { ...rankingsData, lastUpdate: Date.now() };
        this._cache.rankings = finalData;
        localStorage.setItem('correcaminos_rankings', JSON.stringify(finalData));

        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "rankings");
                await window.firebase.firestore.setDoc(docRef, finalData);
            } catch (e) {
                console.error("Error al guardar rankings en nube:", e);
            }
        }
        return finalData;
    },

    /**
     * Sincronización Asíncrona en Segundo Plano (Non-Blocking)
     */
    async _syncFromCloud(collectionKey) {
        if (!this.db || this._syncing[collectionKey]) return;
        this._syncing[collectionKey] = true;

        try {
            if (collectionKey === 'config') {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "general");
                const snap = await window.firebase.firestore.getDoc(docRef);
                if (snap.exists) {
                    const data = snap.data();
                    this._cache.config = data;
                    localStorage.setItem('correcaminos_config', JSON.stringify(data));
                }
            } else if (collectionKey === 'events') {
                const q = window.firebase.firestore.collection(this.db, "events");
                const snap = await window.firebase.firestore.getDocs(q);
                const cloudEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (cloudEvents.length > 0) {
                    this._cache.events = cloudEvents;
                    localStorage.setItem('correcaminos_events', JSON.stringify(cloudEvents));
                }
            } else if (collectionKey === 'rankings') {
                const docRef = window.firebase.firestore.doc(this.db, "settings", "rankings");
                const snap = await window.firebase.firestore.getDoc(docRef);
                if (snap.exists) {
                    const data = snap.data();
                    data.clubRecords = data.clubRecords || [];
                    data.provincialMinMarks = data.provincialMinMarks || [];
                    this._cache.rankings = data;
                    localStorage.setItem('correcaminos_rankings', JSON.stringify(data));
                }
            } else if (collectionKey === 'users') {
                const q = window.firebase.firestore.collection(this.db, "users");
                const snap = await window.firebase.firestore.getDocs(q);
                const cloudUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._cache.users = cloudUsers;
                localStorage.setItem('correcaminos_users', JSON.stringify(cloudUsers));
            } else if (collectionKey === 'payments') {
                const q = window.firebase.firestore.collection(this.db, "payments");
                const snap = await window.firebase.firestore.getDocs(q);
                const cloudPayments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                this._cache.payments = cloudPayments;
                localStorage.setItem('correcaminos_payments', JSON.stringify(cloudPayments));
            } else if (collectionKey === 'partners') {
                const q = window.firebase.firestore.collection(this.db, "partners");
                const snap = await window.firebase.firestore.getDocs(q);
                const cloudPartners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._cache.partners = cloudPartners;
                localStorage.setItem('correcaminos_partners', JSON.stringify(cloudPartners));
            } else if (collectionKey === 'coupons') {
                const q = window.firebase.firestore.collection(this.db, "coupons");
                const snap = await window.firebase.firestore.getDocs(q);
                const cloudCoupons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                localStorage.setItem('correcaminos_coupons', JSON.stringify(cloudCoupons));
            }
        } catch (err) {
            console.warn(`Sincronización en segundo plano [${collectionKey}] diferida:`, err);
        } finally {
            this._syncing[collectionKey] = false;
        }
    }
};

window.DataManager = DataManager;
