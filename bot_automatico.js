const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const QRCode = require('qrcode');

// 1. ABRE A PORTA DA INTERNET IMEDIATAMENTE (Pro Render liberar o link)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (fs.existsSync('/tmp/qrcode.png')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(fs.readFileSync('/tmp/qrcode.png'));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>O QR Code está sendo gerado na Nuvem... Atualize a página em 10 segundos!</h1>');
    }
}).listen(port, () => {
    console.log(`🌍 PORTA ${port} LIBERADA! Iniciando o Bot do WhatsApp...`);
    // Só inicia o bot depois que a porta web já estiver aberta e ativa
    iniciarBot();
});

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            console.log("📸 NOVO QR CODE PRONTO NO LINK!");
            // Cria a imagem perfeita do QR Code
            await QRCode.toFile('/tmp/qrcode.png', qr);
        }
        
        if (connection === 'close') {
            console.log('🔄 Conexão fechada, reconectando...');
            iniciarBot();
        } else if (connection === 'open') {
            console.log('🤖 BOT ONLINE NA NUVEM E ESCUTANDO!');
            if (fs.existsSync('/tmp/qrcode.png')) fs.unlinkSync('/tmp/qrcode.png');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) return;

        const jid = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];
        const caption = msg.message[messageType]?.caption || '';

        if (messageType === 'imageMessage' && (caption === '!s' || caption === '!f')) {
            console.log(`📸 Foto recebida, processando na nuvem...`);
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
            
            const inputPath = '/tmp/temp_input.jpg';
            const outputPath = '/tmp/figurinha.webp';
            fs.writeFileSync(inputPath, buffer);

            exec(`ffmpeg -y -i ${inputPath} -vcodec libwebp -vf "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000" ${outputPath}`, async (error) => {
                if (error) { console.log('❌ Erro no FFmpeg:', error); return; }

                try {
                    await sock.sendMessage(jid, { sticker: fs.readFileSync(outputPath) });
                    console.log('✅ Figurinha enviada com sucesso pela Nuvem!');
                } catch (err) {
                    console.log('❌ Erro ao enviar:', err);
                }

                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        }
    });
}
