// Bu dosya, Netlify'da çalışacak olan güvenli "arka plan yardımcısı"dır.
// API anahtarını gizli tutarak Gemini'ye istek gönderir.

exports.handler = async function (event) {
  // Gelen isteğin POST metoduyla yapıldığını kontrol et
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { image } = JSON.parse(event.body);
    
    // API anahtarını Netlify'ın güvenli ortam değişkenlerinden al
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API anahtarı bulunamadı.");
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const payload = {
      "contents": [{
          "parts": [
              { "text": "Bu akademik makale sayfasındaki en büyük ve en belirgin metin olan ana başlığı çıkar. Sadece ve sadece tam başlığı döndür, başka hiçbir açıklama, yazar adı veya ek metin ekleme." },
              { "inline_data": { "mime_type": "image/jpeg", "data": image } }
          ]
      }]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", errorBody);
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: "Gemini API hatası oluştu." }),
        };
    }

    const data = await response.json();
    const title = data.candidates[0]?.content?.parts[0]?.text.trim().replace(/\n/g, ' ') || null;

    return {
      statusCode: 200,
      body: JSON.stringify({ title: title }),
    };

  } catch (error) {
    console.error('Yardımcıda hata oluştu:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "İç sunucu hatası." }),
    };
  }
};
