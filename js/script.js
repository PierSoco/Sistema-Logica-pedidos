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
        // --- CAMBIO AQUÍ: Apuntamos directamente al nuevo login.php ---
        const response = await fetch('./backend/login.php', {
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
// 2. LÓGICA DE DASHBOARD.HTML (Al cargar la página)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificamos si estamos en el dashboard.html buscando el header
    const headerNombre = document.getElementById('header-nombre');
    
    if (headerNombre) {
        const userRol = localStorage.getItem('user_rol');
        const userNombre = localStorage.getItem('user_nombre');

        if (!userRol) {
            window.location.href = 'login.html';
            return;
        }

        // Mostramos el nombre en el header
        const avatarInicial = document.getElementById('avatar-inicial');
        const headerRol = document.getElementById('header-rol');
        
        if (userNombre) {
            headerNombre.textContent = userNombre;
            if (avatarInicial) {
                avatarInicial.textContent = userNombre.charAt(0).toUpperCase();
            }
        }
        
        if (userRol && headerRol) {
            headerRol.textContent = userRol;
        }
        
        // 3. ACTIVAR LA SECCIÓN CORRESPONDIENTE
        const rolNormalizado = userRol.trim().toLowerCase();
        const panelActivo = document.getElementById(`panel-${rolNormalizado}`);
        
        if (panelActivo) {
            // Le quitamos la clase .hidden para que se muestre
            panelActivo.classList.remove('hidden');
        } else {
            console.error(`No se encontró el panel para el rol: ${rolNormalizado}`);
        }

        // Inicializar lógicas específicas por rol
        if (rolNormalizado === 'repartidor') {
            iniciarLogicaRepartidor();
        } else if (rolNormalizado === 'superadmin') {
            iniciarLogicaSuperAdmin();
        } else if (rolNormalizado === 'admin') {
            iniciarLogicaAdmin();
        } else if (rolNormalizado === 'recepcionista') {
            iniciarLogicaRecepcionista();
        } else if (rolNormalizado === 'chef') {
            iniciarLogicaChef();
        }

        // Configurar botón de logout
        const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
        if (btnCerrarSesion) {
            btnCerrarSesion.addEventListener('click', () => {
                localStorage.clear();
                window.location.href = './backend/funciones.php?action=logout'; 
            });
        }

        // UI Enhancements: Animación de tarjetas
        const observer = new MutationObserver(() => {
            document.querySelectorAll('.pedido-card').forEach((card, i) => {
                card.style.animationDelay = `${i * 0.07}s`;
            });
        });
        const contenedor = document.getElementById('contenedor-pedidos');
        if (contenedor) observer.observe(contenedor, { childList: true });

        // UI Enhancements: Animación de botón refresh
        const btnRefresh = document.getElementById('btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                const icon = btnRefresh.querySelector('i');
                if (icon) {
                    icon.style.transition = 'transform 0.6s ease';
                    icon.style.transform = 'rotate(360deg)';
                    setTimeout(() => {
                        icon.style.transition = 'none';
                        icon.style.transform = 'rotate(0deg)';
                    }, 600);
                }
            });
        }
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

// ==========================================
// FUNCIONES CRUD DE USUARIOS (SUPERADMIN)
// ==========================================

/**
 * Cargar y mostrar todos los usuarios
 */
async function cargarUsuarios() {
    try {
        const response = await fetch('./backend/funciones.php?action=getUsuarios');
        const result = await response.json();

        if (result.status === 'success') {
            renderizarTablaUsuarios(result.data);
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        mostrarMensaje('error', 'Error de conexión con el servidor');
    }
}

/**
 * Renderizar tabla de usuarios
 */
function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay usuarios registrados</td></tr>';
        return;
    }

    usuarios.forEach(usuario => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${usuario.ID_usuario}</td>
            <td>${usuario.Nombre}</td>
            <td>${usuario.Email}</td>
            <td><span class="badge-rol badge-${usuario.Rol.toLowerCase()}">${usuario.Rol}</span></td>
            <td>${usuario.fecha_creacion || 'N/A'}</td>
            <td class="acciones-cell">
                <button class="btn-editar" onclick="editarUsuario(${usuario.ID_usuario})" title="Editar">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-eliminar" onclick="confirmarEliminarUsuario(${usuario.ID_usuario}, '${usuario.Nombre}')" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Abrir modal para crear nuevo usuario
 */
function abrirModalCrear() {
    const modal = document.getElementById('modal-usuario');
    const form = document.getElementById('form-usuario');
    const titulo = document.getElementById('modal-titulo');
    
    if (!modal || !form) return;

    // Resetear formulario
    form.reset();
    document.getElementById('usuario-id').value = '';
    document.getElementById('password-group').style.display = 'block';
    document.getElementById('usuario-password').required = true;
    
    titulo.textContent = 'Crear Nuevo Usuario';
    modal.style.display = 'flex';
}

/**
 * Editar usuario existente
 */
async function editarUsuario(id) {
    try {
        const response = await fetch(`./backend/funciones.php?action=getUsuario&id=${id}`);
        const result = await response.json();

        if (result.status === 'success') {
            const usuario = result.data;
            const modal = document.getElementById('modal-usuario');
            const titulo = document.getElementById('modal-titulo');
            
            // Llenar formulario con datos del usuario
            document.getElementById('usuario-id').value = usuario.ID_usuario;
            document.getElementById('usuario-nombre').value = usuario.Nombre;
            document.getElementById('usuario-email').value = usuario.Email;
            document.getElementById('usuario-rol').value = usuario.Rol;
            
            // Ocultar campo de contraseña (opcional al editar)
            document.getElementById('password-group').style.display = 'block';
            document.getElementById('usuario-password').required = false;
            document.getElementById('usuario-password').value = '';
            
            titulo.textContent = 'Editar Usuario';
            modal.style.display = 'flex';
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar usuario:', error);
        mostrarMensaje('error', 'Error al cargar los datos del usuario');
    }
}

/**
 * Guardar usuario (crear o actualizar)
 */
async function guardarUsuario(event) {
    event.preventDefault();

    const id = document.getElementById('usuario-id').value;
    const nombre = document.getElementById('usuario-nombre').value.trim();
    const email = document.getElementById('usuario-email').value.trim();
    const rol = document.getElementById('usuario-rol').value;
    const password = document.getElementById('usuario-password').value;

    if (!nombre || !email || !rol) {
        mostrarMensaje('error', 'Por favor completa todos los campos requeridos');
        return;
    }

    const data = { nombre, email, rol };
    
    // Si es edición y hay contraseña nueva, incluirla
    if (id) {
        data.id = parseInt(id);
        if (password) data.password = password;
    } else {
        // Si es creación, la contraseña es obligatoria
        if (!password) {
            mostrarMensaje('error', 'La contraseña es requerida');
            return;
        }
        data.password = password;
    }

    const action = id ? 'updateUsuario' : 'createUsuario';

    try {
        const response = await fetch(`./backend/funciones.php?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            cerrarModal();
            cargarUsuarios(); // Recargar la lista
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al guardar usuario:', error);
        mostrarMensaje('error', 'Error de conexión con el servidor');
    }
}

/**
 * Confirmar eliminación de usuario
 */
function confirmarEliminarUsuario(id, nombre) {
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
        eliminarUsuario(id);
    }
}

/**
 * Eliminar usuario
 */
async function eliminarUsuario(id) {
    try {
        const response = await fetch('./backend/funciones.php?action=deleteUsuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        const result = await response.json();

        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            cargarUsuarios(); // Recargar la lista
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        mostrarMensaje('error', 'Error de conexión con el servidor');
    }
}

/**
 * Cerrar modal
 */
function cerrarModal() {
    const modal = document.getElementById('modal-usuario');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Mostrar mensajes de feedback
 */
function mostrarMensaje(tipo, mensaje) {
    // Crear elemento de mensaje
    const msgDiv = document.createElement('div');
    msgDiv.className = `mensaje-toast mensaje-${tipo}`;
    msgDiv.innerHTML = `
        <i class="fa-solid ${tipo === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
        <span>${mensaje}</span>
    `;

    document.body.appendChild(msgDiv);

    // Animación de entrada
    setTimeout(() => msgDiv.classList.add('show'), 10);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        msgDiv.classList.remove('show');
        setTimeout(() => msgDiv.remove(), 300);
    }, 3000);
}

/**
 * Inicializar lógica del SuperAdmin
 */
function iniciarLogicaSuperAdmin() {
    // Cargar usuarios al iniciar
    cargarUsuarios();

    // Event listeners
    const btnNuevo = document.getElementById('btn-nuevo-usuario');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const formUsuario = document.getElementById('form-usuario');

    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirModalCrear);
    }

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', cerrarModal);
    }

    if (formUsuario) {
        formUsuario.addEventListener('submit', guardarUsuario);
    }

    // Cerrar modal al hacer click fuera
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('modal-usuario');
        if (e.target === modal) {
            cerrarModal();
        }
    });
}

// ==========================================
// FUNCIONES PARA ADMIN
// ==========================================

/**
 * Obtener estadísticas generales
 */
async function cargarEstadisticas() {
    try {
        const response = await fetch('./backend/funciones.php?action=getEstadisticas');
        const result = await response.json();

        if (result.status === 'success') {
            renderizarEstadisticas(result.data);
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        mostrarMensaje('error', 'Error de conexión');
    }
}

function renderizarEstadisticas(stats) {
    // Total de pedidos
    const totalPedidos = document.getElementById('stat-total-pedidos');
    if (totalPedidos) totalPedidos.textContent = stats.total_pedidos || 0;

    // Pedidos pendientes
    const pendientes = document.getElementById('stat-pendientes');
    if (pendientes) pendientes.textContent = stats.pendientes || 0;

    // Pedidos en camino
    const enCamino = document.getElementById('stat-en-camino');
    if (enCamino) enCamino.textContent = stats.en_camino || 0;

    // Total facturado
    const facturado = document.getElementById('stat-facturado');
    if (facturado) facturado.textContent = `$${stats.total_facturado || 0}`;
}

/**
 * Cargar todos los pedidos
 */
async function cargarTodosPedidos() {
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosTodos');
        const result = await response.json();

        if (result.status === 'success') {
            renderizarTablaPedidos(result.data);
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
    }
}

function renderizarTablaPedidos(pedidos) {
    const tbody = document.getElementById('tabla-pedidos-admin');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay pedidos</td></tr>';
        return;
    }

    pedidos.forEach(pedido => {
        const estadoClass = pedido.estado.toLowerCase().replace('_', '-');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${pedido.ID_pedido}</td>
            <td>${pedido.cliente}</td>
            <td>${pedido.calle} ${pedido.altura}</td>
            <td>$${pedido.Total}</td>
            <td><span class="badge-estado badge-${estadoClass}">${pedido.estado}</span></td>
            <td>${pedido.fecha_creacion || 'N/A'}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Inicializar lógica del Admin
 */
function iniciarLogicaAdmin() {
    cargarEstadisticas();
    cargarTodosPedidos();

    const btnRefresh = document.getElementById('btn-refresh-admin');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            cargarEstadisticas();
            cargarTodosPedidos();
        });
    }
}

// ==========================================
// FUNCIONES PARA RECEPCIONISTA
// ==========================================

/**
 * Crear nuevo pedido
 */
async function crearNuevoPedido(event) {
    event.preventDefault();

    const cliente = document.getElementById('pedido-cliente').value.trim();
    const calle = document.getElementById('pedido-calle').value.trim();
    const altura = document.getElementById('pedido-altura').value.trim();
    const localidad = document.getElementById('pedido-localidad').value.trim();
    const total = parseFloat(document.getElementById('pedido-total').value);
    const detalle = document.getElementById('pedido-detalle').value.trim();

    if (!cliente || !calle || !altura || !total) {
        mostrarMensaje('error', 'Por favor completa todos los campos requeridos');
        return;
    }

    const data = {
        cliente,
        calle,
        altura,
        localidad,
        total,
        detalle
    };

    try {
        const response = await fetch('./backend/funciones.php?action=crearPedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            document.getElementById('form-pedido').reset();
            cargarPedidosRecientes();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al crear pedido:', error);
        mostrarMensaje('error', 'Error de conexión');
    }
}

/**
 * Cargar pedidos recientes
 */
async function cargarPedidosRecientes() {
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosRecientes');
        const result = await response.json();

        if (result.status === 'success') {
            renderizarPedidosRecientes(result.data);
        }
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
    }
}

function renderizarPedidosRecientes(pedidos) {
    const lista = document.getElementById('lista-pedidos-recientes');
    if (!lista) return;

    lista.innerHTML = '';

    if (pedidos.length === 0) {
        lista.innerHTML = '<p class="text-center">No hay pedidos recientes</p>';
        return;
    }

    pedidos.forEach(pedido => {
        const div = document.createElement('div');
        div.className = 'pedido-reciente-card';
        const estadoClass = pedido.estado.toLowerCase().replace('_', '-');
        
        div.innerHTML = `
            <div class="pedido-reciente-header">
                <strong>#${pedido.ID_pedido}</strong>
                <span class="badge-estado badge-${estadoClass}">${pedido.estado}</span>
            </div>
            <div class="pedido-reciente-info">
                <p><strong>${pedido.cliente}</strong></p>
                <p>${pedido.calle} ${pedido.altura}</p>
                <p class="pedido-total">Total: $${pedido.Total}</p>
            </div>
        `;
        lista.appendChild(div);
    });
}

/**
 * Inicializar lógica de Recepcionista
 */
function iniciarLogicaRecepcionista() {
    cargarPedidosRecientes();

    const formPedido = document.getElementById('form-pedido');
    if (formPedido) {
        formPedido.addEventListener('submit', crearNuevoPedido);
    }
}

// ==========================================
// FUNCIONES PARA CHEF
// ==========================================

/**
 * Cargar pedidos pendientes
 */
async function cargarPedidosPendientes() {
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosPendientes');
        const result = await response.json();

        if (result.status === 'success') {
            renderizarPedidosPendientes(result.data);
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
        const contenedor = document.getElementById('contenedor-pedidos-chef');
        if (contenedor) {
            contenedor.innerHTML = '<p>Error al conectar con el servidor.</p>';
        }
    }
}

function renderizarPedidosPendientes(pedidos) {
    const contenedor = document.getElementById('contenedor-pedidos-chef');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (pedidos.length === 0) {
        contenedor.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><p>No hay pedidos pendientes</p></div>';
        return;
    }

    pedidos.forEach(pedido => {
        const card = document.createElement('div');
        card.className = 'pedido-chef-card';
        
        card.innerHTML = `
            <div class="pedido-chef-header">
                <span class="pedido-numero">#${pedido.ID_pedido}</span>
                <span class="pedido-hora">${pedido.fecha_creacion || ''}</span>
            </div>
            <div class="pedido-chef-info">
                <p><strong>Cliente:</strong> ${pedido.cliente}</p>
                <p><strong>Detalle:</strong> ${pedido.detalle || 'Sin detalles'}</p>
                <p><strong>Total:</strong> $${pedido.Total}</p>
            </div>
            <button class="btn-listo" data-id="${pedido.ID_pedido}">
                <i class="fa-solid fa-check"></i>
                Marcar como LISTO
            </button>
        `;
        contenedor.appendChild(card);
    });

    // Event listeners para botones
    document.querySelectorAll('.btn-listo').forEach(btn => {
        btn.addEventListener('click', (e) => marcarComoListo(e.target.closest('button').dataset.id));
    });
}

/**
 * Marcar pedido como listo
 */
async function marcarComoListo(idPedido) {
    if (!confirm('¿Confirmas que este pedido está listo?')) return;

    try {
        const response = await fetch('./backend/funciones.php?action=marcarListo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idPedido })
        });

        const result = await response.json();

        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            cargarPedidosPendientes();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('error', 'Error de conexión');
    }
}

/**
 * Inicializar lógica del Chef
 */
function iniciarLogicaChef() {
    cargarPedidosPendientes();

    const btnRefresh = document.getElementById('btn-refresh-chef');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', cargarPedidosPendientes);
    }
}