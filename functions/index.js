/**
 * Cloud Functions - Gemini bridge
 * Requiere configurar la API key:
 *   firebase functions:config:set gemini.key="TU_API_KEY"
 */
const { onCall } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.geminiSuggest = onCall(async (request) => {
  try{
    const key = (process.env.GEMINI_API_KEY) ||
                ((global.firebaseConfig && global.firebaseConfig.gemini && global.firebaseConfig.gemini.key)) ||
                (require("firebase-functions").config().gemini && require("firebase-functions").config().gemini.key);
    if(!key) return { text: "Configura la API key: firebase functions:config:set gemini.key=\"...\"" };

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const q = String((request?.data && request.data.prompt) || "Sugerencias breves para abrir una cafetería/heladería.");
    const sys = "Eres un asistente de operaciones para la tienda ARTEMISA (café/heladería). Responde breve, práctico y accionable.";
    const res = await model.generateContent([{role:"user",parts:[{text: sys + "\\n\\nPregunta: " + q}]}]);
    const text = res.response.text();
    return { text };
  }catch(e){
    console.error(e);
    return { text: "No pude generar respuesta. Revisa el deploy y la API key." };
  }
});