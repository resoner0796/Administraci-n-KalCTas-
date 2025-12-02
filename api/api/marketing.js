import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Solo POST' });

  try {
    const { destinatarios, asunto, mensaje } = req.body;

    if (!destinatarios || destinatarios.length === 0) {
      return res.status(400).json({ message: 'No hay destinatarios seleccionados.' });
    }

    // Diseño del Correo de Marketing
    const htmlEmail = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; background-color: #f4f4f4; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
          .header { background-color: #000; padding: 20px; text-align: center; }
          .logo { width: 150px; }
          .content { padding: 30px; color: #333; line-height: 1.6; }
          .btn { display: inline-block; background-color: #d946ef; color: white; text-decoration: none; padding: 12px 25px; border-radius: 50px; font-weight: bold; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://kalctas.com/LOGO.png" alt="KalCTas" class="logo">
          </div>
          <div class="content">
            <h2 style="color: #d946ef;">¡Hola! Tenemos noticias para ti 🧦</h2>
            <p>${mensaje.replace(/\n/g, '<br>')}</p>
            <center>
                <a href="https://kalctas.com" class="btn">Ir a la Tienda</a>
            </center>
          </div>
          <div class="footer">
            <p>Recibes esto porque eres cliente VIP de KalCTas.</p>
            <p>© 2025 KalCTas</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Enviamos con BCC para privacidad (Copia Oculta)
    await resend.emails.send({
      from: 'KalCTas News <novedades@kalctas.com>',
      to: ['admin@kalctas.com'], // Se envía al admin como principal
      bcc: destinatarios, // Todos los clientes van ocultos aquí
      subject: asunto,
      html: htmlEmail,
    });

    return res.status(200).json({ message: `Correo enviado a ${destinatarios.length} clientes.` });

  } catch (error) {
    console.error("Error marketing:", error);
    return res.status(500).json({ error: error.message });
  }
}