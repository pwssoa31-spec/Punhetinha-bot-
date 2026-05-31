const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const http = require('http');

// ==========================================
// CONFIGURAÇÃO: COLOQUE O NÚMERO DO SEU BOT AQUI!
// Tem que ser o número com 55 + DDD + Número, tudo junto. Ex: '5583988887777'
const NUMERO_DO_BOT = '5583986980613'; 
// ==========================================

// Abre a porta para o Render ficar feliz e dar "Live"
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>O Bot está rodando! Olhe a aba de LOGS no Render para pegar o código de conexão.</h1>');
}).listen(port, () => {
    console.log(`🌍 Conexão web ativa na porta ${port}`);
    iniciarBot();
});

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Desativa o QR code problemático
    });

    // Se não estiver conectado e não tiver sessão salva, pede o código de 8 dígitos
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let numeroLimpo = NUMERO_DO_BOT.replace(/[^0-9]/g, '');
                console.log(`\n==================================================`);
                console.log(`📲 GERANDO CÓDIGO DE CONEXÃO PARA O NÚMERO: ${numeroLimpo}`);
                
                let codigo = await sock.requestPairingCode(numeroLimpo);
                
                console.log(`\n👉 SEU CÓDIGO DE CONEXÃO É:  ${codigo}  👈`);
                console.log(`==================================================\n`);
            } catch (err) {
                console.log("❌ Erro ao pedir código de conexão. Verifique se o número está correto:", err);
            }
        }, 5000); // Aguarda 5 segundos para garantir a inicialização
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
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
