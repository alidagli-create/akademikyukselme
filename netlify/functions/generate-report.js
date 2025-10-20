const busboy = require('busboy');
const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak } = require('docx');
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Dosyaları ve form verilerini ayrıştırmak için yardımcı fonksiyon
const parseMultipartForm = (event) => {
    return new Promise((resolve) => {
        const fields = {};
        const files = {};
        const bb = busboy({ headers: event.headers });

        bb.on('file', (fieldname, file, { filename }) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                if (!files[fieldname]) files[fieldname] = [];
                files[fieldname].push({
                    filename,
                    content: Buffer.concat(chunks),
                });
            });
        });

        bb.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        bb.on('close', () => {
            resolve({ fields, files });
        });

        bb.end(Buffer.from(event.body, 'base64'));
    });
};

// PDF sayfasını resim verisine dönüştüren fonksiyon
const processPdfPage = async (pdfBuffer, pageNum, scale = 1.8) => {
    try {
        const data = new Uint8Array(pdfBuffer);
        const pdfDoc = await getDocument(data).promise;
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        return canvas.toBuffer('image/jpeg', { quality: 0.85 });
    } catch (e) {
        console.error(`Error processing PDF page ${pageNum}:`, e);
        return null;
    }
};

// Gemini ile başlık tespiti yapan fonksiyon
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
            "Bu akademik makale sayfasındaki en büyük ve en belirgin metin olan ana başlığı çıkar. Sadece ve sadece tam başlığı döndür, başka hiçbir açıklama, yazar adı veya ek metin ekleme.",
            { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } }
        ]);
        const response = await result.response;
        let title = response.text();
        title = title.replace(/\$_{([^}]+)}/g, '$1').replace(/\$/g, '');
        return title;
    } catch (error) {
        console.error("Gemini API'ye bağlanırken hata oluştu:", error);
        return null;
    }
};


// Ana sunucu fonksiyonu
exports.handler = async (event) => {
    try {
        const { fields, files } = await parseMultipartForm(event);
        const { 'eser-adi': eserAdi, 'eser-yok-id': eserYokId } = fields;
        const citationFiles = files['citation-files'] || [];
        const publicationInfoPdfs = files['publication-info-pdfs'] || [];

        if (citationFiles.length !== publicationInfoPdfs.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Dosya sayıları eşleşmiyor.' }) };
        }

        const naturalSort = (a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
        citationFiles.sort(naturalSort);
        publicationInfoPdfs.sort(naturalSort);
        
        const reportData = [];
        const titleList = [];

        for (let i = 0; i < citationFiles.length; i++) {
            const citFile = citationFiles[i];
            const pubFile = publicationInfoPdfs[i];
            
            const firstPageImageForAI = await processPdfPage(citFile.content, 1, 1.5);
            let title = `[Başlık Alınamadı] - ${citFile.filename.replace('.pdf','')}`;
            if(firstPageImageForAI) {
                const extractedTitle = await extractTitleWithGemini(firstPageImageForAI);
                if (extractedTitle) title = extractedTitle;
            }
            titleList.push(title);

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
            } else if (totalPages === 4) {
                atifImgs.push(await processPdfPage(citFile.content, 2));
                atifImgs.push(await processPdfPage(citFile.content, 3));
                kaynakcaImgs.push(await processPdfPage(citFile.content, 4));
            } else if (totalPages >= 5) {
                atifImgs.push(await processPdfPage(citFile.content, 2));
                atifImgs.push(await processPdfPage(citFile.content, 3));
                kaynakcaImgs.push(await processPdfPage(citFile.content, 4));
                kaynakcaImgs.push(await processPdfPage(citFile.content, 5));
            }
            
            reportData.push({ unvanImg, baslikImg, atifImgs, kaynakcaImgs });
        }

        const sections = [];
        // Ana başlık bölümü
        sections.push({
            properties: { page: { size: { orientation: 'portrait' } } },
            children: [
                new Paragraph({ text: eserAdi, heading: 'Title', alignment: 'center' }),
                new Paragraph({ text: `YÖK ID: ${eserYokId}`, alignment: 'center' }),
                new Paragraph({ text: 'Atıflar', heading: 'Heading1', alignment: 'center' }),
                ...titleList.map((title, i) => new Paragraph({ text: `${i+1}. ${title}`, style: 'ListParagraph' })),
                new Paragraph({ children: [new PageBreak()] })
            ],
        });
        
        // Her atıf için bölümler
        reportData.forEach((data, index) => {
            const createSection = (title, images) => {
                const children = [new Paragraph({ text: title, heading: 'Heading4' })];
                images.forEach(img => {
                    if (img) children.push(new Paragraph({ children: [new ImageRun({ data: img, transformation: { width: 605, height: 855 } })]}));
                });
                return children;
            };

            sections.push({
                 children: [
                    new Paragraph({ text: `Atıf ${index + 1}`, heading: 'Heading3' }),
                    ...createSection(`A${index + 1}. Yayının Ünvan Sayfası`, [data.unvanImg]),
                    ...createSection(`A${index + 1}. Eserin Başlık Sayfası`, [data.baslikImg]),
                    ...createSection(`A${index + 1}. Eserde ilk atıf yapılan sayfa`, data.atifImgs),
                    ...createSection(`A${index + 1}. Kaynakça Sayfası`, data.kaynakcaImgs),
                    new Paragraph({ children: [new PageBreak()] })
                ]
            });
        });

        const doc = new Document({ sections });
        const buffer = await Packer.toBuffer(doc);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
            body: buffer.toString('base64'),
            isBase64Encoded: true,
        };

    } catch (error) {
        console.error('Sunucu Hatası:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Rapor oluşturulurken sunucuda bir hata meydana geldi.' }) };
    }
};
