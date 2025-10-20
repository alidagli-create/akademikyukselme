const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { imageBase64 } = JSON.parse(event.body);
        if (!imageBase64) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Resim verisi eksik.' }) };
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("Gemini API anahtarı bulunamadı!");
            return { statusCode: 500, body: JSON.stringify({ error: 'Sunucu tarafında API anahtarı yapılandırılmamış.' }) };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        const result = await model.generateContent([
            "Bu akademik makale sayfasındaki en büyük ve en belirgin metin olan ana başlığı çıkar. Sadece ve sadece tam başlığı döndür.",
            { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
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
