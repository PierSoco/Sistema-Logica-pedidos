document.addEventListener('DOMContentLoaded', () => {
    const contenedorPedidos = document.getElementById('contenedor-pedidos');
    const btnRefresh = document.getElementById('btn-refresh');

    const cargarPedidos = async () => {
        try {
            // Apunta a tu archivo backend.php
            const response = await fetch('./backend/backend.php?action=getListos');
            const pedidos = await response.json();
            
            renderizarPedidos(pedidos);
        } catch (error) {
            console.error("Error al cargar pedidos:", error);
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

        // Asignar eventos a los botones nuevos
        document.querySelectorAll('.btn-aceptar').forEach(btn => {
            btn.addEventListener('click', (e) => aceptarPedido(e.target.dataset.id));
        });
    };

    btnRefresh.addEventListener('click', cargarPedidos);
    cargarPedidos();
});

const aceptarPedido = async (idPedido) => {
    if(!confirm("¿Confirmas que te llevas este pedido?")) return;

    try {
        // Apunta a tu archivo backend.php
        const response = await fetch('./backend/backend.php?action=actualizarEstado', {
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
        console.error("Error en la petición POST:", error);
    }
};