document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    if (typeof pdfjsLib === 'undefined') {
        console.error("PDF.js library is not loaded.");
        alert("PDF.js kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const reportForm = document.getElementById('report-form');
    const feedbackArea = document.getElementById('feedback');
    const outputArea = document.getElementById('output');
    const reportPreview = document.getElementById('report-preview');
    const downloadDocxButton = document.getElementById('download-docx');
    const downloadPdfButton = document.getElementById('download-pdf');

    // PDF sayfasını bir resim (canvas) olarak çizen fonksiyon
    const renderPdfPageToCanvas = async (pdfDoc, pageNum, scale = 1.5) => {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.className = 'border shadow-md mx-auto mb-4'; // Resimler arasına boşluk ekledik
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            return canvas;
        } catch (e) {
            console.error(`Error rendering PDF page ${pageNum}:`, e);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'border shadow-md p-4 text-red-500 italic bg-red-50 h-64 flex items-center justify-center';
            errorDiv.textContent = `[Sayfa ${pageNum} işlenirken hata oluştu.]`;
            return errorDiv;
        }
    };

    const createPlaceholder = (text) => {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder-content border shadow-md p-4 text-gray-500 italic bg-gray-50 h-64 flex items-center justify-center';
        placeholder.textContent = text;
        return placeholder;
    };

    if (reportForm) {
        reportForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!reportForm.checkValidity()) {
                reportForm.reportValidity();
                return;
            }

            const eserAdi = document.getElementById('eser-adi').value;
            const eserYokId = document.getElementById('eser-yok-id').value;
            const citationFiles = document.getElementById('citation-files').files;
            const publicationInfoPdfs = document.getElementById('publication-info-pdfs').files;

            if (citationFiles.length === 0 || publicationInfoPdfs.length === 0) {
                 alert('Lütfen hem atıf hem de yayın bilgisi PDF dosyalarını seçin.');
                 return;
            }
            if (citationFiles.length !== publicationInfoPdfs.length) {
                alert('Atıf PDF sayısı ile yayın bilgisi PDF sayısı eşit olmalıdır.');
                return;
            }

            reportForm.style.display = 'none';
            outputArea.classList.add('hidden');
            reportPreview.classList.add('hidden');
            feedbackArea.classList.remove('hidden');

            const sortedCitations = Array.from(citationFiles).sort((a, b) => a.name.localeCompare(b.name));
            const sortedPublicationPdfs = Array.from(publicationInfoPdfs).sort((a, b) => a.name.localeCompare(b.name));

            reportPreview.innerHTML = '';
            const mainHeader = document.createElement('div');
            mainHeader.className = 'text-center mb-12 not-prose';
            mainHeader.innerHTML = `
                <h1 class="text-3xl font-bold text-navy-900" style="font-family: 'Times New Roman', serif;">${eserAdi}</h1>
                <p class="text-xl text-gray-600 mt-1" style="font-family: 'Times New Roman', serif;">YÖK ID: ${eserYokId}</p>
                <h2 class="text-2xl font-bold mt-8 border-t border-gray-200 pt-4 text-navy-900" style="font-family: 'Times New Roman', serif;">Atıflar</h2>
            `;
            reportPreview.appendChild(mainHeader);

            for (let i = 0; i < sortedCitations.length; i++) {
                const sectionIndex = i + 1;
                const citFile = sortedCitations[i];
                const pubFile = sortedPublicationPdfs[i];

                const section = document.createElement('div');
                section.className = 'report-section pt-8';
                
                const atifTitle = citFile.name.replace('.pdf', '');
                section.innerHTML = `<h3 class="text-xl font-bold mb-4" style="font-family: 'Times New Roman', serif;">${sectionIndex}. ${atifTitle}</h3>`;

                // Bölüm 1: Yayın Unvan Sayfası
                const unvanDiv = document.createElement('div');
                unvanDiv.className = 'mb-8 break-inside-avoid';
                unvanDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2" style="font-family: 'Times New Roman', serif;">A${sectionIndex}. Yayının Ünvan Sayfası</h4>`;
                unvanDiv.appendChild(createPlaceholder('[Yayın bilgisi yükleniyor...]'));
                section.appendChild(unvanDiv);

                // Bölüm 2: Eserin Başlık Sayfası
                const baslikDiv = document.createElement('div');
                baslikDiv.className = 'mb-8 break-inside-avoid';
                baslikDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2" style="font-family: 'Times New Roman', serif;">A${sectionIndex}. Eserin Başlık Sayfası</h4>`;
                baslikDiv.appendChild(createPlaceholder('[Eser başlık sayfası yükleniyor...]'));
                section.appendChild(baslikDiv);

                // Bölüm 3: İlk Atıf Yapılan Sayfa
                const atifDiv = document.createElement('div');
                atifDiv.className = 'mb-8 break-inside-avoid';
                atifDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2" style="font-family: 'Times New Roman', serif;">A${sectionIndex}. Eserde ilk atıf yapılan sayfa</h4>`;
                section.appendChild(atifDiv);

                // Bölüm 4: Kaynakça Sayfası
                const kaynakcaDiv = document.createElement('div');
                kaynakcaDiv.className = 'mb-8 break-inside-avoid';
                kaynakcaDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2" style="font-family: 'Times New Roman', serif;">A${sectionIndex}. Kaynakça Sayfası</h4>`;
                section.appendChild(kaynakcaDiv);

                reportPreview.appendChild(section);

                // Yayın Bilgisi PDF'ini işle (her zaman ilk sayfa)
                try {
                    const pubUrl = URL.createObjectURL(pubFile);
                    const pubPdfDoc = await pdfjsLib.getDocument(pubUrl).promise;
                    const pubCanvas = await renderPdfPageToCanvas(pubPdfDoc, 1);
                    unvanDiv.querySelector('.placeholder-content').replaceWith(pubCanvas);
                    URL.revokeObjectURL(pubUrl);
                } catch(e) { unvanDiv.querySelector('.placeholder-content').textContent = `[PDF işlenemedi: ${e.message}]`; }

                // Atıf PDF'ini işle (yeni kurallara göre)
                try {
                    const citUrl = URL.createObjectURL(citFile);
                    const citPdfDoc = await pdfjsLib.getDocument(citUrl).promise;
                    const totalPages = citPdfDoc.numPages;
                    
                    // Madde 2 (Başlık Sayfası) her zaman 1. sayfadır
                    const baslikCanvas = await renderPdfPageToCanvas(citPdfDoc, 1);
                    baslikDiv.querySelector('.placeholder-content').replaceWith(baslikCanvas);
                    
                    // *** YENİ KURAL MANTIĞI BURADA BAŞLIYOR ***

                    if (totalPages <= 1) {
                        atifDiv.appendChild(createPlaceholder('[PDF tek sayfalı, atıf için ek sayfa yok.]'));
                        kaynakcaDiv.appendChild(createPlaceholder('[PDF tek sayfalı, kaynakça için ek sayfa yok.]'));
                    } else if (totalPages === 2) {
                        // Madde 3: ilk sayfa
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 1));
                        // Madde 4: ikinci sayfa
                        kaynakcaDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 2));
                    } else if (totalPages === 3) {
                        // Madde 3: ikinci sayfa
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 2));
                        // Madde 4: üçüncü sayfa
                        kaynakcaDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 3));
                    } else if (totalPages === 4) {
                        // Madde 3: 2. ve 3. sayfalar
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 2));
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 3));
                        // Madde 4: 4. sayfa
                        kaynakcaDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 4));
                    } else { // 5 veya daha fazla sayfa
                        // Madde 3: 2. ve 3. sayfalar
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 2));
                        atifDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 3));
                        // Madde 4: 4. ve 5. sayfalar
                        kaynakcaDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 4));
                        kaynakcaDiv.appendChild(await renderPdfPageToCanvas(citPdfDoc, 5));
                    }

                    URL.revokeObjectURL(citUrl);
                } catch(e) { 
                    baslikDiv.querySelector('.placeholder-content')?.remove();
                    baslikDiv.appendChild(createPlaceholder(`[PDF işlenemedi: ${e.message}]`));
                    atifDiv.appendChild(createPlaceholder(`[PDF işlenemedi: ${e.message}]`));
                    kaynakcaDiv.appendChild(createPlaceholder(`[PDF işlenemedi: ${e.message}]`));
                }
            }

            feedbackArea.classList.add('hidden');
            outputArea.classList.remove('hidden');
            reportPreview.classList.remove('hidden');
        });
    }

    // İndirme fonksiyonları öncekiyle aynı, onlarda bir değişiklik yok.
    if (downloadDocxButton) {
        downloadDocxButton.addEventListener('click', () => {
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.docx`;
            const reportContent = document.getElementById('report-preview').cloneNode(true);
            reportContent.querySelectorAll('canvas').forEach(canvas => {
                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/png', 0.9);
                img.style.width = '100%';
                img.style.height = 'auto';
                canvas.parentNode.replaceChild(img, canvas);
            });
            const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style> * { font-family: 'Times New Roman', serif; } img { max-width: 100%; height: auto; display: block; margin: 16px 0; } .report-section { page-break-before: always; } .break-inside-avoid { page-break-inside: avoid; } </style></head><body>${reportContent.innerHTML}</body></html>`;
            try {
                const converted = htmlDocx.asBlob(content, { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } });
                saveAs(converted, fileName);
            } catch(e) { console.error('Word export failed:', e); alert('Rapor Word dosyasına dönüştürülürken bir hata oluştu.'); }
        });
    }
    
    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}_Raporu.pdf`;
            const element = document.getElementById('report-preview');
            const opt = { margin: [0.7, 0.7, 0.7, 0.7], filename: fileName, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, logging: false, dpi: 192, letterRendering: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'avoid-all'], before: '.report-section' } };
            setTimeout(() => { html2pdf().from(element).set(opt).save(); }, 500);
        });
    }
});
