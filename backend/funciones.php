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
        case 'login':
            procesarLogin($pdo);
            break;
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
        default:
            echo json_encode(['error' => 'Acción no válida']);
            break;
    }
    exit;
}

// ==========================================
// FUNCIONES DE AUTENTICACIÓN
// ==========================================

function procesarLogin($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['username'] ?? ''; // En JS pasamos el correo como 'username'
    $password = $data['password'] ?? '';

    try {
        $stmt = $pdo->prepare("SELECT * FROM Usuarios WHERE Email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['Password'])) {
            $_SESSION['user_id'] = $user['ID_usuario'];
            $_SESSION['user_rol'] = $user['Rol'];
            $_SESSION['user_nombre'] = $user['Nombre'];

            echo json_encode([
                'success' => true,
                'nombre' => $user['Nombre'],
                'rol' => $user['Rol']
            ]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Credenciales incorrectas.']);
        }
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Error de BD: ' . $e->getMessage()]);
    }
}

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
        $stmt = $pdo->prepare("SELECT ID_pedido, Total, cliente, calle, altura, Localidad FROM Pedidos WHERE estado = 'LISTO' ORDER BY ID_pedido DESC");
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function actualizarEstadoPedido($pdo) {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        $stmt = $pdo->prepare("UPDATE Pedidos SET estado = :estado WHERE ID_pedido = :id");
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

        $stmt = $pdo->prepare("SELECT ID_usuario FROM Usuarios WHERE Email = :email LIMIT 1");
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
        $stmt = $pdo->prepare("UPDATE Usuarios SET Password = ? WHERE ID_usuario = ?");
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