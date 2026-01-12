import React, { useState, useEffect, useRef } from 'react';
import { 
  Shirt, 
  User, 
  Settings, 
  Upload, 
  X, 
  Wand2, 
  Download, 
  AlertCircle, 
  Info, 
  Check, 
  Loader2,
  Sliders
} from 'lucide-react';

const App = () => {
  // --- Estado de la Aplicación ---
  const [personImage, setPersonImage] = useState(null);
  const [garmentImage, setGarmentImage] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  
  // --- Configuración y Controles ---
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [envKeyDetected, setEnvKeyDetected] = useState(false);
  
  // --- Opciones de Generación ---
  const [fitType, setFitType] = useState("regular");
  const [extraPrompt, setExtraPrompt] = useState("");

  // Referencias para inputs de archivo ocultos
  const personInputRef = useRef(null);
  const garmentInputRef = useRef(null);

  // --- Inicialización (Detectar API Key de Vite) ---
  useEffect(() => {
    try {
      // En Vite, las variables de entorno se acceden así:
      const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
      if (envKey) {
        setApiKey(envKey);
        setEnvKeyDetected(true);
      }
    } catch (e) {
      console.log("No se detectaron variables de entorno (modo standalone)");
    }
  }, []);

  // --- Manejadores de Archivos ---
  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) processFile(file, type);
  };

  const processFile = (file, type) => {
    if (!file.type.startsWith('image/')) {
      showError('Por favor sube solo archivos de imagen (JPG, PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      // Extraemos solo la data cruda y el tipo para la API
      const rawBase64 = base64.split(',')[1];
      const mimeType = base64.split(';')[0].split(':')[1];
      
      const imageData = { 
        preview: base64, 
        data: rawBase64, 
        mimeType: mimeType 
      };

      if (type === 'person') setPersonImage(imageData);
      else setGarmentImage(imageData);
      
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (e, type) => {
    e.stopPropagation();
    if (type === 'person') {
      setPersonImage(null);
      if (personInputRef.current) personInputRef.current.value = "";
    } else {
      setGarmentImage(null);
      if (garmentInputRef.current) garmentInputRef.current.value = "";
    }
  };

  // --- Lógica de la API (Gemini) ---
  const handleGenerate = async () => {
    if (!personImage || !garmentImage || isGenerating) return;

    if (!apiKey) {
      showError("Falta la API Key. Configúrala en el icono de engranaje.");
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setResultImage(null);
    setError(null);

    try {
      // 1. Construir Prompt Dinámico
      const fitDescriptions = {
        'tight': 'tight-fitting, slim fit, highlighting body contours',
        'regular': 'regular fit, comfortable fit, tailored correctly',
        'baggy': 'oversized, baggy fit, loose fitting, streetwear style'
      };

      let promptText = `Generate a high-quality photograph of the person from the first reference image wearing the garment from the second reference image. `;
      promptText += `The clothing should have a ${fitDescriptions[fitType]}. `;
      if (extraPrompt.trim()) {
        promptText += `Additional requirements: ${extraPrompt.trim()}. `;
      }
      promptText += `Ensure the garment integrates naturally with the body pose and lighting. Realistic fabric texture, detailed folds, photorealistic 8k. `;
      promptText += `Do not generate cartoons, illustrations, or drawings. Avoid distorted body parts, extra limbs, bad anatomy, or blurry textures.`;

      // 2. Preparar Payload
      const payload = {
        contents: [{
          parts: [
            { text: promptText },
            { inlineData: { mimeType: personImage.mimeType, data: personImage.data } },
            { inlineData: { mimeType: garmentImage.mimeType, data: garmentImage.data } }
          ]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
        }
      };

      // 3. Llamada a la API con reintentos
      const response = await fetchWithRetry(payload, apiKey);
      
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) throw new Error("No se pudo generar la imagen.");

      const parts = candidates[0].content.parts;
      const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

      if (imagePart) {
        const finalImageBase64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        setResultImage(finalImageBase64);
      } else {
        const textPart = parts.find(p => p.text);
        throw new Error(textPart ? `Modelo: ${textPart.text}` : "Formato de respuesta desconocido.");
      }

    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (msg.includes("400") || msg.includes("403")) msg = "Error de autenticación. Verifica tu API Key.";
      if (msg.includes("429")) msg = "Cuota excedida (Error 429). Intenta más tarde o revisa tu plan.";
      showError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchWithRetry = async (payload, key) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${key}`;
    //const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`;
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = errText;
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error?.message || errText;
          } catch (e) {}
          throw new Error(`API ${response.status}: ${errMsg}`);
        }
        return await response.json();
      } catch (err) {
        retries++;
        if (retries > maxRetries) throw err;
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }
  };

  // --- Utilidades de UI ---
  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 8000);
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = 'vto-result-react.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Renderizado ---
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 flex flex-col">
      
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-md">
              <Shirt size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">AI Virtual Try-On</h1>
              <p className="text-xs text-indigo-600 font-semibold tracking-wide">VITE EDITION</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(true)}
              className="text-gray-500 hover:text-indigo-600 transition p-2 bg-gray-50 rounded-full hover:bg-indigo-50" 
              title="Configurar API Key"
            >
              <Settings size={20} />
            </button>
            <div className="text-sm text-gray-500 hidden sm:block border-l pl-3 ml-2 border-gray-200">
              Powered by Gemini
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Settings size={18} className="text-indigo-500" /> Configuración API
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Google API Key</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Pega tu API Key aquí (AIzaSy...)" 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
              />
              <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                <Info size={12} className="mt-0.5" />
                <span>Necesaria para generar imágenes. Prioridad sobre .env</span>
              </p>
              
              {envKeyDetected && (
                <div className="mt-3 text-xs flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100">
                  <Check size={12} />
                  <span>Variable VITE_GOOGLE_API_KEY detectada.</span>
                </div>
              )}
            </div>
            <button 
              onClick={() => setShowSettings(false)} 
              className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition shadow-md"
            >
              Guardar y Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Upload Section */}
            <div className="space-y-4">
              {/* Person Upload */}
              <UploadCard 
                title="1. Persona (Target)" 
                icon={<User size={18} className="text-indigo-500" />}
                image={personImage}
                inputRef={personInputRef}
                onUpload={(e) => handleFileChange(e, 'person')}
                onRemove={(e) => removeImage(e, 'person')}
                placeholderText="Subir foto base"
              />

              {/* Garment Upload */}
              <UploadCard 
                title="2. Prenda (Source)" 
                icon={<Shirt size={18} className="text-purple-500" />}
                image={garmentImage}
                inputRef={garmentInputRef}
                onUpload={(e) => handleFileChange(e, 'garment')}
                onRemove={(e) => removeImage(e, 'garment')}
                placeholderText="Subir prenda"
              />
            </div>

            {/* Advanced Controls */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Sliders size={18} className="text-gray-400" />
                <h2 className="font-semibold text-gray-800">Ajustes & Detalles</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Ajuste (Fit)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['tight', 'regular', 'baggy'].map((type) => (
                      <label key={type} className="cursor-pointer">
                        <input 
                          type="radio" 
                          name="fit-type" 
                          value={type} 
                          checked={fitType === type}
                          onChange={(e) => setFitType(e.target.value)}
                          className="peer hidden" 
                        />
                        <div className="text-center px-2 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 peer-checked:bg-indigo-50 peer-checked:border-indigo-500 peer-checked:text-indigo-700 hover:bg-gray-50 transition capitalize">
                          {type === 'tight' ? 'Slim' : type === 'baggy' ? 'Oversize' : 'Regular'}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Instrucciones Extra</label>
                  <textarea 
                    rows="2" 
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    placeholder="Ej: Camisa metida en el pantalón..." 
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-gray-50"
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button 
              onClick={handleGenerate}
              disabled={!personImage || !garmentImage || isGenerating}
              className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> Procesando...
                </>
              ) : (
                <>
                  Generar Resultado <Wand2 size={18} className="text-indigo-400" />
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200 flex items-start gap-2 animate-pulse">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Result Column */}
          <div className="lg:col-span-8">
            <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-100 h-full min-h-[600px] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-500">Vista Previa</span>
                {resultImage && (
                  <button onClick={downloadResult} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1 transition">
                    <Download size={16} /> Guardar Imagen
                  </button>
                )}
              </div>

              <div className="flex-grow bg-slate-50 rounded-b-lg flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>

                {!resultImage && !isGenerating && (
                  <div className="text-center p-8 relative z-10">
                    <div className="w-20 h-20 bg-white rounded-full shadow-md flex items-center justify-center mx-auto mb-4">
                      <div className="text-indigo-200"><Wand2 size={32} /></div>
                    </div>
                    <h3 className="text-gray-900 font-bold text-xl">Listo para crear</h3>
                    <p className="text-gray-500 mt-2 max-w-sm mx-auto text-sm">Sube tus imágenes y configura las opciones para ver la magia.</p>
                  </div>
                )}

                {isGenerating && (
                  <div className="flex flex-col items-center relative z-10">
                    <div className="w-12 h-12 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <div className="text-center space-y-1">
                      <p className="text-gray-800 font-semibold text-lg">Procesando...</p>
                      <p className="text-gray-500 text-sm">La IA está fusionando las texturas...</p>
                    </div>
                  </div>
                )}

                {resultImage && (
                  <img src={resultImage} className="w-full h-full object-contain shadow-md relative z-10 animate-in fade-in duration-500" alt="Generated VTO" />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Componente auxiliar para Tarjetas de Carga
const UploadCard = ({ title, icon, image, inputRef, onUpload, onRemove, placeholderText }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition duration-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          {icon} {title}
        </h2>
      </div>
      
      <div 
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onUpload({ target: { files: e.dataTransfer.files } }); }}
        className={`
          relative h-40 rounded-lg cursor-pointer transition-all duration-200 border-2 border-dashed flex flex-col items-center justify-center group overflow-hidden
          ${isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-gray-100'}
        `}
      >
        <input type="file" ref={inputRef} accept="image/*" className="hidden" onChange={onUpload} />
        
        {image ? (
          <>
            <img src={image.preview} className="w-full h-full object-contain p-2" alt="Preview" />
            <button 
              onClick={onRemove}
              className="absolute top-2 right-2 bg-white text-red-500 rounded-full p-1.5 shadow-md hover:bg-red-50 transition border border-gray-100 z-10"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className="pointer-events-none flex flex-col items-center transition-transform group-hover:scale-105">
            <Upload size={32} className="text-gray-300 mb-2" />
            <p className="text-xs text-gray-500 font-medium">{placeholderText}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;