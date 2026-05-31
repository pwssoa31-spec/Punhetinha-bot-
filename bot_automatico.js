const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const fs = require('fs');

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        // Removemos a linha antiga que causava o aviso amarelo
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            console.log("\n▲--------------------------------------------------▲");
            console.log("GERANDO NOVO QR CODE ATUALIZADO... ESCANEIE RÁPIDO!");
            console.log("▼--------------------------------------------------▼\n");
            
            // Força o desenho do QR Code de forma manual e compatível com o Render
            qrcodeTerminal.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            console.log('🔄 Conexão fechada, reconectando...');
            iniciarBot();
        } else if (connection === 'open') {
            console.log('🤖 BOT ONLINE NA NUVEM E ESCUTANDO!');
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
                if (error) { console.log('❌ Erro no FFmpeg da Nuvem:', error); return; }

                try {
                    await sock.sendMessage(jid, { sticker: fs.readFileSync(outputPath) });
                    console.log('✅ Figurinha enviada com sucesso pela Nuvem!');
                } catch (err) {
                    console.log('❌ Erro ao enviar figurinha:', err);
                }

                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        }
    });
}
iniciarBot();
