const apiKey = "xxxxxxxxxxx"; // <--- Pega tu nueva Key aquí
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listarModelos() {
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("Error de API:", data.error.message);
      return;
    }

    if (!data.models) {
      console.log("No se encontraron modelos. Respuesta:", data);
      return;
    }

    console.log("=== MODELOS DISPONIBLES PARA TI ===");
    const compatibles = data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", "")); // Limpiamos el nombre
    
    compatibles.forEach(name => console.log(`"${name}"`));
    
  } catch (error) {
    console.error("Error de red:", error);
  }
}

listarModelos();