// db.js - Sistema de Datos para App de Domicilios Rogasa Café
// Funciona con localStorage en produccion y con servidor local (SSE) en desarrollo

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const DB_SERVER = IS_LOCAL ? `http://localhost:8085` : null;
const LS_KEY = 'rogasa_delivery_orders';

function getLocalOrders() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch(e) { return {}; }
}

function saveLocalOrders(orders) {
    localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

function jsonParseSafe(str) {
    try { return JSON.parse(str); } catch(e) { return null; }
}

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

        // Always save to localStorage
        const orders = getLocalOrders();
        orders[nuevoPedido.id] = nuevoPedido;
        saveLocalOrders(orders);

        // Also try server if local
        if (IS_LOCAL && DB_SERVER) {
            try {
                await fetch(`${DB_SERVER}/api/orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevoPedido)
                });
            } catch(e) { /* localStorage is the source of truth */ }
        }

        return nuevoPedido;
    },

    async obtenerPedido(id) {
        const orders = getLocalOrders();
        if (orders[id]) return orders[id];

        if (IS_LOCAL && DB_SERVER) {
            try {
                const res = await fetch(`${DB_SERVER}/api/orders/${id}`);
                if (res.ok) return await res.json();
            } catch(e) {}
        }

        return null;
    },

    async obtenerPedidosActivos() {
        const orders = getLocalOrders();
        return Object.values(orders);
    },

    async actualizarEstado(id, nuevoEstado) {
        const orders = getLocalOrders();
        if (orders[id]) {
            orders[id].estado = nuevoEstado;
            saveLocalOrders(orders);
        }

        if (IS_LOCAL && DB_SERVER) {
            try {
                await fetch(`${DB_SERVER}/api/orders/${id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ estado: nuevoEstado })
                });
            } catch(e) {}
        }

        return orders[id] || null;
    },

    suscribirAPedido(id, callback) {
        // Initial call
        const orders = getLocalOrders();
        if (orders[id]) callback(orders[id]);

        // Poll localStorage every 2 seconds for changes
        const interval = setInterval(() => {
            const current = getLocalOrders();
            if (current[id]) callback(current[id]);
        }, 2000);

        // Also listen for cross-tab storage events
        const handler = (e) => {
            if (e.key === LS_KEY) {
                const updated = getLocalOrders();
                if (updated[id]) callback(updated[id]);
            }
        };
        window.addEventListener('storage', handler);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handler);
        };
    },

    suscribirATodosLosPedidos(callback) {
        // Initial call
        const orders = getLocalOrders();
        callback(Object.values(orders));

        // Poll localStorage every 2 seconds
        const interval = setInterval(() => {
            const current = getLocalOrders();
            callback(Object.values(current));
        }, 2000);

        // Cross-tab sync
        const handler = (e) => {
            if (e.key === LS_KEY) {
                const updated = getLocalOrders();
                callback(Object.values(updated));
            }
        };
        window.addEventListener('storage', handler);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handler);
        };
    }
};
