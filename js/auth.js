/**
 * auth.js - Sistema de Acceso Global Cloud (Diagnóstico Activo)
 */

const Auth = {
    auth: null,
    db: null,

    init(authInstance, dbInstance) {
        this.auth = authInstance;
        this.db = dbInstance;
        console.log("Auth: Conectado a Firebase");
    },

    async login(userInput, password) {
        if (!userInput || !password) return { success: false, message: "Ingresa usuario y contraseña." };

        const usernameInput = userInput.toLowerCase().trim();
        const slugId = usernameInput.replace(/[^a-z0-9]/g, '_');

        // 1. Usuarios estáticos (Siempre funcionan)
        if (usernameInput === 'admin' && password === 'admin123') {
            const admin = { id: 'local_admin', username: 'admin', role: 'admin', name: 'Administrador' };
            localStorage.setItem('correcaminos_session', JSON.stringify(admin));
            return { success: true, user: admin };
        }

        // 2. Intentar buscar en Nube (Prioridad)
        if (this.db) {
            try {
                const docRef = window.firebase.firestore.doc(this.db, "users", slugId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.password === password) {
                        const session = { id: slugId, ...data };
                        localStorage.setItem('correcaminos_session', JSON.stringify(session));
                        return { success: true, user: session };
                    } else {
                        return { success: false, message: "Contraseña incorrecta en la nube." };
                    }
                }
            } catch (e) {
                console.error("Error al leer de la nube:", e);
                return { success: false, message: "Error de conexión con la nube. ¿Configuraste las reglas?" };
            }
        }

        // 3. Fallback Local
        const localUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const user = localUsers.find(u => (u.username === usernameInput || u.id === slugId) && u.password === password);

        if (user) {
            localStorage.setItem('correcaminos_session', JSON.stringify(user));
            return { success: true, user: user };
        }

        return { success: false, message: "Usuario no encontrado. Asegúrate de haberlo sincronizado a la nube." };
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
