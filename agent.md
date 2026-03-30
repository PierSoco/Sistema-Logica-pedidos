# RepartoGO (Sistema Lógica de Pedidos) - Instrucciones para el Agente AI

## Contexto General
- **URL de Producción/Demo:** https://zatmeni.ar/zple/index.html

## Visión General del Proyecto
Es una aplicación web de gestión logística para restaurantes que centraliza el ciclo de vida de un pedido desde su recepción hasta la entrega final. Coordina múltiples perfiles de usuario mediante un sistema de Role-Based Access Control (RBAC).

## Stack Tecnológico
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+). No se utilizan frameworks de JS (como React, Vue o Angular).
- **Backend:** PHP puro (procesal y orientado a objetos puntuales) trabajando como una API.
- **Base de Datos:** MySQL (acceso a través de PDO en PHP).
- **Iconos:** FontAwesome 6.5. Se utiliza el CDN: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">`

## Arquitectura de Datos (Entidades Principales)
- **Usuarios:** `ID_usuario`, `Nombre`, `Email`, `Password` (hash), `Rol` (superadmin, admin, recepcionista, chef, repartidor), `activo`.
- **Pedidos:** `ID_pedido`, `ID_cliente`, `ID_direccion`, `ID_restaurante`, `Total`, `Estado` (Pendiente, Preparando, En camino, Entregado, Cancelado), `fecha_creacion`.
- **Detalle_Pedido:** `ID_detalle`, `ID_pedido`, `ID_producto`, `Cantidad`, `Precio`, `Subtotal`.
- **Clientes:** `ID_cliente`, `Nombre`, `Apellido`, `Telefono`.
- **Direcciones:** `ID_direccion`, `calle`, `altura`, `piso_depto`, `referencias`, `Localidad`.
- **Productos:** `ID_producto`, `Nombre_producto`, `Precio`, `Stock`, `Activo`, `ID_restaurante`.

## Flujo de Trabajo y Roles del Sistema (RBAC)
1.  **Superadmin:** Acceso global, CRUD de usuarios.
2.  **Admin:** Acceso a estadísticas globales y todos los pedidos.
3.  **Recepcionista (Input):**
    - **Función:** Alta de pedidos manuales (llamadas/mensajes).
    - **Interfaz:** Formulario de alta de pedidos, gestión del carrito, y panel de seguimiento de pedidos activos (Kanban drag-and-drop y Tabla).
    - **Acción de Sistema:** Al guardar, el pedido entra en estado `Pendiente`.
4.  **Chef (Cocina):**
    - **Interfaz:** Panel en tiempo real de pedidos con estado `Pendiente`.
    - **Acción de Sistema:** Transiciona el estado del pedido a `Preparando` y finalmente a `En camino` (listo para el repartidor).
5.  **Repartidor (Rider):**
    - **Interfaz:** Listado de pedidos con estado `En camino`.
    - **Acciones:** Visualiza detalles del pedido y cliente, y confirma la entrega.
    - **Acción de Sistema:** Al confirmar, el estado del pedido cambia a `Entregado`.

## Convenciones y Reglas de Desarrollo

### Backend (PHP)
- **Enrutamiento:** Las peticiones son capturadas por `backend/funciones.php` mediante el parámetro `$_GET['action']`.
- **Seguridad DB:** Es obligatorio el uso de sentencias preparadas (`PDO->prepare()`) en todas las consultas para evitar inyecciones SQL.
- **Seguridad de Sesiones:** Proteger endpoints usando los helpers de validación de roles (`validarSesion()`, `validarRol(['admin', 'recepcionista'])`).
- **Formato de Respuesta:** Todas las respuestas a las peticiones del cliente deben retornar un `Content-Type: application/json` y tener la estructura: `['status' => 'success'|'error', 'message' => '...', 'data' => ...]`.

### Frontend (JavaScript)
- **Peticiones HTTP:** Utilizar siempre `fetch` API con `async/await` (no usar jQuery AJAX ni XMLHttpRequest).
- **Reactividad y Polling:** El sistema se actualiza automáticamente mediante polling silencioso. Utilizar el hash del servidor (`_lastRefreshHash`) para evitar re-renderizados innecesarios del DOM y optimizar la red.
- **Manipulación DOM:** Modificar el DOM de manera granular cuando sea posible o a través de plantillas literales interpoladas.
- **Alertas:** Para el feedback al usuario, utilizar la función nativa `mostrarMensaje(tipo, mensaje)` (donde tipo es `'success'` o `'error'`).
- **Drag & Drop:** Si se agregan funcionalidades kanban, usar la API HTML5 nativa (`dragstart`, `dragover`, `drop`) como está implementada en las tarjetas actuales.

### Estilo de Código y Buenas Prácticas
- **Idioma:** Nombres de variables, funciones, comentarios y textos mostrados en la interfaz deben estar estrictamente en **Español**.
- **Nomenclatura JS:** `camelCase` para variables y funciones. Variables privadas de uso interno (como timers globales o flags de estado) deben estar precedidas por un guion bajo, por ejemplo `_autoReloadTimer` o `_cicloActivo`.
- **Gestión del Estado:** Conservar el estado global en variables bien definidas arriba de cada módulo (ej. `DATA_RECEPCION`, `carritoActual`) y evitar acoplamiento estricto.

### Requerimientos No Funcionales Clave
- **Arquitectura:** Se prefiere seguir una estructura limpia, similar al patrón MVC, para facilitar el mantenimiento.
- **Responsividad:** La interfaz del **Repartidor** debe ser **Mobile-First**, priorizando botones grandes y lectura clara.

### Roadmap & Futuras Implementaciones Consideradas
- Integración de geolocalización (Tracking en vivo para repartidor).
- WebSockets (para sustituir el Polling eventualmente).
- Módulo de Analytics y pasarelas de pago (Stripe, Mercado Pago).