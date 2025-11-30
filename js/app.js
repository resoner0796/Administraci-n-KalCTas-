// ====================================================================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// ====================================================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
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
// const messaging = firebase.messaging(); 

const IMAGES_BASE_URL = 'https://kalctas.com/';
let actionToConfirm = null;
let unsubscribes = [];
let productModels = [];
let expenseConcepts = [];
let salesChart;
let CAPITAL_PER_PRODUCT = 42;
let SHIPPING_COST = 70;

const getEl = (id) => document.getElementById(id);

const empaqueInsumoMap = {
    'Frankie': 'Empaque frankie',
    'Naranja': 'Empaque Halloween Naranja',
    'Tradicional Gris': 'Empaque Tradicional Gris'
};

// ====================================================================================
// 2. NAVEGACIÓN Y PANTALLAS
// ====================================================================================
async function showScreen(screenId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const screen = getEl(screenId);
    if (screen) screen.style.display = 'block';
    
    // Reset logo
    document.querySelectorAll('.logo-img').forEach(img => img.src = IMAGES_BASE_URL + 'LOGO.png');

    unsubscribes.forEach(u => u());
    unsubscribes = [];

    switch(screenId) {
        case 'inventory-screen': loadInventory(); break;
        case 'orders-screen': loadOrders(); break;
        case 'sales-history-screen': loadSalesHistory(); break;
        case 'finance-screen': 
            loadFinancialSummary(); 
            loadExpenseConcepts();
            loadProductCost();
            loadShippingCost();
            break;
        case 'supplies-screen': loadSupplies(); break;
        case 'restock-screen': 
            await loadProductModels(); 
            loadRestockHistory();
            // Reiniciar formulario de restock si existe
            const rItems = getEl('restock-items');
            if(rItems) { rItems.innerHTML = ''; addRestockLine(); }
            break;
        case 'sales-screen': loadSalesData(); break;
        case 'sales-report-table-screen': loadSalesReportTable(); break;
        case 'theme-screen': loadCurrentTheme(); break;
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
            break;
        case 'raw-materials-screen': loadRawMaterials(); break;
        case 'movements-history-screen': 
            loadMovementCategories();
            // Si se llamó desde el menú, carga todo. Si viene de tarjeta, ya tiene filtro.
            if(getEl('movement-filter-category').value === 'all') loadMovementsHistory();
            break;
    }
}

// ====================================================================================
// 3. INVENTARIO
// ====================================================================================
async function loadInventory() {
    const container = getEl('inventory-accordion');
    const controls = getEl('category-visibility-controls');
    container.innerHTML = '<p style="text-align:center; padding:20px;">Cargando inventario...</p>';
    controls.innerHTML = '<h2>Visibilidad</h2>';

    try {
        const visibilitySnap = await db.collection('categorias').get();
        const visibility = {};
        visibilitySnap.forEach(doc => visibility[doc.id] = doc.data().visible);

        const productsSnap = await db.collection('productos').orderBy('nombre').get();
        const productsByCat = { 'KalCTas2-4': [], 'KalCTas3-4': [], 'KalCTasLargas': [] };

        productsSnap.forEach(doc => {
            const p = { id: doc.id, ...doc.data() };
            if (productsByCat[p.categoria]) productsByCat[p.categoria].push(p);
        });

        Object.keys(productsByCat).forEach(cat => {
            const isVisible = visibility[cat] !== false;
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.backgroundColor = 'var(--bg-card)';
            btn.style.border = isVisible ? '1px solid var(--success)' : '1px solid var(--text-muted)';
            btn.style.color = isVisible ? 'var(--success)' : 'var(--text-muted)';
            btn.style.marginRight = '10px';
            btn.innerHTML = `${cat} ${isVisible ? '👁️' : '🙈'}`;
            btn.onclick = () => toggleCategoryVisibility(cat, isVisible);
            controls.appendChild(btn);
        });

        container.innerHTML = ''; 

        for (const [cat, products] of Object.entries(productsByCat)) {
            const separator = document.createElement('div');
            separator.className = 'category-separator';
            separator.textContent = cat;
            separator.style.gridColumn = "1 / -1";
            separator.style.margin = "20px 0 10px 0";
            separator.style.borderBottom = "1px solid var(--border)";
            separator.style.color = "var(--primary)";
            separator.style.fontWeight = "bold";
            container.appendChild(separator);

            const grid = document.createElement('div');
            grid.className = 'inventory-grid';

            if (products.length === 0) {
                grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#666;">Sin productos.</p>';
            } else {
                products.forEach(p => {
                    const isVisible = p.visible !== false;
                    const isOut = p.stock <= 0;
                    const imgUrl = p.imagenUrl.startsWith('http') ? p.imagenUrl : IMAGES_BASE_URL + p.imagenUrl;

                    const card = document.createElement('div');
                    card.className = `product-card ${isOut ? 'agotado' : ''}`;
                    
                    card.innerHTML = `
                        <div class="product-img-wrapper">
                            <img src="${imgUrl}" onerror="this.src='https://placehold.co/300x300/1a1a2e/FFF?text=Sin+Img'">
                        </div>
                        <div class="product-info">
                            <div class="product-name">${p.nombre} ${!isVisible ? '🙈' : ''}</div>
                            <div class="product-details-row">
                                <span class="stock-badge">Stock: ${p.stock}</span>
                                <span>$${p.precio}</span>
                            </div>
                            <div class="product-actions">
                                <button class="btn-edit" onclick="editProduct('${p.id}')">Editar</button>
                                <button class="btn-neutral" onclick="toggleProductVisibility('${p.id}', ${isVisible})">
                                    ${isVisible ? 'Ocultar' : 'Mostrar'}
                                </button>
                            </div>
                            <button class="btn-delete" style="width:100%; margin-top:10px;" onclick="showConfirmModal('product', '${p.id}', '¿Eliminar ${p.nombre}?')">Eliminar</button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            }
            container.appendChild(grid);
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p>Error al cargar inventario.</p>';
    }
}

async function getCategoryVisibility() {
    const v = {};
    const s = await db.collection('categorias').get();
    s.forEach(d => v[d.id] = d.data().visible);
    return v;
}
async function toggleCategoryVisibility(cat, vis) {
    await db.collection('categorias').doc(cat).set({ visible: !vis }, { merge: true });
    loadInventory();
}
async function toggleProductVisibility(id, vis) {
    await db.collection('productos').doc(id).update({ visible: !vis });
    loadInventory();
}

// PRODUCTOS
const addProductForm = getEl('add-product-form');
if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const imageUrl = getEl('product-image-url').value;
            if (!imageUrl) { showMessage('Falta la imagen.'); return; }
            await db.collection('productos').add({
                nombre: getEl('product-name').value,
                categoria: getEl('product-category').value,
                imagenUrl: imageUrl,
                stock: parseInt(getEl('product-stock').value),
                precio: parseFloat(getEl('product-price').value),
                cantidadVendida: 0,
                visible: true
            });
            showMessage('¡Producto agregado!');
            e.target.reset();
            showScreen('inventory-screen');
        } catch (error) { showMessage('Error al agregar producto.'); }
    });
}

async function editProduct(id) {
    const docSnap = await db.collection('productos').doc(id).get();
    if (docSnap.exists) {
        const data = docSnap.data();
        getEl('edit-product-id').value = id;
        getEl('edit-name').value = data.nombre;
        getEl('edit-category').value = data.categoria;
        getEl('edit-image-url').value = data.imagenUrl;
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
                visible: getEl('edit-visible').checked,
                imagenUrl: getEl('edit-image-url').value
            };
            await db.collection('productos').doc(id).update(updates);
            showMessage('Producto actualizado.');
            closeEditModal();
            loadInventory();
        } catch (error) { showMessage('Error al actualizar.'); }
    });
}

// ====================================================================================
// 4. VENTA MANUAL (CORREGIDA)
// ====================================================================================
async function loadProductModels() {
    const snap = await db.collection('productos').orderBy('nombre').get();
    productModels = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function addManualOrderLine() {
    const container = getEl('manual-order-items');
    const div = document.createElement('div');
    div.className = 'manual-line'; 
    const options = productModels.map(p => `<option value="${p.id}" data-price="${p.precio}">${p.nombre} (${p.stock})</option>`).join('');
    div.innerHTML = `
        <select class="manual-order-product" onchange="calculateManualOrderTotal()" required style="margin:0;">
            <option value="" data-price="0" disabled selected>Modelo...</option>
            ${options}
        </select>
        <input type="number" class="manual-order-quantity" placeholder="1" min="1" value="1" oninput="calculateManualOrderTotal()" required style="margin:0;">
        <button type="button" class="btn-delete" onclick="this.parentNode.remove(); calculateManualOrderTotal()" style="height:100%; padding:0;">X</button>
    `;
    container.appendChild(div);
    calculateManualOrderTotal();
}

function calculateManualOrderTotal() {
    let total = 0;
    document.querySelectorAll('.manual-line').forEach(line => {
        const select = line.querySelector('.manual-order-product');
        const qtyInput = line.querySelector('.manual-order-quantity');
        if(select && qtyInput){
            const price = parseFloat(select.options[select.selectedIndex]?.dataset.price || 0);
            const qty = parseInt(qtyInput.value) || 0;
            total += price * qty;
        }
    });
    const deliveryMethod = getEl('manual-delivery-method').value;
    if (deliveryMethod === 'domicilio') total += SHIPPING_COST;
    getEl('manual-order-total').value = total.toFixed(2);
}

function toggleManualDeliveryFields() {
    const method = getEl('manual-delivery-method').value;
    const homeDetails = getEl('manual-home-details'); 
    const pickupDetails = getEl('manual-pickup-details');
    // Validamos que existan antes de acceder a style
    if(homeDetails && pickupDetails) {
        if (method === 'domicilio') {
            homeDetails.style.display = 'flex';
            pickupDetails.style.display = 'none';
        } else {
            homeDetails.style.display = 'none';
            pickupDetails.style.display = 'flex';
        }
    }
    calculateManualOrderTotal();
}

function toggleOtherManualLocation() {
    const isOther = getEl('manual-delivery-location').value === 'Otro';
    getEl('manual-other-location-note').style.display = isOther ? 'block' : 'none';
}

// SUBMIT VENTA MANUAL
const manualOrderForm = getEl('manual-order-form');
if (manualOrderForm) {
    manualOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = "Procesando...";

        const items = [];
        document.querySelectorAll('.manual-line').forEach(line => {
            const prodId = line.querySelector('.manual-order-product').value;
            const qty = parseInt(line.querySelector('.manual-order-quantity').value);
            if(prodId && qty > 0) {
                const pData = productModels.find(p => p.id === prodId);
                if(pData) items.push({ id: prodId, nombre: pData.nombre, precio: pData.precio, cantidad: qty });
            }
        });

        if (items.length === 0) {
            showMessage("Agrega productos."); btn.disabled = false; btn.textContent = "✅ CONFIRMAR VENTA"; return;
        }

        // Corrección de lectura de inputs
        const client = getEl('manual-order-client').value;
        const phone = getEl('manual-order-phone').value;
        const channel = getEl('manual-order-channel').value;
        const total = parseFloat(getEl('manual-order-total').value);
        const comments = getEl('manual-delivery-comments').value;
        
        const method = getEl('manual-delivery-method').value;
        let deliveryData = {};
        
        if(method === 'domicilio') {
            deliveryData = {
                tipo: 'Envío a domicilio',
                calle: getEl('manual-delivery-street').value,
                colonia: getEl('manual-delivery-neighborhood').value,
                descripcion: getEl('manual-delivery-description').value
            };
        } else {
            const locSelect = getEl('manual-delivery-location').value;
            const locOther = getEl('manual-other-location-note').value;
            deliveryData = {
                tipo: 'Punto medio',
                lugar: locSelect === 'Otro' ? locOther : locSelect,
                fecha: getEl('manual-delivery-date').value
            };
        }

        try {
            await db.runTransaction(async (t) => {
                // Leer Config
                const confRef = db.collection('configuracion').doc('tienda');
                const confDoc = await t.get(confRef);
                const costPerItem = confDoc.exists && confDoc.data().costoPorProducto ? confDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
                const shipCost = confDoc.exists && confDoc.data().costoEnvio ? confDoc.data().costoEnvio : SHIPPING_COST;

                const countRef = db.collection('contadores').doc('pedidos');
                const countDoc = await t.get(countRef);
                const num = (countDoc.exists ? countDoc.data().ultimoFolio : 0) + 1;
                const folio = `MANUAL-${String(num).padStart(4, '0')}`;
                t.set(countRef, { ultimoFolio: num }, { merge: true });

                const orderRef = db.collection('pedidos').doc();
                t.set(orderRef, {
                    folio, clienteManual: client,
                    datosCliente: { nombre: client, apellido: '', telefono: phone },
                    canalVenta: channel, productos: items, montoTotal: total,
                    estado: 'Entregado', metodoPago: 'Manual',
                    fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
                    fechaActualizacion: firebase.firestore.FieldValue.serverTimestamp(),
                    datosEntrega: deliveryData, comentarios: comments || null
                });

                // Finanzas
                const isShip = deliveryData.tipo === 'Envío a domicilio';
                const gastoEnvio = isShip ? shipCost : 0;
                const totalItems = items.reduce((s, i) => s + i.cantidad, 0);
                const capital = totalItems * costPerItem;
                const utilidad = total - capital - gastoEnvio;

                const uNegocio = utilidad * 0.50;
                const uUlises = utilidad * 0.25;
                const uDariana = utilidad * 0.25;

                if(isShip) {
                    const movRef = db.collection('movimientos').doc();
                    t.set(movRef, { monto: -gastoEnvio, concepto: 'Gasto Envío', tipo: 'Gastos', fecha: new Date(), nota: `Envío ${folio}`, relatedOrderId: orderRef.id });
                }
                if(capital > 0) {
                    const movRef = db.collection('movimientos').doc();
                    t.set(movRef, { monto: capital, concepto: 'Ingreso Capital', tipo: 'Capital', fecha: new Date(), nota: `Capital ${folio}`, relatedOrderId: orderRef.id });
                }
                
                const addProfit = (amount, type, socio) => {
                    if(amount !== 0) {
                        const r = db.collection('movimientos').doc();
                        const d = { monto: amount, concepto: type, tipo: type, fecha: new Date(), nota: `Utilidad ${folio}`, relatedOrderId: orderRef.id };
                        if(socio) d.socio = socio;
                        t.set(r, d);
                    }
                };
                addProfit(uNegocio, 'Utilidad Negocio');
                addProfit(uUlises, 'Utilidad Socio', 'Ulises');
                addProfit(uDariana, 'Utilidad Socio', 'Dariana');

                const finRef = db.collection('finanzas').doc('resumen');
                t.update(finRef, {
                    ventas: firebase.firestore.FieldValue.increment(total),
                    gastos: firebase.firestore.FieldValue.increment(gastoEnvio),
                    capital: firebase.firestore.FieldValue.increment(capital),
                    utilidad: firebase.firestore.FieldValue.increment(utilidad),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(uNegocio),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(uUlises),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(uDariana)
                });

                items.forEach(i => {
                    t.update(db.collection('productos').doc(i.id), {
                        stock: firebase.firestore.FieldValue.increment(-i.cantidad),
                        cantidadVendida: firebase.firestore.FieldValue.increment(i.cantidad)
                    });
                });
            });

            showMessage(`✅ Venta registrada!`);
            e.target.reset();
            getEl('manual-order-items').innerHTML = '';
            addManualOrderLine();
            calculateManualOrderTotal();

        } catch (err) {
            console.error(err);
            showMessage("Error: " + err.message);
        } finally {
            btn.disabled = false; btn.textContent = "✅ CONFIRMAR VENTA";
        }
    });
}

// ====================================================================================
// 5. EMPAQUES Y VIDEO
// ====================================================================================
async function loadVideoManagement() {
    const container = getEl('video-list');
    container.innerHTML = '<p>Cargando...</p>';
    try {
        const snap = await db.collection('videos').orderBy('fechaCreacion', 'desc').get();
        container.innerHTML = snap.empty ? '<p class="text-muted">Sin videos.</p>' : '';
        snap.forEach(doc => {
            const v = {id: doc.id, ...doc.data()};
            const div = document.createElement('div');
            div.className = 'data-card'; 
            div.style.display = 'flex'; div.style.justifyContent='space-between'; div.style.background='var(--bg-card)'; div.style.padding='15px'; div.style.marginBottom='10px'; div.style.border='1px solid var(--border)'; div.style.borderRadius='var(--radius)';
            div.innerHTML = `
                <div style="flex:1;"><strong style="color:white;">${v.nombre}</strong><p style="font-size:0.8rem; color:var(--text-muted); overflow:hidden;">${v.videoUrl}</p></div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <label style="font-size:0.8rem; color:white; margin:0;"><input type="checkbox" onchange="toggleVideoInPlaylist('${v.id}', this.checked)" ${v.enPlaylist?'checked':''} style="width:auto;"> Playlist</label>
                    <button class="btn-delete" style="padding:5px 10px;" onclick="deleteVideo('${v.id}')">X</button>
                </div>`;
            container.appendChild(div);
        });
    } catch(e) { console.error(e); container.innerHTML = 'Error'; }
}

async function loadPackagingVisibility() {
    const container = getEl('packaging-list');
    container.innerHTML = '<p>Cargando...</p>';
    try {
        const snap = await db.collection('empaques').orderBy('fechaCreacion', 'desc').get();
        container.innerHTML = snap.empty ? '<p class="text-muted">Sin empaques.</p>' : '';
        snap.forEach(doc => {
            const e = {id: doc.id, ...doc.data()};
            const isVisible = e.visible !== false;
            const div = document.createElement('div');
            div.className = 'data-card';
            div.style.display = 'flex'; div.style.justifyContent='space-between'; div.style.background='var(--bg-card)'; div.style.padding='15px'; div.style.marginBottom='10px'; div.style.border='1px solid var(--border)'; div.style.borderRadius='var(--radius)';
            div.innerHTML = `
                <div><strong style="color:white;">${e.nombre}</strong><p style="font-size:0.8rem; color:${isVisible?'var(--success)':'var(--danger)'}">${isVisible?'Visible':'Oculto'}</p></div>
                <div style="display:flex; gap:10px;">
                    <button class="btn" style="background:var(--${isVisible?'info':'success'}); padding:5px 10px; font-size:0.8rem;" onclick="togglePackagingVisibility('${e.id}', ${isVisible})">${isVisible?'Ocultar':'Mostrar'}</button>
                    <button class="btn-delete" style="padding:5px 10px;" onclick="deletePackaging('${e.id}')">X</button>
                </div>`;
            container.appendChild(div);
        });
    } catch(e) { console.error(e); container.innerHTML = 'Error'; }
}
async function togglePackagingVisibility(id, state) { await db.collection('empaques').doc(id).update({visible: !state}); loadPackagingVisibility(); }
async function deletePackaging(id) { if(confirm('Borrar?')) { await db.collection('empaques').doc(id).delete(); loadPackagingVisibility(); } }
async function toggleVideoInPlaylist(id, state) { await db.collection('videos').doc(id).update({enPlaylist: state}); }
async function deleteVideo(id) { if(confirm('Borrar?')) { await db.collection('videos').doc(id).delete(); loadVideoManagement(); } }

// ====================================================================================
// 6. PEDIDOS WEB Y HISTORIALES
// ====================================================================================
function loadOrders() {
    const list = getEl('orders-list');
    list.innerHTML = '<p class="text-center">Cargando...</p>';
    const q = db.collection('pedidos').where('estado', 'in', ['Pendiente', 'Confirmado']).orderBy('fechaCreacion', 'desc');
    
    const unsub = q.onSnapshot(snap => {
        if (snap.empty) { list.innerHTML = '<p style="text-align:center;">Sin pedidos.</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data();
            if(p.canalVenta) return; // Ignorar manuales
            const div = document.createElement('div');
            div.className = 'finance-card'; 
            div.style.borderLeft = '4px solid var(--info)';
            div.style.marginBottom = '15px';
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;"><strong>${p.folio} - ${p.datosCliente?.nombre}</strong><span class="order-status status-${p.estado}">${p.estado}</span></div>
                <div style="font-size:0.9rem; color:var(--text-muted);"><p>Total: $${p.montoTotal.toFixed(2)}</p><p>Tel: ${p.datosCliente?.telefono}</p></div>
                <div style="margin-top:10px; display:flex; gap:10px;">
                    ${p.estado === 'Pendiente' ? `<button class="btn-primary" onclick="updateOrderStatus('${doc.id}', 'Confirmado', event)">Confirmar</button>` : ''}
                    <button class="btn-success" onclick="updateOrderStatus('${doc.id}', 'Entregado', event)">Entregado</button>
                    <button class="btn-delete" onclick="promptCancelOrder('${doc.id}', event)">Cancelar</button>
                </div>
            `;
            list.appendChild(div);
        });
    });
    unsubscribes.push(unsub);
}

// ====================================================================================
// 7. FINANZAS
// ====================================================================================
function loadFinancialSummary() {
    const unsub = db.collection('finanzas').doc('resumen').onSnapshot(doc => {
        const d = doc.data() || {};
        if(getEl('total-sales')) getEl('total-sales').textContent = `$${(d.ventas || 0).toFixed(2)}`;
        if(getEl('total-expenses')) getEl('total-expenses').textContent = `$${(d.gastos || 0).toFixed(2)}`;
        if(getEl('total-profit')) getEl('total-profit').textContent = `$${(d.utilidad || 0).toFixed(2)}`;
        if(getEl('total-capital')) getEl('total-capital').textContent = `$${(d.capital || 0).toFixed(2)}`;
        if(getEl('total-profit-negocio')) getEl('total-profit-negocio').textContent = `$${(d.utilidadNegocioTotal || 0).toFixed(2)}`;
        if(getEl('total-profit-ulises')) getEl('total-profit-ulises').textContent = `$${(d.utilidadUlisesTotal || 0).toFixed(2)}`;
        if(getEl('total-profit-dariana')) getEl('total-profit-dariana').textContent = `$${(d.utilidadDarianaTotal || 0).toFixed(2)}`;
    });
    unsubscribes.push(unsub);
}

// CORRECCIÓN: Agregada la función showMovementsHistory que faltaba
async function showMovementsHistory(category, socio = null) {
    // Cambiamos a la pantalla de movimientos
    showScreen('movements-history-screen');
    // Esperamos un poco a que renderice el select y lo seteamos
    setTimeout(() => {
        const select = getEl('movement-filter-category');
        if(select) {
            select.value = category;
            loadMovementsHistory();
        }
    }, 100);
}

async function loadExpenseConcepts() {
    const s = getEl('expense-concept');
    if(!s) return;
    const snap = await db.collection('conceptosGastos').orderBy('nombre').get();
    s.innerHTML = '<option value="">Selecciona</option>';
    snap.forEach(d => s.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`);
}
async function addNewExpenseConcept() {
    const n = prompt("Nuevo concepto:");
    if(n) { await db.collection('conceptosGastos').add({nombre: n.trim()}); loadExpenseConcepts(); }
}
async function loadProductCost() {
    const doc = await db.collection('configuracion').doc('tienda').get();
    if(doc.exists) {
        CAPITAL_PER_PRODUCT = doc.data().costoPorProducto || 42;
        if(getEl('product-cost-input')) getEl('product-cost-input').value = CAPITAL_PER_PRODUCT;
    }
}
async function loadShippingCost() {
    const doc = await db.collection('configuracion').doc('tienda').get();
    if(doc.exists) {
        SHIPPING_COST = doc.data().costoEnvio || 70;
        if(getEl('shipping-cost-input')) getEl('shipping-cost-input').value = SHIPPING_COST;
    }
}

// Listeners Costos (Corregido para guardar también el envío)
const costConfigForm = getEl('cost-config-form');
if (costConfigForm) {
    costConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = parseFloat(getEl('product-cost-input').value);
        const ship = parseFloat(getEl('shipping-cost-input').value); // Ahora sí lo leemos
        
        if(!isNaN(val)) {
            await db.collection('configuracion').doc('tienda').set({ costoPorProducto: val }, { merge: true });
            CAPITAL_PER_PRODUCT = val;
        }
        if(!isNaN(ship)) {
            await db.collection('configuracion').doc('tienda').set({ costoEnvio: ship }, { merge: true });
            SHIPPING_COST = ship;
        }
        showMessage('Costos guardados.');
    });
}

const addExpenseForm = getEl('add-expense-form');
if(addExpenseForm) {
    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = parseFloat(getEl('expense-amount').value);
        const concepto = getEl('expense-concept').value;
        const nota = getEl('expense-note').value;
        
        const batch = db.batch();
        const ref = db.collection('movimientos').doc();
        batch.set(ref, { monto: -monto, concepto, tipo: 'Gastos', nota, fecha: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('finanzas').doc('resumen'), {
            gastos: firebase.firestore.FieldValue.increment(monto),
            utilidad: firebase.firestore.FieldValue.increment(-monto)
        });
        await batch.commit();
        showMessage('Gasto registrado.'); e.target.reset();
    });
}

// ====================================================================================
// 8. INSUMOS Y RESTOCK
// ====================================================================================
function loadRawMaterials() {
    const tbody = getEl('raw-materials-table-body');
    tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
    const unsub = db.collection('inventarioInsumos').orderBy('descripcion').onSnapshot(snap => {
        if(snap.empty) { tbody.innerHTML = '<tr><td colspan="3">Vacío.</td></tr>'; return; }
        let html = '';
        snap.forEach(doc => {
            const m = doc.data();
            html += `<tr><td>${m.descripcion}</td><td>${m.cantidad}</td><td class="actions-cell"><button class="btn-edit" onclick="editRawMaterial('${doc.id}','${m.descripcion}',${m.cantidad})">Editar</button><button class="btn-delete" onclick="showConfirmModal('raw-material','${doc.id}','Borrar?')">X</button></td></tr>`;
        });
        tbody.innerHTML = html;
    });
    unsubscribes.push(unsub);
}
const addRawMatForm = getEl('add-raw-material-form');
if(addRawMatForm) addRawMatForm.addEventListener('submit', async(e)=>{ e.preventDefault(); const id=getEl('raw-material-id').value; const d=getEl('raw-material-description').value; const q=parseInt(getEl('raw-material-quantity').value); if(id) await db.collection('inventarioInsumos').doc(id).update({descripcion:d,cantidad:q}); else await db.collection('inventarioInsumos').add({descripcion:d,cantidad:q}); showMessage('Guardado.'); cancelEditRawMaterial(); });
function editRawMaterial(id, d, q) { getEl('raw-material-id').value=id; getEl('raw-material-description').value=d; getEl('raw-material-quantity').value=q; getEl('add-raw-material-btn').textContent="Actualizar"; getEl('cancel-edit-raw-material-btn').style.display='block'; }
function cancelEditRawMaterial() { getEl('add-raw-material-form').reset(); getEl('raw-material-id').value=''; getEl('add-raw-material-btn').textContent="Agregar"; getEl('cancel-edit-raw-material-btn').style.display='none'; }
async function deleteRawMaterial(id) { await db.collection('inventarioInsumos').doc(id).delete(); loadRawMaterials(); }

function loadSupplies() {
    const tbody = getEl('supplies-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    const unsub = db.collection('insumos').orderBy('fecha', 'desc').onSnapshot(snap => {
        if(snap.empty) { tbody.innerHTML = '<tr><td colspan="4">Vacío.</td></tr>'; return; }
        let html = '';
        snap.forEach(doc => {
            const s = doc.data();
            html += `<tr><td>${s.descripcion}</td><td>${s.cantidad}</td><td>$${s.costoTotal.toFixed(2)}</td><td><button class="btn-delete" onclick="deleteSupply('${doc.id}')">X</button></td></tr>`;
        });
        tbody.innerHTML = html;
    });
    unsubscribes.push(unsub);
}
const addSupplyForm = getEl('add-supply-form');
if(addSupplyForm) {
    addSupplyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const desc = getEl('supply-description').value;
        const qty = parseInt(getEl('supply-quantity').value);
        const cost = parseFloat(getEl('supply-cost').value);
        const total = qty * cost;
        
        const batch = db.batch();
        batch.set(db.collection('insumos').doc(), { descripcion: desc, cantidad: qty, costoUnidad: cost, costoTotal: total, fecha: firebase.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection('movimientos').doc(), { monto: -total, concepto: 'Compra Insumos', tipo: 'Gastos', nota: `${qty} x ${desc}`, fecha: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('finanzas').doc('resumen'), { gastos: firebase.firestore.FieldValue.increment(total), utilidad: firebase.firestore.FieldValue.increment(-total) });
        
        await batch.commit();
        showMessage('Registrado.'); e.target.reset();
    });
}
async function deleteSupply(id) {
    if(!confirm('Borrar?')) return;
    const doc = await db.collection('insumos').doc(id).get();
    if(!doc.exists) return;
    const cost = doc.data().costoTotal;
    const batch = db.batch();
    batch.delete(db.collection('insumos').doc(id));
    batch.update(db.collection('finanzas').doc('resumen'), { gastos: firebase.firestore.FieldValue.increment(-cost), utilidad: firebase.firestore.FieldValue.increment(cost) });
    await batch.commit();
    showMessage('Eliminado.');
}

// Restock
function loadRestockHistory() {
    const list = getEl('restock-history-list');
    list.innerHTML = '<p>Cargando...</p>';
    const unsub = db.collection('restocks').orderBy('fecha', 'desc').onSnapshot(snap => {
        if(snap.empty) { list.innerHTML = '<p>Sin historial.</p>'; return; }
        list.innerHTML = ''; list.className = 'inventory-grid';
        snap.forEach(doc => {
            const r = { id: doc.id, ...doc.data() };
            const items = r.items.map(i => `<li>${i.nombre} x${i.cantidad}</li>`).join('');
            const div = document.createElement('div');
            div.className = 'finance-card'; div.style.borderLeft='4px solid var(--warning)';
            div.innerHTML = `<div style="margin-bottom:10px;"><span style="font-weight:bold; color:white; font-size:0.9rem;">Folio: ${r.folio||'N/A'}</span><br><span style="font-size:0.8rem; color:var(--text-muted);">${r.fecha?.toDate().toLocaleDateString()}</span></div><div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;"><ul style="padding-left:15px;">${items}</ul></div><div style="display:flex; justify-content:space-between; align-items:center;"><span style="color:var(--danger); font-weight:bold; font-size:1.2rem;">-$${r.costoTotal.toFixed(2)}</span><button class="btn-delete" style="padding:5px 10px; font-size:0.7rem;" onclick="deleteRestock('${r.id}')">Revertir</button></div>`;
            list.appendChild(div);
        });
    });
    unsubscribes.push(unsub);
}
async function deleteRestock(id) {
    if(!confirm('Eliminar?')) return;
    const doc = await db.collection('restocks').doc(id).get();
    if(!doc.exists) return;
    const d = doc.data();
    const batch = db.batch();
    d.items.forEach(i => batch.update(db.collection('productos').doc(i.id), { stock: firebase.firestore.FieldValue.increment(-i.cantidad) }));
    batch.update(db.collection('finanzas').doc('resumen'), { capital: firebase.firestore.FieldValue.increment(d.costoTotal) });
    batch.delete(db.collection('restocks').doc(id));
    await batch.commit(); showMessage('Revertido.');
}

// ====================================================================================
// 9. REPORTES Y TABLAS
// ====================================================================================
function loadSalesData() {
    const container = getEl('sales-list');
    container.innerHTML = '<p class="text-center">Cargando...</p>';
    const q = db.collection('pedidos').where('estado', '==', 'Entregado').orderBy('fechaActualizacion', 'desc').limit(50);
    const unsub = q.onSnapshot(snap => {
        const salesByDate = {};
        if(snap.empty) { container.innerHTML='<p class="text-center">Sin ventas.</p>'; return; }
        let html = `<div class="table-wrapper"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Total</th></tr></thead><tbody>`;
        snap.forEach(doc => {
            const p = doc.data();
            const iso = p.fechaActualizacion?.toDate().toISOString().split('T')[0];
            if(iso) salesByDate[iso] = (salesByDate[iso]||0) + (p.montoTotal||0);
            html += `<tr><td style="font-weight:bold;">${p.folio||'MANUAL'}</td><td>${p.datosCliente?.nombre||p.clienteManual}</td><td>${p.fechaActualizacion?.toDate().toLocaleDateString()}</td><td style="color:var(--success); text-align:right;">$${(p.montoTotal||0).toFixed(2)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        if(window.updateChart) updateChart(salesByDate);
    });
    unsubscribes.push(unsub);
}

async function loadSalesReportTable() {
    const tbody = getEl('sales-report-table-body');
    tbody.innerHTML = '<tr><td colspan="11">Cargando...</td></tr>';
    try {
        const snap = await db.collection('pedidos').where('estado', '==', 'Entregado').orderBy('fechaActualizacion', 'desc').get();
        if(snap.empty) { tbody.innerHTML='<tr><td colspan="11">Vacío.</td></tr>'; return; }
        const conf = await db.collection('configuracion').doc('tienda').get();
        const cost = conf.data()?.costoPorProducto || CAPITAL_PER_PRODUCT;
        const ship = conf.data()?.costoEnvio || SHIPPING_COST;
        let html = '';
        snap.forEach(doc => {
            const p = doc.data();
            const t = p.montoTotal||0;
            const count = p.productos?.reduce((s,i)=>s+(i.cantidad||1),0)||0;
            const isShip = p.datosEntrega?.tipo === 'Envío a domicilio';
            const gEnvio = isShip ? ship : 0;
            const cap = count * cost;
            const util = t - cap - gEnvio;
            html += `<tr><td>${p.folio||'MANUAL'}</td><td>${p.datosCliente?.nombre||p.clienteManual}</td><td>${p.canalVenta||'Web'}</td><td>${p.fechaActualizacion?.toDate().toLocaleDateString()}</td><td>$${t.toFixed(2)}</td><td class="text-muted">$${cap.toFixed(2)}</td><td class="text-muted">$${gEnvio.toFixed(2)}</td><td class="highlight-profit">$${util.toFixed(2)}</td><td class="highlight-profit">$${(util*0.5).toFixed(2)}</td><td class="highlight-profit">$${(util*0.25).toFixed(2)}</td><td class="highlight-profit">$${(util*0.25).toFixed(2)}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="11">Error</td></tr>'; }
}

// Movimientos Historial
async function loadMovementCategories() {
    const s = getEl('movement-filter-category');
    s.innerHTML = '<option value="all">Todas</option>';
    const snap = await db.collection('movimientos').where('tipo', '==', 'Gastos').get();
    const cats = new Set(['Ventas', 'Gastos', 'Utilidad', 'Capital', 'Utilidad Negocio', 'Utilidad Socio']);
    snap.forEach(d => { if(d.data().concepto) cats.add(d.data().concepto); });
    Array.from(cats).sort().forEach(c => s.innerHTML += `<option value="${c}">${c}</option>`);
}
async function loadMovementsHistory() {
    const list = getEl('movements-list');
    list.innerHTML = '<p>Cargando...</p>';
    const cat = getEl('movement-filter-category').value;
    const snap = await db.collection('movimientos').orderBy('fecha', 'desc').limit(100).get();
    list.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        if(cat !== 'all' && d.tipo !== cat && d.concepto !== cat) return;
        const div = document.createElement('li');
        div.className = 'data-card'; div.style.display='flex'; div.style.justifyContent='space-between'; div.style.padding='15px'; div.style.background='var(--bg-card)'; div.style.marginBottom='10px'; div.style.border='1px solid var(--border)';
        div.innerHTML = `<div><strong>${d.concepto||d.tipo}</strong><p style="font-size:0.8rem; color:var(--text-muted);">${d.fecha?.toDate().toLocaleDateString()} - ${d.nota||''}</p></div><span style="color:${d.monto>=0?'var(--success)':'var(--danger)'};">$${Math.abs(d.monto).toFixed(2)}</span>`;
        list.appendChild(div);
    });
}

// ====================================================================================
// 10. FUNCIONES GLOBALES Y HELPERS
// ====================================================================================
function updateChart(data) {
    const ctx = getEl('sales-chart').getContext('2d');
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
        type: 'line',
        data: { labels: Object.keys(data).sort(), datasets: [{ label: 'Ventas ($)', data: Object.values(data), borderColor: '#d946ef', tension: 0.3, fill: true, backgroundColor: 'rgba(217,70,239,0.1)' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

async function descargarReportePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l'); 
    doc.setFontSize(18); doc.text("Reporte KalCTas", 14, 20);
    doc.autoTable({ html: '#sales-report-table', startY: 30, theme: 'grid', headStyles: { fillColor: [217, 70, 239] }, styles: { fontSize: 8 } });
    doc.save(`Reporte_${Date.now()}.pdf`);
}

async function loadCurrentTheme() {
    const el = getEl('current-theme-status');
    if(el) {
        const doc = await db.collection('configuracion').doc('tienda').get();
        el.textContent = (doc.exists ? doc.data().temaActual : 'default').toUpperCase();
    }
}
async function setTheme(name) {
    await db.collection('configuracion').doc('tienda').set({temaActual: name}, {merge:true});
    loadCurrentTheme();
    showMessage(`Tema: ${name}`);
}

auth.onAuthStateChanged(user => {
    unsubscribes.forEach(u => u());
    if(user) showScreen('main-menu'); else showScreen('login-screen');
});

function logout() { auth.signOut(); }
const loginForm = getEl('login-form');
if(loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await auth.signInWithEmailAndPassword(getEl('login-email').value, getEl('login-password').value); }
    catch(e) { showMessage('Error de acceso'); }
});

function showMessage(text) { getEl('message-text').textContent = text; getEl('message-box').style.display = 'flex'; }
function closeMessage() { getEl('message-box').style.display = 'none'; }
function closeEditModal() { getEl('edit-modal').style.display = 'none'; }
function showConfirmModal(type, id, text) { 
    getEl('confirm-text').textContent = text;
    actionToConfirm = () => {
        if(type==='product') deleteProduct(id);
        if(type==='order') deleteOrder(id);
        if(type==='raw-material') deleteRawMaterial(id);
        if(type==='packaging') deletePackaging(id);
        if(type==='video') deleteVideo(id);
    };
    getEl('confirm-modal').style.display = 'flex';
}
function cancelAction() { getEl('confirm-modal').style.display = 'none'; actionToConfirm = null; }
async function confirmAction() { if(actionToConfirm) await actionToConfirm(); cancelAction(); }

async function updateOrderStatus(pedidoId, newStatus, event) {
    event.stopPropagation();
    const pedidoRef = db.collection('pedidos').doc(pedidoId);
    try {
        await db.runTransaction(async (t) => {
            const configDoc = await t.get(db.collection('configuracion').doc('tienda'));
            const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
            const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;
            const pedidoDoc = await t.get(pedidoRef);
            const pedidoData = pedidoDoc.data();
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

                if (hasShipping) t.set(db.collection('movimientos').doc(), { monto: -gastoEnvio, concepto: 'Gasto de Envío', tipo: 'Gastos', fecha: new Date(), relatedOrderId: pedidoId });
                if (capitalMonto > 0) t.set(db.collection('movimientos').doc(), { monto: capitalMonto, concepto: 'Ingreso Capital', tipo: 'Capital', fecha: new Date(), relatedOrderId: pedidoId });
                
                const addP = (m,c,s) => { if(m!==0) t.set(db.collection('movimientos').doc(), {monto:m, concepto:c, tipo:c, socio:s, fecha:new Date(), relatedOrderId:pedidoId}) };
                addP(utilidadNegocio, 'Utilidad Negocio'); addP(utilidadUlises, 'Utilidad Socio', 'Ulises'); addP(utilidadDariana, 'Utilidad Socio', 'Dariana');

                t.update(db.collection('finanzas').doc('resumen'), {
                    ventas: firebase.firestore.FieldValue.increment(totalVenta),
                    gastos: firebase.firestore.FieldValue.increment(gastoEnvio),
                    capital: firebase.firestore.FieldValue.increment(capitalMonto),
                    utilidad: firebase.firestore.FieldValue.increment(utilidadTotal),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(utilidadNegocio),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(utilidadUlises),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(utilidadDariana)
                });
                for (const p of pedidoData.productos) if (p.id) t.update(db.collection('productos').doc(p.id), { cantidadVendida: firebase.firestore.FieldValue.increment(p.cantidad || 1) });
            }
            t.update(pedidoRef, updatesForOrder);
        });
        showMessage(`Pedido ${newStatus}`);
    } catch (e) { console.error(e); showMessage('Error'); }
}

async function deleteOrder(id) {
    if(!confirm('Seguro?')) return;
    await db.collection('pedidos').doc(id).delete();
    loadOrders();
}
async function deleteProduct(id) { await db.collection('productos').doc(id).delete(); loadInventory(); }

// Función que faltaba para ver historial en tarjeta
function loadSalesHistory() {
    const list = getEl('sales-history-list');
    list.innerHTML = '<p>Cargando...</p>';
    const q = db.collection('pedidos').orderBy('fechaCreacion', 'desc').limit(20);
    const unsub = q.onSnapshot(snap => {
        if(snap.empty) { list.innerHTML = '<p>Sin historial.</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data();
            const div = document.createElement('li');
            div.className = 'finance-card';
            div.style.marginBottom = '10px';
            div.style.borderLeft = '4px solid var(--info)';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;"><strong>${p.folio||'MANUAL'}</strong><span>$${(p.montoTotal||0).toFixed(2)}</span></div>
                <div style="font-size:0.8rem; color:#aaa;"><p>${p.fechaActualizacion?.toDate().toLocaleDateString()}</p><p>${p.datosCliente?.nombre||p.clienteManual}</p></div>
                <div style="text-align:right;"><button class="btn-delete" style="font-size:0.7rem; padding:5px;" onclick="showConfirmModal('order','${doc.id}','Eliminar?')">Eliminar</button></div>
            `;
            list.appendChild(div);
        });
    });
    unsubscribes.push(unsub);
}