import { Resend } from 'resend';
import admin from 'firebase-admin';

// 1. Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (e) {
    console.error("Error iniciando Firebase Admin:", e);
  }
}

const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  try {
    const hoy = new Date();
    const fechaReporte = hoy.toLocaleDateString('es-MX', { timeZone: 'America/Monterrey' });
    
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date();
    endOfDay.setHours(23,59,59,999);

    const ventasSnapshot = await db.collection('pedidos')
      .where('fechaCreacion', '>=', startOfDay)
      .where('fechaCreacion', '<=', endOfDay)
      .get();

    let totalVentas = 0;
    let cantidadPedidos = 0;
    let ventasDetalleHTML = '';

    ventasSnapshot.forEach(doc => {
        const venta = doc.data();
        if (venta.estado !== 'Cancelado') {
            totalVentas += (venta.montoTotal || 0);
            cantidadPedidos++;
            ventasDetalleHTML += `
                <tr>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${venta.folio || 'Manual'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${venta.datosCliente?.nombre || venta.clienteManual || 'Cliente'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;"><strong>$${(venta.montoTotal || 0).toFixed(2)}</strong></td>
                </tr>
            `;
        }
    });

    const stockBajoSnapshot = await db.collection('productos')
      .where('stock', '<=', 5) 
      .where('visible', '==', true)
      .get();

    let alertasStockHTML = '';
    if (!stockBajoSnapshot.empty) {
        stockBajoSnapshot.forEach(doc => {
            const prod = doc.data();
            const color = prod.stock === 0 ? '#e74c3c' : '#f39c12'; 
            alertasStockHTML += `<li style="color:${color}; margin-bottom: 5px;"><strong>${prod.nombre}</strong>: Quedan ${prod.stock}</li>`;
        });
    } else {
        alertasStockHTML = '<li style="color: green;">✅ Todo el inventario está saludable.</li>';
    }

    const htmlEmail = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1a1a2e; color: white; padding: 25px; text-align: center;">
            <h2 style="margin:0; font-weight: 700;">📊 CORTE DE CAJA</h2>
            <p style="margin:5px 0 0 0; opacity: 0.8;">${fechaReporte}</p>
        </div>
        
        <div style="padding: 25px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 30px; border: 1px solid #eee;">
                <p style="margin:0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Ventas Totales</p>
                <h1 style="margin:10px 0; color: #2ecc71; font-size: 36px;">$${totalVentas.toFixed(2)}</h1>
                <div style="font-size: 13px; color: #888; background: #fff; display: inline-block; padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd;">
                    ${cantidadPedidos} pedidos registrados hoy
                </div>
            </div>

            <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px; color: #333;">📝 Detalle de Operaciones</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
                <thead style="background: #f1f1f1; color: #555;">
                    <tr>
                        <th style="padding:8px; text-align:left;">Folio</th>
                        <th style="padding:8px; text-align:left;">Cliente</th>
                        <th style="padding:8px; text-align:right;">Monto</th>
                    </tr>
                </thead>
                <tbody>
                    ${ventasDetalleHTML || '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">No hubo ventas hoy (todavía).</td></tr>'}
                </tbody>
            </table>

            <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 25px; color: #333;">⚠️ Alertas de Inventario</h3>
            <ul style="padding-left: 20px; font-size: 14px;">
                ${alertasStockHTML}
            </ul>

            <div style="text-align: center; margin-top: 40px;">
                <a href="https://admin.kalctas.com" style="background-color: #4A55A2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Ir al Panel Administrativo</a>
            </div>
        </div>
        <div style="background-color: #eee; padding: 15px; text-align: center; font-size: 11px; color: #777;">
            Reporte generado automáticamente por KalCTas Bot 🤖
        </div>
      </div>
    `;

    await resend.emails.send({
      from: 'KalCTas Bot <reportes@kalctas.com>',
      to: ['ulisees.luna96@gmail.com'], 
      subject: `📊 Corte del Día: $${totalVentas.toFixed(2)} - ${fechaReporte}`,
      html: htmlEmail
    });

    return res.status(200).json({ message: 'Reporte generado y enviado con éxito' });

  } catch (error) {
    console.error('Error generando reporte:', error);
    return res.status(500).json({ error: error.message });
  }
}