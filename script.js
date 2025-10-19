document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    if (typeof pdfjsLib === 'undefined' || typeof saveAs === 'undefined' || typeof htmlDocx === 'undefined' || typeof html2pdf === 'undefined') {
        console.error("Gerekli kütüphanelerden biri veya birkaçı yüklenemedi.");
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

    let generatedReportHTML = '';

    const processPdfPageToDataURL = async (pdfDoc, pageNum, scale = 1.8) => {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            return canvas.toDataURL('image/jpeg', 0.85);
        } catch (e) {
            console.error(`Error processing PDF page ${pageNum}:`, e);
            return null;
        }
    };

    const buildReportHTML = (reportTitle, reportYokId, reportData) => {
        let html = `<div class="text-center mb-12 not-prose">
                        <h1 class="text-3xl font-bold">${reportTitle}</h1>
                        <p class="text-xl text-gray-600 mt-1">YÖK ID: ${reportYokId}</p>
                        <h2 class="text-2xl font-bold mt-8 border-t pt-4">Atıflar</h2>
                    </div>`;

        reportData.forEach((data, index) => {
            const sectionIndex = index + 1;
            html += `<div class="report-section pt-8">
                        <h3 class="text-xl font-bold mb-4">${sectionIndex}. ${data.title}</h3>
                        
                        <div class="mb-8 break-inside-avoid">
                            <h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Yayının Ünvan Sayfası</h4>
                            ${data.unvanImg ? `<img src="${data.unvanImg}" style="max-width: 14cm; width: 100%; height: auto; object-fit: contain;">` : '<p class="text-red-500 italic">[Görsel işlenemedi]</p>'}
                        </div>
                        
                        <div class="mb-8 break-inside-avoid">
                            <h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserin Başlık Sayfası</h4>
                            ${data.baslikImg ? `<img src="${data.baslikImg}" style="max-width: 14cm; width: 100%; height: auto; object-fit: contain;">` : '<p class="text-red-500 italic">[Görsel işlenemedi]</p>'}
                        </div>

                        <div class="mb-8 break-inside-avoid">
                            <h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserde ilk atıf yapılan sayfa</h4>
                            ${data.atifImgs.length > 0 ? data.atifImgs.map(src => `<img src="${src}" style="max-width: 14cm; width: 100%; height: auto; object-fit: contain; margin-bottom: 1rem;">`).join('') : '<p class="italic text-gray-600">[Kurala uygun ek sayfa bulunmuyor.]</p>'}
                        </div>

                        <div class="mb-8 break-inside-avoid">
                            <h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Kaynakça Sayfası</h4>
                             ${data.kaynakcaImgs.length > 0 ? data.kaynakcaImgs.map(src => `<img src="${src}" style="max-width: 14cm; width: 100%; height: auto; object-fit: contain; margin-bottom: 1rem;">`).join('') : '<p class="italic text-gray-600">[Kurala uygun ek sayfa bulunmuyor.]</p>'}
                        </div>
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
            
            if (citationFiles.length !== publicationInfoPdfs.length) {
                alert('Atıf PDF sayısı ile yayın bilgisi PDF sayısı eşit olmalıdır.'); return;
            }

            reportForm.style.display = 'none';
            outputArea.classList.add('hidden');
            reportPreview.classList.add('hidden');
            feedbackArea.classList.remove('hidden');

            const sortedCitations = Array.from(citationFiles).sort((a, b) => a.name.localeCompare(b.name));
            const sortedPublicationPdfs = Array.from(publicationInfoPdfs).sort((a, b) => a.name.localeCompare(b.name));
            const reportData = [];

            for (let i = 0; i < sortedCitations.length; i++) {
                const citFile = sortedCitations[i];
                const pubFile = sortedPublicationPdfs[i];
                const currentAtifData = { title: citFile.name.replace('.pdf', ''), unvanImg: null, baslikImg: null, atifImgs: [], kaynakcaImgs: [] };
                try {
                    const pubUrl = URL.createObjectURL(pubFile);
                    const pubPdfDoc = await pdfjsLib.getDocument(pubUrl).promise;
                    currentAtifData.unvanImg = await processPdfPageToDataURL(pubPdfDoc, 1);
                    URL.revokeObjectURL(pubUrl);
                } catch(e) { console.error(`Yayın PDF'i işlenemedi: ${pubFile.name}`, e); }
                try {
                    const citUrl = URL.createObjectURL(citFile);
                    const citPdfDoc = await pdfjsLib.getDocument(citUrl).promise;
                    const totalPages = citPdfDoc.numPages;
                    currentAtifData.baslikImg = await processPdfPageToDataURL(citPdfDoc, 1);
                    if (totalPages === 2) {
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 1));
                        currentAtifData.kaynakcaImgs.push(await processPdfPageToDataURL(citPdfDoc, 2));
                    } else if (totalPages === 3) {
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 2));
                        currentAtifData.kaynakcaImgs.push(await processPdfPageToDataURL(citPdfDoc, 3));
                    } else if (totalPages === 4) {
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 2));
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 3));
                        currentAtifData.kaynakcaImgs.push(await processPdfPageToDataURL(citPdfDoc, 4));
                    } else if (totalPages >= 5) {
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 2));
                        currentAtifData.atifImgs.push(await processPdfPageToDataURL(citPdfDoc, 3));
                        currentAtifData.kaynakcaImgs.push(await processPdfPageToDataURL(citPdfDoc, 4));
                        currentAtifData.kaynakcaImgs.push(await processPdfPageToDataURL(citPdfDoc, 5));
                    }
                    URL.revokeObjectURL(citUrl);
                } catch (e) { console.error(`Atıf PDF'i işlenemedi: ${citFile.name}`, e); }
                reportData.push(currentAtifData);
            }

            generatedReportHTML = buildReportHTML(eserAdi, eserYokId, reportData);
            reportPreview.innerHTML = generatedReportHTML;
            feedbackArea.classList.add('hidden');
            outputArea.classList.remove('hidden');
            reportPreview.classList.remove('hidden');
        });
    }

    if (downloadDocxButton) {
        downloadDocxButton.addEventListener('click', () => {
            if (!generatedReportHTML) { alert('Önce rapor oluşturmalısınız.'); return; }
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.docx`;
            const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style> * { font-family: 'Times New Roman', serif; } body { margin: 1in; } h1, h2, h3, h4, p { margin: 12px 0; } img { display: block; margin: 16px 0; } .report-section { page-break-before: always; } .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; } </style></head><body>${generatedReportHTML}</body></html>`;
            try {
                const converted = htmlDocx.asBlob(content, { orientation: 'portrait' });
                saveAs(converted, fileName);
            } catch(e) { console.error('Word export failed:', e); alert('Rapor Word dosyasına dönüştürülürken bir hata oluştu.'); }
        });
    }
    
    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            if (!generatedReportHTML) { alert('Önce rapor oluşturmalısınız.'); return; }
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.pdf`;

            // PDF için özel, temiz bir HTML yapısı oluşturuyoruz.
            const pdfHtml = `<html><head><style> body { font-family: 'Times New Roman', serif; margin: 0.7in; } h1, h2, h3, h4, p { margin: 12px 0; } .report-section { page-break-before: always; } .break-inside-avoid { page-break-inside: avoid; } img { display: block; max-width: 100%; max-height: 9.5in; /* Resmin bir sayfadan taşmasını engeller */ object-fit: contain; margin-top: 16px; } </style></head><body>${generatedReportHTML}</body></html>`;
            
            const element = document.createElement('div');
            element.innerHTML = pdfHtml;

            const opt = { margin: 0, filename: fileName, image: { type: 'jpeg', quality: 0.90 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            
            html2pdf().from(element).set(opt).save();
        });
    }
});
