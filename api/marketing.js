import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Solo POST' });

  try {
    // Ahora recibimos también la 'imagenUrl'
    const { destinatarios, asunto, mensaje, imagenUrl } = req.body;

    if (!destinatarios || destinatarios.length === 0) {
      return res.status(400).json({ message: 'No hay destinatarios seleccionados.' });
    }

    // Si hay imagen, creamos la etiqueta HTML, si no, la dejamos vacía
    const imgTag = imagenUrl 
      ? `<img src="${imagenUrl}" alt="Promo" style="width: 100%; max-width: 100%; border-radius: 8px; margin-bottom: 20px; display: block;">` 
      : '';

    const htmlEmail = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
          .header { background-color: #000000; padding: 20px; text-align: center; }
          .logo { width: 140px; height: auto; }
          .content { padding: 40px 30px; color: #333333; line-height: 1.6; font-size: 16px; }
          .btn { display: inline-block; background-color: #d946ef; color: white !important; text-decoration: none; padding: 14px 30px; border-radius: 50px; font-weight: bold; margin-top: 25px; font-size: 16px; }
          .footer { text-align: center; padding: 30px; font-size: 12px; color: #999; background-color: #f9f9f9; }
          h2 { color: #d946ef; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://kalctas.com/LOGO.png" alt="KalCTas" class="logo">
          </div>
          
          <div class="content">
            ${imgTag}
            
            <h2>¡Hola! Tenemos noticias para ti 🧦</h2>
            
            <div style="white-space: pre-line;">
                ${mensaje}
            </div>

            <center>
                <a href="https://kalctas.com" class="btn">Ir a la Tienda</a>
            </center>
          </div>
          
          <div class="footer">
            <p>Recibes esto porque eres parte del Club KalCTas.</p>
            <p>© 2025 KalCTas - Reynosa, Tam.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await resend.emails.send({
      from: 'KalCTas News <novedades@kalctas.com>',
      // Truco: Ponemos un nombre bonito en el TO, aunque el correo real sea el tuyo para que no rebote
      to: ['suscriptores@kalctas.com'], 
      bcc: destinatarios,
      subject: asunto,
      html: htmlEmail,
    });

    return res.status(200).json({ message: `Correo enviado a ${destinatarios.length} clientes.` });

  } catch (error) {
    console.error("Error marketing:", error);
    return res.status(500).json({ error: error.message });
  }
}