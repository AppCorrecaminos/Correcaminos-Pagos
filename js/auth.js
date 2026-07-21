function safeSetSession(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn("localStorage cuota excedida al guardar sesión. Limpiando cachés grandes...", e);
        try {
            // Intentar liberar espacio eliminando imágenes/cachés pesadas en localStorage si las hay
            localStorage.removeItem('correcaminos_payments');
            localStorage.setItem(key, JSON.stringify(data));
        } catch (err) {
            // Si aun así falla (p.ej. por imágenes pesadas dentro del propio objeto user), guardar versión aligerada
            try {
                const lightData = { ...data };
                if (lightData.children) {
                    lightData.children = lightData.children.map(c => ({
                        ...c,
                        medicalCertURL: c.medicalCertURL ? '[Cargado en Nube]' : null
                    }));
                }
                localStorage.setItem(key, JSON.stringify(lightData));
            } catch (errFinal) {
                console.error("No se pudo guardar sesión en localStorage:", errFinal);
            }
        }
    }
}

const Auth = {
    db: null,

    init(auth, db) { this.db = db; },

    async login(userInput, password) {
        if (!userInput || !password) return { success: false, message: "Faltan datos." };

        const usernameInput = userInput.toLowerCase().trim();
        const slugId = usernameInput.replace(/[^a-z0-9]/g, '_');

        // Admin estático por si falla la nube
        if (usernameInput === 'admin' && password === 'admin123') {
            const admin = { id: 'local_admin', username: 'admin', role: 'admin', name: 'Administrador' };
            safeSetSession('correcaminos_session', admin);
            return { success: true, user: admin };
        }

        // Búsqueda en Nube
        if (this.db) {
            try {
                // 1. Intentar por ID directo (más rápido)
                const docRef = window.firebase.firestore.doc(this.db, "users", slugId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);

                // En Firebase Compat, 'exists' es una propiedad booleana, no una función
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (String(data.password) === String(password)) {
                        const session = { id: slugId, ...data };
                        safeSetSession('correcaminos_session', session);
                        return { success: true, user: session };
                    }
                }

                // 2. Búsqueda por campo 'username' o 'name' (Backup)
                const usersRef = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(usersRef);

                let cloudUser = null;
                snapshot.forEach(doc => {
                    const d = doc.data();
                    const isNameMatch = d.name && d.name.toLowerCase() === usernameInput;
                    const isUserMatch = d.username && d.username.toLowerCase() === usernameInput;

                    if ((isNameMatch || isUserMatch) && String(d.password) === String(password)) {
                        cloudUser = { id: doc.id, ...d };
                    }
                });

                if (cloudUser) {
                    safeSetSession('correcaminos_session', cloudUser);
                    return { success: true, user: cloudUser };
                }

            } catch (e) {
                console.error("Error Firebase Auth:", e);
                if (e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
                    // Si llega aquí un QuotaExceededError inesperado
                    try {
                        localStorage.clear();
                    } catch (errClear) {}
                    return { success: false, message: "La memoria del navegador estaba llena. Hemos limpiado el espacio. Por favor intenta ingresar de nuevo." };
                }
                if (e.code === 'permission-denied') {
                    return { success: false, message: "Error: No tienes permisos en Firebase. Revisa las REGLAS de tu base de datos (paso 3B)." };
                }
                return { success: false, message: "Error de conexión con la nube: " + (e.message || "Desconocido") };
            }
        }

        // Fallback Local
        const locals = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const local = locals.find(u => (u.username === usernameInput || u.id === slugId) && u.password === password);
        if (local) {
            safeSetSession('correcaminos_session', local);
            return { success: true, user: local };
        }

        return { success: false, message: "Usuario o contraseña incorrectos." };
    },

    logout() {
        localStorage.removeItem('correcaminos_session');
        window.location.reload();
    },

    getCurrentUser() {
        const local = localStorage.getItem('correcaminos_session');
        return local ? JSON.parse(local) : null;
    }
};

window.Auth = Auth;
