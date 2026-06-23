import express from 'express'
import { EmailListenerServices } from './services/emailListener.service.js';

const app = express();
const PORT = process.env.PORT || 3800;

app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Inbox Guardian está activo' });
})

app.listen(PORT, async ()  => {
    console.log("Serividor corriendo con exito, en el puerto: " + PORT);
    await EmailListenerServices.start()
})