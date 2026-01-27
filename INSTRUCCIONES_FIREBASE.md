# Guía de Conexión a Firebase para Correcaminos

Para que tu plataforma guarde datos reales en la nube, sigue estos pasos:

## 1. Crear el Proyecto
1. Ve a [Firebase Console](https://console.firebase.google.com/) e inicia sesión con tu cuenta de Google.
2. Haz clic en **"Agregar proyecto"** y ponle de nombre `Correcaminos-Pagos`.
3. Desactiva Google Analytics si prefieres algo más simple (opcional).

## 2. Obtener las Claves
1. Haz clic en el icono de **Web (`</>`)** en el centro de la pantalla.
2. Ponle un nombre a la app (ej. `Web-Pagos`).
3. Copia el objeto `firebaseConfig` que aparecerá.
4. Abre el archivo `C:\Users\Patricio\.gemini\antigravity\scratch\Correcaminos\js\firebase-config.js` y reemplaza el contenido con tus claves.

## 3. Activar Servicios (CRUCIAL)
En el menú lateral de Firebase, activa lo siguiente:

### A. Authentication
- Haz clic en **"Comenzar"**.
- Elige **"Correo electrónico/contraseña"** y habilítalo.
- Ve a la pestaña **"Users"** y crea tu primer usuario:
  - **Email:** `admin@correcaminos.com`
  - **Password:** `tu_contraseña_secreta`

### B. Firestore Database
- Haz clic en **"Crear base de datos"**.
- Elige ubicación (ej. `us-central1`).
- Elige **"Comenzar en modo de prueba"** para que puedas empezar a guardar datos de inmediato.

### C. Storage
- Haz clic en **"Comenzar"** y elige las opciones por defecto. Esto permitirá que los padres suban fotos de sus comprobantes.

## 4. Configurar Usuario Admin en Base de Datos
Para que el sistema sepa quién es el jefe:
1. En **Firestore**, crea una colección llamada `users`.
2. Crea un documento con el ID exacto del usuario administrador (puedes copiar el `UID` desde la pestaña Authentication).
3. Agrega estos campos al documento:
   - `name`: "Tu Nombre"
   - `role`: "admin"

¡Listo! Una vez hecho esto, ya puedes entrar con tu usuario y contraseña desde cualquier computadora.
