Tablas:
- Usuarios (usuarios que trabajan con roles [recepcionista, repartidores, chef])
- Restaurantes
- Clientes
- Pedidos
- Detalle-pedido

Datos de tablas:
- Usuarios:
    - ID_usuario
    - ID_Restaurantes
    - Nombre
    - Apellido
    - Telefono
    - Rol
    - Username
    - Password (hash)
    
- Pedidos:
    - ID_pedido
    - ID_cliente
    - ID_restaurante
    - Total

- Detalle_pedido:
    - ID_detalle
    - ID_pedido
    - Producto
    - Cantidad
    - Precio
    - Subtotal