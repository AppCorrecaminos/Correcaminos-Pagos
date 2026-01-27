/**
 * auth.js - Sistema de Acceso Robusto y Compatible
 */

const Auth = {
    auth: null,
    db: null,

    localUsers: [
        { id: 'local_admin', username: 'admin', password: 'admin123', role: 'admin', name: 'Administrador' },
        { id: 'local_padre', username: 'padre', password: '123', role: 'user', name: 'Padre de Familia' }
    ],

    init(authInstance, dbInstance) {
        this.auth = authInstance;
        this.db = dbInstance;
        console.log("Auth initialized with backend:", !!authInstance);
    },

    async login(emailOrUser, password) {
        const usernameInput = emailOrUser.toLowerCase().split('@')[0];

        // 1. Intentar con usuarios fijos
        const hardcoded = this.localUsers.find(u => u.username.toLowerCase() === usernameInput && u.password === password);
        if (hardcoded) {
            localStorage.setItem('correcaminos_session', JSON.stringify(hardcoded));
            return { success: true, user: hardcoded };
        }

        // 2. Intentar buscar en Usuarios creados por el Admin (LocalStorage)
        const savedLocalUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const localSaved = savedLocalUsers.find(u => {
            const storedUser = u.username || u.email || '';
            return storedUser.toLowerCase().split('@')[0] === usernameInput && u.password === password;
        });
        if (localSaved) {
            localStorage.setItem('correcaminos_session', JSON.stringify(localSaved));
            return { success: true, user: localSaved };
        }

        // 3. Intentar con Firestore (Nube)
        if (this.db) {
            try {
                const userId = emailOrUser.includes('@') ? emailOrUser.replace(/[^a-zA-Z0-9]/g, '_') : `${emailOrUser}@correcaminos.com`.replace(/[^a-zA-Z0-9]/g, '_');
                const userDocRef = window.firebase.firestore.doc(this.db, "users", userId);
                const userDoc = await window.firebase.firestore.getDoc(userDocRef);

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (data.password === password) {
                        const sessionData = { id: userId, ...data };
                        localStorage.setItem('correcaminos_session', JSON.stringify(sessionData));
                        return { success: true, user: sessionData };
                    }
                }
            } catch (e) { console.warn("Firestore access denied:", e); }
        }

        return { success: false, message: "Usuario o contraseña incorrectos." };
    },

    logout() {
        localStorage.removeItem('correcaminos_session');
        if (this.auth) window.firebase.auth.signOut(this.auth).catch(() => { });
        window.location.reload();
    },

    getCurrentUser() {
        const local = localStorage.getItem('correcaminos_session');
        return local ? JSON.parse(local) : null;
    }
};

window.Auth = Auth;
