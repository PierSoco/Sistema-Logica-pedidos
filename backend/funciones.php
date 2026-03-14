<?php
// backend/funciones.php

function validarUsuario($pdo, $username, $password_input) {
    // Preparar la consulta para buscar al usuario por su Username de forma segura
    $stmt = $pdo->prepare("SELECT * FROM Usuarios WHERE Username = :username");
    $stmt->bindParam(':username', $username);
    $stmt->execute();

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Validar que el usuario exista y la contraseña sea correcta
    // NOTA: En producción, es crucial usar password_hash() y password_verify()
    if ($user && $user['Password'] === $password_input) {
        return $user; // Devolvemos toda la info del usuario si es correcto
    }

    return false; // Devolvemos false si no es válido
}
?>