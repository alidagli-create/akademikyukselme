const busboy = require('busboy');
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const parseMultipartForm = (event) => {
    return new Promise((resolve) => {
        const files = {};
        const bb = busboy({ headers: event.headers });
        bb.on('file', (fieldname, file) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files[fieldname] = Buffer.concat(chunks);
            });
        });
        bb.on('close', () => { resolve({ files }); });
        bb.end(Buffer.from(event.body, 'base64'));
    });
};

const processPdfPageToBuffer = async (pdfBuffer, pageNum, scale = 1.5) => {
    try {
        const data = new Uint8Array(pdfBuffer);
        const pdfDoc = await getDocument(data).promise;
        if (pageNum > pdfDoc.numPages) return null;
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        return canvas.toBuffer('image/jpeg', { quality: 0.85 });
    } catch (e) { return null; }
};

exports.handler = async (event) => {
    try {
        const { files } = await parseMultipartForm(event);
        const citFileBuffer = files['citation-file'];

        if (!citFileBuffer) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Eksik dosya.' }) };
        }

        const imageBuffer = await processPdfPageToBuffer(citFileBuffer, 1);
        if (!imageBuffer) {
             return { statusCode: 500, body: JSON.stringify({ error: 'PDF önizleme resmi oluşturulamadı.' }) };
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'API anahtarı bulunamadı.' }) };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        const result = await model.generateContent([
            "Bu akademik makale sayfasındaki en büyük ve en belirgin metin olan ana başlığı çıkar. Sadece ve sadece tam başlığı döndür.",
            { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } }
        ]);
        let title = result.response.text();
        title = title.replace(/\$_{([^}]+)}/g, '$1').replace(/\$/g, '').replace(/\n/g, ' ');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        };

    } catch (error) {
        console.error('Sunucu Hatası (get-title):', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Başlık alınırken sunucuda bir hata meydana geldi.' }) };
    }
};

