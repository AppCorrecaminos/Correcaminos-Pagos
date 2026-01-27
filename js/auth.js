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
                // 1. Intentar por ID directo
                const docRef = window.firebase.firestore.doc(this.db, "users", slugId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.password === password) {
                        const session = { id: slugId, ...data };
                        localStorage.setItem('correcaminos_session', JSON.stringify(session));
                        return { success: true, user: session };
                    }
                }

                // 2. Intentar buscar por campo 'username' por si el ID es distinto
                const q = window.firebase.firestore.collection(this.db, "users");
                const snapshot = await window.firebase.firestore.getDocs(q);
                const cloudUser = snapshot.docs.find(d => {
                    const dData = d.data();
                    return (dData.username && dData.username.toLowerCase() === usernameInput) && dData.password === password;
                });

                if (cloudUser) {
                    const session = { id: cloudUser.id, ...cloudUser.data() };
                    localStorage.setItem('correcaminos_session', JSON.stringify(session));
                    return { success: true, user: session };
                }

            } catch (e) {
                console.error("Error Firebase Auth:", e);
                return { success: false, message: "Error de conexión con la nube. ¿Configuraste las reglas?" };
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
