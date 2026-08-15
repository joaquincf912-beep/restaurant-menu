// db.js - Conexión de Datos en Tiempo Real (SSE / REST) para App de Domicilios
// Diseñado para Rogasa Café

const DB_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8085'
    : window.location.origin;

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
            creado_el: new Date().toISOString()
        };

        try {
            const res = await fetch(`${DB_SERVER}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoPedido)
            });
            if (!res.ok) throw new Error('Error al registrar pedido en servidor');
            return await res.json();
        } catch (error) {
            console.error('db.js: Usando respaldo de LocalStorage debido a error de red:', error);
            let localOrders = JSON.parse(localStorage.getItem('delivery_orders') || '{}');
            localOrders[nuevoPedido.id] = nuevoPedido;
            localStorage.setItem('delivery_orders', JSON.stringify(localOrders));
            return nuevoPedido;
        }
    },

    async obtenerPedido(id) {
        try {
            const res = await fetch(`${DB_SERVER}/api/orders/${id}`);
            if (!res.ok) throw new Error('Pedido no encontrado');
            return await res.json();
        } catch (error) {
            let localOrders = JSON.parse(localStorage.getItem('delivery_orders') || '{}');
            return localOrders[id] || { error: 'Not found' };
        }
    },

    async obtenerPedidosActivos() {
        try {
            const res = await fetch(`${DB_SERVER}/api/orders`);
            if (!res.ok) throw new Error('Error al obtener pedidos');
            return await res.json();
        } catch (error) {
            let localOrders = JSON.parse(localStorage.getItem('delivery_orders') || '{}');
            return Object.values(localOrders).filter(o => o.estado !== 'entregado');
        }
    },

    async actualizarEstado(id, nuevoEstado) {
        try {
            const res = await fetch(`${DB_SERVER}/api/orders/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: nuevoEstado })
            });
            if (!res.ok) throw new Error('Error al actualizar estado');
            return await res.json();
        } catch (error) {
            let localOrders = JSON.parse(localStorage.getItem('delivery_orders') || '{}');
            if (localOrders[id]) {
                localOrders[id].estado = nuevoEstado;
                localStorage.setItem('delivery_orders', JSON.stringify(localOrders));
                return localOrders[id];
            }
            return { error: 'Not found' };
        }
    },

    suscribirAPedido(id, callback) {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.origin.includes('traccionweb.com')) {
            // Fallback: Long polling local si no hay soporte SSE
            const interval = setInterval(async () => {
                const order = await this.obtenerPedido(id);
                callback(order);
            }, 3000);
            return () => clearInterval(interval);
        }

        const sseUrl = `${DB_SERVER}/api/stream?id=${id}`;
        const eventSource = new EventSource(sseUrl);

        eventSource.onmessage = (event) => {
            try {
                const order = jsonParseSafe(event.data);
                if (order) callback(order);
            } catch (e) {
                console.error('Error parseando SSE data:', e);
            }
        };

        eventSource.onerror = () => {
            console.warn('SSE disconnected. Reconnecting...');
        };

        return () => {
            eventSource.close();
        };
    },

    suscribirATodosLosPedidos(callback) {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.origin.includes('traccionweb.com')) {
            const interval = setInterval(async () => {
                const orders = await this.obtenerPedidosActivos();
                callback(orders);
            }, 3000);
            return () => clearInterval(interval);
        }

        const sseUrl = `${DB_SERVER}/api/stream-all`;
        const eventSource = new EventSource(sseUrl);

        eventSource.onmessage = (event) => {
            try {
                const orders = jsonParseSafe(event.data);
                if (orders) callback(orders);
            } catch (e) {
                console.error('Error parseando SSE data:', e);
            }
        };

        return () => {
            eventSource.close();
        };
    }
};

function jsonParseSafe(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}
