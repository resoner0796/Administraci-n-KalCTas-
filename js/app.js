 // --- COMIENZA EL BLOQUE COMPLETO DE JAVASCRIPT ---

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado con éxito: ', registration.scope);
            })
            .catch(err => {
                console.log('Fallo en el registro del ServiceWorker: ', err);
            });
    });
}

const firebaseConfig = {
    apiKey: "AIzaSyDuNHPsYnLD_qmbG2K9ieTIOCX6U4slD1E",
    authDomain: "tienda-kalctas.firebaseapp.com",
    projectId: "tienda-kalctas",
    storageBucket: "tienda-kalctas.firebasestorage.app",
    messagingSenderId: "374355691085",
    appId: "1:374355691085:web:18abb15678c7a6870bbe04"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();

const vapidKey = "BCI7mLN5SS6nZLTIC4BZNusMu2TCEYs_-XBvVrqQahBscDElMQBcfBU0lcnSPQDRItA-3g-3cbdATal2jywf1os";

// --- URL BASE DEFINITIVA PARA IMÁGENES ---
const IMAGES_BASE_URL = 'https://kalctas.com/';

let actionToConfirm = null;
let unsubscribes = [];
let productModels = [], expenseConcepts = [];
let salesChart;
let CAPITAL_PER_PRODUCT = 42; // Valor por defecto, se actualizará desde la BD
let SHIPPING_COST = 70; // Valor por defecto, se actualizará desde la BD
let deferredInstallPrompt = null;

// NUEVO: Mapa de empaques para descuento de inventario
const empaqueInsumoMap = {
    'Frankie': 'Empaque frankie',
    'Naranja': 'Empaque Halloween Naranja',
    'Tradicional Gris': 'Empaque Tradicional Gris'
};

const getEl = (id) => document.getElementById(id);

async function showScreen(screenId) {
    document.querySelectorAll('section').forEach(screen => screen.style.display = 'none');
    
    const screenElement = getEl(screenId);
    if (screenElement) {
        screenElement.style.display = 'block';
    } else {
        console.error(`La pantalla con ID '${screenId}' no existe en el HTML.`);
        return;
    }

    document.querySelectorAll('.logo-img').forEach(img => {
        img.src = IMAGES_BASE_URL + 'LOGO.png';
    });

    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];

    switch (screenId) {
        case 'main-menu':
            // No se necesita cargar nada, solo mostrar el menú
            break;
        case 'inventory-screen':
            loadInventory();
            break;
        case 'orders-screen':
            loadOrders();
            break;
        case 'sales-history-screen':
            loadSalesHistory();
            break;
        case 'finance-screen':
            loadFinancialSummary();
            loadExpenseConcepts();
            loadProductCost();
            loadShippingCost();
            break;
        case 'supplies-screen':
            loadSupplies();
            break;
        case 'restock-screen':
            await loadProductModels();
            loadRestockHistory();
            if (getEl('restock-items')) {
                getEl('restock-items').innerHTML = '';
                addRestockLine();
            }
            break;
        case 'sales-screen':
            loadSalesData();
            break;
        case 'movements-history-screen':
            loadMovementCategories();
            loadMovementsHistory();
            break;
        case 'theme-screen':
            loadCurrentTheme();
            break;
        case 'packaging-screen':
            loadPackagingVisibility();
            loadVideoManagement();
            break;
        case 'manual-order-screen':
            await loadProductModels();
            getEl('manual-order-items').innerHTML = '';
            addManualOrderLine();
            getEl('manual-order-form').reset();
            toggleManualDeliveryFields();
            calculateManualOrderTotal();
            break;
        case 'raw-materials-screen':
            loadRawMaterials();
            break;
        case 'sales-report-table-screen':
            loadSalesReportTable();
            break;
    }
}

async function loadCurrentTheme() {
    const statusEl = getEl('current-theme-status');
    if(!statusEl) return;
    statusEl.textContent = 'Cargando...';
    try {
        const configRef = db.collection('configuracion').doc('tienda');
        const doc = await configRef.get();
        if (doc.exists && doc.data().temaActual) {
            statusEl.textContent = doc.data().temaActual;
        } else {
            statusEl.textContent = 'default';
        }
    } catch (error) {
        console.error("Error al cargar el tema actual:", error);
        statusEl.textContent = 'Error';
    }
}

async function setTheme(themeName) {
    try {
        const configRef = db.collection('configuracion').doc('tienda');
        await configRef.set({ temaActual: themeName }, { merge: true });
        showMessage(`¡Éxito! El tema de la tienda ahora es '${themeName}'.`);
        loadCurrentTheme();
    } catch (error) {
        console.error("Error al actualizar el tema:", error);
        showMessage('Hubo un error al intentar cambiar el tema.');
    }
}

async function getCategoryVisibility() {
    const visibility = {};
    const snapshot = await db.collection('categorias').get();
    snapshot.forEach(doc => {
        visibility[doc.id] = doc.data().visible;
    });
    return visibility;
}

async function toggleCategoryVisibility(categoryName, isVisible) {
    const newVisibility = !isVisible;
    try {
        await db.collection('categorias').doc(categoryName).set({
            visible: newVisibility
        }, { merge: true });
        showMessage(`Categoría '${categoryName}' ahora está ${newVisibility ? 'VISIBLE' : 'OCULTA'}.`);
        loadInventory();
    } catch (error) {
        console.error("Error al cambiar visibilidad de categoría:", error);
        showMessage("Error al actualizar la categoría.");
    }
}

auth.onAuthStateChanged(user => {
    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];
    if (user) {
        showScreen('main-menu');
        solicitarPermisoNotificaciones();
    } else {
        showScreen('login-screen');
    }
});

const loginForm = getEl('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await auth.signInWithEmailAndPassword(getEl('login-email').value, getEl('login-password').value);
        } catch (error) {
            showMessage('Error al iniciar sesión.');
        }
    });
}

function logout() { auth.signOut(); }

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installButton = getEl('install-app-button');
    if (installButton) {
        installButton.style.display = 'block';
    }
});

const installButton = getEl('install-app-button');
if (installButton) {
    installButton.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log(`Resultado de la instalación: ${outcome}`);
            deferredInstallPrompt = null;
            installButton.style.display = 'none';
        }
    });
}

// --- CORRECCIÓN: Se modificó esta función para evitar el crash ---
async function solicitarPermisoNotificaciones() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await messaging.getToken({
                vapidKey: vapidKey
            });

            if (token) {
                const tokenRef = db.collection('admin_devices').doc(token);
                await tokenRef.set({
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    userAgent: navigator.userAgent
                });
            }
        }
    } catch (error) {
        console.error('Error al obtener el permiso o el token de FCM:', error);
        // showMessage('No se pudieron activar las notificaciones push. (¿Estás en modo incógnito?)');
    }
}

messaging.onMessage((payload) => {
    console.log('Mensaje recibido en primer plano: ', payload);
    const sound = getEl('notification-sound');
    if (sound) sound.play().catch(e => console.warn("El audio no se pudo reproducir."));
    showMessage(`¡Nuevo Pedido! ${payload.notification.body}`);
});

function generarDetallesEntregaHTML(pedido) {
    let detallesHTML = '';
    const datosEntrega = pedido.datosEntrega;

    if (datosEntrega) {
        detallesHTML += `<p><strong>Forma de entrega:</strong> ${datosEntrega.tipo || 'N/A'}</p>`;

        if (datosEntrega.tipo === 'Punto medio') {
            detallesHTML += `<p><strong>Fecha de entrega:</strong> ${datosEntrega.fecha || 'N/A'}</p>`;
            detallesHTML += `<p><strong>Lugar de entrega:</strong> ${datosEntrega.lugar || 'N/A'}</p>`;
        } else if (datosEntrega.tipo === 'Envío a domicilio') {
            detallesHTML += `<p><strong>Dirección:</strong> ${datosEntrega.calle || ''}, ${datosEntrega.colonia || ''}</p>`;
            if (datosEntrega.descripcion) {
                detallesHTML += `<p><strong>Descripción domicilio:</strong> ${datosEntrega.descripcion}</p>`;
            }
        }
    } else {
        detallesHTML += `<p><strong>Fecha Entrega:</strong> ${pedido.fechaEntrega || 'No especificada'}</p>`;
        detallesHTML += `<p><strong>Lugar:</strong> ${pedido.lugarEntrega || 'No especificado'}</p>`;
    }

    if (pedido.comentarios) {
        detallesHTML += `<p><strong>Comentarios:</strong> ${pedido.comentarios}</p>`;
    }
    return detallesHTML;
}

function loadOrders() {
    const ordersList = getEl('orders-list');
    ordersList.innerHTML = '<p>Cargando pedidos...</p>';
    const q = db.collection('pedidos').where('estado', 'in', ['Pendiente', 'Confirmado']).orderBy('fechaCreacion', 'desc');
    const unsubscribe = q.onSnapshot((snapshot) => {
        const pedidosTienda = [];
        snapshot.forEach(doc => {
            const pedido = doc.data();
            if (!pedido.canalVenta) {
                pedidosTienda.push(doc);
            }
        });

        ordersList.innerHTML = pedidosTienda.length === 0 ? '<p>No hay pedidos de la tienda pendientes.</p>' : '';

        pedidosTienda.forEach(doc => {
            const pedido = doc.data();
            const total = pedido.montoTotal || 0;
            const clienteNombre = `${pedido.datosCliente?.nombre || ''} ${pedido.datosCliente?.apellido || ''}`.trim() || 'N/A';

            const detallesEntrega = generarDetallesEntregaHTML(pedido);

            const item = document.createElement('li');
            item.className = 'order-item';
            item.innerHTML = `
                <div class="order-summary">
                    <span>${pedido.folio} - ${clienteNombre}</span>
                    <span class="order-status status-${pedido.estado}">${pedido.estado}</span>
                    <span>$${total.toFixed(2)}</span>
                </div>
                <div class="order-details">
                    <p><strong>Cliente:</strong> ${clienteNombre}</p>
                    <p><strong>Teléfono:</strong> ${pedido.datosCliente?.telefono || 'N/A'}</p>
                    ${detallesEntrega}
                    <p><strong>Método de Pago:</strong> ${pedido.metodoPago || 'N/A'}</p>
                    <p><strong>Productos:</strong></p>
                    <ul>${(pedido.productos || []).map(p => `<li>${p.nombre}</li>`).join('')}</ul>
                    <div class="order-actions">
                        ${pedido.estado === 'Pendiente' ? `<button class="btn" onclick="updateOrderStatus('${doc.id}', 'Confirmado', event)">Confirmar</button>` : ''}
                        <button class="btn" onclick="updateOrderStatus('${doc.id}', 'Entregado', event)">Marcar Entregado</button>
                        <button class="btn btn-delete" onclick="promptCancelOrder('${doc.id}', event)">Cancelar</button>
                    </div>
                </div>`;
            item.querySelector('.order-summary').onclick = (e) => e.currentTarget.nextElementSibling.style.display = e.currentTarget.nextElementSibling.style.display === 'block' ? 'none' : 'block';
            ordersList.appendChild(item);
        });
    });
    unsubscribes.push(unsubscribe);
}

async function loadSalesReportTable() {
    const tbody = getEl('sales-report-table-body');
    tbody.innerHTML = '<tr><td colspan="11">Cargando reporte... ⏳</td></tr>';

    try {
        const q = db.collection('pedidos').where('estado', '==', 'Entregado').orderBy('fechaActualizacion', 'desc');
        const snapshot = await q.get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="11">No hay ventas entregadas para mostrar.</td></tr>';
            return;
        }

        let tableHTML = '';
        const configRef = db.collection('configuracion').doc('tienda');
        const configDoc = await configRef.get();
        const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
        const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;

        snapshot.forEach(doc => {
            const pedido = doc.data();
            const totalVenta = pedido.montoTotal || 0;
            const clienteNombre = (pedido.datosCliente?.nombre || '').trim() || pedido.clienteManual || 'N/A';
            const canal = pedido.canalVenta || 'Tienda en línea';
            const fecha = pedido.fechaActualizacion?.toDate().toLocaleDateString() || 'N/A';

            const numeroProductos = pedido.productos?.reduce((sum, p) => sum + (p.cantidad || 1), 0) || 0;
            const hasShipping = pedido.datosEntrega?.tipo === 'Envío a domicilio';
            const gastoEnvio = hasShipping ? shippingCost : 0;
            const capitalMonto = numeroProductos * costPerProduct;
            const utilidadTotal = totalVenta - capitalMonto - gastoEnvio;

            const utilidadNegocio = utilidadTotal * 0.50;
            const utilidadUlises = utilidadTotal * 0.25;
            const utilidadDariana = utilidadTotal * 0.25;

            tableHTML += `
                <tr>
                    <td>${pedido.folio || 'Manual'}</td>
                    <td>${clienteNombre}</td>
                    <td>${canal}</td>
                    <td>${fecha}</td>
                    <td>$${totalVenta.toFixed(2)}</td>
                    <td>$${capitalMonto.toFixed(2)}</td>
                    <td>$${gastoEnvio.toFixed(2)}</td>
                    <td style="font-weight: bold;">$${utilidadTotal.toFixed(2)}</td>
                    <td>$${utilidadNegocio.toFixed(2)}</td>
                    <td>$${utilidadUlises.toFixed(2)}</td>
                    <td>$${utilidadDariana.toFixed(2)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = tableHTML;

    } catch (error) {
        console.error("Error al cargar el reporte de ventas:", error);
        tbody.innerHTML = '<tr><td colspan="11">Error al cargar el reporte. Intenta de nuevo.</td></tr>';
        showMessage('Error al cargar datos del reporte.');
    }
}

async function loadInventory() {
    const accordionContainer = getEl('inventory-accordion');
    const categoryControlsContainer = getEl('category-visibility-controls');
    accordionContainer.innerHTML = '<p style="text-align:center;">Cargando inventario...</p>';
    categoryControlsContainer.innerHTML = '<h2>Visibilidad</h2>';

    try {
        const categoryVisibility = await getCategoryVisibility();
        const snapshot = await db.collection('productos').orderBy('categoria').orderBy('nombre').get();

        const productsByCategory = {};
        const definedCategories = ['KalCTas2-4', 'KalCTas3-4', 'KalCTasLargas'];

        // Inicializar categorías
        definedCategories.forEach(cat => productsByCategory[cat] = []);

        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                const product = { id: doc.id, ...doc.data() };
                if (productsByCategory[product.categoria]) {
                    productsByCategory[product.categoria].push(product);
                }
            });
        }

        accordionContainer.innerHTML = '';

        // Controles de Visibilidad
        definedCategories.forEach(categoryName => {
            const isVisible = categoryVisibility[categoryName] !== false;
            const controlItem = document.createElement('div');
            controlItem.className = 'visibility-item'; // Usará estilo del CSS nuevo
            controlItem.style.display = 'flex'; 
            controlItem.style.justifyContent = 'space-between';
            controlItem.style.padding = '10px';
            controlItem.style.marginBottom = '10px';
            controlItem.style.background = 'var(--bg-panel)';
            controlItem.style.borderRadius = 'var(--radius)';

            controlItem.innerHTML = `
                <span style="font-weight:bold;">${categoryName}</span>
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background-color: var(--${isVisible ? 'info' : 'success'});" onclick="toggleCategoryVisibility('${categoryName}', ${isVisible})">
                    ${isVisible ? 'Ocultar' : 'Mostrar'}
                </button>
            `;
            categoryControlsContainer.appendChild(controlItem);
        });

        // Generar Grid de Productos
        for (const category in productsByCategory) {
            // Separador de categoría
            const separator = document.createElement('div');
            separator.className = 'category-separator';
            separator.textContent = category;
            accordionContainer.appendChild(separator);

            // Contenedor Grid
            const gridDiv = document.createElement('div');
            gridDiv.className = 'inventory-grid';

            if (productsByCategory[category].length === 0) {
                gridDiv.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#666;">Sin productos.</p>';
            } else {
                productsByCategory[category].forEach(product => {
                    const isVisible = product.visible !== false;
                    const agotadoClass = product.stock === 0 ? 'agotado' : '';
                    const imageUrl = product.imagenUrl.startsWith('http') ? product.imagenUrl : IMAGES_BASE_URL + product.imagenUrl;

                    const card = document.createElement('div');
                    card.className = `product-card ${agotadoClass}`;
                    
                    card.innerHTML = `
                        <div class="product-img-wrapper">
                            <img src="${imageUrl}" alt="${product.nombre}" onerror="this.src='https://placehold.co/200x200?text=No+Img'">
                        </div>
                        <div class="product-info">
                            <div class="product-title">${product.nombre}</div>
                            <div class="product-meta">
                                <span class="product-stock">Stock: ${product.stock}</span>
                                <span>$${product.precio}</span>
                            </div>
                            <div class="product-actions">
                                <button class="btn-edit" onclick="editProduct('${product.id}')">Editar</button>
                                <button class="btn-neutral" onclick="toggleProductVisibility('${product.id}', ${isVisible})">
                                    ${isVisible ? '👁️' : '🙈'}
                                </button>
                            </div>
                        </div>
                    `;
                    gridDiv.appendChild(card);
                });
            }
            accordionContainer.appendChild(gridDiv);
        }
    } catch (error) {
        console.error("Error al cargar inventario:", error);
        accordionContainer.innerHTML = '<p>Error al cargar el inventario.</p>';
    }
}

async function toggleProductVisibility(productId, isVisible) {
    const newVisibility = !isVisible;
    try {
        await db.collection('productos').doc(productId).update({
            visible: newVisibility
        });
        showMessage(`Producto ${newVisibility ? 'ahora está VISIBLE' : 'ha sido OCULTADO'}.`);
        loadInventory();
    } catch (error) {
        console.error("Error al cambiar la visibilidad del producto:", error);
        showMessage("Hubo un error al actualizar la visibilidad.");
    }
}

const addProductForm = getEl('add-product-form');
if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const imageUrl = getEl('product-image-url').value;
            if (!imageUrl) {
                showMessage('Por favor, ingresa la ruta de la imagen.');
                return;
            }

            await db.collection('productos').add({
                nombre: getEl('product-name').value,
                categoria: getEl('product-category').value,
                imagenUrl: imageUrl,
                stock: parseInt(getEl('product-stock').value),
                precio: parseFloat(getEl('product-price').value),
                cantidadVendida: 0,
                visible: true
            });
            showMessage('¡Producto agregado con éxito!');
            getEl('add-product-form').reset();
            showScreen('inventory-screen');
        } catch (error) {
            console.error(error);
            showMessage('Hubo un error al agregar el producto.');
        }
    });
}

async function editProduct(id) {
    const docSnap = await db.collection('productos').doc(id).get();
    if (docSnap.exists) {
        const data = docSnap.data();
        getEl('edit-product-id').value = id;
        getEl('edit-name').value = data.nombre;
        getEl('edit-category').value = data.categoria;
        getEl('edit-image-url').placeholder = data.imagenUrl;
        getEl('edit-image-url').value = '';
        getEl('edit-stock').value = data.stock;
        getEl('edit-price').value = data.precio;
        getEl('edit-visible').checked = data.visible !== false;
        getEl('edit-modal').style.display = 'flex';
    }
}

const editProductForm = getEl('edit-product-form');
if (editProductForm) {
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = getEl('edit-product-id').value;
        try {
            const updates = {
                nombre: getEl('edit-name').value,
                categoria: getEl('edit-category').value,
                stock: parseInt(getEl('edit-stock').value),
                precio: parseFloat(getEl('edit-price').value),
                visible: getEl('edit-visible').checked
            };

            const newImageUrl = getEl('edit-image-url').value;
            if (newImageUrl && newImageUrl.trim() !== '') {
                updates.imagenUrl = newImageUrl.trim();
            }

            await db.collection('productos').doc(id).update(updates);

            showMessage('Producto actualizado.');
            closeEditModal();
            loadInventory();
        } catch (error) {
            console.error(error);
            showMessage('Error al actualizar.');
        }
    });
}

async function updateOrderStatus(pedidoId, newStatus, event) {
    event.stopPropagation();
    const pedidoRef = db.collection('pedidos').doc(pedidoId);
    try {
        await db.runTransaction(async (t) => {
            const configDoc = await t.get(db.collection('configuracion').doc('tienda'));
            const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
            const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;

            const pedidoDoc = await t.get(pedidoRef);
            if (!pedidoDoc.exists) throw new Error("Pedido no encontrado");
            const pedidoData = pedidoDoc.data();
            if (pedidoData.estado === newStatus) return;

            const updatesForOrder = { estado: newStatus, fechaActualizacion: firebase.firestore.FieldValue.serverTimestamp() };

            if (newStatus === 'Entregado' && pedidoData.estado !== 'Entregado') {
                const totalVenta = pedidoData.montoTotal || 0;
                const numeroProductos = pedidoData.productos?.reduce((sum, p) => sum + (p.cantidad || 1), 0) || 0;
                const hasShipping = pedidoData.datosEntrega?.tipo === 'Envío a domicilio';
                const gastoEnvio = hasShipping ? shippingCost : 0;

                const capitalMonto = numeroProductos * costPerProduct;
                const utilidadTotal = totalVenta - capitalMonto - gastoEnvio;

                const utilidadNegocio = utilidadTotal * 0.50;
                const utilidadUlises = utilidadTotal * 0.25;
                const utilidadDariana = utilidadTotal * 0.25;

                if (hasShipping) {
                    const gastoEnvioRef = db.collection('movimientos').doc();
                    t.set(gastoEnvioRef, {
                        monto: -gastoEnvio, concepto: 'Gasto de Envío', tipo: 'Gastos',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Gasto de envío para pedido ${pedidoData.folio}`, relatedOrderId: pedidoId
                    });
                }

                if (capitalMonto > 0) {
                    const capitalMovRef = db.collection('movimientos').doc();
                    t.set(capitalMovRef, {
                        monto: capitalMonto, concepto: 'Ingreso a Capital', tipo: 'Capital',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Apartado de capital del pedido ${pedidoData.folio}`, relatedOrderId: pedidoId
                    });
                }

                if (utilidadNegocio !== 0) {
                    const utilidadNegocioRef = db.collection('movimientos').doc();
                    t.set(utilidadNegocioRef, {
                        monto: utilidadNegocio, concepto: 'Ingreso Utilidad Negocio', tipo: 'Utilidad Negocio',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Negocio (50%) del pedido ${pedidoData.folio}`, relatedOrderId: pedidoId
                    });
                }
                if (utilidadUlises !== 0) {
                    const utilidadUlisesRef = db.collection('movimientos').doc();
                    t.set(utilidadUlisesRef, {
                        monto: utilidadUlises, concepto: 'Ingreso Utilidad Socio', tipo: 'Utilidad Socio', socio: 'Ulises',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Ulises (25%) del pedido ${pedidoData.folio}`, relatedOrderId: pedidoId
                    });
                }
                if (utilidadDariana !== 0) {
                    const utilidadDarianaRef = db.collection('movimientos').doc();
                    t.set(utilidadDarianaRef, {
                        monto: utilidadDariana, concepto: 'Ingreso Utilidad Socio', tipo: 'Utilidad Socio', socio: 'Dariana',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Dariana (25%) del pedido ${pedidoData.folio}`, relatedOrderId: pedidoId
                    });
                }

                const finanzasRef = db.collection('finanzas').doc('resumen');
                t.update(finanzasRef, {
                    ventas: firebase.firestore.FieldValue.increment(totalVenta),
                    gastos: firebase.firestore.FieldValue.increment(gastoEnvio),
                    capital: firebase.firestore.FieldValue.increment(capitalMonto),
                    utilidad: firebase.firestore.FieldValue.increment(utilidadTotal),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(utilidadNegocio),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(utilidadUlises),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(utilidadDariana)
                });

                for (const producto of pedidoData.productos) if (producto.id) t.update(db.collection('productos').doc(producto.id), { cantidadVendida: firebase.firestore.FieldValue.increment(producto.cantidad || 1) });

                if (pedidoData.empaque && empaqueInsumoMap[pedidoData.empaque]) {
                    const insumoName = empaqueInsumoMap[pedidoData.empaque];
                    const insumosQueryRef = db.collection('inventarioInsumos').where('descripcion', '==', insumoName).limit(1);
                    const insumoSnapshot = await t.get(insumosQueryRef);
                    if (!insumoSnapshot.empty) {
                        const insumoDocRef = insumoSnapshot.docs[0].ref;
                        t.update(insumoDocRef, { cantidad: firebase.firestore.FieldValue.increment(-1) });
                    } else { console.warn(`Insumo de empaque "${insumoName}" no encontrado.`); }
                }
            }

            t.update(pedidoRef, updatesForOrder);
        });
        showMessage(`Pedido actualizado a '${newStatus}'. Reparto de utilidad registrado.`);
    } catch (error) {
        console.error("Error al actualizar estado y registrar reparto: ", error);
        showMessage('Error al actualizar el estado del pedido y registrar reparto.');
    }
}

function promptCancelOrder(pedidoId, event) {
    event.stopPropagation();
    const motivo = prompt("Introduce el motivo de la cancelación:");
    if (motivo && motivo.trim()) updateOrderStatus(pedidoId, 'Cancelado', event);
    else if (motivo !== null) showMessage("Debes especificar un motivo para cancelar.");
}

function loadSalesHistory() {
    const list = getEl('sales-history-list');
    list.innerHTML = '<p>Cargando historial...</p>';
    const q = db.collection('pedidos').orderBy('fechaCreacion', 'desc');
    const unsubscribe = q.onSnapshot((snapshot) => {
        const pedidos = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        list.innerHTML = pedidos.length ? '' : '<p>No hay pedidos en el historial.</p>';
        pedidos.forEach(pedido => {
            const total = pedido.montoTotal || 0;
            const clienteNombre = (pedido.datosCliente?.nombre || '').trim() || pedido.clienteManual || 'N/A';

            const detallesEntrega = generarDetallesEntregaHTML(pedido);

            const item = document.createElement('li');
            item.className = 'sale-item';
            item.innerHTML = `
                <div class="sale-summary">
                    <span>${pedido.folio || 'Venta Manual'} - ${clienteNombre}</span>
                    <span class="order-status status-${pedido.estado}">${pedido.estado}</span>
                    <span>$${total.toFixed(2)}</span>
                </div>
                <div class="sale-details">
                    <p><strong>Cliente:</strong> ${clienteNombre}</p>
                    <p><strong>Canal de Venta:</strong> ${pedido.canalVenta || 'Tienda en línea'}</p>
                    <p><strong>Teléfono:</strong> ${pedido.datosCliente?.telefono || 'N/A'}</p>
                    <p><strong>Fecha de Finalización:</strong> ${pedido.fechaActualizacion?.toDate().toLocaleDateString() || 'N/A'}</p>
                    ${detallesEntrega}
                    <p><strong>Método de Pago:</strong> ${pedido.metodoPago || 'N/A'}</p>
                    <p><strong>Productos:</strong></p>
                    <ul>${(pedido.productos || []).map(p => `<li>${p.nombre} (x${p.cantidad || 1})</li>`).join('')}</ul>
                    <div class="product-actions">
                        <button class="btn btn-delete" onclick="event.stopPropagation(); showConfirmModal('order', '${pedido.id}', '¿Seguro que quieres eliminar el pedido ${pedido.folio}? Esta acción revertirá las finanzas asociadas y devolverá el stock. NO SE PUEDE DESHACER.')">Eliminar Pedido</button>
                    </div>
                </div>`;
            item.querySelector('.sale-summary').onclick = (e) => e.currentTarget.nextElementSibling.style.display = e.currentTarget.nextElementSibling.style.display === 'block' ? 'none' : 'block';
            list.appendChild(item);
        });
    });
    unsubscribes.push(unsubscribe);
}

async function loadMovementCategories() {
    const select = getEl('movement-filter-category');
    select.innerHTML = '<option value="all">Todas las categorías</option>';
    // Se añaden los nuevos tipos de utilidad aquí
    const fixedCategories = ['Ventas', 'Gastos', 'Utilidad', 'Capital', 'Utilidad Negocio', 'Utilidad Socio'];
    const categories = new Set(fixedCategories);
    try {
        // Cargar conceptos de gastos para agregarlos al filtro
        const gastosSnap = await db.collection('movimientos').where('tipo', '==', 'Gastos').get();
        gastosSnap.forEach(doc => {
            if(doc.data().concepto) categories.add(doc.data().concepto);
        });

        const orderedCategories = Array.from(categories).sort();
        select.innerHTML = '<option value="all">Todas las categorías</option>'; // Reset
        orderedCategories.forEach(cat => {
            if (cat) select.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    } catch (error) { console.error("Error al cargar categorías:", error); }
}

async function loadMovementsHistory() {
    const list = getEl('movements-list');
    list.innerHTML = '<p>Cargando historial...</p>';
    const selectedCategory = getEl('movement-filter-category').value;
    try {
        let allMovements = [];

        // Cargar todos los movimientos
        const movementsSnap = await db.collection('movimientos').get();
        movementsSnap.forEach(doc => {
            const d = doc.data();
            if (d.fecha) {
                allMovements.push({
                    id: doc.id,
                    date: d.fecha.toDate(),
                    description: d.nota || d.concepto,
                    type: d.tipo,
                    amount: d.monto,
                    category: d.tipo === 'Gastos' ? d.concepto : d.tipo
                });
            }
        });

        // Cargar ventas
        const salesSnapshot = await db.collection('pedidos').where('estado', '==', 'Entregado').get();
        salesSnapshot.forEach(doc => {
            const d = doc.data();
            if (d.fechaActualizacion) {
                allMovements.push({ id: doc.id, date: d.fechaActualizacion.toDate(), description: `Venta #${d.folio || d.clienteManual}`, type: 'Venta', amount: d.montoTotal || 0, category: 'Ventas' });
            }
        });

        const filteredMovements = selectedCategory === 'all'
            ? allMovements
            : allMovements.filter(m => {
                if (selectedCategory === 'Gastos') return m.type.includes('Gasto');
                return m.category === selectedCategory;
            });

        filteredMovements.sort((a, b) => b.date - a.date);

        list.innerHTML = filteredMovements.length ? '' : '<p>No hay movimientos en esta categoría.</p>';
        filteredMovements.forEach(m => {
            const amountClass = m.amount >= 0 ? 'amount-positive' : 'amount-negative';
            const amountSign = m.amount >= 0 ? '+' : '';
            const description = m.description || m.type;
            list.innerHTML += `
                <li class="card-item">
                    <div class="card-header" style="display: block; text-align: left;">
                        <p style="display:flex; justify-content: space-between;">
                            <span>${description}</span>
                            <span class="${amountClass}">${amountSign}$${Math.abs(m.amount).toFixed(2)}</span>
                        </p>
                        <p style="font-size: 0.8em; color: var(--text-secondary); margin-top: 5px;">
                            ${m.date.toLocaleDateString()} - ${m.category}
                        </p>
                    </div>
                </li>
            `;
        });
    } catch (error) {
        console.error("Error al cargar movimientos:", error);
        list.innerHTML = '<p>Error al cargar movimientos.</p>';
    }
}

async function deleteMovement(id, type, amount, category) {
    if (!confirm("¿Estás seguro de que quieres eliminar este movimiento? Esta acción no se puede deshacer.")) return;
    try {
        let collectionRef, originalDoc;

        if (type === 'Gasto General') {
            collectionRef = db.collection('gastosGenerales');
            originalDoc = await collectionRef.doc(id).get();
            if (!originalDoc.exists) { showMessage("Movimiento no encontrado."); return; }
            const monto = originalDoc.data().monto;
            await db.runTransaction(async (t) => {
                t.delete(collectionRef.doc(id));
                const finanzasRef = db.collection('finanzas').doc('resumen');
                t.update(finanzasRef, {
                    gastos: firebase.firestore.FieldValue.increment(-monto),
                    utilidad: firebase.firestore.FieldValue.increment(monto)
                });
            });
        } else if (type === 'Gasto Insumo') {
            collectionRef = db.collection('insumos');
            originalDoc = await collectionRef.doc(id).get();
            if (!originalDoc.exists) { showMessage("Movimiento no encontrado."); return; }
            const costoTotal = originalDoc.data().costoTotal;
            await db.runTransaction(async (t) => {
                t.delete(collectionRef.doc(id));
                const finanzasRef = db.collection('finanzas').doc('resumen');
                t.update(finanzasRef, {
                    gastos: firebase.firestore.FieldValue.increment(-costoTotal),
                    utilidad: firebase.firestore.FieldValue.increment(costoTotal)
                });
            });
        } else if (type === 'Gasto Re-Stock') {
            collectionRef = db.collection('restocks');
            originalDoc = await collectionRef.doc(id).get();
            if (!originalDoc.exists) { showMessage("Movimiento no encontrado."); return; }
            const restockData = originalDoc.data();
            const batch = db.batch();

            restockData.items.forEach(item => {
                const productRef = db.collection('productos').doc(item.id);
                batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(-item.cantidad) });
            });

            const finanzasRef = db.collection('finanzas').doc('resumen');
            batch.update(finanzasRef, {
                capital: firebase.firestore.FieldValue.increment(restockData.costoTotal)
            });

            batch.delete(collectionRef.doc(id));
            await batch.commit();
        } else {
            showMessage("No se puede eliminar este tipo de movimiento.");
            return;
        }

        showMessage('Movimiento eliminado con éxito.');
        loadMovementsHistory();
    } catch (error) {
        console.error("Error al eliminar movimiento: ", error);
        showMessage('Hubo un error al eliminar el movimiento.');
    }
}

function loadFinancialSummary() {
    const unsub = db.collection('finanzas').doc('resumen').onSnapshot(doc => {
        const data = doc.data() || {};
        getEl('total-sales').textContent = `$${(data.ventas || 0).toFixed(2)}`;
        getEl('total-expenses').textContent = `$${(data.gastos || 0).toFixed(2)}`;
        getEl('total-profit').textContent = `$${(data.utilidad || 0).toFixed(2)}`;
        getEl('total-capital').textContent = `$${(data.capital || 0).toFixed(2)}`;
        // Asegúrate de que los IDs coincidan con los que pusiste en el HTML del panel financiero
        if (getEl('total-profit-negocio')) {
            getEl('total-profit-negocio').textContent = `$${(data.utilidadNegocioTotal || 0).toFixed(2)}`;
        }
        if (getEl('total-profit-ulises')) {
            getEl('total-profit-ulises').textContent = `$${(data.utilidadUlisesTotal || 0).toFixed(2)}`;
        }
        if (getEl('total-profit-dariana')) {
            getEl('total-profit-dariana').textContent = `$${(data.utilidadDarianaTotal || 0).toFixed(2)}`;
        }
    });
    unsubscribes.push(unsub);
}

async function loadExpenseConcepts() {
    const select = getEl('expense-concept');
    const unsub = db.collection('conceptosGastos').orderBy('nombre').onSnapshot(snapshot => {
        expenseConcepts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        select.innerHTML = '<option value="">Selecciona un concepto</option>';
        expenseConcepts.forEach(c => select.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);
    });
    unsubscribes.push(unsub);
}

async function addNewExpenseConcept() {
    const newConcept = prompt("Escribe el nombre del nuevo concepto de gasto:");
    if (newConcept && newConcept.trim()) {
        try {
            await db.collection('conceptosGastos').add({ nombre: newConcept.trim() });
            showMessage("Concepto agregado.");
        } catch (error) { showMessage("Error al agregar el concepto."); }
    }
}

const addExpenseForm = getEl('add-expense-form');
if (addExpenseForm) {
    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = parseFloat(getEl('expense-amount').value);
        const concepto = getEl('expense-concept').value;
        const nota = getEl('expense-note').value;
        if (!monto || !concepto) { showMessage("Por favor, completa todos los campos."); return; }
        try {
            const finanzasRef = db.collection('finanzas').doc('resumen');
            const gastoRef = db.collection('movimientos').doc();

            const batch = db.batch();

            batch.set(gastoRef, {
                monto: -monto,
                concepto: concepto,
                tipo: 'Gastos',
                nota: nota,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });

            batch.update(finanzasRef, {
                gastos: firebase.firestore.FieldValue.increment(monto),
                utilidad: firebase.firestore.FieldValue.increment(-monto)
            });

            await batch.commit();

            showMessage('Gasto registrado con éxito!');
            getEl('add-expense-form').reset();
        } catch (error) {
            console.error(error);
            showMessage('Error al registrar el gasto.');
        }
    });
}

const addSupplyForm = getEl('add-supply-form');
if (addSupplyForm) {
    addSupplyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const descripcion = getEl('supply-description').value;
        const cantidad = parseInt(getEl('supply-quantity').value);
        const costoUnidad = parseFloat(getEl('supply-cost').value);
        if (!descripcion || isNaN(cantidad) || isNaN(costoUnidad) || cantidad <= 0 || costoUnidad < 0) {
            showMessage("Por favor, completa todos los campos correctamente.");
            return;
        }
        const costoTotal = cantidad * costoUnidad;
        try {
            const finanzasRef = db.collection('finanzas').doc('resumen');
            const insumoRef = db.collection('insumos').doc();
            const movimientoRef = db.collection('movimientos').doc();

            const batch = db.batch();

            batch.set(insumoRef, {
                descripcion,
                cantidad,
                costoUnidad,
                costoTotal,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });

            batch.set(movimientoRef, {
                monto: -costoTotal,
                concepto: 'Compra de Insumos',
                tipo: 'Gastos',
                nota: `${cantidad} x ${descripcion}`,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });

            batch.update(finanzasRef, {
                gastos: firebase.firestore.FieldValue.increment(costoTotal),
                utilidad: firebase.firestore.FieldValue.increment(-costoTotal)
            });

            await batch.commit();

            showMessage('Insumo registrado con éxito!');
            getEl('add-supply-form').reset();
        } catch (error) {
            console.error("Error al registrar insumo:", error);
            showMessage('Hubo un error al registrar el insumo.');
        }
    });
}

function loadSupplies() {
    const tbody = getEl('supplies-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Cargando insumos...</td></tr>';
    const unsub = db.collection('insumos').orderBy('fecha', 'desc').onSnapshot(snapshot => {
        const supplies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tbody.innerHTML = supplies.length ? '' : '<tr><td colspan="4">No hay insumos registrados.</td></tr>';
        supplies.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.descripcion}</td>
                    <td>${s.cantidad}</td>
                    <td>$${s.costoTotal.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-delete" onclick="deleteSupply('${s.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
    });
    unsubscribes.push(unsub);
}

async function deleteSupply(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar este insumo? Esta acción no se puede deshacer.")) return;
    try {
        const doc = await db.collection('insumos').doc(id).get();
        if (!doc.exists) { showMessage("Insumo no encontrado."); return; }
        const costoTotal = doc.data().costoTotal;

        await db.collection('insumos').doc(id).delete();

        const finanzasRef = db.collection('finanzas').doc('resumen');
        await db.runTransaction(async (t) => {
            const finanzasDoc = await t.get(finanzasRef);
            const gastos = (finanzasDoc.data()?.gastos || 0) - costoTotal;
            const utilidad = (finanzasDoc.data()?.utilidad || 0) + costoTotal;
            t.update(finanzasRef, { gastos, utilidad });
        });

        showMessage('Insumo eliminado con éxito.');
    } catch (error) {
        console.error("Error al eliminar insumo: ", error);
        showMessage('Hubo un error al eliminar el insumo.');
    }
}

async function loadProductModels() {
    const snapshot = await db.collection('productos').orderBy('nombre').get();
    productModels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function addRestockLine() {
    const container = getEl('restock-items');
    const newLine = document.createElement('div');
    newLine.className = 'restock-line';
    const options = productModels.map(p => `<option value="${p.id}" data-price="${p.precio}">${p.nombre} (${p.categoria})</option>`).join('');
    newLine.innerHTML = `
        <select class="restock-product-select" required>
            <option value="" disabled selected>Modelo</option>
            ${options}
        </select>
        <input type="number" class="restock-quantity-input" placeholder="Cantidad" min="1" value="1" required>
        <input type="number" class="restock-cost-input" placeholder="Costo ($)" step="0.01" min="0" required>
        <button type="button" class="btn btn-delete" onclick="this.parentNode.remove(); calculateRestockTotal()">-</button>
    `;
    container.appendChild(newLine);
    newLine.querySelector('.restock-quantity-input').oninput = calculateRestockTotal;
    newLine.querySelector('.restock-cost-input').oninput = calculateRestockTotal;
}

function calculateRestockTotal() {
    const lines = document.querySelectorAll('.restock-line');
    let total = parseFloat(getEl('shipping-cost').value) || 0;
    lines.forEach(line => {
        const quantity = parseInt(line.querySelector('.restock-quantity-input').value) || 0;
        const cost = parseFloat(line.querySelector('.restock-cost-input').value) || 0;
        total += quantity * cost;
    });
    getEl('restock-total').textContent = `$${total.toFixed(2)}`;
}

const shippingCostEl = getEl('shipping-cost');
if(shippingCostEl) {
    shippingCostEl.addEventListener('input', calculateRestockTotal);
}

const addRestockForm = getEl('add-restock-form');
if (addRestockForm) {
    addRestockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lines = document.querySelectorAll('.restock-line');
        const restockItems = [];
        let totalCost = parseFloat(getEl('shipping-cost').value) || 0;

        lines.forEach(line => {
            const productId = line.querySelector('.restock-product-select').value;
            const quantity = parseInt(line.querySelector('.restock-quantity-input').value) || 0;
            const cost = parseFloat(line.querySelector('.restock-cost-input').value) || 0;
            if (!productId || quantity <= 0 || cost < 0) return;
            const product = productModels.find(p => p.id === productId);
            if (product) {
                restockItems.push({ id: productId, nombre: `${product.nombre} (${product.categoria})`, cantidad: quantity, costoUnidad: cost });
                totalCost += quantity * cost;
            }
        });

        if (restockItems.length === 0) { showMessage("Debes agregar al menos un producto para el re-stock."); return; }

        try {
            const restockRef = await db.collection('restocks').add({
                items: restockItems,
                costoTotal: totalCost,
                costoEnvio: parseFloat(getEl('shipping-cost').value) || 0,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                folio: `RS-${Date.now()}`
            });

            const batch = db.batch();
            restockItems.forEach(item => {
                const productRef = db.collection('productos').doc(item.id);
                batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(item.cantidad) });
            });

            const finanzasRef = db.collection('finanzas').doc('resumen');
            batch.update(finanzasRef, {
                capital: firebase.firestore.FieldValue.increment(-totalCost)
            });

            await batch.commit();

            showMessage('Pedido de re-stock registrado y stock actualizado con éxito!');
            getEl('add-restock-form').reset();
            getEl('restock-items').innerHTML = '';
            addRestockLine();
            calculateRestockTotal();
            loadRestockHistory();
        } catch (error) {
            console.error("Error al registrar re-stock:", error);
            showMessage('Hubo un error al registrar el re-stock.');
        }
    });
}


// --- FUNCIÓN ESPECIAL PARA RECALCULAR UTILIDADES PASADAS (EJECUTAR UNA SOLA VEZ) ---
async function recalcularUtilidadesPasadas() {
    console.log("Iniciando recálculo de utilidades pasadas...");
    showMessage("Procesando recálculo de utilidades pasadas... Esto puede tardar un momento. Revisa la consola para ver el resultado.");

    let totalUtilidadNegocioRetro = 0;
    let totalUtilidadUlisesRetro = 0;
    let totalUtilidadDarianaRetro = 0;
    let utilidadTotalGeneralRetro = 0; // Para verificar
    let contadorPedidos = 0;

    try {
        // 1. Obtener costos actuales
        const configRef = db.collection('configuracion').doc('tienda');
        const configDoc = await configRef.get();
        const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
        const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;
        console.log(`Usando Costo por Producto: ${costPerProduct}, Costo Envío: ${shippingCost}`);

        // 2. Obtener todos los pedidos entregados
        const q = db.collection('pedidos').where('estado', '==', 'Entregado');
        const snapshot = await q.get();
        contadorPedidos = snapshot.size;
        console.log(`Se encontraron ${contadorPedidos} pedidos entregados.`);

        if (contadorPedidos === 0) {
            showMessage("No hay pedidos entregados para recalcular.");
            return;
        }

        // 3. Calcular utilidades repartidas para cada pedido
        snapshot.forEach(doc => {
            const pedido = doc.data();
            const totalVenta = pedido.montoTotal || 0;
            const numeroProductos = pedido.productos?.reduce((sum, p) => sum + (p.cantidad || 1), 0) || 0;
            const hasShipping = pedido.datosEntrega?.tipo === 'Envío a domicilio';
            const gastoEnvio = hasShipping ? shippingCost : 0;
            const capitalMonto = numeroProductos * costPerProduct;
            const utilidadTotal = totalVenta - capitalMonto - gastoEnvio;

            // Acumular los repartos calculados
            totalUtilidadNegocioRetro += utilidadTotal * 0.50;
            totalUtilidadUlisesRetro += utilidadTotal * 0.25;
            totalUtilidadDarianaRetro += utilidadTotal * 0.25;
            utilidadTotalGeneralRetro += utilidadTotal; // Suma de verificación
        });

        console.log("--- Totales Recalculados ---");
        console.log(`Utilidad Total General (verificación): $${utilidadTotalGeneralRetro.toFixed(2)}`);
        console.log(`Utilidad Negocio (50%): $${totalUtilidadNegocioRetro.toFixed(2)}`);
        console.log(`Utilidad Ulises (25%): $${totalUtilidadUlisesRetro.toFixed(2)}`);
        console.log(`Utilidad Dariana (25%): $${totalUtilidadDarianaRetro.toFixed(2)}`);

        // 4. Actualizar el documento finanzas/resumen
        const finanzasRef = db.collection('finanzas').doc('resumen');

        // Usamos set con merge para asegurar que los campos existan y se sobreescriban
        await finanzasRef.set({
            utilidadNegocioTotal: totalUtilidadNegocioRetro,
            utilidadUlisesTotal: totalUtilidadUlisesRetro,
            utilidadDarianaTotal: totalUtilidadDarianaRetro,
            utilidad: utilidadTotalGeneralRetro // Actualizamos también la utilidad total general recalculada
        }, { merge: true });

        console.log("¡Éxito! Los totales de utilidad repartida en finanzas/resumen han sido actualizados con los valores recalculados.");
        showMessage(`¡Recálculo completado! Se procesaron ${contadorPedidos} pedidos. Totales actualizados.`);
        loadFinancialSummary(); // Recargar el panel financiero para ver los cambios

    } catch (error) {
        console.error("Error durante el recálculo de utilidades pasadas:", error);
        showMessage("Error durante el recálculo. Revisa la consola.");
    }
}

function loadRestockHistory() {
    const list = getEl('restock-history-list');
    list.innerHTML = '<p>Cargando historial...</p>';
    const unsub = db.collection('restocks').orderBy('fecha', 'desc').onSnapshot(snapshot => {
        const restocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.innerHTML = restocks.length ? '' : '<p>No hay re-stocks registrados.</p>';
        restocks.forEach(r => {
            const itemsList = r.items.map(i => `<li>${i.nombre} (x${i.cantidad})</li>`).join('');
            const item = document.createElement('li');
            item.className = 'card-item';
            item.innerHTML = `
                <div class="card-header">
                    <span>Re-Stock #${r.folio}</span>
                    <span class="amount-negative">-$${r.costoTotal.toFixed(2)}</span>
                </div>
                <div class="card-content">
                    <p><strong>Fecha:</strong> ${r.fecha?.toDate().toLocaleDateString() || 'N/A'}</p>
                    <p><strong>Costo de Envío:</strong> $${(r.costoEnvio || 0).toFixed(2)}</p>
                    <p><strong>Productos:</strong></p>
                    <ul>${itemsList}</ul>
                </div>
                <div class="card-actions"><button class="btn btn-delete" onclick="deleteRestock('${r.id}')">Eliminar</button></div>
            `;
            list.appendChild(item);
        });
    });
    unsubscribes.push(unsub);
}

async function deleteRestock(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar este re-stock? Esto revertirá los cambios en el inventario y las finanzas.")) return;
    try {
        const restockDoc = await db.collection('restocks').doc(id).get();
        if (!restockDoc.exists) { showMessage("Re-stock no encontrado."); return; }
        const restockData = restockDoc.data();

        const batch = db.batch();

        restockData.items.forEach(item => {
            const productRef = db.collection('productos').doc(item.id);
            batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(-item.cantidad) });
        });

        const finanzasRef = db.collection('finanzas').doc('resumen');
        batch.update(finanzasRef, {
            capital: firebase.firestore.FieldValue.increment(restockData.costoTotal)
        });

        batch.delete(db.collection('restocks').doc(id));

        await batch.commit();

        showMessage('Re-stock eliminado y movimientos revertidos con éxito.');
        loadRestockHistory();
    } catch (error) {
        console.error("Error al eliminar re-stock: ", error);
        showMessage('Hubo un error al eliminar el re-stock.');
    }
}

function loadSalesData() {
    const container = getEl('sales-list'); // Reutilizamos el ID aunque ahora será tabla
    container.innerHTML = '<p>Cargando datos...</p>';
    
    const q = db.collection('pedidos').where('estado', '==', 'Entregado').orderBy('fechaActualizacion', 'desc').limit(50); // Limitamos a 50 para no saturar
    
    const unsubscribe = q.onSnapshot(snapshot => {
        const salesByDate = {};
        
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay ventas registradas.</p>';
            return;
        }

        // Construimos tabla
        let htmlTable = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Folio</th>
                            <th>Cliente</th>
                            <th>Canal</th>
                            <th>Fecha</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        snapshot.forEach(doc => {
            const pedido = doc.data();
            const total = pedido.montoTotal || 0;
            const fechaRaw = pedido.fechaActualizacion?.toDate();
            const fechaStr = fechaRaw ? fechaRaw.toLocaleDateString() : 'N/A';
            const fechaISO = fechaRaw ? fechaRaw.toISOString().split('T')[0] : '';
            
            // Datos para gráfica
            if (fechaISO) {
                salesByDate[fechaISO] = (salesByDate[fechaISO] || 0) + total;
            }

            const cliente = `${pedido.datosCliente?.nombre || ''} ${pedido.datosCliente?.apellido || ''}`.trim() || pedido.clienteManual || 'Anon';
            const folio = pedido.folio || 'MANUAL';

            htmlTable += `
                <tr>
                    <td style="font-weight:bold;">${folio}</td>
                    <td>${cliente}</td>
                    <td>${pedido.canalVenta || 'Web'}</td>
                    <td>${fechaStr}</td>
                    <td style="color:var(--success); font-weight:bold;">$${total.toFixed(2)}</td>
                </tr>
            `;
        });

        htmlTable += `</tbody></table></div>`;
        container.innerHTML = htmlTable;
        
        updateChart(salesByDate);
    });
    
    unsubscribes.push(unsubscribe);
}

function updateChart(salesData) {
    const ctx = getEl('sales-chart').getContext('2d');
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(salesData).sort(),
            datasets: [{ label: 'Ventas Diarias', data: Object.values(salesData), borderColor: '#48dbfb', tension: 0.1 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function showSalesHistoryModal() {
    getEl('modal-history-title').textContent = "Historial de Ventas";
    const list = getEl('modal-sales-list');
    list.innerHTML = '<p>Cargando ventas...</p>';
    const q = db.collection('pedidos').where('estado', '==', 'Entregado').orderBy('fechaActualizacion', 'desc');
    const unsub = q.onSnapshot(snapshot => {
        const sales = snapshot.docs.map(doc => doc.data());
        list.innerHTML = sales.length ? '' : '<p>No hay ventas.</p>';
        sales.forEach(p => {
            list.innerHTML += `<li class="sales-history-item"><div class="sales-summary"><span>#${p.folio || 'Manual'} - ${p.fechaActualizacion.toDate().toLocaleDateString()}</span><span>$${(p.montoTotal || 0).toFixed(2)}</span></div></li>`;
        });
    });
    unsubscribes.push(unsub);
    getEl('sales-history-modal').style.display = 'flex';
}

function closeSalesHistoryModal() { getEl('sales-history-modal').style.display = 'none'; }

const imageModal = getEl('image-modal');
const modalImg = getEl('modal-image');

function verImagen(imagenSrc) {
    if (imageModal && modalImg) {
        imageModal.style.display = 'flex';
        modalImg.src = imagenSrc;
    }
}

function cerrarModal() {
    if (imageModal) {
        imageModal.style.display = 'none';
    }
}

function showMessage(text) {
    const msgBox = getEl('message-box');
    if (!msgBox) {
        alert(text);
        return;
    }
    getEl('message-text').textContent = text;
    msgBox.style.display = 'flex';
}
function closeMessage() { getEl('message-box').style.display = 'none'; }
function closeEditModal() { getEl('edit-modal').style.display = 'none'; }

function showConfirmModal(type, id, text, extraData = null) {
    getEl('confirm-text').textContent = text;
    actionToConfirm = () => {
        if (type === 'product') {
            deleteProduct(id);
        } else if (type === 'raw-material') {
            deleteRawMaterial(id);
        } else if (type === 'order') {
            deleteOrder(id);
        } else if (type === 'packaging') { // AÑADIDO
            deletePackaging(id);
        } else if (type === 'video') { // AÑADIDO
            deleteVideo(id);
        }
    };
    getEl('confirm-modal').style.display = 'flex';
}

function cancelAction() {
    getEl('confirm-modal').style.display = 'none';
    actionToConfirm = null;
}

async function confirmAction() {
    if (actionToConfirm) {
        await actionToConfirm();
    }
    cancelAction();
}

async function deleteProduct(id) {
    try {
        await db.collection('productos').doc(id).delete();
        showMessage('Producto eliminado.');
        loadInventory();
    } catch (error) {
        showMessage('Error al eliminar el producto.');
    }
}

// ====================================================================================
// --- NUEVAS FUNCIONES Y CORRECCIONES INTEGRADAS ---
// ====================================================================================

// --- CORRECCIÓN 1: LÓGICA PARA ELIMINAR PEDIDOS ---
async function deleteOrder(pedidoId) {
    try {
        const pedidoRef = db.collection('pedidos').doc(pedidoId);
        const pedidoDoc = await pedidoRef.get();

        if (!pedidoDoc.exists) {
            throw new Error("El pedido que intentas eliminar no existe.");
        }

        const pedidoData = pedidoDoc.data();

        if (pedidoData.estado === 'Entregado') {
            const batch = db.batch();
            const finanzasRef = db.collection('finanzas').doc('resumen');

            const totalVenta = pedidoData.montoTotal || 0;
            const numeroProductos = pedidoData.productos?.reduce((sum, p) => sum + (p.cantidad || 1), 0) || 0;
            const hasShipping = pedidoData.datosEntrega?.tipo === 'Envío a domicilio';
            const gastoEnvio = hasShipping ? SHIPPING_COST : 0;
            const capitalMonto = numeroProductos * CAPITAL_PER_PRODUCT;
            const utilidadMonto = totalVenta - capitalMonto - gastoEnvio;

            batch.update(finanzasRef, {
                ventas: firebase.firestore.FieldValue.increment(-totalVenta),
                gastos: firebase.firestore.FieldValue.increment(-gastoEnvio),
                utilidad: firebase.firestore.FieldValue.increment(-utilidadMonto),
                capital: firebase.firestore.FieldValue.increment(-capitalMonto)
            });

            for (const producto of pedidoData.productos) {
                if (producto.id) {
                    const productoRef = db.collection('productos').doc(producto.id);
                    batch.update(productoRef, {
                        stock: firebase.firestore.FieldValue.increment(producto.cantidad || 1),
                        cantidadVendida: firebase.firestore.FieldValue.increment(-(producto.cantidad || 1))
                    });
                }
            }

            const movimientosQuery = await db.collection('movimientos').where('relatedOrderId', '==', pedidoId).get();
            movimientosQuery.forEach(doc => {
                batch.delete(doc.ref);
            });

            batch.delete(pedidoRef);
            await batch.commit();

        } else {
            await pedidoRef.delete();
        }

        showMessage('Pedido eliminado y todas las operaciones revertidas con éxito.');
        loadSalesHistory();
    } catch (error) {
        console.error("Error al eliminar el pedido:", error);
        showMessage('Hubo un error al eliminar el pedido: ' + error.message);
    }
}

// --- CORRECCIÓN 2: LÓGICA PARA MOSTRAR HISTORIAL DESDE TARJETAS ---
async function showMovementsHistory(category, socio = null) {
    const modal = getEl('sales-history-modal');
    const modalTitle = getEl('modal-history-title');
    const modalList = getEl('modal-sales-list');

    // Si ya estamos en la pantalla de historial, solo cambia el filtro
    if (getEl('movements-history-screen').style.display === 'block') {
        // Asegúrate de que la pantalla esté visible antes de intentar cambiar el filtro
        showScreen('movements-history-screen');
        // Da un pequeño tiempo para que la pantalla cargue y el select esté disponible
        setTimeout(() => {
            const filterSelect = getEl('movement-filter-category');
            if (filterSelect) {
                filterSelect.value = category; // Usa la categoría directamente
                loadMovementsHistory(); // Recarga la lista con el filtro aplicado
            }
        }, 100);
        return; // No mostramos el modal si vamos a la pantalla completa
    }

    // Si no estamos en la pantalla de historial, mostramos el modal
    modalTitle.textContent = `Historial de ${category} ${socio ? '('+socio+')' : ''}`;
    modalList.innerHTML = '<p>Cargando movimientos...</p>';
    modal.style.display = 'flex';

    try {
        let allMovements = [];
        const movementsSnap = await db.collection('movimientos').get();
        movementsSnap.forEach(doc => {
            const d = doc.data();
            if (d.fecha) {
                allMovements.push({
                    id: doc.id, date: d.fecha.toDate(), description: d.nota || d.concepto,
                    type: d.tipo, amount: d.monto,
                    category: d.tipo === 'Gastos' ? d.concepto : d.tipo, // Usa concepto para gastos, tipo para otros
                    socio: d.socio // Agrega el campo socio si existe
                });
            }
        });

        // También incluye las ventas como movimientos positivos de 'Ventas'
        const salesSnapshot = await db.collection('pedidos').where('estado', '==', 'Entregado').get();
        salesSnapshot.forEach(doc => {
            const d = doc.data();
            if (d.fechaActualizacion) {
                allMovements.push({
                    id: doc.id, date: d.fechaActualizacion.toDate(),
                    description: `Venta #${d.folio || d.clienteManual}`, type: 'Ventas', // Tipo 'Ventas'
                    amount: d.montoTotal || 0, category: 'Ventas' // Categoría 'Ventas'
                });
            }
        });

        // Filtrado mejorado
        const filteredMovements = allMovements.filter(m => {
            if (category === 'Gastos') return m.type === 'Gastos'; // Solo movimientos tipo 'Gastos'
            if (category === 'Ventas') return m.type === 'Ventas'; // Solo movimientos tipo 'Ventas' (las ventas agregadas arriba)
            if (category === 'Utilidad Socio') {
                return m.type === 'Utilidad Socio' && (socio ? m.socio === socio : true); // Filtra por tipo y opcionalmente por socio
            }
            // Para Capital y Utilidad Negocio, compara directamente con el tipo
            return m.type === category;
        });

        filteredMovements.sort((a, b) => b.date - a.date);

        modalList.innerHTML = filteredMovements.length ? '' : `<p>No hay movimientos en la categoría ${category}.</p>`;
        filteredMovements.forEach(m => {
            const amountClass = m.amount >= 0 ? 'amount-positive' : 'amount-negative';
            const amountSign = m.amount >= 0 ? '+' : '-'; // Usar '-' para negativos
            modalList.innerHTML += `
                <li class="card-item" style="padding: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; text-align: left;">
                        <div>
                            <p style="font-weight: 500;">${m.description}</p>
                            <p style="font-size: 0.8em; color: var(--text-secondary); margin-top: 5px;">${m.date.toLocaleDateString()}</p>
                        </div>
                        <span class="${amountClass}" style="font-weight: 700;">${amountSign}$${Math.abs(m.amount).toFixed(2)}</span>
                    </div>
                </li>`;
        });
    } catch (error) {
        console.error("Error al cargar movimientos en el modal:", error);
        modalList.innerHTML = '<p>Error al cargar los movimientos.</p>';
    }
}


// --- LÓGICA PARA COSTOS DE PRODUCTO Y ENVÍO ---
async function loadProductCost() {
    try {
        const configRef = db.collection('configuracion').doc('tienda');
        const doc = await configRef.get();
        if (doc.exists && doc.data().costoPorProducto) {
            const cost = doc.data().costoPorProducto;
            CAPITAL_PER_PRODUCT = cost;
            getEl('product-cost-input').value = cost;
        } else {
            getEl('product-cost-input').value = CAPITAL_PER_PRODUCT;
        }
    } catch (error) {
        console.error("Error al cargar costo del producto:", error);
    }
}

async function loadShippingCost() {
    try {
        const configRef = db.collection('configuracion').doc('tienda');
        const doc = await configRef.get();
        if (doc.exists && doc.data().costoEnvio) {
            const cost = doc.data().costoEnvio;
            SHIPPING_COST = cost;
            getEl('shipping-cost-input').value = cost;
        } else {
            getEl('shipping-cost-input').value = SHIPPING_COST;
        }
    } catch (error) {
        console.error("Error al cargar costo de envío:", error);
    }
}

const costConfigForm = getEl('cost-config-form');
if (costConfigForm) {
    costConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newCost = parseFloat(getEl('product-cost-input').value);
        if (isNaN(newCost) || newCost < 0) {
            showMessage("Por favor, introduce un costo de producto válido.");
            return;
        }
        try {
            await db.collection('configuracion').doc('tienda').set({ costoPorProducto: newCost }, { merge: true });
            CAPITAL_PER_PRODUCT = newCost;
            showMessage('Costo por producto actualizado con éxito.');
        } catch (error) {
            showMessage('Error al guardar el costo del producto.');
        }
    });
}

const shippingCostConfigForm = getEl('shipping-cost-config-form');
if (shippingCostConfigForm) {
    shippingCostConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newCost = parseFloat(getEl('shipping-cost-input').value);
        if (isNaN(newCost) || newCost < 0) {
            showMessage("Por favor, introduce un costo de envío válido.");
            return;
        }
        try {
            await db.collection('configuracion').doc('tienda').set({ costoEnvio: newCost }, { merge: true });
            SHIPPING_COST = newCost;
            showMessage('Costo de envío actualizado con éxito.');
        } catch (error) {
            showMessage('Error al guardar el costo de envío.');
        }
    });
}


// --- LÓGICA PARA INVENTARIO DE INSUMOS (CRUD) ---
function loadRawMaterials() {
    const tbody = getEl('raw-materials-table-body');
    tbody.innerHTML = '<tr><td colspan="3">Cargando insumos...</td></tr>';

    const unsub = db.collection('inventarioInsumos').orderBy('descripcion').onSnapshot(snapshot => {
        const materials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tbody.innerHTML = materials.length ? '' : '<tr><td colspan="3">No hay insumos registrados.</td></tr>';

        materials.forEach(material => {
            tbody.innerHTML += `
                <tr>
                    <td>${material.descripcion}</td>
                    <td>${material.cantidad}</td>
                    <td class="actions-cell">
                        <button class="btn btn-edit" onclick="editRawMaterial('${material.id}', '${material.descripcion}', ${material.cantidad})">Editar</button>
                        <button class="btn btn-delete" onclick="showConfirmModal('raw-material', '${material.id}', '¿Eliminar insumo \\'${material.descripcion}\\'?')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
    });
    unsubscribes.push(unsub);
}

const addRawMaterialForm = getEl('add-raw-material-form');
if (addRawMaterialForm) {
    addRawMaterialForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = getEl('raw-material-id').value;
        const description = getEl('raw-material-description').value;
        const quantity = parseInt(getEl('raw-material-quantity').value);

        try {
            if (id) {
                await db.collection('inventarioInsumos').doc(id).update({
                    descripcion: description,
                    cantidad: quantity
                });
                showMessage("Insumo actualizado correctamente.");
            } else {
                await db.collection('inventarioInsumos').add({
                    descripcion: description,
                    cantidad: quantity
                });
                showMessage("Insumo agregado correctamente.");
            }
            cancelEditRawMaterial();
        } catch (error) {
            console.error("Error al guardar insumo:", error);
            showMessage("Error al guardar el insumo.");
        }
    });
}

function editRawMaterial(id, description, quantity) {
    getEl('raw-material-id').value = id;
    getEl('raw-material-description').value = description;
    getEl('raw-material-quantity').value = quantity;
    getEl('add-raw-material-btn').textContent = "Guardar Cambios";
    getEl('cancel-edit-raw-material-btn').style.display = 'block';
}

function cancelEditRawMaterial() {
    getEl('add-raw-material-form').reset();
    getEl('raw-material-id').value = '';
    getEl('add-raw-material-btn').textContent = "Agregar Insumo";
    getEl('cancel-edit-raw-material-btn').style.display = 'none';
}

async function deleteRawMaterial(id) {
    try {
        await db.collection('inventarioInsumos').doc(id).delete();
        showMessage('Insumo eliminado.');
    } catch (error) {
        showMessage('Error al eliminar el insumo.');
    }
}


// --- LÓGICA MEJORADA PARA PEDIDO MANUAL ---

function toggleManualDeliveryFields() {
    const deliveryMethod = getEl('manual-delivery-method').value;
    const homeFields = getEl('manual-home-delivery-fields');
    const pickupFields = getEl('manual-pickup-location-fields');

    if (deliveryMethod === 'domicilio') {
        homeFields.style.display = 'flex';
        pickupFields.style.display = 'none';
        getEl('manual-delivery-street').required = true;
        getEl('manual-delivery-neighborhood').required = true;
        getEl('manual-delivery-date').required = false;
    } else { // punto-medio
        homeFields.style.display = 'none';
        pickupFields.style.display = 'flex';
        getEl('manual-delivery-street').required = false;
        getEl('manual-delivery-neighborhood').required = false;
        getEl('manual-delivery-date').required = true;
    }
    calculateManualOrderTotal();
}

function toggleOtherManualLocation() {
    const locationSelect = getEl('manual-delivery-location');
    const otherNote = getEl('manual-other-location-note');
    const isOther = locationSelect.value === 'Otro';
    otherNote.style.display = isOther ? 'block' : 'none';
    otherNote.required = isOther;
}

function calculateManualOrderTotal() {
    let total = 0;
    document.querySelectorAll('.manual-order-line').forEach(line => {
        const productSelect = line.querySelector('.manual-order-product');
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const price = parseFloat(selectedOption.dataset.price) || 0;
        const quantity = parseInt(line.querySelector('.manual-order-quantity').value) || 0;
        total += price * quantity;
    });

    const deliveryMethod = getEl('manual-delivery-method').value;
    if (deliveryMethod === 'domicilio') {
        total += SHIPPING_COST;
    }

    getEl('manual-order-total').value = total.toFixed(2);
}

function addManualOrderLine() {
    const container = getEl('manual-order-items');
    const newLine = document.createElement('div');
    newLine.className = 'manual-order-line';

    const options = productModels.map(p => `<option value="${p.id}" data-price="${p.precio}">${p.nombre} (Stock: ${p.stock})</option>`).join('');

    newLine.innerHTML = `
        <select class="manual-order-product" onchange="calculateManualOrderTotal()" required>
            <option value="" data-price="0" disabled selected>Selecciona un modelo</option>
            ${options}
        </select>
        <input type="number" class="manual-order-quantity" placeholder="Cant." min="1" value="1" oninput="calculateManualOrderTotal()" required>
        <button type="button" class="btn btn-delete" onclick="this.parentNode.remove(); calculateManualOrderTotal()">-</button>
    `;
    container.appendChild(newLine);
    calculateManualOrderTotal();
}

const manualOrderForm = getEl('manual-order-form');
if (manualOrderForm) {
    manualOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = "Procesando...";

        const clienteManual = getEl('manual-order-client').value;
        const telefonoCliente = getEl('manual-order-phone').value;
        const canalVenta = getEl('manual-order-channel').value;
        const montoTotal = parseFloat(getEl('manual-order-total').value);
        const comentarios = getEl('manual-delivery-comments').value;

        const deliveryMethod = getEl('manual-delivery-method').value;
        let datosEntrega = {};
        if (deliveryMethod === 'domicilio') {
            datosEntrega = {
                tipo: 'Envío a domicilio',
                calle: getEl('manual-delivery-street').value,
                colonia: getEl('manual-delivery-neighborhood').value,
                descripcion: getEl('manual-delivery-description').value || null
            };
        } else {
            const lugarSelect = getEl('manual-delivery-location').value;
            const lugar = (lugarSelect === 'Otro') ? getEl('manual-other-location-note').value : lugarSelect;
            datosEntrega = {
                tipo: 'Punto medio',
                lugar: lugar,
                fecha: getEl('manual-delivery-date').value
            };
        }

        const items = [];
        document.querySelectorAll('.manual-order-line').forEach(line => {
            const productId = line.querySelector('.manual-order-product').value;
            const quantity = parseInt(line.querySelector('.manual-order-quantity').value);
            if (productId && quantity > 0) {
                const productData = productModels.find(p => p.id === productId);
                if(productData) {
                    items.push({
                        id: productId,
                        nombre: productData.nombre,
                        precio: productData.precio,
                        cantidad: quantity
                    });
                }
            }
        });

        if (items.length === 0) {
            showMessage("Debes agregar al menos un producto.");
            submitButton.disabled = false;
            submitButton.textContent = "Registrar Venta";
            return;
        }

        try {
            await db.runTransaction(async (transaction) => {
                const configRef = db.collection('configuracion').doc('tienda');
                const configDoc = await transaction.get(configRef);
                const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
                const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;

                const counterRef = db.collection('contadores').doc('pedidos');
                const counterDoc = await transaction.get(counterRef);
                const nuevoFolioNum = (counterDoc.exists ? counterDoc.data().ultimoFolio : 0) + 1;
                const folioFormateado = `MANUAL-${String(nuevoFolioNum).padStart(4, '0')}`;
                transaction.set(counterRef, { ultimoFolio: nuevoFolioNum }, { merge: true });

                const nuevoPedidoRef = db.collection('pedidos').doc();
                transaction.set(nuevoPedidoRef, {
                    folio: folioFormateado,
                    clienteManual: clienteManual,
                    datosCliente: { nombre: clienteManual, apellido: '', telefono: telefonoCliente },
                    canalVenta: canalVenta,
                    productos: items,
                    montoTotal: montoTotal,
                    estado: 'Entregado',
                    metodoPago: 'Manual',
                    fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
                    fechaActualizacion: firebase.firestore.FieldValue.serverTimestamp(),
                    datosEntrega: datosEntrega,
                    comentarios: comentarios || null
                });

                const hasShipping = datosEntrega.tipo === 'Envío a domicilio';
                const gastoEnvio = hasShipping ? shippingCost : 0;
                const numeroProductosTotal = items.reduce((sum, item) => sum + item.cantidad, 0);
                const capitalMonto = numeroProductosTotal * costPerProduct;
                const utilidadTotal = montoTotal - capitalMonto - gastoEnvio;

                const utilidadNegocio = utilidadTotal * 0.50;
                const utilidadUlises = utilidadTotal * 0.25;
                const utilidadDariana = utilidadTotal * 0.25;

                if (hasShipping) {
                    const gastoEnvioRef = db.collection('movimientos').doc();
                    transaction.set(gastoEnvioRef, {
                        monto: -gastoEnvio, concepto: 'Gasto de Envío', tipo: 'Gastos',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Gasto de envío para venta manual ${folioFormateado}`, relatedOrderId: nuevoPedidoRef.id
                    });
                }

                if (capitalMonto > 0) {
                    const capitalMovRef = db.collection('movimientos').doc();
                    transaction.set(capitalMovRef, {
                        monto: capitalMonto, concepto: 'Ingreso a Capital', tipo: 'Capital',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Apartado de capital de venta manual ${folioFormateado}`, relatedOrderId: nuevoPedidoRef.id
                    });
                }

                if (utilidadNegocio !== 0) {
                    const utilidadNegocioRef = db.collection('movimientos').doc();
                    transaction.set(utilidadNegocioRef, {
                        monto: utilidadNegocio, concepto: 'Ingreso Utilidad Negocio', tipo: 'Utilidad Negocio',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Negocio (50%) de venta manual ${folioFormateado}`, relatedOrderId: nuevoPedidoRef.id
                    });
                }
                if (utilidadUlises !== 0) {
                    const utilidadUlisesRef = db.collection('movimientos').doc();
                    transaction.set(utilidadUlisesRef, {
                        monto: utilidadUlises, concepto: 'Ingreso Utilidad Socio', tipo: 'Utilidad Socio', socio: 'Ulises',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Ulises (25%) de venta manual ${folioFormateado}`, relatedOrderId: nuevoPedidoRef.id
                    });
                }
                if (utilidadDariana !== 0) {
                    const utilidadDarianaRef = db.collection('movimientos').doc();
                    transaction.set(utilidadDarianaRef, {
                        monto: utilidadDariana, concepto: 'Ingreso Utilidad Socio', tipo: 'Utilidad Socio', socio: 'Dariana',
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        nota: `Utilidad Dariana (25%) de venta manual ${folioFormateado}`, relatedOrderId: nuevoPedidoRef.id
                    });
                }

                const finanzasRef = db.collection('finanzas').doc('resumen');
                transaction.update(finanzasRef, {
                    ventas: firebase.firestore.FieldValue.increment(montoTotal),
                    gastos: firebase.firestore.FieldValue.increment(gastoEnvio),
                    capital: firebase.firestore.FieldValue.increment(capitalMonto),
                    utilidad: firebase.firestore.FieldValue.increment(utilidadTotal),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(utilidadNegocio),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(utilidadUlises),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(utilidadDariana)
                });

                for (const item of items) {
                    const productRef = db.collection('productos').doc(item.id);
                    transaction.update(productRef, {
                        stock: firebase.firestore.FieldValue.increment(-item.cantidad),
                        cantidadVendida: firebase.firestore.FieldValue.increment(item.cantidad)
                    });
                }
            }); // Fin de la transacción

            showMessage('Venta manual registrada y reparto aplicado con éxito.');
            getEl('manual-order-form').reset();
            getEl('manual-order-items').innerHTML = '';
            addManualOrderLine();
            toggleManualDeliveryFields();
            calculateManualOrderTotal();

        } catch (error) {
            console.error("Error al registrar venta manual y reparto:", error);
            showMessage("Error al registrar la venta: " + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Registrar Venta";
        }
    });
}


// --- LÓGICA PARA GESTIÓN DE EMPAQUES Y VIDEO ---

// EMPAQUES
const addPackagingForm = getEl('add-packaging-form');
if (addPackagingForm) {
    addPackagingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = getEl('packaging-name').value;
        const imagenUrl = getEl('packaging-image-url').value;
        try {
            await db.collection('empaques').add({
                nombre,
                imagenUrl,
                visible: true,
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('Empaque agregado con éxito.');
            e.target.reset();
            loadPackagingVisibility();
        } catch (error) {
            showMessage('Error al agregar el empaque.');
            console.error(error);
        }
    });
}

async function loadPackagingVisibility() {
    const container = getEl('packaging-list');
    container.innerHTML = '<p>Cargando...</p>';
    try {
        const snapshot = await db.collection('empaques').orderBy('fechaCreacion', 'desc').get();
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay empaques registrados.</p>';
            return;
        }
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const empaque = { id: doc.id, ...doc.data() };
            const itemDiv = document.createElement('div');
            itemDiv.className = 'visibility-item';
            const isVisible = empaque.visible !== false;
            itemDiv.innerHTML = `
                <span>${empaque.nombre}</span>
                <div class="actions">
                    <button class="btn" style="background-color: var(--${isVisible ? 'status-blue' : 'status-green'});" onclick="togglePackagingVisibility('${empaque.id}', ${isVisible})">
                        ${isVisible ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button class="btn btn-delete" onclick="showConfirmModal('packaging', '${empaque.id}', '¿Seguro que quieres eliminar el empaque \\'${empaque.nombre}\\'?')">
                        Eliminar
                    </button>
                </div>
            `;
            container.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error al cargar empaques:", error);
        container.innerHTML = '<p>Error al cargar los empaques.</p>';
    }
}

async function togglePackagingVisibility(id, isVisible) {
    try {
        await db.collection('empaques').doc(id).update({
            visible: !isVisible
        });
        showMessage(`Empaque ahora está ${!isVisible ? 'VISIBLE' : 'OCULTO'}.`);
        loadPackagingVisibility();
    } catch (error) {
        showMessage('Error al actualizar la visibilidad.');
        console.error(error);
    }
}

async function deletePackaging(id) {
    try {
        await db.collection('empaques').doc(id).delete();
        showMessage('Empaque eliminado correctamente.');
        loadPackagingVisibility();
    } catch (error) {
        showMessage('Error al eliminar el empaque.');
        console.error(error);
    }
}

// VIDEO
const addVideoForm = getEl('add-video-form');
if (addVideoForm) {
    addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = getEl('video-name').value;
        const videoUrl = getEl('video-url').value;
        try {
            await db.collection('videos').add({
                nombre,
                videoUrl,
                enPlaylist: false, // Inicia como no incluido en la playlist
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('Video agregado con éxito.');
            e.target.reset();
            loadVideoManagement();
        } catch (error) {
            showMessage('Error al agregar el video.');
            console.error(error);
        }
    });
}

async function loadVideoManagement() {
    const container = getEl('video-list');
    container.innerHTML = '<p>Cargando videos...</p>';
    try {
        const snapshot = await db.collection('videos').orderBy('fechaCreacion', 'desc').get();
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay videos registrados.</p>';
            return;
        }
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const video = { id: doc.id, ...doc.data() };
            const itemDiv = document.createElement('div');
            itemDiv.className = 'visibility-item';
            const isInPlaylist = video.enPlaylist === true;
            itemDiv.innerHTML = `
                <span>${video.nombre} <br><small style="color: var(--text-secondary);">${video.videoUrl}</small></span>
                <div class="actions">
                    <label for="video-${video.id}" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="video-${video.id}" class="playlist-checkbox" onchange="toggleVideoInPlaylist('${video.id}', this.checked)" ${isInPlaylist ? 'checked' : ''}>
                        En Playlist
                    </label>
                    <button class="btn btn-delete" onclick="showConfirmModal('video', '${video.id}', '¿Seguro que quieres eliminar el video \\'${video.nombre}\\'?')">
                        Eliminar
                    </button>
                </div>
            `;
            container.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error al cargar videos:", error);
        container.innerHTML = '<p>Error al cargar los videos.</p>';
    }
}

async function toggleVideoInPlaylist(videoId, isInPlaylist) {
    try {
        await db.collection('videos').doc(videoId).update({
            enPlaylist: isInPlaylist
        });
        showMessage(`Video ${isInPlaylist ? 'añadido a la' : 'quitado de la'} playlist.`);
    } catch (error) {
        showMessage('Error al actualizar el estado del video.');
        console.error(error);
        loadVideoManagement();
    }
}

async function deleteVideo(id) {
    try {
        await db.collection('videos').doc(id).delete();
        showMessage('Video eliminado correctamente.');
        loadVideoManagement();
    } catch (error) {
        showMessage('Error al eliminar el video.');
        console.error(error);
    }
}
// ==============================================
// --- GENERADOR DE PDF ---
// ==============================================
async function descargarReportePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Título del documento
    doc.setFontSize(18);
    doc.text("Reporte de Ventas - KalCTas", 14, 22);
    
    // 2. Fecha de generación
    doc.setFontSize(11);
    doc.setTextColor(100);
    const fecha = new Date().toLocaleDateString('es-MX');
    doc.text(`Generado el: ${fecha}`, 14, 30);

    // 3. Generar la tabla automática
    // Toma los datos directo de tu tabla HTML id="sales-report-table"
    doc.autoTable({
        html: '#sales-report-table',
        startY: 35,
        theme: 'grid', // Estilo tipo Excel limpio
        styles: { fontSize: 7, cellPadding: 2 }, // Letra chiquita para que quepa todo
        headStyles: { fillColor: [26, 26, 46] }, // Color de encabezado (Azul oscuro de tu marca)
        columnStyles: {
            0: { fontStyle: 'bold' }, // Folio en negritas
            4: { halign: 'right' },   // Total alineado a la derecha
            7: { fontStyle: 'bold', fillColor: [230, 255, 230] } // Utilidad resaltada
        }
    });

    // 4. Guardar archivo
    doc.save(`Reporte_Ventas_${fecha.replace(/\//g, '-')}.pdf`);
}