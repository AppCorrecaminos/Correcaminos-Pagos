/**
 * auth.js - Sistema de Acceso Global Cloud
 */

const Auth = {
    auth: null,
    db: null,

    init(authInstance, dbInstance) {
        this.auth = authInstance;
        this.db = dbInstance;
    },

    async login(userInput, password) {
        if (!userInput || !password) return { success: false, message: "Ingresa usuario y contraseña." };

        const usernameInput = userInput.toLowerCase().trim();
        const slugId = usernameInput.replace(/[^a-z0-9]/g, '_');

        // 1. Usuarios estáticos
        if (usernameInput === 'admin' && password === 'admin123') {
            const admin = { id: 'local_admin', username: 'admin', role: 'admin', name: 'Administrador' };
            localStorage.setItem('correcaminos_session', JSON.stringify(admin));
            return { success: true, user: admin };
        }

        // 2. Intentar buscar en Nube (Prioridad)
        if (this.db) {
            try {
                // Probar con el slug (id estándar)
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
            } catch (e) { console.error("Error login nube:", e); }
        }

        // 3. Fallback Local (Solo si no hay red o no se encontró en nube)
        const localUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const user = localUsers.find(u => (u.username === usernameInput || u.id === slugId) && u.password === password);

        if (user) {
            localStorage.setItem('correcaminos_session', JSON.stringify(user));
            return { success: true, user: user };
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
