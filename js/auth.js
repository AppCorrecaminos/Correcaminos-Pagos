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
        console.log("Auth initialized.");
    },

    // Generador de ID consistente
    getUserId(input) {
        if (!input) return "";
        const email = input.includes('@') ? input : `${input}@correcaminos.com`;
        return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    },

    async login(userInput, password) {
        if (!userInput || !password) return { success: false, message: "Ingresa usuario y contraseña." };

        const usernameInput = userInput.toLowerCase().split('@')[0];

        // 1. Intentar con usuarios fijos (admin/padre)
        const hardcoded = this.localUsers.find(u => u.username.toLowerCase() === usernameInput && u.password === password);
        if (hardcoded) {
            localStorage.setItem('correcaminos_session', JSON.stringify(hardcoded));
            return { success: true, user: hardcoded };
        }

        // 2. Intentar buscar en LocalStorage
        const savedLocalUsers = JSON.parse(localStorage.getItem('correcaminos_users') || '[]');
        const localSaved = savedLocalUsers.find(u => {
            const storedUser = (u.username || u.email || '').toLowerCase();
            return (storedUser === userInput.toLowerCase() || storedUser.split('@')[0] === usernameInput) && u.password === password;
        });

        if (localSaved) {
            localStorage.setItem('correcaminos_session', JSON.stringify(localSaved));
            return { success: true, user: localSaved };
        }

        // 3. Intentar con Firestore (Nube)
        if (this.db) {
            try {
                // Probar con ID directo y con ID formateado
                const idsToTry = [
                    userInput.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'),
                    this.getUserId(userInput)
                ];

                for (let uid of idsToTry) {
                    const userDocRef = window.firebase.firestore.doc(this.db, "users", uid);
                    const userDoc = await window.firebase.firestore.getDoc(userDocRef);
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.password === password) {
                            const sessionData = { id: uid, ...data };
                            localStorage.setItem('correcaminos_session', JSON.stringify(sessionData));
                            return { success: true, user: sessionData };
                        }
                    }
                }
            } catch (e) { console.error("Error login nube:", e); }
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
