/**
 * auth.js - Sistema de Acceso con Detección de Fallos
 */

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
            localStorage.setItem('correcaminos_session', JSON.stringify(admin));
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
                        localStorage.setItem('correcaminos_session', JSON.stringify(session));
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
                    localStorage.setItem('correcaminos_session', JSON.stringify(cloudUser));
                    return { success: true, user: cloudUser };
                }

            } catch (e) {
                console.error("Error Firebase Auth:", e);
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
            localStorage.setItem('correcaminos_session', JSON.stringify(local));
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
