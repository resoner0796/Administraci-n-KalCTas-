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

const IMAGES_BASE_URL = 'https://kalctas.com/';
let actionToConfirm = null;
let unsubscribes = [];
let productModels = [];
let expenseConcepts = [];
let salesChart;
let CAPITAL_PER_PRODUCT = 42;
let SHIPPING_COST = 70;

const getEl = (id) => document.getElementById(id);
// HELPER SEGURO PARA LEER INPUTS (EVITA EL ERROR DE NULL)
const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

const empaqueInsumoMap = {
    'Frankie': 'Empaque frankie',
    'Naranja': 'Empaque Halloween Naranja',
    'Tradicional Gris': 'Empaque Tradicional Gris'
};

// ====================================================================================
// 2. NAVEGACIÓN
// ====================================================================================
async function showScreen(screenId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const screen = getEl(screenId);
    if (screen) screen.style.display = 'block';
    
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
            const rItems = getEl('restock-items');
            if(rItems) { rItems.innerHTML = ''; addRestockLine(); }
            break;
        case 'sales-screen': loadSalesData(); break;
        case 'sales-report-table-screen': loadSalesReportTable(); break;
        case 'theme-screen': loadCurrentTheme(); break;
        case 'packaging-screen': 
            loadPackagingVisibility(); 
            loadCustomBoxesManagement(); // <--- NUEVA FUNCIÓN
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
            case 'customers-screen': loadCustomers(); break;
        case 'raw-materials-screen': loadRawMaterials(); break;
        case 'movements-history-screen': 
            loadMovementCategories();
            if(getEl('movement-filter-category').value === 'all') loadMovementsHistory();
            break;
    }
}

// ====================================================================================
// 3. INVENTARIO (MODO TARJETAS)
// ====================================================================================
async function loadInventory() {
    const container = getEl('inventory-accordion');
    const controls = getEl('category-visibility-controls');
    container.innerHTML = '<p style="text-align:center;">Cargando...</p>';
    controls.innerHTML = '';

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
            btn.style.marginRight = '10px';
            btn.style.background = isVisible ? 'var(--bg-input)' : 'var(--bg-input)';
            btn.style.border = isVisible ? '1px solid var(--success)' : '1px solid var(--text-muted)';
            btn.style.color = isVisible ? 'var(--success)' : 'var(--text-muted)';
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
    } catch (e) { container.innerHTML = 'Error'; }
}

async function getCategoryVisibility() {
    const v = {}; const s = await db.collection('categorias').get();
    s.forEach(d => v[d.id] = d.data().visible); return v;
}
async function toggleCategoryVisibility(cat, vis) {
    await db.collection('categorias').doc(cat).set({ visible: !vis }, { merge: true }); loadInventory();
}
async function toggleProductVisibility(id, vis) {
    await db.collection('productos').doc(id).update({ visible: !vis }); loadInventory();
}

// PRODUCTO ADD/EDIT
const addProductForm = getEl('add-product-form');
if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await db.collection('productos').add({
                nombre: getVal('product-name'),
                categoria: getVal('product-category'),
                imagenUrl: getVal('product-image-url'),
                stock: parseInt(getVal('product-stock')),
                precio: parseFloat(getVal('product-price')),
                cantidadVendida: 0,
                visible: true
            });
            showMessage('¡Producto agregado!');
            e.target.reset();
            showScreen('inventory-screen');
        } catch (error) { showMessage('Error.'); }
    });
}

async function editProduct(id) {
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
        const d = doc.data();
        getEl('edit-product-id').value = id;
        getEl('edit-name').value = d.nombre;
        getEl('edit-category').value = d.categoria;
        getEl('edit-image-url').value = d.imagenUrl;
        getEl('edit-stock').value = d.stock;
        getEl('edit-price').value = d.precio;
        getEl('edit-visible').checked = d.visible !== false;
        getEl('edit-modal').style.display = 'flex';
    }
}

const editProductForm = getEl('edit-product-form');
if (editProductForm) {
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = getVal('edit-product-id');
        try {
            await db.collection('productos').doc(id).update({
                nombre: getVal('edit-name'),
                categoria: getVal('edit-category'),
                stock: parseInt(getVal('edit-stock')),
                precio: parseFloat(getVal('edit-price')),
                visible: getEl('edit-visible').checked,
                imagenUrl: getVal('edit-image-url')
            });
            showMessage('Actualizado.');
            closeEditModal();
            loadInventory();
        } catch (error) { showMessage('Error.'); }
    });
}

// ====================================================================================
// 4. VENTA MANUAL (BLINDADA)
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
            <option value="" data-price="0" disabled selected>Modelo...</option>${options}
        </select>
        <input type="number" class="manual-order-quantity" placeholder="1" min="1" value="1" oninput="calculateManualOrderTotal()" required style="margin:0;">
        <button type="button" class="btn-delete" onclick="this.parentNode.remove(); calculateManualOrderTotal()">X</button>
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
    if (getVal('manual-delivery-method') === 'domicilio') total += SHIPPING_COST;
    getEl('manual-order-total').value = total.toFixed(2);
}

function toggleManualDeliveryFields() {
    const method = getVal('manual-delivery-method');
    const home = getEl('manual-home-details'); 
    const pickup = getEl('manual-pickup-details');
    if(home && pickup) {
        home.style.display = method === 'domicilio' ? 'flex' : 'none';
        pickup.style.display = method === 'domicilio' ? 'none' : 'flex';
    }
    calculateManualOrderTotal();
}

function toggleOtherManualLocation() {
    const isOther = getVal('manual-delivery-location') === 'Otro';
    const note = getEl('manual-other-location-note');
    if(note) {
        note.style.display = isOther ? 'block' : 'none';
        note.required = isOther;
    }
}

// CORRECCIÓN VENTA MANUAL
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
            showMessage("Debes agregar al menos un producto.");
            btn.disabled = false; btn.textContent = "✅ CONFIRMAR VENTA"; return;
        }

        // Usamos getVal para evitar errores de null
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
                
                // --- AQUÍ ESTABA EL ERROR DE UNDEFINED (CORREGIDO) ---
                const addProfit = (amount, type, socio) => {
                    if(amount !== 0) {
                        const r = db.collection('movimientos').doc();
                        const data = { monto: amount, concepto: type, tipo: type, fecha: new Date(), nota: `Utilidad ${folio}`, relatedOrderId: orderRef.id };
                        if (socio) data.socio = socio; // Solo agregamos socio si existe
                        t.set(r, data);
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
// 5. EMPAQUES Y VIDEO (CORREGIDO Y ORGANIZADO)
// ====================================================================================

// --- A. GESTIÓN DE VIDEOS (FIX RECARGA DE PÁGINA) ---
async function loadVideoManagement() {
    const container = getEl('video-list');
    if (!container) return;
    container.innerHTML = '<p>Cargando videos...</p>';
    
    try {
        const snap = await db.collection('videos').orderBy('fechaCreacion', 'desc').get();
        container.innerHTML = snap.empty ? '<p class="text-muted">Sin videos cargados.</p>' : '';
        
        snap.forEach(doc => {
            const v = {id: doc.id, ...doc.data()};
            const div = document.createElement('div');
            div.className = 'data-card';
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:10px; margin-bottom:10px; border-radius:var(--radius); border:1px solid var(--border);';
            
            div.innerHTML = `
                <div style="flex:1;">
                    <strong style="color:white;">${v.nombre}</strong>
                    <p style="font-size:0.8rem; color:var(--text-muted);">${v.videoUrl}</p>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <label style="font-size:0.8rem; color:white; margin:0; cursor:pointer;">
                        <input type="checkbox" onchange="toggleVideoInPlaylist('${v.id}', this.checked)" ${v.enPlaylist?'checked':''} style="width:auto;"> Playlist
                    </label>
                    <button class="btn-delete" style="padding:5px 10px;" onclick="deleteVideo('${v.id}')">X</button>
                </div>`;
            container.appendChild(div);
        });
    } catch(e) { console.error(e); container.innerHTML = 'Error cargando videos.'; }
}

// LISTENER FORMULARIO VIDEO (AQUÍ ESTABA EL ERROR DE RECARGA)
const addVideoForm = getEl('add-video-form');
if (addVideoForm) {
    addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // <--- ESTO EVITA QUE SE RECARGUE LA PÁGINA
        
        const nombre = getVal('video-name');
        const url = getVal('video-url'); // Aquí pondrás solo "video.mp4"

        if(!nombre || !url) return;

        try {
            await db.collection('videos').add({
                nombre: nombre,
                videoUrl: url, 
                enPlaylist: true, // Se agrega directo a playlist
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('✅ Video guardado correctamente.');
            e.target.reset();
            loadVideoManagement();
        } catch(err) { 
            console.error(err);
            showMessage('Error al guardar video.'); 
        }
    });
}

// --- B. GESTIÓN DE DISEÑOS PERSONALIZABLES (CARRUSEL) ---
async function loadCustomBoxesManagement() {
    const container = getEl('custom-box-list');
    if(!container) return;
    container.innerHTML = '<p>Cargando diseños...</p>';
    
    try {
        const snap = await db.collection('configuracion_cajas').orderBy('fechaCreacion', 'desc').get();
        container.innerHTML = snap.empty ? '<p class="text-muted">No hay diseños en el carrusel.</p>' : '';
        
        snap.forEach(doc => {
            const c = {id: doc.id, ...doc.data()};
            // Detectamos si es URL completa o archivo local para la vista previa en Admin
            let imgSrc = c.archivo;
            if (!imgSrc.startsWith('http')) {
                // Asumimos que en el admin no tienes la carpeta local, mostramos icono o nombre
                // O si tienes el admin en la misma carpeta que la tienda, funcionará.
                // Si no se ve la imagen en admin no importa, lo importante es que se vea en la tienda.
                imgSrc = 'https://placehold.co/50?text=IMG'; 
            }

            const div = document.createElement('div');
            div.className = 'data-card';
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:10px; margin-bottom:10px; border-radius:var(--radius); border:1px solid var(--border);';
            
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="background:#fff; padding:2px; border-radius:4px;">
                        <img src="${imgSrc}" style="width:40px; height:40px; object-fit:cover;" onerror="this.src='https://placehold.co/40?text=📦'">
                    </div>
                    <div>
                        <strong style="color:white; display:block;">${c.nombre}</strong>
                        <span style="font-size:0.7rem; color:var(--info);">Archivo: ${c.archivo}</span>
                    </div>
                </div>
                <button class="btn-delete" style="padding:5px 10px;" onclick="deleteCustomBox('${c.id}')">X</button>
            `;
            container.appendChild(div);
        });
    } catch(e) { console.error(e); container.innerHTML = 'Error al cargar diseños.'; }
}

const addCustomBoxForm = getEl('add-custom-box-form');
if(addCustomBoxForm) {
    addCustomBoxForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = getVal('custom-box-name');
        const archivo = getVal('custom-box-url'); // Ej: "caja-navidad.png"
        
        if(!nombre || !archivo) return;

        try {
            await db.collection('configuracion_cajas').add({
                nombre: nombre,
                archivo: archivo, 
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('✅ Diseño agregado al carrusel.');
            e.target.reset();
            loadCustomBoxesManagement();
        } catch(err) { showMessage('Error al guardar.'); }
    });
}

// --- C. EMPAQUES STANDARD (DROPDOWN) ---
async function loadPackagingVisibility() {
    const container = getEl('packaging-list');
    if(!container) return;
    container.innerHTML = '<p>Cargando...</p>';
    try {
        const snap = await db.collection('empaques').orderBy('fechaCreacion', 'desc').get();
        container.innerHTML = snap.empty ? '<p class="text-muted">Sin empaques standard.</p>' : '';
        snap.forEach(doc => {
            const e = {id: doc.id, ...doc.data()};
            const isVisible = e.visible !== false;
            const div = document.createElement('div');
            div.className = 'data-card';
            div.style.cssText = 'display:flex; justify-content:space-between; background:var(--bg-card); padding:10px; margin-bottom:10px; border-radius:var(--radius); border:1px solid var(--border);';
            div.innerHTML = `
                <div><strong style="color:white;">${e.nombre}</strong><p style="font-size:0.8rem; color:${isVisible?'var(--success)':'var(--danger)'}">${isVisible?'Visible':'Oculto'}</p></div>
                <div style="display:flex; gap:10px;">
                    <button class="btn" style="background:var(--${isVisible?'info':'success'}); padding:5px 10px; font-size:0.8rem;" onclick="togglePackagingVisibility('${e.id}', ${isVisible})">${isVisible?'Ocultar':'Mostrar'}</button>
                    <button class="btn-delete" style="padding:5px 10px;" onclick="deletePackaging('${e.id}')">X</button>
                </div>`;
            container.appendChild(div);
        });
    } catch(e) { container.innerHTML = 'Error'; }
}

// --- CORRECCIÓN EN ADMIN JS (app.js) ---
const addPackagingForm = getEl('add-packaging-form');
if (addPackagingForm) {
    addPackagingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = getVal('packaging-name');
        // AQUÍ ESTABA EL DETALLE: Leemos el valor del input de imagen
        const imagenUrl = getVal('packaging-image-url'); 
        
        if (!nombre) return;
        try {
            await db.collection('empaques').add({
                nombre: nombre,
                imagenUrl: imagenUrl || '', // Guardamos la URL o vacío para que no sea undefined
                visible: true,
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('✅ Empaque standard agregado.');
            e.target.reset();
            loadPackagingVisibility();
        } catch (error) { 
            console.error(error);
            showMessage('Error al guardar.'); 
        }
    });
}

// FUNCIONES AUXILIARES DE ELIMINACIÓN Y ESTADO
async function togglePackagingVisibility(id, state) { await db.collection('empaques').doc(id).update({visible: !state}); loadPackagingVisibility(); }
async function deletePackaging(id) { if(confirm('¿Borrar empaque standard?')) { await db.collection('empaques').doc(id).delete(); loadPackagingVisibility(); } }
async function deleteCustomBox(id) { if(confirm('¿Borrar diseño personalizado?')) { await db.collection('configuracion_cajas').doc(id).delete(); loadCustomBoxesManagement(); } }
async function toggleVideoInPlaylist(id, state) { await db.collection('videos').doc(id).update({enPlaylist: state}); }
async function deleteVideo(id) { if(confirm('¿Borrar video?')) { await db.collection('videos').doc(id).delete(); loadVideoManagement(); } }

// ====================================================================================
// 6. PEDIDOS WEB (ACTUALIZADO PARA VER PERSONALIZACIÓN)
// ====================================================================================
function loadOrders() {
    const list = getEl('orders-list');
    list.innerHTML = '<p class="text-center">Cargando...</p>';
    const q = db.collection('pedidos').where('estado', 'in', ['Pendiente', 'Confirmado']).orderBy('fechaCreacion', 'desc');
    
    const unsub = q.onSnapshot(snap => {
        if (snap.empty) { list.innerHTML = '<p style="text-align:center;">Sin pedidos pendientes.</p>'; return; }
        list.innerHTML = '';
        
        snap.forEach(doc => {
            const p = doc.data();
            if(p.canalVenta) return; // Ignorar ventas manuales aquí si quieres
            
            const div = document.createElement('div');
            div.className = 'finance-card'; 
            div.style.borderLeft = '4px solid var(--info)';
            div.style.marginBottom = '15px';
            
            // Lógica para resaltar Empaque Personalizado
            let empaqueHtml = '';
            if (p.empaque) {
                if (p.empaque.includes('Personalizado')) {
                    // Formateamos para que se lea bonito el detalle
                    // El string viene tipo: Personalizado: "Hola" | Color: ...
                    const detalles = p.empaque.replace(/\|/g, '<br>'); // Cambiamos pipes por saltos de línea
                    empaqueHtml = `
                        <div style="background: rgba(255, 193, 7, 0.15); border: 1px solid var(--warning); padding: 8px; border-radius: 6px; margin-top: 5px; color: #fbbf24; font-size: 0.85rem;">
                            <strong>🎨 EMPAQUE PERSONALIZADO:</strong><br>
                            ${detalles}
                        </div>
                    `;
                } else {
                    empaqueHtml = `<p style="font-size:0.85rem; color:var(--text-muted); margin-top:5px;">📦 Empaque: ${p.empaque}</p>`;
                }
            }
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${p.folio} - ${p.datosCliente?.nombre}</strong>
                    <span class="order-status status-${p.estado}">${p.estado}</span>
                </div>
                <div style="font-size:0.9rem; color:var(--text-muted);">
                    <p>Total: $${p.montoTotal.toFixed(2)}</p>
                    <p>Tel: <a href="tel:${p.datosCliente?.telefono}" style="color:inherit;">${p.datosCliente?.telefono}</a></p>
                </div>
                
                ${empaqueHtml} <div style="margin-top:10px; display:flex; gap:10px;">
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
// 7. FINANZAS E INSUMOS
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

async function showMovementsHistory(category, socio = null) {
    showScreen('movements-history-screen');
    setTimeout(() => {
        const select = getEl('movement-filter-category');
        if(select) { select.value = category; loadMovementsHistory(); }
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
    const n = prompt("Concepto:");
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

const costConfigForm = getEl('cost-config-form');
if (costConfigForm) {
    costConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = parseFloat(getVal('product-cost-input'));
        const ship = parseFloat(getVal('shipping-cost-input')); // Corregido para leer envío
        
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

// CORRECCIÓN GASTOS (DESCUENTA A NEGOCIO)
const addExpenseForm = getEl('add-expense-form');
if(addExpenseForm) {
    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const montoInput = getEl('expense-amount');
        const conceptoInput = getEl('expense-concept');
        const notaInput = getEl('expense-note');

        // Validación para evitar el error NULL
        if(!montoInput || !conceptoInput) return;

        const monto = parseFloat(montoInput.value);
        const concepto = conceptoInput.value;
        const nota = notaInput ? notaInput.value : '';
        
        if(!monto || !concepto) { showMessage("Faltan datos."); return; }

        try {
            const batch = db.batch();
            const ref = db.collection('movimientos').doc();
            
            // 1. Crear el movimiento
            batch.set(ref, { 
                monto: -monto, 
                concepto: concepto, 
                tipo: 'Gastos', // O 'Gasto General' para diferenciar
                nota: nota, 
                fecha: firebase.firestore.FieldValue.serverTimestamp() 
            });

            // 2. Actualizar Finanzas (Utilidad Global + Gastos + Utilidad Negocio)
            batch.update(db.collection('finanzas').doc('resumen'), {
                gastos: firebase.firestore.FieldValue.increment(monto),
                utilidad: firebase.firestore.FieldValue.increment(-monto),
                utilidadNegocioTotal: firebase.firestore.FieldValue.increment(-monto) // <--- AQUÍ ESTÁ LA LÓGICA QUE PEDISTE
            });

            await batch.commit();
            showMessage('Gasto registrado y descontado del Negocio.'); 
            e.target.reset();
        } catch (err) {
            console.error(err);
            showMessage("Error al guardar gasto.");
        }
    });
}

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
if(addRawMatForm) addRawMatForm.addEventListener('submit', async(e)=>{ e.preventDefault(); const id=getVal('raw-material-id'); const d=getVal('raw-material-description'); const q=parseInt(getVal('raw-material-quantity')); if(id) await db.collection('inventarioInsumos').doc(id).update({descripcion:d,cantidad:q}); else await db.collection('inventarioInsumos').add({descripcion:d,cantidad:q}); showMessage('Guardado.'); cancelEditRawMaterial(); });
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
        const desc = getVal('supply-description');
        const qty = parseInt(getVal('supply-quantity'));
        const cost = parseFloat(getVal('supply-cost'));
        const total = qty * cost;
        const batch = db.batch();
        batch.set(db.collection('insumos').doc(), { descripcion: desc, cantidad: qty, costoUnidad: cost, costoTotal: total, fecha: new Date() });
        batch.set(db.collection('movimientos').doc(), { monto: -total, concepto: 'Compra Insumos', tipo: 'Gastos', nota: `${qty} x ${desc}`, fecha: new Date() });
        batch.update(db.collection('finanzas').doc('resumen'), { gastos: firebase.firestore.FieldValue.increment(total), utilidad: firebase.firestore.FieldValue.increment(-total) });
        await batch.commit();
        showMessage('Registrado.'); e.target.reset();
    });
}
async function deleteSupply(id) { if(!confirm('Borrar?')) return; const doc = await db.collection('insumos').doc(id).get(); if(!doc.exists) return; const cost = doc.data().costoTotal; const batch = db.batch(); batch.delete(db.collection('insumos').doc(id)); batch.update(db.collection('finanzas').doc('resumen'), { gastos: firebase.firestore.FieldValue.increment(-cost), utilidad: firebase.firestore.FieldValue.increment(cost) }); await batch.commit(); showMessage('Eliminado.'); }

// ==========================================
// NUEVO: LÓGICA DE RETIRO DE UTILIDADES
// ==========================================
const withdrawForm = getEl('withdraw-profit-form');
if (withdrawForm) {
    withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Obtenemos los valores
        const partner = getEl('withdraw-partner').value;
        const amount = parseFloat(getEl('withdraw-amount').value);
        const details = getEl('withdraw-details').value;

        // Validaciones básicas
        if (!partner || !amount || amount <= 0) {
            showMessage("Por favor selecciona un socio y un monto válido.");
            return;
        }

        // Mapeo: Qué campo de la BD actualizar según el socio
        let dbField = '';
        if (partner === 'Ulises') dbField = 'utilidadUlisesTotal';
        else if (partner === 'Dariana') dbField = 'utilidadDarianaTotal';
        else if (partner === 'Negocio') dbField = 'utilidadNegocioTotal';
        else {
            showMessage("Socio no identificado.");
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = "Procesando...";

        try {
            const batch = db.batch();

            // 1. Crear el movimiento en el historial (Para que quede registro)
            const movRef = db.collection('movimientos').doc();
            batch.set(movRef, {
                monto: -amount, // Negativo porque sale dinero
                concepto: 'Retiro de Utilidad',
                tipo: 'Retiro Socio', // Tipo específico para filtrar luego si quieres
                socio: partner,
                nota: details,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Actualizar el acumulado del socio en Finanzas (RESTAR)
            const finRef = db.collection('finanzas').doc('resumen');
            
            // Usamos computed property names [] para usar la variable dbField
            batch.update(finRef, {
                [dbField]: firebase.firestore.FieldValue.increment(-amount)
            });

            await batch.commit();

            showMessage(`✅ Retiro de $${amount.toFixed(2)} registrado para ${partner}.`);
            e.target.reset();

        } catch (err) {
            console.error(err);
            showMessage("Error al registrar el retiro.");
        } finally {
            btn.disabled = false;
            btn.textContent = "📉 Registrar Retiro";
        }
    });
}

// ====================================================================================
// 8. RESTOCK Y REPORTES
// ====================================================================================
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
            div.className = 'finance-card'; div.style.cursor='default'; div.style.borderLeft='4px solid var(--warning)';
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
// REPORTE GRÁFICO v5: FILTRO MENSUAL + TOTAL GRANDE
// ====================================================================================
function loadSalesData(mode = 'global', value = null) {
    // 1. Limpieza inicial
    unsubscribes.forEach(u => u());
    unsubscribes = [];

    const container = getEl('sales-list');
    const totalDisplay = getEl('period-total-display'); // El nuevo elemento del total
    
    container.innerHTML = '<p class="text-center">Cargando datos...</p>';
    if(totalDisplay) totalDisplay.textContent = '...'; // Feedback visual de carga
    
    let q = db.collection('pedidos').where('estado', '==', 'Entregado');

    // --- LÓGICA DEL FILTRO ---
    if (mode === 'month' && value) {
        console.log("📅 Filtrando por mes:", value);
        const [year, month] = value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1); 
        const endDate = new Date(year, month, 0, 23, 59, 59); 

        q = q.where('fechaActualizacion', '>=', startDate)
             .where('fechaActualizacion', '<=', endDate)
             .orderBy('fechaActualizacion', 'desc');
             
    } else {
        console.log("🌎 Carga Global");
        q = q.orderBy('fechaActualizacion', 'desc').limit(50);
        const inputMonth = getEl('sales-month-filter');
        if(inputMonth) inputMonth.value = '';
    }
    
    const unsub = q.onSnapshot(snap => {
        const salesByDate = {};
        let totalSum = 0; // Variable para sumar el total del periodo
        
        if(snap.empty) { 
            container.innerHTML='<p class="text-center" style="padding: 20px;">No se encontraron ventas entregadas.</p>'; 
            if(totalDisplay) totalDisplay.textContent = '$0.00';
            if(window.salesChart) { window.salesChart.destroy(); window.salesChart = null; }
            return; 
        }

        let html = `<div class="table-wrapper"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Total</th></tr></thead><tbody>`;
        
        snap.forEach(doc => {
            const p = doc.data();
            const fechaObj = p.fechaActualizacion?.toDate();
            
            if (fechaObj) {
                // Sumar al total general
                const monto = p.montoTotal || 0;
                totalSum += monto;

                // Agrupar por fecha local
                const fechaLocalKey = fechaObj.toLocaleDateString('fr-CA'); 
                salesByDate[fechaLocalKey] = (salesByDate[fechaLocalKey] || 0) + monto;

                html += `<tr>
                    <td style="font-weight:bold;">${p.folio||'MANUAL'}</td>
                    <td>${p.datosCliente?.nombre||p.clienteManual}</td>
                    <td>${fechaObj.toLocaleDateString()}</td>
                    <td style="color:var(--success); text-align:right;">$${monto.toFixed(2)}</td>
                </tr>`;
            }
        });
        
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        
        // --- ACTUALIZAR EL MARCADOR GIGANTE ---
        if(totalDisplay) {
            // Animación sencilla de conteo si quieres, o directo:
            totalDisplay.textContent = `$${totalSum.toFixed(2)}`;
        }

        // Actualizar gráfica
        if(window.updateChart) updateChart(salesByDate);

    }, error => {
        console.error("Error ventas:", error);
        if (error.code === 'failed-precondition') {
            container.innerHTML = `<p class="text-center" style="color:orange;">⚠️ Requiere Índice Nuevo.<br>Abre consola (F12) y da clic al link.</p>`;
        } else {
            container.innerHTML = `<p class="text-center">Error: ${error.message}</p>`;
        }
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

// ====================================================================================
// 9. AUTH Y FUNCIONES GLOBALES
// ====================================================================================
// ====================================================================================
// CORRECCIÓN GRÁFICA: ALINEACIÓN DE DATOS (FIX DESFASE)
// ====================================================================================
function updateChart(data) {
    const ctx = getEl('sales-chart').getContext('2d');
    if (salesChart) salesChart.destroy();

    // 1. Ordenamos las fechas Cronológicamente
    const sortedLabels = Object.keys(data).sort();

    // 2. Extraemos los valores EN EL MISMO ORDEN que las fechas ordenadas
    // ANTES: Object.values(data) -> Traía los datos desordenados (más nuevos primero)
    // AHORA: Mapeamos usando las fechas ya ordenadas
    const sortedValues = sortedLabels.map(fecha => data[fecha]);

    salesChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: sortedLabels, 
            datasets: [{ 
                label: 'Ventas ($)', 
                data: sortedValues, // <--- AHORA SÍ COINCIDEN
                borderColor: '#d946ef', 
                tension: 0.3, 
                fill: true, 
                backgroundColor: 'rgba(217,70,239,0.1)' 
            }] 
        },
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

// ====================================================================================
// CORRECCIÓN: CAMBIO DE ESTADO (FIX ERROR "UNDEFINED" EN UTILIDAD NEGOCIO)
// ====================================================================================
async function updateOrderStatus(pedidoId, newStatus, event) {
    event.stopPropagation();
    const pedidoRef = db.collection('pedidos').doc(pedidoId);
    
    // Cambiamos el texto del botón temporalmente para dar feedback visual
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "...";

    try {
        await db.runTransaction(async (t) => {
            const configDoc = await t.get(db.collection('configuracion').doc('tienda'));
            const costPerProduct = configDoc.exists && configDoc.data().costoPorProducto ? configDoc.data().costoPorProducto : CAPITAL_PER_PRODUCT;
            const shippingCost = configDoc.exists && configDoc.data().costoEnvio ? configDoc.data().costoEnvio : SHIPPING_COST;
            
            const pedidoDoc = await t.get(pedidoRef);
            if (!pedidoDoc.exists) throw new Error("El pedido no existe.");
            
            const pedidoData = pedidoDoc.data();
            const updatesForOrder = { estado: newStatus, fechaActualizacion: firebase.firestore.FieldValue.serverTimestamp() };
            
            // SI SE MARCA COMO ENTREGADO (Y NO LO ESTABA YA), HACEMOS CUENTAS
            if (newStatus === 'Entregado' && pedidoData.estado !== 'Entregado') {
                const totalVenta = pedidoData.montoTotal || 0;
                // Calculamos items contando la cantidad de cada uno
                const numeroProductos = pedidoData.productos?.reduce((sum, p) => sum + (p.cantidad || 1), 0) || 0;
                
                const hasShipping = pedidoData.datosEntrega?.tipo === 'Envío a domicilio';
                const gastoEnvio = hasShipping ? shippingCost : 0;
                
                const capitalMonto = numeroProductos * costPerProduct;
                const utilidadTotal = totalVenta - capitalMonto - gastoEnvio;
                
                const utilidadNegocio = utilidadTotal * 0.50;
                const utilidadUlises = utilidadTotal * 0.25;
                const utilidadDariana = utilidadTotal * 0.25;

                // 1. Registrar movimientos de Gasto y Capital
                if (hasShipping) {
                    t.set(db.collection('movimientos').doc(), { 
                        monto: -gastoEnvio, concepto: 'Gasto de Envío', tipo: 'Gastos', fecha: new Date(), relatedOrderId: pedidoId 
                    });
                }
                
                if (capitalMonto > 0) {
                    t.set(db.collection('movimientos').doc(), { 
                        monto: capitalMonto, concepto: 'Ingreso Capital', tipo: 'Capital', fecha: new Date(), relatedOrderId: pedidoId 
                    });
                }
                
                // 2. Función Helper corregida para registrar utilidades
                const addP = (m, c, s) => { 
                    if (m !== 0) {
                        const movData = {
                            monto: m, 
                            concepto: c, 
                            tipo: c, 
                            fecha: new Date(), 
                            relatedOrderId: pedidoId
                        };
                        // Solo agregamos la propiedad 'socio' si 's' tiene valor, para evitar error 'undefined'
                        if (s) movData.socio = s; 
                        
                        t.set(db.collection('movimientos').doc(), movData);
                    }
                };

                // --- AQUÍ ESTABA EL ERROR ANTES (FALTABA EL 3ER ARGUMENTO EN NEGOCIO) ---
                addP(utilidadNegocio, 'Utilidad Negocio', 'Negocio'); // <--- AHORA SÍ PASAMOS 'Negocio'
                addP(utilidadUlises, 'Utilidad Socio', 'Ulises');
                addP(utilidadDariana, 'Utilidad Socio', 'Dariana');

                // 3. Actualizar Resumen Financiero
                t.update(db.collection('finanzas').doc('resumen'), {
                    ventas: firebase.firestore.FieldValue.increment(totalVenta),
                    gastos: firebase.firestore.FieldValue.increment(gastoEnvio),
                    capital: firebase.firestore.FieldValue.increment(capitalMonto),
                    utilidad: firebase.firestore.FieldValue.increment(utilidadTotal),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(utilidadNegocio),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(utilidadUlises),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(utilidadDariana)
                });

                // 4. Actualizar contador de ventas en cada producto
                if (pedidoData.productos) {
                    for (const p of pedidoData.productos) {
                        if (p.id) {
                            t.update(db.collection('productos').doc(p.id), { 
                                cantidadVendida: firebase.firestore.FieldValue.increment(p.cantidad || 1) 
                            });
                        }
                    }
                }
            }
            
            t.update(pedidoRef, updatesForOrder);
        });
        
        showMessage(`✅ Pedido marcado como ${newStatus}`);
        
    } catch (e) { 
        console.error(e); 
        // Ahora el mensaje te dirá la razón exacta si vuelve a fallar
        showMessage('Error: ' + e.message); 
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

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
        div.className = 'data-card';
        div.style.justifyContent = 'space-between';
        div.style.background = 'var(--bg-card)'; div.style.padding='15px'; div.style.marginBottom='10px'; div.style.borderRadius='var(--radius)'; div.style.display='flex';
        div.innerHTML = `
            <div><strong style="color:white;">${d.concepto || d.tipo}</strong><p style="font-size:0.8rem; color:var(--text-muted);">${d.fecha?.toDate().toLocaleDateString()} - ${d.nota||''}</p></div>
            <span style="color:${d.monto>=0?'var(--success)':'var(--danger)'}; font-weight:bold;">$${Math.abs(d.monto).toFixed(2)}</span>
        `;
        list.appendChild(div);
    });
}

// =============================================================================
// FUNCIÓN MAESTRA DE ELIMINAR PEDIDO (REVIERTE STOCK Y FINANZAS)
// =============================================================================
async function deleteOrder(id) {
    if(!confirm('¿Estás seguro de eliminar este pedido? \n\n⚠️ ESTA ACCIÓN:\n1. Devolverá los productos al inventario.\n2. Restará la venta y utilidad de las finanzas.\n3. Borrará los movimientos del historial.')) return;

    try {
        // 1. Obtener datos del pedido antes de borrarlo
        const doc = await db.collection('pedidos').doc(id).get();
        if (!doc.exists) { showMessage("El pedido no existe."); return; }
        
        const p = doc.data();
        const batch = db.batch();

        // --- SOLO SI EL PEDIDO YA AFECTÓ FINANZAS (ESTADO ENTREGADO) ---
        if (p.estado === 'Entregado') {
            // A. Leer configuración actual para calcular reversión exacta
            // (Usamos los costos actuales como referencia, o idealmente deberían guardarse en el pedido, 
            // pero usaremos la lógica estándar de tu negocio).
            const confRef = await db.collection('configuracion').doc('tienda').get();
            const costPerItem = confRef.exists ? (confRef.data().costoPorProducto || 42) : 42;
            const shipCost = confRef.exists ? (confRef.data().costoEnvio || 70) : 70;

            // B. Recalcular montos a restar
            const totalVenta = p.montoTotal || 0;
            const totalItems = p.productos.reduce((acc, item) => acc + (item.cantidad || 1), 0);
            const isShip = p.datosEntrega?.tipo === 'Envío a domicilio';
            
            const gastoEnvio = isShip ? shipCost : 0;
            const capital = totalItems * costPerItem;
            const utilidad = totalVenta - capital - gastoEnvio;

            const uNegocio = utilidad * 0.50;
            const uUlises = utilidad * 0.25;
            const uDariana = utilidad * 0.25;

            // C. Restar de Finanzas Globales (Incrementos negativos)
            const finRef = db.collection('finanzas').doc('resumen');
            batch.update(finRef, {
                ventas: firebase.firestore.FieldValue.increment(-totalVenta),
                gastos: firebase.firestore.FieldValue.increment(-gastoEnvio),
                capital: firebase.firestore.FieldValue.increment(-capital),
                utilidad: firebase.firestore.FieldValue.increment(-utilidad),
                utilidadNegocioTotal: firebase.firestore.FieldValue.increment(-uNegocio),
                utilidadUlisesTotal: firebase.firestore.FieldValue.increment(-uUlises),
                utilidadDarianaTotal: firebase.firestore.FieldValue.increment(-uDariana)
            });

            // D. Borrar Movimientos individuales (Log)
            // Buscamos todos los movimientos vinculados a este ID de pedido
            const movsSnap = await db.collection('movimientos').where('relatedOrderId', '==', id).get();
            movsSnap.forEach(mov => {
                batch.delete(mov.ref);
            });
        }

        // --- SIEMPRE: DEVOLVER STOCK ---
        // (Incluso si no estaba entregado, por si acaso se apartó)
        p.productos.forEach(item => {
            if (item.id) {
                const prodRef = db.collection('productos').doc(item.id);
                batch.update(prodRef, {
                    stock: firebase.firestore.FieldValue.increment(item.cantidad || 1),
                    cantidadVendida: firebase.firestore.FieldValue.increment(-(item.cantidad || 1))
                });
            }
        });

        // --- BORRAR DOCUMENTO DEL PEDIDO ---
        batch.delete(db.collection('pedidos').doc(id));

        // Ejecutar todo junto
        await batch.commit();

        showMessage("✅ Pedido eliminado. Stock devuelto y dinero ajustado.");
        
        // Recargar pantalla actual
        if (getEl('sales-history-screen').style.display === 'block') loadSalesHistory();
        if (getEl('orders-screen').style.display === 'block') loadOrders();
        if (getEl('sales-screen').style.display === 'block') loadSalesData();

    } catch (e) {
        console.error(e);
        showMessage("Error al eliminar: " + e.message);
    }
}

async function deleteProduct(id) { await db.collection('productos').doc(id).delete(); loadInventory(); }
// --- FUNCIONES DE RESTOCK (QUE FALTABAN) ---
function addRestockLine() {
    const container = getEl('restock-items');
    const newLine = document.createElement('div');
    newLine.className = 'restock-line'; // Reutilizamos estilo o creamos uno simple
    // Estilo inline para asegurar grid
    newLine.style.display = 'grid';
    newLine.style.gridTemplateColumns = '1fr 80px 80px 40px';
    newLine.style.gap = '10px';
    newLine.style.marginBottom = '10px';

    const options = productModels.map(p => `<option value="${p.id}" data-price="${p.precio}">${p.nombre} (${p.categoria})</option>`).join('');
    
    newLine.innerHTML = `
        <select class="restock-product-select" required style="margin:0;">
            <option value="" disabled selected>Modelo</option>
            ${options}
        </select>
        <input type="number" class="restock-quantity-input" placeholder="Cant." min="1" value="1" oninput="calculateRestockTotal()" required style="margin:0;">
        <input type="number" class="restock-cost-input" placeholder="Costo $" step="0.01" min="0" oninput="calculateRestockTotal()" required style="margin:0;">
        <button type="button" class="btn-delete" onclick="this.parentNode.remove(); calculateRestockTotal()" style="height:100%; padding:0;">X</button>
    `;
    container.appendChild(newLine);
    // Asegurar que se calcule al inicio también
    newLine.querySelector('.restock-quantity-input').addEventListener('input', calculateRestockTotal);
    newLine.querySelector('.restock-cost-input').addEventListener('input', calculateRestockTotal);
}

function calculateRestockTotal() {
    const lines = document.querySelectorAll('.restock-line'); // Busca por clase restock-line
    let total = parseFloat(getEl('shipping-cost').value) || 0;
    
    lines.forEach(line => {
        const quantity = parseInt(line.querySelector('.restock-quantity-input').value) || 0;
        const cost = parseFloat(line.querySelector('.restock-cost-input').value) || 0;
        total += quantity * cost;
    });
    
    const totalEl = getEl('restock-total');
    if(totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

// Listener para el envío en Restock
const shippingRestockEl = getEl('shipping-cost');
if(shippingRestockEl) {
    shippingRestockEl.addEventListener('input', calculateRestockTotal);
}

// Listener del Formulario Restock
const addRestockForm = getEl('add-restock-form');
if (addRestockForm) {
    addRestockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lines = document.querySelectorAll('.restock-line');
        const restockItems = [];
        let totalCost = parseFloat(getEl('shipping-cost').value) || 0;

        lines.forEach(line => {
            const productId = line.querySelector('.restock-product-select').value;
            const quantity = parseInt(line.querySelector('.restock-quantity-input').value);
            const cost = parseFloat(line.querySelector('.restock-cost-input').value);
            
            if (productId && quantity > 0) {
                const product = productModels.find(p => p.id === productId);
                if (product) {
                    restockItems.push({ id: productId, nombre: product.nombre, cantidad: quantity, costoUnidad: cost });
                    totalCost += quantity * cost;
                }
            }
        });

        if (restockItems.length === 0) { showMessage("Agrega productos."); return; }

        try {
            const restockRef = await db.collection('restocks').add({
                items: restockItems,
                costoTotal: totalCost,
                costoEnvio: parseFloat(getEl('shipping-cost').value) || 0,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                folio: `RS-${Date.now()}`
            });

            const batch = db.batch();
            
            // Aumentar stock
            restockItems.forEach(item => {
                const productRef = db.collection('productos').doc(item.id);
                batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(item.cantidad) });
            });

            // Descontar de Capital
            const finanzasRef = db.collection('finanzas').doc('resumen');
            batch.update(finanzasRef, {
                capital: firebase.firestore.FieldValue.increment(-totalCost)
            });

            // Registrar Movimiento de Gasto (Opcional si quieres verlo en historial de movimientos)
            const movRef = db.collection('movimientos').doc();
            batch.set(movRef, {
                monto: -totalCost,
                concepto: 'Re-Stock Inventario',
                tipo: 'Gasto Re-Stock',
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                nota: `Folio RS-${Date.now()}`
            });

            await batch.commit();
            showMessage('Re-stock registrado y stock actualizado.');
            e.target.reset();
            getEl('restock-items').innerHTML = '';
            addRestockLine();
            calculateRestockTotal();
            loadRestockHistory();
            
        } catch (error) {
            console.error(error);
            showMessage('Error al registrar restock.');
        }
    });
}
// FUNCIÓN HISTORIAL DE PEDIDOS
function loadSalesHistory() {
    const list = getEl('sales-history-list');
    if(!list) return;
    
    list.innerHTML = '<p style="text-align:center;">Cargando historial...</p>';
    
    const q = db.collection('pedidos').orderBy('fechaCreacion', 'desc').limit(30);
    
    const unsub = q.onSnapshot(snap => {
        if(snap.empty) { list.innerHTML = '<p style="text-align:center;">Sin historial.</p>'; return; }
        list.innerHTML = '';
        
        snap.forEach(doc => {
            const p = doc.data();
            const div = document.createElement('div');
            // Usamos el estilo de tarjeta del CSS nuevo
            div.className = 'finance-card'; 
            div.style.borderLeft = '4px solid var(--info)';
            div.style.marginBottom = '15px';
            div.style.cursor = 'default';
            
            const cliente = p.datosCliente?.nombre || p.clienteManual || 'Cliente';
            const total = p.montoTotal || 0;

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong style="color:white;">${p.folio || 'MANUAL'}</strong>
                    <span class="order-status status-${p.estado}">${p.estado}</span>
                </div>
                <div style="color:var(--text-muted); font-size:0.9rem;">
                    <p>${cliente} - $${total.toFixed(2)}</p>
                    <p style="font-size:0.8rem;">${p.fechaCreacion?.toDate().toLocaleDateString()}</p>
                </div>
                <div style="text-align:right; margin-top:10px;">
                    <button class="btn-delete" style="padding:5px 10px; font-size:0.7rem;" onclick="showConfirmModal('order', '${doc.id}', '¿Eliminar este pedido?')">Eliminar</button>
                </div>
            `;
            list.appendChild(div);
        });
    });
    unsubscribes.push(unsub);
}

// =============================================================================
// LÓGICA DE CANCELACIÓN DE PEDIDOS (WEB)
// =============================================================================
let orderIdToCancel = null;

// 1. Al dar click en "Cancelar" en la lista de pedidos
function promptCancelOrder(id, event) {
    if(event) event.stopPropagation();
    orderIdToCancel = id;
    
    // Limpiamos y mostramos modal
    const input = getEl('cancel-reason');
    if(input) input.value = '';
    
    const modal = getEl('cancel-modal');
    if(modal) modal.style.display = 'flex';
}

function closeCancelModal() {
    const modal = getEl('cancel-modal');
    if(modal) modal.style.display = 'none';
    orderIdToCancel = null;
}

// 2. Al confirmar en el modal
async function confirmCancelOrder() {
    const reasonInput = getEl('cancel-reason');
    const reason = reasonInput ? reasonInput.value : 'Sin motivo';
    
    if (!orderIdToCancel) return;

    // Botón loading...
    const btn = document.querySelector('#cancel-modal .btn-danger');
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = "Procesando...";

    try {
        const pedidoRef = db.collection('pedidos').doc(orderIdToCancel);
        
        await db.runTransaction(async (t) => {
            const doc = await t.get(pedidoRef);
            if (!doc.exists) throw new Error("Pedido no encontrado");
            
            const p = doc.data();
            
            // A. SIEMPRE DEVOLVER STOCK (Porque se descontó al comprar en la tienda)
            if (p.productos && Array.isArray(p.productos)) {
                p.productos.forEach(item => {
                    if (item.id) {
                        const prodRef = db.collection('productos').doc(item.id);
                        t.update(prodRef, {
                            stock: firebase.firestore.FieldValue.increment(item.cantidad || 1),
                            cantidadVendida: firebase.firestore.FieldValue.increment(-(item.cantidad || 1))
                        });
                    }
                });
            }

            // B. SI ESTABA ENTREGADO -> REVERTIR DINERO (Solo en este caso)
            if (p.estado === 'Entregado') {
                const confRef = await t.get(db.collection('configuracion').doc('tienda'));
                const cost = confRef.data()?.costoPorProducto || CAPITAL_PER_PRODUCT;
                const ship = confRef.data()?.costoEnvio || SHIPPING_COST;

                const total = p.montoTotal || 0;
                const count = p.productos?.reduce((s,i)=>s+(i.cantidad||1),0)||0;
                const isShip = p.datosEntrega?.tipo === 'Envío a domicilio';
                const gEnvio = isShip ? ship : 0;
                const cap = count * cost;
                const util = total - cap - gEnvio;

                // Restar de globales
                const finRef = db.collection('finanzas').doc('resumen');
                t.update(finRef, {
                    ventas: firebase.firestore.FieldValue.increment(-total),
                    gastos: firebase.firestore.FieldValue.increment(-gEnvio),
                    capital: firebase.firestore.FieldValue.increment(-cap),
                    utilidad: firebase.firestore.FieldValue.increment(-util),
                    utilidadNegocioTotal: firebase.firestore.FieldValue.increment(-(util*0.5)),
                    utilidadUlisesTotal: firebase.firestore.FieldValue.increment(-(util*0.25)),
                    utilidadDarianaTotal: firebase.firestore.FieldValue.increment(-(util*0.25))
                });

                // Borrar movimientos financieros del historial
                const movs = await db.collection('movimientos').where('relatedOrderId', '==', orderIdToCancel).get();
                movs.forEach(m => t.delete(m.ref));
            }

            // C. MARCAR COMO CANCELADO
            t.update(pedidoRef, {
                estado: 'Cancelado',
                motivoCancelacion: reason,
                fechaCancelacion: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        showMessage("Pedido cancelado y stock devuelto.");
        closeCancelModal();
        loadOrders(); // Recargar la lista

    } catch (error) {
        console.error(error);
        showMessage("Error: " + error.message);
    } finally {
        btn.disabled = false; btn.textContent = originalText;
    }
}// ====================================================================================
// MÓDULO DE CLIENTES Y MARKETING
// ====================================================================================
async function loadCustomers() {
    const tbody = getEl('customers-table-body');
    const countEl = getEl('total-customers-count');
    tbody.innerHTML = '<tr><td colspan="5">Cargando clientes...</td></tr>';
    
    try {
        const snapshot = await db.collection('usuarios').get();
        const customers = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Calculamos items en carrito
            const cartCount = (data.carrito && Array.isArray(data.carrito)) ? data.carrito.length : 0;
            customers.push({ id: doc.id, ...data, cartCount });
        });

        countEl.textContent = customers.length;

        if (customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No hay clientes registrados.</td></tr>';
            return;
        }

        let html = '';
        customers.forEach(c => {
            // Detectamos si tiene carrito para resaltarlo
            const cartStatus = c.cartCount > 0 
                ? `<span style="color: var(--warning); font-weight: bold;">🛒 ${c.cartCount} items</span>` 
                : '<span style="color: var(--text-muted);">Vacío</span>';

            html += `
                <tr>
                    <td><input type="checkbox" class="customer-checkbox" value="${c.email}"></td>
                    <td>${c.nombre || ''} ${c.apellido || ''}</td>
                    <td>${c.email}</td>
                    <td>${c.telefono || 'N/A'}</td>
                    <td>${cartStatus}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        // Lógica "Seleccionar Todos"
        getEl('select-all-customers').onclick = (e) => {
            document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = e.target.checked);
        };

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5">Error al cargar clientes.</td></tr>';
    }
}

// --- MODAL DE MARKETING ---
function openMarketingModal() {
    const selected = Array.from(document.querySelectorAll('.customer-checkbox:checked')).map(cb => cb.value);
    
    if (selected.length === 0) {
        showMessage("Selecciona al menos un cliente de la lista.");
        return;
    }
    
    getEl('marketing-recipient-count').textContent = `Se enviará a: ${selected.length} clientes`;
    getEl('marketing-modal').style.display = 'flex';
}

function closeMarketingModal() {
    getEl('marketing-modal').style.display = 'none';
}

// ENVÍO DE CAMPAÑA
// ENVÍO DE CAMPAÑA (ACTUALIZADO)
const marketingForm = getEl('marketing-form');
if (marketingForm) {
    marketingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        
        btn.disabled = true;
        btn.textContent = "Enviando...";

        // Filtramos correos válidos y quitamos espacios
        const selectedEmails = Array.from(document.querySelectorAll('.customer-checkbox:checked'))
            .map(cb => cb.value.trim())
            .filter(email => email.includes('@') && email.includes('.'));

        const subject = getEl('marketing-subject').value;
        const message = getEl('marketing-message').value;
        const image = getEl('marketing-image').value; // <--- LEEMOS LA IMAGEN

        try {
            const response = await fetch('/api/marketing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destinatarios: selectedEmails,
                    asunto: subject,
                    mensaje: message,
                    imagenUrl: image // <--- LA ENVIAMOS
                })
            });

            const result = await response.json();

            if (response.ok) {
                showMessage("✅ Campaña enviada con éxito!");
                closeMarketingModal();
                e.target.reset();
                // Limpiar selección
                document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = false);
                if(getEl('select-all-customers')) getEl('select-all-customers').checked = false;
            } else {
                throw new Error(result.message || "Error en el servidor");
            }
        } catch (error) {
            console.error(error);
            showMessage("Error al enviar: " + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}
