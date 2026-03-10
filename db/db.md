# Tablas:

- Usuarios (usuarios que trabajan, roles [superadmin, admin, recepcionista, repartidores, chef])
- Pedidos
- Detalle-pedido
- Restaurantes
- Clientes
- Direcciones

---

# Datos de tablas:

- Usuarios:
  - ID_usuario (autoincremental)
  - ID_restaurantes --> (tabla restaurantes)
  - Nombre
  - Apellido
  - Telefono
  - Rol
  - Username
  - Password (hash)
- Pedidos:
  - ID_pedido (autoincremental)
  - ID_cliente --> (clientes)
  - ID_restaurante --> (restaurantes)
  - ID_direccion --> (direcciones)
  - Total

- Detalle_pedido:
  - ID_detalle (autoincremental)
  - ID_pedido --> (pedidos)
  - Producto
  - Cantidad
  - Precio
  - Subtotal

- restaurantes:
  - ID_Restaurante (autoincremental)
  - Nombre_local
  - logo_url
  - ID_direccion --> (direcciones)
  - Nombre_dueño
  - Telefono

- Clientes:
  - ID_cliente (autoincremental)
  - Nombre
  - Apellido
  - Telefono

- Direcciones:
  - ID_direccion (autoincremental)
  - numero_calle
  - altura
  - Localidad

---

# Diccionario de datos

---

- Usuarios: |
  Campo | Tipo de dato | Propiedad |

---

    - ID_usuario            |      INT              |   autoincremental                 |
    - ID_restaurantes       |      INT              |   FOREIGN KEY (Restaurantes)      |
    - Nombre                |      STRING           |   ---------------                 |
    - Apellido              |      STRING           |   ---------------                 |
    - Telefono              |      STRING           |   Validar int                     |
    - Rol                   |      STRING           |   Menu                            |
    - Username              |      STRING           |   > 8 caracteres                  |
    - Password              |      STRING           |   > 8 caracteres                  |

---

- Pedidos: |
  Campo | Tipo de dato | Propiedad |

---

    - ID_pedido             |       INT             |   autoincremental                 |
    - ID_cliente            |       INT             |   FOREIGN KEY (clientes)          |
    - ID_restaurante        |       INT             |   FOREIGN KEY (restaurantes)      |
    - ID_direccion          |       INT             |   FOREIGN KEY (direcciones)       |
    - Total                 |       DECIMAL         |   ---------------                 |

---

- Detalle_pedido:
  Campo | Tipo de dato | Propiedad

---

    - ID_detalle            |       INT             |   autoincremental
    - ID_pedido             |       INT             |   FOREIGN KEY (pedidos)
    - Producto              |       STRING          |   -----------------
    - Cantidad              |       INT             |   > 0
    - Precio                |       DECIMAL         |   -----------------
    - Subtotal              |       DECIMAL         |   -----------------

---

- restaurantes:
  Campo | Tipo de dato | Propiedad

---

    - ID_Restaurante        |       INT             |   autoincremental
    - Nombre_local          |       STRING          |   ----------------
    - logo_url              |       STRING          |   IMG/LOGO/....
    - ID_direccion          |       INT             |   FOREIGN KEY (direcciones)
    - Nombre_dueño          |       STRING          |   ----------------
    - Telefono              |       STRING          |   VALIDAR INT

---

- Clientes:
  Campo | Tipo de dato | Propiedad

---

    - ID_cliente            |       INT             |   autoincremental
    - Nombre                |       STRING          |   ----------------
    - Apellido              |       STRING          |   ----------------
    - Telefono              |       STRING          |   validar int

---

- Direcciones:
  Campo | Tipo de dato | Propiedad

---

    - ID_direccion          |       INT             |   autoincremental
    - calle                 |       STRING          |   ----------------
    - altura                |       INT             |   ----------------
    - Localidad             |       STRING          |   ----------------
