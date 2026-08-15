// db.js — Firebase Realtime Database para Rogasa Café Delivery
// Sincronización en tiempo real compatible con todos los navegadores móviles (Safari/iOS)

const firebaseConfig = {
    apiKey: "AIzaSyDViZSKtfnEVnDL1GEF4iOl9kUp043Y3mw",
    authDomain: "rogasa-delivery.firebaseapp.com",
    databaseURL: "https://rogasa-delivery-default-rtdb.firebaseio.com",
    projectId: "rogasa-delivery",
    storageBucket: "rogasa-delivery.firebasestorage.app",
    messagingSenderId: "67005464439",
    appId: "1:67005464439:web:7ce4db453342c3f4e6ab72"
};

// Initialize Firebase using global window.firebase
const firebase = window.firebase;
let app;
if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
} else {
    app = firebase.app();
}
const database = firebase.database();

export const db = {

    generarIdUnico() {
        return 'ord_' + Math.random().toString(36).substring(2, 8);
    },

    async crearPedido({ id, cliente_nombre, ubicacion, telefono, metodo_pago, total_usd, total_bs, items }) {
        const nuevoPedido = {
            id: id || this.generarIdUnico(),
            cliente_nombre,
            ubicacion,
            telefono,
            metodo_pago,
            total_usd,
            total_bs,
            items,
            estado: 'recibido',
            creado_en: new Date().toISOString()
        };

        try {
            await database.ref('orders/' + nuevoPedido.id).set(nuevoPedido);
        } catch (e) {
            console.error('Firebase write error:', e);
        }

        return nuevoPedido;
    },

    async obtenerPedido(id) {
        try {
            const snapshot = await database.ref('orders/' + id).get();
            if (snapshot.exists()) return snapshot.val();
        } catch (e) {
            console.error('Firebase read error:', e);
        }
        return null;
    },

    async obtenerPedidosActivos() {
        try {
            const snapshot = await database.ref('orders').get();
            if (snapshot.exists()) return Object.values(snapshot.val());
        } catch (e) {
            console.error('Firebase read error:', e);
        }
        return [];
    },

    async actualizarEstado(id, nuevoEstado) {
        try {
            await database.ref('orders/' + id).update({ estado: nuevoEstado });
            const snapshot = await database.ref('orders/' + id).get();
            return snapshot.exists() ? snapshot.val() : null;
        } catch (e) {
            console.error('Firebase update error:', e);
            return null;
        }
    },

    suscribirAPedido(id, callback) {
        const orderRef = database.ref('orders/' + id);
        orderRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            }
        });
        return () => orderRef.off('value');
    },

    suscribirATodosLosPedidos(callback) {
        const ordersRef = database.ref('orders');
        ordersRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                callback(Object.values(snapshot.val()));
            } else {
                callback([]);
            }
        });
        return () => ordersRef.off('value');
    }
};
