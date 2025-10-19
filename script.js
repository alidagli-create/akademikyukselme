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

    const renderPdfPageToCanvas = async (pdfDoc, pageNum, scale = 1.5) => {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.className = 'border shadow-md max-w-full mx-auto';
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

    const findHighlightAnnotations = async (pdfDoc) => {
        const highlights = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const annotations = await page.getAnnotations();
            annotations
                .filter(ann => ann.subtype === 'Highlight')
                .forEach(ann => {
                    highlights.push({ pageNum: i, annotation: ann });
                });
        }
        return highlights;
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
                <h1 class="text-3xl font-bold text-navy-900">${eserAdi}</h1>
                <p class="text-xl text-gray-600 mt-1">YÖK ID: ${eserYokId}</p>
                <h2 class="text-2xl font-bold mt-8 border-t border-gray-200 pt-4 text-navy-900">Atıflar</h2>
            `;
            reportPreview.appendChild(mainHeader);

            for (let i = 0; i < sortedCitations.length; i++) {
                const sectionIndex = i + 1;
                const citFile = sortedCitations[i];
                const pubFile = sortedPublicationPdfs[i];

                const section = document.createElement('div');
                section.className = 'report-section pt-8';
                
                section.innerHTML = `<h3 class="text-xl font-bold mb-4">Atıf ${sectionIndex}</h3>`;

                const unvanDiv = document.createElement('div');
                unvanDiv.className = 'mb-8 break-inside-avoid';
                unvanDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Yayının Ünvan Sayfası</h4>`;
                unvanDiv.appendChild(createPlaceholder('[Yayın bilgisi yükleniyor...]'));
                section.appendChild(unvanDiv);

                const baslikDiv = document.createElement('div');
                baslikDiv.className = 'mb-8 break-inside-avoid';
                baslikDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserin Başlık Sayfası</h4>`;
                baslikDiv.appendChild(createPlaceholder('[Eser başlık sayfası yükleniyor...]'));
                section.appendChild(baslikDiv);

                const atifDiv = document.createElement('div');
                atifDiv.className = 'mb-8 break-inside-avoid';
                atifDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Eserde ilk atıf yapılan sayfa</h4>`;
                atifDiv.appendChild(createPlaceholder('[Vurgular aranıyor...]'));
                section.appendChild(atifDiv);

                const kaynakcaDiv = document.createElement('div');
                kaynakcaDiv.className = 'mb-8 break-inside-avoid';
                kaynakcaDiv.innerHTML = `<h4 class="text-lg font-semibold mb-2">A${sectionIndex}. Kaynakça Sayfası</h4>`;
                kaynakcaDiv.appendChild(createPlaceholder('[Vurgular aranıyor...]'));
                section.appendChild(kaynakcaDiv);

                reportPreview.appendChild(section);

                try {
                    const pubUrl = URL.createObjectURL(pubFile);
                    const pubPdfDoc = await pdfjsLib.getDocument(pubUrl).promise;
                    const pubCanvas = await renderPdfPageToCanvas(pubPdfDoc, 1);
                    unvanDiv.querySelector('.placeholder-content').replaceWith(pubCanvas);
                    URL.revokeObjectURL(pubUrl);
                } catch(e) { unvanDiv.querySelector('.placeholder-content').textContent = `[PDF işlenemedi: ${e.message}]`; }

                try {
                    const citUrl = URL.createObjectURL(citFile);
                    const citPdfDoc = await pdfjsLib.getDocument(citUrl).promise;
                    
                    const baslikCanvas = await renderPdfPageToCanvas(citPdfDoc, 1);
                    baslikDiv.querySelector('.placeholder-content').replaceWith(baslikCanvas);
                    
                    const allHighlights = await findHighlightAnnotations(citPdfDoc);
                    const atifPlaceholder = atifDiv.querySelector('.placeholder-content');
                    const kaynakcaPlaceholder = kaynakcaDiv.querySelector('.placeholder-content');

                    if (allHighlights.length === 0) {
                        atifPlaceholder.textContent = '[Atıf vurgusu bulunamadı.]';
                        kaynakcaPlaceholder.textContent = '[Kaynakça vurgusu bulunamadı.]';
                    } else {
                        const firstHighlight = allHighlights[0];
                        const firstCanvas = await renderPdfPageToCanvas(citPdfDoc, firstHighlight.pageNum);
                        atifPlaceholder.replaceWith(firstCanvas);

                        const firstPage = await citPdfDoc.getPage(firstHighlight.pageNum);
                        const firstViewport = firstPage.getViewport({ scale: 1 });
                        if (firstHighlight.annotation.rect[1] < firstViewport.height * 0.15 && firstHighlight.pageNum < citPdfDoc.numPages) {
                             const overflowCanvas = await renderPdfPageToCanvas(citPdfDoc, firstHighlight.pageNum + 1);
                             atifDiv.appendChild(overflowCanvas);
                        }
                        
                        if (allHighlights.length > 1) {
                            const lastHighlight = allHighlights[allHighlights.length - 1];
                            const lastCanvas = await renderPdfPageToCanvas(citPdfDoc, lastHighlight.pageNum);
                            kaynakcaPlaceholder.replaceWith(lastCanvas);

                            const lastPage = await citPdfDoc.getPage(lastHighlight.pageNum);
                            const lastViewport = lastPage.getViewport({ scale: 1 });
                            if (lastHighlight.annotation.rect[1] < lastViewport.height * 0.15 && lastHighlight.pageNum < citPdfDoc.numPages) {
                                const overflowCanvas = await renderPdfPageToCanvas(citPdfDoc, lastHighlight.pageNum + 1);
                                kaynakcaDiv.appendChild(overflowCanvas);
                            }
                        } else {
                             kaynakcaPlaceholder.textContent = '[Sadece bir vurgu bulundu, kaynakça için ayrı bir vurgu yok.]';
                        }
                    }
                    URL.revokeObjectURL(citUrl);
                } catch(e) { 
                    baslikDiv.querySelector('.placeholder-content').textContent = `[PDF işlenemedi: ${e.message}]`;
                    atifDiv.querySelector('.placeholder-content').textContent = `[PDF işlenemedi: ${e.message}]`;
                    kaynakcaDiv.querySelector('.placeholder-content').textContent = `[PDF işlenemedi: ${e.message}]`;
                }
            }

            feedbackArea.classList.add('hidden');
            outputArea.classList.remove('hidden');
            reportPreview.classList.remove('hidden');
        });
    }

    if (downloadDocxButton) {
        downloadDocxButton.addEventListener('click', () => {
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(new RegExp('[\\\\\\\\/:*?\\\"<>|]', 'g'), '').replace(new RegExp('\\s+', 'g'), '_')}_Raporu.docx`;
            
            const reportContent = document.getElementById('report-preview').cloneNode(true);

            reportContent.querySelectorAll('canvas').forEach(canvas => {
                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/png');
                img.width = canvas.width;
                img.height = canvas.height;
                img.style.maxWidth = '100%';
                canvas.parentNode.replaceChild(img, canvas);
            });
            
            const content = `<!DOCTYPE html><html><head><meta charset=\\"UTF-8\\"><style>img { max-width: 100%; height: auto; max-height: 700px; object-fit: contain; display: block; } .report-section { page-break-before: always; } .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; } </style></head><body>${reportContent.innerHTML}</body></html>`;

            try {
                const converted = htmlDocx.asBlob(content);
                saveAs(converted, fileName);
            } catch(e) {
                console.error('Word export failed:', e);
                alert('Rapor Word dosyasına dönüştürülürken bir hata oluştu.');
            }
        });
    }
    
    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            const eserAdi = document.getElementById('eser-adi').value || 'Rapor';
            const fileName = `${eserAdi.trim().replace(new RegExp('[\\\\\\\\/:*?\\\"<>|]', 'g'), '').replace(new RegExp('\\s+', 'g'), '_')}_Raporu.pdf`;
            const element = document.getElementById('report-preview');

            const opt = {
                margin:       [0.5, 0.5, 0.5, 0.5],
                filename:     fileName,
                image:        { type: 'jpeg', quality: 0.7 },
                html2canvas:  { scale: 2, useCORS: true, logging: false },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'avoid-all'], before: '.report-section' }
            };

            html2pdf().from(element).set(opt).save();
        });
    }
});
