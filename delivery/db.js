// db.js — Firebase Realtime Database para Rogasa Café Delivery
// Sincronización en tiempo real entre clientes y cocina

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, get, child, onValue, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyDViZSKtfnEVnDL1GEF4iOl9kUp043Y3mw",
    authDomain: "rogasa-delivery.firebaseapp.com",
    databaseURL: "https://rogasa-delivery-default-rtdb.firebaseio.com",
    projectId: "rogasa-delivery",
    storageBucket: "rogasa-delivery.firebasestorage.app",
    messagingSenderId: "67005464439",
    appId: "1:67005464439:web:7ce4db453342c3f4e6ab72"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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
            await set(ref(database, 'orders/' + nuevoPedido.id), nuevoPedido);
        } catch (e) {
            console.error('Firebase write error:', e);
        }

        return nuevoPedido;
    },

    async obtenerPedido(id) {
        try {
            const snapshot = await get(child(ref(database), 'orders/' + id));
            if (snapshot.exists()) return snapshot.val();
        } catch (e) {
            console.error('Firebase read error:', e);
        }
        return null;
    },

    async obtenerPedidosActivos() {
        try {
            const snapshot = await get(ref(database, 'orders'));
            if (snapshot.exists()) return Object.values(snapshot.val());
        } catch (e) {
            console.error('Firebase read error:', e);
        }
        return [];
    },

    async actualizarEstado(id, nuevoEstado) {
        try {
            await update(ref(database, 'orders/' + id), { estado: nuevoEstado });
            const snapshot = await get(ref(database, 'orders/' + id));
            return snapshot.exists() ? snapshot.val() : null;
        } catch (e) {
            console.error('Firebase update error:', e);
            return null;
        }
    },

    suscribirAPedido(id, callback) {
        const orderRef = ref(database, 'orders/' + id);
        return onValue(orderRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            }
        });
    },

    suscribirATodosLosPedidos(callback) {
        const ordersRef = ref(database, 'orders');
        return onValue(ordersRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(Object.values(snapshot.val()));
            } else {
                callback([]);
            }
        });
    }
};
