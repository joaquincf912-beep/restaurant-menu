// db.js - Módulo de conexión a la Base de Datos (Tiempo Real)
// Diseñado de forma aislada para Rogasa Café

// Auto-detect: production uses same origin, localhost uses port 8082
const DB_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8082'
    : window.location.origin + '/tracking';

export const db = {
    // Generador de ID único de pedido (ord_XXXXXX)
    generarIdUnico() {
        return 'ord_' + Math.random().toString(36).substring(2, 8);
    },

    // Crear un nuevo pedido en la base de datos
    async crearPedido(clienteNombre) {
        const id = this.generarIdUnico();
        return this.crearPedidoConId(id, clienteNombre);
    },

    // Crear un nuevo pedido con un ID predeterminado (para pruebas instantáneas)
    async crearPedidoConId(id, clienteNombre) {
        const nuevoPedido = {
            id: id,
            cliente_nombre: clienteNombre,
            estado: 'recibido',
            creado_el: new Date().toISOString()
        };

        try {
            const res = await fetch(`${DB_SERVER}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoPedido)
            });
            if (!res.ok) throw new Error('Error al crear pedido en servidor');
            return await res.json();
        } catch (error) {
            console.error('db.js: Usando almacenamiento local por fallo de servidor:', error);
            let localOrders = JSON.parse(localStorage.getItem('local_orders') || '{}');
            localOrders[id] = nuevoPedido;
            localStorage.setItem('local_orders', JSON.stringify(localOrders));
            return nuevoPedido;
        }
    },

    // Obtener detalles de un pedido específico
    async obtenerPedido(id) {
        try {
            const res = await fetch(`${DB_SERVER}/api/orders/${id}`);
            if (!res.ok) throw new Error('Pedido no encontrado');
            return await res.json();
        } catch (error) {
            let localOrders = JSON.parse(localStorage.getItem('local_orders') || '{}');
            return localOrders[id] || null;
        }
    },

    // Actualizar el estado de un pedido
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
            let localOrders = JSON.parse(localStorage.getItem('local_orders') || '{}');
            if (localOrders[id]) {
                localOrders[id].estado = nuevoEstado;
                localStorage.setItem('local_orders', JSON.stringify(localOrders));
                return { success: true, order: localOrders[id] };
            }
            throw error;
        }
    },

    // Obtener todos los pedidos activos (para el admin)
    async obtenerPedidosActivos() {
        try {
            const res = await fetch(`${DB_SERVER}/api/orders`);
            if (!res.ok) throw new Error('Error al obtener pedidos activos');
            return await res.json();
        } catch (error) {
            let localOrders = JSON.parse(localStorage.getItem('local_orders') || '{}');
            return Object.values(localOrders);
        }
    },

    // Escuchar cambios de un pedido específico en TIEMPO REAL (Server-Sent Events)
    suscribirAPedido(id, callback) {
        // Conexión SSE en tiempo real con el servidor local
        const eventSource = new EventSource(`${DB_SERVER}/api/stream?id=${id}`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                callback(data);
            } catch (err) {
                console.error('Error al procesar mensaje SSE:', err);
            }
        };

        eventSource.onerror = () => {
            // Reintento en memoria local si el servidor no responde
            const interval = setInterval(async () => {
                const order = await this.obtenerPedido(id);
                if (order) callback(order);
            }, 3000);

            eventSource.close();
            
            // Retorna función para cancelar la suscripción
            return () => clearInterval(interval);
        };

        // Retorna función para cerrar la conexión SSE
        return () => {
            eventSource.close();
        };
    },

    // Escuchar cambios de TODOS los pedidos en TIEMPO REAL (para la vista de Cocina/Admin)
    suscribirATodosLosPedidos(callback) {
        const eventSource = new EventSource(`${DB_SERVER}/api/stream-all`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                callback(data);
            } catch (err) {
                console.error('Error al procesar mensaje SSE (todos):', err);
            }
        };

        eventSource.onerror = () => {
            const interval = setInterval(async () => {
                const orders = await this.obtenerPedidosActivos();
                callback(orders);
            }, 3000);

            eventSource.close();
            return () => clearInterval(interval);
        };

        return () => {
            eventSource.close();
        };
    }
};

/* =====================================================================
   GUÍA DE CONFIGURACIÓN PARA PRODUCCIÓN (SUPABASE):
   
   Si deseas migrar esto a Supabase en el futuro, reemplaza el código de arriba con:

   import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

   const supabaseUrl = 'TU_SUPABASE_URL';
   const supabaseKey = 'TU_SUPABASE_ANON_KEY';
   const supabase = createClient(supabaseUrl, supabaseKey);

   export const db = {
       generarIdUnico() {
           return 'ord_' + Math.random().toString(36).substring(2, 8);
       },
       async crearPedido(clienteNombre) {
           const id = this.generarIdUnico();
           const { data, error } = await supabase
               .from('pedidos')
               .insert([{ id, cliente_nombre: clienteNombre, estado: 'recibido' }])
               .select()
               .single();
           if (error) throw error;
           return data;
       },
       async obtenerPedido(id) {
           const { data, error } = await supabase
               .from('pedidos')
               .select('*')
               .eq('id', id)
               .single();
           if (error) return null;
           return data;
       },
       async actualizarEstado(id, nuevoEstado) {
           const { data, error } = await supabase
               .from('pedidos')
               .update({ estado: nuevoEstado })
               .eq('id', id);
           if (error) throw error;
           return { success: true };
       },
       async obtenerPedidosActivos() {
           const { data, error } = await supabase
               .from('pedidos')
               .select('*')
               .order('created_at', { ascending: false });
           if (error) throw error;
           return data;
       },
       suscribirAPedido(id, callback) {
           const subscription = supabase
               .channel(`pedido:${id}`)
               .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` }, 
                   payload => callback(payload.new)
               )
               .subscribe();
           return () => {
               supabase.removeChannel(subscription);
           };
       },
       suscribirATodosLosPedidos(callback) {
           const subscription = supabase
               .channel('todos-los-pedidos')
               .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, 
                   async () => {
                       const activeOrders = await this.obtenerPedidosActivos();
                       callback(activeOrders);
                   }
               )
               .subscribe();
           return () => {
               supabase.removeChannel(subscription);
           };
       }
   };
===================================================================== */
