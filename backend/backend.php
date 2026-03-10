<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST");

// 1. Conexión a la Base de Datos (Ajustá tus credenciales)
$host = "localhost";
$db_name = "zatmeni8_pos_pruebas";
$username = "zatmeni8_zatmeni8";
$password = "V6TTYQxoOOdV"; 

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name, $username, $password);
    $conn->exec("set names utf8");
} catch(PDOException $exception) {
    echo json_encode(["error" => "Error de conexión: " . $exception->getMessage()]);
    exit();
}

// 2. Manejo de Peticiones
$action = isset($_GET['action']) ? $_GET['action'] : '';

switch($action) {
    case 'getListos':
        $query = "SELECT p.ID_pedido, c.Nombre as cliente, d.calle, d.altura, d.Localidad, p.Total 
                  FROM Pedidos p
                  JOIN Clientes c ON p.ID_cliente = c.ID_cliente
                  JOIN Direcciones d ON p.ID_direccion = d.ID_direccion
                  WHERE p.estado = 'LISTO'";
        
        $stmt = $conn->prepare($query);
        $stmt->execute();
        
        $pedidos_arr = array();
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)){
            array_push($pedidos_arr, $row);
        }
        echo json_encode($pedidos_arr);
        break;

    case 'actualizarEstado':
        $data = json_decode(file_get_contents("php://input"));
        
        if(!empty($data->id) && !empty($data->estado)) {
            $query = "UPDATE Pedidos SET estado = :estado WHERE ID_pedido = :id";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':estado', $data->estado);
            $stmt->bindParam(':id', $data->id);
            
            if($stmt->execute()) {
                echo json_encode(["mensaje" => "Estado actualizado a " . $data->estado]);
            } else {
                echo json_encode(["error" => "No se pudo actualizar"]);
            }
        } else {
            echo json_encode(["error" => "Datos incompletos"]);
        }
        break;

    default:
        echo json_encode(["error" => "Acción no válida en la API"]);
        break;
}
?>