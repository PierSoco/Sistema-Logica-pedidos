<?php
// backend/login.php
session_start();

// Importar la conexión a la base de datos (asegúrate de que la ruta sea la correcta)
require_once 'conexion.php'; 

header('Content-Type: application/json');

// Opcional pero recomendado: Asegurar que solo se acepten peticiones POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido.']);
    exit;
}

// Leer los datos que envía el frontend (JS)
$data = json_decode(file_get_contents("php://input"), true);
$email = $data['username'] ?? ''; // En JS pasamos el correo como 'username'
$password = $data['password'] ?? '';

if (empty($email) || empty($password)) {
    echo json_encode(['success' => false, 'error' => 'Por favor, completa ambos campos.']);
    exit;
}

try {
    // Buscar al usuario por email
    $stmt = $pdo->prepare("SELECT * FROM Usuarios WHERE Email = :email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Verificar si el usuario existe y la contraseña es correcta
    if ($user && password_verify($password, $user['Password'])) {
        // Guardar datos en la sesión
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