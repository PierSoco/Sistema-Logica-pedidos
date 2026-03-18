URL: https://zatmeni.ar/zple/index.html

libreria de iconos: <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
ejemplo de iconos: 
<i class="fa-solid fa-user"></i>
<i class="fa-solid fa-house"></i>
<i class="fa-solid fa-gear"></i>
<i class="fa-solid fa-right-from-bracket"></i>
<i class="fa-solid fa-database"></i>

---

## 1. Visión General

El objetivo es desarrollar una aplicación web de gestión logística para restaurantes que centralice el ciclo de vida de un pedido desde su recepción hasta la entrega final, coordinando tres perfiles de usuario clave: **Recepcionista, Cocinero y Repartidor.**

## 2. Stack Tecnológico Requerido

* **Frontend:** HTML5, CSS3, JavaScript (preferentemente ES6+).
* **Backend:** PHP (orientado a objetos).
* **Base de Datos:** MySQL.
* **Servidor:** Entorno Apache/Nginx (Propio).

---

## 3. Arquitectura de Datos (Entidades Principales)

Se requiere un diseño de base de datos relacional con las siguientes tablas clave:

* **Usuarios:** ID, username, password (hash), rol (admin, recep, chef, rider).
* **Pedidos:** ID, cliente_nombre, direccion, coordenadas, total, estado (pendiente, en_cocina, listo, en_camino, entregado), timestamp.
* **Detalle_Pedido:** ID_pedido, producto, cantidad, notas.

---

## 4. Flujo de Trabajo y Roles de Usuario

### A. Módulo Recepcionista (Input)

* **Función:** Alta de pedidos manual (llamadas/mensajes).
* **Campos:** Nombre del cliente, teléfono, dirección de entrega (con validación de mapa si es posible) y desglose de productos.
* **Acción de Sistema:** Al "Guardar", el pedido entra en estado `PENDIENTE` y se dispara un evento hacia la cocina.

### B. Módulo Cocina (Gestión de Producción)

* **Interfaz:** Dashboard de "Pedidos Entrantes" con actualización en tiempo real (polling o WebSockets).
* **Acciones:** 1.  Cambiar a `EN_COCINA` (opcional para tracking).
2.  Botón **"Pedido Terminado"**: Cambia el estado a `LISTO`.
* **Lógica:** Al marcar como `LISTO`, el pedido debe hacerse visible para el pool de repartidores.

### C. Módulo Repartidor (Logística de Última Milla)

* **Interfaz:** Lista de pedidos con estado `LISTO`.
* **Acciones:**
1. **Aceptar Pedido:** El repartidor se asigna el pedido (cambio a `EN_CAMINO`). El pedido desaparece de la lista global de otros repartidores.
2. **Ver Detalles:** Despliegue de datos del cliente y link a Google Maps/Waze con la dirección cargada.
3. **Confirmar Entrega:** Botón final que cambia el estado a `ENTREGADO`.



---

## 5. Requerimientos Técnicos No Funcionales

* **Sincronización:** El sistema debe reflejar cambios de estado sin necesidad de recargar la página constantemente (Uso de **AJAX/Fetch API**).
* **Seguridad:** Implementación de sesiones seguras y control de acceso basado en roles (RBAC).
* **Responsividad:** La interfaz del Repartidor debe ser **Mobile-First**, priorizando botones grandes y lectura clara en exteriores.

---

## 6. Funcionalidades de Escalabilidad (Roadmap)

El desarrollador debe dejar la estructura preparada para integrar:

1. **Geolocalización:** Tracking en vivo del repartidor mediante la API de Geolocation del navegador.
2. **Notificaciones:** Alertas automáticas vía email o SMS al cliente cuando el estado cambie a `EN_CAMINO`.
3. **Panel de Analytics:** Reporte de tiempos promedio (Tiempo en cocina vs. Tiempo de entrega) y volumen de ventas diario/mensual.
4. **Módulo de Pagos:** Integración con API de pasarelas de pago (Mercado Pago, Stripe, etc.).

---

**Nota para el desarrollador:** Se busca una arquitectura limpia, preferentemente siguiendo el patrón MVC, para facilitar el mantenimiento y la futura implementación de las funcionalidades del Roadmap.
