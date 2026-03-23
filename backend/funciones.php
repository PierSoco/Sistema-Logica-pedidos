<?php
// backend/funciones.php
session_start();
require_once 'conexion.php';

// ==========================================
// ENRUTADOR PRINCIPAL
// ==========================================
if (isset($_GET['action'])) {
    $action = $_GET['action'];
    header('Content-Type: application/json');

    switch ($action) {
        case 'logout':
            procesarLogout();
            break;
        case 'getInitialDataRecepcionista':
            obtenerDatosInicialesRecepcionista($pdo);
            break;
        case 'getListos':
            obtenerPedidosListos($pdo);
            break;
        case 'actualizarEstado':
            actualizarEstadoPedido($pdo);
            break;
        case 'forgotPassword':
            procesarForgotPassword($pdo);
            break;
        case 'resetPassword':
            procesarResetPassword($pdo);
            break;
        // === CRUD DE USUARIOS (SUPERADMIN) ===
        case 'getUsuarios':
            obtenerUsuarios($pdo);
            break;
        case 'getUsuario':
            obtenerUsuarioPorId($pdo);
            break;
        case 'createUsuario':
            crearUsuario($pdo);
            break;
        case 'updateUsuario':
            actualizarUsuario($pdo);
            break;
        case 'deleteUsuario':
            eliminarUsuario($pdo);
            break;
        // === ADMIN ===
        case 'getEstadisticas':
            obtenerEstadisticas($pdo);
            break;
        case 'getPedidosTodos':
            obtenerTodosPedidos($pdo);
            break;
        // === RECEPCIONISTA ===
        case 'getPedidosActuales':
            obtenerPedidosActuales($pdo);
            break;
        case 'getHistorialPedidos':
            obtenerHistorialPedidos($pdo);
            break;
        case 'getResumenHoy':
            obtenerResumenHoy($pdo);
            break;
        case 'getPedidosRecepcionista':
            obtenerPedidosRecepcionista($pdo);
            break;
        case 'getPedido':
            obtenerPedidoPorId($pdo);
            break;
        case 'buscarProductosRecepcion':
            buscarProductosRecepcion($pdo);
            break;
        case 'crearPedidoRecepcion':
            crearPedidoRecepcion($pdo);
            break;
        case 'actualizarPedido':
            actualizarPedido($pdo);
            break;
        case 'cancelarPedido':
            cancelarPedido($pdo);
            break;
        case 'getLocalidadPorCP':
            obtenerLocalidadPorCP($pdo);
            break;
        // === CHEF ===
        case 'getPedidosPendientes':
            obtenerPedidosPendientes($pdo);
            break;
        case 'marcarListo':
            marcarPedidoListo($pdo);
            break;
        default:
            echo json_encode(['error' => 'Acción no válida']);
            break;
    }
    exit;
}

// ==========================================
// HELPERS DE SESIÓN Y VALIDACIÓN
// ==========================================

function validarSesion() {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        exit;
    }
}

function validarRol($rolesPermitidos) {
    validarSesion();
    $rolActual = strtolower(trim($_SESSION['user_rol'] ?? ''));
    if (!in_array($rolActual, $rolesPermitidos)) {
        echo json_encode(['status' => 'error', 'message' => 'Acceso denegado para este rol', 'data' => null]);
        exit;
    }
}

function validarSesionSuperadmin() {
    if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_rol'])) {
        return ['valid' => false, 'error' => 'No hay sesión activa'];
    }
    if (strtolower(trim($_SESSION['user_rol'])) !== 'superadmin') {
        return ['valid' => false, 'error' => 'Acceso denegado. Se requiere rol de SuperAdmin'];
    }
    return ['valid' => true];
}

function sanitizarInput($data) {
    return htmlspecialchars(strip_tags(trim($data)), ENT_QUOTES, 'UTF-8');
}

// ==========================================
// FUNCIÓN DE DATOS INICIALES RECEPCIONISTA
// ==========================================

function obtenerDatosInicialesRecepcionista($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    try {
        $data = [];
        $id_restaurante = $_SESSION['user_restaurante'] ?? null;

        // 1. PRODUCTOS: Con stock disponible, filtrados por restaurante si aplica
        if ($id_restaurante) {
            $stmtProd = $pdo->prepare("
                SELECT ID_producto, Nombre_producto as Nombre, Precio, 
                       COALESCE(Stock, 0) as Disponibilidad
                FROM productos 
                WHERE Activo = 1 AND ID_restaurante = :rest
                ORDER BY Nombre_producto ASC
            ");
            $stmtProd->execute([':rest' => $id_restaurante]);
        } else {
            $stmtProd = $pdo->query("
                SELECT ID_producto, Nombre_producto as Nombre, Precio,
                       COALESCE(Stock, 0) as Disponibilidad
                FROM productos 
                WHERE Activo = 1
                ORDER BY Nombre_producto ASC
            ");
        }
        $data['productos'] = $stmtProd->fetchAll(PDO::FETCH_ASSOC);

        // 2. PEDIDOS ACTUALES: Estados activos con datos de cliente y dirección
        $stmtPed = $pdo->query("
            SELECT 
                p.ID_pedido,
                p.Estado,
                p.Fecha_pedido,
                p.Total,
                p.fecha_creacion,
                c.Nombre    AS c_nombre,
                c.Apellido  AS c_apellido,
                c.Telefono  AS c_telefono,
                d.calle     AS Calle,
                d.altura    AS Numero,
                d.piso_depto,
                d.referencias,
                d.Localidad,
                r.Nombre_local AS restaurante_nombre,
                (
                    SELECT GROUP_CONCAT(
                        CONCAT(dp2.Cantidad, 'x ', pr2.Nombre_producto)
                        ORDER BY dp2.ID_detalle
                        SEPARATOR ', '
                    )
                    FROM detalle_pedido dp2
                    JOIN productos pr2 ON dp2.ID_producto = pr2.ID_producto
                    WHERE dp2.ID_pedido = p.ID_pedido
                ) AS detalles_resumen
            FROM pedidos p
            INNER JOIN clientes c  ON p.ID_cliente     = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion = d.ID_direccion
            INNER JOIN restaurantes r ON p.ID_restaurante = r.ID_Restaurante
            WHERE p.Estado IN ('Pendiente', 'Preparando', 'En camino')
            ORDER BY p.ID_pedido DESC
        ");
        $data['pedidos'] = $stmtPed->fetchAll(PDO::FETCH_ASSOC);

        // 3. DETALLES completos para los pedidos cargados
        $stmtDet = $pdo->query("
            SELECT 
                dp.ID_detalle,
                dp.ID_pedido,
                dp.ID_producto,
                dp.Cantidad,
                dp.Precio,
                dp.Subtotal,
                pr.Nombre_producto AS producto_nombre,
                pr.Precio AS precio_unitario
            FROM detalle_pedido dp
            INNER JOIN productos pr ON dp.ID_producto = pr.ID_producto
            WHERE dp.ID_pedido IN (
                SELECT ID_pedido FROM pedidos 
                WHERE Estado IN ('Pendiente', 'Preparando', 'En camino')
            )
            ORDER BY dp.ID_pedido DESC
        ");
        $data['detalles'] = $stmtDet->fetchAll(PDO::FETCH_ASSOC);

        // 4. DATOS DEL RESTAURANTE del usuario en sesión (para autocompletar localidad)
        $data['restaurante'] = null;
        if (!empty($_SESSION['user_restaurante'])) {
            $stmtR = $pdo->prepare("
                SELECT r.ID_Restaurante, r.Nombre_local, d.Localidad
                FROM restaurantes r
                LEFT JOIN direcciones d ON r.ID_direccion = d.ID_direccion
                WHERE r.ID_Restaurante = :id
                LIMIT 1
            ");
            $stmtR->execute([':id' => $_SESSION['user_restaurante']]);
            $data['restaurante'] = $stmtR->fetch(PDO::FETCH_ASSOC) ?: null;
        } elseif ($_SESSION['user_rol'] === 'superadmin') {
            // Para superadmin tomamos el primer restaurante activo
            $stmtR = $pdo->query("
                SELECT r.ID_Restaurante, r.Nombre_local, d.Localidad
                FROM restaurantes r
                LEFT JOIN direcciones d ON r.ID_direccion = d.ID_direccion
                LIMIT 1
            ");
            $data['restaurante'] = $stmtR->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        echo json_encode(['status' => 'success', 'data' => $data]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error SQL: ' . $e->getMessage()]);
    }
}

// ==========================================
// OBTENER PEDIDOS ACTUALES (GET)
// ==========================================

function obtenerPedidosActuales($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    try {
        $stmt = $pdo->query("
            SELECT 
                p.ID_pedido,
                p.Estado,
                p.Total,
                DATE_FORMAT(p.fecha_creacion, '%d/%m %H:%i') AS fecha_creacion,
                c.Nombre    AS c_nombre,
                c.Apellido  AS c_apellido,
                c.Telefono  AS c_telefono,
                d.calle     AS Calle,
                d.altura    AS Numero,
                d.piso_depto,
                d.referencias,
                d.Localidad,
                (
                    SELECT GROUP_CONCAT(
                        CONCAT(dp2.Cantidad, 'x ', pr2.Nombre_producto)
                        ORDER BY dp2.ID_detalle
                        SEPARATOR ', '
                    )
                    FROM detalle_pedido dp2
                    JOIN productos pr2 ON dp2.ID_producto = pr2.ID_producto
                    WHERE dp2.ID_pedido = p.ID_pedido
                ) AS detalles_resumen
            FROM pedidos p
            INNER JOIN clientes c    ON p.ID_cliente     = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion   = d.ID_direccion
            WHERE p.Estado IN ('Pendiente', 'Preparando', 'En camino')
            ORDER BY p.ID_pedido DESC
        ");
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'data' => $pedidos]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// OBTENER PEDIDOS RECEPCIONISTA (todos + detalles)
// ==========================================

function obtenerPedidosRecepcionista($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    try {
        $stmt = $pdo->query("
            SELECT 
                p.ID_pedido,
                p.Estado,
                p.Total,
                DATE_FORMAT(p.fecha_creacion, '%d/%m/%Y %H:%i') AS fecha_creacion,
                c.Nombre    AS c_nombre,
                c.Apellido  AS c_apellido,
                c.Telefono  AS c_telefono,
                d.calle     AS Calle,
                d.altura    AS Numero,
                d.piso_depto,
                d.referencias,
                d.Localidad,
                r.Nombre_local AS restaurante_nombre,
                (
                    SELECT GROUP_CONCAT(
                        CONCAT(dp2.Cantidad, 'x ', pr2.Nombre_producto)
                        ORDER BY dp2.ID_detalle
                        SEPARATOR ', '
                    )
                    FROM detalle_pedido dp2
                    JOIN productos pr2 ON dp2.ID_producto = pr2.ID_producto
                    WHERE dp2.ID_pedido = p.ID_pedido
                ) AS detalles_resumen
            FROM pedidos p
            INNER JOIN clientes c    ON p.ID_cliente     = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion   = d.ID_direccion
            INNER JOIN restaurantes r ON p.ID_restaurante = r.ID_Restaurante
            ORDER BY p.ID_pedido DESC
        ");
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'data' => $pedidos]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// OBTENER UN PEDIDO POR ID (para edición)
// ==========================================

function obtenerPedidoPorId($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    $id = filter_var($_GET['id'] ?? 0, FILTER_VALIDATE_INT);
    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido']);
        return;
    }

    try {
        // Datos del pedido
        $stmtP = $pdo->prepare("
            SELECT 
                p.ID_pedido, p.Estado, p.Total, p.fecha_creacion,
                p.ID_cliente, p.ID_direccion, p.ID_restaurante,
                c.Nombre    AS c_nombre,
                c.Apellido  AS c_apellido,
                c.Telefono  AS c_telefono,
                d.calle     AS Calle,
                d.altura    AS Numero,
                d.piso_depto,
                d.referencias,
                d.Localidad
            FROM pedidos p
            INNER JOIN clientes    c ON p.ID_cliente    = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion  = d.ID_direccion
            WHERE p.ID_pedido = :id
            LIMIT 1
        ");
        $stmtP->execute([':id' => $id]);
        $pedido = $stmtP->fetch(PDO::FETCH_ASSOC);

        if (!$pedido) {
            echo json_encode(['status' => 'error', 'message' => 'Pedido no encontrado']);
            return;
        }

        // Detalles/items del pedido
        $stmtD = $pdo->prepare("
            SELECT 
                dp.ID_detalle,
                dp.ID_producto,
                dp.Cantidad,
                dp.Precio,
                dp.Subtotal,
                pr.Nombre_producto AS nombre
            FROM detalle_pedido dp
            INNER JOIN productos pr ON dp.ID_producto = pr.ID_producto
            WHERE dp.ID_pedido = :id
        ");
        $stmtD->execute([':id' => $id]);
        $pedido['items'] = $stmtD->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['status' => 'success', 'data' => $pedido]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// BUSCAR PRODUCTOS (autocomplete)
// ==========================================

function buscarProductosRecepcion($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    $termino = sanitizarInput($_GET['q'] ?? '');

    try {
        // Filtramos activos con stock > 0 (si tiene columna Stock)
        $stmt = $pdo->prepare("
            SELECT 
                ID_producto, 
                Nombre_producto AS Nombre, 
                Precio,
                COALESCE(Stock, 999) AS Disponibilidad
            FROM productos 
            WHERE Nombre_producto LIKE :termino
              AND Activo = 1
              AND COALESCE(Stock, 999) > 0
            ORDER BY Nombre_producto ASC
            LIMIT 10
        ");
        $stmt->execute([':termino' => "%$termino%"]);
        $productos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['status' => 'success', 'data' => $productos]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// CREAR PEDIDO RECEPCIÓN (con transacción y stock)
// ==========================================

function crearPedidoRecepcion($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    $data = json_decode(file_get_contents("php://input"), true);

    // Validaciones básicas
    if (
        empty($data['cliente']['nombre'])   ||
        empty($data['cliente']['apellido']) ||
        empty($data['cliente']['telefono']) ||
        empty($data['direccion']['calle'])  ||
        empty($data['direccion']['numero']) ||
        empty($data['carrito'])             ||
        empty($data['total'])
    ) {
        echo json_encode(['status' => 'error', 'message' => 'Faltan campos obligatorios']);
        return;
    }

    // Sanitizar
    $cNombre   = sanitizarInput($data['cliente']['nombre']);
    $cApellido = sanitizarInput($data['cliente']['apellido']);
    $cTelefono = sanitizarInput($data['cliente']['telefono']);
    $dCalle    = sanitizarInput($data['direccion']['calle']);
    $dNumero   = sanitizarInput($data['direccion']['numero']);
    $dPiso     = sanitizarInput($data['direccion']['piso']   ?? '');
    $dRef      = sanitizarInput($data['direccion']['ref']    ?? '');
    $dLocalidad= sanitizarInput($data['direccion']['localidad'] ?? '');
    $total     = floatval($data['total']);
    $carrito   = $data['carrito'];

    // Obtener el ID de restaurante del usuario en sesión
    $id_restaurante = $_SESSION['user_restaurante'] ?? 1;

    try {
        $pdo->beginTransaction();

        // 1. Insertar o reutilizar cliente (por teléfono)
        $stmtBuscarC = $pdo->prepare("SELECT ID_cliente FROM clientes WHERE Telefono = :tel LIMIT 1");
        $stmtBuscarC->execute([':tel' => $cTelefono]);
        $clienteExistente = $stmtBuscarC->fetch(PDO::FETCH_ASSOC);

        if ($clienteExistente) {
            $id_cliente = $clienteExistente['ID_cliente'];
            // Actualizar nombre en caso de que haya cambiado
            $stmtUpdC = $pdo->prepare("UPDATE clientes SET Nombre = :n, Apellido = :a WHERE ID_cliente = :id");
            $stmtUpdC->execute([':n' => $cNombre, ':a' => $cApellido, ':id' => $id_cliente]);
        } else {
            $stmtC = $pdo->prepare("INSERT INTO clientes (Nombre, Apellido, Telefono) VALUES (:n, :a, :t)");
            $stmtC->execute([':n' => $cNombre, ':a' => $cApellido, ':t' => $cTelefono]);
            $id_cliente = $pdo->lastInsertId();
        }

        // 2. Insertar dirección
        $stmtD = $pdo->prepare("
            INSERT INTO direcciones (calle, altura, piso_depto, referencias, Localidad)
            VALUES (:calle, :altura, :piso, :ref, :loc)
        ");
        $stmtD->execute([
            ':calle'  => $dCalle,
            ':altura' => $dNumero,
            ':piso'   => $dPiso,
            ':ref'    => $dRef,
            ':loc'    => $dLocalidad
        ]);
        $id_direccion = $pdo->lastInsertId();

        // 3. Verificar stock antes de proceder
        foreach ($carrito as $item) {
            $id_prod = intval($item['id']);
            $cant    = intval($item['cantidad']);

            $stmtStock = $pdo->prepare("
                SELECT Nombre_producto, COALESCE(Stock, 999) AS stock_actual
                FROM productos WHERE ID_producto = :id AND Activo = 1
            ");
            $stmtStock->execute([':id' => $id_prod]);
            $prod = $stmtStock->fetch(PDO::FETCH_ASSOC);

            if (!$prod) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => "Producto ID $id_prod no encontrado o inactivo"]);
                return;
            }

            if ($prod['stock_actual'] < $cant && $prod['stock_actual'] != 999) {
                $pdo->rollBack();
                echo json_encode([
                    'status'  => 'error',
                    'message' => "Stock insuficiente para \"{$prod['Nombre_producto']}\". Disponible: {$prod['stock_actual']}, pedido: $cant"
                ]);
                return;
            }
        }

        // 4. Insertar pedido
        $stmtP = $pdo->prepare("
            INSERT INTO pedidos (ID_cliente, ID_direccion, ID_restaurante, Estado, Fecha_pedido, Total, fecha_creacion)
            VALUES (:cli, :dir, :rest, 'Pendiente', NOW(), :total, NOW())
        ");
        $stmtP->execute([
            ':cli'   => $id_cliente,
            ':dir'   => $id_direccion,
            ':rest'  => $id_restaurante,
            ':total' => $total
        ]);
        $id_pedido = $pdo->lastInsertId();

        // 5. Insertar detalles y descontar stock
        $stmtDP    = $pdo->prepare("
            INSERT INTO detalle_pedido (ID_pedido, ID_producto, Cantidad, Precio, Subtotal)
            VALUES (:ped, :prod, :cant, :precio, :subtotal)
        ");
        $stmtStockUpd = $pdo->prepare("
            UPDATE productos 
            SET Stock = GREATEST(COALESCE(Stock, 0) - :cant, 0)
            WHERE ID_producto = :id AND Stock IS NOT NULL
        ");

        foreach ($carrito as $item) {
            $id_prod  = intval($item['id']);
            $cant     = intval($item['cantidad']);
            $precio   = floatval($item['precio']);
            $subtotal = floatval($item['subtotal']);

            $stmtDP->execute([
                ':ped'      => $id_pedido,
                ':prod'     => $id_prod,
                ':cant'     => $cant,
                ':precio'   => $precio,
                ':subtotal' => $subtotal
            ]);

            // Solo descuenta stock si la columna existe y tiene valor
            $stmtStockUpd->execute([':cant' => $cant, ':id' => $id_prod]);
        }

        $pdo->commit();

        echo json_encode([
            'status'  => 'success',
            'message' => "Pedido #{$id_pedido} creado con éxito",
            'data'    => ['id_pedido' => $id_pedido]
        ]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => 'Error al crear pedido: ' . $e->getMessage()]);
    }
}

// ==========================================
// ACTUALIZAR PEDIDO (estado o datos)
// ==========================================

function actualizarPedido($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    $data = json_decode(file_get_contents("php://input"), true);
    $id   = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido']);
        return;
    }

    $estadosValidos = ['Pendiente', 'Preparando', 'En camino', 'Entregado', 'Cancelado'];

    try {
        // Si solo se actualiza el estado
        if (isset($data['estado'])) {
            $nuevoEstado = $data['estado'];
            if (!in_array($nuevoEstado, $estadosValidos)) {
                echo json_encode(['status' => 'error', 'message' => 'Estado inválido']);
                return;
            }

            // Si se cancela → devolver stock
            if ($nuevoEstado === 'Cancelado') {
                $stmtItems = $pdo->prepare("SELECT ID_producto, Cantidad FROM detalle_pedido WHERE ID_pedido = :id");
                $stmtItems->execute([':id' => $id]);
                $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

                $stmtDevStock = $pdo->prepare("
                    UPDATE productos 
                    SET Stock = COALESCE(Stock, 0) + :cant 
                    WHERE ID_producto = :prod AND Stock IS NOT NULL
                ");
                foreach ($items as $item) {
                    $stmtDevStock->execute([':cant' => $item['Cantidad'], ':prod' => $item['ID_producto']]);
                }
            }

            $stmt = $pdo->prepare("UPDATE pedidos SET Estado = :estado WHERE ID_pedido = :id");
            $stmt->execute([':estado' => $nuevoEstado, ':id' => $id]);

            echo json_encode(['status' => 'success', 'message' => "Estado actualizado a $nuevoEstado"]);
            return;
        }

        echo json_encode(['status' => 'error', 'message' => 'Nada que actualizar']);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// CANCELAR PEDIDO (shortcut)
// ==========================================

function cancelarPedido($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    $data = json_decode(file_get_contents("php://input"), true);
    $id   = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido']);
        return;
    }

    try {
        $pdo->beginTransaction();

        // Devolver stock
        $stmtItems = $pdo->prepare("SELECT ID_producto, Cantidad FROM detalle_pedido WHERE ID_pedido = :id");
        $stmtItems->execute([':id' => $id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        $stmtDevStock = $pdo->prepare("
            UPDATE productos 
            SET Stock = COALESCE(Stock, 0) + :cant 
            WHERE ID_producto = :prod AND Stock IS NOT NULL
        ");
        foreach ($items as $item) {
            $stmtDevStock->execute([':cant' => $item['Cantidad'], ':prod' => $item['ID_producto']]);
        }

        // Cambiar estado
        $stmt = $pdo->prepare("UPDATE pedidos SET Estado = 'Cancelado' WHERE ID_pedido = :id");
        $stmt->execute([':id' => $id]);

        $pdo->commit();
        echo json_encode(['status' => 'success', 'message' => "Pedido #{$id} cancelado y stock restaurado"]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// CALCULAR LOCALIDAD POR CÓDIGO POSTAL
// ==========================================

function obtenerLocalidadPorCP($pdo) {
    $cp = sanitizarInput($_GET['cp'] ?? '');

    // Diccionario estático (Argentina - expandible)
    $codigosPostales = [
        // Buenos Aires provincia
        '1000' => 'Ciudad Autónoma de Buenos Aires',
        '1001' => 'Ciudad Autónoma de Buenos Aires',
        '1900' => 'La Plata',
        '7000' => 'Tandil',
        '7600' => 'Mar del Plata',
        '7602' => 'Mar del Plata',
        '7604' => 'Mar del Plata',
        '7606' => 'Mar del Plata',
        '7608' => 'Mar del Plata',
        '7100' => 'Dolores',
        '7102' => 'Dolores',
        '7118' => 'Pila',
        '7200' => 'Las Flores',
        '7203' => 'Coronel Brandsen',
        '7300' => 'Azul',
        '7400' => 'Olavarría',
        '7500' => 'Tres Arroyos',
        '7700' => 'Necochea',
        '7740' => 'San Cayetano',
        '7800' => 'Bahía Blanca',
        '8000' => 'Bahía Blanca',
        '8103' => 'Punta Alta',
        '6000' => 'Mercedes',
        '6400' => 'Trenque Lauquen',
        '6700' => 'Luján',
        '6740' => 'San Andrés de Giles',
        '3000' => 'Santa Fe',
        '2000' => 'Rosario',
        '5000' => 'Córdoba',
        '4000' => 'San Miguel de Tucumán',
        '8300' => 'Neuquén',
        '8400' => 'Bariloche',
        '9000' => 'Comodoro Rivadavia',
        '9400' => 'Río Gallegos',
        '9410' => 'Río Gallegos',
    ];

    $localidad = $codigosPostales[$cp] ?? null;

    if ($localidad) {
        echo json_encode(['status' => 'success', 'localidad' => $localidad]);
    } else {
        echo json_encode(['status' => 'not_found', 'localidad' => null]);
    }
}

// ==========================================
// AUTENTICACIÓN
// ==========================================

function procesarLogout() {
    $_SESSION = array();
    if (ini_get("session_use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]);
    }
    session_destroy();
    header("Location: ../login.html");
    exit;
}

// ==========================================
// LOGÍSTICA
// ==========================================

function obtenerPedidosListos($pdo) {
    try {
        $stmt = $pdo->prepare("
            SELECT p.ID_pedido, p.Total, p.Estado,
                   c.Nombre AS c_nombre, c.Apellido AS c_apellido,
                   d.calle AS Calle, d.altura AS Numero, d.Localidad
            FROM pedidos p
            INNER JOIN clientes    c ON p.ID_cliente   = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion = d.ID_direccion
            WHERE p.Estado = 'En camino'
            ORDER BY p.ID_pedido DESC
        ");
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function actualizarEstadoPedido($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        $stmt = $pdo->prepare("UPDATE pedidos SET Estado = :estado WHERE ID_pedido = :id");
        $stmt->execute([':estado' => $data['estado'], ':id' => $data['id']]);
        echo json_encode(['success' => true, 'mensaje' => 'Estado actualizado']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// ==========================================
// RECUPERACIÓN DE CONTRASEÑA
// ==========================================

function checkRateLimit($pdo, $ip, $action) {
    $pdo->query("DELETE FROM rate_limits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM rate_limits WHERE ip_address = ? AND action_type = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $stmt->execute([$ip, $action]);
    if ($stmt->fetchColumn() >= 3) return false;

    $stmt = $pdo->prepare("INSERT INTO rate_limits (ip_address, action_type) VALUES (?, ?)");
    $stmt->execute([$ip, $action]);
    return true;
}

function sendPasswordResetEmail($email, $token) {
    $resetLink = "https://zatmeni.ar/zple/restablecer.html?token=" . urlencode($token);
    $to = $email;
    $subject = "Recuperacion de Contrasena";
    $message = "Haz clic aqui para restablecer tu clave (expira en 30 min):\n" . $resetLink;
    $headers = "From: noreply@zatmeni.ar";
    @mail($to, $subject, $message, $headers);
}

function procesarForgotPassword($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = filter_var($data['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $ip = $_SERVER['REMOTE_ADDR'];

    try {
        if (!checkRateLimit($pdo, $ip, 'password_reset')) {
            echo json_encode(['success' => true, 'mensaje' => 'Espere una hora para reintentar.']);
            return;
        }

        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE Email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            $token = bin2hex(random_bytes(32));
            $token_hash = hash('sha256', $token);
            $expires_at = date('Y-m-d H:i:s', strtotime('+30 minutes'));

            $stmt = $pdo->prepare("INSERT INTO password_resets (user_id, token_hash, expires_at, ip_request) VALUES (?, ?, ?, ?)");
            $stmt->execute([$user['ID_usuario'], $token_hash, $expires_at, $ip]);

            sendPasswordResetEmail($email, $token);
        }
        echo json_encode(['success' => true, 'mensaje' => 'Si el correo existe, recibiras un enlace.']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function procesarResetPassword($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    $token_hash = hash('sha256', $data['token'] ?? '');

    try {
        $stmt = $pdo->prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > NOW() LIMIT 1");
        $stmt->execute([$token_hash]);
        $resetReq = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$resetReq) {
            echo json_encode(['success' => false, 'error' => 'Token invalido o expirado.']);
            return;
        }

        $pdo->beginTransaction();
        $stmt = $pdo->prepare("UPDATE usuarios SET Password = ? WHERE ID_usuario = ?");
        $stmt->execute([password_hash($data['password'], PASSWORD_DEFAULT), $resetReq['user_id']]);

        $stmt = $pdo->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
        $stmt->execute([$resetReq['id']]);
        $pdo->commit();

        echo json_encode(['success' => true, 'mensaje' => 'Contrasena actualizada.']);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// ==========================================
// CRUD DE USUARIOS (SUPERADMIN)
// ==========================================

function obtenerUsuarios($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode(['status' => 'error', 'message' => $validacion['error'], 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT ID_usuario, Nombre, Email, Rol,
                   DATE_FORMAT(fecha_creacion, '%Y-%m-%d %H:%i') as fecha_creacion,
                   activo
            FROM usuarios
            WHERE activo = 1
            ORDER BY fecha_creacion DESC
        ");
        $stmt->execute();
        echo json_encode(['status' => 'success', 'message' => 'Usuarios obtenidos', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al obtener usuarios', 'data' => ['error' => $e->getMessage()]]);
    }
}

function obtenerUsuarioPorId($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode(['status' => 'error', 'message' => $validacion['error'], 'data' => null]);
        return;
    }

    $id = filter_var($_GET['id'] ?? 0, FILTER_VALIDATE_INT);
    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT ID_usuario, Nombre, Email, Rol,
                   DATE_FORMAT(fecha_creacion, '%Y-%m-%d %H:%i') as fecha_creacion,
                   activo
            FROM usuarios
            WHERE ID_usuario = :id AND activo = 1
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($usuario) {
            echo json_encode(['status' => 'success', 'message' => 'Usuario encontrado', 'data' => $usuario]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Usuario no encontrado', 'data' => null]);
        }
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error', 'data' => ['error' => $e->getMessage()]]);
    }
}

function crearUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode(['status' => 'error', 'message' => $validacion['error'], 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);

    if (empty($data['nombre']) || empty($data['email']) || empty($data['password']) || empty($data['rol'])) {
        echo json_encode(['status' => 'error', 'message' => 'Todos los campos son requeridos', 'data' => null]);
        return;
    }

    $nombre = sanitizarInput($data['nombre']);
    $email  = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
    $rol    = sanitizarInput($data['rol']);

    if (!$email) {
        echo json_encode(['status' => 'error', 'message' => 'Email inválido', 'data' => null]);
        return;
    }

    $roles_validos = ['superadmin', 'admin', 'recepcionista', 'chef', 'repartidor'];
    if (!in_array(strtolower($rol), $roles_validos)) {
        echo json_encode(['status' => 'error', 'message' => 'Rol inválido', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE Email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            echo json_encode(['status' => 'error', 'message' => 'El email ya está registrado', 'data' => null]);
            return;
        }

        $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("
            INSERT INTO usuarios (Nombre, Apellido, Email, Password, Rol, activo, fecha_creacion)
            VALUES (:nombre, '', :email, :password, :rol, 1, NOW())
        ");
        $stmt->execute([':nombre' => $nombre, ':email' => $email, ':password' => $passwordHash, ':rol' => $rol]);
        $nuevoId = $pdo->lastInsertId();

        echo json_encode(['status' => 'success', 'message' => 'Usuario creado', 'data' => ['id' => $nuevoId]]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al crear usuario', 'data' => ['error' => $e->getMessage()]]);
    }
}

function actualizarUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode(['status' => 'error', 'message' => $validacion['error'], 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id   = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido', 'data' => null]);
        return;
    }

    if (empty($data['nombre']) || empty($data['email']) || empty($data['rol'])) {
        echo json_encode(['status' => 'error', 'message' => 'Faltan campos', 'data' => null]);
        return;
    }

    $nombre = sanitizarInput($data['nombre']);
    $email  = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
    $rol    = sanitizarInput($data['rol']);

    if (!$email) {
        echo json_encode(['status' => 'error', 'message' => 'Email inválido', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE Email = :email AND ID_usuario != :id LIMIT 1");
        $stmt->execute([':email' => $email, ':id' => $id]);
        if ($stmt->fetch()) {
            echo json_encode(['status' => 'error', 'message' => 'Email ya registrado para otro usuario', 'data' => null]);
            return;
        }

        $pdo->beginTransaction();

        if (!empty($data['password'])) {
            $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE usuarios SET Nombre=:n, Email=:e, Rol=:r, Password=:p WHERE ID_usuario=:id");
            $stmt->execute([':n' => $nombre, ':e' => $email, ':r' => $rol, ':p' => $passwordHash, ':id' => $id]);
        } else {
            $stmt = $pdo->prepare("UPDATE usuarios SET Nombre=:n, Email=:e, Rol=:r WHERE ID_usuario=:id");
            $stmt->execute([':n' => $nombre, ':e' => $email, ':r' => $rol, ':id' => $id]);
        }

        $pdo->commit();
        echo json_encode(['status' => 'success', 'message' => 'Usuario actualizado', 'data' => ['id' => $id]]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => 'Error al actualizar', 'data' => ['error' => $e->getMessage()]]);
    }
}

function eliminarUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode(['status' => 'error', 'message' => $validacion['error'], 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id   = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido', 'data' => null]);
        return;
    }

    if ($id == $_SESSION['user_id']) {
        echo json_encode(['status' => 'error', 'message' => 'No puedes eliminar tu propia cuenta', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE ID_usuario = :id AND activo = 1 LIMIT 1");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            echo json_encode(['status' => 'error', 'message' => 'Usuario no encontrado', 'data' => null]);
            return;
        }

        $stmt = $pdo->prepare("UPDATE usuarios SET activo = 0 WHERE ID_usuario = :id");
        $stmt->execute([':id' => $id]);

        echo json_encode(['status' => 'success', 'message' => 'Usuario eliminado', 'data' => ['id' => $id]]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al eliminar', 'data' => ['error' => $e->getMessage()]]);
    }
}


// ==========================================
// HISTORIAL COMPLETO DE PEDIDOS
// ==========================================
function obtenerHistorialPedidos($pdo) {
    validarRol(['recepcionista', 'admin', 'superadmin']);

    try {
        // Todos los pedidos, todos los estados
        $stmt = $pdo->query("
            SELECT
                p.ID_pedido,
                p.Estado,
                p.Total,
                DATE_FORMAT(p.fecha_creacion, '%d/%m/%Y %H:%i') AS fecha_creacion,
                p.fecha_creacion AS fecha_raw,
                c.Nombre    AS c_nombre,
                c.Apellido  AS c_apellido,
                c.Telefono  AS c_telefono,
                d.calle     AS Calle,
                d.altura    AS Numero,
                d.piso_depto,
                d.referencias,
                d.Localidad,
                (
                    SELECT GROUP_CONCAT(
                        CONCAT(dp2.Cantidad, 'x ', pr2.Nombre_producto)
                        ORDER BY dp2.ID_detalle
                        SEPARATOR ', '
                    )
                    FROM detalle_pedido dp2
                    JOIN productos pr2 ON dp2.ID_producto = pr2.ID_producto
                    WHERE dp2.ID_pedido = p.ID_pedido
                ) AS detalles_resumen
            FROM pedidos p
            INNER JOIN clientes    c ON p.ID_cliente   = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion = d.ID_direccion
            ORDER BY p.ID_pedido DESC
        ");
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Stats para el historial
        $stats = [
            'total'     => count($pedidos),
            'pendiente' => 0,
            'preparando'=> 0,
            'en_camino' => 0,
            'entregado' => 0,
            'cancelado' => 0,
        ];
        foreach ($pedidos as $p) {
            $e = strtolower(str_replace(' ', '_', $p['Estado']));
            if (isset($stats[$e])) $stats[$e]++;
        }
        // Alias en camino
        foreach ($pedidos as $p) {
            if ($p['Estado'] === 'En camino') $stats['en_camino']++;
        }
        // Recalcular sin doble conteo
        $stats = ['total'=>0,'pendiente'=>0,'preparando'=>0,'en_camino'=>0,'entregado'=>0,'cancelado'=>0];
        foreach ($pedidos as $p) {
            $stats['total']++;
            switch($p['Estado']) {
                case 'Pendiente':  $stats['pendiente']++; break;
                case 'Preparando': $stats['preparando']++; break;
                case 'En camino':  $stats['en_camino']++; break;
                case 'Entregado':  $stats['entregado']++; break;
                case 'Cancelado':  $stats['cancelado']++; break;
            }
        }

        echo json_encode(['status' => 'success', 'data' => ['pedidos' => $pedidos, 'stats' => $stats]]);

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// RESUMEN DEL DÍA (para sidebar)
// ==========================================
function obtenerResumenHoy($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        return;
    }
    try {
        // Entregados HOY
        $entregados_hoy = $pdo->query("
            SELECT COUNT(*) FROM pedidos 
            WHERE Estado = 'Entregado' AND DATE(fecha_creacion) = CURDATE()
        ")->fetchColumn();

        // Facturado HOY
        $facturado_hoy = $pdo->query("
            SELECT COALESCE(SUM(Total), 0) FROM pedidos 
            WHERE Estado = 'Entregado' AND DATE(fecha_creacion) = CURDATE()
        ")->fetchColumn();

        // Entregados TOTAL (histórico)
        $entregados_total = $pdo->query("
            SELECT COUNT(*) FROM pedidos WHERE Estado = 'Entregado'
        ")->fetchColumn();

        // Facturado TOTAL (histórico)
        $facturado_total = $pdo->query("
            SELECT COALESCE(SUM(Total), 0) FROM pedidos WHERE Estado = 'Entregado'
        ")->fetchColumn();

        // Activos ahora (pendiente + preparando + en camino)
        $activos = $pdo->query("
            SELECT COUNT(*) FROM pedidos 
            WHERE Estado IN ('Pendiente', 'Preparando', 'En camino')
        ")->fetchColumn();

        echo json_encode(['status' => 'success', 'data' => [
            'entregados_hoy'   => (int)$entregados_hoy,
            'facturado_hoy'    => number_format((float)$facturado_hoy, 2, '.', ''),
            'entregados_total' => (int)$entregados_total,
            'facturado_total'  => number_format((float)$facturado_total, 2, '.', ''),
            'activos'          => (int)$activos,
        ]]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// ==========================================
// FUNCIONES PARA ADMIN
// ==========================================

function obtenerEstadisticas($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $totalPedidos = $pdo->query("SELECT COUNT(*) FROM pedidos")->fetchColumn();
        $pendientes   = $pdo->query("SELECT COUNT(*) FROM pedidos WHERE Estado = 'Pendiente'")->fetchColumn();
        $enCamino     = $pdo->query("SELECT COUNT(*) FROM pedidos WHERE Estado = 'En camino'")->fetchColumn();
        $facturado    = $pdo->query("SELECT COALESCE(SUM(Total), 0) FROM pedidos WHERE Estado = 'Entregado'")->fetchColumn();

        echo json_encode([
            'status'  => 'success',
            'message' => 'Estadísticas obtenidas',
            'data'    => [
                'total_pedidos'   => $totalPedidos,
                'pendientes'      => $pendientes,
                'en_camino'       => $enCamino,
                'total_facturado' => number_format($facturado, 2, '.', '')
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error', 'data' => ['error' => $e->getMessage()]]);
    }
}

function obtenerTodosPedidos($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT 
                p.ID_pedido, p.Total, p.Estado,
                DATE_FORMAT(p.fecha_creacion, '%Y-%m-%d %H:%i') AS fecha_creacion,
                c.Nombre AS c_nombre, c.Apellido AS c_apellido,
                d.calle AS Calle, d.altura AS Numero, d.Localidad
            FROM pedidos p
            INNER JOIN clientes    c ON p.ID_cliente   = c.ID_cliente
            INNER JOIN direcciones d ON p.ID_direccion = d.ID_direccion
            ORDER BY p.ID_pedido DESC
            LIMIT 100
        ");
        $stmt->execute();
        echo json_encode(['status' => 'success', 'message' => 'Pedidos obtenidos', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error', 'data' => ['error' => $e->getMessage()]]);
    }
}

// ==========================================
// FUNCIONES PARA CHEF
// ==========================================

function obtenerPedidosPendientes($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT 
                p.ID_pedido, p.Total,
                DATE_FORMAT(p.fecha_creacion, '%H:%i') AS fecha_creacion,
                c.Nombre AS c_nombre, c.Apellido AS c_apellido,
                (
                    SELECT GROUP_CONCAT(CONCAT(dp2.Cantidad, 'x ', pr2.Nombre_producto) SEPARATOR ', ')
                    FROM detalle_pedido dp2
                    JOIN productos pr2 ON dp2.ID_producto = pr2.ID_producto
                    WHERE dp2.ID_pedido = p.ID_pedido
                ) AS detalle
            FROM pedidos p
            INNER JOIN clientes c ON p.ID_cliente = c.ID_cliente
            WHERE p.Estado = 'Pendiente'
            ORDER BY p.ID_pedido ASC
        ");
        $stmt->execute();
        echo json_encode(['status' => 'success', 'message' => 'Pedidos obtenidos', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error', 'data' => ['error' => $e->getMessage()]]);
    }
}

function marcarPedidoListo($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id   = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode(['status' => 'error', 'message' => 'ID inválido', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("UPDATE pedidos SET Estado = 'En camino' WHERE ID_pedido = :id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['status' => 'success', 'message' => "Pedido #{$id} marcado como En camino", 'data' => ['id' => $id]]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error', 'data' => ['error' => $e->getMessage()]]);
    }
}