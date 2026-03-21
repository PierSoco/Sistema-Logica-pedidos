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
        case 'crearPedido':
            crearPedido($pdo);
            break;
        case 'getPedidosRecientes':
            obtenerPedidosRecientes($pdo);
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
// FUNCIONES DE AUTENTICACIÓN
// ==========================================

function procesarLogout() {
    $_SESSION = array();
    if (ini_get("session_use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
    }
    session_destroy();
    header("Location: ../login.html");
    exit;
}

// ==========================================
// FUNCIONES DE LOGÍSTICA (PEDIDOS)
// ==========================================

function obtenerPedidosListos($pdo) {
    try {
        $stmt = $pdo->prepare("SELECT ID_pedido, Total, cliente, calle, altura, Localidad FROM pedidos WHERE estado = 'LISTO' ORDER BY ID_pedido DESC");
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function actualizarEstadoPedido($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        $stmt = $pdo->prepare("UPDATE pedidos SET estado = :estado WHERE ID_pedido = :id");
        $stmt->execute([
            ':estado' => $data['estado'],
            ':id' => $data['id']
        ]);
        echo json_encode(['success' => true, 'mensaje' => 'Estado actualizado']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// ==========================================
// FUNCIONES DE RECUPERACIÓN (OLVIDÉ MI CLAVE)
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
// FUNCIONES DE VALIDACIÓN
// ==========================================

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
// CRUD DE USUARIOS (SUPERADMIN)
// ==========================================

/**
 * Obtener todos los usuarios
 * GET: ?action=getUsuarios
 */
function obtenerUsuarios($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode([
            'status' => 'error',
            'message' => $validacion['error'],
            'data' => null
        ]);
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
        $usuarios = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Usuarios obtenidos correctamente',
            'data' => $usuarios
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener usuarios',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Obtener un usuario por ID
 * GET: ?action=getUsuario&id=123
 */
function obtenerUsuarioPorId($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode([
            'status' => 'error',
            'message' => $validacion['error'],
            'data' => null
        ]);
        return;
    }

    $id = filter_var($_GET['id'] ?? 0, FILTER_VALIDATE_INT);
    
    if (!$id) {
        echo json_encode([
            'status' => 'error',
            'message' => 'ID de usuario inválido',
            'data' => null
        ]);
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
            echo json_encode([
                'status' => 'success',
                'message' => 'Usuario encontrado',
                'data' => $usuario
            ]);
        } else {
            echo json_encode([
                'status' => 'error',
                'message' => 'Usuario no encontrado',
                'data' => null
            ]);
        }
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener usuario',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Crear un nuevo usuario
 * POST: ?action=createUsuario
 * Body: { nombre, email, password, rol }
 */
function crearUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode([
            'status' => 'error',
            'message' => $validacion['error'],
            'data' => null
        ]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    
    // Validar campos requeridos
    if (empty($data['nombre']) || empty($data['email']) || empty($data['password']) || empty($data['rol'])) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Todos los campos son requeridos (nombre, email, password, rol)',
            'data' => null
        ]);
        return;
    }

    // Sanitizar inputs
    $nombre = sanitizarInput($data['nombre']);
    $email = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
    $rol = sanitizarInput($data['rol']);
    $password = $data['password'];

    if (!$email) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Email inválido',
            'data' => null
        ]);
        return;
    }

    // Validar roles permitidos
    $roles_validos = ['superadmin', 'admin', 'recepcionista', 'chef', 'repartidor'];
    if (!in_array(strtolower($rol), $roles_validos)) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Rol inválido. Roles permitidos: ' . implode(', ', $roles_validos),
            'data' => null
        ]);
        return;
    }

    try {
        // Verificar si el email ya existe
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE Email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            echo json_encode([
                'status' => 'error',
                'message' => 'El email ya está registrado',
                'data' => null
            ]);
            return;
        }

        // Crear usuario
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("
            INSERT INTO usuarios (Nombre, Email, Password, Rol, activo, fecha_creacion) 
            VALUES (:nombre, :email, :password, :rol, 1, NOW())
        ");
        
        $stmt->execute([
            ':nombre' => $nombre,
            ':email' => $email,
            ':password' => $passwordHash,
            ':rol' => $rol
        ]);

        $nuevoId = $pdo->lastInsertId();

        echo json_encode([
            'status' => 'success',
            'message' => 'Usuario creado exitosamente',
            'data' => ['id' => $nuevoId, 'nombre' => $nombre, 'email' => $email, 'rol' => $rol]
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al crear usuario',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Actualizar un usuario existente
 * POST: ?action=updateUsuario
 * Body: { id, nombre, email, rol, password (opcional) }
 */
function actualizarUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode([
            'status' => 'error',
            'message' => $validacion['error'],
            'data' => null
        ]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    
    $id = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);
    
    if (!$id) {
        echo json_encode([
            'status' => 'error',
            'message' => 'ID de usuario inválido',
            'data' => null
        ]);
        return;
    }

    // Validar campos requeridos
    if (empty($data['nombre']) || empty($data['email']) || empty($data['rol'])) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Nombre, email y rol son requeridos',
            'data' => null
        ]);
        return;
    }

    // Sanitizar inputs
    $nombre = sanitizarInput($data['nombre']);
    $email = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
    $rol = sanitizarInput($data['rol']);

    if (!$email) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Email inválido',
            'data' => null
        ]);
        return;
    }

    // Validar roles permitidos
    $roles_validos = ['superadmin', 'admin', 'recepcionista', 'chef', 'repartidor'];
    if (!in_array(strtolower($rol), $roles_validos)) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Rol inválido',
            'data' => null
        ]);
        return;
    }

    try {
        // Verificar si el usuario existe
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE ID_usuario = :id AND activo = 1 LIMIT 1");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Usuario no encontrado',
                'data' => null
            ]);
            return;
        }

        // Verificar si el email ya existe en otro usuario
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE Email = :email AND ID_usuario != :id LIMIT 1");
        $stmt->execute([':email' => $email, ':id' => $id]);
        if ($stmt->fetch()) {
            echo json_encode([
                'status' => 'error',
                'message' => 'El email ya está registrado para otro usuario',
                'data' => null
            ]);
            return;
        }

        // Actualizar usuario
        $pdo->beginTransaction();

        if (!empty($data['password'])) {
            // Si se proporciona nueva contraseña
            $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("
                UPDATE usuarios 
                SET Nombre = :nombre, Email = :email, Rol = :rol, Password = :password
                WHERE ID_usuario = :id
            ");
            $stmt->execute([
                ':nombre' => $nombre,
                ':email' => $email,
                ':rol' => $rol,
                ':password' => $passwordHash,
                ':id' => $id
            ]);
        } else {
            // Sin cambiar contraseña
            $stmt = $pdo->prepare("
                UPDATE usuarios 
                SET Nombre = :nombre, Email = :email, Rol = :rol
                WHERE ID_usuario = :id
            ");
            $stmt->execute([
                ':nombre' => $nombre,
                ':email' => $email,
                ':rol' => $rol,
                ':id' => $id
            ]);
        }

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => 'Usuario actualizado exitosamente',
            'data' => ['id' => $id, 'nombre' => $nombre, 'email' => $email, 'rol' => $rol]
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al actualizar usuario',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Eliminar un usuario (soft delete)
 * POST: ?action=deleteUsuario
 * Body: { id }
 */
function eliminarUsuario($pdo) {
    $validacion = validarSesionSuperadmin();
    if (!$validacion['valid']) {
        echo json_encode([
            'status' => 'error',
            'message' => $validacion['error'],
            'data' => null
        ]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);
    
    if (!$id) {
        echo json_encode([
            'status' => 'error',
            'message' => 'ID de usuario inválido',
            'data' => null
        ]);
        return;
    }

    // Evitar que el superadmin se elimine a sí mismo
    if ($id == $_SESSION['user_id']) {
        echo json_encode([
            'status' => 'error',
            'message' => 'No puedes eliminar tu propia cuenta',
            'data' => null
        ]);
        return;
    }

    try {
        // Verificar si el usuario existe
        $stmt = $pdo->prepare("SELECT ID_usuario FROM usuarios WHERE ID_usuario = :id AND activo = 1 LIMIT 1");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Usuario no encontrado',
                'data' => null
            ]);
            return;
        }

        // Soft delete (marcar como inactivo)
        $stmt = $pdo->prepare("UPDATE usuarios SET activo = 0 WHERE ID_usuario = :id");
        $stmt->execute([':id' => $id]);

        echo json_encode([
            'status' => 'success',
            'message' => 'Usuario eliminado exitosamente',
            'data' => ['id' => $id]
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al eliminar usuario',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

// ==========================================
// FUNCIONES PARA ADMIN
// ==========================================

/**
 * Obtener estadísticas generales
 * GET: ?action=getEstadisticas
 */
function obtenerEstadisticas($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        // Total de pedidos
        $stmt = $pdo->query("SELECT COUNT(*) as total FROM pedidos");
        $total_pedidos = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

        // Pendientes
        $stmt = $pdo->query("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'PENDIENTE'");
        $pendientes = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

        // En camino
        $stmt = $pdo->query("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'EN_CAMINO'");
        $en_camino = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

        // Total facturado
        $stmt = $pdo->query("SELECT COALESCE(SUM(Total), 0) as total FROM pedidos WHERE estado = 'ENTREGADO'");
        $facturado = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

        echo json_encode([
            'status' => 'success',
            'message' => 'Estadísticas obtenidas',
            'data' => [
                'total_pedidos' => $total_pedidos,
                'pendientes' => $pendientes,
                'en_camino' => $en_camino,
                'total_facturado' => number_format($facturado, 2, '.', '')
            ]
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener estadísticas',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Obtener todos los pedidos
 * GET: ?action=getPedidosTodos
 */
function obtenerTodosPedidos($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT ID_pedido, cliente, calle, altura, Total, estado,
                   DATE_FORMAT(fecha_creacion, '%Y-%m-%d %H:%i') as fecha_creacion
            FROM pedidos 
            ORDER BY ID_pedido DESC 
            LIMIT 100
        ");
        $stmt->execute();
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Pedidos obtenidos',
            'data' => $pedidos
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener pedidos',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

// ==========================================
// FUNCIONES PARA RECEPCIONISTA
// ==========================================

/**
 * Crear nuevo pedido
 * POST: ?action=crearPedido
 */
function crearPedido($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);

    // Validar campos
    if (empty($data['cliente']) || empty($data['calle']) || empty($data['altura']) || empty($data['total'])) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Faltan campos requeridos',
            'data' => null
        ]);
        return;
    }

    // Sanitizar
    $cliente = sanitizarInput($data['cliente']);
    $calle = sanitizarInput($data['calle']);
    $altura = sanitizarInput($data['altura']);
    $localidad = sanitizarInput($data['localidad'] ?? '');
    $total = floatval($data['total']);
    $detalle = sanitizarInput($data['detalle'] ?? '');

    try {
        $stmt = $pdo->prepare("
            INSERT INTO pedidos (cliente, calle, altura, Localidad, Total, detalle, estado, fecha_creacion)
            VALUES (:cliente, :calle, :altura, :localidad, :total, :detalle, 'PENDIENTE', NOW())
        ");
        
        $stmt->execute([
            ':cliente' => $cliente,
            ':calle' => $calle,
            ':altura' => $altura,
            ':localidad' => $localidad,
            ':total' => $total,
            ':detalle' => $detalle
        ]);

        $nuevoId = $pdo->lastInsertId();

        echo json_encode([
            'status' => 'success',
            'message' => 'Pedido creado exitosamente',
            'data' => ['id' => $nuevoId]
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al crear pedido',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Obtener pedidos recientes
 * GET: ?action=getPedidosRecientes
 */
function obtenerPedidosRecientes($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT ID_pedido, cliente, calle, altura, Total, estado,
                   DATE_FORMAT(fecha_creacion, '%H:%i') as fecha_creacion
            FROM pedidos 
            ORDER BY ID_pedido DESC 
            LIMIT 10
        ");
        $stmt->execute();
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Pedidos obtenidos',
            'data' => $pedidos
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener pedidos',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

// ==========================================
// FUNCIONES PARA CHEF
// ==========================================

/**
 * Obtener pedidos pendientes
 * GET: ?action=getPedidosPendientes
 */
function obtenerPedidosPendientes($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT ID_pedido, cliente, Total, detalle,
                   DATE_FORMAT(fecha_creacion, '%H:%i') as fecha_creacion
            FROM pedidos 
            WHERE estado = 'PENDIENTE'
            ORDER BY ID_pedido ASC
        ");
        $stmt->execute();
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Pedidos obtenidos',
            'data' => $pedidos
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al obtener pedidos',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}

/**
 * Marcar pedido como listo
 * POST: ?action=marcarListo
 */
function marcarPedidoListo($pdo) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'No autorizado', 'data' => null]);
        return;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);

    if (!$id) {
        echo json_encode([
            'status' => 'error',
            'message' => 'ID inválido',
            'data' => null
        ]);
        return;
    }

    try {
        $stmt = $pdo->prepare("UPDATE pedidos SET estado = 'LISTO' WHERE ID_pedido = :id");
        $stmt->execute([':id' => $id]);

        echo json_encode([
            'status' => 'success',
            'message' => 'Pedido marcado como LISTO',
            'data' => ['id' => $id]
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al actualizar pedido',
            'data' => ['error' => $e->getMessage()]
        ]);
    }
}