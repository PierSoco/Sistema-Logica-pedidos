// ==========================================
// 1. FUNCIONES DE LOGIN (Llamadas desde el HTML)
// ==========================================
async function loginUsuario() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert("Por favor, completa ambos campos.");
        return;
    }

    try {
        const response = await fetch('./backend/funciones.php?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error("Error en el servidor");
        const result = await response.json();

        if (result.success) {
            // Llamamos a showInit si las credenciales son válidas
            showInit(result.rol, result.nombre);
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

function showInit(rol, nombre) {
    // 1. Guardamos los datos para saber quién es en el index.html
    localStorage.setItem('user_nombre', nombre.trim());
    localStorage.setItem('user_rol', rol.trim());
    
    // 2. Redirigimos al index.html
    window.location.href = 'dashboard.html'; 
}

// ==========================================
// 2. LÓGICA DE INDEX.HTML (Al cargar la página)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificamos si estamos en el index.html buscando un elemento único de esa página
    const mensajeBienvenida = document.getElementById('mensaje-bienvenida');
    
    if (mensajeBienvenida) {
        const userRol = localStorage.getItem('user_rol');
        const userNombre = localStorage.getItem('user_nombre');

        if (!userRol) {
            window.location.href = 'login.html';
            return;
        }

        // Mostramos el nombre en el header
        mensajeBienvenida.innerText = `Hola, ${userNombre} (${userRol})`;
        
        // 3. ACTIVAR LA SECCIÓN CORRESPONDIENTE
        const rolNormalizado = userRol.trim().toLowerCase();
        const panelActivo = document.getElementById(`panel-${rolNormalizado}`);
        
        if (panelActivo) {
            // Le quitamos la clase .hidden para que se muestre
            panelActivo.classList.remove('hidden');
        } else {
            console.error(`Falta la etiqueta <section id="panel-${rolNormalizado}" class="hidden"> en el HTML`);
        }

        // Inicializar lógicas específicas por rol
        if (rolNormalizado === 'repartidor') {
            iniciarLogicaRepartidor();
        }

        // Configurar botón de logout
        document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
            localStorage.clear();
            window.location.href = './backend/funciones.php?action=logout'; 
        });
    }
});

// ==========================================
// 3. FUNCIONES ESPECÍFICAS (Repartidor)
// ==========================================
function iniciarLogicaRepartidor() {
    const contenedorPedidos = document.getElementById('contenedor-pedidos');
    const btnRefresh = document.getElementById('btn-refresh');

    const cargarPedidos = async () => {
        try {
            const response = await fetch('./backend/funciones.php?action=getListos');
            const pedidos = await response.json();
            renderizarPedidos(pedidos);
        } catch (error) {
            console.error("Error:", error);
            contenedorPedidos.innerHTML = '<p>Error al conectar con el servidor.</p>';
        }
    };

    const renderizarPedidos = (pedidos) => {
        contenedorPedidos.innerHTML = ''; 
        if(pedidos.length === 0) {
            contenedorPedidos.innerHTML = '<p>No hay pedidos listos.</p>';
            return;
        }

        pedidos.forEach(pedido => {
            const card = document.createElement('div');
            card.classList.add('pedido-card');
            const direccionMaps = encodeURIComponent(`${pedido.calle} ${pedido.altura}, ${pedido.Localidad || ''}`);
            
            card.innerHTML = `
                <div class="pedido-header">
                    <span>#${pedido.ID_pedido}</span>
                    <span>$${pedido.Total}</span>
                </div>
                <div class="pedido-info">
                    <p><strong>Cliente:</strong> ${pedido.cliente}</p>
                    <p><strong>Dirección:</strong> ${pedido.calle} ${pedido.altura}</p>
                    <a href="https://maps.google.com/?q=${direccionMaps}" target="_blank" class="link-mapa">📍 Ver en Mapa</a>
                </div>
                <button class="btn-aceptar" data-id="${pedido.ID_pedido}">Aceptar Pedido</button>
            `;
            contenedorPedidos.appendChild(card);
        });

        document.querySelectorAll('.btn-aceptar').forEach(btn => {
            btn.addEventListener('click', (e) => aceptarPedido(e.target.dataset.id));
        });
    };

    btnRefresh.addEventListener('click', cargarPedidos);
    cargarPedidos();
}

const aceptarPedido = async (idPedido) => {
    if(!confirm("¿Confirmas que te llevas este pedido?")) return;
    try {
        const response = await fetch('./backend/funciones.php?action=actualizarEstado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idPedido, estado: 'EN_CAMINO' })
        });
        const result = await response.json();
        if(result.mensaje) {
            document.getElementById('btn-refresh').click(); 
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        console.error("Error en post:", error);
    }
};

// ==========================================
// FUNCIÓN PARA MOSTRAR/OCULTAR CONTRASEÑA
// ==========================================
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.querySelector('.toggle-password');
    
    if (passwordInput.type === 'password') {
        // Mostramos la contraseña y tachamos el ojito
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        // Ocultamos la contraseña y abrimos el ojito
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// ==========================================
// FUNCIONES DE RECUPERACIÓN DE CONTRASEÑA
// ==========================================

async function solicitarRecuperacion() {
    const email = document.getElementById('email-recuperacion').value;
    if (!email) {
        alert("Por favor, ingresa tu correo.");
        return;
    }

    try {
        const response = await fetch('./backend/funciones.php?action=forgotPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const result = await response.json();
        
        if (result.success) {
            alert(result.mensaje); // "Si el correo existe..."
            window.location.href = 'login.html'; // Devolver al login
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        alert("Error de conexión.");
    }
}

async function guardarNuevaPassword() {
    // Extraer el token de la URL (ej: restablecer.html?token=1234abcd...)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    const password = document.getElementById('new-password').value;
    const password_confirm = document.getElementById('confirm-password').value;

    if (!token) {
        alert("Enlace inválido o sin token.");
        return;
    }

    try {
        const response = await fetch('./backend/funciones.php?action=resetPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password, password_confirm })
        });
        const result = await response.json();

        if (result.success) {
            alert(result.mensaje);
            window.location.href = 'login.html'; // Listo, a iniciar sesión
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        alert("Error de conexión.");
    }
}