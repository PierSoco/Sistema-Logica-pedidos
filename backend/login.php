<?php
// backend/login.php
session_start();
require_once 'conexion.php';

header('Content-Type: application/json');

// Solo aceptar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$email    = trim($data['username'] ?? '');
$password = $data['password'] ?? '';

if (!$email || !$password) {
    echo json_encode(['success' => false, 'error' => 'Email y contraseña son requeridos']);
    exit;
}

try {
    // Buscar usuario activo + nombre de su restaurante en una sola query
    $stmt = $pdo->prepare("
        SELECT
            u.ID_usuario,
            u.Nombre,
            u.Apellido,
            u.Email,
            u.Password,
            u.Rol,
            u.ID_restaurante,
            r.Nombre_local AS restaurante_nombre
        FROM usuarios u
        LEFT JOIN restaurantes r ON u.ID_restaurante = r.ID_Restaurante
        WHERE u.Email = :email
          AND u.activo = 1
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !password_verify($password, $user['Password'])) {
        // Respuesta genérica — no revelar si el email existe o no
        echo json_encode(['success' => false, 'error' => 'Credenciales incorrectas']);
        exit;
    }

    // Regenerar ID de sesión para prevenir session fixation
    session_regenerate_id(true);

    // Guardar todos los datos relevantes en la sesión PHP
    $_SESSION['user_id']                 = (int)$user['ID_usuario'];
    $_SESSION['user_rol']                = strtolower(trim($user['Rol']));
    $_SESSION['user_restaurante']        = $user['ID_restaurante'] ? (int)$user['ID_restaurante'] : null;
    $_SESSION['user_restaurante_nombre'] = $user['restaurante_nombre'] ?? null;
    $_SESSION['user_nombre']             = $user['Nombre'] . ' ' . $user['Apellido'];
    $_SESSION['user_email']              = $user['Email'];

    // Respuesta al frontend — nunca incluir la contraseña ni el ID en claro
    echo json_encode([
        'success'            => true,
        'rol'                => $_SESSION['user_rol'],
        'nombre'             => $_SESSION['user_nombre'],
        'email'              => $_SESSION['user_email'],
        'restaurante_nombre' => $_SESSION['user_restaurante_nombre'],
    ]);

} catch (PDOException $e) {
    // Error genérico — no exponer detalles de la BD al cliente
    error_log('Login error: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Error interno. Intenta más tarde.']);
}