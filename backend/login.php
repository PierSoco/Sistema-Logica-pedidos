<?php
// Configurar las cabeceras para responder siempre en JSON
header('Content-Type: application/json');
session_start();

// 1. Incluir los archivos de conexión y funciones.
// El archivo de conexión define la variable $pdo.
require_once 'conexion.php';
require_once 'funciones.php';

// 2. Obtener y decodificar el cuerpo JSON enviado por fetch()
$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['username']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'error' => 'Faltan completar campos.']);
    exit;
}

$username = $data['username'];
$password_input = $data['password'];

// 3. Llamar a la función de validación
$user = validarUsuario($pdo, $username, $password_input);

// 4. Comprobar el resultado y responder
if ($user) {
    // Guardar datos del usuario en la sesión para usarlos en otras páginas
    $_SESSION['user_id'] = $user['ID_usuario'];
    $_SESSION['user_rol'] = $user['Rol'];
    $_SESSION['user_nombre'] = $user['Nombre'];

    echo json_encode([
        'success' => true,
        'nombre' => $user['Nombre'],
        'rol' => $user['Rol']
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Usuario o contraseña incorrectos.']);
}
?>