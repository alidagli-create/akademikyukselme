document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Gerekli tüm kütüphanelerin yüklendiğinden emin ol
    if (typeof pdfjsLib === 'undefined' || typeof saveAs === 'undefined' || typeof htmlDocx === 'undefined' || typeof jspdf === 'undefined') {
        console.error("Gerekli kütüphanelerden biri veya birkaçı yüklenemedi: pdf.js, FileSaver.js, html-docx.js, jsPDF");
        alert("Sayfa tam olarak yüklenemedi. Lütfen internet bağlantınızı kontrol edip sayfayı yenileyin.");
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const reportForm = document.getElementById('report-form');
    const feedbackArea = document.getElementById('feedback');
    const outputArea = document.getElementById('output');
    const reportPreview = document.getElementById('report-preview');
    const downloadDocxButton = document.getElementById('download-docx');
    const downloadPdfButton = document.getElementById('download-pdf');

    let reportDataStore = []; // Rapor verisini (resimler ve başlıklar) saklamak için
    
    // PDF sayfasını işleyip boyutları ve resim verisiyle birlikte bir obje döndürür
    const processPdfPage = async (pdfDoc, pageNum, scale = 2.0) => {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            return {
                dataURL: canvas.toDataURL('image/jpeg', 0.9),
                width: viewport.width,
                height: viewport.height
            };
        } catch (e) {
            console.error(`Error processing PDF page ${pageNum}:`, e);
            return null;
        }
    };

    // Rapor verisini kullanarak HTML içeriği oluşturan fonksiyon
    const buildReportHTML = (reportTitle, reportYokId, reportData) => {
        let html = `<div class="text-center mb-12 not-prose">
                        <h1 class="text-3xl font-bold">${reportTitle}</h1>
                        <p class="text-xl text-gray-600 mt-1">YÖK ID: ${reportYokId}</p>
                        <h2 class="text-2xl font-bold mt-8 border-t pt-4">Atıflar</h2>
                    </div>`;

        reportData.forEach((data, index) => {
            const sectionIndex = index + 1;
            const MAX_WIDTH_PX = 530; // 14cm yaklaşık 530px
            
            const getImageTag = (imgData) => {
                if (!imgData) return '<p class="text-red-500 italic">[Görsel işlenemedi]</p>';
                const aspectRatio = imgData.height / imgData.width;
                const height = Math.round(MAX_WIDTH_PX * aspectRatio);
                // Word için width ve height niteliklerini doğrudan ekliyoruz
                return `<img src="${imgData.dataURL}" width="${MAX_WIDTH_PX}" height="${height}" style="width: ${MAX_WIDTH_PX}px; height: ${height}px;">`;
            };

            html += `<div class="report-section pt-8">
                        <h3 class="text-xl font-bold mb-4">${sectionIndex}. ${data.title}</h3>
                        <div class="mb-8 break-inside-avoid"><h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Yayının Ünvan Sayfası</h4>${getImageTag(data.unvanImg)}</div>
                        <div class="mb-8 break-inside-avoid"><h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserin Başlık Sayfası</h4>${getImageTag(data.baslikImg)}</div>
                        <div class="mb-8 break-inside-avoid"><h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserde ilk atıf yapılan sayfa</h4>${data.atifImgs.length > 0 ? data.atifImgs.map(getImageTag).join('') : '<p class="italic">[Kurala uygun ek sayfa bulunmuyor.]</p>'}</div>
                        <div class="mb-8 break-inside-avoid"><h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Kaynakça Sayfası</h4>${data.kaynakcaImgs.length > 0 ? data.kaynakcaImgs.map(getImageTag).join('') : '<p class="italic">[Kurala uygun ek sayfa bulunmuyor.]</p>'}</div>
                    </div>`;
        });
        return html;
    };


    if (reportForm) {
        reportForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const eserAdi = document.getElementById('eser-adi').value;
            const eserYokId = document.getElementById('eser-yok-id').value;
            const citationFiles = document.getElementById('citation-files').files;
            const publicationInfoPdfs = document.getElementById('publication-info-pdfs').files;
            
            if (citationFiles.length !== publicationInfoPdfs.length) { alert('Atıf PDF sayısı ile yayın bilgisi PDF sayısı eşit olmalıdır.'); return; }

            reportForm.style.display = 'none';
            outputArea.classList.add('hidden');
            reportPreview.classList.add('hidden');
            feedbackArea.classList.remove('hidden');

            const sortedCitations = Array.from(citationFiles).sort((a, b) => a.name.localeCompare(b.name));
            const sortedPublicationPdfs = Array.from(publicationInfoPdfs).sort((a, b) => a.name.localeCompare(b.name));
            
            reportDataStore = []; // Her seferinde sıfırla

            for (let i = 0; i < sortedCitations.length; i++) {
                const citFile = sortedCitations[i];
                const pubFile = sortedPublicationPdfs[i];
                const currentAtifData = { title: citFile.name.replace('.pdf', ''), unvanImg: null, baslikImg: null, atifImgs: [], kaynakcaImgs: [] };
                try {
                    const pubUrl = URL.createObjectURL(pubFile);
                    const pubPdfDoc = await pdfjsLib.getDocument(pubUrl).promise;
                    currentAtifData.unvanImg = await processPdfPage(pubPdfDoc, 1);
                    URL.revokeObjectURL(pubUrl);
                } catch(e) { console.error(`Yayın PDF'i işlenemedi: ${pubFile.name}`, e); }
                try {
                    const citUrl = URL.createObjectURL(citFile);
                    const citPdfDoc = await pdfjsLib.getDocument(citUrl).promise;
                    const totalPages = citPdfDoc.numPages;
                    currentAtifData.baslikImg = await processPdfPage(citPdfDoc, 1);
                    if (totalPages === 2) {
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 1));
                        currentAtifData.kaynakcaImgs.push(await processPdfPage(citPdfDoc, 2));
                    } else if (totalPages === 3) {
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 2));
                        currentAtifData.kaynakcaImgs.push(await processPdfPage(citPdfDoc, 3));
                    } else if (totalPages === 4) {
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 2));
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 3));
                        currentAtifData.kaynakcaImgs.push(await processPdfPage(citPdfDoc, 4));
                    } else if (totalPages >= 5) {
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 2));
                        currentAtifData.atifImgs.push(await processPdfPage(citPdfDoc, 3));
                        currentAtifData.kaynakcaImgs.push(await processPdfPage(citPdfDoc, 4));
                        currentAtifData.kaynakcaImgs.push(await processPdfPage(citPdfDoc, 5));
                    }
                    URL.revokeObjectURL(citUrl);
                } catch (e) { console.error(`Atıf PDF'i işlenemedi: ${citFile.name}`, e); }
                reportDataStore.push(currentAtifData);
            }

            const generatedReportHTML = buildReportHTML(eserAdi, eserYokId, reportDataStore);
            reportPreview.innerHTML = generatedReportHTML;
            feedbackArea.classList.add('hidden');
            outputArea.classList.remove('hidden');
            reportPreview.classList.remove('hidden');
        });
    }

    if (downloadDocxButton) {
        downloadDocxButton.addEventListener('click', () => {
            if (reportDataStore.length === 0) { alert('Önce rapor oluşturmalısınız.'); return; }
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.docx`;
            const generatedReportHTML = buildReportHTML(eserAdi, document.getElementById('eser-yok-id').value, reportDataStore);
            const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style> * { font-family: 'Times New Roman', serif; } body { margin: 1in; } .report-section { page-break-before: always; } .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; } </style></head><body>${generatedReportHTML}</body></html>`;
            try {
                const converted = htmlDocx.asBlob(content, { orientation: 'portrait' });
                saveAs(converted, fileName);
            } catch(e) { console.error('Word export failed:', e); alert('Rapor Word dosyasına dönüştürülürken bir hata oluştu.'); }
        });
    }
    
    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            if (reportDataStore.length === 0) { alert('Önce rapor oluşturmalısınız.'); return; }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const eserYokId = document.getElementById('eser-yok-id').value;
            doc.setFont('Times-Roman');

            // Ana Başlıklar
            doc.setFontSize(18);
            doc.text(eserAdi, 105, 20, { align: 'center' });
            doc.setFontSize(12);
            doc.text(`YÖK ID: ${eserYokId}`, 105, 30, { align: 'center' });
            doc.setFontSize(14);
            doc.text('Atıflar', 105, 45, { align: 'center' });
            
            const A4_WIDTH = 210;
            const A4_HEIGHT = 297;
            const MARGIN = 15;
            const MAX_IMG_WIDTH = A4_WIDTH - (MARGIN * 2);
            const MAX_IMG_HEIGHT = A4_HEIGHT - 60; // Başlıklar vs için pay bırakıyoruz
            let y = 60; // Yazdırmaya başlayacağımız Y pozisyonu

            const addSection = (title, images) => {
                doc.addPage();
                y = MARGIN;
                doc.setFontSize(12);
                doc.text(title, MARGIN, y);
                y += 10;
                
                images.forEach(imgData => {
                    if (!imgData) return;
                    const aspectRatio = imgData.height / imgData.width;
                    let imgWidth = MAX_IMG_WIDTH;
                    let imgHeight = imgWidth * aspectRatio;

                    if (imgHeight > MAX_IMG_HEIGHT) {
                        imgHeight = MAX_IMG_HEIGHT;
                        imgWidth = imgHeight / aspectRatio;
                    }

                    const x = (A4_WIDTH - imgWidth) / 2; // Resmi ortala
                    doc.addImage(imgData.dataURL, 'JPEG', x, y, imgWidth, imgHeight);
                });
            };

            reportDataStore.forEach((data, index) => {
                const sectionIndex = index + 1;
                addSection(`${sectionIndex}. ${data.title}\nA${sectionIndex}. Yayının Ünvan Sayfası`, [data.unvanImg]);
                addSection(`A${sectionIndex}. Eserin Başlık Sayfası`, [data.baslikImg]);
                addSection(`A${sectionIndex}. Eserde ilk atıf yapılan sayfa`, data.atifImgs);
                addSection(`A${sectionIndex}. Kaynakça Sayfası`, data.kaynakcaImgs);
            });
            
            // İlk boş sayfayı sil
            doc.deletePage(1);

            doc.save(`${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.pdf`);
        });
    }
});
