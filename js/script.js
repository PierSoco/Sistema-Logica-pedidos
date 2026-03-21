// ==========================================
// VARIABLES GLOBALES RECEPCIONISTA
// ==========================================
let carritoActual = [];
let totalPedidoActual = 0;
let DATA_RECEPCION = { productos: [], pedidos: [], detalles: [], restaurante: null };
let productoSeleccionadoTemporal = null;
let stepActual = 1;
const TOTAL_STEPS = 3;

// ==========================================
// INICIO DE LÓGICA RECEPCIONISTA
// ==========================================
async function iniciarLogicaRecepcionista() {
    console.log("Cargando ecosistema de Recepción...");
    await cargarTodoRecepcion();
    document.getElementById('buscador-pedidos-gral')?.addEventListener('input', filtrarPedidosLocal);
}

function filtrarPedidosLocal(e) {
    const busqueda = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.pedido-fila').forEach(fila => {
        fila.style.display = fila.innerText.toLowerCase().includes(busqueda) ? '' : 'none';
    });
}

// ==========================================
// CARGA INICIAL DE DATOS
// ==========================================
async function cargarTodoRecepcion() {
    try {
        const res = await fetch('./backend/funciones.php?action=getInitialDataRecepcionista');
        const result = await res.json();
        if (result.status === 'success') {
            DATA_RECEPCION.productos  = result.data.productos;
            DATA_RECEPCION.pedidos    = result.data.pedidos;
            DATA_RECEPCION.detalles   = result.data.detalles;
            DATA_RECEPCION.restaurante= result.data.restaurante || null;
            renderizarTablaPedidosRecepcion(DATA_RECEPCION.pedidos);
        } else {
            mostrarMensaje('error', 'Error al cargar datos: ' + result.message);
        }
    } catch (error) {
        mostrarMensaje('error', 'No se pudo conectar al servidor.');
    }
}

async function recargarPedidosActuales() {
    try {
        const res = await fetch('./backend/funciones.php?action=getPedidosActuales');
        const result = await res.json();
        if (result.status === 'success') {
            DATA_RECEPCION.pedidos = result.data;
            renderizarTablaPedidosRecepcion(result.data);
        }
    } catch (err) { console.error("Error recargando pedidos:", err); }
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderizarTablaPedidosRecepcion(pedidos) {
    const tbody = document.querySelector('#tabla-pedidos-recepcion tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">
            <i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;color:#cbd5e1;"></i>
            No hay pedidos activos en este momento</td></tr>`;
        return;
    }

    pedidos.forEach(p => {
        const piso = p.piso_depto  ? ` · <em>${p.piso_depto}</em>` : '';
        const ref  = p.referencias ? `<br><small style="color:#94a3b8;">📌 ${p.referencias}</small>` : '';
        tbody.innerHTML += `
            <tr class="pedido-fila">
                <td><strong style="color:#6366f1;">#${p.ID_pedido}</strong></td>
                <td>
                    <div style="font-weight:600;color:#1e293b;">${p.c_nombre} ${p.c_apellido}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;"><i class="fa-solid fa-phone" style="font-size:10px;"></i> ${p.c_telefono || '—'}</div>
                </td>
                <td>
                    <div style="color:#334155;">${p.Calle} ${p.Numero}${piso}</div>
                    <div style="font-size:12px;color:#64748b;">${p.Localidad || ''}${ref}</div>
                </td>
                <td style="max-width:180px;"><small style="color:#475569;line-height:1.5;">${p.detalles_resumen || '—'}</small></td>
                <td><span class="precio-tag">$${parseFloat(p.Total).toFixed(2)}</span></td>
                <td>
                    <select class="select-estado"
                            onchange="cambiarEstadoPedido(${p.ID_pedido}, this.value, this)"
                            data-estado-original="${p.Estado}">
                        <option value="Pendiente"  ${p.Estado==='Pendiente'  ?'selected':''}>⏳ Pendiente</option>
                        <option value="Preparando" ${p.Estado==='Preparando' ?'selected':''}>👨‍🍳 Preparando</option>
                        <option value="En camino"  ${p.Estado==='En camino'  ?'selected':''}>🛵 En camino</option>
                        <option value="Entregado"  ${p.Estado==='Entregado'  ?'selected':''}>✅ Entregado</option>
                        <option value="Cancelado"  ${p.Estado==='Cancelado'  ?'selected':''}>❌ Cancelado</option>
                    </select>
                </td>
                <td>
                    <button class="btn-icon" title="Ver detalle" onclick="verDetallePedido(${p.ID_pedido})">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-danger" title="Cancelar" onclick="confirmarCancelarPedido(${p.ID_pedido})">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                </td>
            </tr>`;
    });
}

// ==========================================
// CAMBIAR ESTADO
// ==========================================
async function cambiarEstadoPedido(idPedido, nuevoEstado, selectEl) {
    const estadoOriginal = selectEl.dataset.estadoOriginal;
    if (nuevoEstado === 'Cancelado') {
        if (!confirm(`¿Cancelar pedido #${idPedido}? Se devolverá el stock automáticamente.`)) {
            selectEl.value = estadoOriginal; return;
        }
    }
    try {
        const res = await fetch('./backend/funciones.php?action=actualizarPedido', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id:idPedido, estado:nuevoEstado})
        });
        const result = await res.json();
        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            selectEl.dataset.estadoOriginal = nuevoEstado;
            if (nuevoEstado === 'Entregado' || nuevoEstado === 'Cancelado')
                setTimeout(() => recargarPedidosActuales(), 900);
        } else {
            mostrarMensaje('error', result.message);
            selectEl.value = estadoOriginal;
        }
    } catch { mostrarMensaje('error','Error de conexión'); selectEl.value = estadoOriginal; }
}

// ==========================================
// VER DETALLE
// ==========================================
async function verDetallePedido(idPedido) {
    const modal = document.getElementById('modal-detalle-pedido');
    document.getElementById('detalle-pedido-titulo').textContent = `Pedido #${idPedido}`;
    document.getElementById('detalle-pedido-contenido').innerHTML =
        '<p style="text-align:center;color:#94a3b8;padding:40px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';
    modal.classList.add('visible');

    try {
        const res = await fetch(`./backend/funciones.php?action=getPedido&id=${idPedido}`);
        const result = await res.json();
        if (result.status !== 'success') { mostrarMensaje('error','No se pudo cargar el pedido'); return; }

        const p = result.data;
        const piso = p.piso_depto ? ` · ${p.piso_depto}` : '';
        const ref  = p.referencias ? `<br><span style="font-size:12px;color:#64748b;">📌 ${p.referencias}</span>` : '';
        const itemsHTML = (p.items||[]).map(item => `
            <tr>
                <td>${item.nombre}</td>
                <td style="text-align:center;font-weight:600;">${item.Cantidad}</td>
                <td style="text-align:right;">$${parseFloat(item.Precio).toFixed(2)}</td>
                <td style="text-align:right;font-weight:700;color:#0d9488;">$${parseFloat(item.Subtotal).toFixed(2)}</td>
            </tr>`).join('');

        document.getElementById('detalle-pedido-contenido').innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-card">
                    <p class="detalle-card-title"><i class="fa-solid fa-user"></i> Cliente</p>
                    <p><strong>${p.c_nombre} ${p.c_apellido}</strong></p>
                    <p><i class="fa-solid fa-phone" style="font-size:11px;color:#94a3b8;"></i> ${p.c_telefono || '—'}</p>
                </div>
                <div class="detalle-card">
                    <p class="detalle-card-title"><i class="fa-solid fa-map-marker-alt"></i> Dirección</p>
                    <p>${p.Calle} ${p.Numero}${piso}</p>
                    <p>${p.Localidad}${ref}</p>
                </div>
            </div>
            <p class="form-section-label" style="margin-bottom:10px;"><i class="fa-solid fa-utensils"></i> Productos</p>
            <table class="tabla-detalle-pedido">
                <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P.Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
                <tbody>${itemsHTML || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Sin productos</td></tr>'}</tbody>
            </table>
            <div class="total-bar" style="margin-top:16px;">
                <span class="total-bar-label">Total del pedido</span>
                <span class="total-bar-amount">$${parseFloat(p.Total).toFixed(2)}</span>
            </div>`;
    } catch { mostrarMensaje('error','Error al cargar detalle'); }
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle-pedido')?.classList.remove('visible');
}

// ==========================================
// CANCELAR PEDIDO
// ==========================================
function confirmarCancelarPedido(idPedido) {
    if (!confirm(`¿Cancelar pedido #${idPedido}? Se devolverá el stock.`)) return;
    cancelarPedidoDirecto(idPedido);
}
async function cancelarPedidoDirecto(idPedido) {
    try {
        const res = await fetch('./backend/funciones.php?action=cancelarPedido', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id:idPedido})
        });
        const result = await res.json();
        if (result.status==='success') { mostrarMensaje('success',result.message); setTimeout(recargarPedidosActuales,800); }
        else mostrarMensaje('error',result.message);
    } catch { mostrarMensaje('error','Error de conexión'); }
}

// ==========================================
// MODAL NUEVO PEDIDO — STEPS
// ==========================================
function abrirModalNuevoPedido() {
    carritoActual = [];
    totalPedidoActual = 0;
    productoSeleccionadoTemporal = null;
    stepActual = 1;

    document.getElementById('form-nuevo-pedido')?.reset();
    actualizarUICarrito();
    irStep(1, true);

    // Autocompletar localidad del restaurante
    const inputLoc = document.getElementById('dir-localidad');
    if (inputLoc) {
        const localidad = DATA_RECEPCION.restaurante?.Localidad || '';
        inputLoc.value = localidad;
    }

    document.getElementById('modal-nuevo-pedido').classList.add('visible');
}

function cerrarModalNuevoPedido() {
    document.getElementById('modal-nuevo-pedido')?.classList.remove('visible');
    carritoActual = [];
    totalPedidoActual = 0;
    actualizarUICarrito();
}

// Navegación entre steps
function navegarStep(dir) {
    const nuevoStep = stepActual + dir;
    if (nuevoStep < 1 || nuevoStep > TOTAL_STEPS) return;

    // Validar step actual antes de avanzar
    if (dir > 0 && !validarStep(stepActual)) return;

    irStep(nuevoStep);
}

function irStep(n, forzar = false) {
    // Solo permitir ir atrás o al paso actual sin validar
    if (!forzar && n > stepActual && !validarStep(stepActual)) return;

    // Ocultar todos los paneles
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));

    // Marcar steps completados
    for (let i = 1; i < n; i++) {
        const ind = document.getElementById(`step-ind-${i}`);
        if (ind) { ind.classList.remove('active'); ind.classList.add('done'); ind.querySelector('.step-num').innerHTML = '<i class="fa-solid fa-check" style="font-size:10px;"></i>'; }
    }
    // Reset steps futuros
    for (let i = n; i <= TOTAL_STEPS; i++) {
        const ind = document.getElementById(`step-ind-${i}`);
        if (ind) { ind.classList.remove('done'); ind.querySelector('.step-num').textContent = i; }
    }

    // Activar step actual
    document.getElementById(`step-panel-${n}`)?.classList.add('active');
    document.getElementById(`step-ind-${n}`)?.classList.add('active');
    stepActual = n;

    // Botones footer
    const btnPrev   = document.getElementById('btn-step-prev');
    const btnNext   = document.getElementById('btn-step-next');
    const btnGuardar= document.getElementById('btn-guardar-pedido');
    const counter   = document.getElementById('step-counter');

    btnPrev.style.display    = n > 1 ? 'flex' : 'none';
    btnNext.style.display    = n < TOTAL_STEPS ? 'flex' : 'none';
    btnGuardar.style.display = n === TOTAL_STEPS ? 'flex' : 'none';
    if (counter) counter.textContent = `Paso ${n} de ${TOTAL_STEPS}`;
}

function validarStep(n) {
    if (n === 1) {
        const nombre   = document.getElementById('cliente-nombre')?.value.trim();
        const apellido = document.getElementById('cliente-apellido')?.value.trim();
        const telefono = document.getElementById('cliente-telefono')?.value.trim();
        if (!nombre || !apellido || !telefono) {
            mostrarMensaje('error', 'Completá nombre, apellido y teléfono del cliente.');
            document.getElementById(nombre ? (apellido ? 'cliente-telefono' : 'cliente-apellido') : 'cliente-nombre')?.focus();
            return false;
        }
    }
    if (n === 2) {
        const calle  = document.getElementById('dir-calle')?.value.trim();
        const numero = document.getElementById('dir-numero')?.value.trim();
        if (!calle || !numero) {
            mostrarMensaje('error', 'Completá calle y número.');
            document.getElementById(calle ? 'dir-numero' : 'dir-calle')?.focus();
            return false;
        }
    }
    if (n === 3) {
        if (carritoActual.length === 0) {
            mostrarMensaje('error', 'Agregá al menos un producto al pedido.');
            return false;
        }
    }
    return true;
}

// ==========================================
// CANTIDAD TEMPORAL (botones +/-)
// ==========================================
function cambiarCantTemp(delta) {
    const inp = document.getElementById('cantidad-producto');
    if (!inp) return;
    const val = parseInt(inp.value) || 1;
    inp.value = Math.max(1, val + delta);
}

// ==========================================
// BUSCADOR LIVE DE PRODUCTOS
// ==========================================
function buscarProductosLive() {
    const input = document.getElementById('buscador-producto').value.trim();
    const ul    = document.getElementById('resultados-busqueda-productos');
    if (!ul) return;

    if (input.length < 1) { ul.classList.remove('open'); return; }

    const filtrados = DATA_RECEPCION.productos.filter(p =>
        p.Nombre.toLowerCase().includes(input.toLowerCase())
    );

    ul.innerHTML = '';
    if (filtrados.length > 0) {
        filtrados.forEach(p => {
            const stock = p.Disponibilidad;
            const sinStock = stock === 0;
            const stockClass = sinStock ? 'out' : (stock <= 5 ? 'low' : '');
            const stockLabel = stock >= 999 ? '' : `<span class="prod-stock ${stockClass}">${sinStock ? 'Sin stock' : `Stock: ${stock}`}</span>`;
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="prod-name">${p.Nombre}</span>
                <span class="prod-meta">
                    <span class="prod-price">$${parseFloat(p.Precio).toFixed(2)}</span>
                    ${stockLabel}
                </span>`;
            if (!sinStock) li.onclick = () => seleccionarProducto(p);
            else li.style.opacity = '.45';
            ul.appendChild(li);
        });
    } else {
        ul.innerHTML = '<li class="prod-no-results"><i class="fa-solid fa-search" style="margin-right:6px;"></i>Sin resultados para "' + input + '"</li>';
    }
    ul.classList.add('open');
}

function seleccionarProducto(prod) {
    document.getElementById('buscador-producto').value = prod.Nombre;
    document.getElementById('resultados-busqueda-productos')?.classList.remove('open');
    productoSeleccionadoTemporal = prod;
}
function seleccionarProductoListado(prod) { seleccionarProducto(prod); }

// ==========================================
// CARRITO
// ==========================================
function agregarProductoAlCarrito() {
    if (!productoSeleccionadoTemporal) {
        mostrarMensaje('error', 'Seleccioná un producto de la lista.'); return;
    }
    const cant = parseInt(document.getElementById('cantidad-producto').value) || 1;
    if (cant < 1) { mostrarMensaje('error', 'La cantidad debe ser mayor a 0.'); return; }

    const stock = productoSeleccionadoTemporal.Disponibilidad;
    if (stock !== undefined && stock < cant && stock < 999) {
        mostrarMensaje('error', `Stock insuficiente. Disponible: ${stock}.`); return;
    }

    const existente = carritoActual.find(i => i.id === productoSeleccionadoTemporal.ID_producto);
    if (existente) {
        const nuevaCant = existente.cantidad + cant;
        if (stock < nuevaCant && stock < 999) { mostrarMensaje('error',`Stock insuficiente. Disponible: ${stock}.`); return; }
        existente.cantidad = nuevaCant;
        existente.subtotal = parseFloat((existente.precio * nuevaCant).toFixed(2));
    } else {
        carritoActual.push({
            id: productoSeleccionadoTemporal.ID_producto,
            nombre: productoSeleccionadoTemporal.Nombre,
            precio: parseFloat(productoSeleccionadoTemporal.Precio),
            cantidad: cant,
            subtotal: parseFloat((productoSeleccionadoTemporal.Precio * cant).toFixed(2))
        });
    }

    actualizarUICarrito();
    document.getElementById('buscador-producto').value = '';
    document.getElementById('cantidad-producto').value = '1';
    productoSeleccionadoTemporal = null;
}

function actualizarUICarrito() {
    const wrapper  = document.getElementById('lista-carrito');
    const vacio    = document.getElementById('carrito-vacio');
    const totalBar = document.getElementById('total-bar');
    const totalEl  = document.getElementById('pedido-total-calculado');
    if (!wrapper) return;

    wrapper.innerHTML = '';
    totalPedidoActual = 0;

    if (carritoActual.length === 0) {
        if (vacio) vacio.style.display = 'flex';
        if (totalBar) totalBar.style.display = 'none';
        if (totalEl) totalEl.textContent = '$0.00';
        return;
    }

    if (vacio) vacio.style.display = 'none';
    if (totalBar) totalBar.style.display = 'flex';

    carritoActual.forEach((item, index) => {
        totalPedidoActual += item.subtotal;
        const div = document.createElement('div');
        div.className = 'carrito-item';
        div.innerHTML = `
            <div>
                <div class="item-nombre">${item.nombre}</div>
                <div class="item-precio-unit">$${item.precio.toFixed(2)} c/u</div>
            </div>
            <div class="item-qty-ctrl">
                <input type="number" min="1" value="${item.cantidad}"
                       onchange="actualizarCantidadCarrito(${index}, this.value)"
                       style="width:42px;">
            </div>
            <span class="item-subtotal">$${item.subtotal.toFixed(2)}</span>
            <button type="button" class="item-remove" onclick="eliminarDelCarrito(${index})">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        wrapper.appendChild(div);
    });

    if (totalEl) totalEl.textContent = `$${totalPedidoActual.toFixed(2)}`;
}

function actualizarCantidadCarrito(index, nuevaCant) {
    const cant = parseInt(nuevaCant);
    if (isNaN(cant) || cant < 1) return;
    const item = carritoActual[index];
    if (!item) return;
    const prod = DATA_RECEPCION.productos.find(p => p.ID_producto === item.id);
    if (prod && prod.Disponibilidad < cant && prod.Disponibilidad < 999) {
        mostrarMensaje('error',`Stock insuficiente. Disponible: ${prod.Disponibilidad}.`);
        actualizarUICarrito(); return;
    }
    item.cantidad = cant;
    item.subtotal = parseFloat((item.precio * cant).toFixed(2));
    actualizarUICarrito();
}

function eliminarDelCarrito(index) {
    carritoActual.splice(index, 1);
    actualizarUICarrito();
}

// ==========================================
// GUARDAR PEDIDO
// ==========================================
async function guardarNuevoPedido() {
    if (!validarStep(3)) return;

    const nombre    = document.getElementById('cliente-nombre')?.value.trim();
    const apellido  = document.getElementById('cliente-apellido')?.value.trim();
    const telefono  = document.getElementById('cliente-telefono')?.value.trim();
    const calle     = document.getElementById('dir-calle')?.value.trim();
    const numero    = document.getElementById('dir-numero')?.value.trim();
    const piso      = document.getElementById('dir-piso')?.value.trim() || '';
    const ref       = document.getElementById('dir-ref')?.value.trim() || '';
    const localidad = document.getElementById('dir-localidad')?.value.trim() || '';

    const payload = {
        cliente: { nombre, apellido, telefono },
        direccion: { calle, numero, piso, ref, localidad, cp: '' },
        carrito: carritoActual,
        total: totalPedidoActual
    };

    const btn = document.getElementById('btn-guardar-pedido');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const res = await fetch('./backend/funciones.php?action=crearPedidoRecepcion', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.status === 'success') {
            mostrarMensaje('success', result.message);
            cerrarModalNuevoPedido();
            recargarPedidosActuales();
        } else {
            mostrarMensaje('error', result.message || 'Error al crear pedido');
        }
    } catch (err) {
        mostrarMensaje('error', 'Error de conexión al guardar el pedido.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'; }
    }
}

// Cerrar modales con click fuera (en el overlay)
window.addEventListener('click', (e) => {
    if (e.target.id === 'modal-nuevo-pedido')   cerrarModalNuevoPedido();
    if (e.target.id === 'modal-detalle-pedido') cerrarModalDetalle();
});

// Cerrar dropdown de productos al hacer clic fuera
document.addEventListener('click', (e) => {
    const ul = document.getElementById('resultados-busqueda-productos');
    const buscador = document.getElementById('buscador-producto');
    if (ul && !ul.contains(e.target) && e.target !== buscador) ul.classList.remove('open');
});

// Tecla Escape para cerrar modales
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cerrarModalNuevoPedido(); cerrarModalDetalle(); }
});

// ==========================================
// 1. FUNCIONES DE LOGIN
// ==========================================
async function loginUsuario() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert("Por favor, completa ambos campos.");
        return;
    }

    try {
        const response = await fetch('./backend/login.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error("Error en el servidor");
        const result = await response.json();

        if (result.success) {
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
    localStorage.setItem('user_nombre', nombre.trim());
    localStorage.setItem('user_rol', rol.trim());
    window.location.href = 'dashboard.html';
}

// ==========================================
// 2. LÓGICA DE DASHBOARD
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const headerNombre = document.getElementById('header-nombre');

    if (headerNombre) {
        const userRol    = localStorage.getItem('user_rol');
        const userNombre = localStorage.getItem('user_nombre');

        if (!userRol) {
            window.location.href = 'login.html';
            return;
        }

        const avatarInicial = document.getElementById('avatar-inicial');
        const headerRol     = document.getElementById('header-rol');

        if (userNombre) {
            headerNombre.textContent = userNombre;
            if (avatarInicial) avatarInicial.textContent = userNombre.charAt(0).toUpperCase();
        }

        if (userRol && headerRol) {
            headerRol.textContent = userRol.toUpperCase();
        }

        const rolNormalizado = userRol.trim().toLowerCase();
        const panelActivo = document.getElementById(`panel-${rolNormalizado}`);

        if (panelActivo) {
            panelActivo.classList.remove('hidden');
        } else {
            console.error(`No se encontró el panel HTML para el rol: ${rolNormalizado}`);
        }

        switch (rolNormalizado) {
            case 'recepcionista':
                iniciarLogicaRecepcionista();
                break;
            case 'repartidor':
                if (typeof iniciarLogicaRepartidor === 'function') iniciarLogicaRepartidor();
                break;
            case 'chef':
                if (typeof iniciarLogicaChef === 'function') iniciarLogicaChef();
                break;
            case 'admin':
                if (typeof iniciarLogicaAdmin === 'function') iniciarLogicaAdmin();
                break;
            case 'superadmin':
                if (typeof iniciarLogicaSuperAdmin === 'function') iniciarLogicaSuperAdmin();
                break;
            default:
                console.warn('Rol no reconocido:', rolNormalizado);
        }

        const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
        if (btnCerrarSesion) {
            btnCerrarSesion.addEventListener('click', () => {
                localStorage.clear();
                window.location.href = './backend/funciones.php?action=logout';
            });
        }

        const observer = new MutationObserver(() => {
            document.querySelectorAll('.pedido-card').forEach((card, i) => {
                card.style.animationDelay = `${i * 0.07}s`;
            });
        });
        const contenedor = document.getElementById('contenedor-pedidos');
        if (contenedor) observer.observe(contenedor, { childList: true });
    }
});

// ==========================================
// 3. REPARTIDOR
// ==========================================
async function iniciarLogicaRepartidor() {
    await cargarPedidosRepartidor();

    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const icon = btnRefresh.querySelector('i');
            if (icon) {
                icon.style.transition = 'transform 0.6s ease';
                icon.style.transform  = 'rotate(360deg)';
                setTimeout(() => { icon.style.transition = 'none'; icon.style.transform = 'rotate(0deg)'; }, 600);
            }
            cargarPedidosRepartidor();
        });
    }
}

async function cargarPedidosRepartidor() {
    try {
        const response = await fetch('./backend/funciones.php?action=getListos');
        const pedidos  = await response.json();
        renderizarPedidosRepartidor(pedidos);
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarPedidosRepartidor(pedidos) {
    const contenedor = document.getElementById('contenedor-pedidos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        contenedor.innerHTML = '<div class="empty-state"><span class="empty-icon">📦</span><p>Sin pedidos en camino</p></div>';
        return;
    }

    pedidos.forEach(pedido => {
        const card = document.createElement('div');
        card.className = 'pedido-card';
        card.innerHTML = `
            <div class="pedido-header">
                <span class="pedido-numero">#${pedido.ID_pedido}</span>
                <span class="pedido-estado">${pedido.Estado || 'En camino'}</span>
            </div>
            <div class="pedido-info">
                <p><strong>${pedido.c_nombre || ''} ${pedido.c_apellido || ''}</strong></p>
                <p>${pedido.Calle || ''} ${pedido.Numero || ''}, ${pedido.Localidad || ''}</p>
                <p class="pedido-total">$${parseFloat(pedido.Total).toFixed(2)}</p>
            </div>
            <button class="btn-entregar" onclick="marcarEntregado(${pedido.ID_pedido})">
                <i class="fa-solid fa-check"></i> Entregado
            </button>
        `;
        contenedor.appendChild(card);
    });
}

async function marcarEntregado(idPedido) {
    if (!confirm('¿Confirmar entrega del pedido?')) return;
    try {
        const res = await fetch('./backend/funciones.php?action=actualizarPedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idPedido, estado: 'Entregado' })
        });
        const result = await res.json();
        if (result.status === 'success') {
            mostrarMensaje('success', `Pedido #${idPedido} entregado`);
            cargarPedidosRepartidor();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (err) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

// ==========================================
// SUPERADMIN - CRUD USUARIOS
// ==========================================
async function cargarUsuarios() {
    try {
        const response = await fetch('./backend/funciones.php?action=getUsuarios');
        const result   = await response.json();

        if (result.status === 'success') {
            renderizarTablaUsuarios(result.data);
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        mostrarMensaje('error', 'Error de conexión');
    }
}

function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay usuarios registrados</td></tr>';
        return;
    }

    usuarios.forEach(usuario => {
        const rolClass = usuario.Rol.toLowerCase();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${usuario.ID_usuario}</td>
            <td>${usuario.Nombre}</td>
            <td>${usuario.Email}</td>
            <td><span class="badge-rol badge-${rolClass}">${usuario.Rol}</span></td>
            <td>
                <div class="acciones-cell">
                    <button class="btn-editar" onclick="abrirModalEditar(${usuario.ID_usuario})">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-eliminar" onclick="confirmarEliminarUsuario(${usuario.ID_usuario}, '${usuario.Nombre}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalCrear() {
    document.getElementById('modal-titulo').textContent = 'Nuevo Usuario';
    document.getElementById('usuario-id').value    = '';
    document.getElementById('usuario-nombre').value = '';
    document.getElementById('usuario-email').value  = '';
    document.getElementById('usuario-rol').value    = 'recepcionista';
    document.getElementById('usuario-password').value = '';

    const passwordGroup = document.getElementById('password-group');
    if (passwordGroup) passwordGroup.style.display = 'block';

    const modal = document.getElementById('modal-usuario');
    if (modal) modal.style.display = 'flex';
}

async function abrirModalEditar(id) {
    try {
        const response = await fetch(`./backend/funciones.php?action=getUsuario&id=${id}`);
        const result   = await response.json();

        if (result.status === 'success') {
            const u = result.data;
            document.getElementById('modal-titulo').textContent       = 'Editar Usuario';
            document.getElementById('usuario-id').value               = u.ID_usuario;
            document.getElementById('usuario-nombre').value           = u.Nombre;
            document.getElementById('usuario-email').value            = u.Email;
            document.getElementById('usuario-rol').value              = u.Rol;
            document.getElementById('usuario-password').value         = '';

            const passwordGroup = document.getElementById('password-group');
            if (passwordGroup) passwordGroup.style.display = 'block';

            const modal = document.getElementById('modal-usuario');
            if (modal) modal.style.display = 'flex';
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        mostrarMensaje('error', 'Error al cargar usuario');
    }
}

async function guardarUsuario(event) {
    event.preventDefault();

    const id       = document.getElementById('usuario-id').value;
    const nombre   = document.getElementById('usuario-nombre').value.trim();
    const email    = document.getElementById('usuario-email').value.trim();
    const rol      = document.getElementById('usuario-rol').value;
    const password = document.getElementById('usuario-password').value;

    if (!nombre || !email || !rol) {
        mostrarMensaje('error', 'Completa todos los campos requeridos');
        return;
    }

    const data = { nombre, email, rol };

    if (id) {
        data.id = parseInt(id);
        if (password) data.password = password;
    } else {
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
            cargarUsuarios();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

function confirmarEliminarUsuario(id, nombre) {
    if (confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) {
        eliminarUsuario(id);
    }
}

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
            cargarUsuarios();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

function cerrarModal() {
    const modal = document.getElementById('modal-usuario');
    if (modal) modal.style.display = 'none';
}

function iniciarLogicaSuperAdmin() {
    cargarUsuarios();

    const btnNuevo       = document.getElementById('btn-nuevo-usuario');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const formUsuario    = document.getElementById('form-usuario');

    if (btnNuevo)       btnNuevo.addEventListener('click', abrirModalCrear);
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
    if (formUsuario)    formUsuario.addEventListener('submit', guardarUsuario);

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('modal-usuario');
        if (e.target === modal) cerrarModal();
    });
}

// ==========================================
// ADMIN
// ==========================================
async function cargarEstadisticas() {
    try {
        const response = await fetch('./backend/funciones.php?action=getEstadisticas');
        const result   = await response.json();
        if (result.status === 'success') renderizarEstadisticas(result.data);
        else mostrarMensaje('error', result.message);
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarEstadisticas(stats) {
    const el = (id) => document.getElementById(id);
    if (el('stat-total-pedidos')) el('stat-total-pedidos').textContent = stats.total_pedidos || 0;
    if (el('stat-pendientes'))    el('stat-pendientes').textContent    = stats.pendientes    || 0;
    if (el('stat-en-camino'))     el('stat-en-camino').textContent     = stats.en_camino     || 0;
    if (el('stat-facturado'))     el('stat-facturado').textContent     = `$${stats.total_facturado || 0}`;
}

async function cargarTodosPedidos() {
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosTodos');
        const result   = await response.json();
        if (result.status === 'success') renderizarTablaPedidosAdmin(result.data);
        else mostrarMensaje('error', result.message);
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarTablaPedidosAdmin(pedidos) {
    const tbody = document.getElementById('tabla-pedidos-admin');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay pedidos</td></tr>';
        return;
    }

    pedidos.forEach(pedido => {
        const estadoClass = (pedido.Estado || '').toLowerCase().replace(' ', '-');
        tbody.innerHTML += `
            <tr>
                <td>#${pedido.ID_pedido}</td>
                <td>${pedido.c_nombre || ''} ${pedido.c_apellido || ''}</td>
                <td>${pedido.Calle || ''} ${pedido.Numero || ''}, ${pedido.Localidad || ''}</td>
                <td>$${parseFloat(pedido.Total).toFixed(2)}</td>
                <td><span class="badge-estado badge-${estadoClass}">${pedido.Estado}</span></td>
                <td>${pedido.fecha_creacion || 'N/A'}</td>
            </tr>
        `;
    });
}

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
// CHEF
// ==========================================
async function cargarPedidosPendientes() {
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosPendientes');
        const result   = await response.json();
        if (result.status === 'success') renderizarPedidosPendientes(result.data);
        else mostrarMensaje('error', result.message);
    } catch (error) {
        const c = document.getElementById('contenedor-pedidos-chef');
        if (c) c.innerHTML = '<p>Error al conectar con el servidor.</p>';
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
                <p><strong>Cliente:</strong> ${pedido.c_nombre || ''} ${pedido.c_apellido || ''}</p>
                <p><strong>Detalle:</strong> ${pedido.detalle || 'Sin detalles'}</p>
                <p><strong>Total:</strong> $${parseFloat(pedido.Total).toFixed(2)}</p>
            </div>
            <button class="btn-listo" data-id="${pedido.ID_pedido}">
                <i class="fa-solid fa-check"></i> Marcar como LISTO
            </button>
        `;
        contenedor.appendChild(card);
    });

    document.querySelectorAll('.btn-listo').forEach(btn => {
        btn.addEventListener('click', (e) => marcarComoListo(e.target.closest('button').dataset.id));
    });
}

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
        mostrarMensaje('error', 'Error de conexión');
    }
}

function iniciarLogicaChef() {
    cargarPedidosPendientes();

    const btnRefresh = document.getElementById('btn-refresh-chef');
    if (btnRefresh) btnRefresh.addEventListener('click', cargarPedidosPendientes);
}

// ==========================================
// UTILIDADES - TOAST DE MENSAJES
// ==========================================
function mostrarMensaje(tipo, mensaje) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `mensaje-toast mensaje-${tipo}`;
    msgDiv.innerHTML = `
        <i class="fa-solid ${tipo === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
        <span>${mensaje}</span>
    `;
    document.body.appendChild(msgDiv);

    setTimeout(() => msgDiv.classList.add('show'), 10);
    setTimeout(() => {
        msgDiv.classList.remove('show');
        setTimeout(() => msgDiv.remove(), 300);
    }, 3500);
}