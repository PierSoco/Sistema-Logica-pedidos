// ==========================================
// VARIABLES GLOBALES RECEPCIONISTA
// ==========================================
let carritoActual = [];
let totalPedidoActual = 0;
let DATA_RECEPCION = { productos: [], pedidos: [], detalles: [], restaurante: null };
let productoSeleccionadoTemporal = null;
let stepActual = 1;
let reenvioCooldown = false;
let countdownInterval = null;
const TOTAL_STEPS = 3;

// ── AUTO-RECARGA: setTimeout encadenado — UNA sola instancia activa ──
// _cicloActivo garantiza que nunca haya dos ciclos corriendo en paralelo.
// _autoReloadTimer guarda el único handle vigente; reiniciarTimer() lo
// cancela antes de crear uno nuevo, evitando acumulación de timers.
let _autoReloadTimer  = null;   // handle del único setTimeout activo
let _autoReloadBusy   = false;  // true mientras hay una fetch en vuelo
let _cicloActivo      = false;  // true desde que el ciclo arranca hasta que termina
const AUTO_RELOAD_MS  = 7000;

function reiniciarTimer() {
    // Cancela el timer pendiente (si existe) y programa uno nuevo.
    // NO inicia un ciclo nuevo si ya hay uno corriendo.
    if (_autoReloadTimer) { clearTimeout(_autoReloadTimer); _autoReloadTimer = null; }
    if (_cicloActivo) return; // el ciclo en curso ya agendará el siguiente al terminar
    _autoReloadTimer = setTimeout(_cicloRecarga, AUTO_RELOAD_MS);
}

function _detenerCiclo() {
    // Detiene completamente el ciclo (útil al cambiar de vista/rol)
    if (_autoReloadTimer) { clearTimeout(_autoReloadTimer); _autoReloadTimer = null; }
    _cicloActivo = false;
    _autoReloadBusy = false;
}

async function _cicloRecarga() {
    // Doble guarda: si el timer fue cancelado entre que se agendó y ejecuta, salir
    _autoReloadTimer = null;
    if (_cicloActivo) return;       // ya hay un ciclo corriendo, ignorar
    if (_autoReloadBusy) {          // fetch en vuelo (no debería pasar, pero por seguridad)
        _autoReloadTimer = setTimeout(_cicloRecarga, AUTO_RELOAD_MS);
        return;
    }

    _cicloActivo    = true;
    _autoReloadBusy = true;
    try {
        await autoRecargarDatos();
    } finally {
        _autoReloadBusy = false;
        _cicloActivo    = false;
        // Agendar el SIGUIENTE ciclo solo después de que éste termine
        if (!_autoReloadTimer) {  // no agendar si reiniciarTimer() ya lo hizo
            _autoReloadTimer = setTimeout(_cicloRecarga, AUTO_RELOAD_MS);
        }
    }
}

// ==========================================
// INICIO DE LÓGICA RECEPCIONISTA
// ==========================================
let _recepcionistaIniciado = false; // guarda contra doble-init

async function iniciarLogicaRecepcionista() {
    if (_recepcionistaIniciado) return; // nunca iniciar dos veces
    _recepcionistaIniciado = true;
    console.log("Cargando ecosistema de Recepción...");

    // Activar sidebar y layout de 2 columnas
    const sidebar = document.getElementById('app-sidebar');
    const wrapper = document.querySelector('.app-wrapper');
    if (sidebar) sidebar.classList.remove('hidden');
    if (wrapper) wrapper.classList.remove('no-sidebar');

    await cargarTodoRecepcion();
    document.getElementById('buscador-pedidos-gral')?.addEventListener('input', filtrarPedidosLocal);

    // Activar drop zones UNA SOLA VEZ — no dentro de renderizarTarjetas
    activarDropZones();

    // Botón de refrescar manual — registrar UNA sola vez aquí
    document.getElementById('btn-actualizar-pedidos')?.addEventListener('click', async () => {
        _detenerCiclo();                 // parar el ciclo en curso
        _lastRefreshHash = null;         // forzar recarga completa
        _lastPedidosRenderHash = null;   // forzar re-render de tabla
        await recargarPedidosActuales(); // traer datos frescos
        await actualizarResumenSidebar(); // refrescar sidebar manualmente
        reiniciarTimer();                // reiniciar ciclo limpio
    });

    // Sidebar con datos iniciales
    await actualizarResumenSidebar();

    // Auto-recarga silenciosa (un solo ciclo encadenado)
    _detenerCiclo(); // limpiar cualquier estado remanente antes de arrancar
    _autoReloadTimer = setTimeout(_cicloRecarga, AUTO_RELOAD_MS);
}

// Hash local de la última snapshot para detectar cambios
let _lastRefreshHash = null;

// Hash de los pedidos que se renderizaron por última vez.
// Si el nuevo lote de pedidos produce el mismo hash, se omite el re-render
// y se evita el parpadeo de la tabla/kanban.
let _lastPedidosRenderHash = null;

function _hashPedidos(pedidos) {
    if (!pedidos || pedidos.length === 0) return '__empty__';
    // Incluye los campos visibles en tabla y tarjetas
    return pedidos.map(p =>
        [p.ID_pedido, p.Estado, p.Total,
         p.c_nombre, p.c_apellido, p.c_telefono,
         p.Calle, p.Numero, p.Localidad, p.piso_depto,
         p.referencias, p.detalles_resumen].join('|')
    ).join('§');
}

// Recarga silenciosa: UNA sola fetch a getRefreshData.
// Si el hash del servidor coincide con el local → sin cambios → no renderiza nada.
async function autoRecargarDatos() {
    try {
        const panelHist  = document.getElementById('panel-historial-recepcionista');
        const histVisible = panelHist && !panelHist.classList.contains('hidden') && HISTORIAL_STATE.cargado;
        const url = './backend/funciones.php?action=getRefreshData'
            + '&hash=' + encodeURIComponent(_lastRefreshHash || '')
            + '&historial=' + (histVisible ? '1' : '0');

        const res    = await fetch(url);
        const result = await res.json();
        if (result.status !== 'success') return;

        // Sin cambios: el backend devuelve changed:false → no hacer nada
        if (!result.data.changed) return;

        // Guardar nuevo hash
        _lastRefreshHash = result.data.hash;

        // 1. Pedidos actuales — solo re-renderizar si los datos cambiaron realmente
        if (result.data.pedidos !== undefined) {
            const nuevoPedidosHash = _hashPedidos(result.data.pedidos);
            if (nuevoPedidosHash !== _lastPedidosRenderHash) {
                _lastPedidosRenderHash = nuevoPedidosHash;
                DATA_RECEPCION.pedidos = result.data.pedidos;
                renderizarTablaPedidosRecepcion(result.data.pedidos);
                const badge = document.getElementById('badge-actuales');
                if (badge) badge.textContent = result.data.pedidos.length;
            }
        }

        // 2. Historial (solo si fue solicitado y está visible)
        if (result.data.historial !== undefined) {
            HISTORIAL_STATE.todos = result.data.historial.pedidos;
            actualizarStatsHistorial(result.data.historial.stats);
            historialFiltrar();
        }

        // 3. Sidebar
        if (result.data.resumen !== undefined) {
            _actualizarSidebarConDatos(result.data.resumen);
        }

        // 4. Indicador visual
        marcarUltimaActualizacion();

    } catch(e) { /* fallo silencioso */ }
}

// Aplica datos de resumen al sidebar sin fetch adicional
function _actualizarSidebarConDatos(d) {
    const el1      = document.getElementById('sb-entregados');
    const el2      = document.getElementById('sb-facturado');
    const el1label = document.getElementById('sb-entregados-label');
    const el2label = document.getElementById('sb-facturado-label');
    const hayHoy   = d.entregados_hoy > 0 || parseFloat(d.facturado_hoy) > 0;

    if (el1) el1.textContent = hayHoy ? d.entregados_hoy : d.entregados_total;
    if (el1label) el1label.textContent = hayHoy ? 'Hoy · Entregados' : 'Total · Entregados';

    const facturado = hayHoy ? parseFloat(d.facturado_hoy) : parseFloat(d.facturado_total);
    if (el2) {
        el2.textContent = '$' + facturado.toLocaleString('es-AR', {minimumFractionDigits:0, maximumFractionDigits:0});
    }
    if (el2label) el2label.textContent = hayHoy ? 'Hoy · Facturado' : 'Total · Facturado';

    const badge = document.getElementById('badge-actuales');
    if (badge && d.activos !== undefined) badge.textContent = d.activos;
}

// Recarga silenciosa del historial (usada por recarga manual del historial)
async function recargarHistorialSilencioso() {
    try {
        const res    = await fetch('./backend/funciones.php?action=getHistorialPedidos');
        const result = await res.json();
        if (result.status !== 'success') return;
        HISTORIAL_STATE.todos = result.data.pedidos;
        actualizarStatsHistorial(result.data.stats);
        historialFiltrar();
    } catch(e) { /* fallo silencioso */ }
}

function filtrarPedidosLocal(e) {
    const busqueda = e.target.value.toLowerCase().trim();

    // Vista tabla — filtrar filas
    document.querySelectorAll('.pedido-fila').forEach(fila => {
        fila.style.display = fila.innerText.toLowerCase().includes(busqueda) ? '' : 'none';
    });

    // Vista tarjetas (kanban) — filtrar cards por data-busqueda
    document.querySelectorAll('#contenedor-vista-tarjetas .pedido-card-item').forEach(card => {
        const texto = card.dataset.busqueda || card.innerText.toLowerCase();
        card.style.display = (!busqueda || texto.includes(busqueda)) ? '' : 'none';
    });

    // Actualizar estado "vacío" de cada columna kanban
    ['pendiente', 'preparando', 'encamino'].forEach(col => {
        const body = document.getElementById(`kanban-body-${col}`);
        if (!body) return;
        const cards = body.querySelectorAll('.pedido-card-item');
        const hayVisibles = Array.from(cards).some(c => c.style.display !== 'none');
        let empty = body.querySelector('.kanban-col-empty');
        if (!hayVisibles) {
            if (!empty) {
                empty = document.createElement('div');
                empty.className = 'kanban-col-empty kanban-search-empty';
                empty.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>Sin resultados';
                body.appendChild(empty);
            }
        } else {
            if (empty && empty.classList.contains('kanban-search-empty')) empty.remove();
        }
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
            DATA_RECEPCION.productos   = result.data.productos;
            DATA_RECEPCION.pedidos     = result.data.pedidos;
            DATA_RECEPCION.detalles    = result.data.detalles;
            DATA_RECEPCION.restaurante = result.data.restaurante || null;
            renderizarTablaPedidosRecepcion(DATA_RECEPCION.pedidos);

            // Badge sidebar
            const badge = document.getElementById('badge-actuales');
            if (badge) badge.textContent = DATA_RECEPCION.pedidos.length;
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
            _lastPedidosRenderHash = null;   // garantizar re-render forzado
            renderizarTablaPedidosRecepcion(result.data);
            const badge = document.getElementById('badge-actuales');
            if (badge) badge.textContent = result.data.length;
            // Invalidar hash para que el próximo ciclo auto traiga datos frescos del servidor
            _lastRefreshHash = null;
        }
    } catch (err) { console.error("Error recargando pedidos:", err); }
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
// Vista activa: 'tabla' | 'tarjetas'
let VISTA_ACTUAL = 'tabla';
// Controla si las tarjetas deben animarse (solo al cambiar de vista, no en auto-recarga)
let ANIMAR_TARJETAS = false;

// ── TOGGLE ──────────────────────────────
function cambiarVistaTabla(vista) {
    VISTA_ACTUAL = vista;
    // Solo animar cuando el usuario cambia explícitamente a la vista tarjetas
    ANIMAR_TARJETAS = (vista === 'tarjetas');

    const contTabla    = document.getElementById('contenedor-vista-tabla');
    const contTarjetas = document.getElementById('contenedor-vista-tarjetas');
    const btnTabla     = document.getElementById('btn-vista-tabla');
    const btnTarjetas  = document.getElementById('btn-vista-tarjetas');

    if (vista === 'tabla') {
        if (contTabla)    contTabla.style.display    = '';
        if (contTarjetas) contTarjetas.style.display = 'none';
        btnTabla?.classList.add('active');
        btnTarjetas?.classList.remove('active');
    } else {
        if (contTabla)    contTabla.style.display    = 'none';
        if (contTarjetas) contTarjetas.style.display = '';
        btnTabla?.classList.remove('active');
        btnTarjetas?.classList.add('active');
    }

    // Re-renderizar con los datos actuales en la vista nueva
    renderizarTablaPedidosRecepcion(DATA_RECEPCION.pedidos);
    // Después del primer render al cambiar vista, desactivar animaciones para recargas
    ANIMAR_TARJETAS = false;
}

// ── DISPATCHER ──────────────────────────
function renderizarTablaPedidosRecepcion(pedidos) {
    if (VISTA_ACTUAL === 'tarjetas') {
        renderizarTarjetas(pedidos);
    } else {
        renderizarTabla(pedidos);
    }
}

// ── VISTA TABLA ──────────────────────────
// ── VISTA TABLA ──────────────────────────
function renderizarTabla(pedidos) {
    const tbody = document.querySelector('#tabla-pedidos-recepcion tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-3);">
            <i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;opacity:.4;"></i>
            No hay pedidos activos</td></tr>`;
        return;
    }

    const estados = [
        { value: 'Pendiente', label: '⏳ Pendiente' },
        { value: 'Preparando', label: '👨‍🍳 Preparando' },
        { value: 'En camino', label: '🛵 En camino' },
        { value: 'Entregado', label: '✅ Entregado' },
        { value: 'Cancelado', label: '❌ Cancelado' }
    ];

    pedidos.forEach(p => {
        const piso = p.piso_depto  ? ` · <em style="color:var(--text-3)">${p.piso_depto}</em>` : '';
        const ref  = p.referencias ? `<br><small style="color:var(--text-3)">📌 ${p.referencias}</small>` : '';

        const tr = document.createElement('tr');
        tr.className = 'pedido-fila';
        tr.title = `Ver detalle del pedido #${p.ID_pedido}`;

        // Click en la fila abre el detalle
        tr.addEventListener('click', () => verDetallePedido(p.ID_pedido));

        // Construir select con opciones
        const selectHTML = `<select class="select-estado" onchange="cambiarEstadoPedido(${p.ID_pedido}, this.value, this)">
            ${estados.map(e => `<option value="${e.value}" ${p.Estado === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
        </select>`;

        tr.innerHTML = `
            <td>
                <strong class="hist-id">#${p.ID_pedido}</strong>
            </td>
            <td>
                <div class="hist-cliente-nombre">${escapeHtml(p.c_nombre)} ${escapeHtml(p.c_apellido)}</div>
                <div class="hist-cliente-tel">
                    <i class="fa-solid fa-phone" style="font-size:.62rem;margin-right:3px;"></i>
                    ${escapeHtml(p.c_telefono || '—')}
                </div>
            </td>
            <td>
                <div class="hist-dir">${escapeHtml(p.Calle)} ${escapeHtml(p.Numero)}${piso}</div>
                <div class="hist-dir"><small>${escapeHtml(p.Localidad || '')}${ref}</small></div>
            </td>
            <td>
                <div class="hist-productos" title="${escapeHtml(p.detalles_resumen || '')}">${escapeHtml(p.detalles_resumen || '—')}</div>
            </td>
            <td>
                <span class="hist-total">$${parseFloat(p.Total).toFixed(2)}</span>
            </td>
            <td onclick="event.stopPropagation()">
                ${selectHTML}
            </td>
            <td onclick="event.stopPropagation()">
                <button class="hist-btn-ver" title="Ver detalle" onclick="verDetallePedido(${p.ID_pedido})">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button class="btn-icon btn-danger" title="Cancelar" onclick="confirmarCancelarPedido(${p.ID_pedido})">
                    <i class="fa-solid fa-ban"></i>
                </button>
            </td>`;

        tbody.appendChild(tr);
    });
}

// Función de ayuda para escapar HTML y prevenir XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── VISTA TARJETAS — KANBAN ──────────────
function renderizarTarjetas(pedidos) {
    const bodyPendiente  = document.getElementById('kanban-body-pendiente');
    const bodyPreparando = document.getElementById('kanban-body-preparando');
    const bodyEncamino   = document.getElementById('kanban-body-encamino');
    if (!bodyPendiente) return;

    // Limpiar columnas
    bodyPendiente.innerHTML  = '';
    bodyPreparando.innerHTML = '';
    bodyEncamino.innerHTML   = '';

    const EMPTY_HTML = `<div class="kanban-col-empty"><i class="fa-solid fa-inbox"></i>Sin pedidos</div>`;

    if (!pedidos || pedidos.length === 0) {
        bodyPendiente.innerHTML  = EMPTY_HTML;
        bodyPreparando.innerHTML = EMPTY_HTML;
        bodyEncamino.innerHTML   = EMPTY_HTML;
        document.getElementById('kanban-badge-pendiente').textContent  = '0';
        document.getElementById('kanban-badge-preparando').textContent = '0';
        document.getElementById('kanban-badge-encamino').textContent   = '0';
        return;
    }

    const emoji = { Pendiente:'⏳', Preparando:'👨‍🍳', 'En camino':'🛵', Entregado:'✅', Cancelado:'❌' };

    const cols = { Pendiente: [], Preparando: [], 'En camino': [] };

    pedidos.forEach(p => {
        if (cols[p.Estado] !== undefined) cols[p.Estado].push(p);
        // Entregado/Cancelado no se muestran en tarjetas activas
    });

    // Actualizar badges
    document.getElementById('kanban-badge-pendiente').textContent  = cols['Pendiente'].length;
    document.getElementById('kanban-badge-preparando').textContent = cols['Preparando'].length;
    document.getElementById('kanban-badge-encamino').textContent   = cols['En camino'].length;

    // Renderizar cada columna
    const renderCol = (lista, container, animOffset) => {
        if (lista.length === 0) { container.innerHTML = EMPTY_HTML; return; }
        lista.forEach((p, idx) => {
            const estadoCls = (p.Estado || '').toLowerCase().replace(' ', '-');
            const piso      = p.piso_depto  ? ` · ${p.piso_depto}`  : '';
            const ref       = p.referencias ? `<br><small>📌 ${p.referencias}</small>` : '';
            const total     = parseFloat(p.Total).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});

            // Texto buscable como atributo data para filtrado
            const textoBusqueda = [
                '#' + p.ID_pedido,
                p.c_nombre, p.c_apellido, p.c_telefono,
                p.Calle, p.Numero, p.Localidad,
                p.detalles_resumen
            ].join(' ').toLowerCase();

            const card = document.createElement('div');
            card.className      = 'pedido-card-item' + (ANIMAR_TARJETAS ? '' : ' no-anim');
            card.dataset.estado = p.Estado;
            card.dataset.busqueda = textoBusqueda;
            card.title = `Ver detalle del pedido #${p.ID_pedido}`;
            if (ANIMAR_TARJETAS) {
                card.style.animationDelay = `${(animOffset + idx) * 0.04}s`;
            }

            card.innerHTML = `
                <div class="pc-header">
                    <span class="pc-id">#${p.ID_pedido}</span>
                    <span class="pc-estado ${estadoCls}">${emoji[p.Estado] || '•'} ${p.Estado}</span>
                </div>
                <div class="pc-body pc-body-grow">
                    <div class="pc-row">
                        <span class="pc-row-icon"><i class="fa-solid fa-user"></i></span>
                        <div class="pc-row-text">
                            <strong>${p.c_nombre} ${p.c_apellido}</strong>
                            <br><small><i class="fa-solid fa-phone" style="font-size:.58rem;"></i> ${p.c_telefono || '—'}</small>
                        </div>
                    </div>
                    <div class="pc-row">
                        <span class="pc-row-icon"><i class="fa-solid fa-location-dot"></i></span>
                        <div class="pc-row-text">
                            <strong>${p.Calle} ${p.Numero}${piso}</strong>
                            ${p.Localidad ? `<br><small>${p.Localidad}</small>` : ''}${ref}
                        </div>
                    </div>
                    ${p.detalles_resumen ? `
                    <div class="pc-row">
                        <span class="pc-row-icon"><i class="fa-solid fa-utensils"></i></span>
                        <div class="pc-row-text" style="font-size:.76rem;">${p.detalles_resumen}</div>
                    </div>` : ''}
                </div>
                <div class="pc-footer pc-footer-sticky">
                    <select class="pc-select-estado"
                            data-estado-original="${p.Estado}"
                            onchange="cambiarEstadoPedido(${p.ID_pedido}, this.value, this)"
                            onclick="event.stopPropagation()">
                        <option value="Pendiente"  ${p.Estado==='Pendiente'  ?'selected':''}>⏳ Pendiente</option>
                        <option value="Preparando" ${p.Estado==='Preparando' ?'selected':''}>👨‍🍳 Preparando</option>
                        <option value="En camino"  ${p.Estado==='En camino'  ?'selected':''}>🛵 En camino</option>
                        <option value="Entregado"  ${p.Estado==='Entregado'  ?'selected':''}>✅ Entregado</option>
                        <option value="Cancelado"  ${p.Estado==='Cancelado'  ?'selected':''}>❌ Cancelado</option>
                    </select>
                    <span class="pc-total">$${total}</span>
                    <div class="pc-actions" onclick="event.stopPropagation()">
                        <button class="pc-btn danger" title="Cancelar"
                                onclick="confirmarCancelarPedido(${p.ID_pedido})">
                            <i class="fa-solid fa-ban"></i>
                        </button>
                    </div>
                </div>`;

            card.addEventListener('click', () => verDetallePedido(p.ID_pedido));
            // Activar drag & drop en la tarjeta
            activarDragCard(card, p.ID_pedido, p.Estado);
            container.appendChild(card);
        });
    };

    renderCol(cols['Pendiente'],  bodyPendiente,  0);
    renderCol(cols['Preparando'], bodyPreparando, cols['Pendiente'].length);
    renderCol(cols['En camino'],  bodyEncamino,   cols['Pendiente'].length + cols['Preparando'].length);
    // Las drop zones se activan UNA SOLA VEZ desde iniciarLogicaRecepcionista()
    // NO llamar activarDropZones() aquí para evitar listener duplicados.
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
            _lastRefreshHash = null; // forzar recarga completa en próximo ciclo
            await recargarPedidosActuales();
            reiniciarTimer();
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
    document.getElementById('detalle-pedido-titulo').innerHTML = `
        <span class="titulo-pedido-texto">Pedido</span>
        <span class="titulo-pedido-id"># ${idPedido}</span>
    `;
    document.getElementById('detalle-pedido-contenido').innerHTML =
        '<p style="text-align:center;color:var(--text-3);padding:40px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';
    modal.classList.add('visible');

    try {
        const res = await fetch(`./backend/funciones.php?action=getPedido&id=${idPedido}`);
        const result = await res.json();
        if (result.status !== 'success') { mostrarMensaje('error','No se pudo cargar el pedido'); return; }

        const p = result.data;
        const piso = p.piso_depto ? ` · ${p.piso_depto}` : '';
        const ref  = p.referencias ? `<br><span style="font-size:12px;color:var(--text-3);">📌 ${p.referencias}</span>` : '';
        const itemsHTML = (p.items||[]).map(item => `
            <tr>
                <td>${item.nombre}</td>
                <td style="text-align:center;font-weight:600;">${item.Cantidad}</td>
                <td style="text-align:right;">$${parseFloat(item.Precio).toFixed(2)}</td>
                <td style="text-align:right;font-weight:700;color:var(--teal);">$${parseFloat(item.Subtotal).toFixed(2)}</td>
            </tr>`).join('');

        document.getElementById('detalle-pedido-contenido').innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-card">
                    <p class="detalle-card-title"><i class="fa-solid fa-user"></i> Cliente</p>
                    <p><strong>${p.c_nombre} ${p.c_apellido}</strong></p>
                    <p><i class="fa-solid fa-phone" style="font-size:11px;color:var(--text-3);"></i> ${p.c_telefono || '—'}</p>
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
                <tbody>${itemsHTML || '<tr><td colspan="4" style="text-align:center;color:var(--text-3);">Sin productos</td></tr>'}</tbody>
            </table>
            <div class="total-bar" style="margin-top:16px;">
                <span class="total-bar-label">Total del pedido</span>
                <span class="total-bar-amount" style="color:var(--teal);">$${parseFloat(p.Total).toFixed(2)}</span>
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
        if (result.status==='success') {
            mostrarMensaje('success',result.message);
            _lastRefreshHash = null;
            await recargarPedidosActuales();
            reiniciarTimer();
        }
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
            _lastRefreshHash = null;
            await recargarPedidosActuales();
            reiniciarTimer();
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
            // El backend/login.php ya guardó todo en $_SESSION.
            // Solo guardamos en localStorage lo mínimo para la UI
            // (sin id_restaurante en claro — lo obtenemos del servidor en cada carga).
            showInit(result.rol, result.nombre, result.email || '', result.restaurante_nombre || null);
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

function showInit(rol, nombre, email, restaurante_nombre) {
    localStorage.setItem('user_nombre', nombre.trim());
    localStorage.setItem('user_rol',    rol.trim());
    if (email)              localStorage.setItem('user_email',            email.trim());
    if (restaurante_nombre) localStorage.setItem('user_restaurante_nombre', restaurante_nombre.trim());
    else                    localStorage.removeItem('user_restaurante_nombre');
    window.location.href = 'dashboard.html';
}

// ==========================================
// USER DROPDOWN & PERFIL
// ==========================================

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const btn      = document.getElementById('user-badge-btn');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        cerrarUserMenu();
    } else {
        dropdown.classList.add('open');
        btn?.setAttribute('aria-expanded', 'true');
    }
}

function cerrarUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const btn      = document.getElementById('user-badge-btn');
    dropdown?.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
}

function abrirModalPerfil() {
    cerrarUserMenu();

    const nombre      = localStorage.getItem('user_nombre')             || '—';
    const rol         = localStorage.getItem('user_rol')                || '—';
    const email       = localStorage.getItem('user_email')              || '—';
    const restaurante = localStorage.getItem('user_restaurante_nombre') || 'Sin asignar';
    const inicial     = nombre.charAt(0).toUpperCase();

    const rolFmt = rol.charAt(0).toUpperCase() + rol.slice(1).toLowerCase();

    // Llenar hero
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('perfil-avatar-big',  inicial);
    set('perfil-nombre-big',  nombre);
    set('perfil-rol-pill',    rolFmt.toUpperCase());

    // Llenar campos del drawer
    set('pf-nombre',      nombre);
    set('pf-email',       email);
    set('pf-rol',         rolFmt);
    set('pf-restaurante', restaurante);

    // También actualizar el dropdown por si se abrió antes de que cargara
    poblarUserDropdown(nombre, rol, email, restaurante !== 'Sin asignar' ? restaurante : null);

    // Abrir drawer
    document.getElementById('perfil-drawer')?.classList.add('open');
    document.getElementById('perfil-backdrop')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarModalPerfil() {
    document.getElementById('perfil-drawer')?.classList.remove('open');
    document.getElementById('perfil-backdrop')?.classList.remove('open');
    document.body.style.overflow = '';
}

// Poblar el dropdown y drawer de perfil con datos del usuario
function poblarUserDropdown(nombre, rol, email, restaurante_nombre) {
    const inicial = (nombre || '?').charAt(0).toUpperCase();

    // Header badge
    const avatarEl = document.getElementById('avatar-inicial');
    if (avatarEl) avatarEl.textContent = inicial;

    // Dropdown
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('udrop-avatar',   inicial);
    set('udrop-nombre',   nombre || '—');
    set('udrop-email',    email  || '—');
    set('udrop-rol',      (rol   || '—').toUpperCase());

    // Sub-label de restaurante en el dropdown (si existe el elemento)
    const subRestEl = document.getElementById('udrop-restaurante');
    if (subRestEl) subRestEl.textContent = restaurante_nombre || 'Sin restaurante';
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('user-menu-wrap');
    if (wrap && !wrap.contains(e.target)) cerrarUserMenu();
});

// Cerrar modal perfil con Escape (complementa el listener global)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModalPerfil();
});

// ==========================================
// 2. LÓGICA DE DASHBOARD
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const headerNombre = document.getElementById('header-nombre');
    if (!headerNombre) return;

    // Por defecto el wrapper no tiene sidebar (1 columna)
    const wrapper = document.querySelector('.app-wrapper');
    if (wrapper) wrapper.classList.add('no-sidebar');

    // ── Validar sesión contra el servidor ────────────────────────────────
    // getSessionData verifica la cookie de sesión PHP, devuelve datos frescos
    // del usuario (incluido restaurante_nombre) y redirige si la sesión expiró.
    let sesion = null;
    try {
        const res    = await fetch('./backend/funciones.php?action=getSessionData');
        const result = await res.json();
        if (result.status !== 'success') {
            // Sesión inválida o expirada → volver al login
            localStorage.clear();
            window.location.href = 'login.html';
            return;
        }
        sesion = result.data;
    } catch (e) {
        // Sin red — intentar con localStorage como fallback visual
        const rolLS = localStorage.getItem('user_rol');
        if (!rolLS) { window.location.href = 'login.html'; return; }
        sesion = {
            rol:                rolLS,
            nombre:             localStorage.getItem('user_nombre') || '—',
            email:              localStorage.getItem('user_email')  || '',
            restaurante_nombre: localStorage.getItem('user_restaurante_nombre') || null,
            id_restaurante:     null,
        };
    }

    // ── Sincronizar localStorage con datos frescos del servidor ──────────
    localStorage.setItem('user_nombre', sesion.nombre);
    localStorage.setItem('user_rol',    sesion.rol);
    if (sesion.email)              localStorage.setItem('user_email',             sesion.email);
    if (sesion.restaurante_nombre) localStorage.setItem('user_restaurante_nombre', sesion.restaurante_nombre);
    else                           localStorage.removeItem('user_restaurante_nombre');

    // ── Poblar UI de header y dropdown ──────────────────────────────────
    const avatarInicial = document.getElementById('avatar-inicial');
    const headerRol     = document.getElementById('header-rol');

    headerNombre.textContent = sesion.nombre;
    if (avatarInicial) avatarInicial.textContent = sesion.nombre.charAt(0).toUpperCase();
    if (headerRol)     headerRol.textContent     = sesion.rol.toUpperCase();

    poblarUserDropdown(sesion.nombre, sesion.rol, sesion.email, sesion.restaurante_nombre);

    // ── Mostrar panel del rol ────────────────────────────────────────────
    const rolNormalizado = sesion.rol.trim().toLowerCase();
    const panelId        = `panel-${rolNormalizado}`;
    const panelActivo    = document.getElementById(panelId);
    if (panelActivo) panelActivo.classList.remove('hidden');
    else console.error(`No se encontró el panel: ${panelId}`);

    // ── Iniciar lógica del rol ───────────────────────────────────────────
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

    // ── Logout ───────────────────────────────────────────────────────────
    document.getElementById('btn-cerrar-sesion')?.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = './backend/funciones.php?action=logout';
    });

    // ── Animación de cards (observer de repartidor/chef) ─────────────────
    const observer = new MutationObserver(() => {
        document.querySelectorAll('.pedido-card').forEach((card, i) => {
            card.style.animationDelay = `${i * 0.07}s`;
        });
    });
    const contenedor = document.getElementById('contenedor-pedidos');
    if (contenedor) observer.observe(contenedor, { childList: true });
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
            SA_STATE.todos     = result.data;
            SA_STATE.filtrados = result.data;
            renderizarTablaUsuarios(result.data);
            const cnt = document.getElementById('sa-usuarios-count');
            if (cnt) cnt.textContent = `${result.data.length} usuario${result.data.length !== 1 ? 's' : ''}`;
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
        tbody.innerHTML = '<tr><td colspan="7" class="hist-loading"><i class="fa-regular fa-folder-open" style="margin-right:8px;"></i>No se encontraron usuarios.</td></tr>';
        return;
    }

    usuarios.forEach((usuario, idx) => {
        const rolClass = (usuario.Rol || '').toLowerCase();
        const rolEmoji = { superadmin:'👑', admin:'🏪', recepcionista:'📋', chef:'👨‍🍳', repartidor:'🛵' }[rolClass] || '•';
        const restaurante = usuario.restaurante_nombre || '—';
        const fecha = usuario.fecha_creacion
            ? new Date(usuario.fecha_creacion).toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'numeric'})
            : '—';

        const tr = document.createElement('tr');
        tr.style.animationDelay = `${idx * 0.025}s`;
        tr.innerHTML = `
            <td style="color:var(--text-3);font-size:.75rem;font-weight:600;">${usuario.ID_usuario}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--amber),#e84393);display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-weight:700;font-size:0.72rem;color:#fff;flex-shrink:0;">
                        ${(usuario.Nombre||'?').charAt(0).toUpperCase()}
                    </div>
                    <span style="font-weight:600;color:var(--text);">${escapeHtml(usuario.Nombre||'')}</span>
                </div>
            </td>
            <td style="color:var(--text-2);font-size:.82rem;">${escapeHtml(usuario.Email||'')}</td>
            <td><span class="badge-rol badge-${rolClass}">${rolEmoji} ${usuario.Rol||''}</span></td>
            <td style="color:var(--text-2);font-size:.8rem;">${escapeHtml(restaurante)}</td>
            <td style="color:var(--text-3);font-size:.75rem;">${fecha}</td>
            <td>
                <div class="acciones-cell" style="display:flex;gap:6px;">
                    <button class="btn-icon" title="Editar" onclick="abrirModalEditar(${usuario.ID_usuario})">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon btn-danger" title="Eliminar" onclick="confirmarEliminarUsuario(${usuario.ID_usuario}, '${escapeHtml(usuario.Nombre||'')}')">
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

// ==========================================
// SUPERADMIN — ESTADO GLOBAL
// ==========================================
const SA_STATE = {
    todos:     [],       // todos los usuarios
    filtrados: [],
    filtroRest: '',      // ID restaurante seleccionado ('' = todos)
};

function iniciarLogicaSuperAdmin() {
    cargarUsuarios();
    cargarRestaurantesSuperadmin();
    cargarStatsSuperadmin();

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

async function cargarRestaurantesSuperadmin() {
    try {
        const res = await fetch('./backend/funciones.php?action=getRestaurantes');
        const r   = await res.json();
        if (r.status !== 'success') return;

        const sel = document.getElementById('sa-filtro-restaurante');
        if (!sel) return;

        r.data.forEach(rest => {
            const opt = document.createElement('option');
            opt.value = rest.ID_Restaurante;
            opt.textContent = rest.Nombre_local + (rest.Localidad ? ` · ${rest.Localidad}` : '');
            sel.appendChild(opt);
        });
    } catch(e) { /* silencioso */ }
}

async function cargarStatsSuperadmin() {
    try {
        const res = await fetch('./backend/funciones.php?action=getSuperadminStats');
        const r   = await res.json();
        if (r.status !== 'success') return;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('sa-stat-restaurantes', r.data.restaurantes);
        set('sa-stat-usuarios',     r.data.usuarios);
        set('sa-stat-activos',      r.data.activos);
    } catch(e) { /* silencioso */ }
}

function superadminFiltrarRestaurante() {
    SA_STATE.filtroRest = document.getElementById('sa-filtro-restaurante')?.value || '';
    superadminFiltrarUsuarios();
}

function superadminFiltrarUsuarios() {
    const q     = (document.getElementById('sa-buscador-usuarios')?.value || '').toLowerCase().trim();
    const rol   = (document.getElementById('sa-filtro-rol')?.value || '').toLowerCase();
    const rest  = SA_STATE.filtroRest;

    let lista = [...SA_STATE.todos];

    if (q) {
        lista = lista.filter(u => {
            return [u.Nombre, u.Email, u.Rol, u.restaurante_nombre].join(' ').toLowerCase().includes(q);
        });
    }
    if (rol) lista = lista.filter(u => (u.Rol || '').toLowerCase() === rol);
    if (rest) lista = lista.filter(u => String(u.ID_restaurante) === String(rest));

    SA_STATE.filtrados = lista;
    renderizarTablaUsuarios(lista);
    const cnt = document.getElementById('sa-usuarios-count');
    if (cnt) cnt.textContent = `${lista.length} usuario${lista.length !== 1 ? 's' : ''} encontrado${lista.length !== 1 ? 's' : ''}`;
}

// ==========================================
// ADMIN — ESTADO GLOBAL
// ==========================================
const ADMIN_STATE = {
    todos:        [],
    filtrados:    [],
    paginaActual: 1,
    porPagina:    30,
    sortCol:      'id',
    sortDir:      'desc',
};

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
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const fmt = (n) => '$' + parseFloat(n).toLocaleString('es-AR', {minimumFractionDigits:0, maximumFractionDigits:0});

    set('stat-total-pedidos', stats.total_pedidos || 0);
    set('stat-pendientes',    stats.pendientes    || 0);
    set('stat-en-camino',     stats.en_camino     || 0);
    set('stat-cancelados',    stats.cancelados    || 0);
    set('stat-facturado',     fmt(stats.total_facturado || 0));
    set('stat-ticket-prom',   '$' + parseFloat(stats.ticket_promedio || 0).toLocaleString('es-AR', {minimumFractionDigits:0}));

    set('stat-pedidos-hoy',       (stats.pedidos_hoy    || 0) + ' hoy');
    set('stat-preparando-cnt',    (stats.preparando     || 0) + ' preparando');
    set('stat-entregados-hoy-cnt',(stats.entregados_hoy || 0) + ' entregados hoy');
    set('stat-facturado-hoy',     fmt(stats.facturado_hoy || 0) + ' hoy');

    // Indicador actualización
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
    const lbl   = document.getElementById('admin-ultima-act');
    const ind   = document.getElementById('admin-reload-ind');
    if (lbl) lbl.textContent = `Act. ${hora}`;
    if (ind) { ind.classList.add('pulsing'); setTimeout(() => ind.classList.remove('pulsing'), 2000); }
}

async function cargarTodosPedidos() {
    const tbody = document.getElementById('tabla-pedidos-admin');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="hist-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
        const response = await fetch('./backend/funciones.php?action=getPedidosTodos');
        const result   = await response.json();
        if (result.status === 'success') {
            ADMIN_STATE.todos = result.data;
            adminFiltrar();
        } else {
            mostrarMensaje('error', result.message);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

function adminFiltrar() {
    const q      = (document.getElementById('admin-buscador')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('admin-filtro-estado')?.value || '';
    const fecha  = document.getElementById('admin-filtro-fecha')?.value  || '';

    let lista = [...ADMIN_STATE.todos];

    if (q) {
        lista = lista.filter(p => {
            const txt = ['#'+p.ID_pedido, p.c_nombre, p.c_apellido, p.c_telefono, p.Calle, p.Numero, p.Localidad, p.detalles_resumen].join(' ').toLowerCase();
            return txt.includes(q);
        });
    }
    if (estado) lista = lista.filter(p => p.Estado === estado);

    if (fecha) {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        lista = lista.filter(p => {
            if (!p.fecha_raw) return true;
            const d = new Date(p.fecha_raw);
            if (fecha === 'hoy') return d >= hoy;
            if (fecha === 'semana') {
                const semana = new Date(hoy); semana.setDate(hoy.getDate() - hoy.getDay());
                return d >= semana;
            }
            if (fecha === 'mes') {
                const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                return d >= mes;
            }
            return true;
        });
    }

    // Sort
    lista.sort((a, b) => {
        let va, vb;
        if (ADMIN_STATE.sortCol === 'id')    { va = a.ID_pedido;           vb = b.ID_pedido; }
        if (ADMIN_STATE.sortCol === 'total') { va = parseFloat(a.Total);   vb = parseFloat(b.Total); }
        if (ADMIN_STATE.sortCol === 'fecha') { va = a.fecha_raw || '';      vb = b.fecha_raw || ''; }
        if (va < vb) return ADMIN_STATE.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return ADMIN_STATE.sortDir === 'asc' ?  1 : -1;
        return 0;
    });

    ADMIN_STATE.filtrados    = lista;
    ADMIN_STATE.paginaActual = 1;
    adminRenderizarPagina();
}

function adminSort(col) {
    if (ADMIN_STATE.sortCol === col) {
        ADMIN_STATE.sortDir = ADMIN_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        ADMIN_STATE.sortCol = col;
        ADMIN_STATE.sortDir = 'desc';
    }
    // Actualizar iconos
    document.querySelectorAll('#tabla-pedidos-admin-main thead th[data-col]').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (th.dataset.col === col) {
            icon.className = `fa-solid fa-sort-${ADMIN_STATE.sortDir === 'asc' ? 'up' : 'down'} sort-icon`;
        } else {
            icon.className = 'fa-solid fa-sort sort-icon';
        }
    });
    adminFiltrar();
}

function adminReset() {
    const b = document.getElementById('admin-buscador');
    const s = document.getElementById('admin-filtro-estado');
    const f = document.getElementById('admin-filtro-fecha');
    if (b) b.value = '';
    if (s) s.value = '';
    if (f) f.value = '';
    ADMIN_STATE.sortCol = 'id'; ADMIN_STATE.sortDir = 'desc';
    adminFiltrar();
}

function adminRenderizarPagina() {
    const { filtrados, paginaActual, porPagina } = ADMIN_STATE;
    const total     = filtrados.length;
    const totalPags = Math.max(1, Math.ceil(total / porPagina));
    const desde     = (paginaActual - 1) * porPagina;
    const hasta     = Math.min(desde + porPagina, total);
    const pagina    = filtrados.slice(desde, hasta);

    const countEl = document.getElementById('admin-count-label');
    if (countEl) countEl.textContent = total === 0 ? 'Sin resultados' : `${total} pedido${total !== 1 ? 's' : ''} · Mostrando ${desde+1}–${hasta}`;

    const tbody = document.getElementById('tabla-pedidos-admin');
    if (!tbody) return;

    if (pagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="hist-loading"><i class="fa-regular fa-folder-open" style="margin-right:8px;"></i>Sin pedidos con esos filtros.</td></tr>';
        document.getElementById('admin-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = pagina.map(p => {
        const estadoCls = (p.Estado || '').toLowerCase().replace(' ', '-');
        const estadoEmoji = {'pendiente':'⏳','preparando':'👨‍🍳','en-camino':'🛵','entregado':'✅','cancelado':'❌'}[estadoCls] || '•';
        const piso = p.piso_depto ? ` <small>· ${escapeHtml(p.piso_depto)}</small>` : '';
        const loc  = p.Localidad  ? `<br><small style="color:var(--text-3)">${escapeHtml(p.Localidad)}</small>` : '';
        return `<tr class="hist-row-clickable" onclick="verDetallePedido(${p.ID_pedido})" title="Ver pedido #${p.ID_pedido}">
            <td><span class="hist-id">#${p.ID_pedido}</span></td>
            <td>
                <div class="hist-cliente-nombre">${escapeHtml(p.c_nombre||'')} ${escapeHtml(p.c_apellido||'')}</div>
                <div class="hist-cliente-tel"><i class="fa-solid fa-phone" style="font-size:.65rem;margin-right:3px;"></i>${escapeHtml(p.c_telefono||'—')}</div>
            </td>
            <td>
                <div class="hist-dir">${escapeHtml(p.Calle||'')} ${escapeHtml(p.Numero||'')}${piso}${loc}</div>
            </td>
            <td>
                <div class="hist-productos" title="${escapeHtml(p.detalles_resumen||'')}">${escapeHtml(p.detalles_resumen||'—')}</div>
            </td>
            <td><span class="hist-total">$${parseFloat(p.Total||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></td>
            <td><span class="hist-fecha">${p.fecha_creacion||'—'}</span></td>
            <td><span class="estado-pill ${estadoCls}">${estadoEmoji} ${p.Estado||''}</span></td>
            <td onclick="event.stopPropagation()">
                <button class="hist-btn-ver" title="Ver detalle" onclick="verDetallePedido(${p.ID_pedido})">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    // Paginación usando la función existente adaptada
    const cont = document.getElementById('admin-pagination');
    if (cont) {
        if (totalPags <= 1) { cont.innerHTML = ''; return; }
        const p = paginaActual;
        const pages = calcularPaginas(p, totalPags);
        let html = `<button class="pag-btn" onclick="adminIrPagina(${p-1})" ${p===1?'disabled':''}><i class="fa-solid fa-chevron-left"></i></button>`;
        pages.forEach(pg => {
            html += pg === '...'
                ? '<span class="pag-ellipsis">···</span>'
                : `<button class="pag-btn${pg===p?' active':''}" onclick="adminIrPagina(${pg})">${pg}</button>`;
        });
        html += `<button class="pag-btn" onclick="adminIrPagina(${p+1})" ${p===totalPags?'disabled':''}><i class="fa-solid fa-chevron-right"></i></button>`;
        cont.innerHTML = html;
    }
}

function adminIrPagina(n) {
    const total = Math.ceil(ADMIN_STATE.filtrados.length / ADMIN_STATE.porPagina);
    if (n < 1 || n > total) return;
    ADMIN_STATE.paginaActual = n;
    adminRenderizarPagina();
    document.getElementById('panel-admin')?.scrollIntoView({ behavior:'smooth', block:'start' });
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

    // Auto-refresh cada 60s para el panel admin
    setInterval(() => {
        const panelAdmin = document.getElementById('panel-admin');
        if (panelAdmin && !panelAdmin.classList.contains('hidden')) {
            cargarEstadisticas();
            cargarTodosPedidos();
        }
    }, 60000);
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
// ==========================================
// SIDEBAR — CAMBIAR VISTA
// ==========================================
function cambiarVista(vista) {
    const panelActuales  = document.getElementById('panel-recepcionista');
    const panelHistorial = document.getElementById('panel-historial-recepcionista');
    const navActuales    = document.getElementById('nav-pedidos-actuales');
    const navHistorial   = document.getElementById('nav-historial');

    if (vista === 'actuales') {
        panelActuales?.classList.remove('hidden');
        panelHistorial?.classList.add('hidden');
        navActuales?.classList.add('active');
        navHistorial?.classList.remove('active');
    } else {
        panelActuales?.classList.add('hidden');
        panelHistorial?.classList.remove('hidden');
        navActuales?.classList.remove('active');
        navHistorial?.classList.add('active');
        // Cargar historial la primera vez; recargar si pasaron 5+ min
        if (!HISTORIAL_STATE.cargado) {
            cargarHistorial();
        }
    }

    // Actualizar badge con pedidos activos
    const badge = document.getElementById('badge-actuales');
    if (badge) {
        const activos = DATA_RECEPCION.pedidos.filter(p =>
            ['Pendiente','Preparando','En camino'].includes(p.Estado)
        ).length;
        badge.textContent = activos;
    }
}

async function actualizarResumenSidebar() {
    try {
        const res = await fetch('./backend/funciones.php?action=getResumenHoy');
        const r   = await res.json();
        if (r.status !== 'success') return;

        const d = r.data;
        const el1 = document.getElementById('sb-entregados');
        const el2 = document.getElementById('sb-facturado');
        const el1label = document.getElementById('sb-entregados-label');
        const el2label = document.getElementById('sb-facturado-label');

        // Si hay entregados hoy, mostramos "hoy". Si no, mostramos el total histórico
        // con una etiqueta que lo deja claro
        const hayHoy = d.entregados_hoy > 0 || parseFloat(d.facturado_hoy) > 0;

        if (el1) el1.textContent = hayHoy ? d.entregados_hoy : d.entregados_total;
        if (el1label) el1label.textContent = hayHoy ? 'Hoy · Entregados' : 'Total · Entregados';

        const facturado = hayHoy ? parseFloat(d.facturado_hoy) : parseFloat(d.facturado_total);
        if (el2) {
            const fmt = facturado.toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 0});
            el2.textContent = '$' + fmt;
        }
        if (el2label) el2label.textContent = hayHoy ? 'Hoy · Facturado' : 'Total · Facturado';

        // Actualizar badge de pedidos activos
        const badge = document.getElementById('badge-actuales');
        if (badge && d.activos !== undefined) badge.textContent = d.activos;

    } catch(e) { /* silencioso */ }
}

// ==========================================
// HISTORIAL — ESTADO GLOBAL
// ==========================================
const HISTORIAL_STATE = {
    cargado:       false,
    todos:         [],      // todos los pedidos sin filtro
    filtrados:     [],      // resultado de búsqueda + filtros
    paginaActual:  1,
    porPagina:     25,
    sortCol:       'id',
    sortDir:       'desc',
    sortColActivo: false,   // true solo cuando el usuario clickea una cabecera
};

// ==========================================
// HISTORIAL — CARGA DESDE BACKEND
// ==========================================
async function cargarHistorial() {
    const tbody = document.getElementById('hist-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="hist-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...</td></tr>';

    try {
        const res    = await fetch('./backend/funciones.php?action=getHistorialPedidos');
        const result = await res.json();

        if (result.status !== 'success') {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="hist-loading">Error: ${result.message}</td></tr>`;
            return;
        }

        HISTORIAL_STATE.todos    = result.data.pedidos;
        HISTORIAL_STATE.cargado  = true;

        // Stats
        actualizarStatsHistorial(result.data.stats);

        // Aplicar filtros iniciales (ninguno) y renderizar
        historialFiltrar();

    } catch(e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="hist-loading">Error de conexión al cargar historial.</td></tr>';
    }
}

// ==========================================
// HISTORIAL — RECARGA MANUAL
// ==========================================
async function historialRecargarManual() {
    const btn = document.getElementById('hist-btn-refresh');
    const ind = document.getElementById('auto-reload-ind');
    const label = document.getElementById('hist-ultima-act');

    // Animación del botón
    if (btn) {
        btn.style.pointerEvents = 'none';
        btn.querySelector('i').classList.add('fa-spin');
    }
    if (ind) ind.classList.add('pulsing');

    await recargarHistorialSilencioso();

    // Actualizar timestamp
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
    if (label) label.textContent = `Act. ${hora}`;
    if (ind) ind.classList.add('pulsing');

    // Reset botón
    setTimeout(() => {
        if (btn) {
            btn.style.pointerEvents = '';
            btn.querySelector('i').classList.remove('fa-spin');
        }
    }, 600);
}

// Actualizar indicador visual después de cada auto-recarga
function marcarUltimaActualizacion() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
    const label = document.getElementById('hist-ultima-act');
    const ind   = document.getElementById('auto-reload-ind');
    if (label) label.textContent = `Act. ${hora}`;
    if (ind) {
        ind.classList.add('pulsing');
        setTimeout(() => ind.classList.remove('pulsing'), 2000);
    }
}

// ==========================================
// HISTORIAL — STATS HEADER
// ==========================================
function actualizarStatsHistorial(stats) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('hs-total',     stats.total     || 0);
    set('hs-pendiente', stats.pendiente || 0);
    set('hs-camino',    stats.en_camino || 0);
    set('hs-entregado', stats.entregado || 0);
    set('hs-cancelado', stats.cancelado || 0);

    // Badge sidebar
    const badge = document.getElementById('badge-actuales');
    if (badge) badge.textContent = (stats.pendiente || 0) + (stats.en_camino || 0);
}

// ==========================================
// HISTORIAL — BUSCAR (input live)
// ==========================================
function historialBuscar() {
    const q = document.getElementById('hist-buscador')?.value.trim() || '';
    const clearBtn = document.getElementById('hist-clear-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);
    HISTORIAL_STATE.paginaActual = 1;
    historialFiltrar();
}

function historialLimpiarBusqueda() {
    const inp = document.getElementById('hist-buscador');
    if (inp) inp.value = '';
    document.getElementById('hist-clear-btn')?.classList.add('hidden');
    HISTORIAL_STATE.paginaActual = 1;
    historialFiltrar();
}

function historialReset() {
    const inp = document.getElementById('hist-buscador');
    const sel1 = document.getElementById('hist-filtro-estado');
    const sel2 = document.getElementById('hist-filtro-orden');
    if (inp)  inp.value  = '';
    if (sel1) sel1.value = '';
    if (sel2) sel2.value = 'desc';
    document.getElementById('hist-clear-btn')?.classList.add('hidden');
    HISTORIAL_STATE.paginaActual  = 1;
    HISTORIAL_STATE.sortCol       = 'id';
    HISTORIAL_STATE.sortDir       = 'desc';
    HISTORIAL_STATE.sortColActivo = false; // vuelve a usar el select de orden
    // Reset sort headers
    document.querySelectorAll('.hist-table thead th').forEach(th => th.classList.remove('sort-active'));
    historialFiltrar();
}

// ==========================================
// HISTORIAL — FILTRAR + ORDENAR
// ==========================================
function historialFiltrar() {
    const q      = (document.getElementById('hist-buscador')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('hist-filtro-estado')?.value || '';
    const orden  = document.getElementById('hist-filtro-orden')?.value  || 'desc';

    let lista = [...HISTORIAL_STATE.todos];

    // 1. Filtrar por búsqueda
    if (q) {
        lista = lista.filter(p => {
            const texto = [
                '#' + p.ID_pedido,
                p.c_nombre, p.c_apellido, p.c_telefono,
                p.Calle, p.Numero, p.Localidad,
                p.detalles_resumen
            ].join(' ').toLowerCase();
            return texto.includes(q);
        });
    }

    // 2. Filtrar por estado
    if (estado) {
        lista = lista.filter(p => p.Estado === estado);
    }

    // 3. Ordenar: sortCol de cabecera tiene prioridad sobre el select.
    //    sortColActivo se pone en true solo cuando el usuario clickea una cabecera.
    if (HISTORIAL_STATE.sortColActivo) {
        lista = historialOrdenarLista(lista);
    } else {
        switch (orden) {
            case 'asc':        lista.sort((a,b) => a.ID_pedido - b.ID_pedido); break;
            case 'total-desc': lista.sort((a,b) => parseFloat(b.Total) - parseFloat(a.Total)); break;
            case 'total-asc':  lista.sort((a,b) => parseFloat(a.Total) - parseFloat(b.Total)); break;
            default:           lista.sort((a,b) => b.ID_pedido - a.ID_pedido); break; // desc = más reciente primero
        }
    }

    HISTORIAL_STATE.filtrados = lista;
    historialRenderizarPagina();
}

function historialOrdenarLista(lista) {
    const { sortCol, sortDir } = HISTORIAL_STATE;
    return [...lista].sort((a, b) => {
        let va, vb;
        if (sortCol === 'id')    { va = a.ID_pedido;      vb = b.ID_pedido; }
        if (sortCol === 'total') { va = parseFloat(a.Total); vb = parseFloat(b.Total); }
        if (sortCol === 'fecha') { va = a.fecha_creacion; vb = b.fecha_creacion; }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
    });
}

// ==========================================
// HISTORIAL — SORT POR COLUMNA
// ==========================================
function historialSort(col) {
    if (HISTORIAL_STATE.sortCol === col) {
        HISTORIAL_STATE.sortDir = HISTORIAL_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        HISTORIAL_STATE.sortCol = col;
        HISTORIAL_STATE.sortDir = 'desc';
    }
    HISTORIAL_STATE.sortColActivo = true; // columna clickeada, tiene prioridad sobre el select
    HISTORIAL_STATE.paginaActual  = 1;

    // Actualizar clases visuales en headers
    document.querySelectorAll('.hist-table thead th[data-col]').forEach(th => {
        th.classList.toggle('sort-active', th.dataset.col === col);
        const icon = th.querySelector('.sort-icon');
        if (icon && th.dataset.col === col) {
            icon.className = `fa-solid fa-sort-${HISTORIAL_STATE.sortDir === 'asc' ? 'up' : 'down'} sort-icon`;
        } else if (icon) {
            icon.className = 'fa-solid fa-sort sort-icon';
        }
    });

    historialFiltrar();
}

// ==========================================
// HISTORIAL — RENDERIZAR PÁGINA
// ==========================================
function historialRenderizarPagina() {
    const { filtrados, paginaActual, porPagina } = HISTORIAL_STATE;
    const total      = filtrados.length;
    const totalPags  = Math.max(1, Math.ceil(total / porPagina));
    const desde      = (paginaActual - 1) * porPagina;
    const hasta      = Math.min(desde + porPagina, total);
    const pagina     = filtrados.slice(desde, hasta);

    // Info row
    const countEl = document.getElementById('hist-count-label');
    const pageEl  = document.getElementById('hist-page-info');
    if (countEl) countEl.textContent = total === 0 ? 'Sin resultados' : `${total} pedido${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`;
    if (pageEl)  pageEl.textContent  = total > 0 ? `Mostrando ${desde+1}–${hasta} de ${total}` : '';

    // Renderizar filas
    const tbody = document.getElementById('hist-tbody');
    if (!tbody) return;

    if (pagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="hist-loading"><i class="fa-regular fa-folder-open" style="margin-right:8px;"></i>No se encontraron pedidos con esos filtros.</td></tr>';
        document.getElementById('hist-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = pagina.map(p => {
        const estadoCls = (p.Estado || '').toLowerCase().replace(' ', '-');
        const estadoEmoji = {
            'pendiente': '⏳', 'preparando': '👨‍🍳',
            'en-camino': '🛵', 'entregado': '✅', 'cancelado': '❌'
        }[estadoCls] || '•';

        const piso = p.piso_depto  ? ` <small>· ${p.piso_depto}</small>` : '';
        const loc  = p.Localidad   ? `<br><small>${p.Localidad}</small>` : '';

        return `<tr class="hist-row-clickable" onclick="verDetallePedido(${p.ID_pedido})" title="Ver detalle del pedido #${p.ID_pedido}">
            <td><span class="hist-id">#${p.ID_pedido}</span></td>
            <td>
                <div class="hist-cliente-nombre">${p.c_nombre || ''} ${p.c_apellido || ''}</div>
                <div class="hist-cliente-tel"><i class="fa-solid fa-phone" style="font-size:.65rem;margin-right:3px;"></i>${p.c_telefono || '—'}</div>
            </td>
            <td>
                <div class="hist-dir">${p.Calle || ''} ${p.Numero || ''}${piso}${loc}</div>
            </td>
            <td>
                <div class="hist-productos" title="${p.detalles_resumen || ''}">${p.detalles_resumen || '—'}</div>
            </td>
            <td><span class="hist-total">$${parseFloat(p.Total || 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span></td>
            <td><span class="hist-fecha">${p.fecha_creacion || '—'}</span></td>
            <td><span class="estado-pill ${estadoCls}">${estadoEmoji} ${p.Estado || ''}</span></td>
            <td onclick="event.stopPropagation()">
                <button class="hist-btn-ver" title="Ver detalle" onclick="verDetallePedido(${p.ID_pedido})">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    // Paginación
    renderizarPaginacion(totalPags);
}

// ==========================================
// HISTORIAL — PAGINACIÓN
// ==========================================
function renderizarPaginacion(totalPags) {
    const cont = document.getElementById('hist-pagination');
    if (!cont) return;
    if (totalPags <= 1) { cont.innerHTML = ''; return; }

    const p = HISTORIAL_STATE.paginaActual;
    let html = '';

    // Botón anterior
    html += `<button class="pag-btn" onclick="historialIrPagina(${p-1})" ${p===1?'disabled':''}>
        <i class="fa-solid fa-chevron-left"></i>
    </button>`;

    // Números de página con elipsis
    const pages = calcularPaginas(p, totalPags);
    pages.forEach(pg => {
        if (pg === '...') {
            html += `<span class="pag-ellipsis">···</span>`;
        } else {
            html += `<button class="pag-btn${pg===p?' active':''}" onclick="historialIrPagina(${pg})">${pg}</button>`;
        }
    });

    // Botón siguiente
    html += `<button class="pag-btn" onclick="historialIrPagina(${p+1})" ${p===totalPags?'disabled':''}>
        <i class="fa-solid fa-chevron-right"></i>
    </button>`;

    cont.innerHTML = html;
}

function calcularPaginas(actual, total) {
    if (total <= 7) return Array.from({length:total}, (_,i) => i+1);
    const pages = [];
    if (actual <= 4) {
        pages.push(1,2,3,4,5,'...',total);
    } else if (actual >= total - 3) {
        pages.push(1,'...',total-4,total-3,total-2,total-1,total);
    } else {
        pages.push(1,'...',actual-1,actual,actual+1,'...',total);
    }
    return pages;
}

function historialIrPagina(n) {
    const total = Math.ceil(HISTORIAL_STATE.filtrados.length / HISTORIAL_STATE.porPagina);
    if (n < 1 || n > total) return;
    HISTORIAL_STATE.paginaActual = n;
    historialRenderizarPagina();
    // Scroll suave al top de la tabla
    document.getElementById('panel-historial-recepcionista')?.scrollIntoView({ behavior:'smooth', block:'start' });
}
// ==========================================
// DRAG & DROP — KANBAN
// ==========================================
let _dragCardId   = null;   // ID del pedido que se está arrastrando
let _dragEstado   = null;   // Estado original de la tarjeta
let _dragEl       = null;   // Referencia al elemento DOM

const ESTADO_POR_COL = {
    'kanban-body-pendiente':  'Pendiente',
    'kanban-body-preparando': 'Preparando',
    'kanban-body-encamino':   'En camino',
};

// Llamado desde renderCol en renderizarTarjetas — activa drag en cada card
function activarDragCard(card, idPedido, estado) {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', e => {
        _dragCardId = idPedido;
        _dragEstado = estado;
        _dragEl     = card;
        card.classList.add('card-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idPedido);
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('card-dragging');
        document.querySelectorAll('.kanban-col-body').forEach(col => {
            col.classList.remove('col-drag-over');
        });
        _dragCardId = null;
        _dragEstado = null;
        _dragEl     = null;
    });
}

// Activa las zonas de drop en las 3 columnas del kanban.
// IMPORTANTE: debe llamarse UNA SOLA VEZ (desde iniciarLogicaRecepcionista).
// Usa delegación en el contenedor kanban para no depender del DOM de las columnas.
let _dropZonasActivadas = false;

function activarDropZones() {
    if (_dropZonasActivadas) return;  // guarda absoluta contra registros duplicados
    _dropZonasActivadas = true;

    // Delegamos en el contenedor padre del kanban para que los listeners
    // sobrevivan a cualquier re-render de las columnas.
    const kanbanRoot = document.getElementById('contenedor-vista-tarjetas');
    if (!kanbanRoot) return;

    kanbanRoot.addEventListener('dragover', e => {
        const col = e.target.closest('.kanban-col-body');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('col-drag-over');
    });

    kanbanRoot.addEventListener('dragleave', e => {
        const col = e.target.closest('.kanban-col-body');
        if (!col) return;
        if (!col.contains(e.relatedTarget)) col.classList.remove('col-drag-over');
    });

    kanbanRoot.addEventListener('drop', async e => {
        const col = e.target.closest('.kanban-col-body');
        if (!col) return;
        e.preventDefault();
        col.classList.remove('col-drag-over');

        const nuevoEstado = ESTADO_POR_COL[col.id];
        if (!nuevoEstado || !_dragCardId) return;
        if (nuevoEstado === _dragEstado) return; // misma columna → nada

        // Optimistic UI: mover la tarjeta visualmente al instante
        if (_dragEl) {
            _dragEl.classList.add('card-dropping');
            col.appendChild(_dragEl);
            _dragEl.dataset.estado = nuevoEstado;
            const estadoCls = nuevoEstado.toLowerCase().replace(' ', '-');
            const badgeEl   = _dragEl.querySelector('.pc-estado');
            const emoji = { Pendiente:'⏳', Preparando:'👨‍🍳', 'En camino':'🛵' };
            if (badgeEl) {
                badgeEl.className = `pc-estado ${estadoCls}`;
                badgeEl.textContent = `${emoji[nuevoEstado] || '•'} ${nuevoEstado}`;
            }
            const sel = _dragEl.querySelector('.pc-select-estado');
            if (sel) { sel.value = nuevoEstado; sel.dataset.estadoOriginal = nuevoEstado; }
            setTimeout(() => _dragEl?.classList.remove('card-dropping'), 350);
        }

        // Guardar referencias antes de que el render las limpie
        const idParaEnviar    = _dragCardId;
        const estadoParaEnviar = nuevoEstado;

        try {
            const res = await fetch('./backend/funciones.php?action=actualizarPedido', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({id:idParaEnviar, estado:estadoParaEnviar})
            });
            const result = await res.json();
            if (result.status === 'success') {
                mostrarMensaje('success', `Pedido #${idParaEnviar} → ${estadoParaEnviar}`);
                _lastRefreshHash = null; // forzar recarga completa en el próximo ciclo
                await recargarPedidosActuales();
                reiniciarTimer();
            } else {
                mostrarMensaje('error', result.message);
                await recargarPedidosActuales(); // revertir
            }
        } catch {
            mostrarMensaje('error', 'Error de conexión al mover pedido');
            await recargarPedidosActuales();
        }
    });
}

// Función para mostrar u ocultar la contraseña
function togglePassword(inputId) {
    // Si la función recibe un ID (como en restablecer.html), usamos ese.
    // Si no recibe nada (como en login.html), usamos 'password' por defecto.
    const idDelInput = inputId || 'password';
    
    // Seleccionamos el input
    const passwordInput = document.getElementById(idDelInput);
    
    if (passwordInput) {
        // Seleccionamos el ícono del ojito que está justo al lado del input
        const icon = passwordInput.nextElementSibling;
        
        // Alternamos el tipo de input y el ícono
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text'; // Mostramos el texto
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash'); // Cambiamos al ojito tachado
        } else {
            passwordInput.type = 'password'; // Ocultamos el texto
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye'); // Volvemos al ojito normal
        }
    }
}

async function guardarNuevaPassword() {
    // 1. Obtener los valores de los inputs
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // 2. Extraer el "token" de la URL (ejemplo: restablecer.html?token=abcd123...)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Validaciones básicas
    if (!token) {
        alert('Enlace no válido o expirado. Por favor, solicitá un nuevo restablecimiento.');
        return;
    }

    if (newPassword.length < 8) {
        alert('La contraseña debe tener al menos 8 caracteres.');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('Las contraseñas no coinciden. Verificalas e intentá de nuevo.');
        return;
    }

    try {
        // 3. Enviar la petición al backend
        // Ojo acá: asegurate de que la ruta a funciones.php sea la correcta
        const response = await fetch('backend/funciones.php?action=resetPassword', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: token,
                password: newPassword
            })
        });

        const data = await response.json(); 

        // 4. Manejar la respuesta del servidor
        if (data.success) {
            alert('¡Contraseña actualizada con éxito! Ya podés iniciar sesión.');
            // Redirigir al login
            window.location.href = 'login.html'; 
        } else {
            // Mostrar error (ej: token expirado o inválido)
            alert(data.error || 'Hubo un error al restablecer la contraseña.');
        }

    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión con el servidor. Intentá nuevamente más tarde.');
    }
}

// ==========================================
// SOPORTE PARA LA TECLA "ENTER" EN LOS INPUTS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Para login.html (Ejecuta loginUsuario)
    const loginInputs = document.querySelectorAll('#username, #password');
    if (loginInputs.length > 0) {
        loginInputs.forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Evita que el navegador recargue la página
                    // Asegurate de que tu función de login se llame así
                    if (typeof loginUsuario === 'function') loginUsuario(); 
                }
            });
        });
    }

    // 2. Para olvide.html (Ejecuta solicitarRecuperacion)
    const emailRecuperacion = document.getElementById('email-recuperacion');
    if (emailRecuperacion) {
        emailRecuperacion.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (typeof solicitarRecuperacion === 'function') solicitarRecuperacion();
            }
        });
    }

    // 3. Para restablecer.html (Ejecuta guardarNuevaPassword)
    const resetInputs = document.querySelectorAll('#new-password, #confirm-password');
    if (resetInputs.length > 0) {
        resetInputs.forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typeof guardarNuevaPassword === 'function') guardarNuevaPassword();
                }
            });
        });
    }
});


// ==========================================
// REENVÍO DE CORREO DE RECUPERACIÓN
// ==========================================

async function reenviarCorreo() {
    const emailInput = document.getElementById('email-recuperacion');
    const email = emailInput.value.trim();
    const btnReenviar = document.getElementById('btn-reenviar');
    const statusDiv = document.getElementById('resend-status');
    
    // Verificar cooldown
    if (reenvioCooldown) {
        mostrarStatusMessage('Por favor, esperá 30 segundos antes de reenviar.', 'info');
        return;
    }
    
    // Validar email
    if (!email) {
        mostrarStatusMessage('Ingresá tu correo electrónico primero.', 'error');
        emailInput.focus();
        return;
    }
    
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        mostrarStatusMessage('Ingresá un correo electrónico válido.', 'error');
        emailInput.focus();
        return;
    }
    
    // Deshabilitar botón y mostrar loading
    btnReenviar.disabled = true;
    btnReenviar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reenviando...';
    statusDiv.style.display = 'none';
    
    try {
        const response = await fetch('backend/funciones.php?action=resendResetEmail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarStatusMessage(data.mensaje || 'Correo reenviado exitosamente. Revisá tu bandeja de entrada o spam.', 'success');
            // Iniciar cooldown de 30 segundos
            iniciarCooldown(30);
        } else {
            mostrarStatusMessage(data.error || 'No se pudo reenviar el correo. Verificá que el email esté registrado.', 'error');
            btnReenviar.disabled = false;
            btnReenviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Reenviar correo';
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarStatusMessage('Error de conexión. Intentá nuevamente más tarde.', 'error');
        btnReenviar.disabled = false;
        btnReenviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Reenviar correo';
    }
}

function mostrarStatusMessage(mensaje, tipo) {
    const statusDiv = document.getElementById('resend-status');
    statusDiv.className = `status-message ${tipo}`;
    statusDiv.innerHTML = `<i class="fa-solid ${tipo === 'success' ? 'fa-circle-check' : (tipo === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info')}"></i> ${mensaje}`;
    statusDiv.style.display = 'block';
    
    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
        if (statusDiv.style.display === 'block') {
            statusDiv.style.display = 'none';
        }
    }, 5000);
}

function iniciarCooldown(segundos) {
    reenvioCooldown = true;
    const btnReenviar = document.getElementById('btn-reenviar');
    const countdownDiv = document.getElementById('countdown-timer');
    let tiempoRestante = segundos;
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        tiempoRestante--;
        
        if (tiempoRestante <= 0) {
            clearInterval(countdownInterval);
            countdownDiv.innerHTML = '';
            btnReenviar.disabled = false;
            btnReenviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Reenviar correo';
            reenvioCooldown = false;
        } else {
            countdownDiv.innerHTML = `⏱ Puedes reenviar en <span class="countdown">${tiempoRestante}</span> segundos`;
            btnReenviar.disabled = true;
            btnReenviar.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Esperar...';
        }
    }, 1000);
}

// Modificar la función existente solicitarRecuperacion para que también inicie cooldown
const solicitarRecuperacionOriginal = window.solicitarRecuperacion;
window.solicitarRecuperacion = async function() {
    const emailInput = document.getElementById('email-recuperacion');
    const email = emailInput.value.trim();
    const btnEnviar = document.getElementById('btn-enviar');
    
    if (!email) {
        alert('Por favor, ingresá tu correo electrónico.');
        return;
    }
    
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
    
    try {
        const response = await fetch('backend/funciones.php?action=forgotPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        
        const data = await response.json();
        
        if (data.success === false) {
            mostrarStatusMessage(data.error, 'error');
        } else {
            mostrarStatusMessage(data.mensaje, 'success');
            iniciarCooldown(30);
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarStatusMessage('Hubo un problema de conexión con el servidor.', 'error');
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fa-solid fa-envelope"></i> Enviar Enlace';
    }
};

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD.HTML — CUSTOM ESTADO DROPDOWN COMPONENT
   - Un solo menú abierto a la vez
   - Cierre al clickear fuera
   - Panel en portal (body) para evitar overflow:hidden
═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ESTADOS = ['Pendiente', 'Preparando', 'En camino', 'Entregado', 'Cancelado'];

    var portalPanel = null;
    var activeTrigger = null;

    function getPortalPanel() {
        if (!portalPanel) {
            portalPanel = document.createElement('div');
            portalPanel.className = 'custom-estado-panel';
            portalPanel.setAttribute('role', 'listbox');
            portalPanel.innerHTML = '<div class="cep-title">Cambiar estado</div>';

            ESTADOS.forEach(function(val) {
                var opt = document.createElement('div');
                opt.className = 'cep-option';
                opt.dataset.val = val;
                opt.setAttribute('role', 'option');
                opt.innerHTML =
                    '<span class="cep-dot"></span>' +
                    '<span>' + val + '</span>' +
                    '<i class="fa-solid fa-check cep-check"></i>';
                opt.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (activeTrigger) activeTrigger._selectOption(val);
                    closePortal();
                });
                portalPanel.appendChild(opt);
            });

            document.body.appendChild(portalPanel);
        }
        return portalPanel;
    }

    function positionPanel(trigger) {
        var panel = getPortalPanel();
        var rect = trigger.getBoundingClientRect();
        var panelHeight = panel.offsetHeight;
        var spaceBelow = window.innerHeight - rect.bottom;
        var spaceAbove = rect.top;

        var left = rect.left;
        var top;
        if (spaceBelow >= panelHeight + 6 || spaceBelow > spaceAbove) {
            top = rect.bottom + 6;
        } else {
            top = rect.top - panelHeight - 6;
        }

        var panelW = 170;
        if (left + panelW > window.innerWidth - 8) {
            left = rect.right - panelW;
        }

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.minWidth = Math.max(rect.width, panelW) + 'px';
    }

    function openPortal(trigger) {
        if (activeTrigger && activeTrigger !== trigger) {
            activeTrigger.classList.remove('open');
            activeTrigger.setAttribute('aria-expanded', 'false');
        }

        activeTrigger = trigger;
        var panel = getPortalPanel();
        var currentVal = trigger.dataset.val;

        panel.querySelectorAll('.cep-option').forEach(function(opt) {
            var sel = opt.dataset.val === currentVal;
            opt.classList.toggle('selected', sel);
            opt.setAttribute('aria-selected', sel ? 'true' : 'false');
        });

        positionPanel(trigger);
        trigger.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');

        panel.classList.remove('visible');
        panel.offsetHeight;
        panel.classList.add('visible');
    }

    function closePortal() {
        if (activeTrigger) {
            activeTrigger.classList.remove('open');
            activeTrigger.setAttribute('aria-expanded', 'false');
            activeTrigger = null;
        }
        var panel = getPortalPanel();
        panel.classList.remove('visible');
    }

    document.addEventListener('click', function(e) {
        if (!activeTrigger) return;
        var panel = getPortalPanel();
        if (!panel.contains(e.target) && e.target !== activeTrigger && !activeTrigger.contains(e.target)) {
            closePortal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePortal();
    });

    window.addEventListener('scroll', function() {
        if (activeTrigger) positionPanel(activeTrigger);
    }, true);
    window.addEventListener('resize', function() {
        if (activeTrigger) positionPanel(activeTrigger);
    });

    function buildDropdown(nativeSelect) {
        var currentVal = nativeSelect.value || 'Pendiente';

        var wrap = document.createElement('div');
        wrap.className = 'custom-estado-wrap';

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-estado-trigger';
        trigger.dataset.val = currentVal;
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML =
            '<span class="cet-dot"></span>' +
            '<span class="cet-label">' + currentVal + '</span>' +
            '<svg class="cet-chevron" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';

        trigger._selectOption = function(val) {
            nativeSelect.value = val;
            nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            trigger.dataset.val = val;
            trigger.querySelector('.cet-label').textContent = val;
        };

        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            if (activeTrigger === trigger && getPortalPanel().classList.contains('visible')) {
                closePortal();
            } else {
                openPortal(trigger);
            }
        });

        wrap.appendChild(trigger);
        return wrap;
    }

    function initDropdowns() {
        document.querySelectorAll('.select-estado, .pc-select-estado').forEach(function(sel) {
            if (sel.dataset.customInit) return;
            sel.dataset.customInit = 'true';
            var wrap = buildDropdown(sel);
            sel.parentNode.insertBefore(wrap, sel.nextSibling);
        });
    }

    /* Solo inicializar si estamos en dashboard.html */
    if (document.querySelector('.select-estado, .pc-select-estado, #panel-recepcionista')) {
        initDropdowns();
        var observer = new MutationObserver(initDropdowns);
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — CANVAS PARALLAX (nodos flotantes + líneas)
═══════════════════════════════════════════════════════════════════ */
(function () {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return; // solo en index.html

    const ctx = canvas.getContext('2d');
    let W, H;
    const mouse = { x: null, y: null };
    let nodes = [];

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    const SHAPES = ['circle','circle','circle','hex','hex','cross','ring'];
    const COLORS = [
        '#f5a623','#f5a623','#f5a623',
        '#2dd4bf','#2dd4bf',
        'rgba(255,255,255,0.8)','rgba(255,255,255,0.8)',
        '#60a5fa','#a78bfa'
    ];

    function mkNodes(n) {
        return Array.from({ length: n }, (_, i) => ({
            x:        Math.random() * (window.innerWidth  || 1200),
            y:        Math.random() * (window.innerHeight * 3 || 2400),
            r:        Math.random() * 2.2 + 0.5,
            drift:    Math.random() * 0.018 + 0.004,
            parallax: Math.random() * 0.55 + 0.08,
            opacity:  Math.random() * 0.55 + 0.15,
            shape:    SHAPES[i % SHAPES.length],
            color:    COLORS[i % COLORS.length],
            pulseSpeed: Math.random() * 0.02 + 0.008,
            pulseOffset: Math.random() * Math.PI * 2,
        }));
    }

    function hexPath(cx, cy, r) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k - Math.PI / 6;
            k === 0
                ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
                : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
    }

    function crossPath(cx, cy, r) {
        ctx.beginPath();
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    }

    let tick = 0;
    function draw() {
        ctx.clearRect(0, 0, W, H);
        const sy = window.scrollY;
        tick++;

        nodes.forEach((n, i) => {
            const vy = n.y - sy * n.parallax;

            if (mouse.x !== null) {
                n.x += (mouse.x - n.x) * 0.00014;
                n.y += (mouse.y - vy)  * 0.00014;
            }
            n.y -= n.drift;
            if (n.y < -60) n.y = H * 3;
            if (vy < -60 || vy > H + 60) return;

            const pulse = 1 + 0.25 * Math.sin(tick * n.pulseSpeed + n.pulseOffset);
            const alpha = Math.min(n.opacity * pulse, 0.95);

            ctx.globalAlpha = alpha;
            ctx.fillStyle   = n.color;
            ctx.strokeStyle = n.color;

            if (n.shape === 'hex') {
                const hr = n.r * 4.5;
                hexPath(n.x, vy, hr);
                ctx.lineWidth   = 0.8;
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.12;
                ctx.fill();
            } else if (n.shape === 'ring') {
                ctx.beginPath();
                ctx.arc(n.x, vy, n.r * 3.5, 0, Math.PI * 2);
                ctx.lineWidth   = 0.6;
                ctx.globalAlpha = alpha * 0.5;
                ctx.stroke();
            } else if (n.shape === 'cross') {
                crossPath(n.x, vy, n.r * 3);
                ctx.lineWidth   = 0.7;
                ctx.globalAlpha = alpha * 0.55;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(n.x, vy, n.r, 0, Math.PI * 2);
                ctx.fill();
            }

            if (i % 2 === 0) {
                for (let j = i + 1; j < Math.min(i + 12, nodes.length); j++) {
                    const b   = nodes[j];
                    const bvy = b.y - sy * b.parallax;
                    const dx  = n.x - b.x;
                    const dy  = vy  - bvy;
                    const d   = Math.sqrt(dx * dx + dy * dy);
                    if (d < 180) {
                        ctx.beginPath();
                        ctx.moveTo(n.x, vy);
                        ctx.lineTo(b.x, bvy);
                        const lineAlpha = (1 - d / 180) * 0.11;
                        ctx.strokeStyle = n.color === '#f5a623' || b.color === '#f5a623'
                            ? `rgba(245,166,35,${lineAlpha})`
                            : n.color === '#2dd4bf' || b.color === '#2dd4bf'
                            ? `rgba(45,212,191,${lineAlpha * 0.8})`
                            : `rgba(255,255,255,${lineAlpha * 0.5})`;
                        ctx.lineWidth   = 0.5;
                        ctx.globalAlpha = 1;
                        ctx.stroke();
                    }
                }
            }
        });

        ctx.globalAlpha = 1;
        requestAnimationFrame(draw);
    }

    resize();
    nodes = mkNodes(160);
    draw();

    window.addEventListener('resize',    resize);
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — SCROLL REVEAL
═══════════════════════════════════════════════════════════════════ */
(function () {
    if (!document.querySelector('.reveal')) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach((e, i) => {
            if (e.isIntersecting) {
                e.target.style.transitionDelay = (i * 0.06) + 's';
                e.target.classList.add('visible');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — ANIMATED COUNTERS
═══════════════════════════════════════════════════════════════════ */
(function () {
    if (!document.querySelector('.stats-row')) return;

    const counterObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.querySelectorAll('[data-target]').forEach(el => {
                const target = parseInt(el.dataset.target);
                const suffix = el.dataset.suffix || '';
                let current  = 0;
                const inc    = target / (1400 / 16);
                const t = setInterval(() => {
                    current += inc;
                    if (current >= target) {
                        el.textContent = target.toLocaleString('es-AR') + suffix;
                        clearInterval(t);
                    } else {
                        el.textContent = Math.floor(current).toLocaleString('es-AR');
                    }
                }, 16);
            });
            counterObs.unobserve(entry.target);
        });
    }, { threshold: 0.3 });
    document.querySelectorAll('.stats-row').forEach(el => counterObs.observe(el));
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — FEATURE CARD 3D TILT
═══════════════════════════════════════════════════════════════════ */
(function () {
    const cards = document.querySelectorAll('.feature-card');
    if (!cards.length) return;

    cards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left)  / r.width  - 0.5;
            const y = (e.clientY - r.top)   / r.height - 0.5;
            card.style.transform  = `translateY(-5px) rotateY(${x*6}deg) rotateX(${-y*6}deg)`;
            card.style.transition = 'transform 0.1s';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform  = '';
            card.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
        });
    });
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — MOCKUP LIVE (nuevo pedido cada 5s)
═══════════════════════════════════════════════════════════════════ */
(function () {
    const col = document.getElementById('col-nuevo-cards');
    if (!col) return;

    const fakeNames   = ['Herrera, Diego','Ruiz, Paola','Castro, Esteban','Gomez, Nico','Varela, Nadia','Ortiz, Fabio','Acosta, Sol'];
    const fakeStreets = ['Roca 224','Alvear 1100','Urquiza 890','25 de Mayo 77','Brown 540','Paz 333','Moreno 1500'];
    let orderNum = 48;
    let newCount = 3;

    setInterval(() => {
        orderNum++; newCount++;
        const card = document.createElement('div');
        card.className = 'dash-order-card card-animate';
        card.innerHTML = `
            <div class="doc-num">#${orderNum}</div>
            <div class="doc-name">${fakeNames[Math.floor(Math.random()*fakeNames.length)]}</div>
            <div class="doc-addr"><i class="fa-solid fa-location-dot" style="font-size:.5rem;color:var(--text-3)"></i> ${fakeStreets[Math.floor(Math.random()*fakeStreets.length)]}</div>
            <div class="doc-time"><i class="fa-regular fa-clock"></i> ahora</div>`;
        col.insertBefore(card, col.firstChild);
        if (col.children.length > 3) col.removeChild(col.lastChild);
        const cntNuevo = document.getElementById('cnt-nuevo');
        const mcNuevos = document.getElementById('mc-nuevos');
        if (cntNuevo) cntNuevo.textContent = Math.min(newCount, 9);
        if (mcNuevos) mcNuevos.textContent = Math.min(newCount, 9);
    }, 5000);
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — VER DEMO → scroll to mockup
═══════════════════════════════════════════════════════════════════ */
(function () {
    const btn = document.getElementById('ver-demo-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        document.querySelector('.hero-mockup').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — FORMULARIO CONTACTO
═══════════════════════════════════════════════════════════════════ */
(function () {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn      = document.getElementById('cf-submit-btn');
        const nombre   = document.getElementById('cf-nombre').value.trim();
        const email    = document.getElementById('cf-email').value.trim();
        const asunto   = document.getElementById('cf-asunto').value;
        const mensaje  = document.getElementById('cf-mensaje').value.trim();
        const telefono = document.getElementById('cf-telefono').value.trim();
        const empresa  = document.getElementById('cf-empresa').value.trim();

        if (!nombre || !email || !asunto || !mensaje) {
            showFeedback('error','<i class="fa-solid fa-circle-exclamation"></i> Por favor completá todos los campos obligatorios.');
            return;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando…';
        try {
            const res  = await fetch('backend/funciones.php?action=enviarContacto', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, email, telefono, empresa, asunto, mensaje })
            });
            const data = await res.json();
            if (data.success) {
                showFeedback('success','<i class="fa-solid fa-circle-check"></i> ¡Mensaje enviado! Te enviamos una confirmación a tu correo.');
                form.reset();
            } else {
                showFeedback('error','<i class="fa-solid fa-circle-exclamation"></i> ' + (data.mensaje || 'Ocurrió un error.'));
            }
        } catch {
            showFeedback('error','<i class="fa-solid fa-circle-exclamation"></i> Error de conexión.');
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar mensaje';
    });

    function showFeedback(type, html) {
        const fb = document.getElementById('cf-feedback');
        fb.className    = 'cf-feedback cf-feedback--' + type;
        fb.innerHTML    = html;
        fb.style.display = 'flex';
        fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
})();


/* ═══════════════════════════════════════════════════════════════════
   INDEX.HTML — CUSTOM SELECT #cf-asunto
═══════════════════════════════════════════════════════════════════ */
(function () {
    const trigger  = document.getElementById('cf-asunto-trigger');
    if (!trigger) return;

    const dropdown = document.getElementById('cf-asunto-list');
    const display  = document.getElementById('cf-asunto-display');
    const hidden   = document.getElementById('cf-asunto');

    display.classList.add('placeholder');

    trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const open = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', !open);
        dropdown.classList.toggle('open', !open);
    });

    dropdown.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', function() {
            const val = this.dataset.value;
            hidden.value = val;
            display.textContent = val;
            display.classList.remove('placeholder');
            dropdown.querySelectorAll('li').forEach(l => l.classList.remove('selected'));
            this.classList.add('selected');
            trigger.setAttribute('aria-expanded', 'false');
            dropdown.classList.remove('open');
        });
    });

    document.addEventListener('click', function(e) {
        if (!document.getElementById('cf-asunto-wrap').contains(e.target)) {
            trigger.setAttribute('aria-expanded', 'false');
            dropdown.classList.remove('open');
        }
    });

    trigger.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { trigger.click(); e.preventDefault(); }
        if (e.key === 'Escape') {
            trigger.setAttribute('aria-expanded', 'false');
            dropdown.classList.remove('open');
        }
    });
})();