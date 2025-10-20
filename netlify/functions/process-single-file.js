const busboy = require('busboy');
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const parseMultipartForm = (event) => {
    return new Promise((resolve) => {
        const files = {};
        const bb = busboy({ headers: event.headers });

        bb.on('file', (fieldname, file, { filename }) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files[fieldname] = {
                    filename,
                    content: Buffer.concat(chunks),
                };
            });
        });
        bb.on('close', () => { resolve({ files }); });
        bb.end(Buffer.from(event.body, 'base64'));
    });
};

const processPdfPage = async (pdfBuffer, pageNum, scale = 1.8) => {
    try {
        const data = new Uint8Array(pdfBuffer);
        const pdfDoc = await getDocument(data).promise;
        if (pageNum > pdfDoc.numPages) return null;
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        return canvas.toBuffer('image/jpeg', { quality: 0.85 }).toString('base64');
    } catch (e) {
        console.error(`Error processing PDF page ${pageNum}:`, e);
        return null;
    }
};

const extractTitleWithGemini = async (imageBuffer) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Gemini API anahtarı bulunamadı!");
        return null;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    try {
        const result = await model.generateContent([
            "Bu akademik makale sayfasındaki en büyük ve en belirgin metin olan ana başlığı çıkar. Sadece ve sadece tam başlığı döndür.",
            { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } }
        ]);
        let title = result.response.text();
        title = title.replace(/\$_{([^}]+)}/g, '$1').replace(/\$/g, '').replace(/\n/g, ' ');
        return title;
    } catch (error) {
        console.error("Gemini API hatası:", error);
        return null;
    }
};

exports.handler = async (event) => {
    try {
        const { files } = await parseMultipartForm(event);
        const citFile = files['citation-file'];
        const pubFile = files['publication-info-pdf'];

        if (!citFile || !pubFile) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Eksik dosya gönderildi.' }) };
        }

        const firstPageImageForAI = await processPdfPage(citFile.content, 1, 1.5);
        let title = `[Başlık Alınamadı] - ${citFile.filename.replace('.pdf','')}`;
        if(firstPageImageForAI) {
            const extractedTitle = await extractTitleWithGemini(Buffer.from(firstPageImageForAI, 'base64'));
            if (extractedTitle) title = extractedTitle;
        }

        const unvanImg = await processPdfPage(pubFile.content, 1);
        const baslikImg = await processPdfPage(citFile.content, 1);
        
        const pdfDoc = await getDocument(new Uint8Array(citFile.content)).promise;
        const totalPages = pdfDoc.numPages;

        const atifImgs = [];
        const kaynakcaImgs = [];

        if (totalPages === 2) {
            atifImgs.push(await processPdfPage(citFile.content, 1));
            kaynakcaImgs.push(await processPdfPage(citFile.content, 2));
        } else if (totalPages === 3) {
            atifImgs.push(await processPdfPage(citFile.content, 2));
            kaynakcaImgs.push(await processPdfPage(citFile.content, 3));
        } else if (totalPages >= 4) {
            atifImgs.push(await processPdfPage(citFile.content, 2));
            atifImgs.push(await processPdfPage(citFile.content, 3));
            kaynakcaImgs.push(await processPdfPage(citFile.content, 4));
            if (totalPages >= 5) {
                kaynakcaImgs.push(await processPdfPage(citFile.content, 5));
            }
        }
        
        const result = { title, unvanImg, baslikImg, atifImgs, kaynakcaImgs };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };

    } catch (error) {
        console.error('Sunucu Hatası:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Sunucuda bir hata meydana geldi.' }) };
    }
};

